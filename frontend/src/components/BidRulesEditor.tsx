import React, { useState, useEffect } from 'react';
import { BidRule, DEFAULT_BID_RULES } from '../utils/bidRules';

interface Props {
  initialRules?: BidRule[];
  initialTimer?: number;
  initialName?: string;
  onSave: (data: { bidRules: BidRule[]; bidTimerSeconds: number; name: string }) => Promise<void>;
  disabled?: boolean;
}

/** Editable row: upTo can be empty string meaning "no limit" (last tier). */
type Row = { upTo: string; increment: string };

function rulesToRows(rules: BidRule[]): Row[] {
  const list = rules?.length ? rules : DEFAULT_BID_RULES;
  return list.map(r => ({
    upTo: r.upTo === null || r.upTo === undefined ? '' : String(r.upTo),
    increment: String(r.increment),
  }));
}

function rowsToRules(rows: Row[]): BidRule[] {
  return rows.map((r, i) => {
    const isLast = i === rows.length - 1;
    const upToRaw = r.upTo.trim();
    return {
      upTo: isLast || upToRaw === '' ? null : Number(upToRaw),
      increment: Number(r.increment) || 1000,
    };
  });
}

export default function BidRulesEditor({ initialRules, initialTimer = 20, initialName = '', onSave, disabled }: Props) {
  const [rows, setRows] = useState<Row[]>(() => rulesToRows(initialRules || DEFAULT_BID_RULES));
  const [timer, setTimer] = useState(String(initialTimer));
  const [name, setName] = useState(initialName);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    setRows(rulesToRows(initialRules || DEFAULT_BID_RULES));
    setTimer(String(initialTimer));
    setName(initialName || '');
  }, [initialRules, initialTimer, initialName]);

  const updateRow = (idx: number, field: keyof Row, value: string) => {
    setRows(prev => prev.map((r, i) => (i === idx ? { ...r, [field]: value } : r)));
  };

  const addRow = () => {
    setRows(prev => {
      const next = [...prev];
      // Insert before last (unlimited) tier if last has empty upTo
      if (next.length && next[next.length - 1].upTo === '') {
        next.splice(next.length - 1, 0, { upTo: '', increment: '5000' });
      } else {
        next.push({ upTo: '', increment: '5000' });
      }
      return next;
    });
  };

  const removeRow = (idx: number) => {
    if (rows.length <= 1) return;
    setRows(prev => prev.filter((_, i) => i !== idx));
  };

  const loadPreset = (kind: 'local' | 'ipl' | 'simple') => {
    if (kind === 'local') {
      setRows(rulesToRows([
        { upTo: 10000, increment: 1000 },
        { upTo: 20000, increment: 2000 },
        { upTo: null, increment: 5000 },
      ]));
    } else if (kind === 'ipl') {
      setRows(rulesToRows([
        { upTo: 10000000, increment: 500000 },
        { upTo: 20000000, increment: 1000000 },
        { upTo: null, increment: 2000000 },
      ]));
    } else {
      setRows(rulesToRows([{ upTo: null, increment: 50000 }]));
    }
  };

  const handleSave = async () => {
    setError('');
    const rules = rowsToRules(rows);
    if (rules.some(r => !r.increment || r.increment <= 0)) {
      setError('Each step increment must be a positive number.');
      return;
    }
    const t = Number(timer);
    if (!t || t < 5 || t > 300) {
      setError('Timer must be between 5 and 300 seconds.');
      return;
    }
    setSaving(true);
    try {
      await onSave({ bidRules: rules, bidTimerSeconds: t, name: name.trim() || 'Auction' });
    } catch (e: any) {
      setError(e?.message || 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  // Preview text
  const preview = rowsToRules(rows).map((r, i) => {
    if (r.upTo === null) return `₹∞ → +₹${r.increment.toLocaleString()}`;
    return `below ₹${Number(r.upTo).toLocaleString()} → +₹${r.increment.toLocaleString()}`;
  });

  const inputCls =
    'border dark:border-gray-600 rounded-lg px-2 py-1.5 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm w-full';

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border dark:border-gray-700 p-4 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-semibold text-gray-900 dark:text-white">Auction settings & bid ladder</h3>
        <div className="flex flex-wrap gap-1 text-xs">
          <button type="button" onClick={() => loadPreset('local')} disabled={disabled}
            className="px-2 py-1 rounded bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-600">Local (1k/2k/5k)</button>
          <button type="button" onClick={() => loadPreset('ipl')} disabled={disabled}
            className="px-2 py-1 rounded bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-600">IPL-style</button>
          <button type="button" onClick={() => loadPreset('simple')} disabled={disabled}
            className="px-2 py-1 rounded bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-600">Flat step</button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Auction name</label>
          <input value={name} onChange={e => setName(e.target.value)} disabled={disabled} className={inputCls} placeholder="e.g. Summer League 2026" />
        </div>
        <div>
          <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Bid timer (seconds)</label>
          <input type="number" min={5} max={300} value={timer} onChange={e => setTimer(e.target.value)} disabled={disabled} className={inputCls} />
        </div>
      </div>

      <div>
        <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">
          Rules are checked top to bottom. Leave "Up to" empty on the last row for no upper limit.
        </p>
        <div className="space-y-2">
          <div className="grid grid-cols-12 gap-2 text-xs font-medium text-gray-500 dark:text-gray-400 px-1">
            <div className="col-span-5">Up to amount (₹)</div>
            <div className="col-span-5">Increment (₹)</div>
            <div className="col-span-2"></div>
          </div>
          {rows.map((row, idx) => (
            <div key={idx} className="grid grid-cols-12 gap-2 items-center">
              <div className="col-span-5">
                <input
                  type="number"
                  value={row.upTo}
                  onChange={e => updateRow(idx, 'upTo', e.target.value)}
                  disabled={disabled}
                  placeholder={idx === rows.length - 1 ? '∞ unlimited' : 'e.g. 10000'}
                  className={inputCls}
                />
              </div>
              <div className="col-span-5">
                <input
                  type="number"
                  value={row.increment}
                  onChange={e => updateRow(idx, 'increment', e.target.value)}
                  disabled={disabled}
                  placeholder="e.g. 1000"
                  className={inputCls}
                />
              </div>
              <div className="col-span-2">
                <button type="button" onClick={() => removeRow(idx)} disabled={disabled || rows.length <= 1}
                  className="text-red-600 text-xs disabled:opacity-30">Remove</button>
              </div>
            </div>
          ))}
        </div>
        <button type="button" onClick={addRow} disabled={disabled}
          className="mt-2 text-sm text-blue-600 dark:text-blue-400 hover:underline">+ Add tier</button>
      </div>

      <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-3 text-xs text-gray-600 dark:text-gray-300">
        <div className="font-medium mb-1 text-gray-800 dark:text-gray-200">Preview</div>
        <ul className="list-disc list-inside space-y-0.5">
          {preview.map((line, i) => <li key={i}>{line}</li>)}
        </ul>
      </div>

      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}

      <button
        type="button"
        onClick={handleSave}
        disabled={disabled || saving}
        className="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white px-4 py-2 rounded-lg text-sm font-medium"
      >
        {saving ? 'Saving…' : 'Save settings'}
      </button>
    </div>
  );
}
