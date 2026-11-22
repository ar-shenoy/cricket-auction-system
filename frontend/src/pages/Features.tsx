import React, { useEffect, useState } from 'react';
import AppShell from '../components/AppShell';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';

const LABELS: Record<string, { title: string; desc: string }> = {
  players: { title: 'Players', desc: 'Player import, approval and roster management' },
  teams: { title: 'Teams', desc: 'Team creation, purse and manager accounts' },
  auction: { title: 'Auction', desc: 'Live auction room and bidding' },
  scoring: { title: 'Scoring', desc: 'Match scoring panel and scoreboard feeds' },
  reports: { title: 'Reports', desc: 'Squad reports and export tools' },
  billing: { title: 'Billing', desc: 'Plan and payment screens' },
  hub: { title: 'Tournament Hub', desc: 'Seasons, venues, fixtures, standings' },
  broadcast: { title: 'Broadcast studio', desc: 'Lower-thirds, sponsors, OBS-style controls' },
  franchise: { title: 'Franchise portal', desc: 'Team-owner view of own purse and squad' },
  intelligence: { title: 'Intelligence', desc: 'Market values, spend efficiency, projections' },
  liveTeams: { title: 'Live · show teams', desc: 'Show team purse list on the public /live page' },
  points: { title: 'Points table', desc: 'Tournament points / NRR page' },
  scoreboard: { title: 'Scoreboard', desc: 'Projector scoreboard link' }
};

export default function Features() {
  const { user } = useAuth();
  const [features, setFeatures] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');
  const [webhookUrl, setWebhookUrl] = useState('');
  const [sponsorUrls, setSponsorUrls] = useState('');
  const [sponsorRotate, setSponsorRotate] = useState('8');
  const [sheetUrl, setSheetUrl] = useState('');

  useEffect(() => {
    Promise.all([
      api.get('/orgs/features'),
      api.get('/orgs/me').catch(() => ({ data: {} })),
      api.get('/broadcast/settings').catch(() => ({ data: {} }))
    ])
      .then(([fr, me, br]) => {
        const f = fr.data.features || {};
        // Ensure new keys default ON so nav shows until developer turns them off
        const merged: Record<string, boolean> = { ...f };
        Object.keys(LABELS).forEach(k => {
          if (merged[k] === undefined) merged[k] = true;
        });
        setFeatures(merged);
        if (me.data?.soldWebhookUrl) setWebhookUrl(me.data.soldWebhookUrl);
        if (br.data?.sponsorLogos) setSponsorUrls((br.data.sponsorLogos || []).map((s: any) => s.url).join('\n'));
        if (br.data?.sponsorRotateSeconds != null) setSponsorRotate(String(br.data.sponsorRotateSeconds));
        if (br.data?.sheetSyncUrl) setSheetUrl(br.data.sheetSyncUrl);
      })
      .catch(() => setMsg('Failed to load features'))
      .finally(() => setLoading(false));
  }, []);

  const toggle = (key: string) => {
    setFeatures(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const save = async () => {
    setSaving(true);
    setMsg('');
    try {
      const r = await api.put('/orgs/features', { features });
      setFeatures(r.data.features || features);
      setMsg('Saved. Refresh other tabs to apply nav changes.');
    } catch (e: any) {
      setMsg(e.response?.data?.error || 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const exportOrg = async () => {
    try {
      const res = await api.get('/orgs/export', { responseType: 'blob' });
      const url = URL.createObjectURL(res.data);
      const a = document.createElement('a');
      a.href = url;
      a.download = `auctionscore-org-export-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      setMsg('Org backup downloaded');
    } catch (e: any) {
      setMsg(e.response?.data?.error || 'Export failed');
    }
  };

  if (user?.role !== 'developer') {
    return (
      <AppShell title="Features">
        <div className="glass p-8 text-center" style={{ color: 'var(--text-2)' }}>
          Developer only — feature toggles and platform tools are restricted to the developer role.
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell title="Feature toggles" subtitle="Developer · turn modules on or off for this organisation">
      {loading ? (
        <div className="glass p-8 text-center" style={{ color: 'var(--text-2)' }}>Loading…</div>
      ) : (
        <div className="space-y-3.5 max-w-xl">
          {msg && (
            <div className="glass p-3 text-[14px]" style={{ color: 'var(--accent)' }}>{msg}</div>
          )}
          <div className="glass overflow-hidden">
            {Object.keys(LABELS).map(key => (
              <div key={key} className="glass-row items-center">
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-[14px]">{LABELS[key].title}</div>
                  <div className="text-[12px]" style={{ color: 'var(--text-2)' }}>{LABELS[key].desc}</div>
                </div>
                <button
                  type="button"
                  onClick={() => toggle(key)}
                  className="relative w-12 h-7 rounded-full transition shrink-0"
                  style={{ background: features[key] ? 'var(--accent)' : 'var(--fill)' }}
                  aria-pressed={!!features[key]}
                >
                  <span
                    className="absolute top-0.5 left-0.5 w-6 h-6 rounded-full bg-white shadow transition"
                    style={{ transform: features[key] ? 'translateX(20px)' : 'translateX(0)' }}
                  />
                </button>
              </div>
            ))}
          </div>

          <div className="glass p-4 space-y-2">
            <div className="font-medium text-[14px]">Scoreboard sponsors (rotation)</div>
            <p className="text-[12px]" style={{ color: 'var(--text-2)' }}>One logo URL per line. Rotate seconds: 0 = show up to 4 at once.</p>
            <textarea className="as-input" rows={3} value={sponsorUrls} onChange={e => setSponsorUrls(e.target.value)} placeholder="https://.../logo1.png" />
            <input className="as-input" type="number" min={0} max={120} value={sponsorRotate} onChange={e => setSponsorRotate(e.target.value)} placeholder="Rotate seconds" />
            <input className="as-input" value={sheetUrl} onChange={e => setSheetUrl(e.target.value)} placeholder="Optional Google Sheet / webhook URL for sold export" />
            <button type="button" className="as-btn-ghost text-sm" onClick={async () => {
              try {
                const logos = sponsorUrls.split(/\n+/).map(u => u.trim()).filter(Boolean).map(url => ({ url, position: 'bottom' }));
                await api.put('/broadcast/settings', {
                  sponsorLogos: logos,
                  sponsorRotateSeconds: Number(sponsorRotate) || 0,
                  showSponsors: true,
                  sheetSyncUrl: sheetUrl,
                  sheetSyncEnabled: !!sheetUrl
                });
                setMsg('Broadcast settings saved');
              } catch (e: any) {
                setMsg(e.response?.data?.error || 'Broadcast save failed');
              }
            }}>Save sponsors / sheet</button>
          </div>
          <div className="glass p-4 space-y-2">
            <div className="font-medium text-[14px]">Sold webhook (Discord/Slack/WhatsApp bot)</div>
            <p className="text-[12px]" style={{ color: 'var(--text-2)' }}>
              POST JSON on each player-sold. Leave blank to disable.
            </p>
            <input
              className="as-input"
              value={webhookUrl}
              onChange={e => setWebhookUrl(e.target.value)}
              placeholder="https://hooks.example.com/..."
            />
            <button
              type="button"
              className="as-btn-ghost text-sm"
              onClick={async () => {
                try {
                  await api.patch('/orgs/me', { soldWebhookUrl: webhookUrl });
                  setMsg('Webhook URL saved');
                } catch (e: any) {
                  setMsg(e.response?.data?.error || 'Webhook save failed');
                }
              }}
            >
              Save webhook
            </button>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={save} disabled={saving} className="as-btn-primary">
              {saving ? 'Saving…' : 'Save features'}
            </button>
            <button type="button" onClick={exportOrg} className="as-btn-ghost">
              Download org backup (JSON)
            </button>
          </div>
        </div>
      )}
    </AppShell>
  );
}
