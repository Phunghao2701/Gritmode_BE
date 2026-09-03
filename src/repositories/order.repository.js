import pool from "../config/database.js";

const runner = (client) => client || pool;

const orderColumns = `
  order_id,
  order_code,
  user_id,
  cart_id,
  voucher_id,
  code_voucher_order,
  email_order,
  phone_order,
  status_order,
  subtotal_order,
  discount_order,
  shipping_fee_order,
  total_order,
  note_order,
  created_at,
  updated_at
`;

export const orderRepository = {
  async createOrder(data, client) {
    const query = `
      INSERT INTO "order" (
        order_code,
        user_id,
        cart_id,
        voucher_id,
        code_voucher_order,
        email_order,
        phone_order,
        status_order,
        subtotal_order,
        discount_order,
        shipping_fee_order,
        total_order,
        note_order,
        created_at,
        updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, NOW(), NOW())
      RETURNING ${orderColumns}
    `;
    const values = [
      data.order_code,
      data.user_id || null,
      data.cart_id || null,
      data.voucher_id || null,
      data.code_voucher_order || null,
      data.email_order,
      data.phone_order,
      data.status_order || "pending",
      data.subtotal_order || 0,
      data.discount_order || 0,
      data.shipping_fee_order || 0,
      data.total_order || 0,
      data.note_order || null,
    ];
    const { rows } = await runner(client).query(query, values);
    return rows[0];
  },

  async createOrderItems(items = [], client) {
    if (!items.length) return [];
    const inserted = [];
    for (const item of items) {
      const query = `
        INSERT INTO order_item (
          order_id,
          product_variant_id,
          name_product_order_item,
          sku_order_item,
          variant_order_item,
          price_order_item,
          quantity_order_item,
          total_order_item,
          created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
        RETURNING order_item_id, order_id, product_variant_id, name_product_order_item, sku_order_item,
                  variant_order_item, price_order_item, quantity_order_item, total_order_item, created_at
      `;
      const values = [
        item.order_id,
        item.product_variant_id || null,
        item.name_product_order_item,
        item.sku_order_item || null,
        item.variant_order_item || null,
        item.price_order_item,
        item.quantity_order_item,
        item.total_order_item,
      ];
      const { rows } = await runner(client).query(query, values);
      inserted.push(rows[0]);
    }
    return inserted;
  },

  async createOrderAddress(addr, client) {
    const query = `
      INSERT INTO order_address (
        order_id,
        receiver_name_order_address,
        phone_order_address,
        address_line_order_address,
        ward_order_address,
        district_order_address,
        province_order_address,
        created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
      RETURNING order_address_id, order_id, receiver_name_order_address, phone_order_address,
                address_line_order_address, ward_order_address, district_order_address,
                province_order_address, created_at
    `;
    const values = [
      addr.order_id,
      addr.receiver_name_order_address,
      addr.phone_order_address,
      addr.address_line_order_address,
      addr.ward_order_address || null,
      addr.district_order_address || null,
      addr.province_order_address || null,
    ];
    const { rows } = await runner(client).query(query, values);
    return rows[0];
  },

  async findById(orderId, client) {
    const { rows } = await runner(client).query(
      `SELECT ${orderColumns} FROM "order" WHERE order_id = $1`,
      [orderId],
    );
    return rows[0] || null;
  },

  async findByOrderCode(orderCode, client) {
    const { rows } = await runner(client).query(
      `SELECT ${orderColumns} FROM "order" WHERE order_code = $1`,
      [orderCode],
    );
    return rows[0] || null;
  },

  async findUserOrders({ userId, status_order, page = 1, limit = 10 }, client) {
    const offset = (page - 1) * limit;
    const conditions = [`o.user_id = $1`];
    const values = [userId];
    let idx = 2;

    if (status_order) {
      conditions.push(`o.status_order = $${idx}`);
      values.push(status_order);
      idx += 1;
    }

    const whereClause = conditions.join(" AND ");
    const query = `
      SELECT
        o.order_id,
        o.order_code,
        o.status_order,
        o.subtotal_order,
        o.discount_order,
        o.shipping_fee_order,
        o.total_order,
        o.created_at,
        p.payment_method,
        p.status_payment
      FROM "order" o
      LEFT JOIN payment p ON p.order_id = o.order_id
      WHERE ${whereClause}
      ORDER BY o.created_at DESC
      LIMIT $${idx} OFFSET $${idx + 1}
    `;
    values.push(limit, offset);
    const { rows } = await runner(client).query(query, values);
    return rows;
  },

  async countUserOrders({ userId, status_order }, client) {
    const conditions = [`user_id = $1`];
    const values = [userId];
    let idx = 2;

    if (status_order) {
      conditions.push(`status_order = $${idx}`);
      values.push(status_order);
      idx += 1;
    }

    const query = `SELECT COUNT(*) AS count FROM "order" WHERE ${conditions.join(" AND ")}`;
    const { rows } = await runner(client).query(query, values);
    return parseInt(rows[0]?.count || "0", 10);
  },

  async findOrderItems(orderId, client) {
    const query = `
      SELECT
        order_item_id,
        order_id,
        product_variant_id,
        name_product_order_item,
        sku_order_item,
        variant_order_item,
        price_order_item,
        quantity_order_item,
        total_order_item,
        (SELECT pi.url_product_image FROM product_image pi
         JOIN product_variant pv ON pv.product_id = pi.product_id
         WHERE pv.product_variant_id = order_item.product_variant_id
         ORDER BY pi.position_product_image ASC, pi.product_image_id ASC LIMIT 1) AS image_product,
        created_at
      FROM order_item
      WHERE order_id = $1
      ORDER BY order_item_id ASC
    `;
    const { rows } = await runner(client).query(query, [orderId]);
    return rows;
  },

  async findOrderAddress(orderId, client) {
    const query = `
      SELECT
        order_address_id,
        order_id,
        receiver_name_order_address,
        phone_order_address,
        address_line_order_address,
        ward_order_address,
        district_order_address,
        province_order_address,
        created_at
      FROM order_address
      WHERE order_id = $1
    `;
    const { rows } = await runner(client).query(query, [orderId]);
    return rows[0] || null;
  },

  async findUserOrderById(orderId, userId, client) {
    const query = `SELECT ${orderColumns} FROM "order" WHERE order_id = $1 AND user_id = $2`;
    const { rows } = await runner(client).query(query, [orderId, userId]);
    const order = rows[0];
    if (!order) return null;

    const [items, address, paymentRes] = await Promise.all([
      this.findOrderItems(orderId, client),
      this.findOrderAddress(orderId, client),
      runner(client).query(`SELECT * FROM payment WHERE order_id = $1`, [orderId]),
    ]);

    return {
      ...order,
      order_id: Number(order.order_id),
      subtotal_order: Number(order.subtotal_order),
      discount_order: Number(order.discount_order),
      shipping_fee_order: Number(order.shipping_fee_order),
      total_order: Number(order.total_order),
      items: items.map((i) => ({
        ...i,
        order_item_id: Number(i.order_item_id),
        order_id: Number(i.order_id),
        product_variant_id: i.product_variant_id ? Number(i.product_variant_id) : null,
        price_order_item: Number(i.price_order_item),
        quantity_order_item: Number(i.quantity_order_item),
        total_order_item: Number(i.total_order_item),
      })),
      address,
      payment: paymentRes.rows[0] || null,
    };
  },

  async findGuestOrder({ orderCode, email, phone }, client) {
    const query = `
      SELECT ${orderColumns}
      FROM "order"
      WHERE order_code = $1
        AND LOWER(email_order) = LOWER($2)
        AND phone_order = $3
    `;
    const { rows } = await runner(client).query(query, [orderCode, email, phone]);
    const order = rows[0];
    if (!order) return null;

    const [items, address, paymentRes] = await Promise.all([
      this.findOrderItems(order.order_id, client),
      this.findOrderAddress(order.order_id, client),
      runner(client).query(`SELECT * FROM payment WHERE order_id = $1`, [order.order_id]),
    ]);

    return {
      ...order,
      order_id: Number(order.order_id),
      subtotal_order: Number(order.subtotal_order),
      discount_order: Number(order.discount_order),
      shipping_fee_order: Number(order.shipping_fee_order),
      total_order: Number(order.total_order),
      items: items.map((i) => ({
        ...i,
        order_item_id: Number(i.order_item_id),
        order_id: Number(i.order_id),
        product_variant_id: i.product_variant_id ? Number(i.product_variant_id) : null,
        price_order_item: Number(i.price_order_item),
        quantity_order_item: Number(i.quantity_order_item),
        total_order_item: Number(i.total_order_item),
      })),
      address,
      payment: paymentRes.rows[0] || null,
    };
  },

  async updateOrderStatus(orderId, status, client) {
    const query = `
      UPDATE "order"
      SET status_order = $2, updated_at = NOW()
      WHERE order_id = $1
      RETURNING ${orderColumns}
    `;
    const { rows } = await runner(client).query(query, [orderId, status]);
    return rows[0] || null;
  },

  async lockOrderById(orderId, client) {
    const query = `SELECT ${orderColumns} FROM "order" WHERE order_id = $1 FOR UPDATE`;
    const { rows } = await runner(client).query(query, [orderId]);
    return rows[0] || null;
  },

  async findAdminOrders(filter = {}, client) {
    const {
      page = 1,
      limit = 20,
      search,
      status_order,
      status_payment,
      payment_method,
      from_date,
      to_date,
      sort_by = 'created_at',
      sort_order = 'desc',
    } = filter;

    const offset = (page - 1) * limit;
    const conditions = [];
    const values = [];
    let idx = 1;

    if (search) {
      conditions.push(`(o.order_code ILIKE $${idx} OR o.email_order ILIKE $${idx} OR o.phone_order ILIKE $${idx})`);
      values.push(`%${search}%`);
      idx += 1;
    }

    if (status_order) {
      conditions.push(`o.status_order = $${idx}`);
      values.push(status_order);
      idx += 1;
    }

    if (status_payment) {
      conditions.push(`p.status_payment = $${idx}`);
      values.push(status_payment);
      idx += 1;
    }

    if (payment_method) {
      conditions.push(`p.payment_method = $${idx}`);
      values.push(payment_method);
      idx += 1;
    }

    if (from_date) {
      conditions.push(`o.created_at >= $${idx}`);
      values.push(from_date);
      idx += 1;
    }

    if (to_date) {
      conditions.push(`o.created_at <= $${idx}`);
      values.push(to_date);
      idx += 1;
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const sortField = ['total_order', 'updated_at'].includes(sort_by) ? `o.${sort_by}` : 'o.created_at';
    const sortDirection = String(sort_order).toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

    const query = `
      SELECT
        o.order_id,
        o.order_code,
        CASE WHEN o.user_id IS NOT NULL THEN 'registered' ELSE 'guest' END AS customer_type,
        o.user_id,
        o.email_order,
        o.phone_order,
        o.status_order,
        o.subtotal_order,
        o.discount_order,
        o.shipping_fee_order,
        o.total_order,
        o.created_at,
        o.updated_at,
        p.payment_method,
        p.status_payment
      FROM "order" o
      LEFT JOIN LATERAL (SELECT payment_method, status_payment FROM payment WHERE order_id = o.order_id ORDER BY created_at DESC LIMIT 1) p ON true
      ${whereClause}
      ORDER BY ${sortField} ${sortDirection}
      LIMIT $${idx} OFFSET $${idx + 1}
    `;
    values.push(limit, offset);

    const { rows } = await runner(client).query(query, values);
    return rows;
  },

  async countAdminOrders(filter = {}, client) {
    const {
      search,
      status_order,
      status_payment,
      payment_method,
      from_date,
      to_date,
    } = filter;

    const conditions = [];
    const values = [];
    let idx = 1;

    if (search) {
      conditions.push(`(o.order_code ILIKE $${idx} OR o.email_order ILIKE $${idx} OR o.phone_order ILIKE $${idx})`);
      values.push(`%${search}%`);
      idx += 1;
    }

    if (status_order) {
      conditions.push(`o.status_order = $${idx}`);
      values.push(status_order);
      idx += 1;
    }

    if (status_payment) {
      conditions.push(`p.status_payment = $${idx}`);
      values.push(status_payment);
      idx += 1;
    }

    if (payment_method) {
      conditions.push(`p.payment_method = $${idx}`);
      values.push(payment_method);
      idx += 1;
    }

    if (from_date) {
      conditions.push(`o.created_at >= $${idx}`);
      values.push(from_date);
      idx += 1;
    }

    if (to_date) {
      conditions.push(`o.created_at <= $${idx}`);
      values.push(to_date);
      idx += 1;
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const query = `
      SELECT COUNT(*) AS count
      FROM "order" o
      LEFT JOIN payment p ON p.order_id = o.order_id
      ${whereClause}
    `;

    const { rows } = await runner(client).query(query, values);
    return parseInt(rows[0]?.count || "0", 10);
  },

  async findAdminOrderById(orderId, client) {
    const query = `SELECT ${orderColumns} FROM "order" WHERE order_id = $1`;
    const { rows } = await runner(client).query(query, [orderId]);
    const order = rows[0];
    if (!order) return null;

    const [items, address, paymentRes] = await Promise.all([
      this.findOrderItems(orderId, client),
      this.findOrderAddress(orderId, client),
      runner(client).query(`SELECT * FROM payment WHERE order_id = $1`, [orderId]),
    ]);

    return {
      ...order,
      order_id: Number(order.order_id),
      customer_type: order.user_id ? 'registered' : 'guest',
      subtotal_order: Number(order.subtotal_order),
      discount_order: Number(order.discount_order),
      shipping_fee_order: Number(order.shipping_fee_order),
      total_order: Number(order.total_order),
      items: items.map((i) => ({
        ...i,
        order_item_id: Number(i.order_item_id),
        order_id: Number(i.order_id),
        product_variant_id: i.product_variant_id ? Number(i.product_variant_id) : null,
        price_order_item: Number(i.price_order_item),
        quantity_order_item: Number(i.quantity_order_item),
        total_order_item: Number(i.total_order_item),
      })),
      address,
      payment: paymentRes.rows[0] || null,
    };
  },
};
