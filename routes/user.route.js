import { Router } from "express";
import {loginUser, logout, registerUser,verifyEmail, sendVerificationCode, getcurrentUser, changepassword, upadteuser, getUsers,} from "../controllers/user.controller.js";
import {verifyJWT} from "../middleware/authMiddleware.js"
const router=Router()
router.route("/register").post(registerUser);
router.route("/login").post(loginUser);
router.route("/logout").get(verifyJWT,logout);
router.route("/sendverfication").post(sendVerificationCode);
router.route('/verifyEmail').post(verifyEmail)
router.route('/getcurrentuser').get(verifyJWT,getcurrentUser); 
router.route('/changepassword').patch(verifyJWT,changepassword)
router.route('/updateprofile').patch(verifyJWT,upadteuser)
router.route('/getusers').post(verifyJWT,getUsers)

export default router;