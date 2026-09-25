import { describe, test } from "node:test";
import assert from "node:assert/strict";
import {
  validateCreateCollection,
  validateUpdateCollection,
  validateUpdateCollectionStatus,
  validateAddProductToCollection,
  validateReorderCollectionProducts,
} from "../../../src/utils/validation.js";

describe("collection validation primitives", () => {
  test("validateCreateCollection validates required name, optional dates and range", () => {
    assert.equal(validateCreateCollection({}).ok, false);
    assert.equal(validateCreateCollection(null).ok, false);
    assert.equal(validateCreateCollection({ name_collection: "   " }).ok, false);
    assert.equal(validateCreateCollection({ name_collection: "A", collection_id: 1 }).ok, false);
    assert.equal(validateCreateCollection({ name_collection: "A", created_at: "now" }).ok, false);
    assert.equal(validateCreateCollection({ name_collection: "A", updated_at: "now" }).ok, false);

    assert.equal(validateCreateCollection({ name_collection: "A", slug_collection: 123 }).ok, false);
    assert.equal(validateCreateCollection({ name_collection: "A", description_collection: 123 }).ok, false);
    assert.equal(validateCreateCollection({ name_collection: "A", image_collection: 123 }).ok, false);
    assert.equal(validateCreateCollection({ name_collection: "A", position_collection: -5 }).ok, false);
    assert.equal(validateCreateCollection({ name_collection: "A", position_collection: "abc" }).ok, false);
    assert.equal(validateCreateCollection({ name_collection: "A", is_active: "yes" }).ok, false);
    assert.equal(validateCreateCollection({ name_collection: "A", start_at: "invalid-date" }).ok, false);
    assert.equal(validateCreateCollection({ name_collection: "A", end_at: "invalid-date" }).ok, false);
    assert.equal(validateCreateCollection({ name_collection: "A", start_at: "2026-10-01", end_at: "2026-09-01" }).ok, false);

    const valid = validateCreateCollection({
      name_collection: "Summer Drop 2026",
      slug_collection: "summer-drop",
      description_collection: "Summer drop description",
      image_collection: "https://example.com/banner.jpg",
      position_collection: 1,
      is_active: true,
      start_at: "2026-06-01T00:00:00Z",
      end_at: "2026-08-31T23:59:59Z",
    });
    assert.equal(valid.ok, true);
    assert.equal(valid.value.name_collection, "Summer Drop 2026");
    assert.equal(valid.value.slug_collection, "summer-drop");
    assert.equal(valid.value.position_collection, 1);
    assert.equal(valid.value.is_active, true);
  });

  test("validateUpdateCollection validates partial updates, nullables and date bounds", () => {
    assert.equal(validateUpdateCollection({}).ok, false);
    assert.equal(validateUpdateCollection({ collection_id: 1 }).ok, false);
    assert.equal(validateUpdateCollection({ name_collection: "" }).ok, false);
    assert.equal(validateUpdateCollection({ slug_collection: "" }).ok, false);
    assert.equal(validateUpdateCollection({ description_collection: 123 }).ok, false);
    assert.equal(validateUpdateCollection({ image_collection: 123 }).ok, false);
    assert.equal(validateUpdateCollection({ position_collection: -1 }).ok, false);
    assert.equal(validateUpdateCollection({ is_active: "yes" }).ok, false);
    assert.equal(validateUpdateCollection({ start_at: "invalid" }).ok, false);
    assert.equal(validateUpdateCollection({ end_at: "invalid" }).ok, false);
    assert.equal(validateUpdateCollection({ start_at: "2026-10-01", end_at: "2026-09-01" }).ok, false);

    const valid = validateUpdateCollection({
      name_collection: "Dragon Ball Z",
      slug_collection: "dbz-updated",
      description_collection: null,
      image_collection: null,
      position_collection: 3,
      is_active: false,
      start_at: null,
      end_at: null,
    });
    assert.equal(valid.ok, true);
    assert.equal(valid.value.name_collection, "Dragon Ball Z");
    assert.equal(valid.value.slug_collection, "dbz-updated");
    assert.equal(valid.value.description_collection, null);
    assert.equal(valid.value.image_collection, null);
    assert.equal(valid.value.position_collection, 3);
    assert.equal(valid.value.is_active, false);
    assert.equal(valid.value.start_at, null);
    assert.equal(valid.value.end_at, null);
  });

  test("validateUpdateCollectionStatus validates boolean is_active", () => {
    assert.equal(validateUpdateCollectionStatus({}).ok, false);
    assert.equal(validateUpdateCollectionStatus({ is_active: "true" }).ok, false);
    assert.equal(validateUpdateCollectionStatus({ is_active: true }).ok, true);
    assert.equal(validateUpdateCollectionStatus({ is_active: false }).ok, true);
  });

  test("validateAddProductToCollection supports single and batch addition with errors", () => {
    assert.equal(validateAddProductToCollection(null).ok, false);
    assert.equal(validateAddProductToCollection({}).ok, false);
    assert.equal(validateAddProductToCollection({ product_id: -1 }).ok, false);
    assert.equal(validateAddProductToCollection({ product_id: 1, position_product_collection: -1 }).ok, false);

    // Batch validation errors
    assert.equal(validateAddProductToCollection({ products: [] }).ok, false);
    assert.equal(validateAddProductToCollection({ products: ["invalid"] }).ok, false);
    assert.equal(validateAddProductToCollection({ products: [{ product_id: -1 }] }).ok, false);
    assert.equal(validateAddProductToCollection({ products: [{ product_id: 1 }, { product_id: 1 }] }).ok, false);
    assert.equal(validateAddProductToCollection({ products: [{ product_id: 1, position_product_collection: -5 }] }).ok, false);

    const validSingle = validateAddProductToCollection({ product_id: 100, position_product_collection: 2 });
    assert.equal(validSingle.ok, true);
    assert.equal(validSingle.value.product_id, 100);
    assert.equal(validSingle.value.position_product_collection, 2);

    const validBatch = validateAddProductToCollection({
      products: [
        { product_id: 100, position_product_collection: 1 },
        { product_id: 101 },
      ],
    });
    assert.equal(validBatch.ok, true);
    assert.equal(validBatch.value.products.length, 2);
    assert.equal(validBatch.value.products[1].position_product_collection, 0);
  });

  test("validateReorderCollectionProducts validates array and unique products with errors", () => {
    assert.equal(validateReorderCollectionProducts(null).ok, false);
    assert.equal(validateReorderCollectionProducts({}).ok, false);
    assert.equal(validateReorderCollectionProducts({ products: [] }).ok, false);
    assert.equal(validateReorderCollectionProducts({ products: ["invalid"] }).ok, false);
    assert.equal(validateReorderCollectionProducts({ products: [{ product_id: -1 }] }).ok, false);
    assert.equal(validateReorderCollectionProducts({ products: [{ product_id: 1, position_product_collection: -1 }] }).ok, false);

    const duplicate = validateReorderCollectionProducts({
      products: [
        { product_id: 1, position_product_collection: 1 },
        { product_id: 1, position_product_collection: 2 },
      ],
    });
    assert.equal(duplicate.ok, false);

    const valid = validateReorderCollectionProducts({
      products: [
        { product_id: 1, position_product_collection: 2 },
        { product_id: 2, position_product_collection: 1 },
      ],
    });
    assert.equal(valid.ok, true);
    assert.equal(valid.value.products.length, 2);
  });
});
