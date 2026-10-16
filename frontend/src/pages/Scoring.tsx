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
  innings1: { runs: number; wickets: number; balls: number };
  innings2: { runs: number; wickets: number; balls: number };
  display?: MatchDisplay;
}

export default function Scoring() {
  const { user } = useAuth();
  const [matches, setMatches] = useState<Match[]>([]);
  const [match, setMatch] = useState<Match | null>(null);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ teamAName: '', teamBName: '', oversLimit: '20', battingFirst: 'A', name: '' });

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
      alert(err.response?.data?.error || 'Failed');
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
    if (!confirm(match.innings === 1 ? 'End 1st innings?' : 'End match?')) return;
    try {
      const res = await api.post(`/matches/${match.id}/end-innings`);
      setMatch(res.data);
      flash(match.innings === 1 ? '2nd innings' : 'Completed');
      load();
    } catch (err: any) {
      alert(err.response?.data?.error || 'Failed');
    }
  };

  const btn = 'min-h-[52px] min-w-[52px] rounded-2xl text-lg font-bold active:scale-95 transition';

  if (loading) {
    return (
      <AppShell title="Live Scoring">
        <div className="glass p-10 text-center" style={{ color: 'var(--text-2)' }}>Loading…</div>
      </AppShell>
    );
  }

  const d = match?.display;

  return (
    <AppShell title="Live Scoring">
      {msg && (
        <div className="glass-island mb-4" style={{ color: 'var(--accent)' }}>{msg}</div>
      )}

      <div className="flex flex-wrap gap-2 items-center mb-4">
        <select className="as-input w-auto" value={match?.id || ''} onChange={e => setMatch(matches.find(x => x.id === e.target.value) || null)}>
          <option value="">Select match…</option>
          {matches.map(m => (
            <option key={m.id} value={m.id}>{m.name} ({m.status})</option>
          ))}
        </select>
        <button type="button" onClick={() => setShowCreate(true)} className="as-btn-primary text-sm">+ New match</button>
        <a href="/scoreboard" target="_blank" rel="noreferrer" className="as-btn-ghost text-sm">Projector board</a>
      </div>

      {!match && (
        <div className="glass p-10 text-center text-[14px]" style={{ color: 'var(--text-2)' }}>Create or select a match to start scoring.</div>
      )}

      {match && (
        <>
          <div className="glass p-5 mb-4">
            <div className="flex flex-wrap justify-between gap-2 mb-3">
              <div>
                <div className="text-[12px] uppercase tracking-wide" style={{ color: 'var(--text-2)' }}>
                  {match.status === 'completed' ? 'Completed' : `Innings ${match.innings}`} · {match.oversLimit} overs
                </div>
                <div className="text-[28px] font-semibold" style={{ color: 'var(--text)' }}>{d?.battingName || '—'}</div>
              </div>
              <div className="text-right">
                <div className="text-[40px] font-semibold tabular-nums" style={{ color: 'var(--accent)' }}>{d?.score || '0/0'}</div>
                <div className="text-[15px]" style={{ color: 'var(--text-2)' }}>({d?.overs || '0.0'} ov) · CRR {d?.crr}</div>
              </div>
            </div>
            {d?.target != null && (
              <div className="text-[13px] rounded-2xl px-3 py-2 mb-2" style={{ background: 'rgba(255,159,10,0.15)', color: '#ff9f0a' }}>
                Target {d.target}{d.rrr != null && ` · RRR ${d.rrr}`}{d.ballsLeft != null && ` · ${d.ballsLeft} balls left`}
              </div>
            )}
            <div className="flex flex-wrap gap-1.5 mt-2">
              <span className="text-[12px] self-center" style={{ color: 'var(--text-2)' }}>This over:</span>
              {(d?.thisOver || []).length === 0 && <span className="text-[12px]" style={{ color: 'var(--text-3)' }}>—</span>}
              {(d?.thisOver || []).map((b, i) => (
                <span key={i} className="px-2 py-0.5 rounded-lg text-[12px] font-bold"
                  style={b === 'W' ? { background: '#ff3b30', color: '#fff' } : b === '4' || b === '6' ? { background: '#30d158', color: '#fff' } : { background: 'var(--fill)', color: 'var(--text)' }}
                >{b}</span>
              ))}
            </div>
          </div>

          {match.status !== 'completed' && (
            <div className="glass p-4 space-y-4">
              <div>
                <div className="text-[12px] font-medium mb-2" style={{ color: 'var(--text-2)' }}>RUNS</div>
                <div className="flex flex-wrap gap-2">
                  {[{ t: 'dot', l: '•' }, { t: '1', l: '1' }, { t: '2', l: '2' }, { t: '3', l: '3' }, { t: '4', l: '4' }, { t: '6', l: '6' }].map(b => (
                    <button key={b.t} type="button" onClick={() => sendEvent(b.t)} className={btn}
                      style={b.t === '4' || b.t === '6' ? { background: b.t === '6' ? 'var(--accent)' : '#30d158', color: '#fff' } : { background: 'var(--fill)', color: 'var(--text)' }}
                    >{b.l}</button>
                  ))}
                </div>
              </div>
              <div>
                <div className="text-[12px] font-medium mb-2" style={{ color: 'var(--text-2)' }}>WICKET & EXTRAS</div>
                <div className="flex flex-wrap gap-2">
                  <button type="button" onClick={() => sendEvent('wicket')} className={`${btn} px-4`} style={{ background: '#ff3b30', color: '#fff' }}>Wicket</button>
                  <button type="button" onClick={() => sendEvent('wide')} className={`${btn} px-3`} style={{ background: '#ff9f0a', color: '#fff' }}>Wide</button>
                  <button type="button" onClick={() => sendEvent('noball')} className={`${btn} px-3`} style={{ background: '#ff9f0a', color: '#fff' }}>Nb</button>
                  <button type="button" onClick={() => sendEvent('bye', 1)} className={`${btn} px-3`} style={{ background: '#bf5af2', color: '#fff' }}>Bye</button>
                  <button type="button" onClick={() => sendEvent('legbye', 1)} className={`${btn} px-3`} style={{ background: '#bf5af2', color: '#fff' }}>LB</button>
                </div>
              </div>
              <div className="flex flex-wrap gap-2 pt-2" style={{ borderTop: '0.5px solid var(--separator)' }}>
                <button type="button" onClick={undo} className="as-btn-ghost">Undo</button>
                <button type="button" onClick={endInnings} className="as-btn-primary">{match.innings === 1 ? 'End innings' : 'End match'}</button>
              </div>
            </div>
          )}
        </>
      )}

      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.35)', backdropFilter: 'blur(12px)' }}>
          <div className="glass-thick max-w-md w-full p-6">
            <h2 className="text-[20px] font-semibold mb-4">New match</h2>
            <form onSubmit={createMatch} className="space-y-3">
              <div><label className="as-label">Team A *</label><input required value={form.teamAName} onChange={e => setForm({ ...form, teamAName: e.target.value })} className="as-input" /></div>
              <div><label className="as-label">Team B *</label><input required value={form.teamBName} onChange={e => setForm({ ...form, teamBName: e.target.value })} className="as-input" /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="as-label">Overs</label><input type="number" min={1} value={form.oversLimit} onChange={e => setForm({ ...form, oversLimit: e.target.value })} className="as-input" /></div>
                <div>
                  <label className="as-label">Bat first</label>
                  <select value={form.battingFirst} onChange={e => setForm({ ...form, battingFirst: e.target.value })} className="as-input">
                    <option value="A">Team A</option>
                    <option value="B">Team B</option>
                  </select>
                </div>
              </div>
              <div className="flex gap-2 pt-2">
                <button type="submit" className="as-btn-primary flex-1">Start</button>
                <button type="button" onClick={() => setShowCreate(false)} className="as-btn-ghost flex-1">Cancel</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </AppShell>
  );
}
