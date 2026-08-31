import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { createCartService } from "../../../src/services/cart.service.js";

const owner = { type: "guest", guestToken: "guest_existing" };
const sampleCart = { cart_id: 10, status_cart: "active", guest_token: "guest_existing" };
const sampleItem = {
  cart_item_id: 1,
  product_id: 20,
  product_variant_id: 101,
  name_product: "Logo T-Shirt",
  sku: "TS-BLK-M",
  variant: "Black / M",
  image: null,
  price: 550000,
  quantity: 2,
  quantity_available: 8,
};

describe("cart service", () => {
  test("returns an empty cart without creating one on GET", async () => {
    const service = createCartService({
      carts: { findActiveByOwner: async () => null },
    });

    const result = await service.getCart(owner);
    assert.deepEqual(result, {
      cart_id: null,
      status_cart: null,
      guest_token: "guest_existing",
      items: [],
      summary: { total_items: 0, subtotal: 0 },
    });
  });

  test("lazy creates a secure guest cart and returns its token", async () => {
    let createdOwner;
    const service = createCartService({
      carts: {
        findActiveByOwner: async () => null,
        create: async (value) => {
          createdOwner = value;
          return { ...sampleCart, guest_token: value.guestToken };
        },
        findItem: async () => null,
        upsertItem: async () => {},
        getDetailedItems: async () => [{ ...sampleItem, quantity: 1 }],
      },
      variants: { findById: async () => ({ product_variant_id: 101 }) },
      inventories: { findByVariantId: async () => ({ quantity_available: 8 }) },
      tokenFactory: () => "guest_secure_token",
      transaction: async (callback) => callback({}),
    });

    const result = await service.addCartItem({ type: "guest" }, { product_variant_id: 101, quantity: 1 });
    assert.equal(createdOwner.guestToken, "guest_secure_token");
    assert.equal(result.guest_token, "guest_secure_token");
    assert.equal(result.summary.subtotal, 550000);
  });

  test("adds requested quantity to an existing variant", async () => {
    let writtenQuantity;
    const service = createCartService({
      carts: {
        findActiveByOwner: async () => sampleCart,
        findItem: async () => ({ ...sampleItem, quantity_cart_item: 2 }),
        upsertItem: async (_cartId, _variantId, quantity) => { writtenQuantity = quantity; },
        getDetailedItems: async () => [{ ...sampleItem, quantity: 5 }],
      },
      variants: { findById: async () => ({ product_variant_id: 101 }) },
      inventories: { findByVariantId: async () => ({ quantity_available: 8 }) },
      transaction: async (callback) => callback({}),
    });

    const result = await service.addCartItem(owner, { product_variant_id: 101, quantity: 3 });
    assert.equal(writtenQuantity, 5);
    assert.equal(result.summary.total_items, 5);
  });

  test("rejects quantity above available inventory", async () => {
    const service = createCartService({
      carts: {
        findActiveByOwner: async () => sampleCart,
        findItem: async () => ({ quantity_cart_item: 4 }),
      },
      variants: { findById: async () => ({ product_variant_id: 101 }) },
      inventories: { findByVariantId: async () => ({ quantity_available: 5 }) },
      transaction: async (callback) => callback({}),
    });

    await assert.rejects(
      () => service.addCartItem(owner, { product_variant_id: 101, quantity: 2 }),
      (error) => error.statusCode === 409 && error.code === "INSUFFICIENT_STOCK" && error.details.available_quantity === 5,
    );
  });

  test("updates only an item belonging to the current cart", async () => {
    const service = createCartService({
      carts: {
        findActiveByOwner: async () => sampleCart,
        findItemByIdAndCart: async () => null,
      },
      transaction: async (callback) => callback({}),
    });

    await assert.rejects(
      () => service.updateCartItem(owner, 999, { quantity: 1 }),
      (error) => error.statusCode === 404 && error.code === "CART_ITEM_NOT_FOUND",
    );
  });

  test("clear cart deletes items but preserves the active cart", async () => {
    let clearedCartId;
    const service = createCartService({
      carts: {
        findActiveByOwner: async () => sampleCart,
        clearItems: async (cartId) => { clearedCartId = cartId; },
        getDetailedItems: async () => [],
      },
      transaction: async (callback) => callback({}),
    });

    const result = await service.clearCart(owner);
    assert.equal(clearedCartId, 10);
    assert.equal(result.cart_id, 10);
    assert.deepEqual(result.items, []);
  });
});
