import { Router } from "express";
import {verifyJWT} from "../middleware/authMiddleware.js"
import { createnewConversation, getConversation } from "../controllers/conversation.controller.js";
const router=Router()
router.route('/user/:userId').get(verifyJWT,createnewConversation)
router.route('/chat/:ConversationId').get(verifyJWT,getConversation)

export default router;