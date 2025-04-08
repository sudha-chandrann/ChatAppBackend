import mongoose, { Schema } from "mongoose";
import bcrypt from "bcrypt"
import jwt from "jsonwebtoken";
const UserSchema = new Schema({
    username: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      minlength: 3,
      maxlength: 30
    },
    email: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      lowercase: true,
      match: [/^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/, 'Please enter a valid email address']
    },
    password: {
      type: String,
      required: true,
      minlength: 6
    },
    fullName: {
      type: String,
      required: true,
      trim: true
    },
    profilePicture: {
      type: String,
      default: ''
    },
    bio: {
      type: String,
      default: '',
      maxlength: 200
    },
    status: {
      type: String,
      enum: ['online', 'offline'],
      default: 'offline'
    },
    lastSeen: {
      type: Date,
      default: Date.now
    },
    contacts: [{
      type: Schema.Types.ObjectId,
      ref: 'User'
    }],
    blockedUsers: [{
      type: Schema.Types.ObjectId,
      ref: 'User'
    }],
    isVerified: {
      type: Boolean,
      default: false
    },
    otpcode:{
      type:String,
      default:'',
    }
  }, {
    timestamps: true
  });
  
  UserSchema.pre("save", async function(next) {
    try {
      if (!this.isModified("password")) return next();
      const salt =await bcrypt.genSalt(10)
      this.password = await bcrypt.hash(this.password, salt);
      next();
    } catch (error) {
      next(error);
    }
});

UserSchema.methods.isPasswordCorrect = async function(password) {
    try{
        return await bcrypt.compare(password,this.password);
    }
    catch(error){
         console.log("something went wrong during comparing the password ",error)
         throw error;
    }
};

UserSchema.methods.generateRefreshToken = function() {
    return jwt.sign({
      _id: this._id
    }, process.env.REFRESH_TOKEN_SECRET, 
    {
      expiresIn: process.env.REFRESH_TOKEN_EXPIRY
    });
};

export const User = mongoose.model('User', UserSchema);