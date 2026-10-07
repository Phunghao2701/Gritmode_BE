import { Router } from "express";
import { getAdministrativeAddresses } from "../controllers/administrative-address.controller.js";

const router = Router();

router.get("/", getAdministrativeAddresses);

export default router;
