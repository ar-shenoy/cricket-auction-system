import React, { useEffect, useState, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import api from '../services/api';
import AppShell from '../components/AppShell';

interface Batter { name: string; runs: number; balls: number; fours: number; sixes: number; status: string; dismissalText?: string | null; fallScore?: number | null; fallOvers?: string | null; }
interface Bowler { name: string; balls: number; runs: number; wickets: number; maidens: number; overs?: string; figures?: string; }
interface MatchDisplay {
  battingName: string; bowlingName: string; score: string; overs: string; crr: string; rrr: string | null; target: number | null; ballsLeft: number | null;
  thisOver: string[]; freeHit?: boolean; inPowerplay?: boolean; powerplayOvers?: number; striker?: string | null; nonStriker?: string | null; bowler?: string | null;
  battingCard?: Batter[]; bowlingCard?: Bowler[]; fallOfWickets?: { name: string; score: number; overs: string; text?: string }[];
  rainDelay?: boolean; superOver?: boolean; revisedOvers?: number | null;
}
interface Match {
  id: string; name: string; teamAName: string; teamBName: string; squadA?: string[]; squadB?: string[]; oversLimit: number; innings: number;
  battingSide: 'A' | 'B'; status: string; innings1: any; innings2: any; result?: string | null; display?: MatchDisplay;
}

const DISMISSALS = [
  { id: 'bowled', label: 'Bowled', needsFielder: false },
  { id: 'caught', label: 'Caught', needsFielder: true },
  { id: 'caught_and_bowled', label: 'Caught & bowled', needsFielder: false },
  { id: 'lbw', label: 'LBW', needsFielder: false },
  { id: 'run_out', label: 'Run out', needsFielder: true },
  { id: 'stumped', label: 'Stumped', needsFielder: true },
  { id: 'hit_wicket', label: 'Hit wicket', needsFielder: false },
  { id: 'retired_hurt', label: 'Retired hurt', needsFielder: false }
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
  const [fielder, setFielder] = useState('');
  const [showDls, setShowDls] = useState(false);
  const [dlsOvers, setDlsOvers] = useState('15');
  const [dlsTarget, setDlsTarget] = useState('');
  const [strikerIn, setStrikerIn] = useState('');
  const [nonStrikerIn, setNonStrikerIn] = useState('');
  const [bowlerIn, setBowlerIn] = useState('');
  const [form, setForm] = useState({ teamAName: '', teamBName: '', oversLimit: '20', powerplayOvers: '6', battingFirst: 'A', name: '', squadA: '', squadB: '' });

  const load = useCallback(async () => {
    try {
      const res = await api.get('/matches');
      setMatches(res.data);
      if (match?.id) {
        const current = res.data.find((m: Match) => m.id === match.id);
        if (current) setMatch(current);
      } else {
        const live = res.data.find((m: Match) => ['live', 'rain_delay', 'super_over', 'innings_break'].includes(m.status));
        if (live) setMatch(live);
      }
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, [match?.id]);

  useEffect(() => { load(); const t = setInterval(load, 8000); return () => clearInterval(t); }, [load]);
  useEffect(() => {
    if (!match?.display) return;
    setStrikerIn(match.display.striker || '');
    setNonStrikerIn(match.display.nonStriker || '');
    setBowlerIn(match.display.bowler || '');
  }, [match?.id, match?.innings, match?.display?.striker, match?.display?.nonStriker, match?.display?.bowler]);

  const flash = (t: string) => { setMsg(t); setTimeout(() => setMsg(null), 2800); };
  const isAdmin = user?.role === 'admin' || user?.role === 'developer';
  const d = match?.display;
  const battingSquad = match ? (match.battingSide === 'A' ? match.squadA : match.squadB) || [] : [];
  const bowlingSquad = match ? (match.battingSide === 'A' ? match.squadB : match.squadA) || [] : [];

  const createMatch = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await api.post('/matches', { name: form.name || undefined, teamAName: form.teamAName, teamBName: form.teamBName, oversLimit: Number(form.oversLimit) || 20, powerplayOvers: Number(form.powerplayOvers) || 6, battingFirst: form.battingFirst, squadA: form.squadA, squadB: form.squadB });
      setMatch(res.data); setShowCreate(false); flash('Match started — set openers & bowler'); load();
    } catch (err: any) { alert(err.response?.data?.error || 'Failed'); }
  };

  const savePersonnel = async () => {
    if (!match) return;
    try {
      const res = await api.post(`/matches/${match.id}/personnel`, { striker: strikerIn, nonStriker: nonStrikerIn, bowler: bowlerIn });
      setMatch(res.data); flash('Personnel set');
    } catch (err: any) { flash(err.response?.data?.error || 'Failed'); }
  };

  const swapStrike = async () => {
    if (!match) return;
    try { const res = await api.post(`/matches/${match.id}/personnel`, { swapStrike: true }); setMatch(res.data); }
    catch (err: any) { flash(err.response?.data?.error || 'Failed'); }
  };

  const sendEvent = async (type: string, extra?: Record<string, any>) => {
    if (!match) return;
    try {
      const res = await api.post(`/matches/${match.id}/event`, { type, ...extra });
      setMatch(res.data);
      flash(extra?.dismissal ? `Wicket — ${String(extra.dismissal).replace(/_/g, ' ')}` : type);
    } catch (err: any) { flash(err.response?.data?.error || 'Event failed'); }
  };

  const undo = async () => {
    if (!match) return;
    try { const res = await api.post(`/matches/${match.id}/undo`); setMatch(res.data); flash('Undone'); }
    catch (err: any) { flash(err.response?.data?.error || 'Undo failed'); }
  };

  const endInnings = async () => {
    if (!match) return;
    if (!confirm(match.innings === 1 ? 'End innings 1 and set chase target?' : 'End match and compute result?')) return;
    try { const res = await api.post(`/matches/${match.id}/end-innings`); setMatch(res.data); flash(match.innings === 1 ? 'Chase begins' : 'Match completed'); load(); }
    catch (err: any) { flash(err.response?.data?.error || 'Failed'); }
  };

  const setStatus = async (status: string) => {
    if (!match) return;
    try { const res = await api.post(`/matches/${match.id}/status`, { status }); setMatch(res.data); flash(status.replace(/_/g, ' ')); }
    catch (err: any) { flash(err.response?.data?.error || 'Failed'); }
  };

  const applyDls = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!match) return;
    try {
      const body: any = { revisedOvers: Number(dlsOvers) };
      if (dlsTarget) body.dlsTarget = Number(dlsTarget);
      const res = await api.post(`/matches/${match.id}/dls`, body);
      setMatch(res.data); setShowDls(false); flash('D/L applied');
    } catch (err: any) { flash(err.response?.data?.error || 'Failed'); }
  };

  const startSuperOver = async () => {
    if (!match) return;
    if (!confirm('Start Super Over?')) return;
    try { const res = await api.post(`/matches/${match.id}/super-over`, { battingFirst: 'A' }); setMatch(res.data); flash('Super Over'); }
    catch (err: any) { flash(err.response?.data?.error || 'Failed'); }
  };

  const needsFielder = DISMISSALS.find(x => x.id === dismissal)?.needsFielder;

  if (loading) return <AppShell title="Scoring"><div className="glass p-10 text-center" style={{ color: 'var(--text-2)' }}>Loading…</div></AppShell>;

  return (
    <AppShell title="Scoring" subtitle="Ball-by-ball scorecard" actions={isAdmin ? <button type="button" className="as-btn-primary text-sm" onClick={() => setShowCreate(true)}>New match</button> : null}>
      {msg && <div className="glass p-3 mb-3 text-[14px] font-medium" style={{ color: 'var(--accent)' }}>{msg}</div>}

      {showCreate && (
        <form onSubmit={createMatch} className="glass p-5 mb-4 space-y-3 max-w-xl">
          <div className="font-semibold">Create match</div>
          <input className="as-input" placeholder="Match name (optional)" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
          <div className="grid grid-cols-2 gap-2">
            <input className="as-input" placeholder="Team A" required value={form.teamAName} onChange={e => setForm({ ...form, teamAName: e.target.value })} />
            <input className="as-input" placeholder="Team B" required value={form.teamBName} onChange={e => setForm({ ...form, teamBName: e.target.value })} />
          </div>
          <div><label className="as-label">Squad A (comma-separated)</label><input className="as-input" placeholder="Rohit, Kohli, …" value={form.squadA} onChange={e => setForm({ ...form, squadA: e.target.value })} /></div>
          <div><label className="as-label">Squad B (comma-separated)</label><input className="as-input" placeholder="Babar, Rizwan, …" value={form.squadB} onChange={e => setForm({ ...form, squadB: e.target.value })} /></div>
          <div className="grid grid-cols-3 gap-2">
            <div><label className="as-label">Overs</label><input className="as-input" value={form.oversLimit} onChange={e => setForm({ ...form, oversLimit: e.target.value })} /></div>
            <div><label className="as-label">Powerplay</label><input className="as-input" value={form.powerplayOvers} onChange={e => setForm({ ...form, powerplayOvers: e.target.value })} /></div>
            <div><label className="as-label">Bat first</label><select className="as-input" value={form.battingFirst} onChange={e => setForm({ ...form, battingFirst: e.target.value })}><option value="A">Team A</option><option value="B">Team B</option></select></div>
          </div>
          <div className="flex gap-2"><button type="submit" className="as-btn-primary">Start</button><button type="button" className="as-btn-ghost" onClick={() => setShowCreate(false)}>Cancel</button></div>
        </form>
      )}

      {matches.length > 0 && (
        <div className="flex gap-2 overflow-x-auto pb-2 mb-3">
          {matches.slice(0, 12).map(m => (
            <button key={m.id} type="button" onClick={() => setMatch(m)} className="glass-island text-[12px] whitespace-nowrap" style={match?.id === m.id ? { background: 'var(--accent)', color: '#fff' } : undefined}>{m.teamAName} vs {m.teamBName} · {m.status}</button>
          ))}
        </div>
      )}

      {!match && <div className="glass p-10 text-center" style={{ color: 'var(--text-2)' }}>No live match. Create one to score.</div>}

      {match && (
        <div className="space-y-3.5">
          <div className="flex flex-wrap gap-2 items-center">
            <span className="glass-island text-[12px] capitalize">{match.status.replace(/_/g, ' ')}</span>
            {d?.inPowerplay && <span className="glass-island text-[12px]" style={{ background: 'rgba(48,209,88,0.2)', color: '#30d158' }}>Powerplay</span>}
            {d?.freeHit && <span className="glass-island text-[12px]" style={{ background: 'rgba(255,159,10,0.25)', color: '#ff9f0a' }}>FREE HIT</span>}
            {d?.superOver && <span className="glass-island text-[12px]" style={{ color: 'var(--accent)' }}>Super Over</span>}
            {match.result && <span className="text-[13px] font-medium" style={{ color: '#30d158' }}>{match.result}</span>}
            <a href="/scoreboard" target="_blank" rel="noreferrer" className="as-btn-ghost text-sm ml-auto">Projector</a>
          </div>

          <div className="glass p-5">
            <div className="text-[13px]" style={{ color: 'var(--text-2)' }}>{d?.battingName} batting · vs {d?.bowlingName}</div>
            <div className="text-[40px] font-semibold tabular-nums leading-none mt-1">{d?.score}</div>
            <div className="flex flex-wrap gap-4 mt-3 text-[13px]" style={{ color: 'var(--text-2)' }}>
              <span>Overs {d?.overs}</span><span>CRR {d?.crr}</span>
              {d?.target != null && <span className="font-semibold" style={{ color: 'var(--accent)' }}>Target {d.target}</span>}
              {d?.rrr && <span>RRR {d.rrr}</span>}
              {d?.ballsLeft != null && <span>{d.ballsLeft} balls left</span>}
            </div>
            <div className="mt-3 text-[13px]">
              <span style={{ color: 'var(--text-2)' }}>Striker </span><strong>{d?.striker || '—'}</strong>
              <span style={{ color: 'var(--text-2)' }}> · Non-striker </span><strong>{d?.nonStriker || '—'}</strong>
              <span style={{ color: 'var(--text-2)' }}> · Bowler </span><strong>{d?.bowler || '—'}</strong>
            </div>
            <div className="flex flex-wrap gap-1.5 mt-3">
              <span className="text-[12px] self-center" style={{ color: 'var(--text-2)' }}>This over</span>
              {(d?.thisOver || []).map((b, i) => (
                <span key={i} className="w-8 h-8 rounded-full flex items-center justify-center text-[11px] font-bold" style={{ background: b === 'W' || String(b).startsWith('W') ? '#ff3b30' : b === '6' ? '#0a84ff' : b === '4' ? '#30d158' : 'var(--fill)', color: b === 'W' || String(b).startsWith('W') || b === '6' || b === '4' ? '#fff' : 'var(--text)' }}>{b}</span>
              ))}
            </div>
          </div>

          {isAdmin && match.status !== 'completed' && match.status !== 'abandoned' && (
            <>
              <div className="glass p-4 space-y-2">
                <div className="text-[12px] font-medium uppercase" style={{ color: 'var(--text-2)' }}>On strike / bowling</div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <div><label className="as-label">Striker</label><input className="as-input" list="squad-bat" value={strikerIn} onChange={e => setStrikerIn(e.target.value)} placeholder="Name" /></div>
                  <div><label className="as-label">Non-striker</label><input className="as-input" list="squad-bat" value={nonStrikerIn} onChange={e => setNonStrikerIn(e.target.value)} placeholder="Name" /></div>
                  <div><label className="as-label">Bowler</label><input className="as-input" list="squad-bowl" value={bowlerIn} onChange={e => setBowlerIn(e.target.value)} placeholder="Name" /></div>
                </div>
                <datalist id="squad-bat">{battingSquad.map(n => <option key={n} value={n} />)}</datalist>
                <datalist id="squad-bowl">{bowlingSquad.map(n => <option key={n} value={n} />)}</datalist>
                <div className="flex gap-2">
                  <button type="button" className="as-btn-primary text-sm" onClick={savePersonnel}>Set players</button>
                  <button type="button" className="as-btn-ghost text-sm" onClick={swapStrike}>Swap strike</button>
                </div>
              </div>

              <div className="glass p-4 space-y-3">
                <div className="text-[12px] font-medium uppercase" style={{ color: 'var(--text-2)' }}>Runs (off the bat)</div>
                <div className="grid grid-cols-4 sm:grid-cols-7 gap-2">
                  {[0, 1, 2, 3].map(n => <button key={n} type="button" className={btn} style={{ background: 'var(--fill)' }} onClick={() => sendEvent('run', { runs: n })}>{n}</button>)}
                  <button type="button" className={btn} style={{ background: '#30d158', color: '#fff' }} onClick={() => sendEvent('four')}>4</button>
                  <button type="button" className={btn} style={{ background: '#0a84ff', color: '#fff' }} onClick={() => sendEvent('six')}>6</button>
                  <button type="button" className={btn} style={{ background: '#ff3b30', color: '#fff' }} onClick={() => setShowWicket(true)}>Wicket</button>
                </div>
                <div className="text-[12px] font-medium uppercase pt-1" style={{ color: 'var(--text-2)' }}>Extras & other</div>
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
                  <div className="font-semibold text-[14px]">Dismissal</div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    {DISMISSALS.map(d0 => (
                      <button key={d0.id} type="button" className={btn} style={{ background: dismissal === d0.id ? 'var(--accent)' : 'var(--fill)', color: dismissal === d0.id ? '#fff' : 'var(--text)' }} onClick={() => setDismissal(d0.id)}>{d0.label}</button>
                    ))}
                  </div>
                  {needsFielder && (<div><label className="as-label">Fielder / keeper</label><input className="as-input" list="squad-bowl" value={fielder} onChange={e => setFielder(e.target.value)} placeholder="Catch / run-out fielder" /></div>)}
                  {d?.freeHit && dismissal !== 'run_out' && <div className="text-[12px]" style={{ color: '#ff9f0a' }}>Free hit: only run-out can dismiss</div>}
                  <div className="flex gap-2">
                    <button type="button" className="as-btn-primary" onClick={() => { sendEvent('wicket', { dismissal, fielder: fielder || undefined, bowler: bowlerIn || undefined }); setShowWicket(false); setFielder(''); }}>Confirm wicket</button>
                    <button type="button" className="as-btn-ghost" onClick={() => setShowWicket(false)}>Cancel</button>
                  </div>
                </div>
              )}

              <div className="glass p-4 flex flex-wrap gap-2">
                <button type="button" className="as-btn-ghost text-sm" onClick={undo}>Undo last</button>
                <button type="button" className="as-btn-ghost text-sm" onClick={endInnings}>{match.innings === 1 ? 'End innings' : 'End match'}</button>
                {(match.status === 'live' || match.status === 'super_over') && <button type="button" className="as-btn-ghost text-sm" onClick={() => setStatus('rain_delay')}>Rain delay</button>}
                {match.status === 'rain_delay' && <button type="button" className="as-btn-primary text-sm" onClick={() => setStatus('live')}>Resume</button>}
                <button type="button" className="as-btn-ghost text-sm" onClick={() => setShowDls(true)}>D/L reduce overs</button>
                <button type="button" className="as-btn-ghost text-sm" onClick={() => setStatus('no_result')}>No result</button>
                <button type="button" className="as-btn-ghost text-sm" onClick={() => setStatus('abandoned')}>Abandon</button>
                <button type="button" className="as-btn-ghost text-sm" onClick={startSuperOver}>Super over</button>
              </div>

              {showDls && (
                <form onSubmit={applyDls} className="glass p-4 space-y-3 max-w-md">
                  <div className="font-semibold">Revised overs / D/L target</div>
                  <input className="as-input" value={dlsOvers} onChange={e => setDlsOvers(e.target.value)} placeholder="Revised overs" />
                  <input className="as-input" value={dlsTarget} onChange={e => setDlsTarget(e.target.value)} placeholder="Target (optional)" />
                  <div className="flex gap-2"><button type="submit" className="as-btn-primary">Apply</button><button type="button" className="as-btn-ghost" onClick={() => setShowDls(false)}>Cancel</button></div>
                </form>
              )}
            </>
          )}

          <div className="glass p-4 overflow-x-auto">
            <div className="font-semibold text-[14px] mb-2">Batting — {d?.battingName}</div>
            <table className="w-full text-[13px]">
              <thead><tr style={{ color: 'var(--text-2)' }}><th className="text-left py-1 font-medium">Batter</th><th className="text-left py-1 font-medium">Dismissal</th><th className="text-right py-1 font-medium">R</th><th className="text-right py-1 font-medium">B</th><th className="text-right py-1 font-medium">4s</th><th className="text-right py-1 font-medium">6s</th></tr></thead>
              <tbody>
                {(d?.battingCard || []).map(b => (
                  <tr key={b.name} style={{ borderTop: '0.5px solid var(--separator)' }}>
                    <td className="py-1.5 font-medium">{b.name}{b.status === 'batting' ? ' *' : ''}</td>
                    <td className="py-1.5" style={{ color: 'var(--text-2)' }}>{b.dismissalText || (b.status === 'not_out' ? 'not out' : b.status === 'batting' ? 'batting' : '—')}</td>
                    <td className="py-1.5 text-right tabular-nums">{b.runs}</td>
                    <td className="py-1.5 text-right tabular-nums">{b.balls}</td>
                    <td className="py-1.5 text-right tabular-nums">{b.fours}</td>
                    <td className="py-1.5 text-right tabular-nums">{b.sixes}</td>
                  </tr>
                ))}
                {(d?.battingCard || []).length === 0 && <tr><td colSpan={6} className="py-3 text-center" style={{ color: 'var(--text-2)' }}>Set openers to start the card</td></tr>}
              </tbody>
            </table>
            {(d?.fallOfWickets || []).length > 0 && (
              <div className="mt-3 text-[12px]" style={{ color: 'var(--text-2)' }}>
                <span className="font-medium">Fall of wickets: </span>
                {d!.fallOfWickets!.map((f, i) => <span key={i}>{i > 0 ? ' · ' : ''}{f.score}/{i + 1} ({f.name}, {f.overs} ov)</span>)}
              </div>
            )}
          </div>

          <div className="glass p-4 overflow-x-auto">
            <div className="font-semibold text-[14px] mb-2">Bowling — {d?.bowlingName}</div>
            <table className="w-full text-[13px]">
              <thead><tr style={{ color: 'var(--text-2)' }}><th className="text-left py-1 font-medium">Bowler</th><th className="text-right py-1 font-medium">O</th><th className="text-right py-1 font-medium">M</th><th className="text-right py-1 font-medium">R</th><th className="text-right py-1 font-medium">W</th><th className="text-right py-1 font-medium">Figures</th></tr></thead>
              <tbody>
                {(d?.bowlingCard || []).map(b => (
                  <tr key={b.name} style={{ borderTop: '0.5px solid var(--separator)' }}>
                    <td className="py-1.5 font-medium">{b.name}{d?.bowler === b.name ? ' *' : ''}</td>
                    <td className="py-1.5 text-right tabular-nums">{b.overs || `${Math.floor(b.balls / 6)}.${b.balls % 6}`}</td>
                    <td className="py-1.5 text-right tabular-nums">{b.maidens}</td>
                    <td className="py-1.5 text-right tabular-nums">{b.runs}</td>
                    <td className="py-1.5 text-right tabular-nums">{b.wickets}</td>
                    <td className="py-1.5 text-right tabular-nums font-medium">{b.figures}</td>
                  </tr>
                ))}
                {(d?.bowlingCard || []).length === 0 && <tr><td colSpan={6} className="py-3 text-center" style={{ color: 'var(--text-2)' }}>Set bowler to start figures</td></tr>}
              </tbody>
            </table>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="glass p-4"><div className="text-[12px]" style={{ color: 'var(--text-2)' }}>{match.teamAName}</div><div className="text-[22px] font-semibold tabular-nums">{match.innings1.runs}/{match.innings1.wickets}</div></div>
            <div className="glass p-4 text-right"><div className="text-[12px]" style={{ color: 'var(--text-2)' }}>{match.teamBName}</div><div className="text-[22px] font-semibold tabular-nums">{match.innings >= 2 || match.status === 'completed' ? `${match.innings2.runs}/${match.innings2.wickets}` : '—'}</div></div>
          </div>
        </div>
      )}
    </AppShell>
  );
}
