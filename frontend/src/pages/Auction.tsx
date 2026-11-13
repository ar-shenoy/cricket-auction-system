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
      setCurrentPlayer(null);
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
      setCurrentPlayer(null);
      await resyncLists(auction.id);
    } catch (err: any) { showMsg('error', err.response?.data?.error || 'Sell failed'); }
  };

  const markUnsold = async () => {
    if (!auction) return;
    try {
      const res = await api.post(`/auctions/${auction.id}/unsold`);
      setAuction(res.data.auction);
      setCurrentPlayer(null);
      await resyncLists(auction.id);
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

  const placeBid = async () => {
    if (!auction || !adminBidTeamId) return;
    const amount = Number(bidAmount);
    if (!amount || amount <= 0) return;
    await placeBidForTeam(adminBidTeamId, amount);
  };

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
      {message && (
        <div className="glass p-3 mb-4 text-[13px]" style={{ color: message.type === 'error' ? '#ff3b30' : message.type === 'success' ? '#30d158' : 'var(--accent)' }}>
          {message.text}
        </div>
      )}

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
                <button type="button" onClick={nextRandomPlayer} className="as-btn-ghost text-sm">Random</button>
                {feat('auctionRecallUnsold') && <button type="button" onClick={recallUnsold} className="as-btn-ghost text-sm">Recall unsold</button>}
                <button type="button" onClick={undoLastBid} className="as-btn-ghost text-sm">Undo bid</button>
                <button type="button" onClick={undoLastSale} className="as-btn-ghost text-sm">Undo last sell</button>
                <button type="button" onClick={sellPlayer} className="as-btn-primary text-sm">Sell</button>
                <button type="button" onClick={markUnsold} className="as-btn-ghost text-sm">Unsold</button>
                <button type="button" onClick={endAuction} className="as-btn-ghost text-sm" style={{ color: '#ff3b30' }}>End</button>
              </>
            )}
            {auction.status === 'draft' && (
              <button type="button" onClick={nextRandomPlayer} className="as-btn-ghost text-sm">Random</button>
            )}
          </div>
        )}

        {/* Player card */}
        <div className="glass p-5 min-h-[160px]">
          {currentPlayer ? (
            <div className="flex gap-4 items-start">
              {currentPlayer.photoUrl ? (
                <img src={currentPlayer.photoUrl} alt="" className="w-20 h-20 rounded-2xl object-cover" />
              ) : (
                <div className="w-20 h-20 rounded-2xl flex items-center justify-center text-2xl" style={{ background: 'var(--fill)' }}>🏏</div>
              )}
              <div className="flex-1 min-w-0">
                <h2 className="text-xl font-semibold truncate">{currentPlayer.name}</h2>
                <p className="text-[13px]" style={{ color: 'var(--text-2)' }}>
                  {currentPlayer.role}{currentPlayer.city ? ` · ${currentPlayer.city}` : ''} · Base ₹{(currentPlayer.basePrice || 0).toLocaleString()}
                </p>
                <p className="mt-2 text-2xl font-bold tabular-nums" style={{ color: 'var(--accent)' }}>
                  ₹{(auction.currentBid || 0).toLocaleString()}
                </p>
                {currentBidder && (
                  <p className="text-[13px] mt-1" style={{ color: 'var(--text-2)' }}>Leading: {currentBidder.name}</p>
                )}
                {feat('auctionTimer') && timerLeft != null && (
                  <p className={`mt-2 text-sm font-mono ${timerLeft <= 5 ? 'text-red-400' : ''}`}>⏱ {timerLeft}s</p>
                )}
              </div>
            </div>
          ) : (
            <p className="text-center py-8" style={{ color: 'var(--text-2)' }}>
              {auction.status === 'draft'
                ? 'Auction is draft — press Start, then pick a player'
                : availablePlayers.length === 0
                  ? 'No approved players — import & approve first'
                  : 'Select a player or press Random'}
            </p>
          )}
        </div>

        {/* Team bid grid */}
        <div>
          <p className="text-[12px] mb-2" style={{ color: 'var(--text-2)' }}>Tap team = next bid step</p>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
            {teams.map((tm, idx) => {
              const sold = teamSoldCount(tm.id);
              const full = tm.maxPlayers != null && sold >= Number(tm.maxPlayers);
              const leading = auction.currentBidderTeamId === tm.id;
              const disabled = full || leading || auction.status !== 'live' || !currentPlayer;
              return (
                <button
                  key={tm.id}
                  type="button"
                  disabled={disabled}
                  onClick={() => quickBid(tm)}
                  className={`text-left rounded-2xl p-3 border transition ${leading ? 'ring-2 ring-emerald-500/50' : ''}`}
                  style={{ background: 'var(--fill)', borderColor: 'var(--border)', opacity: disabled && !leading ? 0.55 : 1 }}
                >
                  <div className="flex items-center gap-2">
                    <span className="w-8 h-8 rounded-full flex items-center justify-center text-[11px] font-bold" style={{ background: 'var(--surface)' }}>{teamInitials(tm.name)}</span>
                    <span className="font-medium text-[13px] truncate">{tm.name}</span>
                  </div>
                  <div className="text-[12px] mt-1.5 tabular-nums" style={{ color: 'var(--text-2)' }}>
                    ₹{Number(tm.remainingPurse || 0).toLocaleString()}
                    {feat('auctionBudgetHints') && tm.maxPlayers != null && ` · ${sold}/${tm.maxPlayers}`}
                  </div>
                  {isAdmin && <div className="text-[10px] mt-1" style={{ color: 'var(--text-2)' }}>Key {idx + 1}</div>}
                </button>
              );
            })}
          </div>
        </div>

        {/* Admin manual bid */}
        {isAdmin && auction.status === 'live' && currentPlayer && (
          <div className="flex flex-wrap gap-2 items-end">
            <div>
              <label className="text-[11px] block mb-1" style={{ color: 'var(--text-2)' }}>Team</label>
              <select value={adminBidTeamId} onChange={e => setAdminBidTeamId(e.target.value)} className="as-input text-sm">
                <option value="">Select team</option>
                {teams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </div>
            <div>
              <label className="text-[11px] block mb-1" style={{ color: 'var(--text-2)' }}>Amount</label>
              <input type="number" value={bidAmount} onChange={e => setBidAmount(e.target.value)} className="as-input text-sm w-28" />
            </div>
            <button type="button" onClick={placeBid} className="as-btn-primary text-sm">Place bid</button>
          </div>
        )}

        {/* Collapsible panels */}
        <div className="flex flex-wrap gap-2">
          {(['available', 'sold', 'unsold', 'history'] as const).map(key => (
            <button
              key={key}
              type="button"
              onClick={() => setOpenPanel(p => p === key ? null : key)}
              className="as-btn-ghost text-sm"
              style={openPanel === key ? { background: 'var(--fill)' } : undefined}
            >
              {key === 'history' ? `Bid history (${bidHistory.length})` : key === 'available' ? `Available (${availablePlayers.length})` : key === 'sold' ? `Sold (${soldList.length})` : `Unsold (${unsoldPlayers.length})`}
            </button>
          ))}
        </div>

        {openPanel === 'available' && (
          <div className="glass p-3 max-h-56 overflow-y-auto space-y-1">
            <div className="flex gap-1 mb-2 flex-wrap">
              {['all', 'bat', 'bowl', 'ar', 'wk'].map(r => (
                <button key={r} type="button" className="text-[11px] px-2 py-0.5 rounded-full" style={{ background: roleFilter === r ? 'var(--accent)' : 'var(--fill)', color: roleFilter === r ? '#fff' : 'var(--text-2)' }} onClick={() => setRoleFilter(r)}>{r}</button>
              ))}
            </div>
            {filteredAvailable.map(p => (
              <button key={p.id} type="button" className="w-full text-left px-3 py-2 rounded-xl text-[13px]" style={{ background: 'var(--fill)' }} onClick={() => isAdmin && selectPlayer(p.id)} disabled={!isAdmin || auction.status === 'draft'}>
                {p.name} · {p.role} · ₹{(p.basePrice || 0).toLocaleString()}
              </button>
            ))}
            {filteredAvailable.length === 0 && <div className="text-center py-4 text-[13px]" style={{ color: 'var(--text-2)' }}>No players in this filter</div>}
          </div>
        )}

        {openPanel === 'sold' && (
          <div className="glass p-3 max-h-56 overflow-y-auto space-y-1">
            {soldList.map(s => (
              <div key={s.id} className="px-3 py-2 rounded-xl text-[13px] flex justify-between" style={{ background: 'var(--fill)' }}>
                <span className="truncate">{s.player?.name} → {s.team?.name}</span>
                <span className="tabular-nums">₹{Number(s.soldPrice).toLocaleString()}</span>
              </div>
            ))}
            {soldList.length === 0 && <div className="text-center py-4 text-[13px]" style={{ color: 'var(--text-2)' }}>No sales yet</div>}
          </div>
        )}

        {openPanel === 'unsold' && (
          <div className="glass p-3 max-h-56 overflow-y-auto space-y-1">
            {unsoldPlayers.map(p => (
              <button key={p.id} type="button" className="w-full text-left px-3 py-2 rounded-xl text-[13px]" style={{ background: 'var(--fill)' }} onClick={() => isAdmin && selectPlayer(p.id)}>{p.name} · {p.role}</button>
            ))}
            {unsoldPlayers.length === 0 && <div className="text-center py-4 text-[13px]" style={{ color: 'var(--text-2)' }}>No unsold players</div>}
          </div>
        )}

        {openPanel === 'history' && (
          <div className="glass p-3 max-h-56 overflow-y-auto space-y-1">
            {bidHistory.map(b => (
              <div key={b.id} className="px-3 py-2 rounded-xl text-[13px] flex justify-between" style={{ background: 'var(--fill)' }}>
                <span>{b.teamName || b.teamId}</span>
                <span className="tabular-nums">₹{b.amount.toLocaleString()}</span>
              </div>
            ))}
            {bidHistory.length === 0 && <div className="text-center py-4 text-[13px]" style={{ color: 'var(--text-2)' }}>No bids yet</div>}
          </div>
        )}

        {/* Settings — draft only */}
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
