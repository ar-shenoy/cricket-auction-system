import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';

export default function RegisterOrg() {
  const navigate = useNavigate();
  const { login } = useAuth();
  const [form, setForm] = useState({ orgName: '', name: '', email: '', password: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await api.post('/orgs/register', form);
      localStorage.setItem('token', res.data.token);
      await login(form.email, form.password);
      navigate('/');
    } catch (err: any) {
      setError(err.response?.data?.error || 'Registration failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-white flex flex-col">
      <header className="border-b border-slate-800">
        <div className="max-w-5xl mx-auto px-4 py-4 flex items-center justify-between">
          <Link to="/welcome" className="flex items-center gap-2 font-bold text-lg">
            <span className="text-2xl">🏏</span> AuctionScore
          </Link>
          <Link to="/login" className="text-sm text-slate-400 hover:text-white">Login</Link>
        </div>
      </header>
      <div className="flex-1 flex items-center justify-center px-4 py-12">
        <div className="w-full max-w-md">
          <div className="text-center mb-8">
            <p className="text-indigo-400 text-sm font-semibold uppercase tracking-widest mb-2">Free plan</p>
            <h1 className="text-3xl font-black">Create organization</h1>
            <p className="text-slate-400 mt-2 text-sm">Start free · upgrade anytime</p>
          </div>
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 sm:p-8">
            <form onSubmit={submit} className="space-y-4">
              {[
                { key: 'orgName', label: 'Organization / league name', ph: 'e.g. NIT Warriors 2026' },
                { key: 'name', label: 'Your name', ph: '' },
                { key: 'email', label: 'Email', ph: '', type: 'email' },
                { key: 'password', label: 'Password', ph: '', type: 'password' }
              ].map(f => (
                <div key={f.key}>
                  <label className="block text-sm font-medium text-slate-300 mb-1.5">{f.label}</label>
                  <input
                    required
                    type={f.type || 'text'}
                    minLength={f.key === 'password' ? 6 : undefined}
                    value={(form as any)[f.key]}
                    onChange={e => setForm({ ...form, [f.key]: e.target.value })}
                    placeholder={f.ph}
                    className="w-full px-4 py-2.5 rounded-xl bg-slate-950 border border-slate-700 text-white outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              ))}
              {error && (
                <p className="text-sm text-red-400 bg-red-950/40 border border-red-900 rounded-xl px-3 py-2">{error}</p>
              )}
              <button type="submit" disabled={loading} className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white py-3 rounded-xl font-semibold">
                {loading ? 'Creating…' : 'Create & start free'}
              </button>
            </form>
            <p className="text-center text-sm text-slate-500 mt-5">
              Already have an account? <Link to="/login" className="text-indigo-400 hover:underline">Login</Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
