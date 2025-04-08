import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { User } from "../models/user.model";
import { sendRecoveryEmail } from "../utils/nodemailer";

const RegisterUser = async (req, res) => {
  try {
    const { username, email, password, fullName, profilePicture } = req.body;

    if (!username || !email || !password || !fullName || !profilePicture) {
      return res
        .status(400)
        .json({
          msg: "Please fill in all fields",
          success: false,
          status: 400,
        });
    }

    const existinguser = await User.findOne({ $or: [email, username] });
    if (existinguser) {
      if (existinguser.isVerified) {
        return res
          .status(400)
          .json({
            msg: "user with same email or username already exists",
            success: false,
            status: 400,
          });
      }
      await user.deleteOne({ _id: existinguser._id });
    }
    const newuser = await User.create({
      username,
      fullName,
      password,
      profilePicture,
      email,
    });

    if (!newuser) {
      return res.status(500).json({
        message: "failed to create newuser",
        success: false,
        status: 500,
      });
    }
    return res.status(200).json({
      message: "user is created successfully",
      success: true,
      status: 200,
    });
  } catch (error) {
    return res.status(500).json({
      message: error.message || error || "Error registering user",
      success: false,
    });
  }
};

const LoginUser = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        message: "Email and password are required",
        success: false,
        status: 400,
      });
    }
    const user = await User.findOne({ email });

    if (!user) {
      return res.status(400).json({
        message: "Email does not exist",
        success: false,
        status: 400,
      });
    }

    const isValidPassword = await user.isPasswordCorrect(password);

    if (!isValidPassword) {
      return res.status(400).json({
        message: "Invalid password",
        success: false,
        status: 400,
      });
    }
    const refreshToken = user.generateRefreshToken();

    const cookieOptions = {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "Strict",
      maxAge: 24 * 60 * 60 * 1000, // 1 day
    };

    // Send response with token in cookie
    return res.cookie("token", refreshToken, cookieOptions).status(200).json({
      message: "User logged in successfully",
      status: 200,
      success: true,
    });
  } catch (error) {
    console.error("Error in LoginUser:", error); // Log the error for debugging
    return res.status(500).json({
      message: error.message || "Error logging in user",
      success: false,
      status: 500,
    });
  }
};

const sendVerficationCode = async (req, res) => {
    try {
      const { email } = req.body;
      const user = await User.findOne({ email });
      if (!user) {
        return res.status(400).json({
          message: "Email does not exist",
          success: false,
          status: 400,
        });
      }
      if(user.isVerified){
        return res.status(400).json({
            message: "Email is already verified",
            success: false,
            status:400
        })
      }
      const code = Math.floor(100000 + Math.random() * 900000).toString(); // 6-digit code
      const expiry = new Date(Date.now() + 10 * 60 * 1000); 
      user.otpcode=code;
      user.optexpires=expiry;
      await user.save();
      await sendRecoveryEmail(email, code);

      return res.status(200).json({
        message: "verification is send successfully",
        status: 200,
        success: true,
      });
    } catch (error) {
      console.error("Error in sending verfication code :", error); // Log the error for debugging
      return res.status(500).json({
        message: error.message || "Error logging in user",
        success: false,
        status: 500,
      });
    }
};

const logout = async (req, res) => {
  try {
    const options = {
      httpOnly: true,
      secure: true,
    };
    return res.clearCookie("token", options).status(201).json({
      message: "User is logout successfully",
      data: {},
      success: true,
      status:201
    });

  } catch (error) {
    return res.status(500).json({
      message: error.message || error,
      success: false,
    });
  }
};


export {
  RegisterUser,
  LoginUser,
  sendVerficationCode,
  logout,

};
