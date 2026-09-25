import {
  getInventories as svcGetInventories,
  getInventoryByVariantId as svcGetInventoryByVariantId,
  updateInventory as svcUpdateInventory,
} from "../services/inventory.service.js";
import { ok } from "../utils/api-response.js";
import logger from "../utils/logger.js";

export const createInventoryController = ({
  service = {
    getInventories: svcGetInventories,
    getInventoryByVariantId: svcGetInventoryByVariantId,
    updateInventory: svcUpdateInventory,
  },
} = {}) => ({
  /**
   * GET /api/v1/admin/inventory
   * List all inventories with pagination, search, filter, sort.
   */
  async getInventories(req, res, next) {
    try {
      const query = req.validatedQuery || {};
      const result = await service.getInventories(query);
      return ok(res, result, { code: "INVENTORY_LIST", message: "Lấy danh sách tồn kho thành công" });
    } catch (err) {
      logger.error("[inventory] getInventories error:", err);
      return next(err);
    }
  },

  /**
   * GET /api/v1/admin/product-variants/:variantId/inventory
   * Get inventory for a single variant.
   */
  async getInventoryByVariantId(req, res, next) {
    try {
      const variantId = Number(req.params.variantId);
      const result = await service.getInventoryByVariantId(variantId);
      return ok(res, result, { code: "INVENTORY_DETAIL", message: "Lấy tồn kho thành công" });
    } catch (err) {
      logger.error("[inventory] getInventoryByVariantId error:", err);
      return next(err);
    }
  },

  /**
   * PATCH /api/v1/admin/product-variants/:variantId/inventory
   * Admin update quantity_stock.
   */
  async updateInventory(req, res, next) {
    try {
      const variantId = Number(req.params.variantId);
      const data = req.validatedBody || {};
      const userId = req.user?.user_id;
      const result = await service.updateInventory(variantId, data, userId);
      return ok(res, result, { code: "INVENTORY_UPDATED", message: "Cập nhật tồn kho thành công" });
    } catch (err) {
      logger.error("[inventory] updateInventory error:", err);
      return next(err);
    }
  },
});

const defaultController = createInventoryController();

export const {
  getInventories,
  getInventoryByVariantId,
  updateInventory,
} = defaultController;

