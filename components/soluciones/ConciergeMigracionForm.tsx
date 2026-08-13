'use client';

import { useId, useState } from 'react';
import { ACC } from '@/components/landing/theme';

// Formulario de la migración "concierge": deja tu email y de qué software
// vienes, y el equipo te monta el estudio a mano en Tentare.
//
// `/api/public/migracion-concierge` (app/api/public/migracion-concierge/route.ts)
// ya existía — guarda el lead en `plataforma_lead` y avisa a soporte@tentare.app —
// pero no tenía NINGÚN formulario en el sitio que lo llamara. Este es el primero.
//
// Sin captcha: la propia ruta no lo comprueba (a diferencia de
// /api/public/interes-lanzamiento, que sí lo exige) — solo rate-limit
// (10/min por IP). No se añade uno aquí que el servidor no vaya a validar.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function ConciergeMigracionForm() {
  const uid = useId();
  const [email, setEmail] = useState('');
  const [software, setSoftware] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [enviado, setEnviado] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (!EMAIL_RE.test(email)) {
      setError('Escribe un email válido.');
      return;
    }
    setEnviando(true);
    try {
      const res = await fetch('/api/public/migracion-concierge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, software }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        setError(data?.error || 'No se ha podido registrar tu solicitud. Inténtalo de nuevo.');
        return;
      }
      setEnviado(true);
    } catch {
      setError('No se ha podido registrar tu solicitud. Inténtalo de nuevo.');
    } finally {
      setEnviando(false);
    }
  }

  if (enviado) {
    return (
      <div style={{ background: '#F4F8F5', border: '1px solid #CFE3D5', borderRadius: 16, padding: '24px 26px', textAlign: 'center' }}>
        <div style={{ fontSize: 17, fontWeight: 700, color: '#2F6B4F', marginBottom: 6 }}>Recibido.</div>
        <p style={{ margin: 0, fontSize: 14.5, lineHeight: 1.55, color: '#3A3A34' }}>Te escribimos a {email} para pedirte los exports y montarte el estudio.</p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} style={{ background: '#fff', border: '1px solid #E7E7E0', borderRadius: 16, padding: '24px 26px' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div>
          <label htmlFor={`${uid}-email`} style={{ display: 'block', fontSize: 13, fontWeight: 700, color: '#1A1A1A', marginBottom: 6 }}>Tu email</label>
          <input
            id={`${uid}-email`}
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="tu@estudio.com"
            style={{ width: '100%', fontSize: 15, padding: '11px 14px', border: '1px solid #D8D8D0', borderRadius: 10, fontFamily: 'inherit' }}
          />
        </div>
        <div>
          <label htmlFor={`${uid}-software`} style={{ display: 'block', fontSize: 13, fontWeight: 700, color: '#1A1A1A', marginBottom: 6 }}>¿De qué software vienes? <span style={{ fontWeight: 400, color: '#8E8E86' }}>(opcional)</span></label>
          <input
            id={`${uid}-software`}
            type="text"
            value={software}
            onChange={(e) => setSoftware(e.target.value)}
            placeholder="bsport, Mindbody, una hoja de Excel…"
            style={{ width: '100%', fontSize: 15, padding: '11px 14px', border: '1px solid #D8D8D0', borderRadius: 10, fontFamily: 'inherit' }}
          />
        </div>
        {error && <p style={{ margin: 0, fontSize: 13.5, color: '#C2503A' }}>{error}</p>}
        <button
          type="submit"
          disabled={enviando}
          style={{ fontSize: 15, fontWeight: 700, color: '#fff', background: ACC, padding: '13px 20px', borderRadius: 999, border: 'none', cursor: enviando ? 'default' : 'pointer', opacity: enviando ? 0.7 : 1, fontFamily: 'inherit' }}
        >
          {enviando ? 'Enviando…' : 'Que me la hagan ellos →'}
        </button>
        <p style={{ margin: 0, fontSize: 12, color: '#8E8E86', lineHeight: 1.5 }}>Te contestamos por email pidiéndote los exports (o acceso a tu software actual). Sin compromiso.</p>
      </div>
    </form>
  );
}
