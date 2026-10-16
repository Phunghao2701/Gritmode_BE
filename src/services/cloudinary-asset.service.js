import sharp from "sharp";
import { getImageProfile } from "../utils/image-profiles.js";
import { uploadBuffer as defaultUploadBuffer, destroyImage as defaultDestroyImage } from "../config/cloudinary.js";

export const normalizeImage = async (buffer, profileName) => {
  const profile = getImageProfile(profileName);
  const output = await sharp(buffer)
    .rotate()
    .resize({ width: profile.outputWidth, height: profile.outputHeight, fit: "cover", position: "centre" })
    .webp({ quality: 82, effort: 2 })
    .toBuffer({ resolveWithObject: true });
  return { buffer: output.data, width: output.info.width, height: output.info.height, format: output.info.format };
};

export const createCloudinaryAssetService = ({
  normalize = normalizeImage,
  uploader = { uploadBuffer: defaultUploadBuffer },
  destroy = defaultDestroyImage,
} = {}) => ({
  async upload({ buffer, profile, originalName = null, sourcePublicId = null }) {
    const normalized = await normalize(buffer, profile);
    const sourceWasCreated = !sourcePublicId;
    const source = sourcePublicId
      ? { public_id: sourcePublicId, secure_url: null }
      : await uploader.uploadBuffer(buffer, { folder: `gritmode/${getImageProfile(profile).folder}/sources`, resource_type: "image" });

    try {
      const result = await uploader.uploadBuffer(normalized.buffer, {
        folder: `gritmode/${getImageProfile(profile).folder}`,
        resource_type: "image",
        format: "webp",
      });
      return {
        url: result.secure_url,
        cloudinary_public_id: result.public_id,
        cloudinary_source_public_id: source.public_id,
        cloudinary_source_url: source.secure_url || null,
        crop_profile: profile,
        image_width: normalized.width,
        image_height: normalized.height,
        image_format: normalized.format,
        original_name: originalName,
        size: result.bytes,
      };
    } catch (error) {
      if (sourceWasCreated && source?.public_id) {
        try {
          await destroy(source.public_id);
        } catch (cleanupError) {
          error.cleanupError = cleanupError;
        }
      }
      throw error;
    }
  },

  async uploadAndAttach(input) {
    const descriptor = await this.upload(input);
    try {
      return await input.attach(descriptor);
    } catch (error) {
      try {
        await destroy(descriptor.cloudinary_public_id);
        if (descriptor.cloudinary_source_public_id && descriptor.cloudinary_source_public_id !== descriptor.cloudinary_public_id) {
          await destroy(descriptor.cloudinary_source_public_id);
        }
      } catch (cleanupError) {
        error.cleanupError = cleanupError;
      }
      throw error;
    }
  },

  async destroy(publicId) {
    if (!publicId) return null;
    return destroy(publicId);
  },
});

export const cloudinaryAssetService = createCloudinaryAssetService();
