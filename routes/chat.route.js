import { Router } from "express";
import {verifyJWT} from "../middleware/authMiddleware.js"
import { createnewConversation } from "../controllers/conversation.controller.js";
const router=Router()
router.route('/user/:userId').get(verifyJWT,createnewConversation)

export default router;