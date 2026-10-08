import { describe, test } from "node:test";
import assert from "node:assert/strict";
import pool from "../../../src/config/database.js";
import { cartRepository } from "../../../src/repositories/cart.repository.js";
import { productVariantRepository } from "../../../src/repositories/product-variant.repository.js";
import {
  getCart,
  addCartItem,
  updateCartItem,
  clearCart,
} from "../../../src/services/cart.service.js";

const owner = { type: "guest", guestToken: "guest_existing" };
const sampleCart = { cart_id: 10, status_cart: "active", guest_token: "guest_existing" };
const sampleItem = {
  cart_item_id: 1,
  product_id: 20,
  product_variant_id: 101,
  name_product: "Logo T-Shirt",
  sku: "TS-BLK-M",
  price: 550000,
  quantity: 2,
  quantity_available: 8,
};

const mockTransaction = (t) => {
  const client = {
    query: t.mock.fn(async () => ({ rows: [], rowCount: 1 })),
    release: t.mock.fn(),
  };
  t.mock.method(pool, "connect", async () => client);
  return client;
};

describe("cart service", () => {
  test("returns an empty cart without creating one on GET", async (t) => {
    t.mock.method(cartRepository, "findActiveByOwner", async () => null);

    const result = await getCart(owner);
    assert.deepEqual(result, {
      cart_id: null,
      status_cart: null,
      guest_token: "guest_existing",
      items: [],
      summary: { total_items: 0, subtotal: 0 },
    });
  });

  test("adds a requested quantity to a new guest cart", async (t) => {
    mockTransaction(t);
    t.mock.method(productVariantRepository, "findById", async () => ({ product_variant_id: 101 }));
    t.mock.method(cartRepository, "findActiveByOwner", async () => null);
    t.mock.method(cartRepository, "create", async (resolvedOwner) => ({
      ...sampleCart,
      guest_token: resolvedOwner.guestToken,
    }));
    t.mock.method(cartRepository, "findItem", async () => null);
    t.mock.method(cartRepository, "lockInventory", async () => ({ quantity_available: 8 }));
    t.mock.method(cartRepository, "upsertItem", async () => ({ cart_item_id: 1 }));
    t.mock.method(cartRepository, "getDetailedItems", async () => [{ ...sampleItem, quantity: 1 }]);

    const result = await addCartItem({ type: "guest" }, { product_variant_id: 101, quantity: 1 });
    assert.match(result.guest_token, /^guest_/);
    assert.equal(result.summary.total_items, 1);
    assert.equal(result.summary.subtotal, 550000);
  });

  test("rejects a cart quantity above available inventory", async (t) => {
    mockTransaction(t);
    t.mock.method(productVariantRepository, "findById", async () => ({ product_variant_id: 101 }));
    t.mock.method(cartRepository, "findActiveByOwner", async () => sampleCart);
    t.mock.method(cartRepository, "findItem", async () => ({ quantity_cart_item: 4 }));
    t.mock.method(cartRepository, "lockInventory", async () => ({ quantity_available: 5 }));

    await assert.rejects(
      () => addCartItem(owner, { product_variant_id: 101, quantity: 2 }),
      (error) => error.statusCode === 409
        && error.code === "INSUFFICIENT_STOCK"
        && error.details.available_quantity === 5,
    );
  });

  test("updates only an item belonging to the current cart", async (t) => {
    mockTransaction(t);
    t.mock.method(cartRepository, "findActiveByOwner", async () => sampleCart);
    t.mock.method(cartRepository, "findItemByIdAndCart", async () => null);

    await assert.rejects(
      () => updateCartItem(owner, 999, { quantity: 1 }),
      (error) => error.statusCode === 404 && error.code === "CART_ITEM_NOT_FOUND",
    );
  });

  test("clears items while preserving the active cart", async (t) => {
    mockTransaction(t);
    t.mock.method(cartRepository, "findActiveByOwner", async () => sampleCart);
    t.mock.method(cartRepository, "clearItems", async () => {});
    t.mock.method(cartRepository, "getDetailedItems", async () => []);

    const result = await clearCart(owner);
    assert.equal(result.cart_id, 10);
    assert.deepEqual(result.items, []);
    assert.deepEqual(result.summary, { total_items: 0, subtotal: 0 });
  });
});
