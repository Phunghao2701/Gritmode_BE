import test from "node:test";
import assert from "node:assert/strict";
import sharp from "sharp";
import { optimizeProductImage } from "../../../src/routes/upload.route.js";

test("optimizeProductImage limits dimensions and outputs WebP", async () => {
  const source = await sharp({
    create: { width: 3000, height: 1500, channels: 3, background: "#222" },
  }).jpeg().toBuffer();

  const output = await optimizeProductImage(source);
  const metadata = await sharp(output).metadata();

  assert.equal(metadata.format, "webp");
  assert.equal(metadata.width, 2000);
  assert.equal(metadata.height, 1000);
  assert.ok(output.length < source.length);
});
