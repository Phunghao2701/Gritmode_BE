import { S3Client, PutObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import crypto from "node:crypto";
import { getConfig } from "../config/env.js";

export const createStorageService = ({ config = getConfig() } = {}) => {
  const protocol = config.minioUseSsl ? "https" : "http";
  const endpoint = config.minioEndpoint.startsWith("http")
    ? config.minioEndpoint
    : `${protocol}://${config.minioEndpoint}:${config.minioPort}`;

  const s3Client = new S3Client({
    endpoint,
    region: "us-east-1",
    credentials: {
      accessKeyId: config.minioAccessKey,
      secretAccessKey: config.minioSecretKey,
    },
    forcePathStyle: true,
  });

  const uploadFile = async ({
    buffer,
    originalName = "image.webp",
    mimeType = "image/webp",
    folder = "products",
    bucket = config.minioBucket,
  }) => {
    const ext = originalName.includes(".") ? originalName.split(".").pop() : "webp";
    const filename = `${Date.now()}-${crypto.randomUUID()}.${ext}`;
    const key = folder ? `${folder}/${filename}` : filename;

    const command = new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: buffer,
      ContentType: mimeType,
    });

    await s3Client.send(command);

    const publicBase = (config.minioPublicUrl || endpoint).replace(/\/$/, "");
    const publicUrl = `${publicBase}/${bucket}/${key}`;

    return {
      url: publicUrl,
      key,
      public_id: key, // Backward-compatible alias for frontend
      original_name: originalName,
      size: buffer.length,
      bucket,
    };
  };

  const deleteFile = async ({ key, bucket = config.minioBucket }) => {
    const command = new DeleteObjectCommand({
      Bucket: bucket,
      Key: key,
    });
    return s3Client.send(command);
  };

  return {
    s3Client,
    uploadFile,
    deleteFile,
  };
};

export const storageService = createStorageService();
