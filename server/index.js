const express = require('express');
const { createServer } = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config();
const app = express();

const staticPath = path.resolve(__dirname, '.', 'build');
app.use(express.static(staticPath));

app.use(cors({
  origin: 'https://realtimechat-wn5z.onrender.com/',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

const PORT = process.env.PORT || 3000;

const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: 'https://realtimechat-wn5z.onrender.com/',
    methods: ['GET', 'POST'],
  }
});

const users = new Map();
const messages = new Map();
const typingUsers = new Map(); // Track typing status for all chats

io.on('connection', (socket) => {
  console.log('User connected:', socket.id);

  socket.on('login', ({ username }) => {
    users.set(socket.id, { username, id: socket.id, isTyping: false });
    io.emit('userList', Array.from(users.values()));
  });

  socket.on('sendMessage', ({ content, to }) => {
    const from = users.get(socket.id);
    if (!from) return;

    const message = {
      id: Date.now(),
      content,
      from: from.id,
      to,
      timestamp: new Date().toISOString(),
    };

    const chatId = [from.id, to].sort().join('-');
    if (!messages.has(chatId)) {
      messages.set(chatId, []);
    }
    messages.get(chatId).push(message);

    // Clear typing status when message is sent
    const user = users.get(socket.id);
    if (user) {
      user.isTyping = false;
      io.emit('userList', Array.from(users.values()));
    }

    if (to === 'public') {
      io.emit('message', message);
    } else {
      io.to(to).emit('message', message);
      socket.emit('message', message);
    }
  });

  socket.on('typing', ({ to, isTyping }) => {
    const user = users.get(socket.id);
    if (!user) return;

    user.isTyping = isTyping;
    io.emit('userList', Array.from(users.values()));

    const typingStatus = {
      userId: socket.id,
      username: user.username,
      isTyping,
      chatId: to
    };

    if (to === 'public') {
      socket.broadcast.emit('typingStatus', typingStatus);
    } else {
      io.to(to).emit('typingStatus', typingStatus);
    }
  });

  socket.on('getChatHistory', ({ with: withUser }) => {
    const chatId = [socket.id, withUser].sort().join('-');
    socket.emit('chatHistory', messages.get(chatId) || []);
  });

  socket.on('disconnect', () => {
    users.delete(socket.id);
    io.emit('userList', Array.from(users.values()));
    console.log('User disconnected:', socket.id);
  });
});


if(process.env.NODE_ENV === 'production') {
  app.use(express.static(staticPath));
  app.get('*', (req, res) => {
    res.sendFile(path.resolve(staticPath, 'index.html'));
  });
}

httpServer.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});