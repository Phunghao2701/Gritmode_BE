import { conflict, notFound } from "../errors/app-error.js";
import { inventoryRepository } from "../repositories/inventory.repository.js";
import { productVariantRepository } from "../repositories/product-variant.repository.js";
import { auditRepository } from "../repositories/audit.repository.js";
import { withTransaction } from "../config/database.js";
import logger from "../utils/logger.js";

export const LOW_STOCK_THRESHOLD = 5;

/**
 * Decorate inventory item with computed flag fields.
 */
const decorateInventory = (inv) => ({
  ...inv,
  quantity_available: Number(inv.quantity_available),
  quantity_stock: Number(inv.quantity_stock),
  quantity_reserved: Number(inv.quantity_reserved),
  is_low_stock: Number(inv.quantity_available) <= LOW_STOCK_THRESHOLD && Number(inv.quantity_available) > 0,
  is_out_of_stock: Number(inv.quantity_available) <= 0,
});

export const createInventoryService = ({
  inventories = inventoryRepository,
  variants = productVariantRepository,
  audits = auditRepository,
  transaction = withTransaction,
} = {}) => {
  return {
    /**
     * Get paginated inventory list for Admin.
     */
    async getInventories(query = {}) {
      const { page = 1, limit = 20, search, low_stock = false, out_of_stock = false, sort = "updated_desc" } = query;
      const filter = { page, limit, search, low_stock, out_of_stock, sort };

      const [items, total] = await Promise.all([
        inventories.findAll(filter),
        inventories.countAll(filter),
      ]);

      return {
        items: items.map(decorateInventory),
        pagination: {
          page,
          limit,
          total,
          total_pages: Math.ceil(total / limit),
        },
      };
    },

    /**
     * Get inventory for a specific variant (Admin).
     */
    async getInventoryByVariantId(variantId) {
      const variant = await variants.findById(variantId);
      if (!variant) throw notFound("VARIANT_NOT_FOUND", "Không tìm thấy biến thể sản phẩm");

      const inv = await inventories.findByVariantId(variantId);
      if (!inv) throw notFound("INVENTORY_NOT_FOUND", "Không tìm thấy tồn kho cho biến thể này");

      return decorateInventory(inv);
    },

    /**
     * Admin update quantity_stock.
     * Business rule: new quantity_stock must >= current quantity_reserved.
     */
    async updateInventory(variantId, data, userId) {
      const variant = await variants.findById(variantId);
      if (!variant) throw notFound("VARIANT_NOT_FOUND", "Không tìm thấy biến thể sản phẩm");

      const current = await inventories.findByVariantId(variantId);
      if (!current) throw notFound("INVENTORY_NOT_FOUND", "Không tìm thấy tồn kho cho biến thể này");

      const currentReserved = Number(current.quantity_reserved);
      const newStock = Number(data.quantity_stock);

      if (newStock < currentReserved) {
        throw conflict(
          "STOCK_BELOW_RESERVED",
          `Số lượng tồn kho không thể thấp hơn số lượng đang đặt trước (${currentReserved})`,
        );
      }

      return transaction(async (client) => {
        const updated = await inventories.updateStock(variantId, newStock, client);

        if (audits?.record) {
          await audits.record(
            {
              userId,
              action: "update_inventory",
              entityName: "inventory",
              entityId: current.inventory_id,
              oldData: { quantity_stock: Number(current.quantity_stock) },
              newData: { quantity_stock: newStock },
            },
            client,
          );
        }

        return decorateInventory(updated);
      });
    },

    // ── Internal functions (used by Checkout / Order services) ────────────

    /**
     * Check if inventory record exists for a variant.
     */
    async inventoryExists(variantId, client) {
      const inv = await inventories.findByVariantId(variantId, client);
      return inv !== null;
    },

    /**
     * Get computed available quantity for a variant.
     */
    async getAvailableQuantity(variantId, client) {
      const inv = await inventories.findByVariantId(variantId, client);
      if (!inv) throw notFound("INVENTORY_NOT_FOUND", "Không tìm thấy tồn kho cho biến thể này");
      return Number(inv.quantity_available);
    },

    /**
     * Check if requested quantity is available. Throws 409 if not.
     */
    async checkAvailableStock(variantId, requestedQty, client) {
      const inv = await inventories.findByVariantId(variantId, client);
      if (!inv) throw notFound("INVENTORY_NOT_FOUND", "Không tìm thấy tồn kho cho biến thể này");

      const available = Number(inv.quantity_available);
      if (available < requestedQty) {
        const err = conflict("INSUFFICIENT_STOCK", "Không đủ hàng tồn kho");
        err.data = { available_quantity: available };
        throw err;
      }
      return true;
    },

    /**
     * Atomically reserve stock for checkout.
     * Uses conditional SQL UPDATE to prevent overselling.
     * Must be called within checkout transaction.
     */
    async reserveStock(variantId, qty, client) {
      const result = await inventories.reserveStock(variantId, qty, client);
      if (!result) {
        const err = conflict("INSUFFICIENT_STOCK", "Không đủ hàng tồn kho");
        err.data = { available_quantity: 0 };
        throw err;
      }
      return result;
    },

    /**
     * Release reserved stock when order is cancelled.
     * Must be called within order cancellation transaction.
     */
    async releaseReservedStock(variantId, qty, client) {
      const result = await inventories.releaseReservedStock(variantId, qty, client);
      if (!result) {
        logger.error(`[inventory] releaseReservedStock: inventory not found for variantId=${variantId}`);
        throw notFound("INVENTORY_NOT_FOUND", "Không tìm thấy tồn kho cho biến thể này");
      }
      return result;
    },

    /**
     * Commit reserved stock when order is completed.
     * Decrements both quantity_stock and quantity_reserved.
     * Must be called within order completion transaction.
     */
    async commitReservedStock(variantId, qty, client) {
      const result = await inventories.commitReservedStock(variantId, qty, client);
      if (!result) {
        logger.error(`[inventory] commitReservedStock: inventory not found or insufficient reserved for variantId=${variantId}`);
        throw notFound("INVENTORY_NOT_FOUND", "Không tìm thấy tồn kho hoặc không đủ số lượng đã đặt trước");
      }
      return result;
    },
  };
};

const defaultInventoryService = createInventoryService();

export const {
  getInventories,
  getInventoryByVariantId,
  updateInventory,
  inventoryExists,
  getAvailableQuantity,
  checkAvailableStock,
  reserveStock,
  releaseReservedStock,
  commitReservedStock,
} = defaultInventoryService;
