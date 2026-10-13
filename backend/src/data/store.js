const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const DATA_FILE = path.join(__dirname, 'db.json');

// Default data
const defaultData = {
  users: [
    {
      id: 'admin-001',
      name: 'Super Admin',
      email: 'admin@auction.com',
      password: 'admin123', // Will be hashed on first successful login
      role: 'admin',
      teamId: null
    }
  ],
  teams: [],
  players: [],
  auctions: [],
  bids: [],
  soldPlayers: []
};

function loadData() {
  try {
    if (fs.existsSync(DATA_FILE)) {
      const raw = fs.readFileSync(DATA_FILE, 'utf8');
      return JSON.parse(raw);
    }
  } catch (err) {
    console.error('Error loading data:', err.message);
  }
  return JSON.parse(JSON.stringify(defaultData));
}

function saveData(data) {
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
  } catch (err) {
    console.error('Error saving data:', err.message);
  }
}

let db = loadData();

// Helper to always persist
function persist() {
  saveData(db);
}

module.exports = {
  getData: () => db,
  setData: (newData) => {
    db = newData;
    persist();
  },
  persist,
  // Convenience getters
  getUsers: () => db.users,
  getTeams: () => db.teams,
  getPlayers: () => db.players,
  getAuctions: () => db.auctions,
  getBids: () => db.bids,
  getSoldPlayers: () => db.soldPlayers,
  // Add helpers
  addUser: (user) => {
    user.id = user.id || uuidv4();
    db.users.push(user);
    persist();
    return user;
  },
  addTeam: (team) => {
    team.id = team.id || uuidv4();
    db.teams.push(team);
    persist();
    return team;
  },
  updateTeam: (id, updates) => {
    const idx = db.teams.findIndex(t => t.id === id);
    if (idx === -1) return null;
    db.teams[idx] = { ...db.teams[idx], ...updates };
    persist();
    return db.teams[idx];
  },
  addPlayer: (player) => {
    player.id = player.id || uuidv4();
    db.players.push(player);
    persist();
    return player;
  },
  updatePlayer: (id, updates) => {
    const idx = db.players.findIndex(p => p.id === id);
    if (idx === -1) return null;
    db.players[idx] = { ...db.players[idx], ...updates };
    persist();
    return db.players[idx];
  },
  addAuction: (auction) => {
    auction.id = auction.id || uuidv4();
    db.auctions.push(auction);
    persist();
    return auction;
  },
  updateAuction: (id, updates) => {
    const idx = db.auctions.findIndex(a => a.id === id);
    if (idx === -1) return null;
    db.auctions[idx] = { ...db.auctions[idx], ...updates };
    persist();
    return db.auctions[idx];
  },
  addBid: (bid) => {
    bid.id = bid.id || uuidv4();
    db.bids.push(bid);
    persist();
    return bid;
  },
  addSoldPlayer: (sold) => {
    sold.id = sold.id || uuidv4();
    db.soldPlayers.push(sold);
    persist();
    return sold;
  }
};
