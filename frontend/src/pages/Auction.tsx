import React, { useEffect, useState, useRef, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import AppShell from '../components/AppShell';
import api, { getSocketUrl } from '../services/api';
import { io, Socket } from 'socket.io-client';
import { nextMinBid, DEFAULT_BID_RULES, BidRule } from '../utils/bidRules';
import BidRulesEditor from '../components/BidRulesEditor';
import { startKeepAliveInterval } from '../utils/keepAlive';

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
  const [openPanel, setOpenPanel] = useState<'available' | 'sold' | 'unsold' | 'history' | null>('available');
  const [roleFilter, setRoleFilter] = useState('all');
  const [bidHistory, setBidHistory] = useState<{ id: string; amount: number; teamId: string; teamName: string }[]>([]);
  const [watchers, setWatchers] = useState(0);
  const socketRef = useRef<Socket | null>(null);
  const timerDeadlineRef = useRef<number | null>(null);
  const autoUnsoldRef = useRef(false);
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
      const teamMap = Object.fromEntries((teamsRes.data || []).map((tm: Team) => [tm.id, tm.name]));
      setBidHistory(bids.slice().sort((a: any, b: any) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime()).slice(0, 40)
        .map((b: any) => ({ id: b.id, amount: Number(b.amount) || 0, teamId: b.teamId, teamName: teamMap[b.teamId] || b.teamId })));
    } catch (e) { console.error(e); }
  }, []);

  const loadAuction = useCallback(async () => {
    try {
      const res = await api.get('/auctions/active');
      const a = res.data && res.data.id ? res.data : null;
      setAuction(a);
      if (a?.id) {
        await resyncLists(a.id);
        if (a.status === 'completed') {
          setCurrentPlayer(null);
        } else if (a.currentPlayerId) {
          const players = await api.get('/players');
          const p = (players.data || []).find((x: Player) => x.id === a.currentPlayerId);
          setCurrentPlayer(p || null);
        } else setCurrentPlayer(null);
      } else setCurrentPlayer(null);
    } catch (e) {
      console.error(e);
      setAuction(null);
    } finally {
      setLoading(false);
    }
  }, [resyncLists]);

  useEffect(() => { loadAuction(); }, [loadAuction]);
  useEffect(() => startKeepAliveInterval(5 * 60 * 1000), []);

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
    const socket = io(getSocketUrl(), {
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: 30,
      reconnectionDelay: 500,
      reconnectionDelayMax: 3000,
      timeout: 8000
    });
    socketRef.current = socket;
    socket.emit('join-auction', auction.id);

    socket.on('new-bid', (payload: any) => {
      if (payload.auction) setAuction(payload.auction);
      if (payload.bid && payload.team) {
        setBidHistory(prev => [{ id: payload.bid.id, amount: payload.bid.amount, teamId: payload.team.id, teamName: payload.team.name }, ...prev].slice(0, 40));
      }
      if (!payload.undo) {
        const secs = Number(payload.auction?.bidTimerSeconds) || 0;
        if (secs > 0) {
          timerDeadlineRef.current = Date.now() + secs * 1000;
          autoUnsoldRef.current = false;
          setTimerLeft(secs);
        }
      }
      if (payload.undo && payload.auction?.id) resyncLists(payload.auction.id);
    });

    socket.on('player-selected', (payload: any) => {
      if (payload.auction) setAuction(payload.auction);
      if (payload.player) setCurrentPlayer(payload.player);
      const secs = Number(payload.auction?.bidTimerSeconds) || 0;
      if (secs > 0) {
        timerDeadlineRef.current = Date.now() + secs * 1000;
        autoUnsoldRef.current = false;
        setTimerLeft(secs);
      } else {
        timerDeadlineRef.current = null;
        setTimerLeft(null);
      }
    });

    socket.on('player-sold', (payload: any) => {
      if (payload.auction) setAuction(payload.auction);
      setCurrentPlayer(null);
      timerDeadlineRef.current = null;
      setTimerLeft(null);
      autoUnsoldRef.current = false;
      if (payload.auction?.id) resyncLists(payload.auction.id);
    });

    socket.on('auction-status', (a: Auction) => setAuction(a));
    socket.on('auction-started', (a: Auction) => setAuction(a));
    socket.on('auction-ended', (a: Auction) => { setAuction(a); setCurrentPlayer(null); timerDeadlineRef.current = null; setTimerLeft(null); });
    socket.on('watchers', (n: number) => setWatchers(n));

    return () => { socket.disconnect(); };
  }, [auction?.id, resyncLists]);

  useEffect(() => {
    if (!auction?.currentPlayerId || auction.status !== 'live') {
      if (!auction?.currentPlayerId) {
        timerDeadlineRef.current = null;
        setTimerLeft(null);
      }
      return;
    }
    const secs = Number(auction.bidTimerSeconds) || 0;
    if (secs <= 0) {
      timerDeadlineRef.current = null;
      setTimerLeft(null);
      return;
    }
    if (timerDeadlineRef.current == null) {
      if (auction.timerEndsAt) {
        const serverLeft = Math.ceil((new Date(auction.timerEndsAt).getTime() - Date.now()) / 1000);
        const left = Math.max(0, Math.min(secs, serverLeft > 0 ? serverLeft : secs));
        timerDeadlineRef.current = Date.now() + left * 1000;
        setTimerLeft(left);
      } else {
        timerDeadlineRef.current = Date.now() + secs * 1000;
        setTimerLeft(secs);
      }
      autoUnsoldRef.current = false;
    }
    const tick = () => {
      const dl = timerDeadlineRef.current;
      if (dl == null) return;
      const left = Math.max(0, Math.ceil((dl - Date.now()) / 1000));
      setTimerLeft(left);
      if (left <= 0 && !autoUnsoldRef.current) {
        autoUnsoldRef.current = true;
        timerDeadlineRef.current = null;
        if (isAdmin && auction?.id) {
          api.post(`/auctions/${auction.id}/unsold`).then((res) => {
            if (res.data?.auction) setAuction(res.data.auction);
            setCurrentPlayer(null);
            setTimerLeft(null);
            resyncLists(auction.id);
          }).catch(() => { autoUnsoldRef.current = false; });
        }
      }
    };
    tick();
    const id = setInterval(tick, 100);
    return () => clearInterval(id);
  }, [auction?.currentPlayerId, auction?.status, auction?.bidTimerSeconds, auction?.id, isAdmin, resyncLists]);

  const teamSoldCount = (teamId: string) => soldList.filter(s => s.teamId === teamId).length;

  const placeBidForTeam = async (teamId: string, amount: number) => {
    if (!auction) return;
    try {
      const res = await api.post(`/auctions/${auction.id}/bid`, { teamId, amount });
      setAuction(res.data.auction);
      setBidAmount(String(nextMinBid(res.data.auction.currentBid, true, res.data.auction)));
      const secs = Number(res.data.auction?.bidTimerSeconds) || 0;
      if (secs > 0) {
        timerDeadlineRef.current = Date.now() + secs * 1000;
        autoUnsoldRef.current = false;
        setTimerLeft(secs);
      }
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
      if (res.data?.auction) setAuction(res.data.auction);
      setCurrentPlayer(null);
      timerDeadlineRef.current = null; setTimerLeft(null); autoUnsoldRef.current = false;
      resyncLists(auction.id);
      showMsg('success', 'Sold');
    } catch (err: any) { showMsg('error', err.response?.data?.error || 'Sell failed'); }
  };

  const markUnsold = async () => {
    if (!auction) return;
    try {
      const res = await api.post(`/auctions/${auction.id}/unsold`);
      if (res.data?.auction) setAuction(res.data.auction);
      setCurrentPlayer(null);
      timerDeadlineRef.current = null; setTimerLeft(null); autoUnsoldRef.current = false;
      resyncLists(auction.id);
      showMsg('info', 'Marked unsold');
    } catch (err: any) { showMsg('error', err.response?.data?.error || 'Unsold failed'); }
  };

  const undoLastBid = async () => {
    if (!auction) return;
    try {
      const res = await api.post(`/auctions/${auction.id}/undo-last-bid`);
      setAuction(res.data.auction);
      showMsg('success', res.data.message || 'Bid undone');
      resyncLists(auction.id);
    } catch (err: any) { showMsg('error', err.response?.data?.error || 'Undo bid failed'); }
  };

  const undoLastSale = async () => {
    if (!auction) return;
    try {
      const res = await api.post(`/auctions/${auction.id}/undo-last-sell`);
      setAuction(res.data.auction);
      if (res.data.player) setCurrentPlayer(res.data.player);
      const secs = Number(res.data.auction?.bidTimerSeconds) || 0;
      if (secs > 0) {
        timerDeadlineRef.current = Date.now() + secs * 1000;
        autoUnsoldRef.current = false;
        setTimerLeft(secs);
      }
      showMsg('success', res.data.message || 'Sale undone');
      resyncLists(auction.id);
    } catch (err: any) { showMsg('error', err.response?.data?.error || 'Undo sale failed'); }
  };

  const nextRandomPlayer = async () => {
    if (!auction) return;
    if (auction.currentPlayerId) {
      showMsg('error', 'Finish current player (Sell / Unsold) before drawing next');
      return;
    }
    if (availablePlayers.length === 0) { showMsg('error', 'No approved players left'); return; }
    try {
      const res = await api.post(`/auctions/${auction.id}/next-random`);
      setAuction(res.data.auction);
      setCurrentPlayer(res.data.player);
      const secs = Number(res.data.auction?.bidTimerSeconds) || 0;
      if (secs > 0) {
        timerDeadlineRef.current = Date.now() + secs * 1000;
        autoUnsoldRef.current = false;
        setTimerLeft(secs);
      } else { timerDeadlineRef.current = null; setTimerLeft(null); }
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
      const secs = Number(res.data.auction?.bidTimerSeconds) || 0;
      if (secs > 0) {
        timerDeadlineRef.current = Date.now() + secs * 1000;
        autoUnsoldRef.current = false;
        setTimerLeft(secs);
      } else { timerDeadlineRef.current = null; setTimerLeft(null); }
    } catch (err: any) { showMsg('error', err.response?.data?.error || 'Select failed'); }
  };

  const recallUnsold = async () => {
    if (!auction) return;
    try {
      const res = await api.post(`/auctions/${auction.id}/recall-unsold`, {});
      setAuction(res.data.auction);
      if (res.data.player) setCurrentPlayer(res.data.player);
      const secs = Number(res.data.auction?.bidTimerSeconds) || 0;
      if (secs > 0) {
        timerDeadlineRef.current = Date.now() + secs * 1000;
        autoUnsoldRef.current = false;
        setTimerLeft(secs);
      }
      resyncLists(auction.id);
    } catch (err: any) { showMsg('error', err.response?.data?.error || 'Recall failed'); }
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
      setCurrentPlayer(null);
      setSoldList([]);
      setUnsoldPlayers([]);
      setBidHistory([]);
      showMsg('success', 'New auction created (draft) — set timer then Start');
      if (res.data?.id) await resyncLists(res.data.id);
    } catch (err: any) { showMsg('error', err.response?.data?.error || 'Create failed'); }
    finally { setCreating(false); }
  };

  const saveSettings = async (data: { bidRules: BidRule[]; bidTimerSeconds: number; name: string }) => {
    if (!auction) return;
    const res = await api.put(`/auctions/${auction.id}/settings`, data);
    setAuction(res.data);
    showMsg('success', `Settings saved · timer ${data.bidTimerSeconds === 0 ? 'off' : data.bidTimerSeconds + 's'}`);
  };

  const startAuction = async () => {
    if (!auction) return;
    if (availablePlayers.length === 0) { showMsg('error', 'No approved players'); return; }
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
      timerDeadlineRef.current = null; setTimerLeft(null);
      showMsg('success', 'Auction ended');
    } catch (err: any) { showMsg('error', err.response?.data?.error || 'End failed'); }
  };

  const shareLive = () => {
    const url = `${window.location.origin}/live`;
    navigator.clipboard?.writeText(url).then(() => showMsg('success', 'Live link copied')).catch(() => showMsg('info', url));
  };

  const exportSquadsCsv = () => {
    const rows = [['Team', 'Player', 'Role', 'Price']];
    soldList.forEach(s => rows.push([s.team?.name || '', s.player?.name || '', s.player?.role || '', String(s.soldPrice || 0)]));
    const csv = rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `squads-${auction?.id || 'export'}.csv`;
    a.click();
  };

  const filteredAvailable = availablePlayers.filter(p => roleFilter === 'all' || roleKey(p.role) === roleFilter);
  const currentBidder = teams.find(t => t.id === auction?.currentBidderTeamId);
  const currentBidderName = currentBidder?.name || '—';

  if (loading) {
    return (<AppShell title="Auction"><div className="glass p-8 text-center" style={{ color: 'var(--text-2)' }}>Loading…</div></AppShell>);
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

      <div className="space-y-3.5">
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
                <button type="button" onClick={nextRandomPlayer} className="as-btn-ghost text-sm" disabled={!!auction.currentPlayerId} title={auction.currentPlayerId ? 'Finish current player first' : 'Draw random'}>Random</button>
                {feat('auctionRecallUnsold') && <button type="button" onClick={recallUnsold} className="as-btn-ghost text-sm" disabled={!!auction.currentPlayerId}>Recall unsold</button>}
                <button type="button" onClick={undoLastBid} className="as-btn-ghost text-sm">Undo bid</button>
                <button type="button" onClick={undoLastSale} className="as-btn-ghost text-sm">Undo last sell</button>
                <button type="button" onClick={sellPlayer} className="as-btn-primary text-sm" style={{ background: '#30d158' }}>Sell</button>
                <button type="button" onClick={markUnsold} className="as-btn-ghost text-sm">Unsold</button>
                <button type="button" onClick={endAuction} className="as-btn-ghost text-sm" style={{ color: '#ff3b30' }}>End</button>
              </>
            )}
            {auction.status === 'draft' && (
              <button type="button" onClick={nextRandomPlayer} className="as-btn-ghost text-sm" disabled={!!auction.currentPlayerId}>Random</button>
            )}
            {auction.status === 'completed' && (
              <>
                <span className="text-[13px]" style={{ color: 'var(--text-2)' }}>This auction has ended.</span>
                <button type="button" onClick={createAuction} className="as-btn-primary text-sm" disabled={creating}>
                  {creating ? 'Creating…' : 'Start new auction'}
                </button>
              </>
            )}
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3.5">
          <div className="glass overflow-hidden min-h-[280px]">
            {currentPlayer && auction.status !== 'completed' ? (
              <div className="p-6 h-full flex flex-col">
                <div className="text-[13px] mb-2" style={{ color: 'var(--text-2)' }}>Now auctioning</div>
                <div className="flex gap-4 items-start flex-1">
                  {currentPlayer.photoUrl ? (
                    <img src={currentPlayer.photoUrl} alt="" className="w-24 h-24 sm:w-28 sm:h-28 rounded-2xl object-cover shrink-0" />
                  ) : (
                    <div className="w-24 h-24 sm:w-28 sm:h-28 rounded-2xl flex items-center justify-center text-3xl shrink-0" style={{ background: 'var(--fill)' }}>🏏</div>
                  )}
                  <div className="min-w-0 flex-1">
                    <h2 className="text-[26px] sm:text-[30px] font-semibold leading-tight">{currentPlayer.name}</h2>
                    <div className="flex flex-wrap gap-2 mt-2">
                      <span className="glass-island text-[11px]">{currentPlayer.role}</span>
                      {currentPlayer.city && <span className="glass-island text-[11px]">{currentPlayer.city}</span>}
                      <span className="glass-island text-[11px]">Base ₹{(currentPlayer.basePrice || 0).toLocaleString()}</span>
                    </div>
                    <div className="mt-5">
                      <div className="text-[12px]" style={{ color: 'var(--text-2)' }}>Current bid</div>
                      <div className="text-[32px] font-semibold tabular-nums" style={{ color: 'var(--accent)' }}>₹{(auction.currentBid || 0).toLocaleString()}</div>
                      <div className="text-[13px] mt-1" style={{ color: 'var(--text-2)' }}>by {currentBidderName}</div>
                      {timerLeft != null && (
                        <div className={`mt-2 text-[22px] font-semibold tabular-nums ${timerLeft <= 5 ? 'text-red-400' : ''}`}>
                          ⏱ {timerLeft}s
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="p-10 h-full flex items-center justify-center text-[14px]" style={{ color: 'var(--text-2)' }}>
                {auction.status === 'completed'
                  ? 'Auction completed — start a new one to continue'
                  : auction.status === 'draft'
                    ? 'Start the auction, then draw a player'
                    : 'Waiting for next player…'}
              </div>
            )}
          </div>

          <div className="glass p-4 min-h-[280px]">
            <div className="text-[13px] font-medium mb-3" style={{ color: 'var(--text-2)' }}>Teams · tap to bid</div>
            {isAdmin && (auction.status === 'live' || auction.status === 'paused') ? (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {teams.map((tm, idx) => {
                  const sold = teamSoldCount(tm.id);
                  const full = tm.maxPlayers != null && sold >= Number(tm.maxPlayers);
                  const leading = auction.currentBidderTeamId === tm.id;
                  return (
                    <button key={tm.id} type="button" disabled={full || leading || auction.status === 'paused' || !currentPlayer}
                      onClick={() => quickBid(tm)}
                      className="flex items-center gap-2.5 rounded-2xl px-3 py-2.5 min-h-[56px] text-left"
                      style={{ background: leading ? 'var(--accent)' : 'var(--fill)', color: leading ? '#fff' : 'var(--text)', opacity: full ? 0.5 : 1 }}>
                      {tm.logoUrl ? (
                        <img src={tm.logoUrl} alt="" className="w-10 h-10 rounded-xl object-cover shrink-0 bg-black/20" />
                      ) : (
                        <span className="w-10 h-10 rounded-xl flex items-center justify-center text-[12px] font-bold shrink-0" style={{ background: TEAM_COLORS[idx % TEAM_COLORS.length], color: '#fff' }}>{teamInitials(tm.name)}</span>
                      )}
                      <span className="min-w-0 flex-1">
                        <span className="block text-[12px] font-semibold truncate">{tm.name}</span>
                        <span className="block text-[10px] opacity-80 tabular-nums">₹{tm.remainingPurse.toLocaleString()} · {sold}{tm.maxPlayers != null ? `/${tm.maxPlayers}` : ''}</span>
                      </span>
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {teams.map((tm, idx) => {
                  const sold = teamSoldCount(tm.id);
                  const leading = auction.currentBidderTeamId === tm.id;
                  return (
                    <div key={tm.id} className="flex items-center gap-2.5 rounded-2xl px-3 py-2.5 min-h-[56px]"
                      style={{ background: leading ? 'var(--accent)' : 'var(--fill)', color: leading ? '#fff' : 'var(--text)' }}>
                      {tm.logoUrl ? <img src={tm.logoUrl} alt="" className="w-10 h-10 rounded-xl object-cover" /> : <span className="w-10 h-10 rounded-xl flex items-center justify-center text-[12px] font-bold" style={{ background: TEAM_COLORS[idx % TEAM_COLORS.length], color: '#fff' }}>{teamInitials(tm.name)}</span>}
                      <span className="min-w-0"><span className="block text-[12px] font-semibold truncate">{tm.name}</span><span className="block text-[10px] opacity-80">₹{tm.remainingPurse.toLocaleString()}</span></span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          {(['available', 'sold', 'unsold', 'history'] as const).map(k => (
            <button key={k} type="button" onClick={() => setOpenPanel(openPanel === k ? null : k)} className={openPanel === k ? 'as-btn-primary text-sm' : 'as-btn-ghost text-sm'}>
              {k === 'available' ? `Available (${filteredAvailable.length})` : k === 'sold' ? `Sold (${soldList.length})` : k === 'unsold' ? `Unsold (${unsoldPlayers.length})` : `Bids (${bidHistory.length})`}
            </button>
          ))}
        </div>

        {openPanel === 'available' && (
          <div className="glass overflow-hidden">
            <div className="p-3 flex flex-wrap gap-2 border-b" style={{ borderColor: 'var(--separator)' }}>
              {([['all', 'All'], ['bat', 'Bat'], ['bowl', 'Bowl'], ['ar', 'AR'], ['wk', 'WK']] as const).map(([k, label]) => (
                <button key={k} type="button" onClick={() => setRoleFilter(k)} className={roleFilter === k ? 'as-btn-primary text-sm !px-3 !py-1.5' : 'as-btn-ghost text-sm !px-3 !py-1.5'}>
                  {label}
                </button>
              ))}
            </div>
            <div className="max-h-72 overflow-y-auto">
              {filteredAvailable.map(p => (
                <div key={p.id} className="flex items-center justify-between gap-2 px-4 py-2.5 border-b" style={{ borderColor: 'var(--separator)' }}>
                  <div className="flex items-center gap-2 min-w-0">
                    {p.photoUrl ? <img src={p.photoUrl} alt="" className="w-8 h-8 rounded-full object-cover" /> : <span className="w-8 h-8 rounded-full flex items-center justify-center text-xs" style={{ background: 'var(--fill)' }}>P</span>}
                    <div><div className="font-medium truncate">{p.name}</div><div className="text-[12px]" style={{ color: 'var(--text-2)' }}>{p.role} · ₹{(p.basePrice || 0).toLocaleString()}</div></div>
                  </div>
                  {isAdmin && auction.status !== 'completed' && <button type="button" className="as-btn-ghost text-sm" disabled={!!auction.currentPlayerId} onClick={() => selectPlayer(p.id)}>Select</button>}
                </div>
              ))}
              {filteredAvailable.length === 0 && <div className="p-6 text-center text-[14px]" style={{ color: 'var(--text-2)' }}>No available players</div>}
            </div>
          </div>
        )}

        {openPanel === 'sold' && (
          <div className="glass overflow-hidden">
            {soldList.length === 0 ? <div className="p-6 text-center text-[14px]" style={{ color: 'var(--text-2)' }}>No sold players yet</div> : (
              <table><thead><tr><th>Player</th><th>Team</th><th>Price</th></tr></thead>
              <tbody>{soldList.map(s => (<tr key={s.id}><td className="font-medium">{s.player?.name || s.playerId}</td><td>{s.team?.name || '—'}</td><td className="tabular-nums">₹{Number(s.soldPrice || 0).toLocaleString()}</td></tr>))}</tbody></table>
            )}
          </div>
        )}

        {openPanel === 'unsold' && (
          <div className="glass overflow-hidden max-h-72 overflow-y-auto">
            {unsoldPlayers.length === 0 ? <div className="p-6 text-center text-[14px]" style={{ color: 'var(--text-2)' }}>No unsold players</div> :
              unsoldPlayers.map(p => (<div key={p.id} className="flex justify-between px-4 py-2 border-b" style={{ borderColor: 'var(--separator)' }}><span className="font-medium">{p.name}</span><span className="text-[13px]" style={{ color: 'var(--text-2)' }}>{p.role}</span></div>))}
          </div>
        )}

        {openPanel === 'history' && (
          <div className="glass overflow-hidden max-h-72 overflow-y-auto">
            {bidHistory.length === 0 ? <div className="p-6 text-center text-[14px]" style={{ color: 'var(--text-2)' }}>No bids yet</div> :
              bidHistory.map(b => (<div key={b.id} className="flex justify-between px-4 py-2 border-b" style={{ borderColor: 'var(--separator)' }}><span>{b.teamName}</span><span className="font-semibold tabular-nums">₹{Number(b.amount).toLocaleString()}</span></div>))}
          </div>
        )}

        {isAdmin && auction.status === 'draft' && (
          <div className="glass p-4">
            <div className="font-semibold text-[14px] mb-2">Auction settings & bid ladder</div>
            <p className="text-[12px] mb-3" style={{ color: 'var(--text-2)' }}>
              Name, timer (0 = off), and bid ladder. Only available before Start.
            </p>
            <BidRulesEditor
              showTimer={true}
              initialRules={auction.bidRules}
              initialTimer={auction.bidTimerSeconds}
              initialName={auction.name}
              onSave={saveSettings}
            />
          </div>
        )}
      </div>
    </AppShell>
  );
}
