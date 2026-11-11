import React, { useEffect, useState } from 'react';
import AppShell from '../components/AppShell';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import { Link } from 'react-router-dom';

function inr(n: number) {
  return `₹${Number(n || 0).toLocaleString('en-IN')}`;
}

export default function FranchisePortal() {
  const { user } = useAuth();
  const [data, setData] = useState<any>(null);
  const [teams, setTeams] = useState<any[]>([]);
  const [teamId, setTeamId] = useState('');
  const [err, setErr] = useState('');

  const load = (tid?: string) => {
    const q = tid || teamId ? `?teamId=${tid || teamId}` : '';
    api.get(`/franchise/me${q}`)
      .then(r => { setData(r.data); setErr(''); })
      .catch(e => setErr(e.response?.data?.error || 'Could not load franchise'));
  };

  useEffect(() => {
    if (user?.role === 'admin' || user?.role === 'developer') {
      api.get('/teams').then(r => setTeams(r.data || []));
    }
    load();
  }, []);

  return (
    <AppShell title="Franchise Portal" subtitle={data?.team?.name || user?.name}>
      {(user?.role === 'admin' || user?.role === 'developer') && (
        <div className="glass p-3 mb-4 flex flex-wrap gap-2 items-end">
          <div className="flex-1 min-w-[160px]">
            <label className="as-label">View as team</label>
            <select className="as-input" value={teamId} onChange={e => setTeamId(e.target.value)}>
              <option value="">Select team</option>
              {teams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </div>
          <button type="button" className="as-btn-primary text-sm" onClick={() => load()}>Load</button>
        </div>
      )}

      {err && <div className="glass p-4 mb-4 text-[13px]" style={{ color: '#ff9f0a' }}>{err}</div>}

      {data && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
            {[
              { l: 'Purse left', v: inr(data.team.remainingPurse) },
              { l: 'Spent', v: inr(data.team.spent) },
              { l: 'Squad', v: String(data.team.squadSize) },
              { l: 'Cap', v: data.team.maxPlayers != null ? String(data.team.maxPlayers) : '—' }
            ].map(k => (
              <div key={k.l} className="glass p-3.5">
                <div className="text-[11px] uppercase" style={{ color: 'var(--text-2)' }}>{k.l}</div>
                <div className="text-[18px] font-semibold tabular-nums mt-1">{k.v}</div>
              </div>
            ))}
          </div>

          {data.liveAuction && (
            <div className="glass p-4 flex justify-between items-center gap-3">
              <div>
                <div className="text-[11px] uppercase" style={{ color: '#30d158' }}>Auction {data.liveAuction.status}</div>
                <div className="font-semibold">{data.liveAuction.name}</div>
              </div>
              <Link to="/auction" className="as-btn-primary text-sm">Enter room</Link>
            </div>
          )}

          <div className="glass p-4">
            <div className="font-semibold mb-2">Squad</div>
            <div className="space-y-1 max-h-72 overflow-y-auto">
              {data.squad.map((p: any) => (
                <div key={p.soldId} className="flex justify-between text-[13px] px-2.5 py-2 rounded-xl" style={{ background: 'var(--fill)' }}>
                  <span className="truncate"><span className="font-medium">{p.name}</span><span style={{ color: 'var(--text-2)' }}> · {p.role || '—'}</span></span>
                  <span className="tabular-nums shrink-0">{inr(p.soldPrice)}</span>
                </div>
              ))}
              {data.squad.length === 0 && <div className="text-center text-[13px] py-4" style={{ color: 'var(--text-2)' }}>No players bought yet</div>}
            </div>
            <div className="flex flex-wrap gap-1.5 mt-3">
              {Object.entries(data.roleMix || {}).map(([role, n]) => (
                <span key={role} className="glass-island text-[11px]">{role}: {String(n)}</span>
              ))}
            </div>
          </div>

          <div className="grid lg:grid-cols-2 gap-3">
            <div className="glass p-4">
              <div className="font-semibold mb-2">Match sheet / fixtures</div>
              <div className="space-y-1.5">
                {data.fixtures.map((f: any) => (
                  <div key={f.id} className="text-[13px] px-2 py-2 rounded-lg" style={{ background: 'var(--fill)' }}>
                    vs {f.opponentName}{f.venueName ? ` · ${f.venueName}` : ''}
                    <div className="text-[11px]" style={{ color: 'var(--text-2)' }}>
                      {f.scheduledAt ? new Date(f.scheduledAt).toLocaleString() : 'TBD'} · {f.home ? 'Home' : 'Away'}
                    </div>
                  </div>
                ))}
                {data.fixtures.length === 0 && <div className="text-[13px]" style={{ color: 'var(--text-2)' }}>No fixtures scheduled</div>}
              </div>
            </div>
            <div className="glass p-4">
              <div className="font-semibold mb-2">Recent matches</div>
              <div className="space-y-1.5">
                {data.matches.map((m: any) => (
                  <div key={m.id} className="text-[13px] px-2 py-2 rounded-lg" style={{ background: 'var(--fill)' }}>
                    {m.teamAName} vs {m.teamBName}
                    <div className="text-[11px]" style={{ color: 'var(--text-2)' }}>{m.result || m.status}</div>
                  </div>
                ))}
                {data.matches.length === 0 && <div className="text-[13px]" style={{ color: 'var(--text-2)' }}>No match history</div>}
              </div>
            </div>
          </div>

          <div className="glass p-4 text-[13px]" style={{ color: 'var(--text-2)' }}>
            <span className="font-semibold" style={{ color: 'var(--text)' }}>RTM</span> — {data.rtm?.note}
          </div>
        </div>
      )}
    </AppShell>
  );
}
