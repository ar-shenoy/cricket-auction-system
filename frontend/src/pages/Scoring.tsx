import React, { useEffect, useState, useCallback, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import api from '../services/api';
import AppShell from '../components/AppShell';

interface MatchDisplay {
  battingName: string; bowlingName: string; score: string; overs: string; crr: string;
  rrr: string | null; target: number | null; ballsLeft: number | null; thisOver: string[];
  freeHit?: boolean; inPowerplay?: boolean; striker?: string | null; nonStriker?: string | null; bowler?: string | null;
}
interface Match {
  id: string; name: string; teamAName: string; teamBName: string; squadA?: string[]; squadB?: string[];
  oversLimit: number; innings: number; status: string; battingSide: string; powerplayOvers?: number;
  innings1: any; innings2: any; display?: MatchDisplay; result?: string | null; published?: boolean;
}

const DISMISSALS = ['bowled','caught','lbw','run_out','stumped','hit_wicket','retired_hurt','obstructing'];

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
  const [strikerIn, setStrikerIn] = useState('');
  const [nonStrikerIn, setNonStrikerIn] = useState('');
  const [bowlerIn, setBowlerIn] = useState('');
  const [form, setForm] = useState({ teamAName: '', teamBName: '', oversLimit: '20', powerplayOvers: '6', battingFirst: 'A', name: '', squadA: '', squadB: '' });
  const [auctionTeams, setAuctionTeams] = useState<{ id: string; name: string }[]>([]);
  const [soldByTeam, setSoldByTeam] = useState<Record<string, string[]>>({});
  const [importTeamA, setImportTeamA] = useState('');
  const [importTeamB, setImportTeamB] = useState('');
  const [bigTap, setBigTap] = useState(false);
  const [commentary, setCommentary] = useState('');
  const squadCsvARef = useRef<HTMLInputElement>(null);
  const squadCsvBRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    try {
      const res = await api.get('/matches');
      setMatches(res.data || []);
      if (match?.id) {
        const current = (res.data || []).find((m: Match) => m.id === match.id);
        if (current) setMatch(current);
      } else {
        const live = (res.data || []).find((m: Match) => ['live', 'rain_delay', 'super_over', 'innings_break'].includes(m.status));
        if (live) setMatch(live);
      }
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, [match?.id]);

  useEffect(() => { load(); const t = setInterval(load, 10000); return () => clearInterval(t); }, [load]);

  useEffect(() => {
    if (!match?.display) return;
    setStrikerIn(match.display.striker || '');
    setNonStrikerIn(match.display.nonStriker || '');
    setBowlerIn(match.display.bowler || '');
  }, [match?.id, match?.innings, match?.display?.striker, match?.display?.nonStriker, match?.display?.bowler]);

  useEffect(() => {
    if (!showCreate) return;
    (async () => {
      try {
        const teamsRes = await api.get('/teams');
        setAuctionTeams((teamsRes.data || []).map((t: any) => ({ id: t.id, name: t.name })));
        let soldRows: any[] = [];
        try {
          const active = await api.get('/auctions/active');
          if (active.data?.id) {
            const sold = await api.get(`/auctions/${active.data.id}/sold`);
            soldRows = sold.data || [];
          }
        } catch { /* no auction */ }
        const map: Record<string, string[]> = {};
        soldRows.forEach((row: any) => {
          const tid = row.teamId || row.team?.id;
          const name = row.player?.name || row.playerName || row.name;
          if (!tid || !name) return;
          if (!map[tid]) map[tid] = [];
          map[tid].push(name);
        });
        setSoldByTeam(map);
      } catch (e) { console.error(e); }
    })();
  }, [showCreate]);

  // Keyboard shortcuts (power users)
  useEffect(() => {
    if (!match || match.status === 'completed') return;
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      const k = e.key.toLowerCase();
      if (k >= '0' && k <= '6') {
        e.preventDefault();
        if (k === '0') sendEvent('run', { runs: 0 });
        else if (k === '4') sendEvent('four');
        else if (k === '6') sendEvent('six');
        else sendEvent('run', { runs: Number(k) });
      } else if (k === 'w') { e.preventDefault(); setShowWicket(true); }
      else if (k === 'x') { e.preventDefault(); sendEvent('wide'); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [match?.id, match?.status]);

  const flash = (t: string) => { setMsg(t); setTimeout(() => setMsg(null), 2800); };
  const isAdmin = user?.role === 'admin' || user?.role === 'developer';
  const d = match?.display;
  const battingSquad = match ? ((match.battingSide === 'A' ? match.squadA : match.squadB) || []) : [];
  const bowlingSquad = match ? ((match.battingSide === 'A' ? match.squadB : match.squadA) || []) : [];
  const btn = bigTap
    ? 'min-h-[72px] min-w-[72px] rounded-2xl text-xl font-bold active:scale-95 transition'
    : 'min-h-[52px] min-w-[52px] rounded-2xl text-lg font-bold active:scale-95 transition';

  const parseSquadCsv = (text: string): string[] => {
    const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    if (!lines.length) return [];
    const first = lines[0].toLowerCase();
    const start = /name|player/.test(first) ? 1 : 0;
    const names: string[] = [];
    for (let i = start; i < lines.length; i++) {
      const cols = lines[i].split(',').map(c => c.trim().replace(/^"|"$/g, ''));
      const name = cols.find(c => c && !/^\d+$/.test(c)) || cols[0];
      if (name) names.push(name);
    }
    return names;
  };

  const onSquadCsv = (side: 'A' | 'B') => async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const names = parseSquadCsv(await file.text());
    if (side === 'A') setForm(f => ({ ...f, squadA: names.join(', ') }));
    else setForm(f => ({ ...f, squadB: names.join(', ') }));
    e.target.value = '';
  };

  const createMatch = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await api.post('/matches', {
        name: form.name || undefined, teamAName: form.teamAName, teamBName: form.teamBName,
        oversLimit: Number(form.oversLimit) || 20, powerplayOvers: Number(form.powerplayOvers) || 6,
        battingFirst: form.battingFirst, squadA: form.squadA, squadB: form.squadB
      });
      setMatch(res.data); setShowCreate(false); flash('Match started'); load();
    } catch (err: any) { alert(err.response?.data?.error || 'Failed to create match'); }
  };

  const savePersonnel = async () => {
    if (!match) return;
    try {
      const res = await api.post(`/matches/${match.id}/personnel`, { striker: strikerIn, nonStriker: nonStrikerIn, bowler: bowlerIn });
      setMatch(res.data); flash('Personnel saved');
    } catch (err: any) { alert(err.response?.data?.error || 'Failed'); }
  };

  const sendEvent = async (type: string, extra?: Record<string, any>) => {
    if (!match) return;
    try {
      const payload: any = { type, ...extra };
      if (commentary.trim()) { payload.commentary = commentary.trim(); setCommentary(''); }
      const res = await api.post(`/matches/${match.id}/event`, payload);
      setMatch(res.data);
      if (type === 'wicket') setShowWicket(false);
    } catch (err: any) { alert(err.response?.data?.error || 'Ball failed'); }
  };

  const undo = async () => {
    if (!match) return;
    try { const res = await api.post(`/matches/${match.id}/undo`); setMatch(res.data); flash('Undone'); }
    catch (err: any) { alert(err.response?.data?.error || 'Undo failed'); }
  };

  const endInnings = async () => {
    if (!match || !confirm('End current innings?')) return;
    try { const res = await api.post(`/matches/${match.id}/end-innings`); setMatch(res.data); flash('Innings ended'); }
    catch (err: any) { alert(err.response?.data?.error || 'Failed'); }
  };

  const completeMatch = async () => {
    if (!match || !confirm('Mark match completed?')) return;
    try { const res = await api.post(`/matches/${match.id}/complete`, {}); setMatch(res.data); flash('Match completed'); load(); }
    catch (err: any) { alert(err.response?.data?.error || 'Failed'); }
  };

  const publishResult = async () => {
    if (!match) return;
    try {
      const res = await api.post(`/matches/${match.id}/publish`);
      setMatch(res.data);
      flash('Result published — points table updated');
      load();
    } catch (err: any) {
      alert(err.response?.data?.error || 'Publish failed');
    }
  };

  if (loading) return <AppShell title="Scoring"><div className="glass p-8 text-center" style={{ color: 'var(--text-2)' }}>Loading…</div></AppShell>;

  return (
    <AppShell title="Scoring" subtitle="Live match control · ball-by-ball">
      {msg && <div className="glass p-3 mb-3 text-[13px]" style={{ color: 'var(--accent)' }}>{msg}</div>}

      <div className="flex flex-wrap gap-2 mb-4">
        {isAdmin && (
          <button type="button" className="as-btn-primary text-sm" onClick={() => setShowCreate(v => !v)}>
            {showCreate ? 'Cancel' : '+ New match'}
          </button>
        )}
        <button type="button" onClick={() => setBigTap(b => !b)} className="as-btn-ghost text-sm">
          {bigTap ? 'Normal buttons' : 'Big-tap mode'}
        </button>
        {matches.map(m => (
          <button key={m.id} type="button" onClick={() => setMatch(m)} className="glass-island text-[12px] whitespace-nowrap"
            style={match?.id === m.id ? { background: 'var(--accent)', color: '#fff' } : undefined}>
            {m.teamAName} vs {m.teamBName} · {m.status}
          </button>
        ))}
      </div>

      {showCreate && isAdmin && (
        <form onSubmit={createMatch} className="glass p-4 mb-4 space-y-3 max-w-2xl">
          <div className="font-semibold">New match</div>
          <input className="as-input" placeholder="Match name (optional)" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
          <div className="grid grid-cols-2 gap-2">
            <input className="as-input" placeholder="Team A name" required value={form.teamAName} onChange={e => setForm({ ...form, teamAName: e.target.value })} />
            <input className="as-input" placeholder="Team B name" required value={form.teamBName} onChange={e => setForm({ ...form, teamBName: e.target.value })} />
          </div>
          <div>
            <label className="as-label">Squad A (comma-separated or CSV)</label>
            <div className="flex gap-2">
              <input className="as-input flex-1" placeholder="Rohit, Kohli, …" value={form.squadA} onChange={e => setForm({ ...form, squadA: e.target.value })} />
              <button type="button" className="as-btn-ghost text-sm shrink-0" onClick={() => squadCsvARef.current?.click()}>CSV</button>
              <input ref={squadCsvARef} type="file" accept=".csv,text/csv" className="hidden" onChange={onSquadCsv('A')} />
            </div>
          </div>
          <div>
            <label className="as-label">Squad B</label>
            <div className="flex gap-2">
              <input className="as-input flex-1" placeholder="Babar, Rizwan, …" value={form.squadB} onChange={e => setForm({ ...form, squadB: e.target.value })} />
              <button type="button" className="as-btn-ghost text-sm shrink-0" onClick={() => squadCsvBRef.current?.click()}>CSV</button>
              <input ref={squadCsvBRef} type="file" accept=".csv,text/csv" className="hidden" onChange={onSquadCsv('B')} />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <input className="as-input" type="number" placeholder="Overs" value={form.oversLimit} onChange={e => setForm({ ...form, oversLimit: e.target.value })} />
            <input className="as-input" type="number" placeholder="PP overs" value={form.powerplayOvers} onChange={e => setForm({ ...form, powerplayOvers: e.target.value })} />
            <select className="as-input" value={form.battingFirst} onChange={e => setForm({ ...form, battingFirst: e.target.value })}>
              <option value="A">A bats first</option>
              <option value="B">B bats first</option>
            </select>
          </div>
          <button type="submit" className="as-btn-primary">Create & go live</button>
        </form>
      )}

      {!match && <div className="glass p-8 text-center" style={{ color: 'var(--text-2)' }}>No match selected.</div>}

      {match && (
        <div className="space-y-4">
          <div className="glass p-4">
            <div className="text-[13px]" style={{ color: 'var(--text-2)' }}>
              {match.name || 'Match'} · {match.status}
              {d?.freeHit ? ' · FREE HIT' : ''}
              {d?.inPowerplay ? ' · POWERPLAY' : ''}
            </div>
            <div className="text-2xl font-semibold mt-1">{d?.battingName || match.teamAName} {d?.score || '0/0'} ({d?.overs || '0.0'})</div>
            <div className="text-[13px] mt-1" style={{ color: 'var(--text-2)' }}>
              CRR {d?.crr || '—'}{d?.rrr != null ? ` · RRR ${d.rrr}` : ''}{d?.target != null ? ` · Target ${d.target}` : ''}
            </div>
            <div className="flex flex-wrap gap-1 mt-2">
              {(d?.thisOver || []).map((b, i) => (
                <span key={i} className="glass-island text-[12px] tabular-nums min-w-[1.75rem] text-center">{b}</span>
              ))}
            </div>
            {match.result && <div className="mt-2 text-[14px] font-medium" style={{ color: 'var(--accent)' }}>{match.result}</div>}
            {match.status === 'completed' && !match.published && isAdmin && (
              <button type="button" onClick={publishResult} className="as-btn-primary text-sm mt-2">Publish result</button>
            )}
          </div>

          {isAdmin && !['completed', 'abandoned'].includes(match.status) && (
            <>
              <div className="glass p-4 space-y-2">
                <div className="font-semibold text-[14px]">Openers & bowler</div>
                <div className="grid sm:grid-cols-3 gap-2">
                  <div><label className="as-label">Striker</label><input className="as-input" list="squad-bat" value={strikerIn} onChange={e => setStrikerIn(e.target.value)} /></div>
                  <div><label className="as-label">Non-striker</label><input className="as-input" list="squad-bat" value={nonStrikerIn} onChange={e => setNonStrikerIn(e.target.value)} /></div>
                  <div><label className="as-label">Bowler</label><input className="as-input" list="squad-bowl" value={bowlerIn} onChange={e => setBowlerIn(e.target.value)} /></div>
                </div>
                <datalist id="squad-bat">{battingSquad.map(n => <option key={n} value={n} />)}</datalist>
                <datalist id="squad-bowl">{bowlingSquad.map(n => <option key={n} value={n} />)}</datalist>
                <button type="button" className="as-btn-ghost text-sm" onClick={savePersonnel}>Save personnel</button>
              </div>

              <div className="glass p-4">
                <div className="font-semibold text-[14px] mb-2">Ball · keys 0–6 W X</div>
                <input className="as-input mb-2" placeholder="Optional commentary line for this ball" value={commentary} onChange={e => setCommentary(e.target.value)} />
                <div className="flex flex-wrap gap-2">
                  {[0, 1, 2, 3].map(r => (
                    <button key={r} type="button" className={btn} style={{ background: 'var(--fill)' }} onClick={() => sendEvent('run', { runs: r })}>{r}</button>
                  ))}
                  <button type="button" className={btn} style={{ background: '#30d158', color: '#fff' }} onClick={() => sendEvent('four')}>4</button>
                  <button type="button" className={btn} style={{ background: '#0a84ff', color: '#fff' }} onClick={() => sendEvent('six')}>6</button>
                  <button type="button" className={btn} style={{ background: '#ff3b30', color: '#fff' }} onClick={() => setShowWicket(true)}>W</button>
                  <button type="button" className={btn} style={{ background: '#ff9f0a', color: '#fff' }} onClick={() => sendEvent('wide')}>Wd</button>
                  <button type="button" className={btn} style={{ background: '#ff9f0a', color: '#fff' }} onClick={() => sendEvent('no_ball')}>Nb</button>
                  <button type="button" className={btn} style={{ background: 'var(--fill)' }} onClick={() => sendEvent('bye', { runs: 1 })}>Bye</button>
                  <button type="button" className={btn} style={{ background: 'var(--fill)' }} onClick={() => sendEvent('legbye', { runs: 1 })}>Lb</button>
                  <button type="button" className={btn} onClick={undo}>Undo</button>
                </div>
                {showWicket && (
                  <div className="mt-3 p-3 rounded-xl space-y-2" style={{ background: 'var(--fill)' }}>
                    <select className="as-input" value={dismissal} onChange={e => setDismissal(e.target.value)}>
                      {DISMISSALS.map(x => <option key={x} value={x}>{x.replace(/_/g, ' ')}</option>)}
                    </select>
                    <input className="as-input" placeholder="Fielder" value={fielder} onChange={e => setFielder(e.target.value)} />
                    <div className="flex gap-2">
                      <button type="button" className="as-btn-primary text-sm" onClick={() => sendEvent('wicket', { dismissal, fielder: fielder || undefined })}>Confirm</button>
                      <button type="button" className="as-btn-ghost text-sm" onClick={() => setShowWicket(false)}>Cancel</button>
                    </div>
                  </div>
                )}
                <div className="flex flex-wrap gap-2 mt-3">
                  <button type="button" className="as-btn-ghost text-sm" onClick={endInnings}>End innings</button>
                  <button type="button" className="as-btn-ghost text-sm" onClick={completeMatch}>Complete match</button>
                </div>
              </div>
            </>
          )}
        </div>
      )}
    </AppShell>
  );
}
