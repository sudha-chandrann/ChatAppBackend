import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import http from "http";
import { Server } from "socket.io";
import UserRouter from "../routes/user.route.js";
import ConversationRoutes from "../routes/chat.route.js";
import { User } from "../models/user.model.js";
import { Message } from "../models/message.model.js";
import { Conversation } from "../models/chat.model.js";
import dotenv from "dotenv";
dotenv.config();
const app = express();

// Middleware
app.use(
  cors({
    origin: ["http://localhost:5173","http://localhost:5174",process.env.FRONTEND_URL],
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH','DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization']
  })
);
app.use(
  express.json({
    limit: "16kb",
  })
);
app.use(
  express.urlencoded({
    extended: true,
    limit: "16kb",
  })
);
app.use(cookieParser());

app.use("/api/v1/users", UserRouter);
app.use("/api/v1/conversations", ConversationRoutes);

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: ["http://localhost:5173","http://localhost:5174",process.env.FRONTEND_URL],
    credentials: true,
  },
});
const onlineUsers = new Map();
const socketUserMap = new Map();
io.on("connection", async (socket) => {
  console.log("A new client connected", socket.id);

  socket.on("joinUserRoom", (userId) => {
    if (userId) {
      socket.join(userId);
      onlineUsers.set(userId, socket.id);
      socketUserMap.set(socket.id, userId);
      User.findByIdAndUpdate(userId, { status: "online", lastSeen: new Date() })
        .then(() => {
          socket.broadcast.emit("userStatus", { userId, status: "online" });
        })
        .catch((err) => console.error("Error updating user status:", err));
    }
  });

  socket.on("joinConversation", (conversationId) => {
    if (conversationId) {
      socket.join(`conversation:${conversationId}`);
    }
  });

  socket.on("sendMessage", async (messageData) => {
    try {
      const {
        conversationId,
        content,
        contentType,
        mediaUrl,
        mediaSize,
        mediaName,
        mediaType,
        replyTo,
      } = messageData;

      const userId = socketUserMap.get(socket.id);

      if (!userId) {
        socket.emit("error", { message: "Not authenticated" });
        return;
      }

      const newMessage = new Message({
        conversation: conversationId,
        sender: userId,
        content,
        contentType: contentType || "text",
        mediaUrl: mediaUrl || "",
        mediaSize: mediaSize || 0,
        mediaName: mediaName || "",
        mediaType: mediaType || "",
        replyTo: replyTo || null,
        deliveryStatus: "sent",
      });

      const savedMessage = await newMessage.save();

      const populatedMessage = await Message.findById(savedMessage._id)
        .populate("sender", "username profilePicture _id")
        .populate({
          path: "replyTo",
          populate: {
            path: "sender",
            select: "username profilePicture _id",
          },
        });

      await Conversation.findByIdAndUpdate(conversationId, {
        lastMessage: savedMessage._id,
      });

      io.to(`conversation:${conversationId}`).emit("newMessage", {
        conversationId: conversationId,
        message: populatedMessage,
      });

      const conversation = await Conversation.findById(conversationId).populate(
        "participants.user",
        "_id"
      );
      if (conversation) {
        conversation.participants.forEach((participant) => {
          const participantId = participant.user._id.toString();
          if (participantId !== userId && onlineUsers.has(participantId)) {
            io.to(participantId).emit("messageNotification", {
              conversationId,
              noofunreadmessage: 1,
            });
          }
        });
      }

      if (conversation) {
        conversation.participants.forEach((participant) => {
          const participantId = participant.user._id.toString();
          if (onlineUsers.has(participantId)) {
            io.to(participantId).emit("sendmessageNotification", {
              conversationId,
              message: populatedMessage,
            });
          }
        });
      }
    } catch (error) {
      console.error("Error sending message:", error);
      socket.emit("error", { message: "Failed to send message" });
    }
  });

  socket.on("typing", ({ conversationId, isTyping }) => {
    const userId = socketUserMap.get(socket.id);
    if (userId && conversationId) {
      socket
        .to(`conversation:${conversationId}`)
        .emit("userTyping", { userId, isTyping });
    }
  });

  socket.on("markAsRead", async ({ messageId, conversationId }) => {
    try {
      const userId = socketUserMap.get(socket.id);
      if (!userId) return;

      const message = await Message.findById(messageId).populate("sender");
      const conversation = await Conversation.findById(conversationId).populate(
        "participants.user"
      );
      if (!message || !conversation) return;

      const userIdStr = userId.toString();
      message.readBy = message.readBy.filter((read) => read && read.user);
      const alreadyRead = message.readBy.some(
        (read) => read.user.toString() === userIdStr
      );

      if (alreadyRead) {
        const existingReadIndex = message.readBy.findIndex(
          (read) => read.user.toString() === userIdStr
        );

        if (existingReadIndex !== -1) {
          message.readBy[existingReadIndex].readAt = new Date();
        }
      } else {
        message.readBy.push({ user: userId, readAt: new Date() });
      }

      const uniqueUsers = new Map();
      message.readBy.forEach((read) => {
        if (read && read.user) {
          const readUserStr = read.user.toString();
          if (
            !uniqueUsers.has(readUserStr) ||
            new Date(read.readAt) >
              new Date(uniqueUsers.get(readUserStr).readAt)
          ) {
            uniqueUsers.set(readUserStr, read);
          }
        }
      });

      // Replace readBy with the unique set of users
      message.readBy = Array.from(uniqueUsers.values());

      if (!conversation.isGroup) {
        message.deliveryStatus = "read";
      } else {
        const totalParticipants = conversation.participants
          .filter((p) => p && p.user)
          .map((p) =>
            typeof p.user === "object"
              ? p.user._id.toString()
              : p.user.toString()
          );

        const senderId =
          message.sender && message.sender._id
            ? message.sender._id.toString()
            : null;

        if (senderId) {
          const othersExceptSender = totalParticipants.filter(
            (id) => id !== senderId
          );

          const alreadyReadUsers = message.readBy
            .filter((read) => read && read.user)
            .map((read) =>
              typeof read.user === "object"
                ? read.user._id.toString()
                : read.user.toString()
            );

          // Check if all other participants have read the message
          const allOthersRead =
            othersExceptSender.length > 0 &&
            othersExceptSender.every((participantId) =>
              alreadyReadUsers.includes(participantId)
            );

          message.deliveryStatus = allOthersRead ? "read" : "delivered";
        } else {
          message.deliveryStatus = "delivered";
        }
      }

      await message.save();
      io.to(`conversation:${conversationId}`).emit("messageRead", {
        messageId,
        userId,
        status: message.deliveryStatus,
      });
      if (conversation) {
        conversation.participants.forEach((participant) => {
          const participantId = participant.user._id.toString();
          if (participantId === userId && onlineUsers.has(participantId)) {
            io.to(participantId).emit("markNotificationread", {
              conversationId,
            });
          }
        });
      }
    } catch (error) {
      console.error("Error marking message as read:", error);
    }
  });

  socket.on("addReaction", async ({ messageId, emoji }) => {
    try {
      console.log(" the reaction is ", emoji);

      const userId = socketUserMap.get(socket.id);
      if (!userId) {
        socket.emit("error", { message: "Not authenticated" });
        return;
      }
      console.log(" the reaction is ", emoji);
      // Find the message
      const message = await Message.findById(messageId);
      if (!message) {
        socket.emit("error", { message: "Message not found" });
        return;
      }

      // Check if user already reacted with the same emoji
      const existingReactionIndex = message.reactions.findIndex(
        (r) => r.user.toString() === userId.toString() && r.emoji === emoji
      );

      if (existingReactionIndex !== -1) {
        message.reactions.splice(existingReactionIndex, 1);
      } else {
        message.reactions.push({
          user: userId,
          emoji,
          createdAt: new Date(),
        });
      }

      await message.save();

      // Get the updated message with populated fields
      const populatedMessage = await Message.findById(messageId)
        .populate("sender", "username profilePicture _id")
        .populate("reactions.user", "username profilePicture _id");

      io.to(`conversation:${message.conversation}`).emit("messageReaction", {
        messageId,
        reactions: populatedMessage.reactions,
      });
    } catch (error) {
      console.error("Error adding reaction:", error);
      socket.emit("error", { message: "Failed to add reaction" });
    }
  });

  socket.on("deleteMessage", async ({ messageId, conversationId }) => {
    try {
      const userId = socketUserMap.get(socket.id);
      if (!userId) {
        socket.emit("error", { message: "Not authenticated" });
        return;
      }

      const message = await Message.findById(messageId);
      if (!message) {
        socket.emit("error", { message: "Message not found" });
        return;
      }

      // Check if the user is authorized to delete this message
      if (message.sender.toString() !== userId.toString()) {
        socket.emit("error", {
          message: "Unauthorized to delete this message",
        });
        return;
      }

      // Soft delete the message
      message.isDeleted = true;
      message.deletedAt = new Date();
      message.content = "This message was deleted";
      message.contentType = "text";
      message.mediaUrl = "";
      message.mediaName = "";
      message.mediaSize = 0;
      message.mediaType = "";
      message.readBy = message.readBy.filter((entry) => entry.user);
      await message.save();
      const updatedmessage = await Message.findById(messageId).populate(
        "sender",
        "username fullName profilePicture"
      );

      // Emit to all users in the conversation
      io.to(`conversation:${conversationId}`).emit("messageDeleted", {
        messageId,
        conversationId,
        message: updatedmessage,
      });
    } catch (error) {
      console.error("Error deleting message:", error);
      socket.emit("error", { message: "Failed to delete message" });
    }
  });

  socket.on("forwardMessage", async ({ messageId, targetConversationIds }) => {
    try {
      const userId = socketUserMap.get(socket.id);
      if (!userId) {
        socket.emit("error", { message: "Not authenticated" });
        return;
      }

      const originalMessage = await Message.findById(messageId).populate(
        "sender",
        "username fullName profilePicture _id"
      );

      if (!originalMessage) {
        socket.emit("error", { message: "Message not found" });
        return;
      }

      const forwardedMessages = [];

      // Forward to each target conversation
      for (const conversationId of targetConversationIds) {
        const conversation = await Conversation.findById(conversationId);
        const isParticipant = conversation.participants.some(
          (p) => p.user.toString() === userId.toString()
        );

        if (!isParticipant) {
          continue; // Skip this conversation
        }

        // Create new forwarded message
        const newMessage = new Message({
          conversation: conversationId,
          sender: userId,
          content: originalMessage.content,
          contentType: originalMessage.contentType,
          mediaUrl: originalMessage.mediaUrl,
          mediaSize: originalMessage.mediaSize,
          mediaName: originalMessage.mediaName,
          mediaType: originalMessage.mediaType,
          isForwarded: true,
          forwardedFrom: messageId,
          deliveryStatus: "sent",
        });

        const savedMessage = await newMessage.save();

        // Update last message in conversation
        await Conversation.findByIdAndUpdate(conversationId, {
          lastMessage: savedMessage._id,
        });

        // Populate message data
        const populatedMessage = await Message.findById(savedMessage._id)
          .populate("sender", "username profilePicture _id")
          .populate("forwardedFrom");

        forwardedMessages.push(populatedMessage);

        // Emit to all users in the target conversation
        io.to(`conversation:${conversationId}`).emit(
          "newMessage",
          populatedMessage
        );

        // Send notification to all participants
        conversation.participants.forEach((participant) => {
          const participantId = participant.user.toString();
          if (participantId !== userId && onlineUsers.has(participantId)) {
            io.to(participantId).emit("messageNotification", {
              conversationId,
              message: populatedMessage,
            });
          }
        });
      }

      // Confirm successful forwarding to sender
      socket.emit("messageForwarded", {
        success: true,
        count: forwardedMessages.length,
      });
    } catch (error) {
      console.error("Error forwarding message:", error);
      socket.emit("error", { message: "Failed to forward message" });
    }
  });
  socket.on(
    "editMessage",
    async ({ messageId, conversationId, newContent }) => {
      try {
        const userId = socketUserMap.get(socket.id);
        if (!userId) {
          socket.emit("error", { message: "Not authenticated" });
          return;
        }
        const message = await Message.findById(messageId);
        if (!message) {
          socket.emit("error", { message: "Message not found" });
          return;
        }
        if (message.sender.toString() !== userId.toString()) {
          socket.emit("error", {
            message: "Unauthorized to edit this message",
          });
          return;
        }
        if (message.contentType !== "text") {
          socket.emit("error", { message: "Only text messages can be edited" });
          return;
        }

        // Check if the message is already deleted
        if (message.isDeleted) {
          socket.emit("error", { message: "Cannot edit a deleted message" });
          return;
        }

        message.editHistory.push({
          content: message.content,
          editedAt: new Date(),
        });

        message.content = newContent;
        message.isEdited = true;

        await message.save();

        const updatedMessage = await Message.findById(messageId)
          .populate("sender", "username fullName profilePicture _id")
          .populate({
            path: "replyTo",
            populate: {
              path: "sender",
              select: "username profilePicture _id",
            },
          });

        // Emit to all users in the conversation
        io.to(`conversation:${conversationId}`).emit("messageEdited", {
          messageId,
          ConversationId: conversationId,
          message: updatedMessage,
        });

        // Emit to sender to confirm edit
        socket.emit("editSuccess", { messageId });
      } catch (error) {
        console.error("Error editing message:", error);
        socket.emit("error", { message: "Failed to edit message" });
      }
    }
  );
  socket.on("pinnedMessage", async ({ messageId, conversationId }) => {
    try {
      const userId = socketUserMap.get(socket.id);
      if (!userId) {
        socket.emit("error", { message: "Not authenticated" });
        return;
      }
      const message = await Message.findById(messageId);
      if (!message) {
        socket.emit("error", { message: "Message not found" });
        return;
      }

      if (message.isDeleted) {
        socket.emit("error", { message: "Cannot pin a deleted message" });
        return;
      }

      const conversation = await Conversation.findById(conversationId);
      if (!conversation) {
        socket.emit("error", { message: "Conversation not found" });
        return;
      }
      const isParticipant = conversation.participants.some(
        (participant) => participant.user.toString() === userId.toString()
      );

      if (!isParticipant) {
        socket.emit("error", {
          message: "You are not a participant in this conversation",
        });
        return;
      }

      const isPinned = conversation.pinnedmessage.some(
        (pinnedId) => pinnedId.toString() === messageId.toString()
      );
      if (isPinned) {
        conversation.pinnedmessage = conversation.pinnedmessage.filter(
          (pinnedId) => pinnedId.toString() !== messageId.toString()
        );
        await conversation.save();
        message.isPinned = false;
        await message.save();
        io.to(`conversation:${conversationId}`).emit("messageUnpinned", {
          messageId,
          conversationId,
        });

        // Confirm to sender
        socket.emit("unpinSuccess", { messageId });
      } else {
        // Pin the message
        conversation.pinnedmessage.push(messageId);
        await conversation.save();
        message.isPinned = true;
        await message.save();

        const updatedMessage = await Message.findById(messageId).populate(
          "sender",
          "username fullName profilePicture _id"
        );

        io.to(`conversation:${conversationId}`).emit("messagePinned", {
          messageId,
          conversationId,
          message: updatedMessage,
        });

        // Confirm to sender
        socket.emit("pinSuccess", { messageId });
      }
    } catch (error) {
      console.error("Error handling pinned message:", error);
      socket.emit("error", { message: "Failed to pin/unpin message" });
    }
  });
  socket.on("muteConversation", async ({ conversationId }) => {
    try {
      const userId = socketUserMap.get(socket.id);

      if (!userId) {
        socket.emit("error", { message: "Not authenticated" });
        return;
      }

      const conversation = await Conversation.findById(conversationId);
      if (!conversation) {
        socket.emit("error", { message: "Conversation not found" });
        return;
      }

      const isParticipant = conversation.participants.some(
        (participant) => participant.user.toString() === userId.toString()
      );

      if (!isParticipant) {
        socket.emit("error", {
          message: "You are not a participant in this conversation",
        });
        return;
      }

      const isAlreadyMuted = conversation.muted.some(
        (mutedUserId) => mutedUserId.toString() === userId.toString()
      );

      if (isAlreadyMuted) {
        // Unmute
        conversation.muted = conversation.muted.filter(
          (mutedUserId) => mutedUserId.toString() !== userId.toString()
        );

        await conversation.save();

        io.to(`conversation:${conversationId}`).emit("unmuted", {
          userId,
          conversationId,
        });
      } else {
        // Mute
        conversation.muted.push(userId);

        await conversation.save();

        io.to(`conversation:${conversationId}`).emit("muted", {
          userId,
          conversationId,
        });
      }
    } catch (error) {
      console.error("Error handling mute conversation:", error);
      socket.emit("error", {
        message: "Failed to mute/unmute the conversation",
      });
    }
  });
  socket.on("addnewmember", async ({ conversationId, newuserIds }) => {
    try {
      const userId = socketUserMap.get(socket.id);
      if (!userId) {
        socket.emit("error", { message: "Not authenticated" });
        return;
      }
      const conversation = await Conversation.findById(conversationId);
      if (!conversation) {
        socket.emit("error", { message: "Conversation not found" });
        return;
      }

      const currentParticipant = conversation.participants.find(
        (p) => p.user.toString() === userId && p.role === "admin"
      );

      if (!currentParticipant) {
        socket.emit("error", {
          message: "Only admins can add new members to the conversation",
        });
        return;
      }

      const existingUserIds = conversation.participants.map((p) =>
        p.user.toString()
      );
      const newUsersToAdd = newuserIds.filter(
        (id) => !existingUserIds.includes(id)
      );
      if (newUsersToAdd.length === 0) {
        socket.emit("info", {
          message: "All selected users are already participants",
        });
        return;
      }

      newUsersToAdd.forEach((id) => {
        conversation.participants.push({
          user: id,
          role: "member",
          joinedAt: new Date(),
        });
      });

      await conversation.save();

      const updatedConversation = await Conversation.findById(
        conversationId
      ).populate(
        "participants.user",
        "username profilePicture fullName bio lastSeen status"
      );

      // Emit event to all participants using the updated conversation
      updatedConversation.participants.forEach((participant) => {
        const participantId = participant.user._id.toString();
        if (participantId) {
          io.to(participantId).emit("newmemberaddedtoconversation", {
            conversationId,
            participants: updatedConversation.participants,
          });
        }
      });
    } catch (error) {
      console.error("Error handling add new member:", error);
      socket.emit("error", {
        message: "Failed to add new member",
      });
    }
  });
  socket.on("removeMember", async ({ conversationId, memberId }) => {
    try {
      const userId = socketUserMap.get(socket.id);
      if (!userId) {
        socket.emit("error", { message: "Not authenticated" });
        return;
      }
      const conversation = await Conversation.findById(conversationId);
      if (!conversation) {
        socket.emit("error", {
          message: "Conversation not found",
        });
      }
      const currentParticipant = conversation.participants.find(
        (p) => p.user.toString() === userId && p.role === "admin"
      );

      if (!currentParticipant) {
        socket.emit("error", {
          message: "Only admins can add new members to the conversation",
        });
        return;
      }
      const memberToRemove = conversation.participants.find(
        (p) => p.user.toString() === memberId
      );
      if (!memberToRemove) {
        socket.emit("error", {
          message: "Member not found",
        });
        return;
      }
      conversation.participants = conversation.participants.filter(
        (p) => p.user.toString() !== memberId
      );
      await conversation.save();
      const updatedConversation = await Conversation.findById(
        conversationId
      ).populate(
        "participants.user",
        "username profilePicture fullName bio lastSeen status"
      );

      updatedConversation.participants.forEach((participant) => {
        const participantId = participant.user._id.toString();
        if (participantId) {
          io.to(participantId).emit("memberremovedFromConversation", {
            conversationId,
            removedUserId: memberId,
          });
        }
      });
      io.to(memberId).emit("memberremovedFromConversation", {
        conversationId,
        removedUserId: memberId,
      });
    } catch (err) {
      console.error("Error handling remove member:", err);
      socket.emit("error", {
        message: "Failed to remove member",
      });
    }
  });
  socket.on("makememberadmin", async ({ conversationId, memberId }) => {
    try {
      const userId = socketUserMap.get(socket.id);
      if (!userId) {
        socket.emit("error", { message: "Not authenticated" });
        return;
      }

      const conversation = await Conversation.findById(conversationId);
      if (!conversation) {
        socket.emit("error", { message: "Conversation not found" });
        return;
      }

      // Check if current user is admin
      const currentParticipant = conversation.participants.find(
        (p) => p.user.toString() === userId && p.role === "admin"
      );

      if (!currentParticipant) {
        socket.emit("error", {
          message: "Only admins can make other members admins",
        });
        return;
      }

      // Find the member to promote
      const memberToPromote = conversation.participants.find(
        (p) => p.user.toString() === memberId
      );

      if (!memberToPromote) {
        socket.emit("error", {
          message: "Member not found in this conversation",
        });
        return;
      }

      // Promote to admin
      memberToPromote.role = "admin";
      await conversation.save();

      // Re-fetch updated conversation with user details
      const updatedConversation = await Conversation.findById(
        conversationId
      ).populate(
        "participants.user",
        "username profilePicture fullName bio lastSeen status"
      );

      // Notify all participants
      updatedConversation.participants.forEach((participant) => {
        const participantId = participant.user._id.toString();
        if (participantId) {
          io.to(participantId).emit("membertoadmin", {
            conversationId,
            promotedUserId: memberId,
          });
        }
      });
    } catch (err) {
      console.error("Error handling makememberadmin:", err);
      socket.emit("error", {
        message: "Failed to make member admin",
      });
    }
  });
  socket.on("leavetheconversation", async ({ conversationId }) => {
    try {
      const userId = socketUserMap.get(socket.id);
      if (!userId) {
        socket.emit("error", { message: "Not authenticated" });
        return;
      }

      const conversation = await Conversation.findById(conversationId);
      if (!conversation) {
        socket.emit("error", { message: "Conversation not found" });
        return;
      }

      const participantIndex = conversation.participants.findIndex(
        (p) => p.user.toString() === userId
      );

      if (participantIndex === -1) {
        socket.emit("error", {
          message: "User is not a participant in this conversation",
        });
        return;
      }

      const leavingUser = conversation.participants[participantIndex];
      const isAdmin = leavingUser.role === "admin";

      // Remove user from participants
      conversation.participants.splice(participantIndex, 1);

      // Handle empty conversation
      if (conversation.participants.length === 0) {
        await Conversation.findByIdAndDelete(conversationId);
        await Message.deleteMany({ conversation: conversationId });

        io.to(userId).emit("conversationleaved", {
          conversationId,
          leaveduser: userId,
          deleted: true,
        });
        return;
      }

      // Handle admin reassignment if needed
      if (isAdmin) {
        const otherAdmins = conversation.participants.filter(
          (p) => p.role === "admin"
        );
        if (otherAdmins.length === 0) {
          conversation.participants[0].role = "admin";
        }
      }

      await conversation.save();

      // Populate user information for sending notifications
      const updatedConversation = await Conversation.findById(
        conversationId
      ).populate(
        "participants.user",
        "username profilePicture fullName bio lastSeen status"
      );

      // Notify all participants including the one who left
      updatedConversation.participants.forEach((participant) => {
        const participantId = participant.user._id.toString();
        io.to(participantId).emit("conversationleaved", {
          conversationId,
          leaveduser: userId,
          deleted: false,
        });
      });

      io.to(userId).emit("conversationleaved", {
        conversationId,
        leaveduser: userId,
        deleted: false,
      });
    } catch (err) {
      console.error("Error handling leave the conversation:", err);
      socket.emit("error", {
        message: "Failed to leave the conversation",
      });
    }
  });
  socket.on("deletetheConversation", async ({ conversationId }) => {
    try {
      const userId = socketUserMap.get(socket.id);
      if (!userId) {
        socket.emit("error", { message: "Not authenticated" });
        return;
      }

      const conversation = await Conversation.findById(conversationId);
      if (!conversation) {
        socket.emit("error", { message: "Conversation not found" });
        return;
      }
      const currentParticipant = conversation.participants.find(
        (p) => p.user.toString() === userId && p.role === "admin"
      );

      if (!currentParticipant) {
        socket.emit("error", {
          message: "Only admins can delete  the conversation",
        });
        return;
      }

      const existingUserIds = conversation.participants.map((p) =>
        p.user.toString()
      );

      await Conversation.findByIdAndDelete(conversationId);
      await Message.deleteMany({ conversation: conversationId });
      existingUserIds.forEach((participant) => {
        const participantId = participant.toString();
        if (participantId) {
          io.to(participantId).emit("deletedtheconversation", {
            conversationId,
          });
        }
      });
    } catch (err) {
      console.error("Error handling delete the conversation:", err);
      socket.emit("error", {
        message: "Failed to delete the conversation",
      });
    }
  });

  socket.on(
    "EditTheProfilePicture",
    async ({ conversationId, uploadedphoto }) => {
      try {
        console.log(" the profile picture is ", uploadedphoto);
        const userId = socketUserMap.get(socket.id);
        if (!userId) {
          socket.emit("error", { message: "Not authenticated" });
        }
        const conversation = await Conversation.findById(conversationId);
        if (!conversation) {
          socket.emit("error", { message: "Conversation not found" });
        }
        const currentParticipant = conversation.participants.find(
          (p) => p.user.toString() === userId && p.role === "admin"
        );
        if (!currentParticipant) {
          socket.emit("error", {
            message: "Only admins can edit the profile picture",
          });
        }
        conversation.avatar = uploadedphoto;
        await conversation.save();
        const updatedConversation = await Conversation.findById(
          conversationId
        ).populate(
          "participants.user",
          "username profilePicture fullName bio lastSeen status"
        );

        updatedConversation.participants.forEach((participant) => {
          const participantId = participant.user._id.toString();
          if (participantId) {
            io.to(participantId).emit("updatedProfilePicture", {
              conversationId,
              profilePicture: uploadedphoto,
            });
          }
        });
      } catch (err) {
        console.error("Error handling edit the profile picture:", err);
        socket.emit("error", {
          message: "Failed to edit the profile picture",
        });
      }
    }
  );

  socket.on("EditGroupInfo", async ({ conversationId ,data}) => {
    try {
      console.log(" the data is ",data);
      const userId = socketUserMap.get(socket.id);
      if (!userId) {
        socket.emit("error", { message: "Not authenticated" });
      }
      const conversation = await Conversation.findById(conversationId);
      if (!conversation) {
        socket.emit("error", { message: "Conversation not found" });
      }
      const currentParticipant = conversation.participants.find(
        (p) => p.user.toString() === userId && p.role === "admin"
      );
      if (!currentParticipant) {
        socket.emit("error", {
          message: "Only admins can edit the group info",
        });
      }
      conversation.name=data.name;
      conversation.description=data.displaydescription;
      await conversation.save();
      const updatedConversation = await Conversation.findById(
        conversationId
      ).populate(
        "participants.user",
        "username profilePicture fullName bio lastSeen status"
      );

      updatedConversation.participants.forEach((participant) => {
        const participantId = participant.user._id.toString();
        if (participantId) {
          io.to(participantId).emit("updatedGroupInfo", {
            conversationId,
            name:updatedConversation.name,
            description:updatedConversation.description,
          });
        }
      });
    } catch (err) {
      console.error("Error handling edit the group info:", err);
      socket.emit("error", {
        message: "Failed to edit the group info",
      });
    }
  });

  socket.on("disconnect", async () => {
    console.log("Client disconnected", socket.id);

    // Get userId from socket
    const userId = socketUserMap.get(socket.id);

    if (userId) {
      // Remove from maps
      onlineUsers.delete(userId);
      socketUserMap.delete(socket.id);

      // Update user status to offline
      await User.findByIdAndUpdate(userId, {
        status: "offline",
        lastSeen: new Date(),
      });

      // Broadcast to all users that this user is offline
      io.emit("userStatus", { userId, status: "offline" });
    }
  });
});

export { app, server };
