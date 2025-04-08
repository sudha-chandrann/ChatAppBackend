
import jwt from 'jsonwebtoken'
import { User } from "../models/user.model.js"

export const verifyJWT=async (req,res,next)=>{
  try{
    const token= req.cookies?.token || req.header("Authorization")?.replace("Bearer","");
   if(!token){
    return res.status(401).json({
        message:"invalid token",
        success:false
    })
   }
   const decodedToken=jwt.verify(token,process.env.SECRET_KEY)
   const user= await User.findById(decodedToken?.id).select(" -password")
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

