import { Router } from "express";
import {loginUser, logout, registerUser,verifyEmail, sendVerificationCode,} from "../controllers/user.controller.js";
import {verifyJWT} from "../middleware/authMiddleware.js"
const router=Router()
router.route("/register").post(registerUser);
router.route("/login").post(loginUser);
router.route("/logout").get(verifyJWT,logout);
router.route("/sendverfication").post(sendVerificationCode);
router.route('/verifyEmail').post(verifyEmail)
  
export default router
