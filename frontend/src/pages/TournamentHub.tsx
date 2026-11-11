import React, { useEffect, useState } from 'react';
import AppShell from '../components/AppShell';
import api from '../services/api';
import { Link } from 'react-router-dom';

export default function TournamentHub() {
  const [tournaments, setTournaments] = useState<any[]>([]);
  const [fixtures, setFixtures] = useState<any[]>([]);
  const [venues, setVenues] = useState<any[]>([]);
  const [teams, setTeams] = useState<any[]>([]);
  const [table, setTable] = useState<any[]>([]);
  const [msg, setMsg] = useState('');
  const [tForm, setTForm] = useState({ name: '', season: new Date().getFullYear().toString(), format: 'T20' });
  const [vForm, setVForm] = useState({ name: '', city: '' });
  const [fForm, setFForm] = useState({ teamAId: '', teamBId: '', venueId: '', scheduledAt: '', tournamentId: '' });

  const load = async () => {
    try {
      const [t, f, v, tm, s] = await Promise.all([
        api.get('/tournaments'),
        api.get('/tournaments/fixtures/list'),
        api.get('/tournaments/venues/list'),
        api.get('/teams'),
        api.get('/tournaments/standings')
      ]);
      setTournaments(t.data || []);
      setFixtures(f.data || []);
      setVenues(v.data || []);
      setTeams(tm.data || []);
      setTable(s.data?.table || []);
    } catch (e: any) {
      setMsg(e.response?.data?.error || 'Load failed');
    }
  };

  useEffect(() => { load(); }, []);

  const createTournament = async () => {
    try {
      await api.post('/tournaments', tForm);
      setMsg('Season created');
      setTForm({ name: '', season: tForm.season, format: 'T20' });
      load();
    } catch (e: any) { setMsg(e.response?.data?.error || 'Failed'); }
  };

  const createVenue = async () => {
    try {
      await api.post('/tournaments/venues', vForm);
      setVForm({ name: '', city: '' });
      load();
    } catch (e: any) { setMsg(e.response?.data?.error || 'Failed'); }
  };

  const createFixture = async () => {
    try {
      await api.post('/tournaments/fixtures', {
        ...fForm,
        tournamentId: fForm.tournamentId || tournaments[0]?.id || null
      });
      setFForm({ teamAId: '', teamBId: '', venueId: '', scheduledAt: '', tournamentId: fForm.tournamentId });
      load();
    } catch (e: any) { setMsg(e.response?.data?.error || 'Failed'); }
  };

  return (
    <AppShell title="Tournament Hub" subtitle="Seasons · fixtures · venues · standings">
      {msg && <div className="glass p-3 mb-4 text-[13px]" style={{ color: 'var(--accent)' }}>{msg}</div>}

      <div className="flex flex-wrap gap-2 mb-4">
        <a href="/tournament" target="_blank" rel="noreferrer" className="as-btn-primary text-sm">Public tournament page</a>
        <Link to="/intelligence" className="as-btn-ghost text-sm">Intelligence</Link>
        <Link to="/points" className="as-btn-ghost text-sm">Points</Link>
      </div>

      <div className="grid lg:grid-cols-2 gap-4 mb-4">
        <div className="glass p-4 space-y-3">
          <div className="font-semibold">New season</div>
          <input className="as-input" placeholder="Tournament name" value={tForm.name} onChange={e => setTForm({ ...tForm, name: e.target.value })} />
          <div className="grid grid-cols-2 gap-2">
            <input className="as-input" placeholder="Season" value={tForm.season} onChange={e => setTForm({ ...tForm, season: e.target.value })} />
            <select className="as-input" value={tForm.format} onChange={e => setTForm({ ...tForm, format: e.target.value })}>
              <option value="T20">T20</option>
              <option value="ODI">ODI</option>
              <option value="Other">Other</option>
            </select>
          </div>
          <button type="button" className="as-btn-primary text-sm" onClick={createTournament}>Create season</button>
          <div className="space-y-1 pt-2">
            {tournaments.map(t => (
              <div key={t.id} className="text-[13px] px-2 py-1.5 rounded-lg" style={{ background: 'var(--fill)' }}>
                {t.name} · {t.season} · {t.format} · {t.status}
              </div>
            ))}
          </div>
        </div>

        <div className="glass p-4 space-y-3">
          <div className="font-semibold">Venue</div>
          <input className="as-input" placeholder="Venue name" value={vForm.name} onChange={e => setVForm({ ...vForm, name: e.target.value })} />
          <input className="as-input" placeholder="City" value={vForm.city} onChange={e => setVForm({ ...vForm, city: e.target.value })} />
          <button type="button" className="as-btn-ghost text-sm" onClick={createVenue}>Add venue</button>
          <div className="flex flex-wrap gap-1.5 pt-2">
            {venues.map(v => (
              <span key={v.id} className="glass-island text-[12px]">{v.name}{v.city ? `, ${v.city}` : ''}</span>
            ))}
          </div>
        </div>
      </div>

      <div className="glass p-4 mb-4 space-y-3">
        <div className="font-semibold">Schedule fixture</div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-5 gap-2">
          <select className="as-input" value={fForm.teamAId} onChange={e => setFForm({ ...fForm, teamAId: e.target.value })}>
            <option value="">Team A</option>
            {teams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
          <select className="as-input" value={fForm.teamBId} onChange={e => setFForm({ ...fForm, teamBId: e.target.value })}>
            <option value="">Team B</option>
            {teams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
          <select className="as-input" value={fForm.venueId} onChange={e => setFForm({ ...fForm, venueId: e.target.value })}>
            <option value="">Venue</option>
            {venues.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
          </select>
          <input className="as-input" type="datetime-local" value={fForm.scheduledAt} onChange={e => setFForm({ ...fForm, scheduledAt: e.target.value })} />
          <button type="button" className="as-btn-primary text-sm" onClick={createFixture}>Add fixture</button>
        </div>
        <div className="space-y-1 max-h-48 overflow-y-auto">
          {fixtures.map(f => (
            <div key={f.id} className="text-[13px] flex justify-between gap-2 px-2 py-1.5 rounded-lg" style={{ background: 'var(--fill)' }}>
              <span>{f.teamA?.name || 'TBD'} vs {f.teamB?.name || 'TBD'}{f.venue ? ` · ${f.venue.name}` : ''}</span>
              <span className="tabular-nums shrink-0" style={{ color: 'var(--text-2)' }}>
                {f.scheduledAt ? new Date(f.scheduledAt).toLocaleString() : 'TBD'}
              </span>
            </div>
          ))}
          {fixtures.length === 0 && <div className="text-[13px] text-center py-3" style={{ color: 'var(--text-2)' }}>No fixtures yet</div>}
        </div>
      </div>

      <div className="glass overflow-hidden">
        <div className="px-4 py-3 font-semibold">Standings (auto NRR)</div>
        <table className="w-full text-[13px]">
          <thead>
            <tr style={{ color: 'var(--text-2)' }}>
              <th className="text-left px-3 py-2">#</th>
              <th className="text-left px-2 py-2">Team</th>
              <th className="text-right px-2 py-2">P</th>
              <th className="text-right px-2 py-2">W</th>
              <th className="text-right px-2 py-2">L</th>
              <th className="text-right px-2 py-2">Pts</th>
              <th className="text-right px-3 py-2">NRR</th>
            </tr>
          </thead>
          <tbody>
            {table.map(r => (
              <tr key={r.teamName} style={{ borderTop: '1px solid var(--separator)' }}>
                <td className="px-3 py-2">{r.rank}</td>
                <td className="px-2 py-2 font-medium">{r.teamName}</td>
                <td className="text-right px-2 tabular-nums">{r.played}</td>
                <td className="text-right px-2 tabular-nums">{r.won}</td>
                <td className="text-right px-2 tabular-nums">{r.lost}</td>
                <td className="text-right px-2 tabular-nums font-semibold">{r.points}</td>
                <td className="text-right px-3 tabular-nums">{r.nrr > 0 ? '+' : ''}{r.nrr}</td>
              </tr>
            ))}
            {table.length === 0 && (
              <tr><td colSpan={7} className="px-3 py-6 text-center" style={{ color: 'var(--text-2)' }}>Complete matches to populate standings</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </AppShell>
  );
}
