require('dotenv').config();
const express = require('express');
const cors = require('cors');
const http = require('http');
const socketIo = require('socket.io');
const jwt = require('jsonwebtoken');

// Load mongoose schemas in case Mongoose is active
require('./models/Message');

const { connectDB, MessageModel } = require('./db');

const app = express();
const PORT = process.env.PORT || 5003;
const JWT_SECRET = process.env.JWT_SECRET || 'beaver_jwt_secret_key_99';
const AI_SERVICE_URL = process.env.AI_SERVICE_URL || 'http://localhost:5005/api/ai/chat';

const ALLOWED_ORIGINS = [
  'https://beaver-nekh.vercel.app',
  'http://localhost:5173',
  'http://localhost:3000'
];
app.use(cors({
  origin: (origin, cb) => cb(null, !origin || ALLOWED_ORIGINS.includes(origin)),
  credentials: true
}));
app.use(express.json());

// Initialize DB
connectDB();

const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: ALLOWED_ORIGINS,
    methods: ['GET', 'POST'],
    credentials: true
  }
});

// HTTP API: Fetch Message History
app.get('/api/chat/:workspaceCode', async (req, res) => {
  try {
    const code = req.params.workspaceCode.toUpperCase();
    const messages = await MessageModel.find({ workspaceCode: code });
    res.json(messages);
  } catch (error) {
    console.error('Fetch chat logs error:', error);
    res.status(500).json({ message: 'Internal Server Error' });
  }
});

// Socket.io JWT Authentication Middleware
io.use((socket, next) => {
  const token = socket.handshake.auth?.token;
  if (!token) {
    return next(new Error('Authentication token required'));
  }

  jwt.verify(token, JWT_SECRET, (err, decodedUser) => {
    if (err) {
      return next(new Error('Invalid token'));
    }
    socket.user = decodedUser;
    next();
  });
});

// Socket Connections
io.on('connection', (socket) => {
  console.log(`🔌 [Chat-Service] Socket connected: ${socket.user.name} (${socket.id})`);

  // Join Room Channel
  socket.on('join_workspace', async ({ workspaceCode }) => {
    const code = workspaceCode.toUpperCase();
    socket.join(code);
    console.log(`📁 [Chat-Service] User ${socket.user.name} joined room: ${code}`);
  });

  // Receive Message from User
  socket.on('send_message', async ({ workspaceCode, text }) => {
    try {
      const code = workspaceCode.toUpperCase();
      
      // Save Message to DB
      const userMessage = await MessageModel.create({
        workspaceCode: code,
        sender: {
          id: socket.user.id,
          name: socket.user.name,
          email: socket.user.email,
          employeeId: socket.user.employeeId,
          role: socket.user.role
        },
        text,
        isAi: false
      });

      // Broadcast user message to room
      io.to(code).emit('new_message', userMessage);

      // Check if message triggers AI Bot:
      // Triggers if message mentions '@ai' or '@AI'
      if (text.toLowerCase().includes('@ai')) {
        // Emit "typing" indicator for AI
        io.to(code).emit('ai_typing', { active: true, workspaceCode: code });

        // Query AI Service
        try {
          const response = await fetch(AI_SERVICE_URL, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              message: text.replace(/@ai/gi, '').trim(),
              workspaceCode: code,
              user: socket.user
            })
          });
          
          const aiData = await response.json();
          const aiReply = aiData.reply || "Greetings! I'm here to support your workspace operations. Let me know how I can assist.";

          // Stop typing indicator
          io.to(code).emit('ai_typing', { active: false, workspaceCode: code });

          // Save AI Response to DB
          const aiMessage = await MessageModel.create({
            workspaceCode: code,
            sender: {
              id: 'ai-assistant-bot',
              name: 'Beaver AI',
              email: 'ai@beaver.workspace',
              role: 'AI Companion'
            },
            text: aiReply,
            isAi: true
          });

          // Broadcast AI Message to room
          io.to(code).emit('new_message', aiMessage);
        } catch (aiErr) {
          console.error('Error fetching AI response:', aiErr);
          io.to(code).emit('ai_typing', { active: false, workspaceCode: code });
          
          // Broadcast fallback offline message
          const offlineMessage = await MessageModel.create({
            workspaceCode: code,
            sender: {
              id: 'ai-assistant-bot',
              name: 'Beaver AI',
              email: 'ai@beaver.workspace',
              role: 'AI Companion'
            },
            text: "⚠️ Core AI service is currently running offline or rebooting. Please double-check network access.",
            isAi: true
          });
          io.to(code).emit('new_message', offlineMessage);
        }
      }
    } catch (e) {
      console.error('Error handling socket message:', e);
    }
  });

  // Receive Task/File Changed notification from User and broadcast to all members in room
  socket.on('task_changed', ({ workspaceCode }) => {
    try {
      const code = workspaceCode.toUpperCase();
      console.log(`📋 [Chat-Service] Task/File changed event in room: ${code}. Broadcasting sync_kanban.`);
      socket.to(code).emit('sync_kanban', { workspaceCode: code });
    } catch (e) {
      console.error('Error handling socket task_changed:', e);
    }
  });

  socket.on('disconnect', () => {
    console.log(`🔌 [Chat-Service] Socket disconnected: ${socket.id}`);
  });
});

server.listen(PORT, () => {
  console.log(`🚀 [Chat-Service] running on http://localhost:${PORT}`);
});
