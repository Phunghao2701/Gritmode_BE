import multer from "multer";

const allowedTypes = new Set(["image/jpeg", "image/png", "image/webp"]);

export const imageUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024, files: 20 },
  fileFilter: (_req, file, callback) => {
    const accepted = allowedTypes.has(file.mimetype);
    callback(accepted ? null : new Error("Chỉ chấp nhận ảnh JPEG, PNG hoặc WebP"), accepted);
  },
});
