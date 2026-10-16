import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../services/api';
import ThemeToggle from '../components/ThemeToggle';

export default function Billing() {
  const [org, setOrg] = useState<any>(null);
  const [msg, setMsg] = useState('');
  const [loading, setLoading] = useState(false);

  const load = () => { api.get('/orgs/me').then(r => setOrg(r.data)).catch(console.error); };
  useEffect(() => { load(); }, []);

  const upgrade = async () => {
    setLoading(true);
    setMsg('');
    try {
      const order = await api.post('/billing/create-order');
      if (order.data.demo) {
        await api.post('/billing/demo-activate');
        setMsg('Pro activated (demo mode — set RAZORPAY keys for real payments).');
        load();
      } else {
        const options = {
          key: order.data.keyId,
          amount: order.data.amount,
          currency: order.data.currency,
          name: org?.name || 'AuctionScore Pro',
          description: 'Pro plan — 90 days',
          order_id: order.data.orderId,
          handler: async (response: any) => {
            try {
              await api.post('/billing/verify', { ...response, paymentId: order.data.paymentId });
              setMsg('Payment successful — Pro unlocked!');
              load();
            } catch {
              setMsg('Payment verification failed.');
            }
          }
        };
        // @ts-ignore
        if (window.Razorpay) {
          // @ts-ignore
          new window.Razorpay(options).open();
        } else {
          const s = document.createElement('script');
          s.src = 'https://checkout.razorpay.com/v1/checkout.js';
          s.onload = () => { /* @ts-ignore */ new window.Razorpay(options).open(); };
          document.body.appendChild(s);
        }
      }
    } catch (err: any) {
      setMsg(err.response?.data?.error || 'Upgrade failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <header className="bg-white dark:bg-gray-800 border-b dark:border-gray-700">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center justify-between">
          <Link to="/" className="text-sm text-gray-500">← Dashboard</Link>
          <ThemeToggle />
        </div>
      </header>
      <main className="max-w-3xl mx-auto px-4 py-8 space-y-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Plan & billing</h1>
        {org && (
          <div className="bg-white dark:bg-gray-800 rounded-xl border dark:border-gray-700 p-5">
            <div className="flex justify-between items-start">
              <div>
                <div className="text-sm text-gray-500">Organization</div>
                <div className="text-xl font-bold text-gray-900 dark:text-white">{org.name}</div>
              </div>
              <span className={`px-3 py-1 rounded-full text-sm font-semibold ${org.plan === 'pro' ? 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900 dark:text-indigo-200' : 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-200'}`}>{(org.plan || 'free').toUpperCase()}</span>
            </div>
            {org.planExpiresAt && <p className="text-sm text-gray-500 mt-2">Pro expires: {new Date(org.planExpiresAt).toLocaleDateString()}</p>}
          </div>
        )}
        <div className="bg-white dark:bg-gray-800 rounded-xl border dark:border-gray-700 p-5">
          <h2 className="font-bold text-gray-900 dark:text-white mb-2">Upgrade to Pro</h2>
          <p className="text-sm text-gray-500 mb-4">₹1499 for 90 days. Photos still auto-clear after 15 days.</p>
          <button type="button" disabled={loading || org?.plan === 'pro'} onClick={upgrade} className="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white px-5 py-2.5 rounded-lg font-medium">{org?.plan === 'pro' ? 'Already on Pro' : loading ? 'Please wait…' : 'Upgrade to Pro'}</button>
          {msg && <p className="mt-3 text-sm text-emerald-600 dark:text-emerald-400">{msg}</p>}
        </div>
      </main>
    </div>
  );
}
