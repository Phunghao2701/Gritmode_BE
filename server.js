import "dotenv/config";
import app from "./src/app.js";
import swaggerUi from "swagger-ui-express";
import swaggerJsdoc from "swagger-jsdoc";
import cors from 'cors';

const PORT = process.env.PORT || 5000;

const swaggerOptions = {
    definition: {
        openapi: "3.0.0",
        info: {
            title: "Tuyển Tập API Express của Tôi",
            version: "1.0.0",
            description: "Tài liệu hướng dẫn sử dụng các API hệ thống",
        },
        servers: [
            {
                url: process.env.BASE_URL || `http://localhost:${PORT}`,
                description: "API Server",
            },
        ],

        components: {
            securitySchemes: {
                bearerAuth: {
                    type: 'http',
                    scheme: 'bearer',
                    bearerFormat: 'JWT'
                }
            }
        },
    },
    apis: ["./src/routes/*.js"],
};

const swaggerDocs = swaggerJsdoc(swaggerOptions);

app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(swaggerDocs));

app.listen(PORT, () => {
    console.log(`🚀 Server đang trên: http://localhost:${PORT}`);
});