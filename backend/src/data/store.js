const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const DATA_PATH = path.join(__dirname, 'db.json');
const DEFAULT_ORG_ID = 'org-default';

let db = {
  users: [],
  teams: [],
  players: [],
  auctions: [],
  bids: [],
  soldPlayers: [],
  matches: [],
  tournaments: [],
  fixtures: [],
  venues: [],
  broadcast: [],
  organizations: []
};

function loadData() {
  try {
    if (fs.existsSync(DATA_PATH)) {
      const raw = fs.readFileSync(DATA_PATH, 'utf8');
      const data = JSON.parse(raw);
      if (!Array.isArray(data.users)) data.users = [];
      if (!Array.isArray(data.teams)) data.teams = [];
      if (!Array.isArray(data.players)) data.players = [];
      if (!Array.isArray(data.auctions)) data.auctions = [];
      if (!Array.isArray(data.bids)) data.bids = [];
      if (!Array.isArray(data.soldPlayers)) data.soldPlayers = [];
      if (!Array.isArray(data.matches)) data.matches = [];
      if (!Array.isArray(data.tournaments)) data.tournaments = [];
      if (!Array.isArray(data.fixtures)) data.fixtures = [];
      if (!Array.isArray(data.venues)) data.venues = [];
      if (!Array.isArray(data.broadcast)) data.broadcast = [];
      if (!Array.isArray(data.organizations)) data.organizations = [];
      ['users', 'teams', 'players', 'auctions', 'bids', 'soldPlayers', 'matches', 'tournaments', 'fixtures', 'venues', 'broadcast', 'organizations'].forEach(k => {
        if (!Array.isArray(data[k])) data[k] = [];
      });
      db = data;
    }
  } catch (e) {
    console.error('Failed to load db', e);
  }
}

function persist() {
  try {
    fs.writeFileSync(DATA_PATH, JSON.stringify(db, null, 2));
  } catch (e) {
    console.error('Failed to persist db', e);
  }
}

loadData();

function byOrg(list, orgId) {
  if (!orgId) return list;
  return list.filter(x => !x.orgId || x.orgId === orgId || x.orgId === DEFAULT_ORG_ID);
}

module.exports = {
  persist,
  getUsers: () => db.users,
  getTeams: (orgId) => (orgId ? byOrg(db.teams, orgId) : db.teams),
  getPlayers: (orgId) => (orgId ? byOrg(db.players, orgId) : db.players),
  getAuctions: (orgId) => (orgId ? byOrg(db.auctions, orgId) : db.auctions),
  getBids: () => db.bids,
  getSoldPlayers: (orgId) => (orgId ? byOrg(db.soldPlayers, orgId) : db.soldPlayers),
  getMatches: (orgId) => (orgId ? byOrg(db.matches, orgId) : db.matches),
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
  getOrganizations: () => {
    if (!Array.isArray(db.organizations)) db.organizations = [];
    return db.organizations;
  },
  getOrgBySlug: (slug) => {
    if (!Array.isArray(db.organizations)) db.organizations = [];
    return db.organizations.find(o => o.slug === slug) || null;
  },
  addUser: (row) => {
    row.id = row.id || uuidv4();
    db.users.push(row); persist(); return row;
  },
  addTeam: (row) => {
    row.id = row.id || uuidv4();
    if (!row.orgId) row.orgId = DEFAULT_ORG_ID;
    db.teams.push(row); persist(); return row;
  },
  updateTeam: (id, updates) => {
    const idx = db.teams.findIndex(x => x.id === id);
    if (idx === -1) return null;
    db.teams[idx] = { ...db.teams[idx], ...updates }; persist(); return db.teams[idx];
  },
  addPlayer: (row) => {
    row.id = row.id || uuidv4();
    if (!row.orgId) row.orgId = DEFAULT_ORG_ID;
    db.players.push(row); persist(); return row;
  },
  updatePlayer: (id, updates) => {
    const idx = db.players.findIndex(x => x.id === id);
    if (idx === -1) return null;
    db.players[idx] = { ...db.players[idx], ...updates }; persist(); return db.players[idx];
  },
  addAuction: (row) => {
    row.id = row.id || uuidv4();
    if (!row.orgId) row.orgId = DEFAULT_ORG_ID;
    db.auctions.push(row); persist(); return row;
  },
  updateAuction: (id, updates) => {
    const idx = db.auctions.findIndex(x => x.id === id);
    if (idx === -1) return null;
    db.auctions[idx] = { ...db.auctions[idx], ...updates }; persist(); return db.auctions[idx];
  },
  addBid: (row) => {
    row.id = row.id || uuidv4();
    db.bids.push(row); persist(); return row;
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
  addMatch: (row) => {
    row.id = row.id || uuidv4();
    if (!row.orgId) row.orgId = DEFAULT_ORG_ID;
    db.matches.push(row); persist(); return row;
  },
  updateMatch: (id, updates) => {
    const idx = db.matches.findIndex(x => x.id === id);
    if (idx === -1) return null;
    db.matches[idx] = { ...db.matches[idx], ...updates }; persist(); return db.matches[idx];
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
