import { Router } from "express";
import {verifyJWT} from "../middleware/authMiddleware.js"
import { createnewConversation, createnewGroupConversation, getallconversationmessages, getAllConversations, getConversation, getConversationInformation, getUsers } from "../controllers/conversation.controller.js";
const router=Router()
router.route('/user/:userId').get(verifyJWT,createnewConversation)
router.route('/chat/:ConversationId').get(verifyJWT,getConversation)
router.route('/messages/:conversationId').get(verifyJWT,getallconversationmessages);
router.route('/group').post(verifyJWT,createnewGroupConversation);
router.route('/getallconversations').get(verifyJWT,getAllConversations);
router.route('/chatinfo/:ConversationId').get(verifyJWT,getConversationInformation)
router.route('/getusers/:conversationId').post(verifyJWT,getUsers);
export default router;