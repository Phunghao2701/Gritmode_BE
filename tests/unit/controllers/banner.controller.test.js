import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { createBannerController } from "../../../src/controllers/banner.controller.js";

const mockResponse = () => {
  const res = { headers: {}, statusCode: 200, body: null };
  res.status = (value) => {
    res.statusCode = value;
    return res;
  };
  res.json = (value) => {
    res.body = value;
    return res;
  };
  res.setHeader = (key, val) => {
    res.headers[key] = val;
  };
  return res;
};

const mockRequest = (extra = {}) => ({
  body: {},
  query: {},
  params: {},
  headers: {},
  user: { user_id: 1, role: "admin" },
  ...extra,
});

describe("banner.controller unit tests", () => {
  test("getActiveHero sets cache headers and returns settings and active slides", async () => {
    const heroData = {
      settings: {
        title: "GRITMODE SIGNATURE",
        description: "Streetwear VN",
        marquee_text: "SALE 50%",
      },
      slides: [{ banner_id: 1, image_url: "https://res.cloudinary.com/img.jpg", is_active: true }],
    };
    const service = {
      getActiveHeroData: async () => heroData,
    };
    const controller = createBannerController({ service });
    const req = mockRequest();
    const res = mockResponse();

    await controller.getActiveHero(req, res, () => {});

    assert.equal(res.statusCode, 200);
    assert.equal(res.body.success, true);
    assert.deepEqual(res.body.data, heroData);
    assert.ok(res.headers["Cache-Control"].includes("no-cache"));
  });

  test("updateHeroContent updates title, description, marquee", async () => {
    const updatedSettings = {
      title: "NEW DROP 2026",
      description: "Updated description",
      marquee_text: "FREE SHIPPING",
    };
    const service = {
      updateHeroContent: async (payload) => updatedSettings,
    };
    const controller = createBannerController({ service });
    const req = mockRequest({ body: updatedSettings });
    const res = mockResponse();

    await controller.updateHeroContent(req, res, () => {});

    assert.equal(res.statusCode, 200);
    assert.equal(res.body.success, true);
    assert.equal(res.body.data.title, "NEW DROP 2026");
  });

  test("addHeroImage returns 201 with created slide", async () => {
    const newSlide = {
      image_url: "https://res.cloudinary.com/slide1.jpg",
      sort_order: 1,
    };
    const service = {
      addHeroImage: async (payload) => ({ banner_id: 10, ...payload, is_active: true }),
    };
    const controller = createBannerController({ service });
    const req = mockRequest({ body: newSlide });
    const res = mockResponse();

    await controller.addHeroImage(req, res, () => {});

    assert.equal(res.statusCode, 201);
    assert.equal(res.body.success, true);
    assert.equal(res.body.data.banner_id, 10);
  });

  test("toggleImageStatus updates status", async () => {
    const service = {
      toggleImageStatus: async (id, isActive) => ({ banner_id: Number(id), is_active: isActive }),
    };
    const controller = createBannerController({ service });
    const req = mockRequest({ params: { id: "10" }, body: { is_active: false } });
    const res = mockResponse();

    await controller.toggleImageStatus(req, res, () => {});

    assert.equal(res.statusCode, 200);
    assert.equal(res.body.success, true);
    assert.equal(res.body.data.is_active, false);
  });

  test("deleteHeroImage returns success message", async () => {
    const service = {
      deleteHeroImage: async (id) => ({ success: true, banner_id: Number(id) }),
    };
    const controller = createBannerController({ service });
    const req = mockRequest({ params: { id: "10" } });
    const res = mockResponse();

    await controller.deleteHeroImage(req, res, () => {});

    assert.equal(res.statusCode, 200);
    assert.equal(res.body.success, true);
    assert.equal(res.body.data.banner_id, 10);
  });
});
