require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const authRoutes = require('./routes/auth');
const teamRoutes = require('./routes/teams');
const playerRoutes = require('./routes/players');
const auctionRoutes = require('./routes/auctions');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH']
  }
});

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/teams', teamRoutes);
app.use('/api/players', playerRoutes);
app.use('/api/auctions', auctionRoutes);

// Health check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    message: 'Cricket Auction Backend is running',
    time: new Date().toISOString()
  });
});

// ==================== SOCKET.IO ====================
io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);

  // Join a specific auction room
  socket.on('join-auction', (auctionId) => {
    if (auctionId) {
      socket.join(`auction-${auctionId}`);
      console.log(`Socket ${socket.id} joined auction-${auctionId}`);
      socket.emit('joined', { auctionId });
    }
  });

  // Leave auction room
  socket.on('leave-auction', (auctionId) => {
    if (auctionId) {
      socket.leave(`auction-${auctionId}`);
    }
  });

  // Client can request current state
  socket.on('request-state', (auctionId) => {
    // Routes already push updates; this is just a ping
    socket.emit('state-requested', { auctionId });
  });

  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
  });
});

// Make io available to routes
app.set('io', io);

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`\n🚀 Cricket Auction Backend running on http://localhost:${PORT}`);
  console.log(`📡 Socket.IO ready for live bidding`);
  console.log(`🔑 Default Admin: admin@auction.com / admin123\n`);
});
