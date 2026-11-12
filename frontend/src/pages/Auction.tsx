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
  const { user } = useAuth();
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
  const [bidHistory, setBidHistory] = useState<{ id: string; amount: number; teamId: string; teamName?: string }[]>([]);
  const [roleFilter, setRoleFilter] = useState<'all' | 'bat' | 'bowl' | 'ar' | 'wk'>('all');
  const [timerLeft, setTimerLeft] = useState<number | null>(null);
  const [watchers, setWatchers] = useState(0);
  const socketRef = useRef<Socket | null>(null);
  const auctionIdRef = useRef<string | null>(null);
  const timerFiredRef = useRef(false);
  const isAdmin = user?.role === 'admin' || user?.role === 'developer';
  const feat = (key: string) => features[key] !== false;

  useEffect(() => {
    api.get('/orgs/features').then(r => setFeatures(r.data.features || {})).catch(() => setFeatures({}));
  }, []);

  const showMsg = (type: 'success' | 'error' | 'info', text: string) => {
    setMessage({ type, text });
    setTimeout(() => setMessage(null), 3500);
  };

  const teamSoldCount = useCallback((teamId: string) => soldList.filter(s => s.teamId === teamId).length, [soldList]);

  const canTeamBid = useCallback((tm: Team) => {
    if (!auction || auction.status !== 'live') return false;
    if (tm.remainingPurse <= 0) return false;
    if (tm.maxPlayers != null && teamSoldCount(tm.id) >= Number(tm.maxPlayers)) return false;
    const minNext = nextMinBid(auction.currentBid || 0, !!auction.currentBidderTeamId, auction);
    if (minNext > tm.remainingPurse) return false;
    if (auction.currentBidderTeamId === tm.id) return false;
    return true;
  }, [auction, teamSoldCount]);

  const slotsHint = (tm: Team) => {
    if (tm.maxPlayers == null) return null;
    const bought = teamSoldCount(tm.id);
    const left = Math.max(0, Number(tm.maxPlayers) - bought);
    const minNext = auction ? nextMinBid(auction.currentBid || 0, !!auction.currentBidderTeamId, auction) : 0;
    if (left <= 0) return 'Squad full';
    const atMin = minNext > 0 ? Math.floor(tm.remainingPurse / minNext) : left;
    return `~${Math.min(left, Math.max(0, atMin))} more @ min`;
  };

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
      const sorted = bids.slice().sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime()).slice(0, 40)
        .map(b => ({ id: b.id, amount: Number(b.amount) || 0, teamId: b.teamId, teamName: teamMap[b.teamId] || b.teamId }));
      setBidHistory(sorted);
    } catch (e) { console.error(e); }
  }, []);

  const loadAuction = useCallback(async () => {
    try {
      const [aRes, tRes] = await Promise.all([api.get('/auctions/active'), api.get('/teams')]);
      setTeams(tRes.data || []);
      if (aRes.data) {
        setAuction(aRes.data);
        auctionIdRef.current = aRes.data.id;
        await resyncLists(aRes.data.id);
        if (aRes.data.currentPlayerId) {
          try {
            const p = await api.get(`/players/${aRes.data.currentPlayerId}`);
            setCurrentPlayer(p.data);
            setBidAmount(String(nextMinBid(aRes.data.currentBid || 0, !!aRes.data.currentBidderTeamId, aRes.data)));
          } catch { setCurrentPlayer(null); }
        } else setCurrentPlayer(null);
      } else {
        setAuction(null);
        auctionIdRef.current = null;
      }
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, [resyncLists]);

  useEffect(() => { loadAuction(); }, [loadAuction]);

  useEffect(() => {
    const socket = io(getSocketUrl(), { transports: ['websocket', 'polling'], reconnection: true, reconnectionAttempts: 20, reconnectionDelay: 1000 });
    socketRef.current = socket;
    const join = () => { if (auctionIdRef.current) socket.emit('join-auction', auctionIdRef.current); };
    socket.on('connect', () => { join(); if (auctionIdRef.current) loadAuction(); });
    socket.on('player-selected', (data: any) => {
      if (data.auction) setAuction(data.auction);
      if (data.player) setCurrentPlayer(data.player);
      timerFiredRef.current = false;
      if (data.auction) {
        setBidAmount(String(nextMinBid(data.auction.currentBid || 0, false, data.auction)));
        resyncLists(data.auction.id);
      }
    });
    socket.on('new-bid', (data: any) => {
      if (data.auction) {
        setAuction(data.auction);
        const hasBidder = !!data.auction.currentBidderTeamId;
        setBidAmount(String(nextMinBid(data.auction.currentBid || 0, hasBidder, data.auction)));
      }
      timerFiredRef.current = false;
      if (data.undo) {
        if (data.undoneBid?.id) setBidHistory(h => h.filter(b => b.id !== data.undoneBid.id));
        else if (data.auction?.id) resyncLists(data.auction.id);
      } else if (data.bid) {
        setBidHistory(h => [{ id: data.bid.id, amount: Number(data.bid.amount) || 0, teamId: data.bid.teamId, teamName: data.team?.name }, ...h].slice(0, 40));
      }
    });
    socket.on('player-sold', (data: any) => {
      if (data.auction) setAuction(data.auction);
      setCurrentPlayer(null);
      timerFiredRef.current = false;
      setTimerLeft(null);
      const isUndone = data.result?.status === 'Undone';
      if (isUndone && data.result?.player) setCurrentPlayer(data.result.player);
      showMsg(data.result?.status === 'Sold' ? 'success' : 'info',
        data.result?.status === 'Sold'
          ? `SOLD: ${data.result.player?.name} → ${data.result.team?.name} @ ₹${Number(data.result.price || 0).toLocaleString()}`
          : isUndone ? `Undone: ${data.result.player?.name}` : `UNSOLD: ${data.result?.player?.name}`);
      if (data.auction?.id) resyncLists(data.auction.id);
    });
    socket.on('auction-status', (data: any) => { if (data?.id) setAuction(data); else if (data?.auction) setAuction(data.auction); });
    socket.on('auction-started', (data: any) => { if (data) setAuction(data); });
    socket.on('presence', (data: any) => { if (typeof data?.count === 'number') setWatchers(data.count); });
    return () => { socket.disconnect(); };
  }, [loadAuction, resyncLists]);

  useEffect(() => {
    if (auction?.id && socketRef.current) {
      auctionIdRef.current = auction.id;
      socketRef.current.emit('join-auction', auction.id);
    }
  }, [auction?.id]);

  useEffect(() => {
    if (!feat('auctionTimer') || !auction?.timerEndsAt || auction.status !== 'live' || !auction.currentPlayerId) {
      setTimerLeft(null);
      return;
    }
    const tick = () => {
      const ends = new Date(auction.timerEndsAt!).getTime();
      const left = Math.max(0, Math.ceil((ends - Date.now()) / 1000));
      setTimerLeft(left);
      if (feat('auctionTimer') && left <= 0 && !timerFiredRef.current && isAdmin) {
        timerFiredRef.current = true;
        api.post(`/auctions/${auction.id}/unsold`).then(() => showMsg('info', 'Timer expired — marked Unsold')).catch(() => {});
      }
    };
    tick();
    const id = setInterval(tick, 250);
    return () => clearInterval(id);
  }, [auction?.timerEndsAt, auction?.status, auction?.currentPlayerId, auction?.id, isAdmin, features.auctionTimer]);

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
    if (auction.currentBidderTeamId === tm.id) { showMsg('error', `${tm.name} already has the highest bid — wait for another team`); return; }
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
    } catch (err: any) { showMsg('error', err.response?.data?.error || 'Failed'); }
  };

  const undoLastBid = async () => {
    if (!auction) return;
    if (!auction.currentPlayerId) {
      if (!confirm('No player on the block. Restore the last SOLD player?')) return;
      try {
        const res = await api.post(`/auctions/${auction.id}/undo-last-sell`, { force: true });
        setAuction(res.data.auction);
        if (res.data.result?.player) setCurrentPlayer(res.data.result.player);
        const shown = Number(res.data.result?.restoredBid || res.data.auction?.currentBid || 0);
        showMsg('info', res.data.result?.player ? `Sale undone: ${res.data.result.player.name} @ ₹${shown.toLocaleString()}` : 'Sale undone');
        await resyncLists(auction.id);
      } catch (err: any) { showMsg('error', err.response?.data?.error || 'Undo sale failed'); }
      return;
    }
    try {
      const res = await api.post(`/auctions/${auction.id}/undo-last-bid`);
      setAuction(res.data.auction);
      setBidAmount(String(nextMinBid(res.data.auction.currentBid || 0, !!res.data.auction.currentBidderTeamId, res.data.auction)));
      showMsg('info', res.data.message || 'Bid undone');
      await resyncLists(auction.id);
    } catch (err: any) { showMsg('error', err.response?.data?.error || 'Undo bid failed'); }
  };

  const nextRandomPlayer = async () => {
    if (!auction) return;
    if (availablePlayers.length === 0) { showMsg('error', 'No approved players left — import & approve players first'); return; }
    try {
      const res = await api.post(`/auctions/${auction.id}/next-random`);
      setAuction(res.data.auction);
      setCurrentPlayer(res.data.player);
      timerFiredRef.current = false;
      setBidAmount(String(nextMinBid(res.data.auction.currentBid || 0, false, res.data.auction)));
      showMsg('info', `Random: ${res.data.player.name}`);
      await resyncLists(auction.id);
    } catch (err: any) { showMsg('error', err.response?.data?.error || 'No players left'); }
  };

  useEffect(() => {
    if (!isAdmin || !auction || !feat('auctionKeyboard')) return;
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      const k = e.key.toLowerCase();
      if (k === 's') { e.preventDefault(); sellPlayer(); }
      else if (k === 'u') { e.preventDefault(); markUnsold(); }
      else if (k === 'r') { e.preventDefault(); nextRandomPlayer(); }
      else if (k === 'z') { e.preventDefault(); undoLastBid(); }
      else if (e.key >= '1' && e.key <= '9') {
        const tm = teams[Number(e.key) - 1];
        if (tm && canTeamBid(tm)) { e.preventDefault(); quickBid(tm); }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

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
        bidRules: DEFAULT_BID_RULES,
        bidTimerSeconds: feat('auctionTimer') ? 20 : 0
      });
      setAuction(res.data);
      auctionIdRef.current = res.data.id;
      showMsg('success', 'Auction created');
    } catch (err: any) { showMsg('error', err.response?.data?.error || 'Failed'); }
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

  const selectPlayer = async (playerId: string) => {
    if (!auction) return;
    try {
      const res = await api.post(`/auctions/${auction.id}/select-player`, { playerId });
      setAuction(res.data.auction);
      setCurrentPlayer(res.data.player);
      timerFiredRef.current = false;
      setBidAmount(String(nextMinBid(res.data.auction.currentBid || 0, false, res.data.auction)));
      await resyncLists(auction.id);
    } catch (err: any) { showMsg('error', err.response?.data?.error || 'Failed'); }
  };

  const recallUnsold = async () => {
    if (!auction) return;
    try {
      const res = await api.post(`/auctions/${auction.id}/recall-unsold`);
      setAuction(res.data.auction);
      setCurrentPlayer(res.data.player);
      timerFiredRef.current = false;
      setBidAmount(String(nextMinBid(res.data.auction.currentBid || 0, false, res.data.auction)));
      showMsg('info', `Recall unsold: ${res.data.player.name}`);
      await resyncLists(auction.id);
    } catch (err: any) { showMsg('error', err.response?.data?.error || 'No unsold players'); }
  };

  const endAuction = async () => {
    if (!auction) return;
    if (auction.status === 'completed') { showMsg('info', 'Already ended'); return; }
    if (!confirm('End this auction permanently?')) return;
    try {
      const res = await api.post(`/auctions/${auction.id}/end`);
      setAuction(res.data);
      setCurrentPlayer(null);
      showMsg('info', 'Ended');
    } catch (err: any) { showMsg('error', err.response?.data?.error || 'Failed'); }
  };

  const freshAuction = async () => {
    if (!confirm('Fresh auction? Reset everything.')) return;
    try {
      const res = await api.post('/auctions/fresh', {});
      setAuction(res.data.auction);
      setCurrentPlayer(null);
      setSoldList([]);
      showMsg('success', 'Fresh');
      loadAuction();
    } catch (err: any) { showMsg('error', err.response?.data?.error || 'Failed'); }
  };

  const shareLive = async () => {
    const url = `${window.location.origin}/live`;
    try {
      if (navigator.share) await navigator.share({ title: auction?.name || 'Live Auction', url, text: 'Watch the live auction' });
      else { await navigator.clipboard.writeText(url); showMsg('success', 'Live link copied'); }
    } catch {
      try { await navigator.clipboard.writeText(url); showMsg('success', 'Live link copied'); }
      catch { showMsg('info', url); }
    }
  };

  const exportSquadsCsv = () => {
    const rows = [['Team', 'Player', 'Role', 'Sold Price', 'City']];
    soldList.forEach(s => {
      rows.push([s.team?.name || s.teamId, s.player?.name || s.playerId, s.player?.role || '', String(s.soldPrice || 0), s.player?.city || '']);
    });
    const csv = rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `auction-squads-${auction?.id || 'export'}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
    showMsg('success', 'CSV downloaded');
  };

  if (loading) return <AppShell title="Auction"><div className="p-8 text-center">Loading…</div></AppShell>;

  const filteredAvailable = roleFilter === 'all' ? availablePlayers : availablePlayers.filter(p => roleKey(p.role) === roleFilter);
  const last5 = bidHistory.slice(0, 5);
  const currentBidder = teams.find(t => t.id === auction?.currentBidderTeamId);

  return (
    <AppShell title="Auction">
      <div className="max-w-6xl mx-auto p-4 space-y-4">
        {message && (
          <div className={`p-3 rounded text-sm ${message.type === 'success' ? 'bg-green-100 text-green-800' : message.type === 'error' ? 'bg-red-100 text-red-800' : 'bg-blue-100 text-blue-800'}`}>{message.text}</div>
        )}

        {!auction ? (
          <div className="text-center py-12 space-y-4">
            <p>No active auction</p>
            {isAdmin && <button type="button" onClick={createAuction} disabled={creating} className="as-btn-primary">Create auction</button>}
          </div>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl font-semibold flex-1">{auction.name}</h1>
              <span className="text-xs px-2 py-1 rounded" style={{ background: 'var(--surface-2)' }}>{auction.status.toUpperCase()}</span>
              {watchers > 0 && <span className="text-xs" style={{ color: 'var(--text-2)' }}>{watchers} watching</span>}
              {feat('auctionShareLive') && <button type="button" onClick={shareLive} className="as-btn-ghost text-sm">Share live</button>}
              {feat('auctionExport') && soldList.length > 0 && <button type="button" onClick={exportSquadsCsv} className="as-btn-ghost text-sm">Export CSV</button>}
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
                    <button type="button" onClick={endAuction} className="as-btn-ghost text-sm">End</button>
                  </>
                )}
                {auction.status === 'completed' && (
                  <button type="button" onClick={createAuction} className="as-btn-primary text-sm">New auction</button>
                )}
                {feat('auctionKeyboard') && <span className="text-[11px] hidden sm:inline" style={{ color: 'var(--text-2)' }}>Keys: S sell · U unsold · R random · 1–9 team · Z undo bid</span>}
              </div>
            )}

            {currentPlayer && auction && (
              <div className="rounded-lg p-4 space-y-3" style={{ background: 'var(--surface-1)', border: '1px solid var(--border)' }}>
                <div className="flex flex-wrap items-start gap-4">
                  <div className="flex-1 min-w-[200px]">
                    <div className="text-2xl font-bold">{currentPlayer.name}</div>
                    <div className="text-sm" style={{ color: 'var(--text-2)' }}>{currentPlayer.role} · Base ₹{Number(currentPlayer.basePrice || 0).toLocaleString()}{currentPlayer.city ? ` · ${currentPlayer.city}` : ''}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-3xl font-bold">₹{Number(auction.currentBid || 0).toLocaleString()}</div>
                    <div className="text-sm" style={{ color: 'var(--text-2)' }}>{currentBidder ? currentBidder.name : 'No bid yet'}</div>
                    {feat('auctionTimer') && timerLeft != null && (
                      <div className={`text-lg font-mono mt-1 ${timerLeft <= 5 ? 'text-red-500' : ''}`}>{timerLeft}s</div>
                    )}
                  </div>
                </div>
                {isAdmin && (
                  <div className="flex flex-wrap gap-2">
                    <button type="button" onClick={sellPlayer} className="as-btn-primary text-sm">Sell</button>
                    <button type="button" onClick={markUnsold} className="as-btn-ghost text-sm">Unsold</button>
                  </div>
                )}
                {isAdmin && (
                  <div className="flex flex-wrap gap-2 items-center">
                    <select value={adminBidTeamId} onChange={e => setAdminBidTeamId(e.target.value)} className="as-input text-sm">
                      <option value="">Team…</option>
                      {teams.map(t => <option key={t.id} value={t.id}>{t.name} (₹{t.remainingPurse.toLocaleString()})</option>)}
                    </select>
                    <input type="number" value={bidAmount} onChange={e => setBidAmount(e.target.value)} className="as-input text-sm w-28" />
                    <button type="button" onClick={placeBid} className="as-btn-primary text-sm">Bid</button>
                  </div>
                )}
                <div className="flex flex-wrap gap-2">
                  {teams.map((tm, i) => (
                    <button key={tm.id} type="button" disabled={!canTeamBid(tm)} onClick={() => quickBid(tm)}
                      className="as-btn-ghost text-xs px-2 py-1 disabled:opacity-40" title={feat('auctionBudgetHints') ? (slotsHint(tm) || undefined) : undefined}>
                      {i + 1}. {teamInitials(tm.name)} ₹{tm.remainingPurse.toLocaleString()}
                    </button>
                  ))}
                </div>
                {last5.length > 0 && (
                  <div className="text-xs space-y-1" style={{ color: 'var(--text-2)' }}>
                    <div className="font-medium">Last bids</div>
                    {last5.map(b => <div key={b.id}>{b.teamName || b.teamId}: ₹{b.amount.toLocaleString()}</div>)}
                  </div>
                )}
              </div>
            )}

            <div className="flex gap-2 text-sm">
              {(['available', 'sold', 'unsold', 'history'] as const).map(key => (
                <button key={key} type="button" onClick={() => setOpenPanel(openPanel === key ? null : key)}
                  className={`px-3 py-1 rounded ${openPanel === key ? 'as-btn-primary' : 'as-btn-ghost'}`}>
                  {key === 'history' ? `Bid history (${bidHistory.length})` : key === 'available' ? `Available (${availablePlayers.length})` : key === 'sold' ? `Sold (${soldList.length})` : `Unsold (${unsoldPlayers.length})`}
                </button>
              ))}
            </div>

            {openPanel === 'available' && (
              <div className="space-y-2">
                <div className="flex gap-1 text-xs">
                  {(['all', 'bat', 'bowl', 'ar', 'wk'] as const).map(r => (
                    <button key={r} type="button" onClick={() => setRoleFilter(r)} className={`px-2 py-0.5 rounded ${roleFilter === r ? 'as-btn-primary' : 'as-btn-ghost'}`}>{r}</button>
                  ))}
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-64 overflow-y-auto">
                  {filteredAvailable.map(p => (
                    <button key={p.id} type="button" onClick={() => isAdmin && selectPlayer(p.id)} className="text-left p-2 rounded text-sm" style={{ background: 'var(--surface-1)', border: '1px solid var(--border)' }}>
                      <div className="font-medium">{p.name}</div>
                      <div style={{ color: 'var(--text-2)' }}>{p.role} · ₹{Number(p.basePrice || 0).toLocaleString()}</div>
                    </button>
                  ))}
                  {filteredAvailable.length === 0 && <div className="text-center py-4 text-[13px]" style={{ color: 'var(--text-2)' }}>No players</div>}
                </div>
              </div>
            )}

            {openPanel === 'sold' && (
              <div className="max-h-64 overflow-y-auto space-y-1">
                {soldList.map(s => (
                  <div key={s.id} className="text-sm p-2 rounded" style={{ background: 'var(--surface-1)' }}>
                    {s.player?.name || s.playerId} → {s.team?.name || s.teamId} @ ₹{Number(s.soldPrice || 0).toLocaleString()}
                  </div>
                ))}
                {soldList.length === 0 && <div className="text-center py-4 text-[13px]" style={{ color: 'var(--text-2)' }}>No sold players</div>}
              </div>
            )}

            {openPanel === 'unsold' && (
              <div className="max-h-64 overflow-y-auto space-y-1">
                {unsoldPlayers.map(p => (
                  <div key={p.id} className="text-sm p-2 rounded" style={{ background: 'var(--surface-1)' }}>{p.name} · {p.role}</div>
                ))}
                {unsoldPlayers.length === 0 && <div className="text-center py-4 text-[13px]" style={{ color: 'var(--text-2)' }}>No unsold players</div>}
              </div>
            )}

            {openPanel === 'history' && (
              <div className="max-h-64 overflow-y-auto space-y-1">
                {bidHistory.map(b => (
                  <div key={b.id} className="text-sm p-2 rounded" style={{ background: 'var(--surface-1)' }}>
                    {b.teamName || b.teamId}: ₹{b.amount.toLocaleString()}
                  </div>
                ))}
                {bidHistory.length === 0 && <div className="text-center py-4 text-[13px]" style={{ color: 'var(--text-2)' }}>No bids yet</div>}
              </div>
            )}

            {isAdmin && auction.status !== 'completed' && (
              <div className="pt-4">
                <BidRulesEditor
                  initialRules={auction.bidRules || DEFAULT_BID_RULES}
                  initialTimer={auction.bidTimerSeconds || 0}
                  initialName={auction.name}
                  showTimer={feat('auctionTimer')}
                  onSave={saveSettings}
                />
              </div>
            )}
          </>
        )}
      </div>
    </AppShell>
  );
}
