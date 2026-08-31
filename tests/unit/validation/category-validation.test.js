import { describe, test } from "node:test";
import assert from "node:assert/strict";
import {
  slugify,
  validateCreateCategory,
  validateUpdateCategory,
  validateUpdateCategoryStatus,
  validateAssignProductCategory,
} from "../../../src/utils/validation.js";

describe("category validation primitives", () => {
  test("slugify normalizes vietnamese and special characters", () => {
    assert.equal(slugify("Áo Thun Nam"), "ao-thun-nam");
    assert.equal(slugify("Đồ Bơi & Phụ Kiện!"), "do-boi-phu-kien");
    assert.equal(slugify("  Graphic   T-Shirts  "), "graphic-t-shirts");
  });

  test("validateCreateCategory validates required name, optional parent and slug", () => {
    const invalidEmpty = validateCreateCategory({});
    assert.equal(invalidEmpty.ok, false);

    const invalidForbidden = validateCreateCategory({
      name_category: "Tops",
      category_id: 1,
    });
    assert.equal(invalidForbidden.ok, false);

    const valid = validateCreateCategory({
      name_category: "Tops",
      parent_category_id: 1,
      description_category: "Tops category",
      position_category: 2,
      is_active: true,
    });
    assert.equal(valid.ok, true);
    assert.equal(valid.value.name_category, "Tops");
    assert.equal(valid.value.slug_category, "tops");
    assert.equal(valid.value.parent_category_id, 1);
    assert.equal(valid.value.position_category, 2);
    assert.equal(valid.value.is_active, true);
  });

  test("validateUpdateCategory validates partial updates and rejects empty body", () => {
    const empty = validateUpdateCategory({});
    assert.equal(empty.ok, false);

    const invalidForbidden = validateUpdateCategory({ category_id: 1 });
    assert.equal(invalidForbidden.ok, false);

    const valid = validateUpdateCategory({
      name_category: "Bottoms",
      parent_category_id: null,
      is_active: false,
    });
    assert.equal(valid.ok, true);
    assert.equal(valid.value.name_category, "Bottoms");
    assert.equal(valid.value.parent_category_id, null);
    assert.equal(valid.value.is_active, false);
  });

  test("validateUpdateCategoryStatus validates boolean is_active", () => {
    assert.equal(validateUpdateCategoryStatus({}).ok, false);
    assert.equal(validateUpdateCategoryStatus({ is_active: "true" }).ok, false);
    assert.equal(validateUpdateCategoryStatus({ is_active: true }).ok, true);
    assert.equal(validateUpdateCategoryStatus({ is_active: false }).ok, true);
  });

  test("validateAssignProductCategory validates single and batch assignments", () => {
    const invalidSingle = validateAssignProductCategory({});
    assert.equal(invalidSingle.ok, false);

    const validSingle = validateAssignProductCategory({ category_id: 5, is_primary: true });
    assert.equal(validSingle.ok, true);
    assert.equal(validSingle.value.category_id, 5);
    assert.equal(validSingle.value.is_primary, true);

    const invalidMultiplePrimary = validateAssignProductCategory({
      categories: [
        { category_id: 1, is_primary: true },
        { category_id: 2, is_primary: true },
      ],
    });
    assert.equal(invalidMultiplePrimary.ok, false);

    const validBatch = validateAssignProductCategory({
      categories: [
        { category_id: 1, is_primary: true },
        { category_id: 2, is_primary: false },
      ],
    });
    assert.equal(validBatch.ok, true);
    assert.equal(validBatch.value.categories.length, 2);
  });
});
