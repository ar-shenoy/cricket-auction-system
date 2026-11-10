import React, { useEffect, useState, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import api from '../services/api';
import AppShell from '../components/AppShell';

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
  freeHit?: boolean;
  inPowerplay?: boolean;
  powerplayOvers?: number;
  currentOver?: number;
  matchStatus?: string;
  rainDelay?: boolean;
  abandoned?: boolean;
  superOver?: boolean;
  revisedOvers?: number | null;
  dlsTarget?: number | null;
  resultText?: string | null;
}

interface Match {
  id: string;
  name: string;
  teamAName: string;
  teamBName: string;
  oversLimit: number;
  powerplayOvers?: number;
  innings: number;
  battingSide: 'A' | 'B';
  status: string;
  innings1: { runs: number; wickets: number; balls: number; freeHit?: boolean };
  innings2: { runs: number; wickets: number; balls: number; freeHit?: boolean };
  revisedOvers?: number | null;
  dlsTarget?: number | null;
  superOver?: boolean;
  result?: string | null;
  display?: MatchDisplay;
}

const DISMISSALS = [
  { id: 'bowled', label: 'Bowled' },
  { id: 'caught', label: 'Caught' },
  { id: 'lbw', label: 'LBW' },
  { id: 'run_out', label: 'Run out' },
  { id: 'stumped', label: 'Stumped' },
  { id: 'hit_wicket', label: 'Hit wicket' },
  { id: 'retired_hurt', label: 'Retired hurt' }
];

const btn = 'rounded-xl px-3 py-2.5 text-[13px] font-semibold transition active:scale-[0.98]';

export default function Scoring() {
  const { user } = useAuth();
  const [matches, setMatches] = useState<Match[]>([]);
  const [match, setMatch] = useState<Match | null>(null);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [showWicket, setShowWicket] = useState(false);
  const [dismissal, setDismissal] = useState('bowled');
  const [showDls, setShowDls] = useState(false);
  const [dlsOvers, setDlsOvers] = useState('15');
  const [dlsTarget, setDlsTarget] = useState('');
  const [form, setForm] = useState({
    teamAName: '',
    teamBName: '',
    oversLimit: '20',
    powerplayOvers: '6',
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
        const live = res.data.find(
          (m: Match) => m.status === 'live' || m.status === 'rain_delay' || m.status === 'super_over' || m.status === 'innings_break'
        );
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
    const t = setInterval(load, 6000);
    return () => clearInterval(t);
  }, [load]);

  const flash = (t: string) => {
    setMsg(t);
    setTimeout(() => setMsg(null), 2800);
  };

  const createMatch = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await api.post('/matches', {
        name: form.name || undefined,
        teamAName: form.teamAName,
        teamBName: form.teamBName,
        oversLimit: Number(form.oversLimit) || 20,
        powerplayOvers: Number(form.powerplayOvers) || 6,
        battingFirst: form.battingFirst
      });
      setMatch(res.data);
      setShowCreate(false);
      flash('Match started');
      load();
    } catch (err: any) {
      alert(err.response?.data?.error || 'Failed');
    }
  };

  const sendEvent = async (type: string, extra?: { runs?: number; dismissal?: string }) => {
    if (!match) return;
    try {
      const res = await api.post(`/matches/${match.id}/event`, { type, ...extra });
      setMatch(res.data);
      flash(extra?.dismissal ? `Wicket — ${extra.dismissal.replace('_', ' ')}` : type);
    } catch (err: any) {
      flash(err.response?.data?.error || 'Event failed');
    }
  };

  const undo = async () => {
    if (!match) return;
    try {
      const res = await api.post(`/matches/${match.id}/undo`);
      setMatch(res.data);
      flash('Undone');
    } catch (err: any) {
      flash(err.response?.data?.error || 'Undo failed');
    }
  };

  const endInnings = async () => {
    if (!match) return;
    if (!confirm(match.innings === 1 ? 'End innings 1 and set chase target?' : 'End match and compute result?')) return;
    try {
      const res = await api.post(`/matches/${match.id}/end-innings`);
      setMatch(res.data);
      flash(match.innings === 1 ? 'Innings break — chase on' : 'Match completed');
      load();
    } catch (err: any) {
      flash(err.response?.data?.error || 'Failed');
    }
  };

  const setStatus = async (status: string) => {
    if (!match) return;
    try {
      const res = await api.post(`/matches/${match.id}/status`, { status });
      setMatch(res.data);
      flash(status.replace('_', ' '));
    } catch (err: any) {
      flash(err.response?.data?.error || 'Failed');
    }
  };

  const applyDls = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!match) return;
    try {
      const body: any = { revisedOvers: Number(dlsOvers) };
      if (dlsTarget) body.dlsTarget = Number(dlsTarget);
      const res = await api.post(`/matches/${match.id}/dls`, body);
      setMatch(res.data);
      setShowDls(false);
      flash('DLS / revised overs applied');
    } catch (err: any) {
      flash(err.response?.data?.error || 'DLS failed');
    }
  };

  const startSuperOver = async () => {
    if (!match) return;
    if (!confirm('Start Super Over? Scores reset for 1-over shootout.')) return;
    try {
      const res = await api.post(`/matches/${match.id}/super-over`, { battingFirst: 'A' });
      setMatch(res.data);
      flash('Super Over started');
    } catch (err: any) {
      flash(err.response?.data?.error || 'Failed');
    }
  };

  const d = match?.display;
  const freeHit = !!(d?.freeHit || (match?.innings === 1 ? match?.innings1?.freeHit : match?.innings2?.freeHit));
  const isAdmin = user?.role === 'admin' || user?.role === 'developer';

  if (loading) {
    return (
      <AppShell title="Scoring">
        <div className="glass p-10 text-center" style={{ color: 'var(--text-2)' }}>Loading…</div>
      </AppShell>
    );
  }

  return (
    <AppShell
      title="Scoring"
      subtitle="Live match control"
      actions={
        isAdmin ? (
          <button type="button" className="as-btn-primary text-sm" onClick={() => setShowCreate(true)}>
            New match
          </button>
        ) : null
      }
    >
      {msg && (
        <div className="glass p-3 mb-3 text-[14px] font-medium" style={{ color: 'var(--accent)' }}>
          {msg}
        </div>
      )}

      {showCreate && (
        <form onSubmit={createMatch} className="glass p-5 mb-4 space-y-3 max-w-lg">
          <div className="font-semibold text-[15px]">Create match</div>
          <input className="as-input" placeholder="Match name (optional)" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
          <div className="grid grid-cols-2 gap-2">
            <input className="as-input" placeholder="Team A" required value={form.teamAName} onChange={e => setForm({ ...form, teamAName: e.target.value })} />
            <input className="as-input" placeholder="Team B" required value={form.teamBName} onChange={e => setForm({ ...form, teamBName: e.target.value })} />
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div>
              <label className="as-label">Overs</label>
              <input className="as-input" value={form.oversLimit} onChange={e => setForm({ ...form, oversLimit: e.target.value })} />
            </div>
            <div>
              <label className="as-label">Powerplay overs</label>
              <input className="as-input" value={form.powerplayOvers} onChange={e => setForm({ ...form, powerplayOvers: e.target.value })} />
            </div>
            <div>
              <label className="as-label">Bat first</label>
              <select className="as-input" value={form.battingFirst} onChange={e => setForm({ ...form, battingFirst: e.target.value })}>
                <option value="A">Team A</option>
                <option value="B">Team B</option>
              </select>
            </div>
          </div>
          <div className="flex gap-2">
            <button type="submit" className="as-btn-primary">Start match</button>
            <button type="button" className="as-btn-ghost" onClick={() => setShowCreate(false)}>Cancel</button>
          </div>
        </form>
      )}

      {matches.length > 0 && (
        <div className="flex gap-2 overflow-x-auto pb-2 mb-3">
          {matches.slice(0, 12).map(m => (
            <button
              key={m.id}
              type="button"
              onClick={() => setMatch(m)}
              className="glass-island text-[12px] whitespace-nowrap"
              style={match?.id === m.id ? { background: 'var(--accent)', color: '#fff' } : undefined}
            >
              {m.teamAName} vs {m.teamBName} · {m.status}
            </button>
          ))}
        </div>
      )}

      {!match && (
        <div className="glass p-10 text-center" style={{ color: 'var(--text-2)' }}>
          No live match. Create one to start scoring.
        </div>
      )}

      {match && (
        <div className="space-y-3.5">
          <div className="flex flex-wrap gap-2 items-center">
            <span className="glass-island text-[12px] capitalize">{match.status.replace('_', ' ')}</span>
            {d?.inPowerplay && <span className="glass-island text-[12px]" style={{ background: 'rgba(48,209,88,0.2)', color: '#30d158' }}>Powerplay (1–{d.powerplayOvers})</span>}
            {freeHit && <span className="glass-island text-[12px]" style={{ background: 'rgba(255,159,10,0.25)', color: '#ff9f0a' }}>FREE HIT</span>}
            {d?.superOver && <span className="glass-island text-[12px]" style={{ background: 'rgba(10,132,255,0.2)', color: 'var(--accent)' }}>Super Over</span>}
            {d?.rainDelay && <span className="glass-island text-[12px]" style={{ background: 'rgba(10,132,255,0.2)' }}>Rain delay</span>}
            {match.result && <span className="text-[13px] font-medium" style={{ color: '#30d158' }}>{match.result}</span>}
            <a href="/scoreboard" target="_blank" rel="noreferrer" className="as-btn-ghost text-sm ml-auto">Projector board</a>
          </div>

          <div className="glass p-5">
            <div className="text-[13px]" style={{ color: 'var(--text-2)' }}>{d?.battingName} batting · vs {d?.bowlingName}</div>
            <div className="text-[40px] font-semibold tabular-nums leading-none mt-1" style={{ color: 'var(--text)' }}>{d?.score}</div>
            <div className="flex flex-wrap gap-4 mt-3 text-[13px]" style={{ color: 'var(--text-2)' }}>
              <span>Overs {d?.overs}</span>
              <span>CRR {d?.crr}</span>
              {d?.target != null && <span className="font-semibold" style={{ color: 'var(--accent)' }}>Target {d.target}</span>}
              {d?.rrr && <span>RRR {d.rrr}</span>}
              {d?.ballsLeft != null && <span>{d.ballsLeft} balls left</span>}
              {d?.revisedOvers != null && <span>Revised {d.revisedOvers} ov</span>}
            </div>
            <div className="flex flex-wrap gap-1.5 mt-4">
              <span className="text-[12px] self-center mr-1" style={{ color: 'var(--text-2)' }}>This over</span>
              {(d?.thisOver || []).map((b, i) => (
                <span key={i} className="w-8 h-8 rounded-full flex items-center justify-center text-[11px] font-bold" style={{
                  background: b === 'W' || b.startsWith('W') ? '#ff3b30' : b === '6' ? '#0a84ff' : b === '4' ? '#30d158' : 'var(--fill)',
                  color: b === 'W' || b.startsWith('W') || b === '6' || b === '4' ? '#fff' : 'var(--text)'
                }}>{b}</span>
              ))}
              {(d?.thisOver || []).length === 0 && <span style={{ color: 'var(--text-2)' }}>—</span>}
            </div>
          </div>

          {isAdmin && match.status !== 'completed' && match.status !== 'abandoned' && (
            <>
              <div className="glass p-4 space-y-3">
                <div className="text-[12px] font-medium uppercase tracking-wide" style={{ color: 'var(--text-2)' }}>Runs</div>
                <div className="grid grid-cols-4 sm:grid-cols-7 gap-2">
                  {[0, 1, 2, 3].map(n => (
                    <button key={n} type="button" className={btn} style={{ background: 'var(--fill)' }} onClick={() => sendEvent('run', { runs: n })}>{n}</button>
                  ))}
                  <button type="button" className={btn} style={{ background: '#30d158', color: '#fff' }} onClick={() => sendEvent('four')}>4</button>
                  <button type="button" className={btn} style={{ background: '#0a84ff', color: '#fff' }} onClick={() => sendEvent('six')}>6</button>
                  <button type="button" className={btn} style={{ background: '#ff3b30', color: '#fff' }} onClick={() => setShowWicket(true)}>Wicket</button>
                </div>

                <div className="text-[12px] font-medium uppercase tracking-wide pt-1" style={{ color: 'var(--text-2)' }}>Extras</div>
                <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
                  <button type="button" className={btn} style={{ background: '#ff9f0a', color: '#fff' }} onClick={() => sendEvent('wide')}>Wide</button>
                  <button type="button" className={btn} style={{ background: '#ff9f0a', color: '#fff' }} onClick={() => sendEvent('noball')}>No-ball</button>
                  <button type="button" className={btn} style={{ background: 'var(--fill)' }} onClick={() => sendEvent('bye', { runs: 1 })}>Bye</button>
                  <button type="button" className={btn} style={{ background: 'var(--fill)' }} onClick={() => sendEvent('legbye', { runs: 1 })}>Leg-bye</button>
                  <button type="button" className={btn} style={{ background: 'var(--fill)' }} onClick={() => sendEvent('dead_ball')}>Dead ball</button>
                  <button type="button" className={btn} style={{ background: 'var(--fill)' }} onClick={() => sendEvent('penalty', { runs: 5 })}>Penalty 5</button>
                </div>
              </div>

              {showWicket && (
                <div className="glass p-4 space-y-3">
                  <div className="font-semibold text-[14px]">Dismissal type</div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    {DISMISSALS.map(d0 => (
                      <button
                        key={d0.id}
                        type="button"
                        className={btn}
                        style={{
                          background: dismissal === d0.id ? 'var(--accent)' : 'var(--fill)',
                          color: dismissal === d0.id ? '#fff' : 'var(--text)'
                        }}
                        onClick={() => setDismissal(d0.id)}
                      >
                        {d0.label}
                      </button>
                    ))}
                  </div>
                  {freeHit && dismissal !== 'run_out' && (
                    <div className="text-[12px]" style={{ color: '#ff9f0a' }}>Free hit: only run-out can dismiss</div>
                  )}
                  <div className="flex gap-2">
                    <button
                      type="button"
                      className="as-btn-primary"
                      onClick={() => {
                        sendEvent('wicket', { dismissal });
                        setShowWicket(false);
                      }}
                    >
                      Confirm wicket
                    </button>
                    <button type="button" className="as-btn-ghost" onClick={() => setShowWicket(false)}>Cancel</button>
                  </div>
                </div>
              )}

              <div className="glass p-4 flex flex-wrap gap-2">
                <button type="button" className="as-btn-ghost text-sm" onClick={undo}>Undo last</button>
                <button type="button" className="as-btn-ghost text-sm" onClick={endInnings}>
                  {match.innings === 1 ? 'End innings' : 'End match'}
                </button>
                {(match.status === 'live' || match.status === 'super_over') && (
                  <button type="button" className="as-btn-ghost text-sm" onClick={() => setStatus('rain_delay')}>Rain delay</button>
                )}
                {match.status === 'rain_delay' && (
                  <button type="button" className="as-btn-primary text-sm" onClick={() => setStatus('live')}>Resume play</button>
                )}
                <button type="button" className="as-btn-ghost text-sm" onClick={() => setShowDls(true)}>DLS / reduce overs</button>
                <button type="button" className="as-btn-ghost text-sm" onClick={() => setStatus('abandoned')}>Abandon</button>
                <button type="button" className="as-btn-ghost text-sm" onClick={startSuperOver}>Super over</button>
              </div>

              {showDls && (
                <form onSubmit={applyDls} className="glass p-4 space-y-3 max-w-md">
                  <div className="font-semibold text-[14px]">Revised overs / DLS target</div>
                  <div>
                    <label className="as-label">Revised overs</label>
                    <input className="as-input" value={dlsOvers} onChange={e => setDlsOvers(e.target.value)} />
                  </div>
                  <div>
                    <label className="as-label">Target (optional — auto if empty)</label>
                    <input className="as-input" value={dlsTarget} onChange={e => setDlsTarget(e.target.value)} placeholder="Auto from 1st innings" />
                  </div>
                  <div className="flex gap-2">
                    <button type="submit" className="as-btn-primary">Apply</button>
                    <button type="button" className="as-btn-ghost" onClick={() => setShowDls(false)}>Cancel</button>
                  </div>
                </form>
              )}
            </>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div className="glass p-4">
              <div className="text-[12px]" style={{ color: 'var(--text-2)' }}>{match.teamAName}</div>
              <div className="text-[22px] font-semibold tabular-nums">{match.innings1.runs}/{match.innings1.wickets}</div>
              <div className="text-[12px]" style={{ color: 'var(--text-2)' }}>
                ({Math.floor(match.innings1.balls / 6)}.{match.innings1.balls % 6} ov)
              </div>
            </div>
            <div className="glass p-4 text-right">
              <div className="text-[12px]" style={{ color: 'var(--text-2)' }}>{match.teamBName}</div>
              <div className="text-[22px] font-semibold tabular-nums">
                {match.innings >= 2 || match.status === 'completed' ? (
                  <>{match.innings2.runs}/{match.innings2.wickets}</>
                ) : (
                  <span style={{ color: 'var(--text-2)' }}>—</span>
                )}
              </div>
              {(match.innings >= 2 || match.status === 'completed') && (
                <div className="text-[12px]" style={{ color: 'var(--text-2)' }}>
                  ({Math.floor(match.innings2.balls / 6)}.{match.innings2.balls % 6} ov)
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </AppShell>
  );
}
