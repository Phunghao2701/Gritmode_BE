import pool from "../config/database.js";
import { ok } from "../utils/api-response.js";
import logger from "../utils/logger.js";
import { redisService } from "../services/redis.service.js";

function calcPercentChange(curr, prev) {
  if (!prev || prev === 0) {
    return curr > 0 ? "+100%" : "0%";
  }
  const pct = Math.round(((curr - prev) / prev) * 100);
  return pct >= 0 ? `+${pct}%` : `${pct}%`;
}

// Single high-performance combined query for all overview stats
const DASHBOARD_STATS_QUERY = `
  WITH
    order_stats AS (
      SELECT
        COALESCE(SUM(CASE WHEN o.status_order = 'completed' THEN o.total_order ELSE 0 END), 0)::float AS total_revenue,
        COALESCE(SUM(CASE WHEN o.status_order = 'completed' AND o.created_at >= date_trunc('month', CURRENT_DATE) THEN o.total_order ELSE 0 END), 0)::float AS revenue_this_month,
        COALESCE(SUM(CASE WHEN o.status_order = 'completed' AND o.created_at >= date_trunc('month', CURRENT_DATE - INTERVAL '1 month') AND o.created_at < date_trunc('month', CURRENT_DATE) THEN o.total_order ELSE 0 END), 0)::float AS revenue_last_month,
        COUNT(*)::int AS total_orders,
        COUNT(CASE WHEN o.created_at >= date_trunc('month', CURRENT_DATE) THEN 1 END)::int AS orders_this_month,
        COUNT(CASE WHEN o.created_at >= date_trunc('month', CURRENT_DATE - INTERVAL '1 month') AND o.created_at < date_trunc('month', CURRENT_DATE) THEN 1 END)::int AS orders_last_month
      FROM "order" o
    ),
    product_stats AS (
      SELECT
        COUNT(*)::int AS total_products,
        COUNT(CASE WHEN status_product = 'active' THEN 1 END)::int AS active_products,
        COUNT(CASE WHEN created_at >= date_trunc('month', CURRENT_DATE) THEN 1 END)::int AS products_this_month
      FROM product
    ),
    user_stats AS (
      SELECT
        COUNT(*)::int AS total_users,
        COUNT(CASE WHEN created_at >= date_trunc('month', CURRENT_DATE) THEN 1 END)::int AS users_this_month,
        COUNT(CASE WHEN created_at >= date_trunc('month', CURRENT_DATE - INTERVAL '1 month') AND created_at < date_trunc('month', CURRENT_DATE) THEN 1 END)::int AS users_last_month
      FROM "user"
    ),
    inv_stats AS (
      SELECT COUNT(*)::int AS low_stock_count
      FROM inventory
      WHERE (quantity_stock - quantity_reserved) <= 5
    )
  SELECT
    o.*, p.*, u.*, i.*
  FROM order_stats o, product_stats p, user_stats u, inv_stats i
`;

const RECENT_ORDERS_QUERY = `
  SELECT 
    o.order_id,
    o.order_code,
    o.total_order,
    o.status_order,
    p.status_payment,
    p.payment_method,
    o.created_at,
    COALESCE(u.email, o.email_order, 'Khách vãng lai') AS user_email,
    COALESCE(u.full_name, oa.receiver_name_order_address, 'Khách hàng') AS user_name
  FROM "order" o
  LEFT JOIN "user" u ON o.user_id = u.user_id
  LEFT JOIN LATERAL (SELECT receiver_name_order_address FROM order_address WHERE order_id = o.order_id LIMIT 1) oa ON true
  LEFT JOIN LATERAL (SELECT status_payment, payment_method FROM payment WHERE order_id = o.order_id ORDER BY created_at DESC LIMIT 1) p ON true
  ORDER BY o.created_at DESC
  LIMIT 5
`;

const LOW_STOCK_QUERY = `
  SELECT
    i.inventory_id,
    i.product_variant_id,
    i.quantity_stock,
    i.quantity_reserved,
    (i.quantity_stock - i.quantity_reserved) AS quantity_available,
    pv.sku,
    pv.price,
    p.name_product
  FROM inventory i
  JOIN product_variant pv ON i.product_variant_id = pv.product_variant_id
  JOIN product p ON pv.product_id = p.product_id
  WHERE (i.quantity_stock - i.quantity_reserved) <= 5
  ORDER BY (i.quantity_stock - i.quantity_reserved) ASC
  LIMIT 5
`;

function mapStatsRow(row = {}) {
  const totalRevenue = Number(row.total_revenue ?? (row.revenue_this_month || 0));
  const revenueThisMonth = Number(row.revenue_this_month || 0);
  const revenueLastMonth = Number(row.revenue_last_month || 0);
  const totalOrders = Number(row.total_orders || 0);
  const ordersThisMonth = Number(row.orders_this_month || 0);
  const ordersLastMonth = Number(row.orders_last_month || 0);

  const totalProducts = Number(row.active_products ?? row.total_products ?? 0);
  const productsThisMonth = Number(row.products_this_month || 0);

  const totalUsers = Number(row.total_users || 0);
  const usersThisMonth = Number(row.users_this_month || 0);
  const usersLastMonth = Number(row.users_last_month || 0);

  const lowStockCount = Number(row.low_stock_count || 0);

  return {
    totalRevenue,
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
}

// In-process memory cache (Tier 1: <1ms instant response)
const MEM_CACHE_TTL_MS = 60 * 1000; // 60 seconds
let memCache = {
  stats: null,
  statsExpiry: 0,
  overview: null,
  overviewExpiry: 0,
};

export const invalidateDashboardCache = () => {
  memCache = {
    stats: null,
    statsExpiry: 0,
    overview: null,
    overviewExpiry: 0,
  };
  redisService.del("dashboard:stats").catch(() => {});
  redisService.del("dashboard:overview").catch(() => {});
};

export const getDashboardStats = async (req, res, next) => {
  try {
    const now = Date.now();
    if (memCache.stats && memCache.statsExpiry > now) {
      res.setHeader("X-Cache", "MEM-HIT");
      return ok(res, memCache.stats, { message: "Lấy thống kê bảng điều khiển thành công" });
    }

    const { data, isCached } = await redisService.getOrSet("dashboard:stats", async () => {
      const statsRes = await pool.query(DASHBOARD_STATS_QUERY);
      return mapStatsRow(statsRes.rows[0]);
    }, 180);

    memCache.stats = data;
    memCache.statsExpiry = Date.now() + MEM_CACHE_TTL_MS;

    if (isCached) res.setHeader("X-Cache", "REDIS-HIT");
    return ok(res, data, { message: "Lấy thống kê bảng điều khiển thành công" });
  } catch (error) {
    logger.error("[admin-dashboard] getDashboardStats error:", error);
    next(error);
  }
};

export const getDashboardOverview = async (req, res, next) => {
  try {
    const now = Date.now();
    if (memCache.overview && memCache.overviewExpiry > now) {
      res.setHeader("X-Cache", "MEM-HIT");
      return ok(res, memCache.overview, { message: "Lấy tổng quan bảng điều khiển thành công" });
    }

    const { data, isCached } = await redisService.getOrSet("dashboard:overview", async () => {
      // Run 3 optimized queries concurrently instead of 6 queries
      const [statsRes, recentOrdersRes, lowStockRes] = await Promise.all([
        pool.query(DASHBOARD_STATS_QUERY),
        pool.query(RECENT_ORDERS_QUERY),
        pool.query(LOW_STOCK_QUERY),
      ]);

      const stats = mapStatsRow(statsRes.rows[0]);

      return {
        stats,
        orders: recentOrdersRes.rows || [],
        inventory: lowStockRes.rows || [],
      };
    }, 180);

    memCache.overview = data;
    memCache.overviewExpiry = Date.now() + MEM_CACHE_TTL_MS;

    if (isCached) res.setHeader("X-Cache", "REDIS-HIT");
    return ok(res, data, { message: "Lấy tổng quan bảng điều khiển thành công" });
  } catch (error) {
    logger.error("[admin-dashboard] getDashboardOverview error:", error);
    next(error);
  }
};
