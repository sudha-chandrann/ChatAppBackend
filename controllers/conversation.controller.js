import mongoose from "mongoose";
import { Conversation } from "../models/chat.model.js";
import { User } from "../models/user.model.js";
import { Message } from "../models/message.model.js";

const createnewConversation = async (req, res) => {
  try {
    const { userId } = req.params;
    const currentUserId = req.user._id;
    if (
      !mongoose.Types.ObjectId.isValid(userId) ||
      !mongoose.Types.ObjectId.isValid(currentUserId)
    ) {
      return res.status(400).json({
        message: "Invalid user ID format",
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
      });
    }

    const existingConversation = await Conversation.findOne({
      isGroup: false,
      $and: [
        { "participants.user": currentUserId },
        { "participants.user": userId },
      ],
    });

    if (existingConversation) {
      return res.status(200).json({
        message: "Conversation already exists",
        success: true,
        status: 200,
        Conversation: existingConversation._id,
      });
    }

    const newConversation = await Conversation.create({
      name: `${req.user.username} and ${targetUser.username}`,
      isGroup: false,
      participants: [
        { user: currentUserId, role: "admin" },
        { user: userId, role: "admin" },
      ],
      createdBy: currentUserId,
    });

    return res.status(201).json({
      message: "Conversation created successfully",
      success: true,
      status: 201,
      Conversation: newConversation._id,
    });
  } catch (error) {
    console.error("new conversation error:", error);
    return res.status(500).json({
      message: error.message || "Failed to create new  conversation ",
      success: false,
      status: 500,
    });
  }
};

const getConversation = async (req, res) => {
  try {
    const { ConversationId } = req.params;
    const currentUserId = req.user._id;
    if (
      !mongoose.Types.ObjectId.isValid(ConversationId) ||
      !mongoose.Types.ObjectId.isValid(currentUserId)
    ) {
      return res.status(400).json({
        message: "Invalid user ID and ConversationId format",
        success: false,
        status: 400,
      });
    }

    const conversation = await Conversation.findOne({
      _id: ConversationId,
      "participants.user": currentUserId, // Ensure user is a participant
    })
      .populate({
        path: "participants.user",
        select: "username fullName profilePicture status lastSeen bio",
      })
      .populate({
        path: "createdBy",
        select: "username fullName profilePicture",
      })
      .populate({
        path: "lastMessage",
        select:
          "content contentType mediaUrl createdAt sender readBy isDeleted",
        populate: {
          path: "sender",
          select: "username profilePicture",
        },
      })
      .populate({
        path: "pinnedmessage",
        select: "content contentType mediaUrl createdAt sender readBy",
        populate: {
          path: "sender",
          select: "username profilePicture",
        },
      });

    if (!conversation) {
      return res.status(404).json({
        message: "Conversation not found",
        success: false,
        status: 404,
      });
    }
    // Process conversation for display
    const conversationObj = conversation.toObject();

    // For non-group chats, set display info to the other participant's
    if (!conversation.isGroup) {
      const otherParticipant = conversation.participants.find(
        (p) => p.user._id.toString() !== currentUserId.toString()
      );

      if (otherParticipant) {
        conversationObj.displayName =
          otherParticipant.user.username || otherParticipant.user.fullName;
        conversationObj.displayAvatar = otherParticipant.user.profilePicture;
        conversationObj.otherUser = otherParticipant.user;
      }
    } else {
      // For groups, use the group name and avatar
      conversationObj.displayName = conversation.name;
      conversationObj.displayAvatar = conversation.avatar;
    }



    // Get the role of current user in this conversation
    const currentUserParticipant = conversation.participants.find(
      (p) => p.user._id.toString() === currentUserId.toString()
    );

    conversationObj.userRole = currentUserParticipant
      ? currentUserParticipant.role
      : "member";

    return res.status(201).json({
      message: "Conversation is fetched successfully",
      success: true,
      status: 201,
      Conversation: conversationObj,
    });
  } catch (error) {
    console.error("geting conversation error:", error);
    return res.status(500).json({
      message: error.message || "Failed to get  conversation ",
      success: false,
      status: 500,
    });
  }
};

const getallconversationmessages = async (req, res) => {
  try {
    const conversationId = req.params.conversationId;
    const currentUserId = req.user._id;
    if (
      !mongoose.Types.ObjectId.isValid(conversationId) ||
      !mongoose.Types.ObjectId.isValid(currentUserId)
    ) {
      return res.status(400).json({
        message: "Invalid ID format",
        success: false,
        status: 400,
      });
    }
    const conversation = await Conversation.findOne({
      _id: conversationId,
      'participants.user': currentUserId
    });
    if (!conversation) {
      return res.status(403).json({
        message: "You don't have access to this conversation",
        success: false,
        status: 403
      });
    }
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;
    const skip = (page - 1) * limit;
    const messages = await Message.find({
      conversation: conversationId,
    })
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit)
    .populate('sender', 'username fullName profilePicture')
    .populate({
      path: 'replyTo',
      populate: {
        path: 'sender',
        select: 'username fullName profilePicture'
      }
     })
    .lean();

    return res.status(200).json({
      message: "Messages fetched successfully",
      success: true,
      status: 200,
      messages: messages.reverse(),
      pagination: {
        page,
        limit,
        hasMore: messages.length === limit
      }
    });


  } catch (error) {
    console.error("getting conversation messages error:", error);
    return res.status(500).json({
      message: error.message || "Failed to get conversation messages ",
      success: false,
      status: 500,
    });
  }
};

const createnewGroupConversation=async(req,res)=>{
  try{
    const { userIds, groupName } = req.body;
    const currentUserId = req.user._id; // Assuming you have authentication middleware

    // Validation
    if (!userIds || !Array.isArray(userIds) || userIds.length < 1) {
      return res.status(400).json({
        message: "At least one user is required to create a group",
        success: false
      });
    }

    if (!groupName || groupName.trim() === '') {
      return res.status(400).json({
        message: "Group name is required",
        success: false
      });
    }

    // Create participants array with current user as admin
    const participants = [
      {
        user: currentUserId,
        role: 'admin',
        joinedAt: new Date()
      }
    ];

    // Add other users as members
    for (const userId of userIds) {
      // Avoid adding duplicates or the current user again
      if (userId.toString() !== currentUserId.toString()) {
        participants.push({
          user: userId,
          role: 'member',
          joinedAt: new Date()
        });
      }
    }

    // Create new conversation
    const newConversation = await Conversation.create({
      name: groupName,
      isGroup: true,
      participants: participants,
      createdBy: currentUserId,
    });

    return res.status(201).json({
      message: "Group conversation created successfully",
      success: true,
      conversation: newConversation._id
    });
  }
  catch(error){
    console.error("creating new group conversation error:", error);
    return res.status(500).json({
      message: error.message || "Failed to create new group conversation ",
      success: false,
    })
  }
}

const getAllConversations = async (req, res) => {
  try {
    const userId = req.user._id;
    if (!userId) {
      return res.status(401).json({
        message: "Unauthorized",
        success: false,
        status: 401
      });
    }

    const conversations = await Conversation.find({
      'participants.user': userId
    })
      .populate({
        path: "participants.user",
        select: "username fullName profilePicture status lastSeen bio",
      })
      .populate({
        path: "lastMessage",
        select: "content contentType deliveryStatus createdAt sender",
        populate: {
          path: "sender",
          select: "username profilePicture",
        },
      });

    if (!conversations || conversations.length === 0) {
      return res.status(200).json({
        message: "No conversations found",
        success: true,
        conversations: []
      });
    }

    // Process each conversation for display
    const processedConversations = await Promise.all(conversations.map(async conversation => {
      const conversationObj = conversation.toObject();
      const currentUserId = userId.toString();

      // For non-group chats, set display info to the other participant's
      if (!conversationObj.isGroup) {
        const otherParticipant = conversationObj.participants.find(
          (p) => p.user._id.toString() !== currentUserId
        );

        if (otherParticipant && otherParticipant.user) {
          conversationObj.displayName =
            otherParticipant.user.fullName || otherParticipant.user.username;
          conversationObj.displayAvatar = otherParticipant.user.profilePicture;
          conversationObj.otherUser = otherParticipant.user;
        }
      } else {
        // For groups, use the group name and avatar
        conversationObj.displayName = conversationObj.name;
        conversationObj.displayAvatar = conversationObj.avatar;
      }

      // Get the role of current user in this conversation
      const currentUserParticipant = conversationObj.participants.find(
        (p) => p.user._id.toString() === currentUserId
      );

      conversationObj.userRole = currentUserParticipant
        ? currentUserParticipant.role
        : "member";
      
      // Count unread messages for the current user
      const unreadCount = await Message.countDocuments({
        conversation: conversation._id,
        'readBy.user': { $ne: userId },
        sender: { $ne: userId },
        isDeleted: false
      });

      conversationObj.unreadCount = unreadCount;

      return conversationObj;
    }));

    return res.status(200).json({
      message: "Conversations fetched successfully",
      success: true,
      conversations: processedConversations
    });
  }
  catch (err) {
    console.error("Error fetching all conversations:", err);
    return res.status(500).json({
      message: err.message || "Failed to fetch all conversations",
      success: false,
      status: 500
    });
  }
};

export { createnewConversation, getConversation ,getallconversationmessages,createnewGroupConversation,getAllConversations};
