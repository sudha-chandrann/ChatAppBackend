import mongoose, { Schema } from "mongoose";


const ConversationSchema = new Schema({
    name: {
      type: String,
      trim: true
    },
    isGroup: {
      type: Boolean,
      default: false
    },
    participants: [{
      user: {
        type: Schema.Types.ObjectId,
        ref: 'User',
        required: true
      },
      role: {
        type: String,
        enum: ['admin', 'member'],
        default: 'member'
      },
      joinedAt: {
        type: Date,
        default: Date.now
      }
    }],
    avatar: {
      type: String,
      default: ''
    },
    lastMessage: {
      type: Schema.Types.ObjectId,
      ref: 'Message'
    },
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: 'User'
    },
    description: {
      type: String,
      default: '',
      maxlength: [500, "Description cannot exceed 500 characters"]
    },
    muted: [
       {
        type: Schema.Types.ObjectId,
        ref: 'User'
      }],
    pinned: [{
      type: Schema.Types.ObjectId,
      ref: 'User'
    }],
    pinnedmessage:[
        {
        type:Schema.Types.ObjectId,
        ref:'Message'
        }
    ]
  }, {
    timestamps: true
  });

export const Conversation = mongoose.model('Conversation', ConversationSchema);