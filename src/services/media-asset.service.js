import { mediaAssetRepository } from "../repositories/media-asset.repository.js";
import { cloudinaryAssetService } from "./cloudinary-asset.service.js";

export const createMediaAssetService = ({ assets = mediaAssetRepository, cloudinary = cloudinaryAssetService } = {}) => ({
  async attach(assetId, recordType, recordId, client) {
    const attached = await assets.attach(assetId, recordType, recordId, client);
    if (!attached) throw new Error(`Media asset ${assetId} is not attachable`);
    return attached;
  },

  async cleanupAfterCommit(publicId) {
    if (!publicId) return { status: "skipped" };
    try {
      await cloudinary.destroy(publicId);
      await assets.markDeleted(publicId);
      return { status: "deleted", publicId };
    } catch (error) {
      const asset = await assets.findByPublicId(publicId).catch(() => null);
      if (asset) await assets.markCleanupPending(asset.media_asset_id, error).catch(() => {});
      return { status: "cleanup_pending", publicId, error };
    }
  },

  async compensateUpload(descriptor) {
    if (!descriptor?.cloudinary_public_id) return;
    await cloudinary.destroy(descriptor.cloudinary_public_id);
    if (descriptor.cloudinary_source_public_id && descriptor.cloudinary_source_public_id !== descriptor.cloudinary_public_id) {
      await cloudinary.destroy(descriptor.cloudinary_source_public_id);
    }
  },

  async retryPendingCleanup(limit = 20) {
    const pending = await assets.listCleanupPending(limit);
    const results = [];
    for (const asset of pending) results.push(await this.cleanupAfterCommit(asset.cloudinary_public_id));
    return results;
  },

  async cleanupExpiredStaged(limit = 20) {
    const staged = await assets.listExpiredStaged(limit);
    const results = [];
    for (const asset of staged) {
      try {
        await cloudinary.destroy(asset.cloudinary_public_id);
        if (asset.cloudinary_source_public_id && asset.cloudinary_source_public_id !== asset.cloudinary_public_id) {
          await cloudinary.destroy(asset.cloudinary_source_public_id);
        }
        await assets.markDeleted(asset.cloudinary_public_id);
        results.push({ media_asset_id: asset.media_asset_id, status: 'deleted' });
      } catch (error) {
        await assets.markCleanupPending(asset.media_asset_id, error).catch(() => {});
        results.push({ media_asset_id: asset.media_asset_id, status: 'cleanup_pending' });
      }
    }
    return results;
  },
});

export const mediaAssetService = createMediaAssetService();
