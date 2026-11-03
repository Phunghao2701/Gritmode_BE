export const aggregateInventoryAdjustments = (items = [], getQuantity = (item) => item.quantity) => {
  const quantitiesByVariant = new Map();

  for (const item of items) {
    const productVariantId = Number(item?.product_variant_id);
    const quantity = Number(getQuantity(item));
    if (!item?.product_variant_id || !Number.isSafeInteger(productVariantId) || productVariantId <= 0) {
      continue;
    }
    if (!Number.isSafeInteger(quantity)) continue;
    if (quantity <= 0) continue;

    quantitiesByVariant.set(
      productVariantId,
      (quantitiesByVariant.get(productVariantId) || 0) + quantity,
    );
  }

  return [...quantitiesByVariant.entries()]
    .sort(([leftId], [rightId]) => leftId - rightId)
    .map(([product_variant_id, quantity]) => ({ product_variant_id, quantity }));
};

export const getMissingInventoryAdjustments = (adjustments = [], updatedRows = []) => {
  const updatedVariantIds = new Set(
    updatedRows.map((row) => Number(row.product_variant_id)),
  );
  return adjustments.filter(({ product_variant_id }) => !updatedVariantIds.has(Number(product_variant_id)));
};
