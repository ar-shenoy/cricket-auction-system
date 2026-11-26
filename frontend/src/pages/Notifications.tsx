import React, { useEffect, useState } from 'react';
import AppShell from '../components/AppShell';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';

export default function Notifications() {
  const { user } = useAuth();
  const isDev = user?.role === 'developer';
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState('');
  const [featureOn, setFeatureOn] = useState(false);
  const [enabled, setEnabled] = useState(true);
  const [phones, setPhones] = useState('');
  const [webhook, setWebhook] = useState('');
  const [callMeKey, setCallMeKey] = useState('');
  const [soldWebhook, setSoldWebhook] = useState('');
  const [busy, setBusy] = useState(false);
  const [preview] = useState(
    '🔨 *SOLD* · Demo Auction\n*Rohit Sharma* (BAT)\n→ *Titans* for *₹12,00,000*\nPurse left: ₹38,00,000'
  );

  const load = () => {
    setLoading(true);
    Promise.all([
      api.get('/orgs/me'),
      api.get('/orgs/features').catch(() => ({ data: { features: {} } }))
    ])
      .then(([me, fr]) => {
        const o = me.data || {};
        setEnabled(o.whatsappEnabled !== false);
        setPhones(Array.isArray(o.whatsappPhones) ? o.whatsappPhones.join(', ') : '');
        setWebhook(o.whatsappWebhookUrl || '');
        setCallMeKey('');
        setSoldWebhook(o.soldWebhookUrl || '');
        setFeatureOn(fr.data.features?.whatsappNotify === true);
      })
      .catch(() => setMsg('Failed to load'))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const save = async () => {
    setBusy(true);
    setMsg('');
    try {
      await api.patch('/orgs/me', {
        whatsappEnabled: enabled,
        whatsappPhones: phones,
        whatsappWebhookUrl: webhook,
        ...(callMeKey.trim() ? { whatsappCallMeBotKey: callMeKey.trim() } : {}),
        soldWebhookUrl: soldWebhook
      });
      if (isDev) {
        await api.put('/orgs/features', { features: { whatsappNotify: featureOn } });
      }
      setMsg('Notification settings saved.');
      load();
    } catch (e: any) {
      setMsg(e.response?.data?.error || 'Save failed');
    } finally {
      setBusy(false);
    }
  };

  const testCopy = async () => {
    try {
      await navigator.clipboard.writeText(preview);
      setMsg('Sample sold message copied — paste into any WhatsApp chat.');
    } catch {
      setMsg('Could not copy');
    }
  };

  return (
    <AppShell title="Notifications" subtitle="WhatsApp & webhooks for sold players">
      <div className="mb-6">
        <h2 className="text-[26px] font-extrabold tracking-tight uppercase" style={{ color: 'var(--text)' }}>
          Alerts
        </h2>
        <p className="text-[14px] mt-1" style={{ color: 'var(--text-2)' }}>
          When a player is sold, captains and ops get a WhatsApp-ready message (webhook, CallMeBot, or copy).
        </p>
        {msg && <p className="mt-3 text-[13px] font-semibold" style={{ color: 'var(--accent)' }}>{msg}</p>}
      </div>

      {loading ? (
        <div className="glass p-6" style={{ color: 'var(--text-2)' }}>Loading…</div>
      ) : (
        <div className="grid lg:grid-cols-2 gap-4">
          <div className="glass p-5 space-y-3">
            <div className="as-section-title">WhatsApp</div>
            {isDev && (
              <label className="flex items-center gap-2 text-[13px]" style={{ color: 'var(--text)' }}>
                <input type="checkbox" checked={featureOn} onChange={e => setFeatureOn(e.target.checked)} />
                Feature flag: whatsappNotify (org)
              </label>
            )}
            <label className="flex items-center gap-2 text-[13px]" style={{ color: 'var(--text)' }}>
              <input type="checkbox" checked={enabled} onChange={e => setEnabled(e.target.checked)} />
              Send WhatsApp alerts for this organisation
            </label>
            <div>
              <label className="as-label">Phone numbers (with country code)</label>
              <input
                className="as-input"
                value={phones}
                onChange={e => setPhones(e.target.value)}
                placeholder="9198XXXXXXXX, 9188XXXXXXXX"
              />
              <p className="text-[11px] mt-1" style={{ color: 'var(--text-3)' }}>
                Used with CallMeBot. Each number must message the bot once to activate.
              </p>
            </div>
            <div>
              <label className="as-label">CallMeBot API key</label>
              <input
                className="as-input"
                value={callMeKey}
                onChange={e => setCallMeKey(e.target.value)}
                placeholder="Leave blank to keep existing"
              />
            </div>
            <div>
              <label className="as-label">WhatsApp webhook URL</label>
              <input
                className="as-input"
                value={webhook}
                onChange={e => setWebhook(e.target.value)}
                placeholder="https://n8n.example.com/webhook/auction-wa"
              />
              <p className="text-[11px] mt-1" style={{ color: 'var(--text-3)' }}>
                POST JSON: text, phones, payload. Hook to Twilio / Meta Cloud API / n8n.
              </p>
            </div>
            <div>
              <label className="as-label">Generic sold webhook (Discord / Slack / Zapier)</label>
              <input
                className="as-input"
                value={soldWebhook}
                onChange={e => setSoldWebhook(e.target.value)}
                placeholder="https://discord.com/api/webhooks/…"
              />
            </div>
            <button type="button" className="as-btn-primary" disabled={busy} onClick={save}>
              {busy ? 'Saving…' : 'Save alerts'}
            </button>
          </div>

          <div className="glass p-5 space-y-3">
            <div className="as-section-title">Message preview</div>
            <pre
              className="p-4 rounded-lg text-[13px] whitespace-pre-wrap"
              style={{ background: '#0a0a0a', border: '1px solid rgba(255,255,255,0.08)', color: 'var(--text)' }}
            >
              {preview}
            </pre>
            <button type="button" className="as-btn-ghost" onClick={testCopy}>
              Copy sample message
            </button>
            <div className="text-[12px] space-y-1" style={{ color: 'var(--text-3)' }}>
              <p>• Sold → WhatsApp + sold webhook</p>
              <p>• Unsold → WhatsApp (if configured)</p>
              <p>• Feature flag off = no WA traffic even if phones set</p>
            </div>
          </div>
        </div>
      )}
    </AppShell>
  );
}
