import { Router } from "express";
import { authenticate, resolveOrganization, requireRole, requireEeFeature } from "@shared/middleware";
import { ContactsController } from "./contacts.controller";

const router = Router();

// Internal endpoint called by AI tool (authenticated by shared secret header).
router.post("/ai/upsert", ContactsController.upsertFromAI);

router.use(authenticate);
router.use(resolveOrganization);
router.use(requireEeFeature("contacts"));

router.get("/", requireRole("agent"), ContactsController.listContacts);

export default router;
