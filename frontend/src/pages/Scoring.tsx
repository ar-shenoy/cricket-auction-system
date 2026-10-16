import React, { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import api from '../services/api';
import ThemeToggle from '../components/ThemeToggle';

interface MatchDisplay {
  battingName: string;
  bowlingName: string;
  score: string;
  overs: string;
  crr: string;
  rrr: string | null;
  target: number | null;
  ballsLeft: number | null;
  thisOver: string[];
}

interface Match {
  id: string;
  name: string;
  teamAName: string;
  teamBName: string;
  oversLimit: number;
  innings: number;
  battingSide: 'A' | 'B';
  status: string;
  innings1: { runs: number; wickets: number; balls: number; extras: any };
  innings2: { runs: number; wickets: number; balls: number; extras: any };
  display?: MatchDisplay;
}

export default function Scoring() {
  const { user, logout } = useAuth();
  const [matches, setMatches] = useState<Match[]>([]);
  const [match, setMatch] = useState<Match | null>(null);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({
    teamAName: '',
    teamBName: '',
    oversLimit: '20',
    battingFirst: 'A',
    name: ''
  });

  const load = useCallback(async () => {
    try {
      const res = await api.get('/matches');
      setMatches(res.data);
      if (match?.id) {
        const current = res.data.find((m: Match) => m.id === match.id);
        if (current) setMatch(current);
      } else {
        const live = res.data.find((m: Match) => m.status === 'live' || m.status === 'innings_break');
        if (live) setMatch(live);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [match?.id]);

  useEffect(() => {
    load();
    const t = setInterval(load, 8000);
    return () => clearInterval(t);
  }, [load]);

  const flash = (t: string) => {
    setMsg(t);
    setTimeout(() => setMsg(null), 2500);
  };

  const createMatch = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await api.post('/matches', {
        name: form.name || undefined,
        teamAName: form.teamAName,
        teamBName: form.teamBName,
        oversLimit: Number(form.oversLimit) || 20,
        battingFirst: form.battingFirst
      });
      setMatch(res.data);
      setShowCreate(false);
      flash('Match started');
      load();
    } catch (err: any) {
      alert(err.response?.data?.error || 'Failed to create match');
    }
  };

  const sendEvent = async (type: string, extraRuns = 0) => {
    if (!match) return;
    try {
      const res = await api.post(`/matches/${match.id}/event`, { type, extraRuns });
      setMatch(res.data);
    } catch (err: any) {
      alert(err.response?.data?.error || 'Failed');
    }
  };

  const undo = async () => {
    if (!match) return;
    try {
      const res = await api.post(`/matches/${match.id}/undo`);
      setMatch(res.data);
      flash('Undone');
    } catch (err: any) {
      alert(err.response?.data?.error || 'Nothing to undo');
    }
  };

  const endInnings = async () => {
    if (!match) return;
    if (!confirm(match.innings === 1 ? 'End 1st innings and switch sides?' : 'End match?')) return;
    try {
      const res = await api.post(`/matches/${match.id}/end-innings`);
      setMatch(res.data);
      flash(match.innings === 1 ? '2nd innings started' : 'Match completed');
      load();
    } catch (err: any) {
      alert(err.response?.data?.error || 'Failed');
    }
  };

  const btn =
    'min-h-[56px] min-w-[56px] sm:min-h-[64px] sm:min-w-[64px] rounded-xl text-lg font-bold shadow-sm active:scale-95 transition border';

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900 text-gray-500">
        Loading scoring...
      </div>
    );
  }

  const d = match?.display;

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 transition-colors">
      <header className="bg-white dark:bg-gray-800 shadow-sm border-b dark:border-gray-700 sticky top-0 z-20">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between gap-2">
          <div className="flex items-center gap-3 min-w-0">
            <Link to="/" className="text-gray-500 dark:text-gray-400 text-sm shrink-0">← Dashboard</Link>
            <h1 className="font-bold text-gray-900 dark:text-white truncate">Live Scoring</h1>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <a href="/scoreboard" target="_blank" rel="noreferrer" className="text-xs sm:text-sm bg-indigo-600 hover:bg-indigo-700 text-white px-3 py-1.5 rounded-lg">Open projector board</a>
            <ThemeToggle />
            <button onClick={logout} className="text-sm text-red-600">Logout</button>
          </div>
        </div>
      </header>

      {msg && (
        <div className="max-w-5xl mx-auto px-4 mt-3">
          <div className="bg-blue-100 dark:bg-blue-900/40 text-blue-800 dark:text-blue-200 px-4 py-2 rounded-lg text-sm">{msg}</div>
        </div>
      )}

      <main className="max-w-5xl mx-auto px-4 py-4 space-y-4">
        <div className="flex flex-wrap gap-2 items-center">
          <select
            className="border dark:border-gray-600 rounded-lg px-3 py-2 bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm"
            value={match?.id || ''}
            onChange={e => {
              const m = matches.find(x => x.id === e.target.value);
              setMatch(m || null);
            }}
          >
            <option value="">Select match...</option>
            {matches.map(m => (
              <option key={m.id} value={m.id}>{m.name} ({m.status})</option>
            ))}
          </select>
          <button onClick={() => setShowCreate(true)} className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium">+ New match</button>
        </div>

        {!match && (
          <div className="bg-white dark:bg-gray-800 rounded-xl border dark:border-gray-700 p-10 text-center text-gray-500 dark:text-gray-400">
            Create or select a match to start scoring.
          </div>
        )}

        {match && (
          <>
            <div className="bg-white dark:bg-gray-800 rounded-xl border dark:border-gray-700 p-5">
              <div className="flex flex-wrap justify-between gap-2 mb-3">
                <div>
                  <div className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                    {match.status === 'completed' ? 'Completed' : `Innings ${match.innings}`} · {match.oversLimit} overs
                  </div>
                  <div className="text-2xl sm:text-3xl font-black text-gray-900 dark:text-white">{d?.battingName || '—'}</div>
                </div>
                <div className="text-right">
                  <div className="text-4xl sm:text-5xl font-black text-indigo-600 dark:text-indigo-400 tabular-nums">{d?.score || '0/0'}</div>
                  <div className="text-lg text-gray-600 dark:text-gray-300">({d?.overs || '0.0'} ov) · CRR {d?.crr}</div>
                </div>
              </div>
              {d?.target != null && (
                <div className="text-sm text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-900/20 rounded-lg px-3 py-2 mb-2">
                  Target {d.target}{d.rrr != null && ` · RRR ${d.rrr}`}{d.ballsLeft != null && ` · ${d.ballsLeft} balls left`}
                </div>
              )}
              <div className="flex flex-wrap gap-1.5 mt-2">
                <span className="text-xs text-gray-500 dark:text-gray-400 mr-1 self-center">This over:</span>
                {(d?.thisOver || []).length === 0 && <span className="text-xs text-gray-400">—</span>}
                {(d?.thisOver || []).map((b, i) => (
                  <span key={i} className={`px-2 py-0.5 rounded text-xs font-bold ${
                    b === 'W' ? 'bg-red-600 text-white' : b === '4' || b === '6' ? 'bg-emerald-600 text-white' : b.startsWith('Wd') || b.startsWith('Nb') ? 'bg-orange-500 text-white' : 'bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-200'
                  }`}>{b}</span>
                ))}
              </div>
              <div className="mt-3 text-xs text-gray-500 dark:text-gray-400">
                vs {d?.bowlingName} · 1st inns: {match.innings1.runs}/{match.innings1.wickets} ({Math.floor(match.innings1.balls / 6)}.{match.innings1.balls % 6})
                {match.innings === 2 && <> · 2nd: {match.innings2.runs}/{match.innings2.wickets}</>}
              </div>
            </div>

            {match.status !== 'completed' && (
              <div className="bg-white dark:bg-gray-800 rounded-xl border dark:border-gray-700 p-4 space-y-4">
                <div>
                  <div className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2">RUNS</div>
                  <div className="flex flex-wrap gap-2">
                    {[
                      { t: 'dot', l: '•', c: 'bg-gray-100 dark:bg-gray-700 border-gray-300 dark:border-gray-600 text-gray-900 dark:text-white' },
                      { t: '1', l: '1', c: 'bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600 text-gray-900 dark:text-white' },
                      { t: '2', l: '2', c: 'bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600 text-gray-900 dark:text-white' },
                      { t: '3', l: '3', c: 'bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600 text-gray-900 dark:text-white' },
                      { t: '4', l: '4', c: 'bg-emerald-500 border-emerald-600 text-white' },
                      { t: '6', l: '6', c: 'bg-blue-600 border-blue-700 text-white' }
                    ].map(b => (
                      <button key={b.t} type="button" onClick={() => sendEvent(b.t)} className={`${btn} ${b.c}`}>{b.l}</button>
                    ))}
                  </div>
                </div>
                <div>
                  <div className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2">WICKET & EXTRAS</div>
                  <div className="flex flex-wrap gap-2">
                    <button type="button" onClick={() => sendEvent('wicket')} className={`${btn} bg-red-600 border-red-700 text-white px-4`}>Wicket</button>
                    <button type="button" onClick={() => sendEvent('wide')} className={`${btn} bg-orange-500 border-orange-600 text-white px-3`}>Wide</button>
                    <button type="button" onClick={() => sendEvent('noball')} className={`${btn} bg-orange-600 border-orange-700 text-white px-3`}>No Ball</button>
                    <button type="button" onClick={() => sendEvent('bye', 1)} className={`${btn} bg-purple-600 border-purple-700 text-white px-3`}>Bye</button>
                    <button type="button" onClick={() => sendEvent('legbye', 1)} className={`${btn} bg-purple-700 border-purple-800 text-white px-3`}>Leg Bye</button>
                  </div>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">Wide / No Ball = +1 (not a legal ball). Bye / Leg Bye = +1 legal ball.</p>
                </div>
                <div className="flex flex-wrap gap-2 pt-2 border-t dark:border-gray-700">
                  <button type="button" onClick={undo} className="bg-gray-200 dark:bg-gray-600 hover:bg-gray-300 dark:hover:bg-gray-500 text-gray-900 dark:text-white px-5 py-3 rounded-xl font-medium">Undo</button>
                  <button type="button" onClick={endInnings} className="bg-slate-800 hover:bg-slate-900 text-white px-5 py-3 rounded-xl font-medium">{match.innings === 1 ? 'End innings' : 'End match'}</button>
                </div>
              </div>
            )}
          </>
        )}
      </main>

      {showCreate && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl max-w-md w-full p-6">
            <h2 className="text-xl font-bold mb-4 text-gray-900 dark:text-white">New match</h2>
            <form onSubmit={createMatch} className="space-y-3">
              <div>
                <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">Team A *</label>
                <input required value={form.teamAName} onChange={e => setForm({ ...form, teamAName: e.target.value })} className="w-full border dark:border-gray-600 rounded-lg px-3 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-white" placeholder="Batting first by default" />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">Team B *</label>
                <input required value={form.teamBName} onChange={e => setForm({ ...form, teamBName: e.target.value })} className="w-full border dark:border-gray-600 rounded-lg px-3 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-white" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">Overs</label>
                  <input type="number" min={1} value={form.oversLimit} onChange={e => setForm({ ...form, oversLimit: e.target.value })} className="w-full border dark:border-gray-600 rounded-lg px-3 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-white" />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">Bat first</label>
                  <select value={form.battingFirst} onChange={e => setForm({ ...form, battingFirst: e.target.value })} className="w-full border dark:border-gray-600 rounded-lg px-3 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-white">
                    <option value="A">Team A</option>
                    <option value="B">Team B</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">Match title (optional)</label>
                <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} className="w-full border dark:border-gray-600 rounded-lg px-3 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-white" placeholder="Final / Semi..." />
              </div>
              <div className="flex gap-2 pt-2">
                <button type="submit" className="flex-1 bg-blue-600 hover:bg-blue-700 text-white py-2 rounded-lg font-medium">Start match</button>
                <button type="button" onClick={() => setShowCreate(false)} className="flex-1 bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-white py-2 rounded-lg">Cancel</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
