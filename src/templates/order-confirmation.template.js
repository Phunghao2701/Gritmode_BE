const escapeHtml = (value = "") => String(value).replace(/[&<>'"]/g, (char) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;",
}[char]));

const money = (value) => `${new Intl.NumberFormat("vi-VN").format(Number(value) || 0)} ₫`;

const fullAddress = (address = {}) => [
  address.address_line_order_address,
  address.ward_order_address,
  address.district_order_address,
  address.province_order_address,
].filter(Boolean).map(escapeHtml).join(", ");

const itemRows = (items = []) => items.map((item) => {
  const image = item.image_product
    ? `<img src="${escapeHtml(item.image_product)}" width="88" alt="${escapeHtml(item.name_product_order_item)}" style="display:block;width:88px;height:110px;object-fit:cover;background:#eeeeee;border:0">`
    : `<div style="width:88px;height:110px;line-height:110px;text-align:center;background:#eeeeee;color:#777777;font-size:11px">GRITMODE</div>`;
  return `<tr>
    <td width="104" valign="top" style="padding:18px 16px 18px 0;border-bottom:1px solid #dddddd">${image}</td>
    <td valign="top" style="padding:18px 0;border-bottom:1px solid #dddddd">
      <div style="font-size:15px;font-weight:700;line-height:21px;text-transform:uppercase">${escapeHtml(item.name_product_order_item)}</div>
      <div style="margin-top:7px;color:#666666;font-size:13px;line-height:19px">${escapeHtml(item.variant_order_item || "")}</div>
      <div style="margin-top:3px;color:#666666;font-size:13px">Số lượng: ${Number(item.quantity_order_item) || 0}</div>
      <div style="margin-top:9px;font-size:15px;font-weight:700">${money(item.total_order_item)}</div>
    </td>
  </tr>`;
}).join("");

const summaryRow = (label, value, strong = false) => `<tr>
  <td style="padding:${strong ? "16px 0 0" : "6px 0"};${strong ? "border-top:2px solid #111111;font-size:17px;font-weight:700" : "color:#555555;font-size:14px"}">${label}</td>
  <td align="right" style="padding:${strong ? "16px 0 0" : "6px 0"};${strong ? "border-top:2px solid #111111;font-size:20px;font-weight:700" : "font-size:14px"}">${money(value)}</td>
</tr>`;

export const renderOrderConfirmationEmail = (order, { frontendUrl, supportEmail, hotline } = {}) => {
  const payment = order.payment || {};
  const paid = payment.payment_method === "payos" && payment.status_payment === "paid";
  const orderCode = escapeHtml(order.order_code);
  const detailUrl = `${String(frontendUrl || "").replace(/\/$/, "")}/orders/lookup?orderCode=${encodeURIComponent(order.order_code)}`;
  const statusTitle = paid ? "THANH TOÁN THÀNH CÔNG" : "ĐƠN HÀNG ĐÃ ĐƯỢC TIẾP NHẬN";
  const statusText = paid
    ? `${money(order.total_order)} đã được ghi nhận qua PayOS / VietQR.<br>GRITMODE sẽ bắt đầu xử lý đơn hàng của bạn.`
    : "Chúng tôi đang chuẩn bị đơn hàng của bạn.<br>Bạn sẽ nhận được thông báo khi trạng thái đơn hàng thay đổi.";
  const paymentText = paid
    ? "Chuyển khoản qua PayOS / VietQR<br><strong>Trạng thái: Đã thanh toán</strong>"
    : `Thanh toán khi nhận hàng (COD)<br><strong>Trạng thái: Chưa thanh toán</strong><br><br>Bạn sẽ thanh toán ${money(order.total_order)} cho đơn vị vận chuyển khi nhận hàng.`;
  const preheader = "Cảm ơn bạn đã đặt hàng tại GRITMODE. Chúng tôi đã nhận được đơn hàng của bạn.";

  return `<!doctype html>
<html lang="vi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#eeeeee;color:#111111;font-family:Arial,Helvetica,sans-serif">
<div style="display:none;max-height:0;overflow:hidden;opacity:0">${preheader}</div>
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#eeeeee"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:600px;background:#ffffff">
  <tr><td style="padding:28px 32px;background:#111111;color:#ffffff">
    <div style="font-size:25px;font-weight:700">GRITMODE®</div><div style="margin-top:5px;font-size:10px;letter-spacing:1px">MADE IN VIETNAM</div>
  </td></tr>
  <tr><td style="padding:36px 32px 18px">
    <h1 style="margin:0;font-size:26px;line-height:32px">ĐẶT HÀNG THÀNH CÔNG</h1>
    <p style="margin:22px 0 0;font-size:15px;line-height:24px">Xin chào ${escapeHtml(order.address?.receiver_name_order_address || "bạn")},<br><br>Cảm ơn bạn đã mua sắm tại GRITMODE.<br>Đơn hàng của bạn đã được ghi nhận thành công.</p>
  </td></tr>
  <tr><td style="padding:12px 32px 24px"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f3f3f3"><tr>
    <td width="50%" valign="top" style="padding:16px;font-size:12px;color:#666666">MÃ ĐƠN HÀNG<br><strong style="display:block;margin-top:5px;color:#111111;font-size:14px">#${orderCode}</strong></td>
    <td width="50%" valign="top" style="padding:16px;font-size:12px;color:#666666">NGÀY ĐẶT<br><strong style="display:block;margin-top:5px;color:#111111;font-size:14px">${new Intl.DateTimeFormat("vi-VN", { dateStyle: "short", timeStyle: "short" }).format(new Date(order.created_at))}</strong></td>
  </tr></table></td></tr>
  <tr><td style="padding:24px 32px;background:#111111;color:#ffffff"><div style="font-size:16px;font-weight:700">${statusTitle}</div><div style="margin-top:10px;color:#dddddd;font-size:14px;line-height:22px">${statusText}</div></td></tr>
  <tr><td style="padding:30px 32px"><div style="font-size:13px;font-weight:700">SẢN PHẨM</div><table role="presentation" width="100%" cellspacing="0" cellpadding="0">${itemRows(order.items)}</table></td></tr>
  <tr><td style="padding:0 32px 30px"><table role="presentation" width="100%" cellspacing="0" cellpadding="0">
    ${summaryRow("Tạm tính", order.subtotal_order)}${summaryRow("Giảm giá", -Number(order.discount_order || 0))}${summaryRow("Phí vận chuyển", order.shipping_fee_order)}${summaryRow("Tổng thanh toán", order.total_order, true)}
  </table></td></tr>
  <tr><td style="padding:28px 32px;border-top:1px solid #dddddd"><div style="font-size:13px;font-weight:700">THÔNG TIN GIAO HÀNG</div><p style="margin:14px 0 0;font-size:14px;line-height:23px"><strong>${escapeHtml(order.address?.receiver_name_order_address)}</strong><br>${escapeHtml(order.address?.phone_order_address)}<br>${fullAddress(order.address)}</p></td></tr>
  <tr><td style="padding:0 32px 28px"><div style="font-size:13px;font-weight:700">THANH TOÁN</div><p style="margin:14px 0 0;font-size:14px;line-height:22px">${paymentText}</p></td></tr>
  <tr><td align="center" style="padding:4px 32px 36px"><a href="${escapeHtml(detailUrl)}" style="display:inline-block;padding:15px 24px;background:#111111;color:#ffffff;text-decoration:none;font-size:13px;font-weight:700">XEM CHI TIẾT ĐƠN HÀNG</a></td></tr>
  <tr><td style="padding:27px 32px;background:#f3f3f3;text-align:center;color:#555555;font-size:12px;line-height:20px"><strong style="color:#111111">CẦN HỖ TRỢ?</strong><br>${hotline ? `Hotline: ${escapeHtml(hotline)}<br>` : ""}${supportEmail ? `Email: ${escapeHtml(supportEmail)}<br>` : ""}<br><strong style="color:#111111">GRITMODE®</strong><br>Designed for Vietnamese Street Culture<br>© ${new Date().getFullYear()} GRITMODE. All rights reserved.</td></tr>
</table></td></tr></table></body></html>`;
};

export const orderConfirmationText = (order) => `GRITMODE - Xác nhận đơn hàng #${order.order_code}\nTổng thanh toán: ${money(order.total_order)}\nTra cứu đơn hàng trên website GRITMODE.`;
