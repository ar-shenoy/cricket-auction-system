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

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use('/api/auth', authRoutes);
app.use('/api/teams', teamRoutes);
app.use('/api/players', playerRoutes);
app.use('/api/auctions', auctionRoutes);

app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    message: 'Cricket Auction Backend is running',
    time: new Date().toISOString()
  });
});

io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);

  socket.on('join-auction', (auctionId) => {
    if (auctionId) {
      socket.join(`auction-${auctionId}`);
      socket.emit('joined', { auctionId });
    }
  });

  socket.on('leave-auction', (auctionId) => {
    if (auctionId) socket.leave(`auction-${auctionId}`);
  });

  socket.on('request-state', (auctionId) => {
    socket.emit('state-requested', { auctionId });
  });

  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
  });
});

app.set('io', io);

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`\n🚀 Cricket Auction Backend running on http://localhost:${PORT}`);
  console.log(`📡 Socket.IO ready for live bidding`);
  console.log(`🔑 Default Admin: admin@auction.com / admin123\n`);

  // Optional: ping self every 10 min to reduce free-tier sleep (set KEEP_ALIVE_URL to public URL)
  const keepUrl = process.env.KEEP_ALIVE_URL;
  if (keepUrl) {
    const intervalMs = Number(process.env.KEEP_ALIVE_MS) || 10 * 60 * 1000;
    setInterval(() => {
      fetch(`${keepUrl.replace(/\/$/, '')}/api/health`).catch(() => {});
    }, intervalMs);
    console.log(`⏱️  Keep-alive enabled → ${keepUrl} every ${intervalMs / 1000}s`);
  }
});
