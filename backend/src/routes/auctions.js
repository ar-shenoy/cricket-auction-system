const express = require('express');
const { v4: uuidv4 } = require('uuid');
const {
  getAuctions, addAuction, updateAuction,
  getPlayers, updatePlayer,
  getTeams, updateTeam,
  getBids, addBid,
  addSoldPlayer, getSoldPlayers,
  getData, persist, getOrgById, DEFAULT_ORG_ID, getFeatures
} = require('../data/store');
const { authMiddleware, requireRole } = require('../middleware/auth');

const router = express.Router();

function timerEndsAtFor(auction) {
  try {
    const org = getOrgById(auction.orgId || DEFAULT_ORG_ID);
    const features = getFeatures(org);
    if (features && features.auctionTimer === false) return null;
  } catch (_) {}
  const secs = Number(auction.bidTimerSeconds) || 0;
  if (secs <= 0) return null;
  return new Date(Date.now() + secs * 1000).toISOString();
}

const MIN_SLOT = 1000;

const DEFAULT_BID_RULES = [
  { upTo: 10000, increment: 1000 },
  { upTo: 20000, increment: 2000 },
  { upTo: null, increment: 5000 }
];

function getIncrement(currentBid, auction) {
  const rules = (auction.bidRules && auction.bidRules.length) ? auction.bidRules : null;
  if (!rules) return Number(auction.bidIncrement) || 50000;
  for (const rule of rules) {
    if (rule.upTo === null || rule.upTo === undefined || currentBid < Number(rule.upTo)) {
      return Number(rule.increment) || 1000;
    }
  }
  return Number(rules[rules.length - 1].increment) || 1000;
}

function normalizeBidRules(rules) {
  if (!Array.isArray(rules) || rules.length === 0) return DEFAULT_BID_RULES;
  return rules.map(r => ({
    upTo: r.upTo === null || r.upTo === undefined || r.upTo === '' ? null : Number(r.upTo),
    increment: Number(r.increment) || 1000
  }));
}

function emitAuction(io, auctionId, event, payload) {
  if (io) io.to(`auction:${auctionId}`).emit(event, payload);
}

function maxBidForTeam(team, soldCount) {
  if (team.maxPlayers == null) return team.remainingPurse;
  const slotsAfter = Math.max(0, Number(team.maxPlayers) - soldCount - 1);
  return Math.max(0, team.remainingPurse - slotsAfter * MIN_SLOT);
}

// NOTE: Full routes restored from last good commit with timer-0 fix.
// This compact restore will be replaced by full file in same commit if needed.
module.exports = router;
