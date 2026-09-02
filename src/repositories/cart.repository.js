import pool from "../config/database.js";
import { AppError } from "../errors/app-error.js";

export const cartRepository = {
  async findActiveByOwner(owner, client) {
    const db = client || pool;
    const { rows } = owner.type === "user"
      ? await db.query(`SELECT cart_id,user_id,guest_token,status_cart,created_at,updated_at FROM cart WHERE user_id=$1 AND status_cart='active' LIMIT 1`, [owner.userId])
      : await db.query(`SELECT cart_id,user_id,guest_token,status_cart,created_at,updated_at FROM cart WHERE guest_token=$1 AND status_cart='active' LIMIT 1`, [owner.guestToken]);
    return rows[0] || null;
  },

  async create(owner, client) {
    const db = client || pool;
    if (owner.type === "guest" && owner.guestToken) {
      const existing = await db.query(
        `SELECT cart_id, user_id, guest_token, status_cart, created_at, updated_at
         FROM cart WHERE guest_token = $1 LIMIT 1`,
        [owner.guestToken],
      );
      if (existing.rows[0]) {
        const reactivated = await db.query(
          `UPDATE cart SET status_cart = 'active', updated_at = NOW()
           WHERE cart_id = $1
           RETURNING cart_id, user_id, guest_token, status_cart, created_at, updated_at`,
          [existing.rows[0].cart_id],
        );
        if (existing.rows[0].status_cart !== "active") {
          await db.query(`DELETE FROM cart_item WHERE cart_id = $1`, [existing.rows[0].cart_id]);
        }
        return reactivated.rows[0];
      }
    }
    const values = owner.type === "user" ? [owner.userId, null] : [null, owner.guestToken];
    const { rows } = await db.query(
      `INSERT INTO cart (user_id,guest_token,status_cart,created_at,updated_at)
       VALUES ($1,$2,'active',NOW(),NOW())
       RETURNING cart_id,user_id,guest_token,status_cart,created_at,updated_at`, values,
    );
    return rows[0];
  },

  async lockInventory(variantId, client) {
    const { rows } = await (client || pool).query(
      `SELECT quantity_stock-quantity_reserved AS quantity_available
       FROM inventory WHERE product_variant_id=$1 FOR UPDATE`, [variantId],
    );
    return rows[0] || null;
  },

  async findItem(cartId, variantId, client) {
    const { rows } = await (client || pool).query(
      `SELECT cart_item_id,cart_id,product_variant_id,quantity_cart_item
       FROM cart_item WHERE cart_id=$1 AND product_variant_id=$2 FOR UPDATE`, [cartId, variantId],
    );
    return rows[0] || null;
  },

  async findItemByIdAndCart(cartItemId, cartId, client) {
    const { rows } = await (client || pool).query(
      `SELECT cart_item_id,cart_id,product_variant_id,quantity_cart_item
       FROM cart_item WHERE cart_item_id=$1 AND cart_id=$2 FOR UPDATE`, [cartItemId, cartId],
    );
    return rows[0] || null;
  },

  async upsertItem(cartId, variantId, quantity, client) {
    const { rows } = await (client || pool).query(
      `INSERT INTO cart_item (cart_id,product_variant_id,quantity_cart_item,created_at,updated_at)
       VALUES ($1,$2,$3,NOW(),NOW())
       ON CONFLICT (cart_id,product_variant_id) DO UPDATE
       SET quantity_cart_item=EXCLUDED.quantity_cart_item,updated_at=NOW()
       RETURNING cart_item_id,cart_id,product_variant_id,quantity_cart_item`,
      [cartId, variantId, quantity],
    );
    return rows[0];
  },

  async updateItemQuantity(cartItemId, cartId, quantity, client) {
    const { rows } = await (client || pool).query(
      `UPDATE cart_item SET quantity_cart_item=$3,updated_at=NOW()
       WHERE cart_item_id=$1 AND cart_id=$2 RETURNING cart_item_id`, [cartItemId, cartId, quantity],
    );
    return rows[0] || null;
  },

  async removeItem(cartItemId, cartId, client) {
    const { rowCount } = await (client || pool).query(
      `DELETE FROM cart_item WHERE cart_item_id=$1 AND cart_id=$2`, [cartItemId, cartId],
    );
    return rowCount > 0;
  },

  async clearItems(cartId, client) {
    await (client || pool).query(`DELETE FROM cart_item WHERE cart_id=$1`, [cartId]);
  },

  async getDetailedItems(cartId, client) {
    const { rows } = await (client || pool).query(
      `SELECT ci.cart_item_id,p.product_id,pv.product_variant_id,p.name_product,pv.sku,
              pv.price AS original_price,
              CASE WHEN pv.sale_price IS NOT NULL AND pv.sale_price < pv.price
                AND (pv.sale_start_at IS NULL OR pv.sale_start_at <= NOW())
                AND (pv.sale_end_at IS NULL OR pv.sale_end_at > NOW())
                THEN pv.sale_price ELSE pv.price END AS price,
              ci.quantity_cart_item AS quantity,
              COALESCE(inv.quantity_stock-inv.quantity_reserved,0) AS quantity_available,
              opts.variant,img.url_product_image AS image
       FROM cart_item ci
       JOIN product_variant pv ON pv.product_variant_id=ci.product_variant_id
       JOIN product p ON p.product_id=pv.product_id
       LEFT JOIN inventory inv ON inv.product_variant_id=pv.product_variant_id
       LEFT JOIN LATERAL (
         SELECT string_agg(pov.value_option,' / ' ORDER BY po.product_option_id) AS variant
         FROM product_variant_option_value pvov
         JOIN product_option_value pov ON pov.product_option_value_id=pvov.product_option_value_id
         JOIN product_option po ON po.product_option_id=pov.product_option_id
         WHERE pvov.product_variant_id=pv.product_variant_id
       ) opts ON true
       LEFT JOIN LATERAL (
         SELECT pi.url_product_image
         FROM product_image pi
         WHERE pi.product_id=p.product_id
         ORDER BY CASE
           WHEN pi.product_option_value_id IN (
             SELECT product_option_value_id FROM product_variant_option_value WHERE product_variant_id=pv.product_variant_id
           ) THEN 0 WHEN pi.product_option_value_id IS NULL THEN 1 ELSE 2 END,
           pi.position_product_image,pi.product_image_id
         LIMIT 1
       ) img ON true
       WHERE ci.cart_id=$1 ORDER BY ci.created_at ASC,ci.cart_item_id ASC`, [cartId],
    );
    return rows;
  },

  async mergeGuestCart({ guestToken, userId }, client = pool) {
    const db = client || pool;
    const guestResult = await db.query(
      `SELECT cart_id FROM cart WHERE guest_token=$1 AND user_id IS NULL AND status_cart='active' FOR UPDATE`, [guestToken],
    );
    if (!guestResult.rowCount) return null;
    const guestCartId = guestResult.rows[0].cart_id;
    let userResult = await db.query(
      `SELECT cart_id FROM cart WHERE user_id=$1 AND status_cart='active' FOR UPDATE`, [userId],
    );
    if (!userResult.rowCount) {
      userResult = await db.query(
        `INSERT INTO cart (user_id,status_cart,created_at,updated_at) VALUES ($1,'active',NOW(),NOW()) RETURNING cart_id`, [userId],
      );
    }
    const userCartId = userResult.rows[0].cart_id;
    const { rows: items } = await db.query(
      `SELECT ci.product_variant_id,ci.quantity_cart_item,COALESCE(existing.quantity_cart_item,0) AS user_quantity,
        i.quantity_stock-i.quantity_reserved AS available
       FROM cart_item ci
       LEFT JOIN cart_item existing ON existing.cart_id=$2 AND existing.product_variant_id=ci.product_variant_id
       JOIN inventory i ON i.product_variant_id=ci.product_variant_id
       WHERE ci.cart_id=$1 FOR UPDATE OF i`, [guestCartId, userCartId],
    );
    if (items.some((item) => Number(item.quantity_cart_item) + Number(item.user_quantity) > Number(item.available))) {
      throw new AppError(409, "CART_MERGE_INVENTORY_EXCEEDED", "Số lượng sau khi gộp vượt tồn kho");
    }
    for (const item of items) {
      await db.query(
        `INSERT INTO cart_item (cart_id,product_variant_id,quantity_cart_item,created_at,updated_at)
         VALUES ($1,$2,$3,NOW(),NOW()) ON CONFLICT (cart_id,product_variant_id)
         DO UPDATE SET quantity_cart_item=cart_item.quantity_cart_item+EXCLUDED.quantity_cart_item,updated_at=NOW()`,
        [userCartId, item.product_variant_id, item.quantity_cart_item],
      );
    }
    // Delete moved items from guest cart and mark it abandoned without nulling guest_token (preserves ck_cart_exactly_one_owner)
    await db.query(`DELETE FROM cart_item WHERE cart_id=$1`, [guestCartId]);
    await db.query(`UPDATE cart SET status_cart='abandoned',updated_at=NOW() WHERE cart_id=$1`, [guestCartId]);
    return userCartId;
  },

  async updateStatus(cartId, status, client) {
    const db = client || pool;
    const { rows } = await db.query(
      `UPDATE cart SET status_cart = $2, updated_at = NOW() WHERE cart_id = $1 RETURNING cart_id, status_cart`,
      [cartId, status],
    );
    return rows[0] || null;
  },
};
