import React, { useEffect, useState, useRef, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
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
  const { user, logout } = useAuth();
  const [auction, setAuction] = useState<Auction | null>(null);
  const [currentPlayer, setCurrentPlayer] = useState<Player | null>(null);
  const [teams, setTeams] = useState<Team[]>([]);
  const [availablePlayers, setAvailablePlayers] = useState<Player[]>([]);
  const [soldList, setSoldList] = useState<SoldRecord[]>([]);
  const [unsoldPlayers, setUnsoldPlayers] = useState<Player[]>([]);
  const [bidAmount, setBidAmount] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);
  const [creating, setCreating] = useState(false);
  const [adminBidTeamId, setAdminBidTeamId] = useState('');
  const socketRef = useRef<Socket | null>(null);

  const loadAuction = useCallback(async () => {
    try {
      const [auctionRes, teamsRes] = await Promise.all([
        api.get('/auctions/active'),
        api.get('/teams')
      ]);
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
        } else {
          setCurrentPlayer(null);
        }
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
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
        <div className="text-gray-500 dark:text-gray-400">Loading auction...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-100 dark:bg-gray-900 transition-colors">
      <header className="bg-white dark:bg-gray-800 shadow-sm border-b dark:border-gray-700 sticky top-0 z-20">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link to="/" className="text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 text-sm">← Dashboard</Link>
            <h1 className="text-lg font-bold text-gray-900 dark:text-white">
              🏏 Live Auction
              {auction && (
                <span className={`ml-2 text-xs px-2 py-0.5 rounded-full font-medium ${
                  auction.status === 'live' ? 'bg-green-100 text-green-700' :
                  auction.status === 'paused' ? 'bg-yellow-100 text-yellow-700' :
                  auction.status === 'completed' ? 'bg-gray-100 text-gray-600' :
                  'bg-blue-100 text-blue-700'
                }`}>{auction.status.toUpperCase()}</span>
              )}
            </h1>
          </div>
          <div className="flex items-center gap-3">
            {myTeam && (
              <span className="text-sm bg-indigo-50 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300 px-3 py-1 rounded-full">
                {myTeam.name}: ₹{myTeam.remainingPurse.toLocaleString()}
              </span>
            )}
            <span className="text-sm text-gray-600 dark:text-gray-300">{user?.name}</span>
            <a href="/live" target="_blank" rel="noreferrer" className="text-sm text-indigo-600 dark:text-indigo-400 hover:underline">Share live</a>
            <button onClick={logout} className="text-sm text-red-600">Logout</button>
          </div>
        </div>
      </header>

      {message && (
        <div className="max-w-7xl mx-auto px-4 mt-3">
          <div className={`px-4 py-2 rounded-lg text-sm font-medium ${
            message.type === 'success' ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300' :
            message.type === 'error' ? 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300' :
            'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300'
          }`}>{message.text}</div>
        </div>
      )}

      <main className="max-w-7xl mx-auto px-4 py-4">
        {!auction && user?.role === 'admin' && (
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow p-8 text-center border dark:border-gray-700 space-y-3">
            <h2 className="text-xl font-bold text-gray-900 dark:text-white">No Active Auction</h2>
            <div className="flex flex-wrap gap-3 justify-center">
              <button onClick={createAuction} disabled={creating} className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2.5 rounded-lg font-medium disabled:opacity-50">
                {creating ? 'Creating...' : 'Create Auction'}
              </button>
              <button onClick={freshAuction} className="bg-slate-700 hover:bg-slate-800 text-white px-6 py-2.5 rounded-lg font-medium">✨ Fresh new auction</button>
            </div>
          </div>
        )}

        {!auction && user?.role !== 'admin' && (
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow p-8 text-center text-gray-500 dark:text-gray-400">Waiting for admin...</div>
        )}

        {auction && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <div className="lg:col-span-2 space-y-4">
              <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border dark:border-gray-700 overflow-hidden">
                {currentPlayer ? (
                  <div className="p-6">
                    <div>
                      <div className="text-sm text-gray-500 dark:text-gray-400 mb-1">Now Auctioning</div>
                      <h2 className="text-3xl font-bold text-gray-900 dark:text-white">{currentPlayer.name}</h2>
                      <div className="flex flex-wrap gap-2 mt-2">
                        <span className="bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 text-xs px-2 py-1 rounded-full">{currentPlayer.role}</span>
                        {currentPlayer.city && <span className="bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 text-xs px-2 py-1 rounded-full">{currentPlayer.city}</span>}
                        <span className="bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 text-xs px-2 py-1 rounded-full">Base: ₹{currentPlayer.basePrice?.toLocaleString() || 0}</span>
                      </div>
                      <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs text-gray-600 dark:text-gray-300">
                        {currentPlayer.age != null && <div><span className="text-gray-400">Age</span><br/><span className="font-medium text-gray-900 dark:text-white">{currentPlayer.age}</span></div>}
                        {currentPlayer.battingStyle && <div><span className="text-gray-400">Batting</span><br/><span className="font-medium text-gray-900 dark:text-white">{currentPlayer.battingStyle}</span></div>}
                        {currentPlayer.bowlingStyle && <div><span className="text-gray-400">Bowling</span><br/><span className="font-medium text-gray-900 dark:text-white">{currentPlayer.bowlingStyle}</span></div>}
                        {currentPlayer.city && <div><span className="text-gray-400">City</span><br/><span className="font-medium text-gray-900 dark:text-white">{currentPlayer.city}</span></div>}
                      </div>
                      {currentPlayer.bio && <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">{currentPlayer.bio}</p>}
                    </div>

                    <div className="mt-6 grid grid-cols-2 gap-4">
                      <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4 text-center">
                        <div className="text-xs text-gray-500 dark:text-gray-400">Current Bid</div>
                        <div className="text-2xl font-bold text-gray-900 dark:text-white">₹{(auction.currentBid || 0).toLocaleString()}</div>
                        <div className="text-xs text-indigo-600 dark:text-indigo-400 mt-1">Next step +₹{getIncrement(auction.currentBid || 0, auction).toLocaleString()}</div>
                      </div>
                      <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4 text-center">
                        <div className="text-xs text-gray-500 dark:text-gray-400">Highest Bidder</div>
                        <div className="text-lg font-semibold text-indigo-700 dark:text-indigo-300">{currentBidderName}</div>
                      </div>
                    </div>

                    {(user?.role === 'team_manager' || user?.role === 'admin') && auction.status === 'live' && (
                      <div className="mt-6 space-y-3">
                        {user?.role === 'admin' && (
                          <div>
                            <label className="block text-xs text-gray-500 dark:text-gray-400 mb-2">Select team to bid (purse > 0 and squad slots left)</label>
                            <div className="flex flex-wrap gap-2">
                              {eligibleTeams.length === 0 && (
                                <p className="text-xs text-gray-500 dark:text-gray-400">No teams can bid (purse empty or squad full).</p>
                              )}
                              {eligibleTeams.map(tm => {
                                const bought = soldList.filter(s => s.teamId === tm.id).length;
                                const maxB = maxBidForTeam(tm.remainingPurse, bought, tm.maxPlayers);
                                const selected = adminBidTeamId === tm.id;
                                return (
                                  <button
                                    key={tm.id}
                                    type="button"
                                    onClick={() => setAdminBidTeamId(tm.id)}
                                    className={`px-3 py-2 rounded-lg text-sm font-medium border transition ${
                                      selected
                                        ? 'bg-indigo-600 text-white border-indigo-600'
                                        : 'bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200 border-gray-300 dark:border-gray-600 hover:border-indigo-400'
                                    }`}
                                  >
                                    {tm.name}
                                    <span className="block text-[10px] opacity-80 font-normal">
                                      ₹{tm.remainingPurse.toLocaleString()} · max ₹{maxB.toLocaleString()}
                                    </span>
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        )}
                        {user?.role === 'team_manager' && myTeam && canTeamBid(myTeam) && (
                          <p className="text-xs text-gray-500 dark:text-gray-400">
                            Your max bid: ₹{maxBidForTeam(myTeam.remainingPurse, soldList.filter(s => s.teamId === myTeam.id).length, myTeam.maxPlayers).toLocaleString()}
                          </p>
                        )}
                        {user?.role === 'admin' && adminBidTeamId && (() => {
                          const tm = eligibleTeams.find(x => x.id === adminBidTeamId);
                          if (!tm) return null;
                          const bought = soldList.filter(s => s.teamId === tm.id).length;
                          const maxB = maxBidForTeam(tm.remainingPurse, bought, tm.maxPlayers);
                          return (
                            <p className="text-xs text-indigo-600 dark:text-indigo-400">
                              {tm.name} max: ₹{maxB.toLocaleString()}
                            </p>
                          );
                        })()}
                        <div className="flex flex-col sm:flex-row gap-3 items-end">
                          <div className="flex-1">
                            <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Bid amount (₹)</label>
                            <input type="number" value={bidAmount} onChange={e => setBidAmount(e.target.value)}
                              className="w-full border dark:border-gray-600 rounded-lg px-4 py-2.5 text-lg font-medium focus:ring-2 focus:ring-blue-500 outline-none bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                              step={getIncrement(auction.currentBid || 0, auction)} />
                          </div>
                          <button onClick={placeBid} className="bg-green-600 hover:bg-green-700 text-white font-bold px-8 py-2.5 rounded-lg text-lg shadow">PLACE BID</button>
                        </div>
                      </div>
                    )}

                    {user?.role === 'admin' && (
                      <div className="mt-4 flex flex-wrap gap-2">
                        <button onClick={sellPlayer} className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium">🔨 Sell / Confirm</button>
                        <button onClick={markUnsold} className="bg-gray-600 hover:bg-gray-700 text-white px-4 py-2 rounded-lg text-sm font-medium">Mark Unsold</button>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="p-10 text-center text-gray-500 dark:text-gray-400">
                    <div className="text-4xl mb-2">🏏</div>
                    <p>No player currently being auctioned.</p>
                    {user?.role === 'admin' && auction.status === 'live' && (
                      <button onClick={nextRandomPlayer} className="mt-4 bg-purple-600 hover:bg-purple-700 text-white px-5 py-2 rounded-lg text-sm font-medium">🎲 Pick random player</button>
                    )}
                    {user?.role === 'admin' && !auction.currentPlayerId && (
                      <button onClick={recallUnsold} className="mt-3 ml-2 bg-amber-600 hover:bg-amber-700 text-white px-5 py-2 rounded-lg text-sm font-medium">
                        🔁 Recall Unsold{unsoldPlayers.length ? ` (${unsoldPlayers.length})` : ''}
                      </button>
                    )}
                  </div>
                )}
              </div>

              {user?.role === 'admin' && (auction.status === 'draft' || (auction.status === 'paused' && !auction.currentPlayerId)) && (
                <BidRulesEditor
                  initialRules={auction.bidRules || DEFAULT_BID_RULES}
                  initialTimer={auction.bidTimerSeconds}
                  initialName={auction.name}
                  onSave={saveSettings}
                />
              )}

              {user?.role === 'admin' && (
                <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border dark:border-gray-700 p-4 flex flex-wrap gap-2">
                  {auction.status === 'draft' && (
                    <button onClick={startAuction} className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg text-sm font-medium">▶️ Start Auction</button>
                  )}
                  {(auction.status === 'live' || auction.status === 'paused') && (
                    <button onClick={pauseAuction} className="bg-yellow-500 hover:bg-yellow-600 text-white px-4 py-2 rounded-lg text-sm font-medium">{auction.status === 'live' ? '⏸ Pause' : '▶️ Resume'}</button>
                  )}
                  {auction.status === 'live' && (
                    <button onClick={nextRandomPlayer} className="bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded-lg text-sm font-medium">🎲 Next random player</button>
                  )}
                  {!auction.currentPlayerId && (auction.status === 'live' || auction.status === 'paused' || auction.status === 'completed') && (
                    <button onClick={recallUnsold} className="bg-amber-600 hover:bg-amber-700 text-white px-4 py-2 rounded-lg text-sm font-medium">
                      🔁 Recall Unsold{unsoldPlayers.length ? ` (${unsoldPlayers.length})` : ''}
                    </button>
                  )}
                  {auction.status !== 'completed' && soldList.length > 0 && (
                    <button onClick={undoLastSell} className="bg-orange-500 hover:bg-orange-600 text-white px-4 py-2 rounded-lg text-sm font-medium">↩ Undo last sell</button>
                  )}
                  {auction.status !== 'completed' && (
                    <button onClick={endAuction} className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg text-sm font-medium">End Auction</button>
                  )}
                  {(auction.status === 'completed' || auction.status === 'draft') && (
                    <button onClick={restartAuction} className="bg-teal-600 hover:bg-teal-700 text-white px-4 py-2 rounded-lg text-sm font-medium">🔄 Restart this auction</button>
                  )}
                  <button onClick={freshAuction} className="bg-slate-700 hover:bg-slate-800 text-white px-4 py-2 rounded-lg text-sm font-medium">✨ Fresh new auction</button>
                </div>
              )}

              <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border dark:border-gray-700 p-4">
                <h3 className="font-semibold text-gray-900 dark:text-white mb-3">Sold ({soldList.length})</h3>
                {soldList.length === 0 ? (
                  <p className="text-sm text-gray-500 dark:text-gray-400">No players sold yet.</p>
                ) : (
                  <ul className="space-y-2 max-h-48 overflow-y-auto text-sm">
                    {soldList.map(s => (
                      <li key={s.id} className="flex justify-between text-gray-700 dark:text-gray-300">
                        <span>{s.player?.name || s.playerId}</span>
                        <span className="text-green-600 dark:text-green-400">₹{s.soldPrice.toLocaleString()} → {s.team?.name}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>

            <div className="space-y-4">
              <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border dark:border-gray-700 p-4">
                <h3 className="font-semibold text-gray-900 dark:text-white mb-3">Teams</h3>
                <ul className="space-y-2 text-sm">
                  {teams.map(t => (
                    <li key={t.id} className="flex justify-between text-gray-700 dark:text-gray-300">
                      <span className={t.id === auction.currentBidderTeamId ? 'font-bold text-indigo-600 dark:text-indigo-400' : ''}>
                        {t.name}
                        {!canTeamBid(t) && <span className="ml-1 text-[10px] text-gray-400">(out)</span>}
                      </span>
                      <span className="text-green-600 dark:text-green-400">₹{t.remainingPurse.toLocaleString()}</span>
                    </li>
                  ))}
                </ul>
              </div>

              {user?.role === 'admin' && auction.status === 'live' && (
                <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border dark:border-gray-700 p-4">
                  <h3 className="font-semibold text-gray-900 dark:text-white mb-3">Available ({availablePlayers.length})</h3>
                  <ul className="space-y-1 max-h-96 overflow-y-auto text-sm">
                    {availablePlayers.map(p => (
                      <li key={p.id}>
                        <button onClick={() => selectPlayer(p.id)} className="w-full text-left px-2 py-1.5 rounded hover:bg-blue-50 dark:hover:bg-blue-900/30 text-gray-800 dark:text-gray-200">
                          {p.name} <span className="text-xs text-gray-500">({p.role})</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
