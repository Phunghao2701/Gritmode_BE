import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import pool from "../../src/config/database.js";
import { addCartItem } from "../../src/services/cart.service.js";
import { createOrderService } from "../../src/services/order.service.js";

const enabled = process.env.RUN_CONCURRENCY_TEST === "true";

let orderService;

const makeToken = (label) => `concurrency-${label}-${Date.now()}-${Math.random().toString(36).slice(2)}`;

const createFixture = async () => {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const productResult = await client.query(
      `INSERT INTO product (name_product, description)
       VALUES ($1, $2)
       RETURNING product_id`,
      [`Concurrency test ${Date.now()}`, "Temporary fixture"],
    );
    const productId = productResult.rows[0].product_id;
    const variantResult = await client.query(
      `INSERT INTO product_variant (product_id, sku, price)
       VALUES ($1, $2, $3)
       RETURNING product_variant_id`,
      [productId, `TEST-CONCURRENCY-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, 100000],
    );
    const variantId = variantResult.rows[0].product_variant_id;
    await client.query(
      `INSERT INTO inventory (product_variant_id, quantity_stock, quantity_reserved)
       VALUES ($1, 1, 0)`,
      [variantId],
    );
    await client.query("COMMIT");
    return { productId, variantId };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
};

const addToCart = (token, variantId) => addCartItem(
  { type: "guest", guestToken: token },
  { product_variant_id: variantId, quantity: 1 },
);

const checkout = (token) => orderService.createOrder(
  {
    email_order: `${token}@test.local`,
    phone_order: "0900000000",
    receiver_name_order_address: "Concurrency Test",
    phone_order_address: "0900000000",
    address_line_order_address: "Temporary test address",
    ward_order_address: "Ward",
    district_order_address: "District",
    province_order_address: "Ho Chi Minh",
    payment_method: "cod",
  },
  { owner: { type: "guest", guestToken: token } },
);

const readInventory = async (variantId) => {
  const { rows } = await pool.query(
    `SELECT quantity_stock, quantity_reserved,
            quantity_stock - quantity_reserved AS quantity_available
     FROM inventory
     WHERE product_variant_id = $1`,
    [variantId],
  );
  return rows[0];
};

const countOrdersForTokens = async (tokens) => {
  const { rows } = await pool.query(
    `SELECT COUNT(*)::int AS count
     FROM "order" o
     JOIN cart c ON c.cart_id = o.cart_id
     WHERE c.guest_token = ANY($1::text[])`,
    [tokens],
  );
  return rows[0].count;
};

describe("stock concurrency (isolated database only)", { skip: !enabled }, () => {
  before(() => {
    orderService = createOrderService({
      payments: {
        createPayment: async () => ({ payment_method: "cod", status_payment: "pending" }),
      },
      emails: {
        sendOrderConfirmationEmail: async () => undefined,
      },
      notifications: null,
      realtime: { publish: () => undefined },
    });
  });

  after(async () => {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(
        `DELETE FROM order_address
         WHERE order_id IN (
           SELECT o.order_id FROM "order" o
           JOIN cart c ON c.cart_id = o.cart_id
           WHERE c.guest_token LIKE 'concurrency-%'
         )`,
      );
      await client.query(
        `DELETE FROM order_item
         WHERE order_id IN (
           SELECT o.order_id FROM "order" o
           JOIN cart c ON c.cart_id = o.cart_id
           WHERE c.guest_token LIKE 'concurrency-%'
         )`,
      );
      await client.query(
        `DELETE FROM "order"
         WHERE cart_id IN (SELECT cart_id FROM cart WHERE guest_token LIKE 'concurrency-%')`,
      );
      await client.query(
        `DELETE FROM cart_item
         WHERE cart_id IN (SELECT cart_id FROM cart WHERE guest_token LIKE 'concurrency-%')`,
      );
      await client.query("DELETE FROM cart WHERE guest_token LIKE 'concurrency-%'");
      await client.query("DELETE FROM product WHERE name_product LIKE 'Concurrency test %'");
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
      await pool.end();
    }
  });

  test("add-to-cart happy case accepts one user for stock 1", async () => {
    const { variantId } = await createFixture();
    const result = await addToCart(makeToken("cart-happy"), variantId);

    assert.equal(result.items.length, 1);
    assert.equal(result.items[0].quantity, 1);
    assert.deepEqual(await readInventory(variantId), {
      quantity_stock: 1,
      quantity_reserved: 0,
      quantity_available: 1,
    });
  });

  test("add-to-cart concurrent case allows both carts because cart does not reserve stock", async () => {
    const { variantId } = await createFixture();
    const tokens = [makeToken("cart-a"), makeToken("cart-b")];
    const results = await Promise.allSettled(tokens.map((token) => addToCart(token, variantId)));

    assert.equal(results.filter((result) => result.status === "fulfilled").length, 2);
    assert.equal(results.filter((result) => result.status === "rejected").length, 0);
    assert.deepEqual(await readInventory(variantId), {
      quantity_stock: 1,
      quantity_reserved: 0,
      quantity_available: 1,
    });
  });

  test("checkout happy case reserves the only unit", async () => {
    const { variantId } = await createFixture();
    const token = makeToken("checkout-happy");
    await addToCart(token, variantId);

    const result = await checkout(token);

    assert.equal(result.status_order, "pending");
    assert.deepEqual(await readInventory(variantId), {
      quantity_stock: 1,
      quantity_reserved: 1,
      quantity_available: 0,
    });
    assert.equal(await countOrdersForTokens([token]), 1);
  });

  test("checkout concurrent case creates exactly one order and rejects the other", async () => {
    const { variantId } = await createFixture();
    const tokens = [makeToken("checkout-a"), makeToken("checkout-b")];
    await Promise.all(tokens.map((token) => addToCart(token, variantId)));

    const results = await Promise.allSettled(tokens.map((token) => checkout(token)));
    const successes = results.filter((result) => result.status === "fulfilled");
    const failures = results.filter((result) => result.status === "rejected");

    assert.equal(successes.length, 1);
    assert.equal(failures.length, 1);
    assert.equal(failures[0].reason.code, "INSUFFICIENT_STOCK");
    assert.deepEqual(await readInventory(variantId), {
      quantity_stock: 1,
      quantity_reserved: 1,
      quantity_available: 0,
    });
    assert.equal(await countOrdersForTokens(tokens), 1);
  });
});
