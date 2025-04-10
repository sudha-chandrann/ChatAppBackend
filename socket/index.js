import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import http from 'http';
import { Server } from 'socket.io';
import UserRouter from "../routes/user.route.js";
import ConversationRoutes from "../routes/chat.route.js"
import { User } from '../models/user.model.js';
import { Message } from '../models/message.model.js';
import { Conversation } from '../models/chat.model.js';
const app = express();

// Middleware
app.use(cors({
  origin: process.env.CORS_ORIGIN,
  credentials: true
}));
app.use(express.json({
  limit: "16kb"
}));
app.use(express.urlencoded({
  extended: true,
  limit: "16kb"
}));
app.use(cookieParser());


app.use('/api/v1/users', UserRouter);
app.use('/api/v1/conversations', ConversationRoutes);


const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
    credentials: true
  }
});
const onlineUsers = new Map();
const socketUserMap = new Map();
io.on('connection', async (socket) => {
  console.log('A new client connected', socket.id);


  socket.on("joinUserRoom", (userId) => {
    if (userId) {
      socket.join(userId);
      onlineUsers.set(userId, socket.id);
      socketUserMap.set(socket.id, userId);      
      User.findByIdAndUpdate(userId, { status: 'online', lastSeen: new Date() })
        .then(() => {
          socket.broadcast.emit('userStatus', { userId, status: 'online' });
        })
        .catch(err => console.error('Error updating user status:', err));
    }
  });
  
  socket.on("joinConversation", (conversationId) => {
    if (conversationId) {
      socket.join(`conversation:${conversationId}`);
    }
  });

   // Handle new message
   socket.on("sendMessage", async (messageData) => {
    try {
      const { conversationId, content, contentType, mediaUrl, mediaSize, mediaName, mediaType, replyTo } = messageData;
      
      // Get user ID from socket map
      const userId = socketUserMap.get(socket.id);
      
      if (!userId) {
        socket.emit('error', { message: 'Not authenticated' });
        return;
      }

      // Create new message
      const newMessage = new Message({
        conversation: conversationId,
        sender: userId,
        content,
        contentType: contentType || 'text',
        mediaUrl: mediaUrl || '',
        mediaSize: mediaSize || 0,
        mediaName: mediaName || '',
        mediaType: mediaType || '',
        replyTo: replyTo || null,
        deliveryStatus: 'sent'
      });

      // Save message to database
      const savedMessage = await newMessage.save();
      
      // Populate sender information
      const populatedMessage = await Message.findById(savedMessage._id)
        .populate('sender', 'username profilePicture _id')
        .populate('replyTo');

      // Update last message in conversation
      await Conversation.findByIdAndUpdate(conversationId, {
        lastMessage: savedMessage._id
      });

      // Emit message to all users in the conversation
      io.to(`conversation:${conversationId}`).emit('newMessage', populatedMessage);
      
      // Get conversation to find participants
      const conversation = await Conversation.findById(conversationId)
        .populate('participants.user', '_id');
      
      // Send notification to all participants who are not the sender
      if (conversation) {
        conversation.participants.forEach(participant => {
          const participantId = participant.user._id.toString();
          if (participantId !== userId && onlineUsers.has(participantId)) {
            io.to(participantId).emit('messageNotification', {
              conversationId,
              message: populatedMessage
            });
          }
        });
      }
    } catch (error) {
      console.error('Error sending message:', error);
      socket.emit('error', { message: 'Failed to send message' });
    }
  });


  socket.on("typing", ({ conversationId, isTyping }) => {
    const userId = socketUserMap.get(socket.id);
    if (userId && conversationId) {
      socket.to(`conversation:${conversationId}`).emit('userTyping', { userId, isTyping });
    }
  });

  socket.on("markAsRead", async ({ messageId, conversationId }) => {
    try {
      const userId = socketUserMap.get(socket.id);
      if (!userId) return;
      
      const message = await Message.findById(messageId).populate('sender');
      const conversation = await Conversation.findById(conversationId).populate('participants.user');
      if (!message || !conversation) return;
      
      const userIdStr = userId.toString();
      message.readBy = message.readBy.filter(read => read && read.user);
      const alreadyRead = message.readBy.some(read => 
        read.user.toString() === userIdStr
      );
      
      if (alreadyRead) {
        const existingReadIndex = message.readBy.findIndex(read => 
          read.user.toString() === userIdStr
        );
        
        if (existingReadIndex !== -1) {
          message.readBy[existingReadIndex].readAt = new Date();
        }
      } else {
        message.readBy.push({ user: userId, readAt: new Date() });
      }
      
      const uniqueUsers = new Map();
      message.readBy.forEach(read => {
        if (read && read.user) {
          const readUserStr = read.user.toString();
          if (!uniqueUsers.has(readUserStr) || 
              new Date(read.readAt) > new Date(uniqueUsers.get(readUserStr).readAt)) {
            uniqueUsers.set(readUserStr, read);
          }
        }
      });
      
      // Replace readBy with the unique set of users
      message.readBy = Array.from(uniqueUsers.values());
      
      if (!conversation.isGroup) {
        message.deliveryStatus = 'read';
      } else {
        const totalParticipants = conversation.participants
          .filter(p => p && p.user)
          .map(p => typeof p.user === 'object' ? p.user._id.toString() : p.user.toString());
        
        const senderId = message.sender && message.sender._id ? 
          message.sender._id.toString() : null;
        
        if (senderId) {
          const othersExceptSender = totalParticipants.filter(id => id !== senderId);
          
          const alreadyReadUsers = message.readBy
            .filter(read => read && read.user)
            .map(read => typeof read.user === 'object' ? read.user._id.toString() : read.user.toString());
          
          // Check if all other participants have read the message
          const allOthersRead = othersExceptSender.length > 0 && 
            othersExceptSender.every(participantId => alreadyReadUsers.includes(participantId));
    
          message.deliveryStatus = allOthersRead ? 'read' : 'delivered';
        } else {
          message.deliveryStatus = 'delivered';
        }
      }
      
      await message.save();
      io.to(`conversation:${conversationId}`).emit('messageRead', { 
        messageId, 
        userId, 
        status: message.deliveryStatus 
      });
    } catch (error) {
      console.error('Error marking message as read:', error);
    }
  });

  socket.on('disconnect', async () => {
    console.log('Client disconnected', socket.id);
    
    // Get userId from socket
    const userId = socketUserMap.get(socket.id);
    
    if (userId) {
      // Remove from maps
      onlineUsers.delete(userId);
      socketUserMap.delete(socket.id);
      
      // Update user status to offline
      await User.findByIdAndUpdate(userId, {
        status: 'offline',
        lastSeen: new Date()
      });
      
      // Broadcast to all users that this user is offline
      io.emit('userStatus', { userId, status: 'offline' });
    }
  });
});


export {
  app,
  server
};
