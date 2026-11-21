const { v4: uuidv4 } = require('uuid');
const {
  getAuctions, updateAuction, getPlayers, getTeams, getSoldPlayers, getOrgById
} = require('../data/store');

const MIN_SLOT = 1000;
const sellLocks = new Map();

function acquireSellLock(auctionId) {
  const now = Date.now();
  const until = sellLocks.get(auctionId) || 0;
  if (until > now) return false;
  sellLocks.set(auctionId, now + 2500);
  setTimeout(() => { if ((sellLocks.get(auctionId) || 0) <= Date.now()) sellLocks.delete(auctionId); }, 3000);
  return true;
}

function timerEndsAtFor(auction) {
  const secs = Number(auction.bidTimerSeconds);
  if (!secs || secs <= 0) return null;
  const grace = Number(auction.noBidGrace) || 0;
  return new Date(Date.now() + (secs + grace) * 1000).toISOString();
}

function normalizeBidRules(rules) {
  if (!Array.isArray(rules) || !rules.length) return null;
  return rules
    .map(r => ({
      upTo: r.upTo == null ? null : Number(r.upTo),
      increment: Number(r.increment) || 0
    }))
    .filter(r => r.increment > 0)
    .sort((a, b) => {
      if (a.upTo == null) return 1;
      if (b.upTo == null) return -1;
      return a.upTo - b.upTo;
    });
}

function nextMinBid(currentBid, hasBidder, auction) {
  const rules = normalizeBidRules(auction.bidRules) || [{ upTo: null, increment: Number(auction.bidIncrement) || 1000 }];
  const base = Number(currentBid) || 0;
  if (!hasBidder) return base;
  for (const r of rules) {
    if (r.upTo == null || base < r.upTo) return base + r.increment;
  }
  return base + (rules[rules.length - 1]?.increment || Number(auction.bidIncrement) || 1000);
}

function emitAuction(io, auctionId, event, payload) {
  if (!io) return;
  if (auctionId) io.to(`auction-${auctionId}`).emit(event, payload);
  io.emit(event, payload);
}

function maxBidForTeam(team, soldCount) {
  if (team.maxPlayers == null) return team.remainingPurse;
  const slotsAfter = Math.max(0, Number(team.maxPlayers) - soldCount - 1);
  return Math.max(0, team.remainingPurse - slotsAfter * MIN_SLOT);
}

function appendPurseLog(auction, entry) {
  const log = Array.isArray(auction.purseLog) ? [...auction.purseLog] : [];
  log.push({ at: new Date().toISOString(), ...entry });
  return log.slice(-500);
}

function fireSoldWebhook(orgId, payload) {
  try {
    const org = getOrgById ? getOrgById(orgId) : null;
    const url = org?.soldWebhookUrl || org?.settings?.soldWebhookUrl;
    if (!url || !String(url).startsWith('http')) return;
    const body = JSON.stringify({ event: 'player-sold', at: new Date().toISOString(), ...payload });
    fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'User-Agent': 'CricketAuction/1.0' },
      body,
      signal: AbortSignal.timeout(8000)
    }).catch(() => {});
  } catch (_) {}
}

module.exports = {
  MIN_SLOT, acquireSellLock, timerEndsAtFor, normalizeBidRules, nextMinBid,
  emitAuction, maxBidForTeam, appendPurseLog, fireSoldWebhook, uuidv4
};
