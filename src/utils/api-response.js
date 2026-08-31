export const ok = (res, data, { status = 200, code = "OK", message = "Thành công" } = {}) =>
  res.status(status).json({ success: true, code, message, data });

export const created = (res, data, { code = "CREATED", message = "Tạo mới thành công" } = {}) =>
  ok(res, data, { status: 201, code, message });

export const fail = (res, { statusCode = 500, code = "INTERNAL_ERROR", message = "Lỗi hệ thống", details }) => {
  const body = { success: false, code, message };
  if (details) body.errors = details;
  return res.status(statusCode).json(body);
};

