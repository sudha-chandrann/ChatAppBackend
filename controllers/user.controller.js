
import { User } from "../models/user.model.js"
import { sendRecoveryEmail } from "../utils/nodemailer.js"


const registerUser = async (req, res) => {
  try {
    const { username, email, password, fullName, profilePicture } = req.body;

    if (!username || !email || !password || !fullName) {
      return res.status(400).json({
        message: "Please fill in all required fields",
        success: false,
        status: 400,
      });
    }

    // Check for existing user
    const existingUser = await User.findOne({ 
      $or: [{ email }, { username }] 
    });

    if (existingUser) {
      if (existingUser.isVerified) {
        return res.status(409).json({
          message: "User with this email or username already exists",
          success: false,
          status: 409,
        });
      }
      
      // Delete unverified account to allow re-registration
      await User.deleteOne({ _id: existingUser._id });
    }

    // Create new user
    const newUser = await User.create({
      username,
      fullName,
      password,
      profilePicture: profilePicture || '',
      email,
    });

    if (!newUser) {
      return res.status(500).json({
        message: "Failed to create user account",
        success: false,
        status: 500,
      });
    }

    return res.status(201).json({
      message: "User account created successfully",
      success: true,
      status: 201,
    });
  } catch (error) {
    console.error("Registration error:", error);
    return res.status(500).json({
      message: error.message || "Error registering user",
      success: false,
      status: 500
    });
  }
};

const loginUser = async (req, res) => {
  try {
    const { email, password } = req.body;

    // Validate required fields
    if (!email || !password) {
      return res.status(400).json({
        message: "Email and password are required",
        success: false,
        status: 400,
      });
    }

    // Find user by email
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(404).json({
        message: "User not found with this email",
        success: false,
        status: 404,
      });
    }

    // Check if account is verified
    if (!user.isVerified) {
      return res.status(403).json({
        message: "Please verify your email address before logging in",
        success: false,
        status: 403,
      });
    }

    // Verify password
    const isValidPassword = await user.isPasswordCorrect(password);
    if (!isValidPassword) {
      return res.status(401).json({
        message: "Invalid credentials",
        success: false,
        status: 401,
      });
    }

    // Generate token
    const refreshToken = user.generateRefreshToken();

    // Set cookie options
    const cookieOptions = {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      maxAge: 24 * 60 * 60 * 1000, // 1 day
    };

    user.lastSeen = new Date();
    await user.save();

    return res.cookie("token", refreshToken, cookieOptions).status(200).json({
      message: "Login successful",
      success: true,
      status: 200,
    });
  } catch (error) {
    console.error("Login error:", error);
    return res.status(500).json({
      message:error.message|| "Authentication failed",
      success: false,
      status: 500,
    });
  }
};

const sendVerificationCode = async (req, res) => {
  try {
    const { email } = req.body;
    
    if (!email) {
      return res.status(400).json({
        message: "Email is required",
        success: false,
        status: 400,
      });
    }

    const user = await User.findOne({ email });
    if (!user) {
      return res.status(404).json({
        message: "User not found with this email",
        success: false,
        status: 404,
      });
    }

    if (user.isVerified) {
      return res.status(400).json({
        message: "Email is already verified",
        success: false,
        status: 400
      });
    }

    // Generate 6-digit verification code
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    const expiry = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes
    
    // Save code to user
    user.otpCode = code;
    user.otpExpires = expiry;
    await user.save();
    
    // Send verification email
    await sendRecoveryEmail(email, code);

    return res.status(200).json({
      message: "Verification code sent successfully",
      success: true,
      status: 200,
    });
  } catch (error) {
    console.error("Error sending verification code:", error);
    return res.status(500).json({
      message:error.message|| "Failed to send verification code",
      success: false,
      status: 500,
    });
  }
};

const verifyEmail = async (req, res) => {
  try {
    const { email, code } = req.body;
    
    if (!email || !code) {
      return res.status(400).json({
        message: "Email and verification code are required",
        success: false,
        status: 400,
      });
    }
    
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(404).json({
        message: "User not found with this email",
        success: false,
        status: 404,
      });
    }
    
    if (user.isVerified) {
      return res.status(400).json({
        message: "Email is already verified",
        success: false,
        status: 400
      });
    }
    
    if (!user.otpCode || new Date() > user.otpExpires) {
      return res.status(400).json({
        message: "Verification code has expired",
        success: false,
        status: 400
      });
    }
    
    if (user.otpCode !== code) {
      return res.status(401).json({
        message: "Invalid verification code",
        success: false,
        status: 401,
      });
    }
    
    // Update user verification status
    user.isVerified = true;
    user.otpCode = '';
    user.otpExpires = null;
    await user.save();
    
    return res.status(200).json({
      message: "Email verified successfully",
      success: true,
      status: 200
    });
  } catch (error) {
    console.error("Email verification error:", error);
    return res.status(500).json({
      message:error.message|| "Email verification failed",
      success: false,
      status: 500,
    });
  }
};

const logout = async (req, res) => {
  try {

    const _id = req.user._id;

        if (_id) {
          const user = await User.findById(_id);
          if (user) {
            user.status = 'offline';
            user.lastSeen = new Date();
            await user.save();
          }
        }

        const options = {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict"
    };
    
    return res.clearCookie("token", options).status(200).json({
      message: "Logged out successfully",
      success: true,
      status: 200
    });
  } catch (error) {
    console.error("Logout error:", error);
    return res.status(500).json({
      message: "Logout failed",
      success: false,
      status: 500
    });
  }
};

export {
  registerUser,
  loginUser,
  sendVerificationCode,
  verifyEmail,
  logout
};