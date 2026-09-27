import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
  CreateBucketCommand,
  HeadBucketCommand,
  PutBucketPolicyCommand,
} from "@aws-sdk/client-s3";
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

  let bucketInitialized = false;

  const ensureBucket = async (bucket = config.minioBucket) => {
    if (bucketInitialized) return;
    try {
      await s3Client.send(new HeadBucketCommand({ Bucket: bucket }));
      bucketInitialized = true;
    } catch (err) {
      if (
        err.name === "NotFound" ||
        err.name === "NoSuchBucket" ||
        err.$metadata?.httpStatusCode === 404
      ) {
        try {
          await s3Client.send(new CreateBucketCommand({ Bucket: bucket }));
          const policy = JSON.stringify({
            Version: "2012-10-17",
            Statement: [
              {
                Effect: "Allow",
                Principal: "*",
                Action: ["s3:GetObject"],
                Resource: [`arn:aws:s3:::${bucket}/*`],
              },
            ],
          });
          await s3Client.send(
            new PutBucketPolicyCommand({ Bucket: bucket, Policy: policy })
          );
          bucketInitialized = true;
        } catch (createErr) {
          // Ignore concurrent creation
        }
      }
    }
  };

  const uploadFile = async ({
    buffer,
    originalName = "image.webp",
    mimeType = "image/webp",
    folder = "products",
    bucket = config.minioBucket,
  }) => {
    await ensureBucket(bucket);

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
    ensureBucket,
  };
};

export const storageService = createStorageService();
