import React, { useEffect, useMemo, useState } from 'react';
import AppShell from '../components/AppShell';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';

type FeatMeta = { key: string; title: string; desc: string };

type FeatCategory = {
  id: string;
  title: string;
  hint: string;
  items: FeatMeta[];
};

const CATEGORIES: FeatCategory[] = [
  {
    id: 'modules',
    title: 'Core modules (pages)',
    hint: 'Whole nav entries — turn off a page without touching the rest',
    items: [
      { key: 'players', title: 'Players', desc: 'Roster, import, approval' },
      { key: 'teams', title: 'Teams', desc: 'Teams, purse, managers' },
      { key: 'auction', title: 'Auction', desc: 'Live auction room' },
      { key: 'scoring', title: 'Scoring', desc: 'Match scoring panel' },
      { key: 'reports', title: 'Reports', desc: 'Squad / session reports' },
      { key: 'billing', title: 'Billing', desc: 'Plans & payments' },
      { key: 'hub', title: 'Tournament Hub', desc: 'Seasons, venues, fixtures' },
      { key: 'broadcast', title: 'Broadcast studio', desc: 'Lower-thirds & sponsors' },
      { key: 'franchise', title: 'Franchise portal', desc: 'Owner purse & squad view' },
      { key: 'intelligence', title: 'Intelligence', desc: 'Market & spend insights' },
      { key: 'points', title: 'Points table', desc: 'Standings / NRR page' },
      { key: 'scoreboard', title: 'Scoreboard', desc: 'Projector scoreboard' }
    ]
  },
  {
    id: 'auction',
    title: 'Auction room (granular)',
    hint: 'Individual auction controls — timer, undo, draw, card, etc.',
    items: [
      { key: 'auctionTimer', title: 'Bid timer', desc: 'Countdown + auto-unsold' },
      { key: 'auctionNoBidGrace', title: 'No-bid grace', desc: 'Extra seconds after timer with no new bid' },
      { key: 'auctionRandomDraw', title: 'Random draw', desc: 'Next random available player' },
      { key: 'auctionRecallUnsold', title: 'Recall unsold', desc: 'Bring unsold back into pool' },
      { key: 'auctionUndoBid', title: 'Undo last bid', desc: 'Revert highest bid' },
      { key: 'auctionUndoSell', title: 'Undo last sell', desc: 'Revert last sold/unsold' },
      { key: 'auctionSoftPause', title: 'Soft pause reasons', desc: 'Pause with note (network / dispute)' },
      { key: 'auctionShareLive', title: 'Share live link', desc: 'Copy public /live URL' },
      { key: 'auctionExport', title: 'Export squads CSV', desc: 'Download sold list from room' },
      { key: 'auctionBudgetHints', title: 'Budget hints', desc: 'Purse / slots guidance' },
      { key: 'auctionFocusMode', title: 'Focus mode', desc: 'Hide secondary chrome for projector' },
      { key: 'auctionPlayerCard', title: 'Premium player card', desc: 'Arcade / trading-card UI' },
      { key: 'auctionKeyboard', title: 'Keyboard shortcuts', desc: 'Power-user keys in room' },
      { key: 'auctionMultiSet', title: 'Multi-set pools', desc: 'Set A / Set B style filters' },
      { key: 'spectatorLinks', title: 'Spectator tokens', desc: 'Time-limited public live links' }
    ]
  },
  {
    id: 'players-teams',
    title: 'Players & teams ops',
    hint: 'Import helpers, tags, owner portal, audit',
    items: [
      { key: 'playerTags', title: 'Player tags', desc: 'capped / local / icon filters' },
      { key: 'playerNotes', title: 'Player notes', desc: 'Admin notes on players' },
      { key: 'playerBulkPhoto', title: 'Bulk photo import', desc: 'Zip / folder map by name' },
      { key: 'playerMergeHelper', title: 'Duplicate merge helper', desc: 'Merge same-name players on import' },
      { key: 'teamOwnerPortal', title: 'Team owner portal mode', desc: 'Managers see own purse/squad only' },
      { key: 'purseAuditLog', title: 'Purse audit log', desc: 'Append-only sell / unsold / undo rows' }
    ]
  },
  {
    id: 'scoring',
    title: 'Scoring & match',
    hint: 'Match tools independent of the Scoring page toggle',
    items: [
      { key: 'matchDls', title: 'DLS calculator', desc: 'Duckworth–Lewis–Stern helpers' },
      { key: 'matchSuperOver', title: 'Super over', desc: 'Super-over scoring mode' },
      { key: 'matchRainDelay', title: 'Rain delay', desc: 'Mark delayed / reduced overs' },
      { key: 'matchCsvImport', title: 'Match CSV import', desc: 'Import fixtures / scores' },
      { key: 'scoringBigTap', title: 'Big-tap mode', desc: 'Larger hit targets for scorers' },
      { key: 'scoringKeyboard', title: 'Scoring keyboard', desc: '0–6, W, wide shortcuts' },
      { key: 'commentaryFeed', title: 'Commentary feed', desc: 'Per-ball text to lower-third API' }
    ]
  },
  {
    id: 'public',
    title: 'Public / live surfaces',
    hint: 'What spectators and embeds can see',
    items: [
      { key: 'publicLive', title: 'Public live page', desc: '/live route' },
      { key: 'publicResults', title: 'Public results', desc: '/results report' },
      { key: 'publicMatchCentre', title: 'Public match centre', desc: 'Match live public view' },
      { key: 'publicTournament', title: 'Public tournament', desc: 'Tournament public page' },
      { key: 'publicPoints', title: 'Public points', desc: 'Open standings' },
      { key: 'liveTeams', title: 'Live · show teams', desc: 'Team purse strip on /live' },
      { key: 'liveBidHistory', title: 'Live · bid history', desc: 'Expandable bids on /live' },
      { key: 'liveSoldList', title: 'Live · sold list', desc: 'Sold table on /live' },
      { key: 'publicEmbed', title: 'Public embed mode', desc: 'iframe-friendly stripped chrome' }
    ]
  },
  {
    id: 'intel-reports',
    title: 'Intelligence & reports',
    hint: 'Analytics sections and export packs',
    items: [
      { key: 'intelMarketValues', title: 'Market values', desc: 'Suggested price bands' },
      { key: 'intelSpendEfficiency', title: 'Spend efficiency', desc: '₹ per role filled' },
      { key: 'intelProjection', title: 'If auction ended now', desc: 'Remaining purse / slots heuristic' },
      { key: 'intelPerformancePrice', title: 'Performance vs price', desc: 'Post-match runs/₹ · wickets/₹' },
      { key: 'ownerPackExport', title: 'Owner one-pager PDF', desc: 'Per-franchise buys + flags' },
      { key: 'reportPdfCsv', title: 'Session report PDF/CSV', desc: 'Sold, spend, unsold dump' }
    ]
  },
  {
    id: 'integrations',
    title: 'Broadcast & integrations',
    hint: 'Sponsors, webhooks, sheets',
    items: [
      { key: 'sponsorRotation', title: 'Sponsor rotation', desc: 'Time-based logo swap' },
      { key: 'soldWebhook', title: 'Sold webhook', desc: 'POST on player-sold' },
      { key: 'sheetSync', title: 'Google Sheet sync', desc: 'One-way sold list export' }
    ]
  },
  {
    id: 'dashboard',
    title: 'Dashboard',
    hint: 'Home cards and feeds',
    items: [
      { key: 'dashboardAnalytics', title: 'Analytics cards', desc: 'Summary stats on home' },
      { key: 'dashboardPublicFeeds', title: 'Public feed links', desc: 'Quick links to live/results' }
    ]
  }
];

function Toggle({ on, onClick }: { on: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="relative w-12 h-7 rounded-full transition shrink-0"
      style={{ background: on ? 'var(--accent)' : 'var(--fill)' }}
      aria-pressed={on}
    >
      <span
        className="absolute top-0.5 left-0.5 w-6 h-6 rounded-full bg-white shadow transition"
        style={{ transform: on ? 'translateX(20px)' : 'translateX(0)' }}
      />
    </button>
  );
}

export default function Features() {
  const { user } = useAuth();
  const [features, setFeatures] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');
  const [query, setQuery] = useState('');
  const [openCats, setOpenCats] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(CATEGORIES.map(c => [c.id, true]))
  );
  const [webhookUrl, setWebhookUrl] = useState('');
  const [sponsorUrls, setSponsorUrls] = useState('');
  const [sponsorRotate, setSponsorRotate] = useState('8');
  const [sheetUrl, setSheetUrl] = useState('');

  const allKeys = useMemo(
    () => CATEGORIES.flatMap(c => c.items.map(i => i.key)),
    []
  );

  useEffect(() => {
    Promise.all([
      api.get('/orgs/features'),
      api.get('/orgs/me').catch(() => ({ data: {} })),
      api.get('/broadcast/settings').catch(() => ({ data: {} }))
    ])
      .then(([fr, me, br]) => {
        const f = fr.data.features || {};
        const defaults = fr.data.defaults || {};
        const merged: Record<string, boolean> = { ...defaults, ...f };
        allKeys.forEach(k => {
          if (merged[k] === undefined) merged[k] = true;
        });
        setFeatures(merged);
        if (me.data?.soldWebhookUrl) setWebhookUrl(me.data.soldWebhookUrl);
        if (br.data?.sponsorLogos) {
          setSponsorUrls((br.data.sponsorLogos || []).map((s: any) => s.url).join('\n'));
        }
        if (br.data?.sponsorRotateSeconds != null) {
          setSponsorRotate(String(br.data.sponsorRotateSeconds));
        }
        if (br.data?.sheetSyncUrl) setSheetUrl(br.data.sheetSyncUrl);
      })
      .catch(() => setMsg('Failed to load features'))
      .finally(() => setLoading(false));
  }, [allKeys]);

  const toggle = (key: string) => {
    setFeatures(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const setCategory = (cat: FeatCategory, value: boolean) => {
    setFeatures(prev => {
      const next = { ...prev };
      cat.items.forEach(i => { next[i.key] = value; });
      return next;
    });
  };

  const setAll = (value: boolean) => {
    setFeatures(prev => {
      const next = { ...prev };
      allKeys.forEach(k => { next[k] = value; });
      return next;
    });
  };

  const save = async () => {
    setSaving(true);
    setMsg('');
    try {
      const r = await api.put('/orgs/features', { features });
      setFeatures(r.data.features || features);
      setMsg('Saved. Refresh other tabs to apply nav / UI changes.');
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

  const q = query.trim().toLowerCase();
  const visibleCats = CATEGORIES.map(cat => ({
    ...cat,
    items: q
      ? cat.items.filter(
          i =>
            i.title.toLowerCase().includes(q) ||
            i.desc.toLowerCase().includes(q) ||
            i.key.toLowerCase().includes(q)
        )
      : cat.items
  })).filter(c => c.items.length > 0);

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
    <AppShell
      title="Feature control"
      subtitle="Developer · category toggles + every granular switch"
    >
      {loading ? (
        <div className="glass p-8 text-center" style={{ color: 'var(--text-2)' }}>Loading…</div>
      ) : (
        <div className="space-y-3.5 max-w-2xl">
          {msg && (
            <div className="glass p-3 text-[14px]" style={{ color: 'var(--accent)' }}>{msg}</div>
          )}

          <div className="glass p-3 flex flex-wrap gap-2 items-center">
            <input
              className="as-input flex-1 min-w-[160px]"
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Search features (timer, webhook, hub…)"
            />
            <button type="button" className="as-btn-ghost text-sm" onClick={() => setAll(true)}>Enable all</button>
            <button type="button" className="as-btn-ghost text-sm" onClick={() => setAll(false)}>Disable all</button>
            <button type="button" className="as-btn-primary text-sm" onClick={save} disabled={saving}>
              {saving ? 'Saving…' : 'Save features'}
            </button>
          </div>

          {visibleCats.map(cat => {
            const onCount = cat.items.filter(i => features[i.key] !== false).length;
            const open = openCats[cat.id] !== false;
            return (
              <div key={cat.id} className="glass overflow-hidden">
                <div className="flex items-center gap-2 px-3.5 py-3" style={{ borderBottom: open ? '1px solid var(--separator)' : undefined }}>
                  <button
                    type="button"
                    className="flex-1 text-left min-w-0"
                    onClick={() => setOpenCats(p => ({ ...p, [cat.id]: !open }))}
                  >
                    <div className="font-semibold text-[14px]">{cat.title}</div>
                    <div className="text-[12px]" style={{ color: 'var(--text-2)' }}>
                      {cat.hint} · {onCount}/{cat.items.length} on
                    </div>
                  </button>
                  <button type="button" className="as-btn-ghost text-xs" onClick={() => setCategory(cat, true)}>All on</button>
                  <button type="button" className="as-btn-ghost text-xs" onClick={() => setCategory(cat, false)}>All off</button>
                </div>
                {open && cat.items.map(item => (
                  <div key={item.key} className="glass-row items-center">
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-[14px]">{item.title}</div>
                      <div className="text-[12px]" style={{ color: 'var(--text-2)' }}>
                        {item.desc}
                        <span className="opacity-50"> · {item.key}</span>
                      </div>
                    </div>
                    <Toggle on={features[item.key] !== false} onClick={() => toggle(item.key)} />
                  </div>
                ))}
              </div>
            );
          })}

          <div className="glass p-4 space-y-2">
            <div className="font-medium text-[14px]">Scoreboard sponsors (rotation)</div>
            <p className="text-[12px]" style={{ color: 'var(--text-2)' }}>
              One logo URL per line. Rotate seconds: 0 = show up to 4 at once.
            </p>
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
            <div className="font-medium text-[14px]">Sold webhook (Discord / Slack / bot)</div>
            <p className="text-[12px]" style={{ color: 'var(--text-2)' }}>
              POST JSON on each player-sold. Leave blank to disable.
            </p>
            <input className="as-input" value={webhookUrl} onChange={e => setWebhookUrl(e.target.value)} placeholder="https://hooks.example.com/..." />
            <button type="button" className="as-btn-ghost text-sm" onClick={async () => {
              try {
                await api.patch('/orgs/me', { soldWebhookUrl: webhookUrl });
                setMsg('Webhook URL saved');
              } catch (e: any) {
                setMsg(e.response?.data?.error || 'Webhook save failed');
              }
            }}>Save webhook</button>
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
