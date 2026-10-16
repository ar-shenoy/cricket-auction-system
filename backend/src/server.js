require('dotenv').config();
const express = require('express');
const http = require('http');
const path = require('path');
const { Server } = require('socket.io');
const cors = require('cors');

const authRoutes = require('./routes/auth');
const teamRoutes = require('./routes/teams');
const playerRoutes = require('./routes/players');
const auctionRoutes = require('./routes/auctions');
const uploadRoutes = require('./routes/upload');
const matchRoutes = require('./routes/matches');
const orgRoutes = require('./routes/orgs');
const billingRoutes = require('./routes/billing');
const { purgeExpiredPhotos } = require('./data/store');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH']
  }
});

app.use(cors());
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true, limit: '2mb' }));

app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

app.use('/api/auth', authRoutes);
app.use('/api/orgs', orgRoutes);
app.use('/api/billing', billingRoutes);
app.use('/api/teams', teamRoutes);
app.use('/api/players', playerRoutes);
app.use('/api/auctions', auctionRoutes);
app.use('/api/upload', uploadRoutes);
app.use('/api/matches', matchRoutes);

app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    message: 'Cricket Auction Backend is running',
    time: new Date().toISOString(),
    saas: true,
    storage: process.env.DATABASE_URL ? 'postgres' : 'json-file'
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

  socket.on('join-match', (matchId) => {
    if (matchId) {
      socket.join(`match-${matchId}`);
      socket.emit('joined-match', { matchId });
    }
  });

  socket.on('leave-match', (matchId) => {
    if (matchId) socket.leave(`match-${matchId}`);
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
  console.log(`📡 Socket.IO ready for live bidding & scoring`);
  console.log(`🏢 SaaS multi-tenant enabled`);
  console.log(`🔑 Default Admin: admin@auction.com / admin123\n`);

  const keepUrl = process.env.KEEP_ALIVE_URL;
  if (keepUrl) {
    const intervalMs = Number(process.env.KEEP_ALIVE_MS) || 10 * 60 * 1000;
    setInterval(() => {
      fetch(`${keepUrl.replace(/\/$/, '')}/api/health`).catch(() => {});
    }, intervalMs);
    console.log(`⏱️  Keep-alive enabled → ${keepUrl} every ${intervalMs / 1000}s`);
  }

  const purgeHours = Number(process.env.PHOTO_PURGE_HOURS) || 24;
  const runPurge = () => {
    try {
      const n = purgeExpiredPhotos(Number(process.env.PHOTO_RETENTION_DAYS) || 15);
      if (n > 0) console.log(`🧹 Purged ${n} expired photo/logo fields`);
    } catch (e) {
      console.error('Photo purge error', e.message);
    }
  };
  runPurge();
  setInterval(runPurge, purgeHours * 60 * 60 * 1000);
});
