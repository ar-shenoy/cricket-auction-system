import React, { useEffect, useState, useRef, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import AppShell from '../components/AppShell';
import api, { getSocketUrl } from '../services/api';
import { io, Socket } from 'socket.io-client';
import { getIncrement, nextMinBid, maxBidForTeam, DEFAULT_BID_RULES, BidRule } from '../utils/bidRules';
import BidRulesEditor from '../components/BidRulesEditor';

interface Player {
  id: string;
  name: string;
  role: string;
  basePrice: number;
  city?: string;
  bio?: string;
  status: string;
  battingStyle?: string;
  bowlingStyle?: string;
  age?: number | null;
  photoUrl?: string;
}

interface Team {
  id: string;
  name: string;
  purse: number;
  remainingPurse: number;
  maxPlayers?: number | null;
}

interface Auction {
  id: string;
  name: string;
  status: 'draft' | 'live' | 'paused' | 'completed';
  currentPlayerId: string | null;
  currentBid: number;
  currentBidderTeamId: string | null;
  bidIncrement: number;
  bidRules?: BidRule[];
  bidTimerSeconds: number;
  timerEndsAt: string | null;
}

interface SoldRecord {
  id: string;
  playerId: string;
  teamId: string;
  soldPrice: number;
  player?: Player;
  team?: Team;
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
  const socketRef = useRef<Socket | null>(null);

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
        if (active.currentPlayerId) {
          const playerRes = await api.get(`/players/${active.currentPlayerId}`);
          setCurrentPlayer(playerRes.data);
          setBidAmount(String(nextMinBid(active.currentBid || 0, !!active.currentBidderTeamId, active)));
        } else setCurrentPlayer(null);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadAuction(); }, [loadAuction]);

  useEffect(() => {
    if (!auction?.id) return;
    const socket = io(getSocketUrl(), { transports: ['websocket', 'polling'] });
    socketRef.current = socket;
    socket.emit('join-auction', auction.id);
    socket.on('player-selected', (data: { auction: Auction; player: Player }) => {
      setAuction(data.auction);
      setCurrentPlayer(data.player);
      setBidAmount(String(nextMinBid(data.auction.currentBid || 0, !!data.auction.currentBidderTeamId, data.auction)));
      setMessage({ type: 'info', text: `Now auctioning: ${data.player.name}` });
      api.get(`/auctions/${data.auction.id}/available-players`).then(r => setAvailablePlayers(r.data));
      api.get(`/auctions/${data.auction.id}/unsold-players`).then(r => setUnsoldPlayers(r.data)).catch(() => {});
    });
    socket.on('new-bid', (data: { auction: Auction; bid: any; team: { id: string; name: string } }) => {
      setAuction(data.auction);
      setBidAmount(String(nextMinBid(data.auction.currentBid || 0, true, data.auction)));
      setMessage({ type: 'success', text: `${data.team.name} bid ₹${data.bid.amount.toLocaleString()}` });
    });
    socket.on('player-sold', (data: { auction: Auction; result: any }) => {
      setAuction(data.auction);
      setCurrentPlayer(null);
      setMessage({
        type: data.result.status === 'Sold' ? 'success' : 'info',
        text: data.result.status === 'Sold'
          ? `SOLD! ${data.result.player?.name} to ${data.result.team?.name} for ₹${data.result.price?.toLocaleString()}`
          : data.result.status === 'Undone'
            ? `Undone: ${data.result.player?.name}`
            : `UNSOLD: ${data.result.player?.name}`
      });
      if (auction.id) {
        api.get(`/auctions/${auction.id}/sold`).then(r => setSoldList(r.data));
        api.get(`/auctions/${auction.id}/available-players`).then(r => setAvailablePlayers(r.data));
        api.get(`/auctions/${auction.id}/unsold-players`).then(r => setUnsoldPlayers(r.data)).catch(() => {});
        api.get('/teams').then(r => setTeams(r.data));
      }
    });
    socket.on('auction-status', (data: Auction) => {
      setAuction(data);
      setMessage({ type: 'info', text: `Auction ${data.status}` });
    });
    socket.on('auction-ended', (data: Auction) => {
      setAuction(data);
      setCurrentPlayer(null);
      setMessage({ type: 'info', text: 'Auction has ended' });
    });
    return () => {
      socket.emit('leave-auction', auction.id);
      socket.disconnect();
    };
  }, [auction?.id]);

  const showMsg = (type: 'success' | 'error' | 'info', text: string) => {
    setMessage({ type, text });
    setTimeout(() => setMessage(null), 5000);
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
      showMsg('success', 'Auction created. Configure bid ladder, then Start.');
    } catch (err: any) {
      showMsg('error', err.response?.data?.error || 'Failed to create auction');
    } finally {
      setCreating(false);
    }
  };

  const saveSettings = async (data: { bidRules: BidRule[]; bidTimerSeconds: number; name: string }) => {
    if (!auction) return;
    try {
      const res = await api.put(`/auctions/${auction.id}/settings`, data);
      setAuction(res.data);
      showMsg('success', 'Auction settings saved');
    } catch (err: any) {
      showMsg('error', err.response?.data?.error || 'Failed to save settings');
      throw err;
    }
  };

  const startAuction = async () => {
    if (!auction) return;
    try {
      const res = await api.post(`/auctions/${auction.id}/start`);
      setAuction(res.data);
      showMsg('success', 'Auction is now LIVE');
    } catch (err: any) {
      showMsg('error', err.response?.data?.error || 'Failed to start');
    }
  };

  const pauseAuction = async () => {
    if (!auction) return;
    try {
      const res = await api.post(`/auctions/${auction.id}/pause`);
      setAuction(res.data);
    } catch (err: any) {
      showMsg('error', err.response?.data?.error || 'Failed');
    }
  };

  const selectPlayer = async (playerId: string) => {
    if (!auction) return;
    try {
      const res = await api.post(`/auctions/${auction.id}/select-player`, { playerId });
      setAuction(res.data.auction);
      setCurrentPlayer(res.data.player);
      setBidAmount(String(nextMinBid(res.data.auction.currentBid || 0, !!res.data.auction.currentBidderTeamId, res.data.auction)));
    } catch (err: any) {
      showMsg('error', err.response?.data?.error || 'Failed to select player');
    }
  };

  const nextRandomPlayer = async () => {
    if (!auction) return;
    try {
      const res = await api.post(`/auctions/${auction.id}/next-random`);
      setAuction(res.data.auction);
      setCurrentPlayer(res.data.player);
      setBidAmount(String(nextMinBid(res.data.auction.currentBid || 0, false, res.data.auction)));
      showMsg('info', `Random pick: ${res.data.player.name}`);
      api.get(`/auctions/${auction.id}/available-players`).then(r => setAvailablePlayers(r.data));
    } catch (err: any) {
      showMsg('error', err.response?.data?.error || 'No players left');
    }
  };

  const placeBid = async () => {
    if (!auction || !bidAmount) return;
    try {
      const payload: any = { amount: Number(bidAmount) };
      if (user?.role === 'admin') {
        const eligible = teams.filter(tm => {
          if (tm.remainingPurse <= 0) return false;
          const bought = soldList.filter(s => s.teamId === tm.id).length;
          if (tm.maxPlayers != null && tm.maxPlayers > 0 && bought >= Number(tm.maxPlayers)) return false;
          return true;
        });
        const tid = adminBidTeamId || eligible[0]?.id;
        if (!tid) {
          showMsg('error', 'Select a team to bid (must have purse and open slots)');
          return;
        }
        payload.teamId = tid;
      }
      await api.post(`/auctions/${auction.id}/bid`, payload);
    } catch (err: any) {
      showMsg('error', err.response?.data?.error || 'Bid failed');
    }
  };

  const sellPlayer = async () => {
    if (!auction) return;
    try {
      await api.post(`/auctions/${auction.id}/sell`);
    } catch (err: any) {
      showMsg('error', err.response?.data?.error || 'Failed to sell');
    }
  };

  const markUnsold = async () => {
    if (!auction) return;
    try {
      await api.post(`/auctions/${auction.id}/unsold`);
    } catch (err: any) {
      showMsg('error', err.response?.data?.error || 'Failed');
    }
  };

  const undoLastSell = async () => {
    if (!auction) return;
    if (!confirm('Undo the last sold player?')) return;
    try {
      await api.post(`/auctions/${auction.id}/undo-last-sell`);
      showMsg('info', 'Last sale undone');
      loadAuction();
    } catch (err: any) {
      showMsg('error', err.response?.data?.error || 'Undo failed');
    }
  };

  const endAuction = async () => {
    if (!auction) return;
    if (!confirm('End this auction permanently?')) return;
    try {
      const res = await api.post(`/auctions/${auction.id}/end`);
      setAuction(res.data);
      setCurrentPlayer(null);
      showMsg('info', 'Auction ended');
    } catch (err: any) {
      showMsg('error', err.response?.data?.error || 'Failed');
    }
  };

  const restartAuction = async () => {
    if (!auction) return;
    if (!confirm('Restart this auction? Sales undone, purses refunded, players → Approved.')) return;
    try {
      const res = await api.post(`/auctions/${auction.id}/restart`);
      setAuction(res.data.auction);
      setCurrentPlayer(null);
      setSoldList([]);
      showMsg('success', res.data.message || 'Auction restarted');
      loadAuction();
    } catch (err: any) {
      showMsg('error', err.response?.data?.error || 'Restart failed');
    }
  };

  const freshAuction = async () => {
    if (!confirm('Fresh auction? Resets purses, clears sold, re-approves players, new draft.')) return;
    try {
      const res = await api.post('/auctions/fresh', {});
      setAuction(res.data.auction);
      setCurrentPlayer(null);
      setSoldList([]);
      showMsg('success', res.data.message || 'Fresh auction created');
      loadAuction();
    } catch (err: any) {
      showMsg('error', err.response?.data?.error || 'Failed');
    }
  };

  const canTeamBid = (tm: Team) => {
    if (!tm || tm.remainingPurse <= 0) return false;
    const bought = soldList.filter(s => s.teamId === tm.id).length;
    if (tm.maxPlayers != null && tm.maxPlayers > 0 && bought >= Number(tm.maxPlayers)) return false;
    return true;
  };

  const eligibleTeams = teams.filter(canTeamBid);

  useEffect(() => {
    if (adminBidTeamId && !eligibleTeams.some(t => t.id === adminBidTeamId)) setAdminBidTeamId('');
  }, [adminBidTeamId, eligibleTeams]);

  const recallUnsold = async () => {
    if (!auction) return;
    try {
      const res = await api.post(`/auctions/${auction.id}/recall-unsold`, {});
      setAuction(res.data.auction);
      setCurrentPlayer(res.data.player);
      setBidAmount(String(nextMinBid(res.data.auction.currentBid || 0, false, res.data.auction)));
      showMsg('info', `Recalled unsold: ${res.data.player.name} (${res.data.remainingUnsold} left)`);
      loadAuction();
    } catch (err: any) {
      showMsg('error', err.response?.data?.error || 'Recall failed');
    }
  };

  const currentBidderName = teams.find(t => t.id === auction?.currentBidderTeamId)?.name || '—';
  const myTeam = teams.find(t => t.id === user?.teamId);

  if (loading) {
    return (
      <AppShell title="Live Auction">
        <div className="glass p-10 text-center" style={{ color: 'var(--text-2)' }}>Loading…</div>
      </AppShell>
    );
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
            <button type="button" onClick={createAuction} disabled={creating} className="as-btn-primary">
              {creating ? 'Creating…' : 'Create auction'}
            </button>
            <button type="button" onClick={freshAuction} className="as-btn-ghost">Fresh new auction</button>
          </div>
        </div>
      )}

      {!auction && user?.role !== 'admin' && (
        <div className="glass p-8 text-center" style={{ color: 'var(--text-2)' }}>Waiting for admin…</div>
      )}

      {auction && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-3.5">
          <div className="lg:col-span-2 space-y-3.5">
            <div className="glass overflow-hidden">
              {currentPlayer ? (
                <div className="p-6">
                  <div className="text-[13px] mb-1" style={{ color: 'var(--text-2)' }}>Now auctioning</div>
                  <div className="flex gap-4 items-start">
                    {currentPlayer.photoUrl && (
                      <img src={currentPlayer.photoUrl} alt="" className="w-20 h-20 rounded-2xl object-cover" />
                    )}
                    <div className="min-w-0 flex-1">
                      <h2 className="text-[28px] font-semibold" style={{ color: 'var(--text)' }}>{currentPlayer.name}</h2>
                      <div className="flex flex-wrap gap-2 mt-2">
                        <span className="glass-island text-[11px]">{currentPlayer.role}</span>
                        {currentPlayer.city && <span className="glass-island text-[11px]">{currentPlayer.city}</span>}
                        <span className="glass-island text-[11px]">Base ₹{(currentPlayer.basePrice || 0).toLocaleString()}</span>
                      </div>
                    </div>
                  </div>
                  <div className="mt-5 grid grid-cols-2 gap-3">
                    <div className="glass p-4 text-center">
                      <div className="text-[12px]" style={{ color: 'var(--text-2)' }}>Current bid</div>
                      <div className="text-[28px] font-semibold tabular-nums" style={{ color: 'var(--accent)' }}>
                        ₹{(auction.currentBid || 0).toLocaleString()}
                      </div>
                      <div className="text-[13px] mt-1" style={{ color: 'var(--text-2)' }}>by {currentBidderName}</div>
                    </div>
                    <div className="glass p-4 space-y-2">
                      {user?.role === 'admin' && (
                        <div>
                          <div className="text-[12px] mb-1.5" style={{ color: 'var(--text-2)' }}>Bid as team</div>
                          {eligibleTeams.length === 0 ? (
                            <p className="text-[13px]" style={{ color: '#ff3b30' }}>No eligible teams (purse or squad full)</p>
                          ) : (
                            <div className="flex flex-wrap gap-2">
                              {eligibleTeams.map(tm => {
                                const selected = adminBidTeamId === tm.id;
                                return (
                                  <button
                                    key={tm.id}
                                    type="button"
                                    onClick={() => setAdminBidTeamId(tm.id)}
                                    className="px-3 py-2 rounded-2xl text-[13px] font-medium transition"
                                    style={selected
                                      ? { background: 'var(--accent)', color: '#fff' }
                                      : { background: 'var(--fill)', color: 'var(--text)' }}
                                  >
                                    {tm.name}
                                    <span className="opacity-80 ml-1 text-[11px]">₹{tm.remainingPurse.toLocaleString()}</span>
                                  </button>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      )}
                      <div className="flex gap-2">
                        <input type="number" value={bidAmount} onChange={e => setBidAmount(e.target.value)} className="as-input" />
                        <button type="button" onClick={placeBid} className="as-btn-primary shrink-0">Bid</button>
                      </div>
                      {user?.role === 'admin' && (
                        <div className="flex flex-wrap gap-2 pt-1">
                          <button type="button" onClick={sellPlayer} className="as-btn-primary text-sm" style={{ background: '#30d158' }}>Sell</button>
                          <button type="button" onClick={markUnsold} className="as-btn-ghost text-sm">Unsold</button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="p-8 text-center" style={{ color: 'var(--text-2)' }}>
                  {auction.status === 'live' ? 'Select a player to start bidding' : `Auction is ${auction.status}`}
                </div>
              )}
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
                <button type="button" onClick={endAuction} className="as-btn-ghost text-sm" style={{ color: '#ff3b30' }}>End auction</button>
                <button type="button" onClick={restartAuction} className="as-btn-ghost text-sm">Restart</button>
                <button type="button" onClick={freshAuction} className="as-btn-ghost text-sm">Fresh auction</button>
                <a href="/live" target="_blank" rel="noreferrer" className="as-btn-ghost text-sm">Share live</a>
              </div>
            )}

            {user?.role === 'admin' && auction.status === 'draft' && (
              <div className="glass p-4">
                <BidRulesEditor
                  initialRules={auction.bidRules || DEFAULT_BID_RULES}
                  initialTimer={auction.bidTimerSeconds}
                  initialName={auction.name}
                  onSave={saveSettings}
                />
              </div>
            )}
          </div>

          <div className="space-y-3.5">
            <div className="glass overflow-hidden">
              <div className="px-4 pt-4 pb-2 font-semibold text-[15px]">Teams</div>
              {teams.map(tm => {
                const bought = soldList.filter(s => s.teamId === tm.id).length;
                const ok = canTeamBid(tm);
                return (
                  <div key={tm.id} className="glass-row">
                    <div className="min-w-0 flex-1">
                      <div className="font-medium text-[14px] truncate">{tm.name}</div>
                      <div className="text-[12px]" style={{ color: 'var(--text-2)' }}>
                        ₹{tm.remainingPurse.toLocaleString()} · {bought}{tm.maxPlayers != null ? `/${tm.maxPlayers}` : ''} players
                      </div>
                    </div>
                    {!ok && <span className="text-[11px]" style={{ color: '#ff3b30' }}>Full</span>}
                  </div>
                );
              })}
            </div>

            <div className="glass overflow-hidden">
              <div className="px-4 pt-4 pb-2 font-semibold text-[15px]">Available ({availablePlayers.length})</div>
              <ul className="max-h-48 overflow-y-auto">
                {availablePlayers.slice(0, 40).map(pl => (
                  <li key={pl.id} className="glass-row">
                    <span className="flex-1 truncate text-[13px]">{pl.name}</span>
                    {user?.role === 'admin' && !currentPlayer && (auction.status === 'live' || auction.status === 'paused') && (
                      <button type="button" onClick={() => selectPlayer(pl.id)} className="text-[12px] font-medium" style={{ color: 'var(--accent)' }}>Select</button>
                    )}
                  </li>
                ))}
              </ul>
            </div>

            <div className="glass overflow-hidden">
              <div className="px-4 pt-4 pb-2 font-semibold text-[15px]">Sold ({soldList.length})</div>
              <ul className="max-h-40 overflow-y-auto">
                {soldList.slice(0, 30).map(s => (
                  <li key={s.id} className="glass-row text-[13px]">
                    <span className="flex-1 truncate">{s.player?.name || '—'}</span>
                    <span style={{ color: '#30d158' }}>₹{s.soldPrice.toLocaleString()}</span>
                  </li>
                ))}
              </ul>
            </div>

            {unsoldPlayers.length > 0 && (
              <div className="glass overflow-hidden">
                <div className="px-4 pt-4 pb-2 font-semibold text-[15px]">Unsold ({unsoldPlayers.length})</div>
                <ul className="max-h-32 overflow-y-auto">
                  {unsoldPlayers.slice(0, 20).map(pl => (
                    <li key={pl.id} className="glass-row text-[13px]">{pl.name}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>
      )}
    </AppShell>
  );
}
