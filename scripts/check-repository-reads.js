import "dotenv/config";
import pool from "../src/config/database.js";

const requiredColumns = {
  order: ["order_id", "order_code", "user_id", "status_order"],
  payment: ["payment_id", "order_id", "status_payment", "created_at"],
  admin_audit_log: ["admin_audit_log_id", "user_id", "action_admin_audit_log"],
  product: ["product_id", "name_product", "status_product"],
  product_variant: ["product_variant_id", "product_id", "sku"],
  category: ["category_id", "slug_category"],
  collection: ["collection_id", "slug_collection"],
};

try {
  const tableNames = Object.keys(requiredColumns);
  const { rows } = await pool.query(
    `SELECT table_name, column_name
     FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = ANY($1::text[])`,
    [tableNames],
  );

  const existing = new Map();
  for (const row of rows) {
    if (!existing.has(row.table_name)) existing.set(row.table_name, new Set());
    existing.get(row.table_name).add(row.column_name);
  }

  const missing = [];
  for (const [table, columns] of Object.entries(requiredColumns)) {
    const actual = existing.get(table) || new Set();
    for (const column of columns) {
      if (!actual.has(column)) missing.push(`${table}.${column}`);
    }
  }

  if (missing.length) {
    console.error("SCHEMA_CHECK_FAILED: missing columns");
    missing.forEach((column) => console.error(`- ${column}`));
    process.exitCode = 1;
  } else {
    console.log(`SCHEMA_CHECK_OK: ${tableNames.length} tables and ${Object.values(requiredColumns).flat().length} columns verified`);
  }
} catch (error) {
  console.error("SCHEMA_CHECK_ERROR:", error.stack || error.message || error);
  process.exitCode = 1;
} finally {
  await pool.end();
}
