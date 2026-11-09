import React, { useEffect, useState, useRef, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import AppShell from '../components/AppShell';
import api, { getSocketUrl } from '../services/api';
import { io, Socket } from 'socket.io-client';
import { nextMinBid, DEFAULT_BID_RULES, BidRule } from '../utils/bidRules';
import BidRulesEditor from '../components/BidRulesEditor';

interface Player { id: string; name: string; role: string; basePrice: number; city?: string; photoUrl?: string; }
interface Team { id: string; name: string; purse: number; remainingPurse: number; maxPlayers?: number | null; logoUrl?: string; }
interface Auction { id: string; name: string; status: 'draft' | 'live' | 'paused' | 'completed'; currentPlayerId: string | null; currentBid: number; currentBidderTeamId: string | null; bidIncrement: number; bidRules?: BidRule[]; bidTimerSeconds: number; timerEndsAt: string | null; }
interface SoldRecord { id: string; playerId: string; teamId: string; soldPrice: number; player?: Player; team?: Team; }

function teamInitials(name: string) {
  const parts = (name || '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return 'T';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
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
  const socketRef = useRef<Socket | null>(null);

  const showMsg = (type: 'success' | 'error' | 'info', text: string) => {
    setMessage({ type, text });
    setTimeout(() => setMessage(null), 5000);
  };

  const teamCanBid = (tm: Team) => {
    if (!tm || tm.remainingPurse <= 0) return false;
    const bought = soldList.filter(s => s.teamId === tm.id).length;
    if (tm.maxPlayers != null && tm.maxPlayers > 0 && bought >= Number(tm.maxPlayers)) return false;
    return true;
  };

  const loadAuction = useCallback(async () => {
    try {
      const [auctionRes, teamsRes] = await Promise.all([api.get('/auctions/active'), api.get('/teams')]);
      const active = auctionRes.data;
      setAuction(active);
      setTeams(teamsRes.data);
      if (active?.id) {
        const [playersRes, soldRes, unsoldRes] = await Promise.all([
          api.get(`/auctions/${active.id}/available-players`),
          api.get(`/auctions/${active.id}/sold`),
          api.get(`/auctions/${active.id}/unsold-players`).catch(() => ({ data: [] }))
        ]);
        setAvailablePlayers(playersRes.data);
        setSoldList(soldRes.data);
        setUnsoldPlayers(unsoldRes.data || []);
        try {
          const bidsRes = await api.get(`/auctions/${active.id}/bids`);
          const teamMap = Object.fromEntries((teamsRes.data || []).map((t: Team) => [t.id, t.name]));
          setBidHistory((bidsRes.data || []).slice().reverse().map((b: any) => ({ ...b, teamName: teamMap[b.teamId] || b.teamId })));
        } catch { setBidHistory([]); }
        if (active.currentPlayerId) {
          const playerRes = await api.get(`/players/${active.currentPlayerId}`);
          setCurrentPlayer(playerRes.data);
          setBidAmount(String(nextMinBid(active.currentBid || 0, !!active.currentBidderTeamId, active)));
        } else setCurrentPlayer(null);
      }
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { loadAuction(); }, [loadAuction]);

  useEffect(() => {
    if (!auction?.id) return;
    const socket = io(getSocketUrl(), { transports: ['websocket', 'polling'] });
    socketRef.current = socket;
    socket.emit('join-auction', auction.id);
    socket.on('player-selected', (data: { auction: Auction; player: Player }) => {
      setAuction(data.auction); setCurrentPlayer(data.player);
      setBidAmount(String(nextMinBid(data.auction.currentBid || 0, !!data.auction.currentBidderTeamId, data.auction)));
      setMessage({ type: 'info', text: `Now auctioning: ${data.player.name}` });
      api.get(`/auctions/${data.auction.id}/available-players`).then(r => setAvailablePlayers(r.data));
    });
    socket.on('new-bid', (data: { auction: Auction; bid: any; team: { id: string; name: string } }) => {
      setAuction(data.auction);
      setBidAmount(String(nextMinBid(data.auction.currentBid || 0, true, data.auction)));
      setMessage({ type: 'success', text: `${data.team.name} bid ₹${data.bid.amount.toLocaleString()}` });
      setBidHistory(prev => [{ id: data.bid?.id || String(Date.now()), amount: data.bid?.amount, teamId: data.team?.id, teamName: data.team?.name }, ...prev].slice(0, 80));
    });
    socket.on('player-sold', (data: { auction: Auction; result: any }) => {
      setAuction(data.auction);
      const isUndone = data.result?.status === 'Undone';
      if (isUndone && data.result?.player) {
        setCurrentPlayer(data.result.player);
        const restored = Number(data.result?.restoredBid) || Number(data.auction?.currentBid) || Number(data.result?.price) || 0;
        const hasBidder = !!(data.auction?.currentBidderTeamId);
        setBidAmount(String(nextMinBid(restored, hasBidder || restored > 0, data.auction)));
        if (data.auction?.currentBidderTeamId) setAdminBidTeamId(data.auction.currentBidderTeamId);
      } else setCurrentPlayer(null);
      setMessage({
        type: data.result?.status === 'Sold' ? 'success' : 'info',
        text: data.result?.status === 'Sold'
          ? `SOLD! ${data.result.player?.name} to ${data.result.team?.name} for ₹${data.result.price?.toLocaleString()}`
          : isUndone ? `Undone: ${data.result.player?.name} at ₹${Number(data.result?.restoredBid || data.auction?.currentBid || data.result?.price || 0).toLocaleString()}` : `UNSOLD: ${data.result?.player?.name}`
      });
      if (auction.id) {
        api.get(`/auctions/${auction.id}/sold`).then(r => setSoldList(r.data));
        api.get(`/auctions/${auction.id}/available-players`).then(r => setAvailablePlayers(r.data));
        api.get(`/auctions/${auction.id}/unsold-players`).then(r => setUnsoldPlayers(r.data)).catch(() => {});
        api.get('/teams').then(r => setTeams(r.data));
      }
    });
    socket.on('auction-status', (data: Auction) => { setAuction(data); setMessage({ type: 'info', text: `Auction ${data.status}` }); });
    socket.on('auction-ended', (data: Auction) => { setAuction(data); setCurrentPlayer(null); setMessage({ type: 'info', text: 'Auction has ended' }); });
    return () => { socket.emit('leave-auction', auction.id); socket.disconnect(); };
  }, [auction?.id]);

  const placeBidForTeam = async (teamId: string, amount: number) => {
    if (!auction || !teamId || !amount) return;
    try { await api.post(`/auctions/${auction.id}/bid`, { amount, teamId }); }
    catch (err: any) { showMsg('error', err.response?.data?.error || 'Bid failed'); }
  };

  const quickBid = async (tm: Team) => {
    if (!auction || !currentPlayer) return;
    if (!teamCanBid(tm)) { showMsg('error', `${tm.name} cannot bid`); return; }
    const amount = nextMinBid(auction.currentBid || 0, !!auction.currentBidderTeamId, auction);
    if (amount > tm.remainingPurse) { showMsg('error', `${tm.name} only has ₹${tm.remainingPurse.toLocaleString()}`); return; }
    setAdminBidTeamId(tm.id);
    setBidAmount(String(amount));
    await placeBidForTeam(tm.id, amount);
  };

  const placeBid = async () => {
    if (!auction || !bidAmount) return;
    try {
      const payload: any = { amount: Number(bidAmount) };
      if (user?.role === 'admin') {
        const tid = adminBidTeamId || teams.find(teamCanBid)?.id;
        if (!tid) { showMsg('error', 'Select a team to bid'); return; }
        payload.teamId = tid;
      }
      await api.post(`/auctions/${auction.id}/bid`, payload);
    } catch (err: any) { showMsg('error', err.response?.data?.error || 'Bid failed'); }
  };

  const sellPlayer = async () => {
    if (!auction) return;
    try { await api.post(`/auctions/${auction.id}/sell`); }
    catch (err: any) { showMsg('error', err.response?.data?.error || 'Failed to sell'); }
  };

  const markUnsold = async () => {
    if (!auction) return;
    try { await api.post(`/auctions/${auction.id}/unsold`); }
    catch (err: any) { showMsg('error', err.response?.data?.error || 'Failed'); }
  };

  const undoLastSell = async () => {
    if (!auction) return;
    if (!confirm('Undo last sold player? They return at the last sold price (not base).')) return;
    try {
      const res = await api.post(`/auctions/${auction.id}/undo-last-sell`);
      const player = res.data?.player || res.data?.result?.player;
      const updatedAuction = res.data?.auction;
      if (updatedAuction) setAuction(updatedAuction);
      if (player) {
        setCurrentPlayer(player);
        const restored = Number(res.data?.result?.restoredBid) || Number(updatedAuction?.currentBid) || Number(res.data?.result?.price) || 0;
        const hasBidder = !!(updatedAuction?.currentBidderTeamId);
        setBidAmount(String(nextMinBid(restored, hasBidder || restored > 0, updatedAuction || auction)));
        if (updatedAuction?.currentBidderTeamId) setAdminBidTeamId(updatedAuction.currentBidderTeamId);
      }
      const shown = Number(res.data?.result?.restoredBid) || Number(updatedAuction?.currentBid) || Number(res.data?.result?.price) || 0;
      showMsg('info', player ? `Undone: ${player.name} back at ₹${shown.toLocaleString()} (last sold)` : 'Undone');
      if (auction.id) {
        const [soldRes, availRes, unsoldRes, teamsRes] = await Promise.all([
          api.get(`/auctions/${auction.id}/sold`),
          api.get(`/auctions/${auction.id}/available-players`),
          api.get(`/auctions/${auction.id}/unsold-players`).catch(() => ({ data: [] })),
          api.get('/teams')
        ]);
        setSoldList(soldRes.data); setAvailablePlayers(availRes.data);
        setUnsoldPlayers(unsoldRes.data || []); setTeams(teamsRes.data);
      }
    } catch (err: any) { showMsg('error', err.response?.data?.error || 'Undo failed'); }
  };

  const createAuction = async () => {
    setCreating(true);
    try {
      const res = await api.post('/auctions', { name: `Cricket Auction ${new Date().toLocaleDateString()}`, bidIncrement: DEFAULT_BID_RULES[0].increment, bidRules: DEFAULT_BID_RULES, bidTimerSeconds: 20 });
      setAuction(res.data); showMsg('success', 'Auction created');
    } catch (err: any) { showMsg('error', err.response?.data?.error || 'Failed'); }
    finally { setCreating(false); }
  };

  const saveSettings = async (data: { bidRules: BidRule[]; bidTimerSeconds: number; name: string }) => {
    if (!auction) return;
    const res = await api.put(`/auctions/${auction.id}/settings`, data);
    setAuction(res.data); showMsg('success', 'Settings saved');
  };

  const startAuction = async () => {
    if (!auction) return;
    try { const res = await api.post(`/auctions/${auction.id}/start`); setAuction(res.data); showMsg('success', 'LIVE'); }
    catch (err: any) { showMsg('error', err.response?.data?.error || 'Failed'); }
  };

  const pauseAuction = async () => {
    if (!auction) return;
    try { const res = await api.post(`/auctions/${auction.id}/pause`); setAuction(res.data); }
    catch (err: any) { showMsg('error', err.response?.data?.error || 'Failed'); }
  };

  const selectPlayer = async (playerId: string) => {
    if (!auction) return;
    try {
      const res = await api.post(`/auctions/${auction.id}/select-player`, { playerId });
      setAuction(res.data.auction); setCurrentPlayer(res.data.player);
      setBidAmount(String(nextMinBid(res.data.auction.currentBid || 0, !!res.data.auction.currentBidderTeamId, res.data.auction)));
    } catch (err: any) { showMsg('error', err.response?.data?.error || 'Failed'); }
  };

  const nextRandomPlayer = async () => {
    if (!auction) return;
    try {
      const res = await api.post(`/auctions/${auction.id}/next-random`);
      setAuction(res.data.auction); setCurrentPlayer(res.data.player);
      setBidAmount(String(nextMinBid(res.data.auction.currentBid || 0, false, res.data.auction)));
      showMsg('info', `Random: ${res.data.player.name}`);
    } catch (err: any) { showMsg('error', err.response?.data?.error || 'No players left'); }
  };

  const endAuction = async () => {
    if (!auction) return;
    if (auction.status === 'completed') { showMsg('info', 'Already ended'); return; }
    if (!confirm('End this auction permanently?')) return;
    try { const res = await api.post(`/auctions/${auction.id}/end`); setAuction(res.data); setCurrentPlayer(null); showMsg('info', 'Ended'); }
    catch (err: any) { showMsg('error', err.response?.data?.error || 'Failed'); }
  };

  const restartAuction = async () => {
    if (!auction) return;
    if (!confirm('Restart? Sales undone, purses refunded.')) return;
    try { const res = await api.post(`/auctions/${auction.id}/restart`); setAuction(res.data.auction); setCurrentPlayer(null); setSoldList([]); showMsg('success', 'Restarted'); loadAuction(); }
    catch (err: any) { showMsg('error', err.response?.data?.error || 'Failed'); }
  };

  const freshAuction = async () => {
    if (!confirm('Fresh auction? Reset everything.')) return;
    try { const res = await api.post('/auctions/fresh', {}); setAuction(res.data.auction); setCurrentPlayer(null); setSoldList([]); showMsg('success', 'Fresh'); loadAuction(); }
    catch (err: any) { showMsg('error', err.response?.data?.error || 'Failed'); }
  };

  const recallUnsold = async () => {
    if (!auction) return;
    try {
      const res = await api.post(`/auctions/${auction.id}/recall-unsold`, {});
      setAuction(res.data.auction); setCurrentPlayer(res.data.player);
      setBidAmount(String(nextMinBid(res.data.auction.currentBid || 0, false, res.data.auction)));
      showMsg('info', `Recalled: ${res.data.player.name}`); loadAuction();
    } catch (err: any) { showMsg('error', err.response?.data?.error || 'Failed'); }
  };

  const currentBidderName = teams.find(t => t.id === auction?.currentBidderTeamId)?.name || '—';

  if (loading) {
    return <AppShell title="Live Auction"><div className="glass p-10 text-center" style={{ color: 'var(--text-2)' }}>Loading…</div></AppShell>;
  }

  return (
    <AppShell title="Live Auction">
      {message && (
        <div className="glass p-3 mb-4 text-[14px] font-medium" style={{
          color: message.type === 'success' ? '#30d158' : message.type === 'error' ? '#ff3b30' : 'var(--accent)'
        }}>{message.text}</div>
      )}

      {!auction && user?.role === 'admin' && (
        <div className="glass p-8 text-center space-y-4">
          <h2 className="text-[22px] font-semibold" style={{ color: 'var(--text)' }}>No active auction</h2>
          <div className="flex flex-wrap gap-3 justify-center">
            <button type="button" onClick={createAuction} disabled={creating} className="as-btn-primary">{creating ? 'Creating…' : 'Create auction'}</button>
            <button type="button" onClick={freshAuction} className="as-btn-ghost">Fresh new auction</button>
          </div>
        </div>
      )}

      {!auction && user?.role !== 'admin' && (
        <div className="glass p-8 text-center" style={{ color: 'var(--text-2)' }}>Waiting for admin…</div>
      )}

      {auction && (
        <div className="space-y-3.5">
          <div className="flex flex-wrap gap-2 items-center">
            <span className="glass-island text-[12px] capitalize">{auction.status}</span>
            {user?.role === 'admin' && auction.status === 'draft' && (
              <button type="button" onClick={startAuction} className="as-btn-primary text-sm">Start</button>
            )}
            {user?.role === 'admin' && auction.status === 'live' && (
              <button type="button" onClick={pauseAuction} className="as-btn-ghost text-sm">Pause</button>
            )}
            {user?.role === 'admin' && auction.status === 'paused' && (
              <button type="button" onClick={startAuction} className="as-btn-primary text-sm">Resume</button>
            )}
            {user?.role === 'admin' && currentPlayer && (
              <>
                <button type="button" onClick={sellPlayer} className="as-btn-primary text-sm" style={{ background: '#30d158' }}>Sell</button>
                <button type="button" onClick={markUnsold} className="as-btn-ghost text-sm">Unsold</button>
              </>
            )}
            {user?.role === 'admin' && (
              <>
                <button type="button" onClick={nextRandomPlayer} className="as-btn-ghost text-sm">Random</button>
                <button type="button" onClick={undoLastSell} className="as-btn-ghost text-sm">Undo last sell</button>
                {auction.status !== 'completed' && (
                  <button type="button" onClick={endAuction} className="as-btn-ghost text-sm">End</button>
                )}
              </>
            )}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3.5">
            <div className="glass overflow-hidden min-h-[280px]">
              {currentPlayer ? (
                <div className="p-6 h-full flex flex-col">
                  <div className="text-[13px] mb-2" style={{ color: 'var(--text-2)' }}>Now auctioning</div>
                  <div className="flex gap-4 items-start flex-1">
                    {currentPlayer.photoUrl ? (
                      <img src={currentPlayer.photoUrl} alt="" className="w-24 h-24 sm:w-28 sm:h-28 rounded-2xl object-cover shrink-0" />
                    ) : (
                      <div className="w-24 h-24 sm:w-28 sm:h-28 rounded-2xl flex items-center justify-center text-3xl shrink-0" style={{ background: 'var(--fill)' }}>🏏</div>
                    )}
                    <div className="min-w-0 flex-1">
                      <h2 className="text-[26px] sm:text-[30px] font-semibold leading-tight" style={{ color: 'var(--text)' }}>{currentPlayer.name}</h2>
                      <div className="flex flex-wrap gap-2 mt-2">
                        <span className="glass-island text-[11px]">{currentPlayer.role}</span>
                        {currentPlayer.city && <span className="glass-island text-[11px]">{currentPlayer.city}</span>}
                        <span className="glass-island text-[11px]">Base ₹{(currentPlayer.basePrice || 0).toLocaleString()}</span>
                      </div>
                      <div className="mt-5">
                        <div className="text-[12px]" style={{ color: 'var(--text-2)' }}>Current bid</div>
                        <div className="text-[32px] font-semibold tabular-nums" style={{ color: 'var(--accent)' }}>₹{(auction.currentBid || 0).toLocaleString()}</div>
                        <div className="text-[13px] mt-1" style={{ color: 'var(--text-2)' }}>by {currentBidderName}</div>
                      </div>
                      {user?.role === 'admin' && (
                        <div className="mt-4 flex flex-wrap gap-2 items-center">
                          <input className="as-input w-32" value={bidAmount} onChange={e => setBidAmount(e.target.value)} />
                          <button type="button" onClick={placeBid} className="as-btn-primary text-sm">Place bid</button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="p-8 text-center h-full flex items-center justify-center" style={{ color: 'var(--text-2)' }}>
                  {auction.status === 'live' ? 'Select a player to start bidding' : `Auction is ${auction.status}`}
                </div>
              )}
            </div>

            <div className="glass overflow-hidden p-4 space-y-3">
              <div className="text-[12px] font-medium" style={{ color: 'var(--text-2)' }}>Tap team = next bid step</div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {teams.map(tm => {
                  const can = teamCanBid(tm);
                  const isLeader = auction.currentBidderTeamId === tm.id;
                  return (
                    <button
                      key={tm.id}
                      type="button"
                      disabled={!currentPlayer || !can || auction.status !== 'live'}
                      onClick={() => quickBid(tm)}
                      className="rounded-2xl p-3 text-left transition active:scale-[0.98] min-h-[72px]"
                      style={{
                        background: isLeader ? 'rgba(10,132,255,0.18)' : 'var(--fill)',
                        opacity: !can ? 0.45 : 1,
                        border: isLeader ? '1px solid rgba(10,132,255,0.5)' : '0.5px solid var(--separator)'
                      }}
                    >
                      <div className="flex items-center gap-2">
                        {tm.logoUrl ? (
                          <img src={tm.logoUrl} alt="" className="w-9 h-9 rounded-xl object-cover" />
                        ) : (
                          <div className="w-9 h-9 rounded-xl flex items-center justify-center text-[12px] font-bold" style={{ background: 'var(--fill-2, var(--fill))' }}>{teamInitials(tm.name)}</div>
                        )}
                        <div className="min-w-0">
                          <div className="text-[13px] font-semibold truncate" style={{ color: 'var(--text)' }}>{tm.name}</div>
                          <div className="text-[11px] tabular-nums" style={{ color: 'var(--text-2)' }}>₹{(tm.remainingPurse || 0).toLocaleString()}</div>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          <div className="space-y-2">
            {(['available', 'sold', 'unsold', 'history'] as const).map(key => (
              <div key={key} className="glass overflow-hidden">
                <button type="button" className="w-full flex items-center justify-between px-4 py-3 text-left" onClick={() => setOpenPanel(p => p === key ? null : key)}>
                  <span className="text-[14px] font-medium capitalize" style={{ color: 'var(--text)' }}>
                    {key === 'history' ? `Bid history (${bidHistory.length})` : key === 'available' ? `Available (${availablePlayers.length})` : key === 'sold' ? `Sold (${soldList.length})` : `Unsold (${unsoldPlayers.length})`}
                  </span>
                  <span style={{ color: 'var(--text-2)' }}>{openPanel === key ? '▾' : '▸'}</span>
                </button>
                {openPanel === key && (
                  <div className="px-4 pb-3 max-h-56 overflow-y-auto space-y-1" style={{ borderTop: '0.5px solid var(--separator)' }}>
                    {key === 'available' && availablePlayers.map(p => (
                      <button key={p.id} type="button" className="w-full text-left rounded-xl px-3 py-2 text-[13px]" style={{ background: 'var(--fill)' }} onClick={() => selectPlayer(p.id)} disabled={user?.role !== 'admin'}>
                        {p.name} · {p.role} · base ₹{(p.basePrice || 0).toLocaleString()}
                      </button>
                    ))}
                    {key === 'sold' && soldList.map(s => (
                      <div key={s.id} className="rounded-xl px-3 py-2 text-[13px] flex justify-between" style={{ background: 'var(--fill)' }}>
                        <span>{s.player?.name || s.playerId}</span>
                        <span className="tabular-nums" style={{ color: '#30d158' }}>₹{(s.soldPrice || 0).toLocaleString()}</span>
                      </div>
                    ))}
                    {key === 'unsold' && unsoldPlayers.map(p => (
                      <div key={p.id} className="rounded-xl px-3 py-2 text-[13px]" style={{ background: 'var(--fill)' }}>{p.name}</div>
                    ))}
                    {key === 'history' && (bidHistory.length === 0 ? (
                      <div className="text-[13px] py-2" style={{ color: 'var(--text-2)' }}>No bids yet</div>
                    ) : bidHistory.map((b, i) => (
                      <div key={b.id || i} className="rounded-xl px-3 py-2 text-[13px] flex justify-between" style={{ background: 'var(--fill)' }}>
                        <span>{b.teamName || b.teamId}</span>
                        <span className="tabular-nums">₹{(b.amount || 0).toLocaleString()}</span>
                      </div>
                    )))}
                  </div>
                )}
              </div>
            ))}
          </div>

          {user?.role === 'admin' && (
            <BidRulesEditor auction={auction} onSave={saveSettings} />
          )}
        </div>
      )}
    </AppShell>
  );
}
