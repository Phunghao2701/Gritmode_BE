import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import swaggerUi from "swagger-ui-express";
import swaggerJsdoc from "swagger-jsdoc";

const here = dirname(fileURLToPath(import.meta.url));
const routesPattern = resolve(here, "../routes/*.js").replace(/\\/g, "/");

const swaggerOptions = {
  definition: {
    openapi: "3.0.0",
    info: {
      title: "Gritmode API Documentation",
      version: "1.0.0",
      description: "Tài liệu hướng dẫn sử dụng các API hệ thống Gritmode Ecommerce Backend",
    },
    servers: [
      {
        url: "/api/v1",
        description: "API V1",
      },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: "http",
          scheme: "bearer",
          bearerFormat: "JWT",
        },
        cookieAuth: {
          type: "apiKey",
          in: "cookie",
          name: "refresh_token",
        },
      },
      schemas: {
        ApiResponse: {
          type: "object",
          properties: {
            success: { type: "boolean" },
            code: { type: "string" },
            message: { type: "string" },
            data: { type: "object" },
          },
        },
        ErrorResponse: {
          type: "object",
          properties: {
            success: { type: "boolean", example: false },
            code: { type: "string", example: "VALIDATION_ERROR" },
            message: { type: "string" },
            data: { nullable: true, example: null },
            errors: { type: "array", items: { type: "object" } },
          },
        },
      },
    },
  },
  apis: [routesPattern],
};

export const swaggerDocs = swaggerJsdoc(swaggerOptions);

export const mountSwagger = (app) => {
  app.get("/api-docs.json", (req, res) => {
    res.setHeader("Content-Type", "application/json");
    res.send(swaggerDocs);
  });

  app.use(
    "/api-docs",
    swaggerUi.serve,
    swaggerUi.setup(swaggerDocs, {
      customSiteTitle: "Gritmode API Documentation",
      swaggerOptions: {
        persistAuthorization: true,
      },
    }),
  );
};
