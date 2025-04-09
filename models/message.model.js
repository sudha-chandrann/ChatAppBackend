import mongoose, { Schema } from "mongoose";


const MessageSchema = new Schema({
    conversation: {
      type: Schema.Types.ObjectId,
      ref: 'Conversation',
      required: true
    },
    sender: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    content: {
      type: String,
      trim: true,
      default: ''
    },
    contentType: {
      type: String,
      enum: ['text', 'image', 'video', 'audio', 'file', 'location', 'contact', 'system'],
      default: 'text'
    },
    mediaUrl: {
      type: String,
      default: ''
    },
    mediaSize: {
      type: Number,
      default: 0
    },
    mediaName: {
      type: String,
      default: ''
    },
    mediaType: {
      type: String,
      default: ''
    },
    location: {
      latitude: Number,
      longitude: Number
    },
    contact: {
      name: String,
      phone: String,
      email: String
    },
    replyTo: {
      type: Schema.Types.ObjectId,
      ref: 'Message',
      default: null
    },
    readBy: [{
      user: {
        type: Schema.Types.ObjectId,
        ref: 'User'
      },
      readAt: {
        type: Date,
        default: Date.now
      }
    }],
    reactions: [{
      user: {
        type: Schema.Types.ObjectId,
        ref: 'User'
      },
      emoji: {
        type: String,
        required: true
      },
      createdAt: {
        type: Date,
        default: Date.now
      }
    }],
    isForwarded: {
      type: Boolean,
      default: false
    },
    forwardedFrom: {
      type: Schema.Types.ObjectId,
      ref: 'Message',
      default: null
    },
    isDeleted: {
      type: Boolean,
      default: false
    },
    deletedAt: {
      type: Date,
      default: null
    },
    isEdited: {
      type: Boolean,
      default: false
    },
    editHistory: [{
      content: String,
      editedAt: {
        type: Date,
        default: Date.now
      }
    }],
    deliveryStatus: {
      type: String,
      enum: ['sending', 'sent', 'delivered', 'failed'],
      default: 'sending'
    }
  }, {
    timestamps: true
  });
 export const Message = mongoose.model('Message', MessageSchema);