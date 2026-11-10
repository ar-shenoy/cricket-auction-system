const path = require('path');
const http = require('http');
const express = require('express');
const cors = require('cors');
const { Server } = require('socket.io');

const authRoutes = require('./routes/auth');
const teamRoutes = require('./routes/teams');
const playerRoutes = require('./routes/players');
const auctionRoutes = require('./routes/auctions');
const uploadRoutes = require('./routes/upload');
const matchRoutes = require('./routes/matches');
const orgRoutes = require('./routes/orgs');
const billingRoutes = require('./routes/billing');
const analyticsRoutes = require('./routes/analytics');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*', methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'] }
});
app.set('io', io);

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
app.use('/api/analytics', analyticsRoutes);

app.get('/api/health', (req, res) => {
  res.json({ ok: true, ts: new Date().toISOString() });
});

io.on('connection', (socket) => {
  socket.on('join-auction', (auctionId) => {
    if (auctionId) socket.join(`auction-${auctionId}`);
  });
  socket.on('join-match', (matchId) => {
    if (matchId) socket.join(`match-${matchId}`);
  });
});

const PORT = process.env.PORT || 4000;
server.listen(PORT, () => {
  console.log(`AuctionScore API on :${PORT}`);
});

module.exports = { app, server, io };
