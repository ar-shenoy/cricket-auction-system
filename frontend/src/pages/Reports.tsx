import React, { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import api from '../services/api';
import AppShell from '../components/AppShell';

interface Team {
  id: string;
  name: string;
  purse: number;
  remainingPurse: number;
  logoUrl?: string;
}

interface Player {
  id: string;
  name: string;
  role: string;
  status: string;
  basePrice: number;
  city?: string;
  photoUrl?: string;
}

interface SoldRecord {
  id: string;
  playerId: string;
  teamId: string;
  soldPrice: number;
  soldAt: string;
  player?: Player;
  team?: Team;
}

export default function Reports() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin' || user?.role === 'developer';
  const [teams, setTeams] = useState<Team[]>([]);
  const [sold, setSold] = useState<SoldRecord[]>([]);
  const [players, setPlayers] = useState<Player[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'summary' | 'sold' | 'squads' | 'unsold' | 'session' | 'owner'>('summary');
  const [sessionReport, setSessionReport] = useState<any>(null);
  const [auctionId, setAuctionId] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      try {
        const [teamsRes, playersRes, auctionsRes] = await Promise.all([
          api.get('/teams'),
          api.get('/players'),
          api.get('/auctions')
        ]);
        setTeams(teamsRes.data || []);
        setPlayers(playersRes.data || []);
        const auctions = auctionsRes.data || [];
        if (auctions.length > 0) {
          const target =
            auctions.find((a: any) => a.status === 'live' || a.status === 'paused') ||
            auctions.sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0];
          if (target) {
            setAuctionId(target.id);
            const soldRes = await api.get(`/auctions/${target.id}/sold`);
            setSold(soldRes.data || []);
            try {
              const rep = await api.get(`/auctions/${target.id}/report`);
              setSessionReport(rep.data);
            } catch { /* report optional */ }
          }
        }
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const totalSpent = sold.reduce((sum, s) => sum + (s.soldPrice || 0), 0);
  const soldCount = sold.length;
  const unsoldPlayers = players.filter(p => p.status === 'Unsold' || (p as any).auctionStatus === 'Unsold');
  const approvedLeft = players.filter(p => p.status === 'Approved');

  const squads = teams.map(team => {
    const teamSold = sold.filter(s => s.teamId === team.id);
    return {
      team,
      players: teamSold,
      spent: teamSold.reduce((sum, s) => sum + s.soldPrice, 0),
      count: teamSold.length
    };
  });

  const exportCSV = (rows: string[][], filename: string) => {
    const csvContent = rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
  };

  const exportSold = () => {
    const headers = ['Player', 'Role', 'Team', 'Sold Price', 'Sold At'];
    const rows = sold.map(s => [
      s.player?.name || '',
      s.player?.role || '',
      s.team?.name || '',
      String(s.soldPrice),
      s.soldAt ? new Date(s.soldAt).toLocaleString() : ''
    ]);
    exportCSV([headers, ...rows], 'sold-players.csv');
  };

  const exportSquads = () => {
    const headers = ['Team', 'Player', 'Role', 'Sold Price'];
    const rows: string[][] = [];
    squads.forEach(sq => {
      sq.players.forEach(p => {
        rows.push([sq.team.name, p.player?.name || '', p.player?.role || '', String(p.soldPrice)]);
      });
    });
    exportCSV([headers, ...rows], 'team-squads.csv');
  };

  const exportSessionReport = () => {
    if (!sessionReport) return;
    const rows: string[][] = [
      ['Summary', 'Auction', sessionReport.auction?.name || ''],
      ['Summary', 'Status', sessionReport.auction?.status || ''],
      ['Summary', 'Sold', String(sessionReport.summary?.soldCount ?? '')],
      ['Summary', 'Unsold', String(sessionReport.summary?.unsoldCount ?? '')],
      ['Summary', 'Total spend', String(sessionReport.summary?.totalSpend ?? '')],
      ['Summary', 'Avg price', String(sessionReport.summary?.avgPrice ?? '')],
      ['Summary', 'Median', String(sessionReport.summary?.medianPrice ?? '')],
      [],
      ['Sold', 'Player', 'Role', 'Team', 'Price', 'At'],
      ...(sessionReport.sold || []).map((s: any) => [
        'Sold', s.playerName || '', s.role || '', s.teamName || '', String(s.soldPrice || 0), s.soldAt || ''
      ]),
      [],
      ['Team spend', 'Team', 'Players', 'Spent', 'Remaining'],
      ...(sessionReport.teamSpend || []).map((t: any) => [
        'Team', t.teamName || '', String(t.players ?? ''), String(t.spent ?? ''), String(t.remaining ?? '')
      ]),
      [],
      ['Role averages', 'Role', 'Count', 'Total', 'Avg'],
      ...(sessionReport.roleAverages || []).map((x: any) => [
        'Role', x.role || '', String(x.count ?? ''), String(x.total ?? ''), String(x.avg ?? '')
      ]),
      [],
      ['Unsold', 'Name', 'Role', 'Base'],
      ...(sessionReport.unsold || []).map((u: any) => [
        'Unsold', u.name || '', u.role || '', String(u.basePrice ?? '')
      ]),
      [],
      ['Purse audit', 'At', 'Type', 'Team', 'Player', 'Amount', 'Before', 'After', 'By'],
      ...((sessionReport.purseLog || sessionReport.auction?.purseLog || []) as any[]).map((p: any) => [
        'Purse', p.at || '', p.type || '', p.teamName || '', p.playerName || '',
        String(p.amount ?? ''), String(p.remainingPurseBefore ?? ''), String(p.remainingPurseAfter ?? ''), p.by || ''
      ])
    ];
    exportCSV(rows, `auction-session-report-${sessionReport.auction?.id || 'export'}.csv`);
  };

  const exportOwnerPack = (teamId: string) => {
    const team = teams.find(t => t.id === teamId);
    if (!team) return;
    const buys = sold.filter(s => s.teamId === teamId);
    const rows: string[][] = [
      ['Team', team.name],
      ['Purse', String(team.purse)],
      ['Remaining', String(team.remainingPurse)],
      ['Players', String(buys.length)],
      [],
      ['Player', 'Role', 'Price', 'Sold At'],
      ...buys.map(s => [
        s.player?.name || '',
        s.player?.role || '',
        String(s.soldPrice),
        s.soldAt ? new Date(s.soldAt).toLocaleString() : ''
      ])
    ];
    exportCSV(rows, `owner-pack-${team.name.replace(/\s+/g, '-')}.csv`);
  };

  if (loading) {
    return (
      <AppShell title="Reports">
        <div className="glass p-10 text-center" style={{ color: 'var(--text-2)' }}>Loading reports…</div>
      </AppShell>
    );
  }

  const tabs = [
    { key: 'summary' as const, label: 'Summary' },
    { key: 'sold' as const, label: `Sold (${soldCount})` },
    { key: 'squads' as const, label: 'Team Squads' },
    { key: 'unsold' as const, label: `Unsold (${unsoldPlayers.length})` },
    { key: 'session' as const, label: 'Session report' },
    { key: 'owner' as const, label: 'Owner packs' }
  ];

  return (
    <AppShell title="Reports">
      <div className="flex flex-wrap gap-2 mb-6">
        {tabs.map(tab => (
          <button
            key={tab.key}
            type="button"
            onClick={() => setActiveTab(tab.key)}
            className="px-4 py-2 rounded-full text-[13px] font-medium transition"
            style={
              activeTab === tab.key
                ? { background: 'var(--accent)', color: '#fff' }
                : { background: 'var(--fill)', color: 'var(--text)' }
            }
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'summary' && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: 'Players Sold', v: soldCount },
              { label: 'Total Spent', v: `₹${totalSpent.toLocaleString()}` },
              { label: 'Unsold', v: unsoldPlayers.length },
              { label: 'Still Available', v: approvedLeft.length }
            ].map(c => (
              <div key={c.label} className="glass p-5 text-center">
                <div className="text-[28px] font-semibold" style={{ color: 'var(--text)' }}>{c.v}</div>
                <div className="text-[13px] mt-1" style={{ color: 'var(--text-2)' }}>{c.label}</div>
              </div>
            ))}
          </div>
          <div className="glass overflow-hidden">
            <div className="px-4 pt-4 pb-2 font-semibold text-[17px]">Team spend</div>
            <table>
              <thead>
                <tr>
                  <th>Team</th>
                  <th>Players</th>
                  <th>Spent</th>
                  <th>Remaining</th>
                  <th>Util%</th>
                </tr>
              </thead>
              <tbody>
                {squads.map(sq => {
                  const util = sq.team.purse > 0 ? Math.round((sq.spent / sq.team.purse) * 100) : 0;
                  return (
                    <tr key={sq.team.id}>
                      <td>
                        <span className="inline-flex items-center gap-2 font-medium">
                          {sq.team.logoUrl && <img src={sq.team.logoUrl} alt="" className="w-6 h-6 rounded-full object-cover" />}
                          {sq.team.name}
                        </span>
                      </td>
                      <td>{sq.count}</td>
                      <td style={{ color: '#ff3b30' }}>₹{sq.spent.toLocaleString()}</td>
                      <td style={{ color: '#30d158' }}>₹{sq.team.remainingPurse.toLocaleString()}</td>
                      <td style={{ color: 'var(--text-2)' }}>{util}%</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeTab === 'sold' && (
        <div className="glass overflow-hidden">
          <div className="px-4 py-3 flex flex-wrap justify-between items-center gap-2">
            <h3 className="font-semibold text-[17px]">Sold players</h3>
            <div className="flex gap-2">
              <button type="button" onClick={exportSold} className="as-btn-ghost text-sm !py-1.5">Export CSV</button>
              <button type="button" onClick={() => window.print()} className="as-btn-ghost text-sm !py-1.5">Print</button>
            </div>
          </div>
          {sold.length === 0 ? (
            <div className="p-8 text-center text-[14px]" style={{ color: 'var(--text-2)' }}>No players sold yet.</div>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>#</th>
                  <th>Player</th>
                  <th>Role</th>
                  <th>Team</th>
                  <th>Price</th>
                  <th>Time</th>
                </tr>
              </thead>
              <tbody>
                {sold.map((s, i) => (
                  <tr key={s.id}>
                    <td style={{ color: 'var(--text-2)' }}>{i + 1}</td>
                    <td>
                      <span className="inline-flex items-center gap-2 font-medium">
                        {s.player?.photoUrl && <img src={s.player.photoUrl} alt="" className="w-7 h-7 rounded-full object-cover" />}
                        {s.player?.name || '—'}
                      </span>
                    </td>
                    <td>{s.player?.role || '—'}</td>
                    <td>{s.team?.name || '—'}</td>
                    <td style={{ color: '#30d158' }}>₹{s.soldPrice.toLocaleString()}</td>
                    <td className="text-[12px]" style={{ color: 'var(--text-2)' }}>
                      {s.soldAt ? new Date(s.soldAt).toLocaleString() : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {activeTab === 'squads' && (
        <div className="space-y-3">
          <div className="flex justify-end">
            <button type="button" onClick={exportSquads} className="as-btn-ghost text-sm">Export squads CSV</button>
          </div>
          {squads.map(sq => (
            <div key={sq.team.id} className="glass overflow-hidden">
              <div className="px-4 py-3 flex items-center gap-2" style={{ borderBottom: '0.5px solid var(--separator)' }}>
                {sq.team.logoUrl ? <img src={sq.team.logoUrl} alt="" className="w-8 h-8 rounded-full object-cover" /> : <span>🏏</span>}
                <div>
                  <div className="font-semibold">{sq.team.name}</div>
                  <div className="text-[13px]" style={{ color: 'var(--text-2)' }}>
                    {sq.count} players · Spent ₹{sq.spent.toLocaleString()} · Left ₹{sq.team.remainingPurse.toLocaleString()}
                  </div>
                </div>
              </div>
              {sq.players.length === 0 ? (
                <div className="p-4 text-[14px]" style={{ color: 'var(--text-2)' }}>No players bought yet.</div>
              ) : (
                <table>
                  <thead>
                    <tr>
                      <th>Player</th>
                      <th>Role</th>
                      <th>Price</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sq.players.map(p => (
                      <tr key={p.id}>
                        <td className="font-medium">{p.player?.name}</td>
                        <td>{p.player?.role}</td>
                        <td style={{ color: '#30d158' }}>₹{p.soldPrice.toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          ))}
        </div>
      )}

      {activeTab === 'unsold' && (
        <div className="glass overflow-hidden">
          <div className="px-4 py-3 font-semibold text-[17px]">Unsold players</div>
          {unsoldPlayers.length === 0 ? (
            <div className="p-8 text-center text-[14px]" style={{ color: 'var(--text-2)' }}>No unsold players.</div>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Role</th>
                  <th>Base</th>
                  <th>City</th>
                </tr>
              </thead>
              <tbody>
                {unsoldPlayers.map(p => (
                  <tr key={p.id}>
                    <td className="font-medium">{p.name}</td>
                    <td>{p.role}</td>
                    <td>₹{(p.basePrice || 0).toLocaleString()}</td>
                    <td style={{ color: 'var(--text-2)' }}>{p.city || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {activeTab === 'session' && (
        <div className="space-y-4">
          <div className="flex flex-wrap justify-between items-center gap-2">
            <div className="text-[14px]" style={{ color: 'var(--text-2)' }}>
              {sessionReport?.auction && (
                <>
                  {sessionReport.auction.name} · {sessionReport.auction.status}
                  {sessionReport.auction.pauseReason ? ` · paused: ${sessionReport.auction.pauseReason}` : ''}
                </>
              )}
            </div>
            <button type="button" className="as-btn-primary text-sm" onClick={exportSessionReport} disabled={!sessionReport}>
              Export session CSV
            </button>
          </div>
          {!sessionReport && (
            <div className="glass p-8 text-center text-[14px]" style={{ color: 'var(--text-2)' }}>
              No session report yet. Sell some players, then refresh.
            </div>
          )}
          {sessionReport && (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {[
                  { l: 'Sold', v: String(sessionReport.summary?.soldCount ?? 0) },
                  { l: 'Unsold', v: String(sessionReport.summary?.unsoldCount ?? 0) },
                  { l: 'Total spend', v: `₹${Number(sessionReport.summary?.totalSpend || 0).toLocaleString('en-IN')}` },
                  { l: 'Avg / median', v: `₹${Number(sessionReport.summary?.avgPrice || 0).toLocaleString('en-IN')} / ₹${Number(sessionReport.summary?.medianPrice || 0).toLocaleString('en-IN')}` }
                ].map(c => (
                  <div key={c.l} className="glass p-4 text-center">
                    <div className="text-[20px] font-semibold">{c.v}</div>
                    <div className="text-[12px] mt-1" style={{ color: 'var(--text-2)' }}>{c.l}</div>
                  </div>
                ))}
              </div>
              <div className="glass overflow-hidden">
                <div className="px-4 pt-3 pb-2 font-semibold">Team spend</div>
                <table>
                  <thead><tr><th>Team</th><th>Players</th><th>Spent</th><th>Left</th></tr></thead>
                  <tbody>
                    {(sessionReport.teamSpend || []).map((t: any) => (
                      <tr key={t.teamId}>
                        <td className="font-medium">{t.teamName}</td>
                        <td>{t.players}</td>
                        <td style={{ color: '#ff3b30' }}>₹{Number(t.spent || 0).toLocaleString()}</td>
                        <td style={{ color: '#30d158' }}>₹{Number(t.remaining || 0).toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="glass overflow-hidden">
                <div className="px-4 pt-3 pb-2 font-semibold">Role averages</div>
                <table>
                  <thead><tr><th>Role</th><th>Count</th><th>Total</th><th>Avg</th></tr></thead>
                  <tbody>
                    {(sessionReport.roleAverages || []).map((x: any) => (
                      <tr key={x.role}>
                        <td>{x.role}</td>
                        <td>{x.count}</td>
                        <td>₹{Number(x.total || 0).toLocaleString()}</td>
                        <td>₹{Number(x.avg || 0).toLocaleString()}</td>
                      </tr>
                    ))}
                    {(sessionReport.roleAverages || []).length === 0 && (
                      <tr><td colSpan={4} style={{ color: 'var(--text-2)' }}>No data</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
              {((sessionReport.purseLog || sessionReport.auction?.purseLog || []) as any[]).length > 0 && (
                <div className="glass p-4">
                  <div className="font-semibold mb-2">Purse audit</div>
                  <div className="space-y-1 text-[13px] max-h-64 overflow-y-auto">
                    {((sessionReport.purseLog || sessionReport.auction?.purseLog || []) as any[]).slice().reverse().map((p: any, i: number) => (
                      <div key={i} style={{ color: 'var(--text-2)' }}>
                        {p.at ? new Date(p.at).toLocaleString() : '—'} · <b style={{ color: 'var(--text)' }}>{p.type}</b>
                        {p.teamName ? ` · ${p.teamName}` : ''}{p.playerName ? ` · ${p.playerName}` : ''}
                        {p.amount != null ? ` · ₹${Number(p.amount).toLocaleString()}` : ''}
                        {p.by ? ` · by ${p.by}` : ''}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {activeTab === 'owner' && (
        <div className="space-y-3">
          <p className="text-[14px]" style={{ color: 'var(--text-2)' }}>
            One-pager export per franchise: buys + spend. Handy for team owners after the auction.
          </p>
          {squads.map(sq => (
            <div key={sq.team.id} className="glass p-4 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                {sq.team.logoUrl && <img src={sq.team.logoUrl} alt="" className="w-8 h-8 rounded-full object-cover" />}
                <div>
                  <div className="font-semibold">{sq.team.name}</div>
                  <div className="text-[13px]" style={{ color: 'var(--text-2)' }}>
                    {sq.count} players · ₹{sq.spent.toLocaleString()} spent · ₹{sq.team.remainingPurse.toLocaleString()} left
                  </div>
                </div>
              </div>
              <button type="button" className="as-btn-ghost text-sm" onClick={() => exportOwnerPack(sq.team.id)}>
                Export owner pack CSV
              </button>
            </div>
          ))}
        </div>
      )}
    </AppShell>
  );
}
