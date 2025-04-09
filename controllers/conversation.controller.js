import mongoose from "mongoose";
import { Conversation } from "../models/chat.model.js";
import { User } from "../models/user.model.js";

const createnewConversation  = async (req, res) => {
  try {
    const { userId } = req.params;
    const currentUserId = req.user._id;  
    if (!mongoose.Types.ObjectId.isValid(userId) || !mongoose.Types.ObjectId.isValid(currentUserId)) {
        return res.status(400).json({
            message:   "Invalid user ID format",
            success: false,
            status: 400,
        });
    }
    if (userId === currentUserId.toString()) {
        return res.status(400).json({
            message: "Cannot start a conversation with yourself",
            success: false,
            status: 400,
        });
    }
    
    const targetUser = await User.findById(userId);


    if (!targetUser) {
        return res.status(404).json({
            message: "User not found",
            success: false,
            status: 404,
        })
    }

    const existingConversation = await Conversation.findOne({
        isGroup: false,
        $and: [
          { "participants.user": currentUserId },
          { "participants.user": userId }
        ]
      });

      if (existingConversation) {
        return res.status(200).json({
            message: "Conversation already exists",
            success: true,
            status: 200,
            Conversation:existingConversation._id
        })
      }

      const newConversation = await Conversation.create({
        name: `${req.user.username} and ${targetUser.username}`,
        isGroup: false,
        participants: [
          { user: currentUserId, role: 'admin' },
          { user: userId, role: 'admin' }
        ],
        createdBy: currentUserId
      });
      
      return res.status(201).json({
        message: "Conversation created successfully",
        success: true,
        status: 201,
        Conversation:newConversation._id
      })
   
  } catch (error) {
    console.error("new conversation error:", error);
    return res.status(500).json({
      message: error.message || "Failed to create new  conversation ",
      success: false,
      status: 500,
    });
  }
};

export {
    createnewConversation
}