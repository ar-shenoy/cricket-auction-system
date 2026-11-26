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
const auctionExtraRoutes = require('./routes/auctions_extra');
const uploadRoutes = require('./routes/upload');
const matchRoutes = require('./routes/matches');
const matchFixturesRoutes = require('./routes/matches_fixtures');
const orgRoutes = require('./routes/orgs');
const billingRoutes = require('./routes/billing');
const analyticsRoutes = require('./routes/analytics');
const broadcastRoutes = require('./routes/broadcast');
const seriesRoutes = require('./routes/series');
const auditRoutes = require('./routes/audit');
const tournamentRoutes = require('./routes/tournaments');
const franchiseRoutes = require('./routes/franchise');
const platformRoutes = require('./routes/platform');
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
app.use('/api/auctions', auctionExtraRoutes);
app.use('/api/upload', uploadRoutes);
app.use('/api/matches', matchRoutes);
app.use('/api/matches', matchFixturesRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/broadcast', broadcastRoutes);
app.use('/api/series', seriesRoutes);
app.use('/api/audit', auditRoutes);
app.use('/api/tournaments', tournamentRoutes);
app.use('/api/franchise', franchiseRoutes);
app.use('/api/platform', platformRoutes);

app.get('/api/health', (req, res) => {
  let counts = {};
  try {
    const store = require('./data/store');
    counts = {
      teams: (store.getTeams() || []).length,
      players: (store.getPlayers() || []).length,
      auctions: (store.getAuctions() || []).length,
      matches: (store.getMatches() || []).length,
      sold: (store.getSoldPlayers() || []).length
    };
  } catch (_) {}
  res.json({
    status: 'ok',
    message: 'Cricket Auction Backend is running',
    time: new Date().toISOString(),
    uptimeSec: Math.round(process.uptime()),
    memoryMB: Math.round(process.memoryUsage().rss / 1024 / 1024),
    saas: true,
    storage: process.env.DATABASE_URL ? 'postgres' : 'json-file',
    counts
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
  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
  });
});

app.set('io', io);

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  setInterval(() => {
    try { purgeExpiredPhotos(15); } catch (e) { console.warn('purge photos', e.message); }
  }, 6 * 60 * 60 * 1000);
});

module.exports = { app, server, io };
