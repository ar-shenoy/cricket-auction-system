import React, { useEffect, useState } from 'react';
import AppShell from '../components/AppShell';
import api, { getSocketUrl } from '../services/api';
import { useAuth } from '../context/AuthContext';

export default function Health() {
  const { user } = useAuth();
  const [data, setData] = useState<any>(null);
  const [err, setErr] = useState('');
  const [pingMs, setPingMs] = useState<number | null>(null);

  const load = async () => {
    const t0 = performance.now();
    try {
      const base = getSocketUrl();
      const r = await fetch(`${base}/api/health`);
      const j = await r.json();
      setPingMs(Math.round(performance.now() - t0));
      setData(j);
      setErr('');
    } catch (e: any) {
      setErr(e.message || 'Health check failed');
    }
  };

  useEffect(() => {
    load();
    const t = setInterval(load, 15000);
    return () => clearInterval(t);
  }, []);

  if (user?.role !== 'developer' && user?.role !== 'admin') {
    return (
      <AppShell title="Health">
        <div className="glass p-8 text-center" style={{ color: 'var(--text-2)' }}>
          Developer / admin only
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell
      title="Health"
      subtitle="Keep-alive · free-tier diagnostics"
      actions={
        <button type="button" className="as-btn-ghost text-sm" onClick={load}>
          Refresh
        </button>
      }
    >
      {err && (
        <div className="glass p-4 mb-3 text-[14px]" style={{ color: '#ff3b30' }}>
          {err}
        </div>
      )}
      {data && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
          {[
            { l: 'Status', v: data.status },
            { l: 'Ping', v: pingMs != null ? `${pingMs} ms` : '—' },
            { l: 'Uptime', v: `${data.uptimeSec ?? '—'} s` },
            { l: 'Memory', v: `${data.memoryMB ?? '—'} MB` },
            { l: 'Storage', v: data.storage || '—' },
            { l: 'Teams', v: String(data.counts?.teams ?? '—') },
            { l: 'Players', v: String(data.counts?.players ?? '—') },
            { l: 'Sold', v: String(data.counts?.sold ?? '—') }
          ].map(k => (
            <div key={k.l} className="glass p-3.5">
              <div className="text-[11px] uppercase" style={{ color: 'var(--text-2)' }}>
                {k.l}
              </div>
              <div className="text-[16px] font-semibold mt-1 tabular-nums">{k.v}</div>
            </div>
          ))}
        </div>
      )}
      <p className="text-[12px] mt-4" style={{ color: 'var(--text-2)' }}>
        Client already pings <code>/api/health</code> for keep-alive. Use this page to confirm the
        free-tier process is awake before an event.
      </p>
    </AppShell>
  );
}
