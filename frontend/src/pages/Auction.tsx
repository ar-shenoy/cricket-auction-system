import React, { useEffect, useState, useRef, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import AppShell from '../components/AppShell';
import api, { getSocketUrl } from '../services/api';
import { io, Socket } from 'socket.io-client';
import { nextMinBid, DEFAULT_BID_RULES, BidRule } from '../utils/bidRules';
import BidRulesEditor from '../components/BidRulesEditor';

interface Player { id: string; name: string; role: string; basePrice: number; city?: string; photoUrl?: string; previousPrice?: number; }
interface Team { id: string; name: string; purse: number; remainingPurse: number; maxPlayers?: number | null; logoUrl?: string; }
interface Auction { id: string; name: string; status: 'draft' | 'live' | 'paused' | 'completed'; currentPlayerId: string | null; currentBid: number; currentBidderTeamId: string | null; bidIncrement: number; bidRules?: BidRule[]; bidTimerSeconds: number; timerEndsAt: string | null; }
interface SoldRecord { id: string; playerId: string; teamId: string; soldPrice: number; player?: Player; team?: Team; }

const TEAM_COLORS = ['#3b82f6','#f97316','#06b6d4','#a855f7','#eab308','#ef4444','#7c3aed','#14b8a6','#ec4899','#6366f1','#22c55e','#8b5cf6','#0ea5e9','#f59e0b'];

function teamInitials(name: string) {
  const parts = (name || '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return 'T';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

function roleKey(role: string) {
  const r = (role || '').toLowerCase();
  if (r.includes('bat') && !r.includes('all')) return 'bat';
  if (r.includes('bowl')) return 'bowl';
  if (r.includes('keep') || r.includes('wk')) return 'wk';
  if (r.includes('all')) return 'ar';
  return 'other';
}

export default function Auction() {
  const { user, isAdmin: isAdminFromAuth } = useAuth();
  const isAdmin = Boolean(isAdminFromAuth || user?.role === 'admin' || user?.role === 'developer');
  const [auction, setAuction] = useState<Auction | null>(null);
  const [currentPlayer, setCurrentPlayer] = useState<Player | null>(null);
  const [teams, setTeams] = useState<Team[]>([]);
  const [availablePlayers, setAvailablePlayers] = useState<Player[]>([]);
  const [soldList, setSoldList] = useState<SoldRecord[]>([]);
  const [unsoldPlayers, setUnsoldPlayers] = useState<Player[]>([]);
  const [bidAmount, setBidAmount] = useState('');
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);
  const [features, setFeatures] = useState<Record<string, boolean>>({});
  const [creating, setCreating] = useState(false);
  const [adminBidTeamId, setAdminBidTeamId] = useState('');
  const [openPanel, setOpenPanel] = useState<'available' | 'sold' | 'unsold' | 'history' | null>('available');
  const [roleFilter, setRoleFilter] = useState('all');
  const [bidHistory, setBidHistory] = useState<{ id: string; amount: number; teamId: string; teamName: string }[]>([]);
  const [watchers, setWatchers] = useState(0);
  const socketRef = useRef<Socket | null>(null);
  const timerFiredRef = useRef(false);
  const [timerLeft, setTimerLeft] = useState<number | null>(null);

  const feat = (k: string) => features[k] !== false;

  const showMsg = (type: 'success' | 'error' | 'info', text: string) => {
    setMessage({ type, text });
    setTimeout(() => setMessage(null), 4000);
  };

  useEffect(() => {
    api.get('/orgs/features').then(r => setFeatures(r.data.features || {})).catch(() => setFeatures({}));
  }, []);

  const resyncLists = useCallback(async (auctionId: string) => {
    try {
      const [soldRes, unsoldRes, availRes, teamsRes, bidsRes] = await Promise.all([
        api.get(`/auctions/${auctionId}/sold`),
        api.get(`/auctions/${auctionId}/unsold-players`),
        api.get(`/auctions/${auctionId}/available-players`),
        api.get('/teams'),
        api.get(`/auctions/${auctionId}/bids`).catch(() => ({ data: [] }))
      ]);
      setSoldList(soldRes.data || []);
      setUnsoldPlayers(unsoldRes.data || []);
      setAvailablePlayers(availRes.data || []);
      setTeams(teamsRes.data || []);
      const bids = (bidsRes.data || []) as any[];
      const teamMap = Object.fromEntries((teamsRes.data || []).map((t: Team) => [t.id, t.name]));
      const sorted = bids.slice().sort((a: any, b: any) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime()).slice(0, 40)
        .map((b: any) => ({ id: b.id, amount: Number(b.amount) || 0, teamId: b.teamId, teamName: teamMap[b.teamId] || b.teamId }));
      setBidHistory(sorted);
    } catch (e) { console.error(e); }
  }, []);

  const loadAuction = useCallback(async () => {
    try {
      const res = await api.get('/auctions/active');
      const a = res.data && res.data.id ? res.data : null;
      setAuction(a);
      if (a?.id) {
        await resyncLists(a.id);
        if (a.currentPlayerId) {
          const players = await api.get('/players');
          const p = (players.data || []).find((x: Player) => x.id === a.currentPlayerId);
          setCurrentPlayer(p || null);
        } else setCurrentPlayer(null);
      } else {
        setCurrentPlayer(null);
      }
    } catch (e) {
      console.error(e);
      setAuction(null);
    } finally {
      setLoading(false);
    }
  }, [resyncLists]);

  useEffect(() => { loadAuction(); }, [loadAuction]);

  useEffect(() => {
    const onFocus = () => {
      if (!auction?.id) return;
      api.get('/teams').then(r => setTeams(r.data || [])).catch(() => {});
    };
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [auction?.id]);

  useEffect(() => {
    if (!auction?.id) return;
    const socket = io(getSocketUrl(), { transports: ['websocket', 'polling'], reconnection: true, reconnectionAttempts: 20, reconnectionDelay: 1000 });
    socketRef.current = socket;
    socket.emit('join-auction', auction.id);
    socket.on('new-bid', (payload: any) => {
      if (payload.auction) setAuction(payload.auction);
      if (payload.bid && payload.team) {
        setBidHistory(prev => [{ id: payload.bid.id, amount: payload.bid.amount, teamId: payload.team.id, teamName: payload.team.name }, ...prev].slice(0, 40));
      }
      if (payload.undo && payload.auction?.id) resyncLists(payload.auction.id);
    });
    socket.on('player-selected', (payload: any) => {
      if (payload.auction) setAuction(payload.auction);
      if (payload.player) setCurrentPlayer(payload.player);
    });
    socket.on('player-sold', (payload: any) => {
      if (payload.auction) setAuction(payload.auction);
      // Keep current player visible until next player is drawn
      const r = payload.result;
      if (r?.player) setCurrentPlayer(r.player);
      if (payload.auction?.id) resyncLists(payload.auction.id);
    });
    socket.on('auction-status', (a: Auction) => setAuction(a));
    socket.on('auction-started', (a: Auction) => setAuction(a));
    socket.on('auction-ended', (a: Auction) => setAuction(a));
    socket.on('watchers', (n: number) => setWatchers(n));
    return () => { socket.disconnect(); };
  }, [auction?.id, resyncLists]);

  useEffect(() => {
    if (!feat('auctionTimer') || !auction?.timerEndsAt || auction.status !== 'live' || !auction.currentPlayerId) {
      setTimerLeft(null);
      return;
    }
    timerFiredRef.current = false;
    const tick = () => {
      const end = new Date(auction.timerEndsAt!).getTime();
      const left = Math.max(0, Math.ceil((end - Date.now()) / 1000));
      setTimerLeft(left);
      if (feat('auctionTimer') && left <= 0 && !timerFiredRef.current && isAdmin) {
        timerFiredRef.current = true;
      }
    };
    tick();
    const id = setInterval(tick, 250);
    return () => clearInterval(id);
  }, [auction?.timerEndsAt, auction?.status, auction?.currentPlayerId, auction?.id, isAdmin, features.auctionTimer]);

  const teamSoldCount = (teamId: string) => soldList.filter(s => s.teamId === teamId).length;

  const placeBidForTeam = async (teamId: string, amount: number) => {
    if (!auction) return;
    try {
      const res = await api.post(`/auctions/${auction.id}/bid`, { teamId, amount });
      setAuction(res.data.auction);
      setBidAmount(String(nextMinBid(res.data.auction.currentBid, true, res.data.auction)));
    } catch (err: any) { showMsg('error', err.response?.data?.error || 'Bid failed'); }
  };

  const quickBid = async (tm: Team) => {
    if (!auction || !currentPlayer) return;
    if (auction.status === 'paused') { showMsg('error', 'Auction is paused'); return; }
    if (auction.status === 'draft') { showMsg('error', 'Start the auction first'); return; }
    if (auction.currentBidderTeamId === tm.id) { showMsg('error', `${tm.name} already has the highest bid`); return; }
    if (tm.maxPlayers != null && teamSoldCount(tm.id) >= Number(tm.maxPlayers)) { showMsg('error', `${tm.name} squad is full`); return; }
    const amount = nextMinBid(auction.currentBid || 0, !!auction.currentBidderTeamId, auction);
    if (amount > tm.remainingPurse) { showMsg('error', `${tm.name} only has ₹${tm.remainingPurse.toLocaleString()}`); return; }
    await placeBidForTeam(tm.id, amount);
  };

  const sellPlayer = async () => {
    if (!auction) return;
    try {
      const res = await api.post(`/auctions/${auction.id}/sell`);
      setAuction(res.data.auction);
      if (res.data.result?.player) setCurrentPlayer(res.data.result.player);
      else if (res.data.player) setCurrentPlayer(res.data.player);
      await resyncLists(auction.id);
      showMsg('success', 'Sold');
    } catch (err: any) { showMsg('error', err.response?.data?.error || 'Sell failed'); }
  };

  const markUnsold = async () => {
    if (!auction) return;
    try {
      const res = await api.post(`/auctions/${auction.id}/unsold`);
      setAuction(res.data.auction);
      if (res.data.result?.player) setCurrentPlayer(res.data.result.player);
      else if (res.data.player) setCurrentPlayer(res.data.player);
      await resyncLists(auction.id);
      showMsg('info', 'Marked unsold');
    } catch (err: any) { showMsg('error', err.response?.data?.error || 'Unsold failed'); }
  };

  const undoLastBid = async () => {
    if (!auction) return;
    try {
      const res = await api.post(`/auctions/${auction.id}/undo-last-bid`);
      setAuction(res.data.auction);
      showMsg('success', res.data.message || 'Bid undone');
      await resyncLists(auction.id);
    } catch (err: any) { showMsg('error', err.response?.data?.error || 'Undo bid failed'); }
  };

  const undoLastSale = async () => {
    if (!auction) return;
    try {
      const res = await api.post(`/auctions/${auction.id}/undo-last-sell`);
      setAuction(res.data.auction);
      if (res.data.player) setCurrentPlayer(res.data.player);
      showMsg('success', res.data.message || 'Sale undone');
      await resyncLists(auction.id);
    } catch (err: any) { showMsg('error', err.response?.data?.error || 'Undo sale failed'); }
  };

  const nextRandomPlayer = async () => {
    if (!auction) return;
    // Block while a player is on the block (backend still has currentPlayerId)
    if (auction.currentPlayerId) {
      showMsg('error', 'Finish current player (Sell / Unsold) before drawing next');
      return;
    }
    if (availablePlayers.length === 0) { showMsg('error', 'No approved players left — import & approve players first'); return; }
    try {
      const res = await api.post(`/auctions/${auction.id}/next-random`);
      setAuction(res.data.auction);
      setCurrentPlayer(res.data.player);
      showMsg('info', `Random: ${res.data.player.name}`);
    } catch (err: any) { showMsg('error', err.response?.data?.error || 'No players'); }
  };

  const selectPlayer = async (playerId: string) => {
    if (!auction) return;
    if (auction.currentPlayerId) {
      showMsg('error', 'Finish current player (Sell / Unsold) before selecting another');
      return;
    }
    try {
      const res = await api.post(`/auctions/${auction.id}/select-player`, { playerId });
      setAuction(res.data.auction);
      setCurrentPlayer(res.data.player);
    } catch (err: any) { showMsg('error', err.response?.data?.error || 'Select failed'); }
  };

  const recallUnsold = async () => {
    if (!auction) return;
    try {
      const res = await api.post(`/auctions/${auction.id}/recall-unsold`, {});
      setAuction(res.data.auction);
      if (res.data.player) setCurrentPlayer(res.data.player);
      await resyncLists(auction.id);
    } catch (err: any) { showMsg('error', err.response?.data?.error || 'Recall failed'); }
  };

  useEffect(() => {
    if (!isAdmin || !auction || !feat('auctionKeyboard')) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      const k = e.key.toLowerCase();
      if (k === 's') { e.preventDefault(); sellPlayer(); }
      else if (k === 'u') { e.preventDefault(); markUnsold(); }
      else if (k === 'r') { e.preventDefault(); nextRandomPlayer(); }
      else if (k === 'z') { e.preventDefault(); undoLastBid(); }
      else if (/^[1-9]$/.test(k)) {
        const idx = Number(k) - 1;
        if (teams[idx]) { e.preventDefault(); quickBid(teams[idx]); }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [auction, teams, currentPlayer, isAdmin, features.auctionKeyboard]);

  const createAuction = async () => {
    setCreating(true);
    try {
      const res = await api.post('/auctions', {
        name: `Cricket Auction ${new Date().toLocaleDateString()}`,
        bidIncrement: DEFAULT_BID_RULES[0].increment,
        bidTimerSeconds: feat('auctionTimer') ? 20 : 0,
        bidRules: DEFAULT_BID_RULES
      });
      setAuction(res.data);
      showMsg('success', 'Auction created (draft)');
    } catch (err: any) { showMsg('error', err.response?.data?.error || 'Create failed'); }
    finally { setCreating(false); }
  };

  const saveSettings = async (data: { bidRules: BidRule[]; bidTimerSeconds: number; name: string }) => {
    if (!auction) return;
    const res = await api.put(`/auctions/${auction.id}/settings`, data);
    setAuction(res.data);
    showMsg('success', 'Settings saved');
  };

  const startAuction = async () => {
    if (!auction) return;
    if (availablePlayers.length === 0) { showMsg('error', 'No approved players — import & approve players first'); return; }
    try {
      const res = await api.post(`/auctions/${auction.id}/start`);
      setAuction(res.data);
      showMsg('success', 'LIVE');
    } catch (err: any) { showMsg('error', err.response?.data?.error || 'Failed'); }
  };

  const pauseAuction = async () => {
    if (!auction) return;
    try {
      const res = await api.post(`/auctions/${auction.id}/pause`);
      setAuction(res.data);
    } catch (err: any) { showMsg('error', err.response?.data?.error || 'Failed'); }
  };

  const endAuction = async () => {
    if (!auction) return;
    if (!confirm('End this auction permanently?')) return;
    try {
      const res = await api.post(`/auctions/${auction.id}/end`);
      setAuction(res.data);
      setCurrentPlayer(null);
      showMsg('success', 'Auction ended');
    } catch (err: any) { showMsg('error', err.response?.data?.error || 'End failed'); }
  };

  const shareLive = () => {
    const url = `${window.location.origin}/live`;
    navigator.clipboard?.writeText(url).then(() => showMsg('success', 'Live link copied')).catch(() => showMsg('info', url));
  };

  const exportSquadsCsv = () => {
    const rows = [['Team', 'Player', 'Role', 'Price']];
    soldList.forEach(s => {
      rows.push([s.team?.name || '', s.player?.name || '', s.player?.role || '', String(s.soldPrice || 0)]);
    });
    const csv = rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `squads-${auction?.id || 'export'}.csv`;
    a.click();
  };

  const filteredAvailable = availablePlayers.filter(p => roleFilter === 'all' || roleKey(p.role) === roleFilter);
  const currentBidder = teams.find(t => t.id === auction?.currentBidderTeamId);

  if (loading) {
    return (
      <AppShell title="Auction">
        <div className="glass p-8 text-center" style={{ color: 'var(--text-2)' }}>Loading…</div>
      </AppShell>
    );
  }

  if (!auction) {
    return (
      <AppShell title="Auction">
        <div className="glass p-8 text-center space-y-4">
          <p style={{ color: 'var(--text-2)' }}>No active auction.</p>
          {isAdmin && (
            <button type="button" className="as-btn-primary" disabled={creating} onClick={createAuction}>
              {creating ? 'Creating…' : 'Create auction'}
            </button>
          )}
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell title={auction.name || 'Auction'} subtitle={`${auction.status.toUpperCase()}${watchers ? ` · ${watchers} watching` : ''}`}>
      <div className="as-msg-slot">
        {message && (
          <div className="glass p-3 text-[13px]" style={{ color: message.type === 'error' ? '#ff3b30' : message.type === 'success' ? '#30d158' : 'var(--accent)' }}>
            {message.text}
          </div>
        )}
      </div>

      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-[12px]" style={{ color: 'var(--text-2)' }}>{availablePlayers.length} available · {soldList.length} sold · {unsoldPlayers.length} unsold</span>
          <div className="flex flex-wrap gap-2">
            {feat('auctionShareLive') && <button type="button" onClick={shareLive} className="as-btn-primary text-sm">Share live</button>}
            {feat('auctionExport') && <button type="button" onClick={exportSquadsCsv} className="as-btn-ghost text-sm">Export CSV</button>}
          </div>
        </div>

        {isAdmin && (
          <div className="flex flex-wrap gap-2 items-center">
            {auction.status === 'draft' && <button type="button" onClick={startAuction} className="as-btn-primary text-sm">Start</button>}
            {(auction.status === 'live' || auction.status === 'paused') && (
              <>
                <button type="button" onClick={pauseAuction} className="as-btn-ghost text-sm">{auction.status === 'live' ? 'Pause' : 'Resume'}</button>
                <button type="button" onClick={nextRandomPlayer} className="as-btn-ghost text-sm" disabled={!!auction.currentPlayerId} title={auction.currentPlayerId ? 'Finish current player first' : 'Draw random player'}>Random</button>
                {feat('auctionRecallUnsold') && <button type="button" onClick={recallUnsold} className="as-btn-ghost text-sm">Recall unsold</button>}
                <button type="button" onClick={undoLastBid} className="as-btn-ghost text-sm">Undo bid</button>
                <button type="button" onClick={undoLastSale} className="as-btn-ghost text-sm">Undo last sell</button>
                <button type="button" onClick={sellPlayer} className="as-btn-primary text-sm">Sell</button>
                <button type="button" onClick={markUnsold} className="as-btn-ghost text-sm">Unsold</button>
                <button type="button" onClick={endAuction} className="as-btn-ghost text-sm" style={{ color: '#ff3b30' }}>End</button>
              </>
            )}
            {auction.status === 'draft' && (
              <button type="button" onClick={nextRandomPlayer} className="as-btn-ghost text-sm" disabled={!!auction.currentPlayerId} title={auction.currentPlayerId ? 'Finish current player first' : 'Draw random player'}>Random</button>
            )}
          </div>
        )}

        {currentPlayer && (
          <div className="glass p-5">
            <div className="flex flex-col sm:flex-row gap-4 items-start">
              {currentPlayer.photoUrl ? (
                <img src={currentPlayer.photoUrl} alt="" className="w-32 h-32 sm:w-40 sm:h-40 rounded-2xl object-cover shrink-0 shadow-lg" />
              ) : (
                <div className="w-32 h-32 sm:w-40 sm:h-40 rounded-2xl flex items-center justify-center text-4xl shrink-0" style={{ background: 'var(--fill)' }}>🏏</div>
              )}
              <div className="flex-1 min-w-0">
                <div className="text-[22px] font-semibold">{currentPlayer.name}</div>
                <div className="text-[14px] mt-1" style={{ color: 'var(--text-2)' }}>{currentPlayer.role}{currentPlayer.city ? ` · ${currentPlayer.city}` : ''}</div>
                <div className="mt-3 flex flex-wrap gap-3 items-baseline">
                  <div>
                    <span className="text-[12px]" style={{ color: 'var(--text-2)' }}>Base</span>
                    <div className="text-[18px] font-semibold tabular-nums">₹{(currentPlayer.basePrice || 0).toLocaleString()}</div>
                  </div>
                  <div>
                    <span className="text-[12px]" style={{ color: 'var(--text-2)' }}>Current bid</span>
                    <div className="text-[28px] font-semibold tabular-nums" style={{ color: 'var(--accent)' }}>₹{(auction.currentBid || 0).toLocaleString()}</div>
                  </div>
                  {currentBidder && (
                    <div>
                      <span className="text-[12px]" style={{ color: 'var(--text-2)' }}>Leading</span>
                      <div className="text-[16px] font-medium">{currentBidder.name}</div>
                    </div>
                  )}
                  {timerLeft != null && (
                    <div>
                      <span className="text-[12px]" style={{ color: 'var(--text-2)' }}>Timer</span>
                      <div className="text-[22px] font-semibold tabular-nums" style={{ color: timerLeft <= 5 ? '#ff3b30' : 'var(--text)' }}>{timerLeft}s</div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {isAdmin && (auction.status === 'live' || auction.status === 'paused') && teams.length > 0 && (
          <div className="glass p-4">
            <div className="text-[13px] font-medium mb-3" style={{ color: 'var(--text-2)' }}>Quick bid (or keys 1–9)</div>
            <div className="flex flex-wrap gap-2">
              {teams.map((tm, idx) => {
                const sold = teamSoldCount(tm.id);
                const full = tm.maxPlayers != null && sold >= Number(tm.maxPlayers);
                const leading = auction.currentBidderTeamId === tm.id;
                return (
                  <button
                    key={tm.id}
                    type="button"
                    disabled={full || leading || auction.status === 'paused'}
                    onClick={() => quickBid(tm)}
                    className="as-btn-ghost text-sm flex items-center gap-2 !px-3"
                    style={leading ? { outline: '2px solid var(--accent)' } : undefined}
                  >
                    {tm.logoUrl ? (
                      <img src={tm.logoUrl} alt="" className="w-9 h-9 rounded-full object-cover shrink-0 bg-black/20" />
                    ) : (
                      <span className="w-9 h-9 rounded-full flex items-center justify-center text-[11px] font-bold shrink-0" style={{ background: TEAM_COLORS[idx % TEAM_COLORS.length], color: '#fff' }}>{teamInitials(tm.name)}</span>
                    )}
                    <span className="text-left">
                      <span className="block font-medium">{idx + 1}. {tm.name}</span>
                      <span className="block text-[11px]" style={{ color: 'var(--text-2)' }}>₹{tm.remainingPurse.toLocaleString()}{full ? ' · FULL' : ''}</span>
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          {(['available', 'sold', 'unsold', 'history'] as const).map(k => (
            <button key={k} type="button" onClick={() => setOpenPanel(openPanel === k ? null : k)} className={openPanel === k ? 'as-btn-primary text-sm' : 'as-btn-ghost text-sm'}>
              {k === 'available' ? `Available (${filteredAvailable.length})` : k === 'sold' ? `Sold (${soldList.length})` : k === 'unsold' ? `Unsold (${unsoldPlayers.length})` : `Bids (${bidHistory.length})`}
            </button>
          ))}
        </div>

        {openPanel === 'available' && (
          <div className="glass overflow-hidden">
            <div className="p-3 flex flex-wrap gap-2 items-center border-b" style={{ borderColor: 'var(--separator)' }}>
              <select value={roleFilter} onChange={e => setRoleFilter(e.target.value)} className="as-input w-auto text-sm">
                <option value="all">All roles</option>
                <option value="bat">Batsman</option>
                <option value="bowl">Bowler</option>
                <option value="ar">All-rounder</option>
                <option value="wk">Wicket-keeper</option>
              </select>
            </div>
            {filteredAvailable.length === 0 ? (
              <div className="p-6 text-center text-[14px]" style={{ color: 'var(--text-2)' }}>No available players</div>
            ) : (
              <div className="max-h-72 overflow-y-auto divide-y" style={{ borderColor: 'var(--separator)' }}>
                {filteredAvailable.map(p => (
                  <div key={p.id} className="flex items-center justify-between gap-2 px-4 py-2.5">
                    <div className="flex items-center gap-2 min-w-0">
                      {p.photoUrl ? <img src={p.photoUrl} alt="" className="w-8 h-8 rounded-full object-cover" /> : <span className="w-8 h-8 rounded-full flex items-center justify-center text-xs" style={{ background: 'var(--fill)' }}>P</span>}
                      <div className="min-w-0">
                        <div className="font-medium truncate">{p.name}</div>
                        <div className="text-[12px]" style={{ color: 'var(--text-2)' }}>{p.role} · ₹{(p.basePrice || 0).toLocaleString()}</div>
                      </div>
                    </div>
                    {isAdmin && (
                      <button type="button" className="as-btn-ghost text-sm shrink-0" disabled={!!auction.currentPlayerId} onClick={() => selectPlayer(p.id)}>Select</button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {openPanel === 'sold' && (
          <div className="glass overflow-hidden">
            {soldList.length === 0 ? (
              <div className="p-6 text-center text-[14px]" style={{ color: 'var(--text-2)' }}>No sold players yet</div>
            ) : (
              <table>
                <thead><tr><th>Player</th><th>Team</th><th>Price</th></tr></thead>
                <tbody>
                  {soldList.map(s => (
                    <tr key={s.id}>
                      <td className="font-medium">{s.player?.name || s.playerId}</td>
                      <td>{s.team?.name || '—'}</td>
                      <td className="tabular-nums">₹{Number(s.soldPrice || 0).toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}

        {openPanel === 'unsold' && (
          <div className="glass overflow-hidden">
            {unsoldPlayers.length === 0 ? (
              <div className="p-6 text-center text-[14px]" style={{ color: 'var(--text-2)' }}>No unsold players</div>
            ) : (
              <div className="max-h-72 overflow-y-auto">
                {unsoldPlayers.map(p => (
                  <div key={p.id} className="flex items-center justify-between px-4 py-2 border-b" style={{ borderColor: 'var(--separator)' }}>
                    <span className="font-medium">{p.name}</span>
                    <span className="text-[13px]" style={{ color: 'var(--text-2)' }}>{p.role}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {openPanel === 'history' && (
          <div className="glass overflow-hidden">
            {bidHistory.length === 0 ? (
              <div className="p-6 text-center text-[14px]" style={{ color: 'var(--text-2)' }}>No bids yet</div>
            ) : (
              <div className="max-h-72 overflow-y-auto">
                {bidHistory.map(b => (
                  <div key={b.id} className="flex items-center justify-between px-4 py-2 border-b" style={{ borderColor: 'var(--separator)' }}>
                    <span>{b.teamName}</span>
                    <span className="font-semibold tabular-nums">₹{Number(b.amount).toLocaleString()}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {isAdmin && auction.status === 'draft' && (
          <div className="glass p-4">
            <div className="font-semibold text-[14px] mb-2">Auction settings & bid ladder</div>
            <BidRulesEditor
              initialRules={auction.bidRules}
              initialTimer={auction.bidTimerSeconds}
              initialName={auction.name}
              showTimer={feat('auctionTimer')}
              onSave={saveSettings}
            />
          </div>
        )}
      </div>
    </AppShell>
  );
}
