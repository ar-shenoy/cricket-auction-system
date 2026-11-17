import React, { useEffect, useState, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import api from '../services/api';
import AppShell from '../components/AppShell';

interface MatchDisplay {
  battingName: string; bowlingName: string; score: string; overs: string; crr: string; rrr: string | null;
  target: number | null; ballsLeft: number | null; thisOver: string[]; freeHit?: boolean; inPowerplay?: boolean;
  striker?: string | null; nonStriker?: string | null; bowler?: string | null;
}
interface Match {
  id: string; name: string; teamAName: string; teamBName: string; squadA?: string[]; squadB?: string[]; oversLimit: number; innings: number;
  status: string; battingSide: string; powerplayOvers?: number;
  innings1: any; innings2: any; display?: MatchDisplay; result?: string | null;
}

export default function Scoring() {
  const { user } = useAuth();
  const [matches, setMatches] = useState<Match[]>([]);
  const [match, setMatch] = useState<Match | null>(null);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
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
      const res = await api.put(`/matches/${match.id}/personnel`, { striker: strikerIn, nonStriker: nonStrikerIn, bowler: bowlerIn });
      setMatch(res.data); flash('Personnel saved');
    } catch (err: any) { alert(err.response?.data?.error || 'Failed'); }
  };

  const ball = async (payload: any) => {
    if (!match) return;
    try {
      const res = await api.post(`/matches/${match.id}/ball`, payload);
      setMatch(res.data);
    } catch (err: any) { alert(err.response?.data?.error || 'Ball failed'); }
  };

  if (loading) return <AppShell title="Scoring"><div className="glass p-8 text-center" style={{ color: 'var(--text-2)' }}>Loading…</div></AppShell>;

  return (
    <AppShell title="Scoring" subtitle="Live match control">
      {msg && <div className="glass p-3 mb-3 text-[13px]" style={{ color: 'var(--accent)' }}>{msg}</div>}
      <div className="flex flex-wrap gap-2 mb-4">
        {isAdmin && <button type="button" className="as-btn-primary text-sm" onClick={() => setShowCreate(v => !v)}>{showCreate ? 'Cancel' : '+ New match'}</button>}
        {matches.map(m => (
          <button key={m.id} type="button" onClick={() => setMatch(m)} className="glass-island text-[12px] whitespace-nowrap" style={match?.id === m.id ? { background: 'var(--accent)', color: '#fff' } : undefined}>{m.teamAName} vs {m.teamBName} · {m.status}</button>
        ))}
      </div>
      {showCreate && isAdmin && (
        <form onSubmit={createMatch} className="glass p-4 mb-4 space-y-3 max-w-xl">
          <div className="font-semibold">New match</div>
          <input className="as-input" placeholder="Match name (optional)" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
          <div className="grid grid-cols-2 gap-2">
            <input className="as-input" placeholder="Team A" required value={form.teamAName} onChange={e => setForm({ ...form, teamAName: e.target.value })} />
            <input className="as-input" placeholder="Team B" required value={form.teamBName} onChange={e => setForm({ ...form, teamBName: e.target.value })} />
          </div>
          <div><label className="as-label">Squad A (comma-separated)</label><input className="as-input" placeholder="Rohit, Kohli, …" value={form.squadA} onChange={e => setForm({ ...form, squadA: e.target.value })} /></div>
          <div><label className="as-label">Squad B (comma-separated)</label><input className="as-input" placeholder="Babar, Rizwan, …" value={form.squadB} onChange={e => setForm({ ...form, squadB: e.target.value })} /></div>
          <div className="grid grid-cols-3 gap-2">
            <input className="as-input" type="number" placeholder="Overs" value={form.oversLimit} onChange={e => setForm({ ...form, oversLimit: e.target.value })} />
            <input className="as-input" type="number" placeholder="PP overs" value={form.powerplayOvers} onChange={e => setForm({ ...form, powerplayOvers: e.target.value })} />
            <select className="as-input" value={form.battingFirst} onChange={e => setForm({ ...form, battingFirst: e.target.value })}><option value="A">A bats first</option><option value="B">B bats first</option></select>
          </div>
          <button type="submit" className="as-btn-primary">Create & go live</button>
        </form>
      )}
      {!match && <div className="glass p-8 text-center" style={{ color: 'var(--text-2)' }}>No match selected. Create one to start scoring.</div>}
      {match && (
        <div className="space-y-4">
          <div className="glass p-4">
            <div className="text-[13px]" style={{ color: 'var(--text-2)' }}>{match.name || 'Match'} · {match.status}</div>
            <div className="text-2xl font-semibold mt-1">{d?.battingName} {d?.score} ({d?.overs})</div>
            <div className="text-[13px] mt-1" style={{ color: 'var(--text-2)' }}>CRR {d?.crr}{d?.rrr ? ` · RRR ${d.rrr}` : ''}{d?.target != null ? ` · Target ${d.target}` : ''}</div>
            <div className="flex flex-wrap gap-1 mt-2">{(d?.thisOver || []).map((b, i) => <span key={i} className="glass-island text-[12px] tabular-nums">{b}</span>)}</div>
          </div>
          {isAdmin && match.status !== 'completed' && (
            <>
              <div className="glass p-4 space-y-2">
                <div className="font-semibold text-[14px]">Openers & bowler</div>
                <div className="grid sm:grid-cols-3 gap-2">
                  <div><label className="as-label">Striker</label><input className="as-input" list="squad-bat" value={strikerIn} onChange={e => setStrikerIn(e.target.value)} placeholder="Name" /></div>
                  <div><label className="as-label">Non-striker</label><input className="as-input" list="squad-bat" value={nonStrikerIn} onChange={e => setNonStrikerIn(e.target.value)} placeholder="Name" /></div>
                  <div><label className="as-label">Bowler</label><input className="as-input" list="squad-bowl" value={bowlerIn} onChange={e => setBowlerIn(e.target.value)} placeholder="Name" /></div>
                </div>
                <datalist id="squad-bat">{battingSquad.map(n => <option key={n} value={n} />)}</datalist>
                <datalist id="squad-bowl">{bowlingSquad.map(n => <option key={n} value={n} />)}</datalist>
                <button type="button" className="as-btn-ghost text-sm" onClick={savePersonnel}>Save personnel</button>
              </div>
              <div className="glass p-4">
                <div className="font-semibold text-[14px] mb-2">Ball</div>
                <div className="flex flex-wrap gap-2">
                  {[0, 1, 2, 3, 4, 6].map(r => (
                    <button key={r} type="button" className="as-btn-primary text-sm min-w-[3rem]" onClick={() => ball({ runs: r })}>{r}</button>
                  ))}
                  <button type="button" className="as-btn-ghost text-sm" onClick={() => ball({ runs: 0, isWide: true })}>Wide</button>
                  <button type="button" className="as-btn-ghost text-sm" onClick={() => ball({ runs: 0, isNoBall: true })}>No-ball</button>
                  <button type="button" className="as-btn-ghost text-sm" style={{ color: '#ff3b30' }} onClick={() => ball({ runs: 0, isWicket: true, wicketType: 'bowled' })}>Wicket</button>
                </div>
              </div>
            </>
          )}
        </div>
      )}
    </AppShell>
  );
}
