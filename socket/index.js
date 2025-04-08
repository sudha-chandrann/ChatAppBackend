import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import http from 'http';
import { Server } from 'socket.io';

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



// HTTP and WebSocket server
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
    credentials: true
  }
});
const onlineUser = new Set()
const socketUserMap = new Map();
io.on('connection', async (socket) => {

  console.log('A new client connected', socket.id);

  try {
      const token = socket.handshake.auth.token;
      if (!token) {
          console.log('No token provided');
          socket.disconnect();
          return;
      }


  } catch (error) {
      console.error('Error during authentication:', error.message);
      socket.disconnect();
  }

  socket.on('disconnect', () => {
      console.log('Client disconnected', socket.id);

  });
});


export {
  app,
  server
};
