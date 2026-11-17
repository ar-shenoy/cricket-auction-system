const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const DATA_FILE = path.join(__dirname, 'db.json');
const DEFAULT_ORG_ID = 'org-default';

let db = {
  organizations: [
    { id: DEFAULT_ORG_ID, name: 'Default League', slug: 'default', plan: 'free', createdAt: new Date().toISOString() }
  ],
  users: [
    { id: 'admin-001', name: 'League Admin', email: 'admin@auction.com', password: 'admin123', role: 'admin', teamId: null, orgId: DEFAULT_ORG_ID },
    { id: 'dev-001', name: 'Platform Developer', email: 'developer@auction.com', password: 'devxai2026', role: 'developer', teamId: null, orgId: DEFAULT_ORG_ID }
  ],
  teams: [],
  players: [],
  auctions: [],
  bids: [],
  soldPlayers: [],
  matches: [],
  payments: [],
  tournaments: [],
  fixtures: [],
  venues: [],
  broadcast: []
};

function loadData() {
  try {
    if (fs.existsSync(DATA_FILE)) {
      const raw = fs.readFileSync(DATA_FILE, 'utf8');
      const data = JSON.parse(raw);
      if (!Array.isArray(data.organizations) || !data.organizations.length) {
        data.organizations = [{ id: DEFAULT_ORG_ID, name: 'Default League', slug: 'default', plan: 'free', createdAt: new Date().toISOString() }];
      }
      if (!Array.isArray(data.users)) data.users = [];
      if (!Array.isArray(data.teams)) data.teams = [];
      if (!Array.isArray(data.players)) data.players = [];
      if (!Array.isArray(data.auctions)) data.auctions = [];
      if (!Array.isArray(data.bids)) data.bids = [];
      if (!Array.isArray(data.soldPlayers)) data.soldPlayers = [];
      if (!Array.isArray(data.matches)) data.matches = [];
      if (!Array.isArray(data.payments)) data.payments = [];
      if (!Array.isArray(data.tournaments)) data.tournaments = [];
      if (!Array.isArray(data.fixtures)) data.fixtures = [];
      if (!Array.isArray(data.venues)) data.venues = [];
      if (!Array.isArray(data.broadcast)) data.broadcast = [];
      const orgId = data.organizations[0]?.id || DEFAULT_ORG_ID;
      data.users.forEach(u => { if (!u.orgId) u.orgId = orgId; });
      db = data;
    }
  } catch (e) {
    console.error('Failed to load db', e);
  }
}

function saveData(data) {
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
  } catch (e) {
    console.error('Failed to save db', e);
  }
}

function persist() { saveData(db); }

loadData();

(function ensureDeveloper() {
  const exists = db.users.find(u => u.email === 'developer@auction.com');
  if (!exists) {
    db.users.push({
      id: 'dev-001', name: 'Platform Developer', email: 'developer@auction.com',
      password: 'devxai2026', role: 'developer', teamId: null, orgId: DEFAULT_ORG_ID
    });
    persist();
  } else if (exists.role !== 'developer') {
    exists.role = 'developer';
    persist();
  }
  const admin = db.users.find(u => u.email === 'admin@auction.com');
  if (!admin) {
    db.users.push({
      id: 'admin-001', name: 'League Admin', email: 'admin@auction.com',
      password: 'admin123', role: 'admin', teamId: null, orgId: DEFAULT_ORG_ID
    });
    persist();
  }
  if (!Array.isArray(db.organizations) || !db.organizations.length) {
    db.organizations = [{ id: DEFAULT_ORG_ID, name: 'Default League', slug: 'default', plan: 'free', createdAt: new Date().toISOString() }];
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
  setData: (newData) => { db = newData; persist(); },
  persist,
  getUsers: (orgId) => (orgId ? byOrg(db.users, orgId) : db.users),
  getAllUsers: () => db.users,
  getTeams: (orgId) => byOrg(db.teams, orgId),
  getPlayers: (orgId) => byOrg(db.players, orgId),
  getAuctions: (orgId) => byOrg(db.auctions, orgId),
  getBids: (orgId) => (orgId ? byOrg(db.bids, orgId) : db.bids),
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
  getTournaments: (orgId) => {
    if (!Array.isArray(db.tournaments)) db.tournaments = [];
    return orgId ? byOrg(db.tournaments, orgId) : db.tournaments;
  },
  getFixtures: (orgId) => {
    if (!Array.isArray(db.fixtures)) db.fixtures = [];
    return orgId ? byOrg(db.fixtures, orgId) : db.fixtures;
  },
  getVenues: (orgId) => {
    if (!Array.isArray(db.venues)) db.venues = [];
    return orgId ? byOrg(db.venues, orgId) : db.venues;
  },
  getBroadcast: (orgId) => {
    if (!Array.isArray(db.broadcast)) db.broadcast = [];
    return orgId ? byOrg(db.broadcast, orgId) : db.broadcast;
  },
  getOrgById: (id) => (db.organizations || []).find(o => o.id === id) || null,
  getOrgBySlug: (slug) => (db.organizations || []).find(o => o.slug === slug) || null,
  addUser: (user) => {
    user.id = user.id || uuidv4();
    if (!user.orgId) user.orgId = DEFAULT_ORG_ID;
    db.users.push(user); persist(); return user;
  },
  updateUser: (id, updates) => {
    const idx = db.users.findIndex(u => u.id === id);
    if (idx === -1) return null;
    db.users[idx] = { ...db.users[idx], ...updates }; persist(); return db.users[idx];
  },
  addTeam: (team) => {
    team.id = team.id || uuidv4();
    if (!team.orgId) team.orgId = DEFAULT_ORG_ID;
    db.teams.push(team); persist(); return team;
  },
  updateTeam: (id, updates) => {
    const idx = db.teams.findIndex(t => t.id === id);
    if (idx === -1) return null;
    db.teams[idx] = { ...db.teams[idx], ...updates }; persist(); return db.teams[idx];
  },
  addPlayer: (player) => {
    player.id = player.id || uuidv4();
    if (!player.orgId) player.orgId = DEFAULT_ORG_ID;
    db.players.push(player); persist(); return player;
  },
  updatePlayer: (id, updates) => {
    const idx = db.players.findIndex(p => p.id === id);
    if (idx === -1) return null;
    db.players[idx] = { ...db.players[idx], ...updates }; persist(); return db.players[idx];
  },
  addAuction: (auction) => {
    auction.id = auction.id || uuidv4();
    if (!auction.orgId) auction.orgId = DEFAULT_ORG_ID;
    db.auctions.push(auction); persist(); return auction;
  },
  updateAuction: (id, updates) => {
    const idx = db.auctions.findIndex(a => a.id === id);
    if (idx === -1) return null;
    db.auctions[idx] = { ...db.auctions[idx], ...updates }; persist(); return db.auctions[idx];
  },
  addBid: (bid) => {
    bid.id = bid.id || uuidv4();
    if (!bid.orgId) bid.orgId = DEFAULT_ORG_ID;
    db.bids.push(bid); persist(); return bid;
  },
  removeBid: (id) => {
    const idx = db.bids.findIndex(x => x.id === id);
    if (idx === -1) return false;
    db.bids.splice(idx, 1); persist(); return true;
  },
  addSoldPlayer: (row) => {
    row.id = row.id || uuidv4();
    if (!row.orgId) row.orgId = DEFAULT_ORG_ID;
    db.soldPlayers.push(row); persist(); return row;
  },
  addMatch: (match) => {
    match.id = match.id || uuidv4();
    if (!match.orgId) match.orgId = DEFAULT_ORG_ID;
    if (!Array.isArray(db.matches)) db.matches = [];
    db.matches.push(match); persist(); return match;
  },
  updateMatch: (id, updates) => {
    if (!Array.isArray(db.matches)) db.matches = [];
    const idx = db.matches.findIndex(m => m.id === id);
    if (idx === -1) return null;
    db.matches[idx] = { ...db.matches[idx], ...updates }; persist(); return db.matches[idx];
  },
  addOrganization: (org) => {
    org.id = org.id || uuidv4();
    db.organizations.push(org); persist(); return org;
  },
  updateOrganization: (id, updates) => {
    const idx = db.organizations.findIndex(o => o.id === id);
    if (idx === -1) return null;
    db.organizations[idx] = { ...db.organizations[idx], ...updates }; persist(); return db.organizations[idx];
  },
  addPayment: (payment) => {
    if (!Array.isArray(db.payments)) db.payments = [];
    payment.id = payment.id || uuidv4();
    if (!payment.orgId) payment.orgId = DEFAULT_ORG_ID;
    db.payments.push(payment); persist(); return payment;
  },
  updatePayment: (id, updates) => {
    if (!Array.isArray(db.payments)) db.payments = [];
    const idx = db.payments.findIndex(x => x.id === id);
    if (idx === -1) return null;
    db.payments[idx] = { ...db.payments[idx], ...updates }; persist(); return db.payments[idx];
  },
  addTournament: (row) => {
    row.id = row.id || uuidv4();
    if (!row.orgId) row.orgId = DEFAULT_ORG_ID;
    if (!Array.isArray(db.tournaments)) db.tournaments = [];
    db.tournaments.push(row); persist(); return row;
  },
  updateTournament: (id, updates) => {
    if (!Array.isArray(db.tournaments)) db.tournaments = [];
    const idx = db.tournaments.findIndex(x => x.id === id);
    if (idx === -1) return null;
    db.tournaments[idx] = { ...db.tournaments[idx], ...updates }; persist(); return db.tournaments[idx];
  },
  addFixture: (row) => {
    row.id = row.id || uuidv4();
    if (!row.orgId) row.orgId = DEFAULT_ORG_ID;
    if (!Array.isArray(db.fixtures)) db.fixtures = [];
    db.fixtures.push(row); persist(); return row;
  },
  updateFixture: (id, updates) => {
    if (!Array.isArray(db.fixtures)) db.fixtures = [];
    const idx = db.fixtures.findIndex(x => x.id === id);
    if (idx === -1) return null;
    db.fixtures[idx] = { ...db.fixtures[idx], ...updates }; persist(); return db.fixtures[idx];
  },
  deleteFixture: (id) => {
    if (!Array.isArray(db.fixtures)) db.fixtures = [];
    const idx = db.fixtures.findIndex(x => x.id === id);
    if (idx === -1) return false;
    db.fixtures.splice(idx, 1); persist(); return true;
  },
  addVenue: (row) => {
    row.id = row.id || uuidv4();
    if (!row.orgId) row.orgId = DEFAULT_ORG_ID;
    if (!Array.isArray(db.venues)) db.venues = [];
    db.venues.push(row); persist(); return row;
  },
  updateVenue: (id, updates) => {
    if (!Array.isArray(db.venues)) db.venues = [];
    const idx = db.venues.findIndex(x => x.id === id);
    if (idx === -1) return null;
    db.venues[idx] = { ...db.venues[idx], ...updates }; persist(); return db.venues[idx];
  },
  deleteVenue: (id) => {
    if (!Array.isArray(db.venues)) db.venues = [];
    const idx = db.venues.findIndex(x => x.id === id);
    if (idx === -1) return false;
    db.venues.splice(idx, 1); persist(); return true;
  },
  upsertBroadcast: (orgId, data) => {
    if (!Array.isArray(db.broadcast)) db.broadcast = [];
    const idx = db.broadcast.findIndex(x => x.orgId === orgId);
    const row = { id: idx >= 0 ? db.broadcast[idx].id : uuidv4(), orgId, ...data, updatedAt: new Date().toISOString() };
    if (idx >= 0) db.broadcast[idx] = { ...db.broadcast[idx], ...row };
    else db.broadcast.push(row);
    persist();
    return idx >= 0 ? db.broadcast[idx] : row;
  }
};
