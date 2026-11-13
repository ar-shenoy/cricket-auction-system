import React, { useEffect, useState, useRef, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import api, { getSocketUrl } from '../services/api';
import AppShell from '../components/AppShell';
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
  return (role || '').toLowerCase().replace(/\s+/g, '_');
}

export default function Auction() {
  const { user, isAdmin: isAdminFromAuth, isLoading: authLoading } = useAuth();
  const isAdmin = Boolean(isAdminFromAuth || user?.role === 'admin' || user?.role === 'developer');
  const [auction, setAuction] = useState<Auction | null>(null);
  const [listLoaded, setListLoaded] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [currentPlayer, setCurrentPlayer] = useState<Player | null>(null);
  const [teams, setTeams] = useState<Team[]>([]);
  const [soldList, setSoldList] = useState<SoldRecord[]>([]);
  const [unsoldPlayers, setUnsoldPlayers] = useState<Player[]>([]);
  const [availablePlayers, setAvailablePlayers] = useState<Player[]>([]);
  const [bidHistory, setBidHistory] = useState<{ id: string; amount: number; teamId: string; teamName: string }[]>([]);
  const [bidAmount, setBidAmount] = useState('');
  const [adminBidTeamId, setAdminBidTeamId] = useState('');
  const [msg, setMsg] = useState<{ type: 'ok' | 'error'; text: string } | null>(null);
  const [creating, setCreating] = useState(false);
  const [features, setFeatures] = useState<Record<string, boolean>>({});
  const [timerLeft, setTimerLeft] = useState<number | null>(null);
  const [showBidHistory, setShowBidHistory] = useState(false);
  const socketRef = useRef<Socket | null>(null);
  const timerFiredRef = useRef(false);

  const feat = (k: string) => features[k] !== false;

  const showMsg = (type: 'ok' | 'error', text: string) => {
    setMsg({ type, text });
    setTimeout(() => setMsg(null), 4000);
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
      const sorted = bids.slice().sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime()).slice(0, 40)
        .map(b => ({ id: b.id, amount: Number(b.amount) || 0, teamId: b.teamId, teamName: teamMap[b.teamId] || b.teamId }));
      setBidHistory(sorted);
    } catch (e) { console.error(e); }
  }, []);

  const loadAuction = useCallback(async () => {
    setLoadError(null);
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
    } catch (e: any) {
      console.error(e);
      setLoadError(e?.response?.data?.error || e?.message || 'Failed to load auction');
      setAuction(null);
    } finally {
      setListLoaded(true);
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
      if (payload.undo) {
        if (payload.auction?.id) resyncLists(payload.auction.id);
      }
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
    } catch (err: any) { showMsg('error', err.response?.data?.error || 'Unsold failed'); }
  };

  const undoLastBid = async () => {
    if (!auction) return;
    try {
      const res = await api.post(`/auctions/${auction.id}/undo-last-bid`);
      setAuction(res.data.auction);
      showMsg('ok', res.data.message || 'Bid undone');
      await resyncLists(auction.id);
    } catch (err: any) { showMsg('error', err.response?.data?.error || 'Undo bid failed'); }
  };

  const undoLastSale = async () => {
    if (!auction) return;
    try {
      const res = await api.post(`/auctions/${auction.id}/undo-last-sell`);
      setAuction(res.data.auction);
      if (res.data.player) setCurrentPlayer(res.data.player);
      showMsg('ok', res.data.message || 'Sale undone');
      await resyncLists(auction.id);
    } catch (err: any) { showMsg('error', err.response?.data?.error || 'Undo sale failed'); }
  };

  useEffect(() => {
    if (!feat('auctionKeyboard') || !isAdmin) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      const k = e.key.toLowerCase();
      if (k === 's') { e.preventDefault(); sellPlayer(); }
      else if (k === 'u') { e.preventDefault(); markUnsold(); }
      else if (k === 'r') { e.preventDefault(); randomPlayer(); }
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
      showMsg('ok', 'Auction created (draft)');
    } catch (err: any) { showMsg('error', err.response?.data?.error || 'Create failed'); }
    finally { setCreating(false); }
  };

  const startAuction = async () => {
    if (!auction) return;
    try {
      const res = await api.post(`/auctions/${auction.id}/start`);
      setAuction(res.data);
      showMsg('ok', 'Auction is live');
    } catch (err: any) { showMsg('error', err.response?.data?.error || 'Start failed'); }
  };

  const pauseAuction = async () => {
    if (!auction) return;
    try {
      const res = await api.post(`/auctions/${auction.id}/pause`);
      setAuction(res.data);
    } catch (err: any) { showMsg('error', err.response?.data?.error || 'Pause failed'); }
  };

  const randomPlayer = async () => {
    if (!auction) return;
    try {
      const res = await api.post(`/auctions/${auction.id}/next-random`);
      setAuction(res.data.auction);
      setCurrentPlayer(res.data.player);
    } catch (err: any) { showMsg('error', err.response?.data?.error || 'No players');
    }
  };

  const selectPlayer = async (playerId: string) => {
    if (!auction) return;
    try {
      const res = await api.post(`/auctions/${auction.id}/select-player`, { playerId });
      setAuction(res.data.auction);
      setCurrentPlayer(res.data.player);
    } catch (err: any) { showMsg('error', err.response?.data?.error || 'Select failed'); }
  };

  const endAuction = async () => {
    if (!auction) return;
    if (!confirm('End this auction permanently?')) return;
    try {
      const res = await api.post(`/auctions/${auction.id}/end`);
      setAuction(res.data);
      setCurrentPlayer(null);
      showMsg('ok', 'Auction ended');
    } catch (err: any) { showMsg('error', err.response?.data?.error || 'End failed'); }
  };

  const shareLive = () => {
    const url = `${window.location.origin}/live`;
    navigator.clipboard?.writeText(url).then(() => showMsg('ok', 'Live link copied')).catch(() => showMsg('ok', url));
  };

  if (authLoading || !listLoaded) {
    return (
      <AppShell title="Auction">
        <div className="p-6 text-center" style={{ color: 'var(--text-2)' }}>Loading…</div>
      </AppShell>
    );
  }

  if (!auction) {
    return (
      <AppShell title="Auction">
        <div className="p-6 max-w-lg mx-auto text-center space-y-3">
          {loadError && (
            <p className="text-sm text-red-400">{loadError}</p>
          )}
          <p className="mb-2" style={{ color: 'var(--text-2)' }}>
            {loadError ? 'Could not load auction' : 'No active auction'}
          </p>
          {isAdmin ? (
            <button type="button" className="as-btn-primary" onClick={createAuction} disabled={creating}>
              {creating ? 'Creating…' : 'Create new auction'}
            </button>
          ) : (
            <p className="text-sm" style={{ color: 'var(--text-2)' }}>Ask an admin to start an auction.</p>
          )}
          <button type="button" className="as-btn-ghost text-sm" onClick={() => { setListLoaded(false); loadAuction(); }}>
            Retry
          </button>
        </div>
      </AppShell>
    );
  }

  const currentBidder = teams.find(t => t.id === auction.currentBidderTeamId);

  return (
    <AppShell title="Live Auction">
      <div className="p-3 sm:p-4 space-y-4 max-w-6xl mx-auto">
        {msg && (
          <div className={`text-sm px-3 py-2 rounded ${msg.type === 'ok' ? 'bg-emerald-500/15 text-emerald-300' : 'bg-red-500/15 text-red-300'}`}>
            {msg.text}
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2 justify-between">
          <div className="flex items-center gap-2">
            <span className="text-xs uppercase tracking-wide px-2 py-0.5 rounded" style={{ background: 'var(--surface-2)', color: 'var(--text-2)' }}>
              {auction.status}
            </span>
            <span className="font-medium">{auction.name}</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {isAdmin && auction.status === 'draft' && (
              <button type="button" className="as-btn-primary text-sm" onClick={startAuction}>Start auction</button>
            )}
            {isAdmin && (auction.status === 'live' || auction.status === 'paused') && (
              <>
                <button type="button" className="as-btn-ghost text-sm" onClick={pauseAuction}>
                  {auction.status === 'live' ? 'Pause' : 'Resume'}
                </button>
                <button type="button" className="as-btn-ghost text-sm" onClick={endAuction}>End</button>
              </>
            )}
            {feat('auctionShareLive') && (
              <button type="button" className="as-btn-ghost text-sm" onClick={shareLive}>Share live</button>
            )}
          </div>
        </div>

        <div className="grid md:grid-cols-3 gap-4">
          <div className="md:col-span-2 space-y-3">
            <div className="rounded-xl p-4 border" style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}>
              {currentPlayer ? (
                <div className="flex gap-4 items-start">
                  {currentPlayer.photoUrl ? (
                    <img src={currentPlayer.photoUrl} alt="" className="w-20 h-20 rounded-lg object-cover" />
                  ) : (
                    <div className="w-20 h-20 rounded-lg flex items-center justify-center text-2xl font-bold" style={{ background: 'var(--surface-2)' }}>
                      {(currentPlayer.name || '?')[0]}
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <h2 className="text-xl font-semibold truncate">{currentPlayer.name}</h2>
                    <p className="text-sm" style={{ color: 'var(--text-2)' }}>
                      {currentPlayer.role}{currentPlayer.city ? ` · ${currentPlayer.city}` : ''}
                    </p>
                    <p className="mt-2 text-2xl font-bold tabular-nums">
                      ₹{(auction.currentBid || 0).toLocaleString()}
                    </p>
                    {currentBidder && (
                      <p className="text-sm mt-1" style={{ color: 'var(--text-2)' }}>
                        Leading: <span className="font-medium">{currentBidder.name}</span>
                      </p>
                    )}
                    {feat('auctionTimer') && timerLeft != null && (
                      <p className={`mt-2 text-sm font-mono ${timerLeft <= 5 ? 'text-red-400' : ''}`}>
                        ⏱ {timerLeft}s
                      </p>
                    )}
                  </div>
                </div>
              ) : (
                <p className="text-center py-8" style={{ color: 'var(--text-2)' }}>
                  {auction.status === 'draft' ? 'Start the auction, then select a player' : 'No player on the block'}
                </p>
              )}
            </div>

            {isAdmin && (auction.status === 'live' || auction.status === 'paused') && (
              <div className="flex flex-wrap gap-2 items-center">
                <button type="button" onClick={sellPlayer} className="as-btn-primary text-sm">Sell</button>
                <button type="button" onClick={markUnsold} className="as-btn-ghost text-sm">Unsold</button>
                <button type="button" onClick={randomPlayer} className="as-btn-ghost text-sm">Random</button>
                <button type="button" onClick={undoLastBid} className="as-btn-ghost text-sm">Undo bid</button>
                <button type="button" onClick={undoLastSale} className="as-btn-ghost text-sm">Undo sale</button>
                {feat('auctionKeyboard') && (
                  <span className="text-[11px] hidden sm:inline" style={{ color: 'var(--text-2)' }}>
                    Keys: S sell · U unsold · R random · 1–9 team · Z undo bid
                  </span>
                )}
              </div>
            )}

            {(auction.status === 'live') && (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
                {teams.map((tm, i) => {
                  const sold = teamSoldCount(tm.id);
                  const full = tm.maxPlayers != null && sold >= Number(tm.maxPlayers);
                  const leading = auction.currentBidderTeamId === tm.id;
                  return (
                    <button
                      key={tm.id}
                      type="button"
                      disabled={full || leading || auction.status !== 'live'}
                      onClick={() => quickBid(tm)}
                      className={`text-left rounded-lg p-2.5 border transition ${leading ? 'ring-2 ring-emerald-500/60' : ''}`}
                      style={{ background: 'var(--surface)', borderColor: 'var(--border)', opacity: full ? 0.5 : 1 }}
                    >
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-mono w-4" style={{ color: 'var(--text-2)' }}>{i + 1}</span>
                        <span className="font-medium text-sm truncate">{tm.name}</span>
                      </div>
                      <div className="text-xs mt-1" style={{ color: 'var(--text-2)' }}>
                        ₹{tm.remainingPurse.toLocaleString()}
                        {feat('auctionBudgetHints') && tm.maxPlayers != null && ` · ${sold}/${tm.maxPlayers}`}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}

            {isAdmin && auction.status === 'live' && (
              <div className="flex flex-wrap gap-2 items-end">
                <div>
                  <label className="text-xs block mb-1" style={{ color: 'var(--text-2)' }}>Team</label>
                  <select value={adminBidTeamId} onChange={e => setAdminBidTeamId(e.target.value)} className="as-input text-sm">
                    <option value="">Select team</option>
                    {teams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs block mb-1" style={{ color: 'var(--text-2)' }}>Amount</label>
                  <input type="number" value={bidAmount} onChange={e => setBidAmount(e.target.value)} className="as-input text-sm w-28" />
                </div>
                <button type="button" onClick={placeBid} className="as-btn-primary text-sm">Place bid</button>
              </div>
            )}

            {bidHistory.length > 0 && (
              <div className="rounded-lg border" style={{ borderColor: 'var(--border)', background: 'var(--surface)' }}>
                <button type="button" className="w-full text-left px-3 py-2 text-sm flex justify-between" onClick={() => setShowBidHistory(v => !v)}>
                  <span>Bid history ({bidHistory.length})</span>
                  <span>{showBidHistory ? '▲' : '▼'}</span>
                </button>
                {showBidHistory && (
                  <ul className="max-h-40 overflow-auto text-sm border-t" style={{ borderColor: 'var(--border)' }}>
                    {bidHistory.map(b => (
                      <li key={b.id} className="px-3 py-1.5 flex justify-between gap-2" style={{ borderBottom: '1px solid var(--border)' }}>
                        <span className="truncate">{b.teamName}</span>
                        <span className="tabular-nums font-medium">₹{b.amount.toLocaleString()}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>

          <div className="space-y-3">
            {isAdmin && auction.status === 'draft' && (
              <div className="rounded-xl p-3 border" style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}>
                <p className="text-xs mb-2 font-medium" style={{ color: 'var(--text-2)' }}>Settings only in draft</p>
                <BidRulesEditor
                  rules={auction.bidRules || DEFAULT_BID_RULES}
                  timerSeconds={auction.bidTimerSeconds || 0}
                  showTimer={feat('auctionTimer')}
                  onChange={async (rules, timer) => {
                    try {
                      const res = await api.patch(`/auctions/${auction.id}`, { bidRules: rules, bidTimerSeconds: timer });
                      setAuction(res.data);
                    } catch (err: any) { showMsg('error', err.response?.data?.error || 'Update failed'); }
                  }}
                />
              </div>
            )}

            {isAdmin && (auction.status === 'live' || auction.status === 'paused' || auction.status === 'draft') && (
              <div className="rounded-xl p-3 border" style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}>
                <p className="text-xs mb-2 font-medium" style={{ color: 'var(--text-2)' }}>Available ({availablePlayers.length})</p>
                <ul className="max-h-48 overflow-auto text-sm space-y-1">
                  {availablePlayers.slice(0, 40).map(p => (
                    <li key={p.id}>
                      <button type="button" className="w-full text-left truncate hover:underline" onClick={() => selectPlayer(p.id)}>
                        {p.name} <span style={{ color: 'var(--text-2)' }}>· {p.role}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {feat('auctionRecallUnsold') && isAdmin && unsoldPlayers.length > 0 && (
              <div className="rounded-xl p-3 border" style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}>
                <p className="text-xs mb-2 font-medium" style={{ color: 'var(--text-2)' }}>Unsold ({unsoldPlayers.length})</p>
                <ul className="max-h-32 overflow-auto text-sm space-y-1">
                  {unsoldPlayers.map(p => (
                    <li key={p.id}>
                      <button type="button" className="w-full text-left truncate hover:underline" onClick={() => selectPlayer(p.id)}>
                        {p.name}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="rounded-xl p-3 border" style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}>
              <p className="text-xs mb-2 font-medium" style={{ color: 'var(--text-2)' }}>Sold ({soldList.length})</p>
              <ul className="max-h-40 overflow-auto text-sm space-y-1">
                {soldList.map(s => (
                  <li key={s.id} className="flex justify-between gap-2">
                    <span className="truncate">{s.player?.name || s.playerId}</span>
                    <span className="tabular-nums shrink-0">₹{(s.soldPrice || 0).toLocaleString()}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
