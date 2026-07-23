'use client';

import { useState } from 'react';
import { ACC } from './theme';

export function Waitlist() {
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<'idle' | 'loading' | 'ok' | 'error'>('idle');

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (status === 'loading') return;
    setStatus('loading');
    try {
      const res = await fetch('/api/public/waitlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      if (!res.ok) throw new Error();
      setStatus('ok');
      setEmail('');
    } catch {
      setStatus('error');
    }
  }

  if (status === 'ok') {
    return (
      <div id="lista-espera" style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 14.5, color: '#C9C9C2' }}>
        <span style={{ width: 22, height: 22, borderRadius: '50%', background: 'rgba(124,58,237,.25)', color: '#C9A6F5', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>✓</span>
        Apuntada. Te avisamos en cuanto abramos.
      </div>
    );
  }

  return (
    <form id="lista-espera" onSubmit={onSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="tu@email.com"
          style={{
            flex: '1 1 220px',
            minWidth: 0,
            fontSize: 14.5,
            padding: '13px 16px',
            borderRadius: 999,
            border: '1px solid rgba(255,255,255,.22)',
            background: 'rgba(255,255,255,.08)',
            color: '#fff',
          }}
        />
        <button
          type="submit"
          disabled={status === 'loading'}
          style={{
            fontSize: 14.5,
            fontWeight: 700,
            padding: '13px 22px',
            borderRadius: 999,
            border: 'none',
            background: ACC,
            color: '#fff',
            cursor: status === 'loading' ? 'default' : 'pointer',
            opacity: status === 'loading' ? 0.7 : 1,
            flexShrink: 0,
          }}
        >
          {status === 'loading' ? 'Enviando…' : 'Avísame'}
        </button>
      </div>
      {status === 'error' && <span style={{ fontSize: 13, color: '#F0A8A8' }}>Algo ha fallado. Prueba de nuevo en unos segundos.</span>}
    </form>
  );
}
