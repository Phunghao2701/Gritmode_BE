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
    const imageProfile = getImageProfile(profile);
    const sourceUpload = sourcePublicId
      ? Promise.resolve({ public_id: sourcePublicId, secure_url: null })
      : uploader.uploadBuffer(buffer, { folder: `gritmode/${imageProfile.folder}/sources`, resource_type: "image" });
    const derivativeUpload = uploader.uploadBuffer(normalized.buffer, {
      folder: `gritmode/${imageProfile.folder}`,
      resource_type: "image",
      format: "webp",
    });

    try {
      const [source, result] = await Promise.all([sourceUpload, derivativeUpload]);
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
      const [sourceResult, derivativeResult] = await Promise.allSettled([sourceUpload, derivativeUpload]);
      const publicIds = new Set();
      if (sourceWasCreated && sourceResult.status === "fulfilled" && sourceResult.value?.public_id) {
        publicIds.add(sourceResult.value.public_id);
      }
      if (derivativeResult.status === "fulfilled" && derivativeResult.value?.public_id) {
        publicIds.add(derivativeResult.value.public_id);
      }

      const cleanupResults = await Promise.allSettled([...publicIds].map((publicId) => destroy(publicId)));
      const cleanupError = cleanupResults.find((result) => result.status === "rejected")?.reason;
      if (cleanupError) {
        error.cleanupError = cleanupError;
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
