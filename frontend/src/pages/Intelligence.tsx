import React, { useEffect, useState, useCallback } from 'react';
import AppShell from '../components/AppShell';
import api, { getSocketUrl } from '../services/api';
import { io, Socket } from 'socket.io-client';

function inr(n: number) {
  return `₹${Number(n || 0).toLocaleString('en-IN')}`;
}

function fmtAgo(ms: number | null) {
  if (ms == null) return '—';
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  return `${Math.floor(s / 3600)}h ago`;
}

export default function Intelligence() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [perf, setPerf] = useState<any>(null);
  const [compare, setCompare] = useState<any>(null);
  const [auctionIds, setAuctionIds] = useState<{ a: string; b: string }>({ a: '', b: '' });
  const [auctions, setAuctions] = useState<any[]>([]);

  const load = useCallback(async () => {
    try {
      const r = await api.get('/analytics/intelligence');
      setData(r.data);
      setErr('');
    } catch (e: any) {
      setErr(e.response?.data?.error || 'Failed to load intelligence');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    api.get('/auctions').then(r => setAuctions(Array.isArray(r.data) ? r.data : r.data?.auctions || [])).catch(() => {});
    load();
    const t = setInterval(load, 12000);
    let socket: Socket | null = null;
    try {
      socket = io(getSocketUrl(), { transports: ['websocket', 'polling'] });
      socket.on('player-sold', () => load());
      socket.on('auction-status', () => load());
    } catch {}
    return () => {
      clearInterval(t);
      socket?.disconnect();
    };
  }, [load]);

  const exportCsv = () => {
    if (!data?.marketValues) return;
    const rows = [['Player', 'Role', 'Team', 'Sold', 'RoleAvg', 'Premium%', 'Flag']];
    data.marketValues.forEach((m: any) => {
      rows.push([m.playerName, m.role, m.teamName, m.soldPrice, m.roleAvgPrice, m.premiumPct, m.marketFlag]);
    });
    const csv = rows.map((r: any[]) => r.map(c => `"${c}"`).join(',')).join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    a.download = 'auction-intelligence.csv';
    a.click();
  };

  return (
    <AppShell title="Intelligence" subtitle="Market values · spend efficiency · projections">
      {loading && (
        <div className="glass p-8 text-center" style={{ color: 'var(--text-2)' }}>Crunching market…</div>
      )}
      {err && !data && (
        <div className="glass p-8 text-center text-[14px]" style={{ color: '#ff3b30' }}>{err}</div>
      )}
      {data && (
        <div className="space-y-4">
          <div className="glass p-3 text-[13px]" style={{ color: 'var(--text-2)' }}>
            Flags: <span style={{ color: '#ff9f0a' }}>overpay</span> = {'>'}25% above role avg ·{' '}
            <span style={{ color: '#30d158' }}>value</span> = {'>'}25% below · live refresh on each sale
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
            {[
              { l: 'Sold', v: String(data.market?.soldCount ?? 0) },
              { l: 'Avg price', v: inr(data.market?.avgPrice) },
              { l: 'Median', v: inr(data.market?.medianPrice) },
              { l: 'Total spend', v: inr(data.market?.totalSpend) }
            ].map(k => (
              <div key={k.l} className="glass p-3.5">
                <div className="text-[11px] uppercase" style={{ color: 'var(--text-2)' }}>{k.l}</div>
                <div className="text-[18px] font-semibold tabular-nums mt-1">{k.v}</div>
              </div>
            ))}
          </div>

          {data.sinceLastSale && (
            <div className="glass p-3 flex flex-wrap gap-3 items-center text-[13px]">
              <span className="px-2 py-1 rounded-full text-[12px] font-medium" style={{ background: 'var(--fill)' }}>
                Since last sale · {fmtAgo(data.sinceLastSale.ms)}
              </span>
              {data.sinceLastSale.playerName && (
                <span style={{ color: 'var(--text-2)' }}>
                  {data.sinceLastSale.playerName} · {inr(data.sinceLastSale.price)}
                </span>
              )}
            </div>
          )}

          {data.ifEndedNow && (
            <div className="glass p-4">
              <div className="font-semibold mb-2">If auction ended now</div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[13px]">
                <div>
                  <div style={{ color: 'var(--text-2)' }}>Remaining approved</div>
                  <div className="font-semibold tabular-nums">{data.ifEndedNow.remainingApproved}</div>
                </div>
                <div>
                  <div style={{ color: 'var(--text-2)' }}>Open slots</div>
                  <div className="font-semibold tabular-nums">{data.ifEndedNow.remainingSlots}</div>
                </div>
                <div>
                  <div style={{ color: 'var(--text-2)' }}>Purse left</div>
                  <div className="font-semibold tabular-nums">{inr(data.ifEndedNow.totalRemainingPurse)}</div>
                </div>
                <div>
                  <div style={{ color: 'var(--text-2)' }}>₹ / open slot</div>
                  <div className="font-semibold tabular-nums">{inr(data.ifEndedNow.avgPursePerRemainingSlot)}</div>
                </div>
              </div>
              <p className="text-[12px] mt-2" style={{ color: 'var(--text-2)' }}>{data.ifEndedNow.note}</p>
            </div>
          )}

          <div className="glass p-4">
            <div className="font-semibold mb-3">Team spend efficiency</div>
            <div className="space-y-2 max-h-72 overflow-y-auto">
              {(data.teamEfficiency || []).map((t: any) => (
                <div key={t.teamId} className="flex flex-wrap justify-between gap-2 text-[13px] px-2.5 py-2 rounded-xl" style={{ background: 'var(--fill)' }}>
                  <span className="font-medium">{t.teamName} · {t.slotsFilled}/{t.maxPlayers} slots</span>
                  <span className="tabular-nums" style={{ color: 'var(--text-2)' }}>
                    spent {inr(t.spent)} · left {inr(t.remaining)} · ~{inr(t.budgetPerRemainingSlot)}/slot
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div className="glass p-4">
            <div className="font-semibold mb-3">Role inflation</div>
            <div className="space-y-2">
              {(data.roleInflation || []).map((r: any) => (
                <div key={r.role}>
                  <div className="flex justify-between text-[13px] mb-1">
                    <span className="font-medium">{r.role} · {r.count} sold</span>
                    <span className="tabular-nums">{inr(r.avgPrice)} · {r.vsMarket > 0 ? '+' : ''}{r.vsMarket}% vs mkt</span>
                  </div>
                  <div className="h-1.5 rounded-full" style={{ background: 'var(--fill)' }}>
                    <div className="h-full rounded-full" style={{
                      width: `${Math.min(100, Math.abs(r.vsMarket) * 2)}%`,
                      background: r.vsMarket > 0 ? '#ff9f0a' : '#30d158'
                    }} />
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="glass p-4">
            <div className="flex justify-between items-center mb-3">
              <div className="font-semibold">Player market values</div>
              <button type="button" className="as-btn-ghost text-sm" onClick={exportCsv}>Export CSV</button>
            </div>
            <div className="max-h-80 overflow-y-auto space-y-1">
              {(data.marketValues || []).map((m: any, i: number) => (
                <div key={i} className="flex justify-between gap-2 text-[13px] px-2.5 py-2 rounded-xl" style={{ background: 'var(--fill)' }}>
                  <span className="truncate">
                    <span className="font-medium">{m.playerName}</span>
                    <span style={{ color: 'var(--text-2)' }}> · {m.teamName} · {m.role}</span>
                  </span>
                  <span className="shrink-0 tabular-nums">
                    {inr(m.soldPrice)}
                    <span className="ml-2 text-[11px]" style={{
                      color: m.marketFlag === 'overpay' ? '#ff9f0a' : m.marketFlag === 'value' ? '#30d158' : 'var(--text-2)'
                    }}>{m.marketFlag}</span>
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div className="glass p-4">
            <div className="flex flex-wrap gap-2 items-center mb-3">
              <div className="font-semibold">Performance vs price</div>
              <button type="button" className="as-btn-ghost text-sm" onClick={async () => {
                try {
                  const r = await api.get('/analytics/performance-vs-price');
                  setPerf(r.data);
                } catch (e: any) { alert(e.response?.data?.error || 'Failed'); }
              }}>Load</button>
            </div>
            {perf && (
              <div className="grid md:grid-cols-2 gap-3 text-[13px]">
                <div>
                  <div className="font-medium mb-1">Batters (runs / lakh)</div>
                  {(perf.batters || []).slice(0, 10).map((b: any, i: number) => (
                    <div key={i} className="flex justify-between py-0.5">
                      <span>{b.name}</span>
                      <span className="tabular-nums">{b.runs} · {b.runsPerLakh}</span>
                    </div>
                  ))}
                </div>
                <div>
                  <div className="font-medium mb-1">Bowlers (wkts / lakh)</div>
                  {(perf.bowlers || []).slice(0, 10).map((b: any, i: number) => (
                    <div key={i} className="flex justify-between py-0.5">
                      <span>{b.name}</span>
                      <span className="tabular-nums">{b.wickets} · {b.wicketsPerLakh}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="glass p-4">
            <div className="font-semibold mb-2">Compare two auctions</div>
            <div className="flex flex-wrap gap-2 mb-2">
              <select className="as-input text-sm" value={auctionIds.a} onChange={e => setAuctionIds(x => ({ ...x, a: e.target.value }))}>
                <option value="">Auction A</option>
                {auctions.map((a: any) => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
              <select className="as-input text-sm" value={auctionIds.b} onChange={e => setAuctionIds(x => ({ ...x, b: e.target.value }))}>
                <option value="">Auction B</option>
                {auctions.map((a: any) => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
              <button type="button" className="as-btn-ghost text-sm" onClick={async () => {
                if (!auctionIds.a || !auctionIds.b) return;
                try {
                  const r = await api.get(`/analytics/compare-auctions?a=${auctionIds.a}&b=${auctionIds.b}`);
                  setCompare(r.data);
                } catch (e: any) { alert(e.response?.data?.error || 'Compare failed'); }
              }}>Compare</button>
            </div>
            {compare && (
              <div className="grid sm:grid-cols-2 gap-3 text-[13px]">
                {[compare.a, compare.b].map((x: any) => (
                  <div key={x.id} className="p-2 rounded-xl" style={{ background: 'var(--fill)' }}>
                    <div className="font-medium">{x.name}</div>
                    <div>Sold {x.soldCount} · spend {inr(x.totalSpend)} · avg {inr(x.avgPrice)}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </AppShell>
  );
}
