const positiveInteger = (value) => Number.isInteger(Number(value)) && Number(value) > 0;

export const validateAddCartItem = (input = {}) => {
  const errors = [];
  if (!input || typeof input !== "object") {
    return { ok: false, errors: [{ field: "body", message: "Dữ liệu không hợp lệ" }] };
  }

  if (!positiveInteger(input.product_variant_id)) {
    errors.push({ field: "product_variant_id", message: "product_variant_id phải là số nguyên dương" });
  }

  const rawQty = input.quantity ?? input.quantity_cart_item;
  if (!positiveInteger(rawQty)) {
    errors.push({ field: "quantity", message: "quantity hoặc quantity_cart_item phải là số nguyên dương" });
  }

  return errors.length
    ? { ok: false, errors }
    : {
        ok: true,
        value: {
          product_variant_id: Number(input.product_variant_id),
          quantity: Number(rawQty),
        },
      };
};

export const validateUpdateCartItem = (input = {}) => {
  const errors = [];
  if (!input || typeof input !== "object") {
    return { ok: false, errors: [{ field: "body", message: "Dữ liệu không hợp lệ" }] };
  }

  const rawQty = input.quantity ?? input.quantity_cart_item;
  if (!positiveInteger(rawQty)) {
    errors.push({ field: "quantity", message: "quantity hoặc quantity_cart_item phải là số nguyên dương" });
  }

  const extra = Object.keys(input).filter((key) => key !== "quantity" && key !== "quantity_cart_item");
  for (const field of extra) {
    errors.push({ field, message: `Không hỗ trợ trường ${field}` });
  }

  return errors.length
    ? { ok: false, errors }
    : {
        ok: true,
        value: {
          quantity: Number(rawQty),
        },
      };
};

export const validateCartItemId = (value) => {
  if (!positiveInteger(value)) {
    const error = new Error("cartItemId phải là số nguyên dương");
    error.statusCode = 400;
    error.code = "VALIDATION_ERROR";
    error.isOperational = true;
    throw error;
  }
  return Number(value);
};

export const isValidGuestToken = (value) => typeof value === "string" && /^[A-Za-z0-9_-]{16,255}$/.test(value);
