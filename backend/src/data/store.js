const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const DATA_FILE = path.join(__dirname, 'db.json');
const DEFAULT_ORG_ID = 'org-default';

const defaultData = {
  organizations: [
    {
      id: DEFAULT_ORG_ID,
      name: 'Default League',
      slug: 'default',
      plan: 'free',
      planExpiresAt: null,
      razorpaySubId: null,
      createdAt: new Date().toISOString()
    }
  ],
  users: [
    {
      id: 'admin-001',
      name: 'League Admin',
      email: 'admin@auction.com',
      password: 'admin123',
      role: 'admin',
      teamId: null,
      orgId: DEFAULT_ORG_ID
    },
    {
      id: 'dev-001',
      name: 'Platform Developer',
      email: 'developer@auction.com',
      password: 'devxai2026',
      role: 'developer',
      teamId: null,
      orgId: DEFAULT_ORG_ID
    }
  ],
  teams: [],
  players: [],
  auctions: [],
  bids: [],
  soldPlayers: [],
  matches: [],
  payments: []
};

function loadData() {
  try {
    if (fs.existsSync(DATA_FILE)) {
      const raw = fs.readFileSync(DATA_FILE, 'utf8');
      const data = JSON.parse(raw);
      if (!Array.isArray(data.organizations) || data.organizations.length === 0) {
        data.organizations = JSON.parse(JSON.stringify(defaultData.organizations));
      }
      if (!Array.isArray(data.matches)) data.matches = [];
      if (!Array.isArray(data.payments)) data.payments = [];
      const orgId = data.organizations[0]?.id || DEFAULT_ORG_ID;
      ['users', 'teams', 'players', 'auctions', 'bids', 'soldPlayers', 'matches'].forEach(key => {
        if (!Array.isArray(data[key])) data[key] = [];
        data[key].forEach(row => {
          if (!row.orgId) row.orgId = orgId;
        });
      });
      return data;
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

function persist() {
  saveData(db);
}

(function ensureDeveloper() {
  if (!Array.isArray(db.users)) db.users = [];
  let exists = db.users.find(u => u.email === 'developer@auction.com' || u.id === 'dev-001');
  if (!exists) {
    db.users.push({
      id: 'dev-001',
      name: 'Platform Developer',
      email: 'developer@auction.com',
      password: 'devxai2026',
      role: 'developer',
      teamId: null,
      orgId: (db.organizations && db.organizations[0] && db.organizations[0].id) || DEFAULT_ORG_ID
    });
    persist();
  } else if (exists.role !== 'developer') {
    exists.role = 'developer';
    persist();
  }
})();

function byOrg(arr, orgId) {
  if (!orgId) return arr || [];
  return (arr || []).filter(x => x.orgId === orgId || (!x.orgId && orgId === DEFAULT_ORG_ID));
}

module.exports = {
  DEFAULT_ORG_ID,
  getData: () => db,
  setData: (newData) => {
    db = newData;
    persist();
  },
  persist,
  getUsers: (orgId) => (orgId ? byOrg(db.users, orgId) : db.users),
  getAllUsers: () => db.users,
  getTeams: (orgId) => byOrg(db.teams, orgId),
  getPlayers: (orgId) => byOrg(db.players, orgId),
  getAuctions: (orgId) => byOrg(db.auctions, orgId),
  getBids: (orgId) => byOrg(db.bids, orgId),
  getSoldPlayers: (orgId) => byOrg(db.soldPlayers, orgId),
  getMatches: (orgId) => {
    if (!Array.isArray(db.matches)) db.matches = [];
    return orgId ? byOrg(db.matches, orgId) : db.matches;
  },
  getOrganizations: () => {
    if (!Array.isArray(db.organizations)) db.organizations = [];
    return db.organizations;
  },
  getPayments: (orgId) => byOrg(db.payments || [], orgId),
  getOrgById: (id) => (db.organizations || []).find(o => o.id === id) || null,
  getOrgBySlug: (slug) =>
    (db.organizations || []).find(o => o.slug === String(slug).toLowerCase()) || null,

  addUser: (user) => {
    user.id = user.id || uuidv4();
    if (!user.orgId) user.orgId = DEFAULT_ORG_ID;
    db.users.push(user);
    persist();
    return user;
  },
  updateUser: (id, updates) => {
    const idx = db.users.findIndex(u => u.id === id);
    if (idx === -1) return null;
    db.users[idx] = { ...db.users[idx], ...updates };
    persist();
    return db.users[idx];
  },
  addTeam: (team) => {
    team.id = team.id || uuidv4();
    if (!team.orgId) team.orgId = DEFAULT_ORG_ID;
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
    if (!player.orgId) player.orgId = DEFAULT_ORG_ID;
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
    if (!auction.orgId) auction.orgId = DEFAULT_ORG_ID;
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
    if (!bid.orgId) bid.orgId = DEFAULT_ORG_ID;
    db.bids.push(bid);
    persist();
    return bid;
  },
  addSoldPlayer: (sold) => {
    sold.id = sold.id || uuidv4();
    if (!sold.orgId) sold.orgId = DEFAULT_ORG_ID;
    db.soldPlayers.push(sold);
    persist();
    return sold;
  },
  addMatch: (match) => {
    if (!Array.isArray(db.matches)) db.matches = [];
    match.id = match.id || uuidv4();
    if (!match.orgId) match.orgId = DEFAULT_ORG_ID;
    db.matches.push(match);
    persist();
    return match;
  },
  updateMatch: (id, updates) => {
    if (!Array.isArray(db.matches)) db.matches = [];
    const idx = db.matches.findIndex(m => m.id === id);
    if (idx === -1) return null;
    db.matches[idx] = { ...db.matches[idx], ...updates };
    persist();
    return db.matches[idx];
  },
  addOrganization: (org) => {
    if (!Array.isArray(db.organizations)) db.organizations = [];
    org.id = org.id || uuidv4();
    db.organizations.push(org);
    persist();
    return org;
  },
  updateOrganization: (id, updates) => {
    if (!Array.isArray(db.organizations)) db.organizations = [];
    const idx = db.organizations.findIndex(o => o.id === id);
    if (idx === -1) return null;
    db.organizations[idx] = { ...db.organizations[idx], ...updates };
    persist();
    return db.organizations[idx];
  },
  addPayment: (payment) => {
    if (!Array.isArray(db.payments)) db.payments = [];
    payment.id = payment.id || uuidv4();
    if (!payment.orgId) payment.orgId = DEFAULT_ORG_ID;
    db.payments.push(payment);
    persist();
    return payment;
  }
};
