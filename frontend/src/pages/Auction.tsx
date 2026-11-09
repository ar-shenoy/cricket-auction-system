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
        const hasBidder = !!(data.auction?.currentBidderTeamId);
        const restored = Number(data.auction?.currentBid) || Number(data.result?.price) || data.result.player.basePrice || 0;
        setBidAmount(String(nextMinBid(restored, hasBidder, data.auction)));
        if (data.auction?.currentBidderTeamId) setAdminBidTeamId(data.auction.currentBidderTeamId);
      } else setCurrentPlayer(null);
      setMessage({
        type: data.result?.status === 'Sold' ? 'success' : 'info',
        text: data.result?.status === 'Sold'
          ? `SOLD! ${data.result.player?.name} to ${data.result.team?.name} for ₹${data.result.price?.toLocaleString()}`
          : isUndone ? `Undone: ${data.result.player?.name} at ₹${Number(data.auction?.currentBid || data.result?.price || 0).toLocaleString()}` : `UNSOLD: ${data.result?.player?.name}`
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
        const restored = Number(updatedAuction?.currentBid) || Number(res.data?.result?.price) || player.basePrice || 0;
        setBidAmount(String(nextMinBid(restored, !!updatedAuction?.currentBidderTeamId, updatedAuction || auction)));
        if (updatedAuction?.currentBidderTeamId) setAdminBidTeamId(updatedAuction.currentBidderTeamId);
      }
      showMsg('info', player ? `Undone: ${player.name} at ₹${Number(updatedAuction?.currentBid || res.data?.result?.price || 0).toLocaleString()}` : 'Undone');
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
              {user?.role === 'admin' && (
                <>
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-[12px] font-medium" style={{ color: 'var(--text-2)' }}>Tap team = next bid step</div>
                    {currentPlayer && (
                      <div className="flex gap-2">
                        <button type="button" onClick={sellPlayer} className="as-btn-primary text-sm" style={{ background: '#30d158' }}>Sell</button>
                        <button type="button" onClick={markUnsold} className="as-btn-ghost text-sm">Unsold</button>
                      </div>
                    )}
                  </div>
                  {teams.filter(teamCanBid).length === 0 ? (
                    <p className="text-[13px]" style={{ color: '#ff3b30' }}>No eligible teams</p>
                  ) : (
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                      {teams.map(tm => {
                        const ok = teamCanBid(tm);
                        const isCurrent = auction.currentBidderTeamId === tm.id;
                        const bought = soldList.filter(s => s.teamId === tm.id).length;
                        return (
                          <button key={tm.id} type="button" disabled={!ok || !currentPlayer || auction.status !== 'live'}
                            onClick={() => ok && currentPlayer && quickBid(tm)}
                            className="flex flex-col items-center justify-center gap-1 rounded-2xl px-2 py-3 text-center transition min-h-[88px]"
                            style={isCurrent ? { background: 'var(--accent)', color: '#fff', opacity: ok ? 1 : 0.45 } : { background: 'var(--fill)', color: 'var(--text)', opacity: ok ? 1 : 0.4 }}>
                            {tm.logoUrl ? <img src={tm.logoUrl} alt="" className="w-10 h-10 rounded-xl object-cover" /> : (
                              <span className="w-10 h-10 rounded-xl flex items-center justify-center text-[12px] font-semibold" style={{ background: 'rgba(0,0,0,0.15)' }}>{teamInitials(tm.name)}</span>
                            )}
                            <span className="text-[11px] font-medium truncate w-full">{tm.name}</span>
                            <span className="text-[10px] opacity-80 tabular-nums">₹{tm.remainingPurse.toLocaleString()} · {bought}</span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                  <div className="flex gap-2 pt-1">
                    <input type="number" value={bidAmount} onChange={e => setBidAmount(e.target.value)} className="as-input" placeholder="Custom amount" />
                    <button type="button" onClick={placeBid} className="as-btn-primary shrink-0">Bid</button>
                  </div>
                </>
              )}
              {user?.role !== 'admin' && (
                <div className="space-y-3">
                  <div className="text-[12px] font-medium" style={{ color: 'var(--text-2)' }}>Teams</div>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {teams.map(tm => {
                      const isCurrent = auction.currentBidderTeamId === tm.id;
                      return (
                        <div key={tm.id} className="flex flex-col items-center justify-center gap-1 rounded-2xl px-2 py-3 min-h-[88px]"
                          style={{ background: isCurrent ? 'var(--accent)' : 'var(--fill)', color: isCurrent ? '#fff' : 'var(--text)' }}>
                          <span className="w-10 h-10 rounded-xl flex items-center justify-center text-[12px] font-semibold" style={{ background: 'rgba(0,0,0,0.15)' }}>{teamInitials(tm.name)}</span>
                          <span className="text-[11px] font-medium truncate w-full text-center">{tm.name}</span>
                          <span className="text-[10px] opacity-80">₹{tm.remainingPurse.toLocaleString()}</span>
                        </div>
                      );
                    })}
                  </div>
                  {user?.role === 'team_manager' && (
                    <div className="flex gap-2">
                      <input type="number" value={bidAmount} onChange={e => setBidAmount(e.target.value)} className="as-input" />
                      <button type="button" onClick={placeBid} className="as-btn-primary shrink-0">Bid</button>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {user?.role === 'admin' && (
            <div className="glass p-4 flex flex-wrap gap-2">
              {auction.status === 'draft' && <button type="button" onClick={startAuction} className="as-btn-primary text-sm">Start live</button>}
              {auction.status === 'live' && <button type="button" onClick={pauseAuction} className="as-btn-ghost text-sm">Pause</button>}
              {auction.status === 'paused' && <button type="button" onClick={startAuction} className="as-btn-primary text-sm">Resume</button>}
              {(auction.status === 'live' || auction.status === 'paused') && !currentPlayer && (
                <button type="button" onClick={nextRandomPlayer} className="as-btn-primary text-sm">Random player</button>
              )}
              {unsoldPlayers.length > 0 && !currentPlayer && (
                <button type="button" onClick={recallUnsold} className="as-btn-ghost text-sm">Recall unsold</button>
              )}
              <button type="button" onClick={undoLastSell} className="as-btn-ghost text-sm">Undo last sell</button>
              {auction.status !== 'completed' && (
                <button type="button" onClick={endAuction} className="as-btn-ghost text-sm" style={{ color: '#ff3b30' }}>End auction</button>
              )}
              {auction.status === 'completed' && <span className="text-[13px] px-3 py-2" style={{ color: 'var(--text-2)' }}>Auction ended</span>}
              <button type="button" onClick={restartAuction} className="as-btn-ghost text-sm">Restart</button>
              <button type="button" onClick={freshAuction} className="as-btn-ghost text-sm">Fresh auction</button>
              <a href="/live" target="_blank" rel="noreferrer" className="as-btn-ghost text-sm">Share live</a>
            </div>
          )}

          {user?.role === 'admin' && auction.status === 'draft' && (
            <div className="glass p-4">
              <BidRulesEditor initialRules={auction.bidRules || DEFAULT_BID_RULES} initialTimer={auction.bidTimerSeconds} initialName={auction.name} onSave={saveSettings} />
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3.5">
            <div className="glass overflow-hidden">
              <button type="button" className="w-full px-4 pt-4 pb-2 font-semibold text-[15px] flex items-center justify-between text-left"
                onClick={() => setOpenPanel(openPanel === 'available' ? null : 'available')}>
                <span>Available ({availablePlayers.length})</span>
                <span style={{ color: 'var(--text-2)' }}>{openPanel === 'available' ? '▾' : '▸'}</span>
              </button>
              {openPanel === 'available' && (
                <ul className="max-h-56 overflow-y-auto">
                  {availablePlayers.slice(0, 50).map(pl => (
                    <li key={pl.id} className="glass-row">
                      <span className="flex-1 truncate text-[13px]">{pl.name}</span>
                      {user?.role === 'admin' && !currentPlayer && (auction.status === 'live' || auction.status === 'paused') && (
                        <button type="button" onClick={() => selectPlayer(pl.id)} className="text-[12px] font-medium" style={{ color: 'var(--accent)' }}>Select</button>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div className="glass overflow-hidden">
              <button type="button" className="w-full px-4 pt-4 pb-2 font-semibold text-[15px] flex items-center justify-between text-left"
                onClick={() => setOpenPanel(openPanel === 'sold' ? null : 'sold')}>
                <span>Sold ({soldList.length})</span>
                <span style={{ color: 'var(--text-2)' }}>{openPanel === 'sold' ? '▾' : '▸'}</span>
              </button>
              {openPanel === 'sold' && (
                <ul className="max-h-56 overflow-y-auto">
                  {soldList.slice(0, 40).map(s => (
                    <li key={s.id} className="glass-row text-[13px]">
                      <span className="flex-1 truncate">{s.player?.name || '—'}</span>
                      <span className="truncate max-w-[40%] text-right" style={{ color: 'var(--text-2)' }}>{s.team?.name || ''}</span>
                      <span style={{ color: '#30d158' }}>₹{s.soldPrice.toLocaleString()}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          {unsoldPlayers.length > 0 && (
            <div className="glass overflow-hidden">
              <button type="button" className="w-full px-4 pt-4 pb-2 font-semibold text-[15px] flex items-center justify-between text-left"
                onClick={() => setOpenPanel(openPanel === 'unsold' ? null : 'unsold')}>
                <span>Unsold ({unsoldPlayers.length})</span>
                <span style={{ color: 'var(--text-2)' }}>{openPanel === 'unsold' ? '▾' : '▸'}</span>
              </button>
              {openPanel === 'unsold' && (
                <ul className="max-h-32 overflow-y-auto">
                  {unsoldPlayers.slice(0, 30).map(pl => (
                    <li key={pl.id} className="glass-row text-[13px]">{pl.name}</li>
                  ))}
                </ul>
              )}
            </div>
          )}

          <div className="glass overflow-hidden">
            <button type="button" className="w-full px-4 pt-4 pb-2 font-semibold text-[15px] flex items-center justify-between text-left"
              onClick={() => setOpenPanel(openPanel === 'history' ? null : 'history')}>
              <span>Bid history ({bidHistory.length})</span>
              <span style={{ color: 'var(--text-2)' }}>{openPanel === 'history' ? '▾' : '▸'}</span>
            </button>
            {openPanel === 'history' && (
              <ul className="max-h-48 overflow-y-auto">
                {bidHistory.length === 0 ? (
                  <li className="glass-row text-[13px]" style={{ color: 'var(--text-2)' }}>No bids yet</li>
                ) : bidHistory.slice(0, 50).map((b, i) => (
                  <li key={b.id || i} className="glass-row text-[13px] flex justify-between gap-2">
                    <span className="truncate">{b.teamName || 'Team'}</span>
                    <span className="tabular-nums shrink-0" style={{ color: 'var(--accent)' }}>₹{Number(b.amount || 0).toLocaleString()}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </AppShell>
  );
}
