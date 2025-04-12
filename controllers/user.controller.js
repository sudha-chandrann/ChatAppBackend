import { User } from "../models/user.model.js";
import { sendVerifyEmail } from "../utils/nodemailer.js";
import { sendRecoveryEmail } from "../utils/recoverpasswordremail.js";

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
      $or: [{ email }, { username }],
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
      profilePicture: profilePicture || "",
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
      status: 500,
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
      secure: true,
      sameSite: "none",
      maxAge: 24 * 60 * 60 * 1000, // 1 day
      path:"/"
    };

    user.lastSeen = new Date();
    await user.save();

    return res.cookie("token", refreshToken, cookieOptions).status(200).json({
      message: "Login successful",
      success: true,
      status: 200,
      token: refreshToken 
    });
  } catch (error) {
    console.error("Login error:", error);
    return res.status(500).json({
      message: error.message || "Authentication failed",
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
        status: 400,
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
    await sendVerifyEmail(email, code);

    return res.status(200).json({
      message: "Verification code sent successfully",
      success: true,
      status: 200,
    });
  } catch (error) {
    console.error("Error sending verification code:", error);
    return res.status(500).json({
      message: error.message || "Failed to send verification code",
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
        status: 400,
      });
    }

    if (!user.otpCode || new Date() > user.otpExpires) {
      return res.status(400).json({
        message: "Verification code has expired",
        success: false,
        status: 400,
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
    user.otpCode = "";
    user.otpExpires = null;
    await user.save();

    return res.status(200).json({
      message: "Email verified successfully",
      success: true,
      status: 200,
    });
  } catch (error) {
    console.error("Email verification error:", error);
    return res.status(500).json({
      message: error.message || "Email verification failed",
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
        user.status = "offline";
        user.lastSeen = new Date();
        await user.save();
      }
    }
    const cookieOptions = {
      httpOnly: true,
      secure: true,
      sameSite: "none",
      path:"/"
    };

    return res.clearCookie("token", cookieOptions).status(200).json({
      message: "Logged out successfully",
      success: true,
      status: 200,
    });
  } catch (error) {
    console.error("Logout error:", error);
    return res.status(500).json({
      message: "Logout failed",
      success: false,
      status: 500,
    });
  }
};

const getcurrentUser = async (req, res) => {
  try {
    const userId = req.user._id;

    if (!userId) {
      return res.status(404).json({
        message: "unauthorized",
        success: false,
        status: 404,
      });
    }
    const user = await User.findById(userId).select(
      "username email fullName profilePicture bio "
    );
    if (!user) {
      return res.status(404).json({
        message: "User not found with this email",
        success: false,
        status: 404,
      });
    }

    return res.status(200).json({
      message: "user is found successfully",
      success: true,
      status: 200,
      user: user,
    });
  } catch (error) {
    console.error("Logout error:", error);
    return res.status(500).json({
      message: "Logout failed",
      success: false,
      status: 500,
    });
  }
};

const changepassword = async (req, res) => {
  try {
    const userId = req.user._id;

    if (!userId) {
      return res.status(404).json({
        message: "unauthorized",
        success: false,
        status: 404,
      });
    }
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) {
      return res.status(400).json({
        message: "Please enter both current and new password",
        success: false,
        status: 400,
      });
    }
    if (newPassword.length < 6) {
      return res.status(400).json({
        message: "Password must be at least 6 characters long",
        success: false,
        status: 400,
      });
    }
    const user = await User.findById(userId)
    if (!user) {
      return res.status(404).json({
        message: "User not found with this email",
        success: false,
        status: 404,
      });
    }
    const isValidPassword = await user.isPasswordCorrect(currentPassword);
    if (!isValidPassword) {
      return res.status(400).json({
        message: "Invalid current password",
        success: false,
        status: 400,
      });
    }
    user.password = newPassword;
    await user.save();

    return res.status(200).json({
      message: "Password changed successfully",
      success: true,
      status: 200,
    });
  } catch (error) {
    console.error("Password changed  error:", error);
    return res.status(500).json({
      message: "Password changed  failed",
      success: false,
      status: 500,
    });
  }
};
const upadteuser = async (req, res) => {
  try {
    const userId = req.user._id;

    if (!userId) {
      return res.status(404).json({
        message: "unauthorized",
        success: false,
        status: 404,
      });
    }
    const updateData = req.body;

    const user = await User.findById(userId)
    if (!user) {
      return res.status(404).json({
        message: "User not found with this email",
        success: false,
        status: 404,
      });
    }
    await User.findByIdAndUpdate(userId, updateData, { new: true, runValidators: true });
    await user.save();

    return res.status(200).json({
      message: "user profile is updated  successfully",
      success: true,
      status: 200,
    });
  } catch (error) {
    console.error("profile changed  error:", error);
    return res.status(500).json({
      message: error.message||"profile changed  failed",
      success: false,
      status: 500,
    });
  }
};
const getUsers = async (req, res) => {
  try {
    const userId = req.user._id;
    if (!userId) {
      return res.status(401).json({
        message: "Unauthorized",
        success: false,
        status: 401,
      });
    }
    
    const { term } = req.body;
    let users;
    
    // First, get the current user to check their blocked list
    const currentUser = await User.findById(userId).select('blockedUsers');
    
    if (!currentUser) {
      return res.status(404).json({
        message: "User not found",
        success: false,
        status: 404,
      });
    }
    
    // Create a query to exclude both the current user, blocked users, and users who blocked the current user
    const blockedFilter = {
      $and: [
        { _id: { $ne: userId } }, // Exclude the current user
        { _id: { $nin: currentUser.blockedUsers } }, // Exclude users blocked by current user
        { blockedUsers: { $ne: userId } } // Exclude users who blocked the current user
      ]
    };
    
    if (term && term.trim() !== '') {
      // Add the search term to the query
      users = await User.find({
        $and: [
          ...blockedFilter.$and,
          {
            $or: [
              { username: { $regex: term, $options: 'i' } },
              { email: { $regex: term, $options: 'i' } },
              { fullName: { $regex: term, $options: 'i' } }
            ]
          }
        ]
      })
      .select('username email fullName profilePicture status lastSeen')
      .limit(10);
    } else {
      // For random users, use the same blocking filter in the aggregation
      users = await User.aggregate([
        { 
          $match: { 
            $and: [
              { _id: { $ne: userId } },
              { _id: { $nin: currentUser.blockedUsers.map(id => new mongoose.Types.ObjectId(id)) } },
              { blockedUsers: { $ne: new mongoose.Types.ObjectId(userId) } }
            ]
          } 
        },
        { $sample: { size: 5 } },
        { 
          $project: { 
            username: 1, 
            email: 1, 
            fullName: 1, 
            profilePicture: 1, 
            status: 1, 
            lastSeen: 1
          }
        }
      ]);
    }
    
    return res.status(200).json({
      message: "Users retrieved successfully",
      success: true,
      status: 200,
      data: users
    });
  } catch (error) {
    console.error("Get users error:", error);
    return res.status(500).json({
      message: error.message || "Failed to retrieve users",
      success: false,
      status: 500,
    });
  }
};

const requestRecoveryCode=async(req,res)=>{
  try {
    const { email } = req.body;
    if(!email){
      return res.status(400).json({
        message: "Email is required",
        success: false,
        status:400
        });
    }
    const user= await User.findOne({email});
    if(!user){
      return res.status(404).json({
        message: "User not found",
        success: false,
        status:404
        });
    }
    const code = Math.floor(100000 + Math.random() * 900000).toString(); // 6-digit code
    const expiry = new Date(Date.now() + 10 * 60 * 1000); 
    user.passwordResetToken = code;
    user.passwordResetExpires = expiry;
    await user.save();
    await sendRecoveryEmail(email,code);
    return res.status(200).json({
      message: "Recovery code sent successfully to your email",
      success: true,
    })

  }
  catch(error){
    console.error("Request recovery code error:", error);
    return res.status(500).json({
      message: error.message || "Failed to request recovery code",
      success: false,
      status: 500,
      });
  }
}

const resetnewpassword=async(req,res)=>{
  try{
    const { email, verificationCode, newPassword } = req.body;
    if(!email || !verificationCode || !newPassword){
      return res.status(400).json({
        message: "Email, verification code and new password are required",
        success: false,
        status:400
      })
    }
    const user = await User.findOne({ email });  
    if(!user){
      return res.status(404).json({
        message: "User not found",
        success: false,
        status:404
        });
    }
    if(user.passwordResetToken !==verificationCode){
      return res.status(400).json({
        message: "Invalid verification code",
        success: false,
        status:400
        })
    }
    if(user.passwordResetExpires < Date.now()){
      return res.status(400).json({
        message: "Recovery code has expired",
        success: false,
        status:400
        })
    }
    user.password=newPassword;
    user.passwordResetToken=null;
    user.passwordResetExpires=null;
    await user.save();
    return res.status(200).json({
      message: "Password reset successfully",
      success: true,
      status:200
    })

  }
  catch(err){
    console.error("Reset new password error:", err);
    return res.status(500).json({
      message: err.message || "Failed to reset new password",
      success: false,
      status: 500,
      });
  }
}



export {
  registerUser,
  loginUser,
  sendVerificationCode,
  verifyEmail,
  logout,
  getcurrentUser,
  changepassword,
  upadteuser,
  getUsers,
  requestRecoveryCode,
  resetnewpassword
};
