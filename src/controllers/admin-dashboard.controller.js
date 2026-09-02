import pool from "../config/database.js";
import { ok } from "../utils/api-response.js";
import logger from "../utils/logger.js";

function calcPercentChange(curr, prev) {
  if (!prev || prev === 0) {
    return curr > 0 ? "+100%" : "0%";
  }
  const pct = Math.round(((curr - prev) / prev) * 100);
  return pct >= 0 ? `+${pct}%` : `${pct}%`;
}

export const getDashboardStats = async (req, res, next) => {
  try {
    const [ordersRes, productsRes, usersRes, inventoryRes] = await Promise.all([
      pool.query(`
        SELECT
          COALESCE(SUM(CASE WHEN o.status_order != 'cancelled' AND o.created_at >= date_trunc('month', CURRENT_DATE) THEN o.total_order ELSE 0 END), 0)::float AS revenue_this_month,
          COALESCE(SUM(CASE WHEN o.status_order != 'cancelled' AND o.created_at >= date_trunc('month', CURRENT_DATE - INTERVAL '1 month') AND o.created_at < date_trunc('month', CURRENT_DATE) THEN o.total_order ELSE 0 END), 0)::float AS revenue_last_month,
          COUNT(*)::int AS total_orders,
          COUNT(CASE WHEN o.created_at >= date_trunc('month', CURRENT_DATE) THEN 1 END)::int AS orders_this_month,
          COUNT(CASE WHEN o.created_at >= date_trunc('month', CURRENT_DATE - INTERVAL '1 month') AND o.created_at < date_trunc('month', CURRENT_DATE) THEN 1 END)::int AS orders_last_month
        FROM "order" o
      `),
      pool.query(`
        SELECT
          COUNT(*)::int AS total_products,
          COUNT(CASE WHEN status_product = 'active' THEN 1 END)::int AS active_products,
          COUNT(CASE WHEN created_at >= date_trunc('month', CURRENT_DATE) THEN 1 END)::int AS products_this_month
        FROM product
      `),
      pool.query(`
        SELECT
          COUNT(*)::int AS total_users,
          COUNT(CASE WHEN created_at >= date_trunc('month', CURRENT_DATE) THEN 1 END)::int AS users_this_month,
          COUNT(CASE WHEN created_at >= date_trunc('month', CURRENT_DATE - INTERVAL '1 month') AND created_at < date_trunc('month', CURRENT_DATE) THEN 1 END)::int AS users_last_month
        FROM "user"
      `),
      pool.query(`
        SELECT COUNT(*)::int AS low_stock_count
        FROM inventory
        WHERE (quantity_stock - quantity_reserved) <= 5
      `),
    ]);

    const ord = ordersRes.rows[0] || {};
    const prod = productsRes.rows[0] || {};
    const usr = usersRes.rows[0] || {};
    const inv = inventoryRes.rows[0] || {};

    const revenueThisMonth = ord.revenue_this_month || 0;
    const revenueLastMonth = ord.revenue_last_month || 0;
    const totalOrders = ord.total_orders || 0;
    const ordersThisMonth = ord.orders_this_month || 0;
    const ordersLastMonth = ord.orders_last_month || 0;

    const totalProducts = prod.active_products ?? prod.total_products ?? 0;
    const productsThisMonth = prod.products_this_month || 0;

    const totalUsers = usr.total_users || 0;
    const usersThisMonth = usr.users_this_month || 0;
    const usersLastMonth = usr.users_last_month || 0;

    const lowStockCount = inv.low_stock_count || 0;

    const data = {
      revenueThisMonth,
      revenueChange: calcPercentChange(revenueThisMonth, revenueLastMonth),
      totalOrders,
      ordersChange: calcPercentChange(ordersThisMonth, ordersLastMonth),
      totalProducts,
      productsChange: `+${productsThisMonth}`,
      totalUsers,
      usersChange: calcPercentChange(usersThisMonth, usersLastMonth),
      lowStockCount,
    };

    return ok(res, data, { message: "Lấy thống kê bảng điều khiển thành công" });
  } catch (error) {
    logger.error("[admin-dashboard] getDashboardStats error:", error);
    next(error);
  }
};
