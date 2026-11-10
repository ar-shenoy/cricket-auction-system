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
        setBidAmount(String(nextMinBid(data.auction.currentBid || 0, true, data.auction)));
      }
      timerFiredRef.current = false;
      if (data.bid) {
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
    if (!auction?.timerEndsAt || auction.status !== 'live' || !auction.currentPlayerId) {
      setTimerLeft(null);
      return;
    }
    const tick = () => {
      const ends = new Date(auction.timerEndsAt!).getTime();
      const left = Math.max(0, Math.ceil((ends - Date.now()) / 1000));
      setTimerLeft(left);
      if (left <= 0 && !timerFiredRef.current && isAdmin) {
        timerFiredRef.current = true;
        api.post(`/auctions/${auction.id}/unsold`).then(() => showMsg('info', 'Timer expired — marked Unsold')).catch(() => {});
      }
    };
    tick();
    const id = setInterval(tick, 250);
    return () => clearInterval(id);
  }, [auction?.timerEndsAt, auction?.status, auction?.currentPlayerId, auction?.id, isAdmin]);

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

  const undoLastSell = async () => {
    if (!auction) return;
    if (!confirm('Undo last sold player? They return at the last sold price.')) return;
    try {
      const res = await api.post(`/auctions/${auction.id}/undo-last-sell`);
      setAuction(res.data.auction);
      if (res.data.result?.player) setCurrentPlayer(res.data.result.player);
      const shown = Number(res.data.result?.restoredBid || res.data.auction?.currentBid || 0);
      showMsg('info', res.data.result?.player ? `Undone: ${res.data.result.player.name} @ ₹${shown.toLocaleString()}` : 'Undone');
      await resyncLists(auction.id);
    } catch (err: any) { showMsg('error', err.response?.data?.error || 'Undo failed'); }
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
    if (!isAdmin || !auction) return;
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      const k = e.key.toLowerCase();
      if (k === 's') { e.preventDefault(); sellPlayer(); }
      else if (k === 'u') { e.preventDefault(); markUnsold(); }
      else if (k === 'r') { e.preventDefault(); nextRandomPlayer(); }
      else if (k === 'z') { e.preventDefault(); undoLastSell(); }
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
        bidTimerSeconds: 20
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

  const filteredAvailable = availablePlayers.filter(p => roleFilter === 'all' || roleKey(p.role) === roleFilter);
  const last5 = bidHistory.slice(0, 5);
  const currentBidderName = teams.find(t => t.id === auction?.currentBidderTeamId)?.name || '—';
  const minNext = auction ? nextMinBid(auction.currentBid || 0, !!auction.currentBidderTeamId, auction) : 0;

  if (loading) {
    return <AppShell title="Live Auction"><div className="glass p-10 text-center" style={{ color: 'var(--text-2)' }}>Loading…</div></AppShell>;
  }

  return (
    <AppShell title="Live Auction">
      {message && (
        <div className="glass p-3 mb-4 text-[14px] font-medium" style={{ color: message.type === 'success' ? '#30d158' : message.type === 'error' ? '#ff3b30' : 'var(--accent)' }}>{message.text}</div>
      )}

      {!auction && isAdmin && (
        <div className="glass p-8 text-center space-y-4">
          <h2 className="text-[22px] font-semibold" style={{ color: 'var(--text)' }}>No active auction</h2>
          <div className="flex flex-wrap gap-3 justify-center">
            <button type="button" onClick={createAuction} disabled={creating} className="as-btn-primary">{creating ? 'Creating…' : 'Create auction'}</button>
            <button type="button" onClick={freshAuction} className="as-btn-ghost">Fresh new auction</button>
          </div>
        </div>
      )}

      {!auction && !isAdmin && (
        <div className="glass p-8 text-center" style={{ color: 'var(--text-2)' }}>Waiting for auction…</div>
      )}

      {auction && (
        <div className="space-y-3.5 pb-24 sm:pb-4">
          <div className="flex flex-wrap gap-2 items-center">
            <span className="glass-island text-[12px] font-semibold uppercase" style={{
              background: auction.status === 'live' ? 'rgba(48,209,88,0.2)' : auction.status === 'paused' ? 'rgba(255,159,10,0.25)' : 'var(--fill)',
              color: auction.status === 'live' ? '#30d158' : auction.status === 'paused' ? '#ff9f0a' : 'var(--text-2)'
            }}>{auction.status}</span>
            {watchers > 0 && <span className="glass-island text-[12px]" style={{ color: 'var(--text-2)' }}>{watchers} watching</span>}
            <span className="text-[12px]" style={{ color: 'var(--text-2)' }}>{availablePlayers.length} available · {soldList.length} sold · {unsoldPlayers.length} unsold</span>
            <div className="ml-auto flex flex-wrap gap-2">
              <button type="button" onClick={shareLive} className="as-btn-primary text-sm">Share live</button>
              <button type="button" onClick={exportSquadsCsv} className="as-btn-ghost text-sm">Export CSV</button>
            </div>
          </div>

          {auction.status === 'paused' && (
            <div className="rounded-2xl p-4 text-center text-[18px] font-bold tracking-wide" style={{ background: 'rgba(255,159,10,0.2)', color: '#ff9f0a' }}>PAUSED — bidding disabled</div>
          )}

          {availablePlayers.length === 0 && auction.status !== 'completed' && (
            <div className="glass p-4 text-[14px]" style={{ color: '#ff9f0a' }}>No approved players in the pool. Import players and set status to <strong>Approved</strong> before Random / Start.</div>
          )}

          {isAdmin && (
            <div className="glass p-3 flex flex-wrap gap-2 items-center">
              {auction.status === 'draft' && <button type="button" onClick={startAuction} className="as-btn-primary text-sm">Start</button>}
              {(auction.status === 'live' || auction.status === 'paused') && (
                <>
                  <button type="button" onClick={pauseAuction} className="as-btn-ghost text-sm">{auction.status === 'paused' ? 'Resume' : 'Pause'}</button>
                  <button type="button" onClick={nextRandomPlayer} className="as-btn-ghost text-sm">Random (R)</button>
                  <button type="button" onClick={recallUnsold} className="as-btn-ghost text-sm">Recall unsold</button>
                  <button type="button" onClick={undoLastSell} className="as-btn-ghost text-sm">Undo (Z)</button>
                  <button type="button" onClick={endAuction} className="as-btn-ghost text-sm">End</button>
                </>
              )}
              <span className="text-[11px] hidden sm:inline" style={{ color: 'var(--text-2)' }}>Keys: S sell · U unsold · R random · 1–9 team · Z undo</span>
            </div>
          )}

          <div className="glass p-5">
            {currentPlayer ? (
              <div className="flex flex-col sm:flex-row gap-4">
                <div className="flex gap-4 flex-1 min-w-0">
                  {currentPlayer.photoUrl ? (
                    <img src={currentPlayer.photoUrl} alt="" className="w-20 h-20 rounded-2xl object-cover shrink-0" />
                  ) : (
                    <div className="w-20 h-20 rounded-2xl flex items-center justify-center text-[22px] font-bold shrink-0" style={{ background: 'var(--fill)' }}>{currentPlayer.name.slice(0, 2).toUpperCase()}</div>
                  )}
                  <div className="min-w-0">
                    <div className="text-[22px] font-semibold truncate">{currentPlayer.name}</div>
                    <div className="text-[13px] mt-1" style={{ color: 'var(--text-2)' }}>{currentPlayer.role}{currentPlayer.city ? ` · ${currentPlayer.city}` : ''}</div>
                    <div className="text-[13px] mt-1" style={{ color: 'var(--text-2)' }}>Base ₹{Number(currentPlayer.basePrice || 0).toLocaleString()}{currentPlayer.previousPrice != null && <> · Prev ₹{Number(currentPlayer.previousPrice).toLocaleString()}</>}</div>
                    <div className="mt-2 text-[28px] font-semibold tabular-nums" style={{ color: 'var(--accent)' }}>₹{Number(auction.currentBid || 0).toLocaleString()}</div>
                    <div className="text-[13px]" style={{ color: 'var(--text-2)' }}>Leading: <strong style={{ color: 'var(--text)' }}>{currentBidderName}</strong>{' · '}Next min ₹{minNext.toLocaleString()}</div>
                  </div>
                </div>
                <div className="flex flex-col items-center justify-center gap-2 sm:w-28">
                  {timerLeft != null && auction.status === 'live' && (
                    <div className="text-[36px] font-black tabular-nums leading-none" style={{ color: timerLeft <= 5 ? '#ff3b30' : 'var(--text)' }}>{timerLeft}s</div>
                  )}
                  {isAdmin && auction.status === 'live' && (
                    <div className="flex sm:flex-col gap-2 w-full">
                      <button type="button" onClick={sellPlayer} className="as-btn-primary text-sm flex-1" style={{ background: '#30d158' }}>Sell (S)</button>
                      <button type="button" onClick={markUnsold} className="as-btn-ghost text-sm flex-1">Unsold (U)</button>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="text-center py-6" style={{ color: 'var(--text-2)' }}>
                {auction.status === 'draft' ? 'Auction is draft — press Start, then pick a player' : availablePlayers.length === 0 ? 'No approved players — import & approve first' : 'Select a player or press Random'}
              </div>
            )}
          </div>

          {last5.length > 0 && (
            <div className="flex gap-2 overflow-x-auto pb-1">
              {last5.map(b => (
                <div key={b.id} className="glass-island text-[12px] whitespace-nowrap shrink-0">{b.teamName || 'Team'} · ₹{b.amount.toLocaleString()}</div>
              ))}
            </div>
          )}

          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
            {teams.map((tm, idx) => {
              const leading = auction.currentBidderTeamId === tm.id;
              const disabled = !canTeamBid(tm);
              const full = tm.maxPlayers != null && teamSoldCount(tm.id) >= Number(tm.maxPlayers);
              const hint = slotsHint(tm);
              return (
                <button key={tm.id} type="button" disabled={disabled || !isAdmin || !currentPlayer} onClick={() => quickBid(tm)}
                  className="glass p-3 text-left transition active:scale-[0.98] disabled:opacity-45"
                  style={leading ? { outline: '2px solid var(--accent)', outlineOffset: 1 } : undefined}>
                  <div className="flex items-center gap-2">
                    <div className="w-9 h-9 rounded-xl flex items-center justify-center text-[12px] font-bold shrink-0" style={{ background: 'var(--fill)' }}>
                      {tm.logoUrl ? <img src={tm.logoUrl} alt="" className="w-full h-full rounded-xl object-cover" /> : teamInitials(tm.name)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-[13px] font-semibold truncate">{idx < 9 ? `${idx + 1}. ` : ''}{tm.name}{leading ? ' ★' : ''}</div>
                      <div className="text-[11px] tabular-nums" style={{ color: 'var(--text-2)' }}>₹{Number(tm.remainingPurse).toLocaleString()}{tm.maxPlayers != null ? ` · ${teamSoldCount(tm.id)}/${tm.maxPlayers}` : ''}</div>
                      {hint && <div className="text-[10px]" style={{ color: full ? '#ff3b30' : 'var(--text-2)' }}>{hint}</div>}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>

          {isAdmin && currentPlayer && auction.status === 'live' && (
            <div className="glass p-3 flex flex-wrap gap-2 items-end">
              <div className="flex-1 min-w-[120px]">
                <label className="as-label">Team</label>
                <select className="as-input" value={adminBidTeamId} onChange={e => setAdminBidTeamId(e.target.value)}>
                  <option value="">Select team</option>
                  {teams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
              </div>
              <div className="w-32">
                <label className="as-label">Amount</label>
                <input className="as-input" value={bidAmount} onChange={e => setBidAmount(e.target.value)} />
              </div>
              <button type="button" onClick={placeBid} className="as-btn-primary text-sm">Place bid</button>
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            {(['available', 'sold', 'unsold', 'history'] as const).map(key => (
              <button key={key} type="button" className="glass-island text-[12px] capitalize"
                style={openPanel === key ? { background: 'var(--accent)', color: '#fff' } : undefined}
                onClick={() => setOpenPanel(openPanel === key ? null : key)}>
                {key === 'history' ? `Bid history (${bidHistory.length})` : key === 'available' ? `Available (${availablePlayers.length})` : key === 'sold' ? `Sold (${soldList.length})` : `Unsold (${unsoldPlayers.length})`}
              </button>
            ))}
          </div>

          {openPanel === 'available' && (
            <div className="glass p-3 space-y-2">
              <div className="flex flex-wrap gap-1.5">
                {(['all', 'bat', 'bowl', 'ar', 'wk'] as const).map(f => (
                  <button key={f} type="button" className="glass-island text-[11px] uppercase"
                    style={roleFilter === f ? { background: 'var(--accent)', color: '#fff' } : undefined}
                    onClick={() => setRoleFilter(f)}>{f === 'all' ? 'All' : f === 'ar' ? 'AR' : f === 'wk' ? 'WK' : f}</button>
                ))}
              </div>
              <div className="max-h-56 overflow-y-auto space-y-1">
                {filteredAvailable.map(p => (
                  <button key={p.id} type="button" className="w-full text-left px-3 py-2 rounded-xl text-[13px] flex justify-between gap-2"
                    style={{ background: 'var(--fill)' }} onClick={() => isAdmin && selectPlayer(p.id)} disabled={!isAdmin || auction.status === 'draft'}>
                    <span className="truncate">{p.name} · {p.role}{p.city ? ` · ${p.city}` : ''}</span>
                    <span className="tabular-nums shrink-0">₹{Number(p.basePrice || 0).toLocaleString()}</span>
                  </button>
                ))}
                {filteredAvailable.length === 0 && <div className="text-center py-4 text-[13px]" style={{ color: 'var(--text-2)' }}>No players in this filter</div>}
              </div>
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

          {isAdmin && auction.status === 'draft' && (
            <div className="glass p-4">
              <div className="font-semibold text-[14px] mb-2">Auction settings & bid ladder</div>
              <BidRulesEditor auction={auction} onSave={saveSettings} />
            </div>
          )}
        </div>
      )}
    </AppShell>
  );
}
