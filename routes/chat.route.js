import { Router } from "express";
import {verifyJWT} from "../middleware/authMiddleware.js"
import { createnewConversation, getallconversationmessages, getConversation } from "../controllers/conversation.controller.js";
const router=Router()
router.route('/user/:userId').get(verifyJWT,createnewConversation)
router.route('/chat/:ConversationId').get(verifyJWT,getConversation)
router.route('/messages/:conversationId').get(verifyJWT,getallconversationmessages);

export default router;