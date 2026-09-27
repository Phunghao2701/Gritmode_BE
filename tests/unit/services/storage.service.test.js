import test from "node:test";
import assert from "node:assert/strict";
import { createStorageService } from "../../../src/services/storage.service.js";

test("storageService creates S3 client and uploads file with public URL", async () => {
  const mockConfig = {
    minioEndpoint: "localhost",
    minioPort: 9000,
    minioUseSsl: false,
    minioAccessKey: "test-user",
    minioSecretKey: "test-password",
    minioBucket: "test-bucket",
    minioPublicUrl: "http://localhost:9000",
  };

  const service = createStorageService({ config: mockConfig });
  assert.ok(service.s3Client, "S3 client should be initialized");

  // Mock send method on S3 client
  let lastCommand = null;
  service.s3Client.send = async (command) => {
    lastCommand = command;
    return { $metadata: { httpStatusCode: 200 } };
  };

  const dummyBuffer = Buffer.from("fake-image-bytes");
  const result = await service.uploadFile({
    buffer: dummyBuffer,
    originalName: "test-product.png",
    mimeType: "image/webp",
    folder: "products",
  });

  assert.ok(result.url.startsWith("http://localhost:9000/test-bucket/products/"));
  assert.ok(result.key.startsWith("products/"));
  assert.equal(result.size, dummyBuffer.length);
  assert.equal(result.original_name, "test-product.png");
  assert.ok(lastCommand, "Command should have been executed");
  assert.equal(lastCommand.input.Bucket, "test-bucket");
});
