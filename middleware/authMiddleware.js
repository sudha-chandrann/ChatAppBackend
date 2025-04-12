
import jwt from 'jsonwebtoken'
import { User } from "../models/user.model.js"

export const verifyJWT=async (req,res,next)=>{
  try{
   const token= req.cookies?.token || req.header("Authorization")?.replace("Bearer","")|| req.body.token
   if(!token){
    return res.status(401).json({
        message:"invalid token",
        success:false
    })
   }
   const decodedToken=jwt.verify(token,process.env.REFRESH_TOKEN_SECRET)
   const user= await User.findById(decodedToken?._id).select(" -password")

   if(!user){
      return res.status(401).json({
        message:"user does not exists",
        success:false,
        status:401
    })
   }
  req.user =user;
  next()
  }
  catch(error){
    return res.status(401).json({
        message:error.message||error,
        success:false
    })
  }
}

