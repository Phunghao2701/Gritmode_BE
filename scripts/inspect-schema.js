import "dotenv/config";
import pool from "../src/config/database.js";

try {
  const { rows } = await pool.query(`
    SELECT table_name, column_name, data_type
    FROM information_schema.columns
    WHERE table_schema = 'public'
    ORDER BY table_name, ordinal_position
  `);

  const tables = rows.reduce((result, row) => {
    if (!result[row.table_name]) result[row.table_name] = [];
    result[row.table_name].push({ column: row.column_name, type: row.data_type });
    return result;
  }, {});

  console.log(JSON.stringify(tables, null, 2));
} catch (error) {
  console.error("SCHEMA_INSPECT_ERROR:", error.stack || error.message || error);
  process.exitCode = 1;
} finally {
  await pool.end();
}
