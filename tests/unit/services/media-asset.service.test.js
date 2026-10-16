import test from "node:test";
import assert from "node:assert/strict";
import { createMediaAssetService } from "../../../src/services/media-asset.service.js";

test("cleanup deletes the old derivative after commit and marks registry state", async () => {
  const calls = [];
  const service = createMediaAssetService({
    cloudinary: { destroy: async (id) => calls.push(`destroy:${id}`) },
    assets: {
      markDeleted: async (id) => calls.push(`deleted:${id}`),
      findByPublicId: async () => null,
    },
  });
  const result = await service.cleanupAfterCommit("products/old");
  assert.equal(result.status, "deleted");
  assert.deepEqual(calls, ["destroy:products/old", "deleted:products/old"]);
});

test("cleanup failure records retry state without failing the committed flow", async () => {
  const calls = [];
  const service = createMediaAssetService({
    cloudinary: { destroy: async () => { throw new Error("cloudinary down"); } },
    assets: {
      findByPublicId: async () => ({ media_asset_id: 7 }),
      markCleanupPending: async (id) => calls.push(id),
    },
  });
  const result = await service.cleanupAfterCommit("products/old");
  assert.equal(result.status, "cleanup_pending");
  assert.deepEqual(calls, [7]);
});

test("expired staged assets delete both derivative and retained source", async () => {
  const calls = [];
  const service = createMediaAssetService({
    cloudinary: { destroy: async (id) => calls.push(`destroy:${id}`) },
    assets: {
      listExpiredStaged: async () => [{ media_asset_id: 8, cloudinary_public_id: 'products/new', cloudinary_source_public_id: 'products/source' }],
      markDeleted: async (id) => calls.push(`deleted:${id}`),
    },
  });
  const result = await service.cleanupExpiredStaged();
  assert.deepEqual(result, [{ media_asset_id: 8, status: 'deleted' }]);
  assert.deepEqual(calls, ['destroy:products/new', 'destroy:products/source', 'deleted:products/new']);
});
