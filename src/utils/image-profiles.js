export const IMAGE_PROFILES = Object.freeze({
  product: Object.freeze({ key: "product", width: 3, height: 4, folder: "products", outputWidth: 1200, outputHeight: 1600 }),
  collection: Object.freeze({ key: "collection", width: 4, height: 3, folder: "collections", outputWidth: 1600, outputHeight: 1200 }),
  banner: Object.freeze({ key: "banner", width: 16, height: 9, folder: "banners", outputWidth: 1920, outputHeight: 1080 }),
});

export const getImageProfile = (name) => {
  const profile = IMAGE_PROFILES[name];
  if (!profile) throw new Error(`Unsupported image profile: ${name}`);
  return profile;
};

export const assertImageDimensions = (name, width, height) => {
  const profile = getImageProfile(name);
  const actual = Number(width) / Number(height);
  const expected = profile.width / profile.height;
  if (!Number.isFinite(actual) || Number(width) <= 0 || Number(height) <= 0 || Math.abs(actual - expected) > 0.01) {
    throw new Error(`Image dimensions do not match ${name} profile`);
  }
  return true;
};

export const normalizeImageProfile = (name) => getImageProfile(name).key;
