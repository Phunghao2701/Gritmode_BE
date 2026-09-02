import { randomBytes } from "node:crypto";
import { AppError, notFound } from "../errors/app-error.js";
import { cartRepository } from "../repositories/cart.repository.js";
import { productVariantRepository } from "../repositories/product-variant.repository.js";
import { inventoryRepository } from "../repositories/inventory.repository.js";
import { withTransaction } from "../config/database.js";

const makeGuestToken = () => `guest_${randomBytes(32).toString("hex")}`;

const emptyCart = (owner) => ({
  cart_id: null,
  status_cart: null,
  guest_token: owner.type === "guest" ? owner.guestToken || null : null,
  items: [],
  summary: { total_items: 0, subtotal: 0 },
});

const stockError = (available) =>
  new AppError(409, "INSUFFICIENT_STOCK", "Không đủ hàng tồn kho", {
    available_quantity: Number(available),
  });

const present = async (cart, owner, client) => {
  if (!cart) return emptyCart(owner);
  const rows = await cartRepository.getDetailedItems(cart.cart_id, client);
  const items = rows.map((row) => {
    const price = Number(row.price);
    const quantity = Number(row.quantity);
    const quantityAvailable = Number(row.quantity_available);
    const lineTotal = price * quantity;
    return {
      ...row,
      price,
      quantity,
      quantity_cart_item: quantity,
      quantity_available: quantityAvailable,
      total_item: lineTotal,
      line_total: lineTotal,
      has_stock_issue: quantity > quantityAvailable,
    };
  });
  return {
    cart_id: Number(cart.cart_id),
    status_cart: cart.status_cart,
    guest_token: cart.guest_token || null,
    items,
    summary: {
      total_items: items.reduce((sum, item) => sum + item.quantity, 0),
      subtotal: items.reduce((sum, item) => sum + item.total_item, 0),
    },
  };
};

const activeCart = async (owner, client, { create = false } = {}) => {
  let normalizedOwner = owner;
  if (create && owner.type === "guest" && !owner.guestToken) {
    normalizedOwner = { ...owner, guestToken: makeGuestToken() };
  }
  let cart =
    normalizedOwner.type === "guest" && !normalizedOwner.guestToken
      ? null
      : await cartRepository.findActiveByOwner(normalizedOwner, client);
  if (!cart && create) cart = await cartRepository.create(normalizedOwner, client);
  return { cart, owner: normalizedOwner };
};

const availableFor = async (variantId, client) => {
  const inventory = cartRepository.lockInventory
    ? await cartRepository.lockInventory(variantId, client)
    : await inventoryRepository.findByVariantId(variantId, client);
  if (!inventory) throw notFound("INVENTORY_NOT_FOUND", "Không tìm thấy tồn kho cho biến thể này");
  return Number(inventory.quantity_available);
};

export const getCart = async (owner) => {
  const { cart } = await activeCart(owner);
  return present(cart, owner);
};

export const addCartItem = async (owner, input) => {
  return withTransaction(async (client) => {
    const variant = await productVariantRepository.findById(input.product_variant_id, client);
    if (!variant) throw notFound("VARIANT_NOT_FOUND", "Không tìm thấy biến thể sản phẩm");
    const { cart, owner: resolvedOwner } = await activeCart(owner, client, { create: true });
    const current = await cartRepository.findItem(cart.cart_id, input.product_variant_id, client);
    const quantity = Number(current?.quantity_cart_item || 0) + input.quantity;
    const available = await availableFor(input.product_variant_id, client);
    if (quantity > available) throw stockError(available);
    await cartRepository.upsertItem(cart.cart_id, input.product_variant_id, quantity, client);
    return present(cart, resolvedOwner, client);
  });
};

export const updateCartItem = async (owner, cartItemId, input) => {
  return withTransaction(async (client) => {
    const { cart } = await activeCart(owner, client);
    if (!cart) throw notFound("CART_ITEM_NOT_FOUND", "Không tìm thấy sản phẩm trong giỏ hàng");
    const item = await cartRepository.findItemByIdAndCart(cartItemId, cart.cart_id, client);
    if (!item) throw notFound("CART_ITEM_NOT_FOUND", "Không tìm thấy sản phẩm trong giỏ hàng");
    const available = await availableFor(item.product_variant_id, client);
    if (input.quantity > available) throw stockError(available);
    await cartRepository.updateItemQuantity(cartItemId, cart.cart_id, input.quantity, client);
    return present(cart, owner, client);
  });
};

export const removeCartItem = async (owner, cartItemId) => {
  return withTransaction(async (client) => {
    const { cart } = await activeCart(owner, client);
    if (!cart) throw notFound("CART_ITEM_NOT_FOUND", "Không tìm thấy sản phẩm trong giỏ hàng");
    const removed = await cartRepository.removeItem(cartItemId, cart.cart_id, client);
    if (!removed) throw notFound("CART_ITEM_NOT_FOUND", "Không tìm thấy sản phẩm trong giỏ hàng");
    return present(cart, owner, client);
  });
};

export const clearCart = async (owner) => {
  return withTransaction(async (client) => {
    const { cart } = await activeCart(owner, client);
    if (!cart) return emptyCart(owner);
    await cartRepository.clearItems(cart.cart_id, client);
    return present(cart, owner, client);
  });
};
