import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { createAuthController } from "../../../src/controllers/auth.controller.js";
import { createUserController } from "../../../src/controllers/user.controller.js";
import { createProductController } from "../../../src/controllers/product.controller.js";
import { createProductOptionController } from "../../../src/controllers/product-option.controller.js";
import { createProductVariantController } from "../../../src/controllers/product-variant.controller.js";
import { createProductImageController } from "../../../src/controllers/product-image.controller.js";
import { createCategoryController } from "../../../src/controllers/category.controller.js";
import { createCollectionController } from "../../../src/controllers/collection.controller.js";
import { createInventoryController } from "../../../src/controllers/inventory.controller.js";
import { createVoucherController } from "../../../src/controllers/voucher.controller.js";
import { createOrderController } from "../../../src/controllers/order.controller.js";
import { createAdminOrderController } from "../../../src/controllers/admin-order.controller.js";
import { createAdminUserController } from "../../../src/controllers/admin-user.controller.js";
import { createAdminAuditLogController } from "../../../src/controllers/admin-audit-log.controller.js";
import { createUserSessionController } from "../../../src/controllers/user-session.controller.js";
import { createPaymentController } from "../../../src/controllers/payment.controller.js";







const response = () => {
  const res = { cookies: [], statusCode: 200 };
  res.status = (value) => { res.statusCode = value; return res; };
  res.json = (value) => { res.body = value; return res; };
  res.cookie = (...args) => { res.cookies.push(args); return res; };
  res.clearCookie = (...args) => { res.cleared = args; return res; };
  return res;
};
const req = (extra = {}) => ({ body: {}, validatedBody: {}, query: {}, validatedQuery: {}, cookies: {}, headers: {}, user: { user_id: "u1", session_id: 10, role: "admin" }, params: {}, get: () => "agent", ip: "127.0.0.1", ...extra });

describe("controllers", () => {
  test("auth controller adapts success results without exposing refresh token", async () => {
    const result = { user: { user_id: "u1" }, access_token: "access", refresh_token: "refresh", is_new_user: false };
    const service = {
      requestOtp: async () => ({ expired_in: 300 }),
      verifyOtp: async () => result,
      refresh: async () => result,
      logout: async () => {},
      me: async () => ({ user_id: "u1" }),
    };
    const controller = createAuthController({ service, config: { nodeEnv: "test", refreshTtlMs: 1000 } });

    const otpRes = response();
    await controller.requestOtp(req({ validatedBody: { email: "u@test.com" } }), otpRes, assert.fail);
    assert.equal(otpRes.statusCode, 200);
    assert.equal(otpRes.body.data.expired_in, 300);

    for (const name of ["verifyOtp", "refresh"]) {
      const res = response();
      await controller[name](req(), res, assert.fail);
      assert.equal(res.body.data.refresh_token, undefined);
      assert.equal(res.cookies.length, 1);
    }
    const logoutRes = response();
    await controller.logout(req(), logoutRes, assert.fail);
    assert.equal(logoutRes.cleared[0], "refresh_token");

    const meRes = response();
    await controller.me(req(), meRes, assert.fail);
    assert.equal(meRes.body.data.user_id, "u1");
  });

  test("auth controller passes caught errors to next", async () => {
    const explodingService = {
      requestOtp: async () => { throw new Error("otp_err"); },
      verifyOtp: async () => { throw new Error("verify_err"); },
      refresh: async () => { throw new Error("refresh_err"); },
      logout: async () => { throw new Error("logout_err"); },
      me: async () => { throw new Error("me_err"); },
    };
    const controller = createAuthController({ service: explodingService });
    for (const name of ["requestOtp", "verifyOtp", "refresh", "logout", "me"]) {
      let passedError = null;
      await controller[name](req(), response(), (e) => {
        passedError = e;
      });
      assert.ok(passedError);
    }
  });

  test("user controller adapts profile, address and session operations", async () => {
    const users = {
      getProfile: async () => ({ user_id: "u1" }), updateProfile: async () => ({ full_name: "A" }),
      changePassword: async () => {}, listSessions: async () => [], revokeSession: async () => {}, revokeAllSessions: async () => {},
    };
    const addresses = {
      list: async () => [],
      getById: async () => ({ user_address_id: 1 }),
      create: async () => ({ user_address_id: 1 }),
      update: async () => ({ user_address_id: 1 }),
      remove: async () => {},
      setDefault: async () => ({ is_default: true }),
    };
    const controller = createUserController({ users, addresses, config: { nodeEnv: "test" } });
    const cases = [
      ["profile", req()], ["updateProfile", req()], ["changePassword", req()], ["listAddresses", req()],
      ["getAddress", req({ params: { addressId: "1" } })], ["createAddress", req()],
      ["updateAddress", req({ params: { addressId: "1" } })], ["removeAddress", req({ params: { addressId: "1" } })],
      ["setDefaultAddress", req({ params: { addressId: "1" } })], ["listSessions", req()],
      ["revokeSession", req({ params: { sessionId: "1" } })], ["revokeAllSessions", req()],
    ];
    for (const [name, request] of cases) { const res = response(); await controller[name](request, res, assert.fail); assert.equal(res.body.success, true); }
  });

  test("user controller passes caught errors to next", async () => {
    const explodingUsers = {
      getProfile: async () => { throw new Error("err"); },
      updateProfile: async () => { throw new Error("err"); },
      changePassword: async () => { throw new Error("err"); },
      listSessions: async () => { throw new Error("err"); },
      revokeSession: async () => { throw new Error("err"); },
      revokeAllSessions: async () => { throw new Error("err"); },
    };
    const explodingAddresses = {
      list: async () => { throw new Error("err"); },
      getAddressById: async () => { throw new Error("err"); },
      create: async () => { throw new Error("err"); },
      update: async () => { throw new Error("err"); },
      remove: async () => { throw new Error("err"); },
      setDefault: async () => { throw new Error("err"); },
    };
    const controller = createUserController({ users: explodingUsers, addresses: explodingAddresses });
    const cases = [
      ["profile", req()], ["updateProfile", req()], ["changePassword", req()], ["listAddresses", req()],
      ["getAddress", req({ params: { addressId: "1" } })], ["createAddress", req()],
      ["updateAddress", req({ params: { addressId: "1" } })], ["removeAddress", req({ params: { addressId: "1" } })],
      ["setDefaultAddress", req({ params: { addressId: "1" } })], ["listSessions", req()],
      ["revokeSession", req({ params: { sessionId: "1" } })], ["revokeAllSessions", req()],
    ];
    for (const [name, request] of cases) {
      let passedError = null;
      await controller[name](request, response(), (e) => {
        passedError = e;
      });
      assert.ok(passedError);
    }
  });

  test("product controller adapts getProducts, getProductById and admin CRUD", async () => {
    const service = {
      getProducts: async () => ({ items: [], pagination: {} }),
      getProductById: async () => ({ product_id: 1 }),
      createProduct: async () => ({ product_id: 1 }),
      updateProduct: async () => ({ product_id: 1 }),
      deleteProduct: async () => {},
    };
    const controller = createProductController({ service });
    const cases = [
      ["getProducts", req()],
      ["getProductById", req({ params: { productId: "1" } })],
      ["createProduct", req()],
      ["updateProduct", req({ params: { productId: "1" } })],
      ["deleteProduct", req({ params: { productId: "1" } })],
    ];
    for (const [name, request] of cases) {
      const res = response();
      await controller[name](request, res, assert.fail);
      assert.equal(res.body.success, true);
    }
  });

  test("product controller passes caught errors to next", async () => {
    const explodingService = {
      getProducts: async () => { throw new Error("err"); },
      getProductById: async () => { throw new Error("err"); },
      createProduct: async () => { throw new Error("err"); },
      updateProduct: async () => { throw new Error("err"); },
      deleteProduct: async () => { throw new Error("err"); },
    };
    const controller = createProductController({ service: explodingService });
    for (const name of ["getProducts", "getProductById", "createProduct", "updateProduct", "deleteProduct"]) {
      let passedError = null;
      await controller[name](req({ params: { productId: "1" } }), response(), (e) => {
        passedError = e;
      });
      assert.ok(passedError);
    }
  });

  test("product option controller adapts operations and passes errors to next", async () => {
    const service = {
      getProductOptions: async () => [{ product_option_id: 1 }],
      createProductOption: async () => ({ product_option_id: 1 }),
      updateProductOption: async () => ({ product_option_id: 1 }),
      deleteProductOption: async () => {},
      createOptionValue: async () => ({ product_option_value_id: 1 }),
      updateOptionValue: async () => ({ product_option_value_id: 1 }),
      deleteOptionValue: async () => {},
    };
    const controller = createProductOptionController({ service });
    const cases = [
      ["getProductOptions", req({ params: { productId: "1" } })],
      ["createProductOption", req({ params: { productId: "1" } })],
      ["updateProductOption", req({ params: { optionId: "1" } })],
      ["deleteProductOption", req({ params: { optionId: "1" } })],
      ["createOptionValue", req({ params: { optionId: "1" } })],
      ["updateOptionValue", req({ params: { valueId: "1" } })],
      ["deleteOptionValue", req({ params: { valueId: "1" } })],
    ];
    for (const [name, request] of cases) {
      const res = response();
      await controller[name](request, res, assert.fail);
      assert.equal(res.body.success, true);
    }

    const explodingService = {
      getProductOptions: async () => { throw new Error("err"); },
      createProductOption: async () => { throw new Error("err"); },
      updateProductOption: async () => { throw new Error("err"); },
      deleteProductOption: async () => { throw new Error("err"); },
      createOptionValue: async () => { throw new Error("err"); },
      updateOptionValue: async () => { throw new Error("err"); },
      deleteOptionValue: async () => { throw new Error("err"); },
    };
    const explodingController = createProductOptionController({ service: explodingService });
    for (const [name, request] of cases) {
      let passedError = null;
      await explodingController[name](request, response(), (e) => {
        passedError = e;
      });
      assert.ok(passedError);
    }
  });

  test("product variant controller adapts operations and passes errors to next", async () => {
    const service = {
      getProductVariants: async () => [{ product_variant_id: 1 }],
      getProductVariantById: async () => ({ product_variant_id: 1 }),
      createProductVariant: async () => ({ product_variant_id: 1 }),
      updateProductVariant: async () => ({ product_variant_id: 1 }),
      deleteProductVariant: async () => {},
    };
    const controller = createProductVariantController({ service });
    const cases = [
      ["getProductVariants", req({ params: { productId: "1" } })],
      ["getProductVariantById", req({ params: { variantId: "1" } })],
      ["createProductVariant", req({ params: { productId: "1" } })],
      ["updateProductVariant", req({ params: { variantId: "1" } })],
      ["deleteProductVariant", req({ params: { variantId: "1" } })],
    ];
    for (const [name, request] of cases) {
      const res = response();
      await controller[name](request, res, assert.fail);
      assert.equal(res.body.success, true);
    }

    const explodingService = {
      getProductVariants: async () => { throw new Error("err"); },
      getProductVariantById: async () => { throw new Error("err"); },
      createProductVariant: async () => { throw new Error("err"); },
      updateProductVariant: async () => { throw new Error("err"); },
      deleteProductVariant: async () => { throw new Error("err"); },
    };
    const explodingController = createProductVariantController({ service: explodingService });
    for (const [name, request] of cases) {
      let passedError = null;
      await explodingController[name](request, response(), (e) => {
        passedError = e;
      });
      assert.ok(passedError);
    }
  });

  test("product image controller adapts operations and passes errors to next", async () => {
    const service = {
      getProductImages: async () => [{ product_image_id: 1 }],
      createProductImage: async () => ({ product_image_id: 1 }),
      updateProductImage: async () => ({ product_image_id: 1 }),
      deleteProductImage: async () => {},
      reorderProductImages: async () => [{ product_image_id: 1 }],
    };
    const controller = createProductImageController({ service });
    const cases = [
      ["getProductImages", req({ params: { productId: "1" } })],
      ["createProductImage", req({ params: { productId: "1" } })],
      ["updateProductImage", req({ params: { imageId: "1" } })],
      ["deleteProductImage", req({ params: { imageId: "1" } })],
      ["reorderProductImages", req({ params: { productId: "1" }, validatedBody: { images: [] } })],
    ];
    for (const [name, request] of cases) {
      const res = response();
      await controller[name](request, res, assert.fail);
      assert.equal(res.body.success, true);
    }

    const explodingService = {
      getProductImages: async () => { throw new Error("err"); },
      createProductImage: async () => { throw new Error("err"); },
      updateProductImage: async () => { throw new Error("err"); },
      deleteProductImage: async () => { throw new Error("err"); },
      reorderProductImages: async () => { throw new Error("err"); },
    };
    const explodingController = createProductImageController({ service: explodingService });
    for (const [name, request] of cases) {
      let passedError = null;
      await explodingController[name](request, response(), (e) => {
        passedError = e;
      });
      assert.ok(passedError);
    }
  });

  test("category controller adapts operations and passes errors to next", async () => {
    const service = {
      getCategories: async () => [{ category_id: 1 }],
      getAdminCategories: async () => [{ category_id: 1 }],
      getCategoryById: async () => ({ category_id: 1 }),
      getProductsByCategory: async () => ({ items: [], pagination: {} }),
      createCategory: async () => ({ category_id: 1 }),
      updateCategory: async () => ({ category_id: 1 }),
      deleteCategory: async () => {},
      updateCategoryStatus: async () => ({ category_id: 1 }),
      assignProductCategory: async () => [{ category_id: 1 }],
      removeProductCategory: async () => {},
      setPrimaryCategory: async () => [{ category_id: 1 }],
    };
    const controller = createCategoryController({ service });
    const cases = [
      ["getCategories", req()],
      ["getAdminCategories", req()],
      ["getCategoryById", req({ params: { categoryId: "1" } })],
      ["getProductsByCategory", req({ params: { categoryId: "1" } })],
      ["createCategory", req()],
      ["updateCategory", req({ params: { categoryId: "1" } })],
      ["deleteCategory", req({ params: { categoryId: "1" } })],
      ["updateCategoryStatus", req({ params: { categoryId: "1" }, validatedBody: { is_active: true } })],
      ["assignProductCategory", req({ params: { productId: "1" } })],
      ["removeProductCategory", req({ params: { productId: "1", categoryId: "1" } })],
      ["setPrimaryCategory", req({ params: { productId: "1", categoryId: "1" } })],
    ];
    for (const [name, request] of cases) {
      const res = response();
      await controller[name](request, res, assert.fail);
      assert.equal(res.body.success, true);
    }

    const explodingService = {
      getCategories: async () => { throw new Error("err"); },
      getAdminCategories: async () => { throw new Error("err"); },
      getCategoryById: async () => { throw new Error("err"); },
      getProductsByCategory: async () => { throw new Error("err"); },
      createCategory: async () => { throw new Error("err"); },
      updateCategory: async () => { throw new Error("err"); },
      deleteCategory: async () => { throw new Error("err"); },
      updateCategoryStatus: async () => { throw new Error("err"); },
      assignProductCategory: async () => { throw new Error("err"); },
      removeProductCategory: async () => { throw new Error("err"); },
      setPrimaryCategory: async () => { throw new Error("err"); },
    };
    const explodingController = createCategoryController({ service: explodingService });
    for (const [name, request] of cases) {
      let passedError = null;
      await explodingController[name](request, response(), (e) => {
        passedError = e;
      });
      assert.ok(passedError);
    }
  });

  test("collection controller adapts operations and passes errors to next", async () => {
    const service = {
      getCollections: async () => [{ collection_id: 1 }],
      getAdminCollections: async () => [{ collection_id: 1 }],
      getCollectionById: async () => ({ collection_id: 1 }),
      getProductsByCollection: async () => ({ items: [], pagination: {} }),
      createCollection: async () => ({ collection_id: 1 }),
      updateCollection: async () => ({ collection_id: 1 }),
      deleteCollection: async () => {},
      updateCollectionStatus: async () => ({ collection_id: 1 }),
      addProductToCollection: async () => [{ product_id: 1 }],
      removeProductFromCollection: async () => {},
      reorderCollectionProducts: async () => [{ product_id: 1 }],
    };
    const controller = createCollectionController({ service });
    const cases = [
      ["getCollections", req()],
      ["getAdminCollections", req()],
      ["getCollectionById", req({ params: { collectionId: "1" } })],
      ["getAdminCollectionById", req({ params: { collectionId: "1" } })],
      ["getProductsByCollection", req({ params: { collectionId: "1" } })],
      ["createCollection", req()],
      ["updateCollection", req({ params: { collectionId: "1" } })],
      ["deleteCollection", req({ params: { collectionId: "1" } })],
      ["updateCollectionStatus", req({ params: { collectionId: "1" }, validatedBody: { is_active: true } })],
      ["addProductToCollection", req({ params: { collectionId: "1" } })],
      ["removeProductFromCollection", req({ params: { collectionId: "1", productId: "1" } })],
      ["reorderCollectionProducts", req({ params: { collectionId: "1" }, validatedBody: { products: [] } })],
    ];
    for (const [name, request] of cases) {
      const res = response();
      await controller[name](request, res, assert.fail);
      assert.equal(res.body.success, true);
    }

    const explodingService = {
      getCollections: async () => { throw new Error("err"); },
      getAdminCollections: async () => { throw new Error("err"); },
      getCollectionById: async () => { throw new Error("err"); },
      getProductsByCollection: async () => { throw new Error("err"); },
      createCollection: async () => { throw new Error("err"); },
      updateCollection: async () => { throw new Error("err"); },
      deleteCollection: async () => { throw new Error("err"); },
      updateCollectionStatus: async () => { throw new Error("err"); },
      addProductToCollection: async () => { throw new Error("err"); },
      removeProductFromCollection: async () => { throw new Error("err"); },
      reorderCollectionProducts: async () => { throw new Error("err"); },
    };
    const explodingController = createCollectionController({ service: explodingService });
    for (const [name, request] of cases) {
      let passedError = null;
      await explodingController[name](request, response(), (e) => {
        passedError = e;
      });
      assert.ok(passedError);
    }
  });

  test("inventory controller delegates to service and sends correct HTTP response", async () => {
    const items = [{ inventory_id: 1, product_variant_id: 101, sku: "SKU-A", quantity_stock: 10, quantity_reserved: 2, quantity_available: 8, is_low_stock: false, is_out_of_stock: false }];
    const pagination = { page: 1, limit: 20, total: 1, total_pages: 1 };
    const inventoryService = {
      getInventories: async () => ({ items, pagination }),
      getInventoryByVariantId: async () => items[0],
      updateInventory: async () => ({ ...items[0], quantity_stock: 20 }),
    };
    const controller = createInventoryController({ service: inventoryService });

    const listRes = response();
    await controller.getInventories(req({ validatedQuery: { page: 1, limit: 20, sort: "updated_desc" } }), listRes, assert.fail);
    assert.equal(listRes.statusCode, 200);
    assert.ok(listRes.body.data.items);
    assert.ok(listRes.body.data.pagination);

    const getRes = response();
    await controller.getInventoryByVariantId(req({ params: { variantId: "101" } }), getRes, assert.fail);
    assert.equal(getRes.statusCode, 200);
    assert.equal(getRes.body.data.product_variant_id, 101);

    const patchRes = response();
    await controller.updateInventory(req({ params: { variantId: "101" }, validatedBody: { quantity_stock: 20 } }), patchRes, assert.fail);
    assert.equal(patchRes.statusCode, 200);
    assert.equal(patchRes.body.data.quantity_stock, 20);
  });

  test("inventory controller passes errors to next", async () => {
    const explodingService = {
      getInventories: async () => { throw new Error("boom"); },
      getInventoryByVariantId: async () => { throw new Error("boom"); },
      updateInventory: async () => { throw new Error("boom"); },
    };
    const explodingController = createInventoryController({ service: explodingService });
    const cases = [
      ["getInventories", req({ validatedQuery: { page: 1, limit: 20, sort: "updated_desc" } })],
      ["getInventoryByVariantId", req({ params: { variantId: "101" } })],
      ["updateInventory", req({ params: { variantId: "101" }, validatedBody: { quantity_stock: 10 } })],
    ];
    for (const [name, request] of cases) {
      let passedError = null;
      await explodingController[name](request, response(), (e) => { passedError = e; });
      assert.ok(passedError);
    }
  });

  test("voucher controller delegates to service and sends correct responses", async () => {
    const voucherData = { voucher_id: 1, code_voucher: "SUMMER10", discount_amount: 100000 };
    const voucherService = {
      validateVoucher: async () => voucherData,
      getVouchers: async () => ({ items: [voucherData], pagination: { total: 1 } }),
      getVoucherById: async () => voucherData,
      createVoucher: async () => voucherData,
      updateVoucher: async () => voucherData,
      updateVoucherStatus: async () => ({ ...voucherData, is_active: false }),
      deleteVoucher: async () => true,
    };
    const controller = createVoucherController({ service: voucherService });

    const validateRes = response();
    await controller.validateVoucher(req({ cartOwner: { type: "guest", guestToken: "tok" }, validatedBody: { code_voucher: "SUMMER10" } }), validateRes, assert.fail);
    assert.equal(validateRes.statusCode, 200);
    assert.equal(validateRes.body.data.code_voucher, "SUMMER10");

    const listRes = response();
    await controller.getVouchers(req({ validatedQuery: { page: 1 } }), listRes, assert.fail);
    assert.equal(listRes.statusCode, 200);

    const getRes = response();
    await controller.getVoucherById(req({ params: { voucherId: "1" } }), getRes, assert.fail);
    assert.equal(getRes.statusCode, 200);

    const createRes = response();
    await controller.createVoucher(req({ validatedBody: { code_voucher: "SUMMER10" } }), createRes, assert.fail);
    assert.equal(createRes.statusCode, 201);

    const updateRes = response();
    await controller.updateVoucher(req({ params: { voucherId: "1" }, validatedBody: { name_voucher: "New" } }), updateRes, assert.fail);
    assert.equal(updateRes.statusCode, 200);

    const statusRes = response();
    await controller.updateVoucherStatus(req({ params: { voucherId: "1" }, validatedBody: { is_active: false } }), statusRes, assert.fail);
    assert.equal(statusRes.statusCode, 200);

    const deleteRes = response();
    await controller.deleteVoucher(req({ params: { voucherId: "1" } }), deleteRes, assert.fail);
    assert.equal(deleteRes.statusCode, 200);
  });

  test("voucher controller passes errors to next", async () => {
    const explodingService = {
      validateVoucher: async () => { throw new Error("boom"); },
      getVouchers: async () => { throw new Error("boom"); },
      getVoucherById: async () => { throw new Error("boom"); },
      createVoucher: async () => { throw new Error("boom"); },
      updateVoucher: async () => { throw new Error("boom"); },
      updateVoucherStatus: async () => { throw new Error("boom"); },
      deleteVoucher: async () => { throw new Error("boom"); },
    };
    const explodingController = createVoucherController({ service: explodingService });
    const cases = [
      ["validateVoucher", req({ cartOwner: { type: "guest" }, validatedBody: { code_voucher: "A" } })],
      ["getVouchers", req({ validatedQuery: {} })],
      ["getVoucherById", req({ params: { voucherId: "1" } })],
      ["createVoucher", req({ validatedBody: {} })],
      ["updateVoucher", req({ params: { voucherId: "1" }, validatedBody: {} })],
      ["updateVoucherStatus", req({ params: { voucherId: "1" }, validatedBody: {} })],
      ["deleteVoucher", req({ params: { voucherId: "1" } })],
    ];
    for (const [name, request] of cases) {
      let passedError = null;
      await explodingController[name](request, response(), (e) => { passedError = e; });
      assert.ok(passedError);
    }
  });

  test("order controller delegates to service and handles errors", async () => {
    const service = {
      createOrder: async () => ({ order_id: 101, total_order: 500000 }),
      getUserOrders: async () => ({ items: [], pagination: {} }),
      getUserOrderById: async () => ({ order_id: 101 }),
      cancelUserOrder: async () => ({ order_id: 101, status_order: "cancelled" }),
      lookupGuestOrder: async () => ({ order_code: "ORD-001" }),
      cancelGuestOrder: async () => ({ order_code: "ORD-001", status_order: "cancelled" }),
    };
    const controller = createOrderController({ orders: service });
    const res = response();
    await controller.createOrder(req({ validatedBody: { payment_method: "cod" } }), res, assert.fail);
    assert.equal(res.statusCode, 201);
    assert.equal(res.body.data.order_id, 101);

    await controller.getMyOrders(req({ validatedQuery: {} }), response(), assert.fail);
    await controller.getMyOrderById(req({ validatedParams: { orderId: 101 } }), response(), assert.fail);
    await controller.cancelMyOrder(req({ validatedParams: { orderId: 101 } }), response(), assert.fail);
    await controller.lookupGuestOrder(req({ validatedBody: {} }), response(), assert.fail);
    await controller.cancelGuestOrder(req({ params: { orderCode: "ORD-001" }, validatedBody: {} }), response(), assert.fail);

    const explodingService = {
      createOrder: async () => { throw new Error("order_err"); },
      getUserOrders: async () => { throw new Error("order_err"); },
      getUserOrderById: async () => { throw new Error("order_err"); },
      cancelUserOrder: async () => { throw new Error("order_err"); },
      lookupGuestOrder: async () => { throw new Error("order_err"); },
      cancelGuestOrder: async () => { throw new Error("order_err"); },
    };
    const explodingController = createOrderController({ orders: explodingService });
    const cases = [
      ["createOrder", req()],
      ["getMyOrders", req()],
      ["getMyOrderById", req({ validatedParams: { orderId: 1 } })],
      ["cancelMyOrder", req({ validatedParams: { orderId: 1 } })],
      ["lookupGuestOrder", req()],
      ["cancelGuestOrder", req({ params: { orderCode: "ORD-001" } })],
    ];
    for (const [name, request] of cases) {
      let passedErr = null;
      await explodingController[name](request, response(), (e) => { passedErr = e; });
      assert.ok(passedErr);
    }
  });

  test("admin order controller delegates to service and handles errors", async () => {
    const service = {
      getOrders: async () => ({ items: [], pagination: {} }),
      getOrderById: async () => ({ order_id: 101 }),
      confirmOrder: async () => ({ order_id: 101, status_order: "confirmed" }),
      processOrder: async () => ({ order_id: 101, status_order: "processing" }),
      shipOrder: async () => ({ order_id: 101, status_order: "shipping" }),
      completeOrder: async () => ({ order_id: 101, status_order: "completed" }),
      cancelOrder: async () => ({ order_id: 101, status_order: "cancelled" }),
    };
    const controller = createAdminOrderController({ orders: service });
    await controller.getOrders(req({ validatedQuery: {} }), response(), assert.fail);
    await controller.getOrderById(req({ validatedParams: { orderId: 101 } }), response(), assert.fail);
    await controller.confirmOrder(req({ validatedParams: { orderId: 101 } }), response(), assert.fail);
    await controller.processOrder(req({ validatedParams: { orderId: 101 } }), response(), assert.fail);
    await controller.shipOrder(req({ validatedParams: { orderId: 101 } }), response(), assert.fail);
    await controller.completeOrder(req({ validatedParams: { orderId: 101 } }), response(), assert.fail);
    await controller.cancelOrder(req({ validatedParams: { orderId: 101 }, validatedBody: {} }), response(), assert.fail);

    const explodingService = {
      getOrders: async () => { throw new Error("admin_order_err"); },
      getOrderById: async () => { throw new Error("admin_order_err"); },
      confirmOrder: async () => { throw new Error("admin_order_err"); },
      processOrder: async () => { throw new Error("admin_order_err"); },
      shipOrder: async () => { throw new Error("admin_order_err"); },
      completeOrder: async () => { throw new Error("admin_order_err"); },
      cancelOrder: async () => { throw new Error("admin_order_err"); },
    };
    const explodingController = createAdminOrderController({ orders: explodingService });
    const cases = [
      ["getOrders", req()],
      ["getOrderById", req({ validatedParams: { orderId: 1 } })],
      ["confirmOrder", req({ validatedParams: { orderId: 1 } })],
      ["processOrder", req({ validatedParams: { orderId: 1 } })],
      ["shipOrder", req({ validatedParams: { orderId: 1 } })],
      ["completeOrder", req({ validatedParams: { orderId: 1 } })],
      ["cancelOrder", req({ validatedParams: { orderId: 1 } })],
    ];
    for (const [name, request] of cases) {
      let passedErr = null;
      await explodingController[name](request, response(), (e) => { passedErr = e; });
      assert.ok(passedErr);
    }
  });

  test("payment controller delegates to service and handles errors", async () => {
    const service = {
      createPayOSPayment: async () => ({ checkout_url: "https://pay.payos.vn/1" }),
      handlePayOSWebhook: async () => ({ status_payment: "paid" }),
      getOrderPaymentStatus: async () => ({ status_payment: "pending" }),
      cancelPayOSPaymentLink: async () => ({ status_payment: "cancelled" }),
    };
    const controller = createPaymentController({ payments: service });
    await controller.createPayOSPayment(req({ validatedBody: { order_id: 1 } }), response(), assert.fail);
    await controller.handlePayOSWebhook(req({ validatedBody: {} }), response(), assert.fail);
    await controller.getOrderPayment(req({ validatedParams: { orderId: 1 } }), response(), assert.fail);
    await controller.cancelPayOSPayment(req({ validatedParams: { orderId: 1 } }), response(), assert.fail);

    const explodingService = {
      createPayOSPayment: async () => { throw new Error("pay_err"); },
      handlePayOSWebhook: async () => { throw new Error("pay_err"); },
      getOrderPaymentStatus: async () => { throw new Error("pay_err"); },
      cancelPayOSPaymentLink: async () => { throw new Error("pay_err"); },
    };
    const explodingController = createPaymentController({ payments: explodingService });
    const cases = [
      ["createPayOSPayment", req()],
      ["handlePayOSWebhook", req()],
      ["getOrderPayment", req({ validatedParams: { orderId: 1 } })],
      ["cancelPayOSPayment", req({ validatedParams: { orderId: 1 } })],
    ];
    for (const [name, request] of cases) {
      let passedErr = null;
      await explodingController[name](request, response(), (e) => { passedErr = e; });
      assert.ok(passedErr);
    }
  });

  test("admin user controller delegates to service and handles errors", async () => {
    const service = {
      getUsers: async () => ({ items: [], pagination: {} }),
      getUserById: async () => ({ user_id: "1" }),
      blockUser: async () => ({ status: "blocked" }),
      unblockUser: async () => ({ status: "active" }),
      setUserInactive: async () => ({ status: "inactive" }),
    };
    const controller = createAdminUserController({ users: service });
    const userReq = req({ user: { user_id: "admin-1" }, validatedParams: { userId: "user-1" } });
    await controller.getUsers(req({ validatedQuery: {} }), response(), assert.fail);
    await controller.getUserById(userReq, response(), assert.fail);
    await controller.blockUser(userReq, response(), assert.fail);
    await controller.unblockUser(userReq, response(), assert.fail);
    await controller.setUserInactive(userReq, response(), assert.fail);

    const explodingService = {
      getUsers: async () => { throw new Error("admin_user_err"); },
      getUserById: async () => { throw new Error("admin_user_err"); },
      blockUser: async () => { throw new Error("admin_user_err"); },
      unblockUser: async () => { throw new Error("admin_user_err"); },
      setUserInactive: async () => { throw new Error("admin_user_err"); },
    };
    const explodingController = createAdminUserController({ users: explodingService });
    const cases = [
      ["getUsers", req()],
      ["getUserById", req({ validatedParams: { userId: "user-1" } })],
      ["blockUser", req({ user: { user_id: "admin-1" }, validatedParams: { userId: "user-1" } })],
      ["unblockUser", req({ user: { user_id: "admin-1" }, validatedParams: { userId: "user-1" } })],
      ["setUserInactive", req({ user: { user_id: "admin-1" }, validatedParams: { userId: "user-1" } })],
    ];
    for (const [name, request] of cases) {
      let passedErr = null;
      await explodingController[name](request, response(), (e) => { passedErr = e; });
      assert.ok(passedErr);
    }
  });

  test("admin audit log controller delegates to service and handles errors", async () => {
    const service = {
      getAuditLogs: async () => ({ items: [], pagination: {} }),
      getAuditLogById: async () => ({ audit_log_id: 1 }),
    };
    const controller = createAdminAuditLogController({ auditLogs: service });
    await controller.getAuditLogs(req({ validatedQuery: {} }), response(), assert.fail);
    await controller.getAuditLogById(req({ validatedParams: { auditLogId: 1 } }), response(), assert.fail);

    const explodingService = {
      getAuditLogs: async () => { throw new Error("audit_err"); },
      getAuditLogById: async () => { throw new Error("audit_err"); },
    };
    const explodingController = createAdminAuditLogController({ auditLogs: explodingService });
    const cases = [
      ["getAuditLogs", req()],
      ["getAuditLogById", req({ validatedParams: { auditLogId: 1 } })],
    ];
    for (const [name, request] of cases) {
      let passedErr = null;
      await explodingController[name](request, response(), (e) => { passedErr = e; });
      assert.ok(passedErr);
    }
  });

  test("user session controller delegates to service and handles errors", async () => {
    const service = {
      getUserSessions: async () => [{ user_session_id: 1 }],
      revokeSession: async () => {},
      revokeAllUserSessions: async () => {},
    };
    const controller = createUserSessionController({ sessionService: service });
    await controller.getMySessions(req({ user: { user_id: "u1", session_id: 1 } }), response(), assert.fail);
    await controller.revokeMySession(req({ user: { user_id: "u1" }, validatedParams: { sessionId: 1 } }), response(), assert.fail);
    await controller.revokeAllMySessions(req({ user: { user_id: "u1" } }), response(), assert.fail);

    const explodingService = {
      getUserSessions: async () => { throw new Error("session_err"); },
      revokeSession: async () => { throw new Error("session_err"); },
      revokeAllUserSessions: async () => { throw new Error("session_err"); },
    };
    const explodingController = createUserSessionController({ sessionService: explodingService });
    const cases = [
      ["getMySessions", req()],
      ["revokeMySession", req({ validatedParams: { sessionId: 1 } })],
      ["revokeAllMySessions", req()],
    ];
    for (const [name, request] of cases) {
      let passedErr = null;
      await explodingController[name](request, response(), (e) => { passedErr = e; });
      assert.ok(passedErr);
    }
  });
});






