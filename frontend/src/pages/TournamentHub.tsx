import React, { useEffect, useState } from 'react';
import AppShell from '../components/AppShell';
import api from '../services/api';

export default function TournamentHub() {
  const [tournaments, setTournaments] = useState<any[]>([]);
  const [venues, setVenues] = useState<any[]>([]);
  const [fixtures, setFixtures] = useState<any[]>([]);
  const [teams, setTeams] = useState<any[]>([]);
  const [table, setTable] = useState<any[]>([]);
  const [msg, setMsg] = useState('');
  const [tForm, setTForm] = useState({ name: '', season: '' });
  const [vForm, setVForm] = useState({ name: '', city: '', capacity: '' });
  const [editingVenue, setEditingVenue] = useState<any | null>(null);
  const [fForm, setFForm] = useState({ teamAId: '', teamBId: '', venueId: '', scheduledAt: '', tournamentId: '' });

  const load = async () => {
    try {
      const [t, v, f, s, tm] = await Promise.all([
        api.get('/tournaments'),
        api.get('/tournaments/venues/list'),
        api.get('/tournaments/fixtures/list'),
        api.get('/tournaments/standings'),
        api.get('/teams')
      ]);
      setTournaments(t.data || []);
      setVenues(v.data || []);
      setFixtures(f.data || []);
      setTable(s.data?.table || []);
      setTeams(tm.data || []);
      if (!fForm.tournamentId && (t.data || [])[0]?.id) {
        setFForm(prev => ({ ...prev, tournamentId: t.data[0].id }));
      }
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => { load(); }, []);

  const flash = (m: string) => { setMsg(m); setTimeout(() => setMsg(''), 3000); };

  const createTournament = async () => {
    try {
      await api.post('/tournaments', tForm);
      setTForm({ name: '', season: '' });
      flash('Season created');
      load();
    } catch (e: any) {
      flash(e.response?.data?.error || 'Failed');
    }
  };

  const createVenue = async () => {
    try {
      if (editingVenue) {
        await api.put(`/tournaments/venues/${editingVenue.id}`, {
          name: vForm.name, city: vForm.city, capacity: vForm.capacity
        });
        flash('Venue updated');
      } else {
        await api.post('/tournaments/venues', {
          name: vForm.name, city: vForm.city,
          capacity: vForm.capacity ? Number(vForm.capacity) : null
        });
        flash('Venue added');
      }
      setVForm({ name: '', city: '', capacity: '' });
      setEditingVenue(null);
      load();
    } catch (e: any) {
      flash(e.response?.data?.error || 'Venue save failed');
    }
  };

  const editVenue = (v: any) => {
    setEditingVenue(v);
    setVForm({
      name: v.name || '',
      city: v.city || '',
      capacity: v.capacity != null ? String(v.capacity) : ''
    });
  };

  const deleteVenue = async (v: any) => {
    if (!confirm(`Delete venue "${v.name}"?`)) return;
    try {
      await api.delete(`/tournaments/venues/${v.id}`);
      if (editingVenue?.id === v.id) {
        setEditingVenue(null);
        setVForm({ name: '', city: '', capacity: '' });
      }
      flash('Venue deleted');
      load();
    } catch (e: any) {
      flash(e.response?.data?.error || 'Delete failed');
    }
  };

  const createFixture = async () => {
    try {
      await api.post('/tournaments/fixtures', fForm);
      flash('Fixture added');
      setFForm({ teamAId: '', teamBId: '', venueId: '', scheduledAt: '', tournamentId: fForm.tournamentId });
      load();
    } catch (e: any) {
      flash(e.response?.data?.error || 'Fixture failed');
    }
  };

  const deleteFixture = async (id: string) => {
    if (!confirm('Delete this fixture?')) return;
    try {
      await api.delete(`/tournaments/fixtures/${id}`);
      flash('Fixture deleted');
      load();
    } catch (e: any) {
      flash(e.response?.data?.error || 'Delete failed');
    }
  };

  return (
    <AppShell title="Tournament Hub" subtitle="Seasons · fixtures · venues · standings (ICC tournament ops)">
      {msg && <div className="glass p-3 mb-4 text-[13px]" style={{ color: 'var(--accent)' }}>{msg}</div>}

      <div className="grid lg:grid-cols-3 gap-4 mb-4">
        <div className="glass p-4 space-y-2">
          <div className="font-semibold">Season / tournament</div>
          <input className="as-input" placeholder="Name (e.g. T20 World Cup)" value={tForm.name} onChange={e => setTForm({ ...tForm, name: e.target.value })} />
          <input className="as-input" placeholder="Season (2026)" value={tForm.season} onChange={e => setTForm({ ...tForm, season: e.target.value })} />
          <button type="button" className="as-btn-primary text-sm" onClick={createTournament}>Create season</button>
          <div className="space-y-1 max-h-32 overflow-y-auto pt-2">
            {tournaments.map(t => (
              <div key={t.id} className="text-[13px] px-2 py-1.5 rounded-lg" style={{ background: 'var(--fill)' }}>
                {t.name}{t.season ? ` · ${t.season}` : ''}
              </div>
            ))}
          </div>
        </div>

        <div className="glass p-4 space-y-2">
          <div className="font-semibold flex justify-between items-center">
            <span>Venues</span>
            {editingVenue && (
              <button type="button" className="text-[12px]" style={{ color: 'var(--text-2)' }} onClick={() => { setEditingVenue(null); setVForm({ name: '', city: '', capacity: '' }); }}>Cancel edit</button>
            )}
          </div>
          <input className="as-input" placeholder="Venue name" value={vForm.name} onChange={e => setVForm({ ...vForm, name: e.target.value })} />
          <input className="as-input" placeholder="City" value={vForm.city} onChange={e => setVForm({ ...vForm, city: e.target.value })} />
          <input className="as-input" type="number" placeholder="Capacity (optional)" value={vForm.capacity} onChange={e => setVForm({ ...vForm, capacity: e.target.value })} />
          <button type="button" className="as-btn-ghost text-sm" onClick={createVenue}>{editingVenue ? 'Save venue' : 'Add venue'}</button>
          <div className="space-y-1 max-h-40 overflow-y-auto pt-1">
            {venues.map(v => (
              <div key={v.id} className="text-[13px] flex justify-between gap-2 items-center px-2 py-1.5 rounded-lg" style={{ background: 'var(--fill)' }}>
                <span className="min-w-0 truncate">
                  <span className="font-medium">{v.name}</span>
                  {v.city ? <span style={{ color: 'var(--text-2)' }}> · {v.city}</span> : null}
                  {v.capacity != null ? <span style={{ color: 'var(--text-2)' }}> · {Number(v.capacity).toLocaleString()}</span> : null}
                </span>
                <span className="shrink-0 flex gap-2">
                  <button type="button" className="text-[12px]" style={{ color: 'var(--accent)' }} onClick={() => editVenue(v)}>Edit</button>
                  <button type="button" className="text-[12px]" style={{ color: '#ff3b30' }} onClick={() => deleteVenue(v)}>Delete</button>
                </span>
              </div>
            ))}
            {venues.length === 0 && <div className="text-[13px] text-center py-2" style={{ color: 'var(--text-2)' }}>No venues</div>}
          </div>
        </div>

        <div className="glass p-4 space-y-2">
          <div className="font-semibold">Fixture</div>
          <select className="as-input" value={fForm.tournamentId} onChange={e => setFForm({ ...fForm, tournamentId: e.target.value })}>
            <option value="">Season</option>
            {tournaments.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
          <select className="as-input" value={fForm.teamAId} onChange={e => setFForm({ ...fForm, teamAId: e.target.value })}>
            <option value="">Team A</option>
            {teams.map(tm => <option key={tm.id} value={tm.id}>{tm.name}</option>)}
          </select>
          <select className="as-input" value={fForm.teamBId} onChange={e => setFForm({ ...fForm, teamBId: e.target.value })}>
            <option value="">Team B</option>
            {teams.map(tm => <option key={tm.id} value={tm.id}>{tm.name}</option>)}
          </select>
          <select className="as-input" value={fForm.venueId} onChange={e => setFForm({ ...fForm, venueId: e.target.value })}>
            <option value="">Venue</option>
            {venues.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
          </select>
          <input className="as-input" type="datetime-local" value={fForm.scheduledAt} onChange={e => setFForm({ ...fForm, scheduledAt: e.target.value })} />
          <button type="button" className="as-btn-primary text-sm" onClick={createFixture}>Add fixture</button>
        </div>
      </div>

      <div className="glass p-4 mb-4">
        <div className="font-semibold mb-2">Fixtures</div>
        <div className="space-y-1 max-h-56 overflow-y-auto">
          {fixtures.map(f => (
            <div key={f.id} className="text-[13px] flex justify-between gap-2 px-2 py-1.5 rounded-lg items-center" style={{ background: 'var(--fill)' }}>
              <span>{f.teamA?.name || 'TBD'} vs {f.teamB?.name || 'TBD'}{f.venue ? ` · ${f.venue.name}` : ''}</span>
              <span className="flex items-center gap-2 shrink-0">
                <span className="tabular-nums" style={{ color: 'var(--text-2)' }}>{f.scheduledAt ? new Date(f.scheduledAt).toLocaleString() : 'TBD'}</span>
                <button type="button" className="text-[12px]" style={{ color: '#ff3b30' }} onClick={() => deleteFixture(f.id)}>Delete</button>
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
