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

function formatSoldMessage(payload) {
  const player = payload.player?.name || 'Player';
  const role = payload.player?.role ? ` (${payload.player.role})` : '';
  const team = payload.team?.name || 'Team';
  const price = Number(payload.price) || 0;
  const purse = payload.remainingPurse != null ? Number(payload.remainingPurse) : null;
  const auction = payload.auctionName ? ` · ${payload.auctionName}` : '';
  let msg = `🔨 *SOLD*${auction}\n`;
  msg += `*${player}*${role}\n`;
  msg += `→ *${team}* for *₹${price.toLocaleString('en-IN')}*`;
  if (purse != null) msg += `\nPurse left: ₹${purse.toLocaleString('en-IN')}`;
  return msg;
}

function formatUnsoldMessage(payload) {
  const player = payload.player?.name || 'Player';
  const auction = payload.auctionName ? ` · ${payload.auctionName}` : '';
  return `⚪ *UNSOLD*${auction}\n*${player}* went unsold.`;
}

function sendWhatsAppText(org, text) {
  if (!org || org.whatsappEnabled === false) return;
  const phones = Array.isArray(org.whatsappPhones)
    ? org.whatsappPhones
    : String(org.whatsappPhones || '')
        .split(/[,;\s]+/)
        .map(s => s.trim())
        .filter(Boolean);

  const waHook = org.whatsappWebhookUrl || org.settings?.whatsappWebhookUrl;
  if (waHook && String(waHook).startsWith('http')) {
    fetch(waHook, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'User-Agent': 'CricketAuction/1.0' },
      body: JSON.stringify({
        event: 'whatsapp-notify',
        channel: 'whatsapp',
        text,
        phones,
        at: new Date().toISOString()
      }),
      signal: AbortSignal.timeout(8000)
    }).catch(() => {});
  }

  const apiKey = org.whatsappCallMeBotKey || org.settings?.whatsappCallMeBotKey;
  if (apiKey && phones.length) {
    for (const phone of phones.slice(0, 5)) {
      const digits = String(phone).replace(/[^\d]/g, '');
      if (!digits) continue;
      const url =
        `https://api.callmebot.com/whatsapp.php?phone=${encodeURIComponent(digits)}` +
        `&text=${encodeURIComponent(text)}&apikey=${encodeURIComponent(apiKey)}`;
      fetch(url, { method: 'GET', signal: AbortSignal.timeout(8000) }).catch(() => {});
    }
  }
}

function fireSoldWebhook(orgId, payload) {
  try {
    const org = getOrgById ? getOrgById(orgId) : null;
    const url = org?.soldWebhookUrl || org?.settings?.soldWebhookUrl;
    if (url && String(url).startsWith('http')) {
      const body = JSON.stringify({ event: 'player-sold', at: new Date().toISOString(), ...payload });
      fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'User-Agent': 'CricketAuction/1.0' },
        body,
        signal: AbortSignal.timeout(8000)
      }).catch(() => {});
    }
    const features = org?.features || {};
    const waOn = features.whatsappNotify !== false && org?.whatsappEnabled !== false;
    if (waOn && (org?.whatsappWebhookUrl || org?.whatsappCallMeBotKey || org?.whatsappPhones)) {
      sendWhatsAppText(org, formatSoldMessage(payload));
    }
  } catch (_) {}
}

function fireUnsoldNotify(orgId, payload) {
  try {
    const org = getOrgById ? getOrgById(orgId) : null;
    if (!org) return;
    const features = org.features || {};
    if (features.whatsappNotify === false || org.whatsappEnabled === false) return;
    if (!(org.whatsappWebhookUrl || org.whatsappCallMeBotKey || org.whatsappPhones)) return;
    sendWhatsAppText(org, formatUnsoldMessage(payload));
  } catch (_) {}
}

function fireAuctionEventNotify(orgId, kind, detail) {
  try {
    const org = getOrgById ? getOrgById(orgId) : null;
    if (!org) return;
    if (org.whatsappEnabled === false) return;
    if (!(org.whatsappWebhookUrl || org.whatsappCallMeBotKey || org.whatsappPhones)) return;
    const text =
      kind === 'start'
        ? `🟢 *Auction started*\n${detail || ''}`.trim()
        : kind === 'end'
          ? `🏁 *Auction finished*\n${detail || ''}`.trim()
          : String(detail || kind);
    sendWhatsAppText(org, text);
  } catch (_) {}
}

module.exports = {
  MIN_SLOT, acquireSellLock, timerEndsAtFor, normalizeBidRules, nextMinBid,
  emitAuction, maxBidForTeam, appendPurseLog, fireSoldWebhook, fireUnsoldNotify,
  fireAuctionEventNotify, formatSoldMessage, uuidv4
};
