'use client';

// Sección "no migras tú" — ataca de frente la objeción nº1 real (30/30
// propietarias entrevistadas): "ya migré una vez y fue horrible; prefiero
// quedarme con mi software". Las tres garantías que enseña son features
// reales del producto (analizador IA + lotes reversibles + importación sin
// tocar el software anterior), no promesas.

import { useState } from 'react';
import { ACC, CARD_DARK, DARK, MUTED_DARK } from './theme';
import { Reveal } from './Reveal';

const GARANTIAS = [
  {
    title: 'La hacemos nosotros en 48h',
    body: 'Nos mandas lo que puedas exportar — da igual el formato o el software del que vengas — y te entregamos tu estudio montado: clientas, bonos, horario y reservas.',
    color: '#7BD3A8',
  },
  {
    title: 'Sin big-bang',
    body: 'Tu software actual sigue funcionando durante toda la migración. No hay corte, no hay fin de semana perdido, no hay "a ver si mañana funciona".',
    color: '#C08BE8',
  },
  {
    title: 'Reversible con un clic',
    body: 'Cada migración deja un acta con los números para que compruebes que todo cuadra. ¿Algo no te convence? Un clic y queda deshecha — como si no hubiera pasado.',
    color: '#7BD3A8',
  },
];

export function Migracion() {
  const [email, setEmail] = useState('');
  const [software, setSoftware] = useState('');
  const [status, setStatus] = useState<'idle' | 'loading' | 'ok' | 'error'>('idle');

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (status === 'loading') return;
    setStatus('loading');
    try {
      const res = await fetch('/api/public/migracion-concierge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, software }),
      });
      if (!res.ok) throw new Error();
      setStatus('ok');
    } catch {
      setStatus('error');
    }
  }

  const inputStyle: React.CSSProperties = {
    fontSize: 14.5, padding: '13px 16px', borderRadius: 999,
    border: '1px solid rgba(255,255,255,.22)', background: 'rgba(255,255,255,.08)', color: '#fff',
  };

  return (
    <section id="migracion" style={{ padding: 'clamp(56px,7vw,96px) clamp(20px,4vw,44px)' }}>
      <Reveal style={{ maxWidth: 1280, margin: '0 auto', background: DARK, color: '#E8E8E4', borderRadius: 28, padding: 'clamp(32px,5vw,60px)', position: 'relative', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', top: '-30%', left: '-6%', width: 440, height: 440, borderRadius: '50%', background: 'radial-gradient(circle, rgba(124,58,237,.26), transparent 64%)', pointerEvents: 'none' }} />
        <div style={{ position: 'relative' }}>
          <div style={{ maxWidth: 680, marginBottom: 'clamp(28px,4vw,40px)' }}>
            <div className="lp-mono" style={{ fontSize: 11.5, letterSpacing: '.16em', textTransform: 'uppercase', color: '#C08BE8', marginBottom: 14 }}>Cambiarse sin dolor</div>
            <h2 style={{ fontWeight: 800, fontSize: 'clamp(28px,4.2vw,48px)', lineHeight: 1.03, letterSpacing: '-.03em', margin: '0 0 12px', color: '#fff' }}>
              ¿Ya migraste una vez y fue horrible? Por eso aquí no migras tú.
            </h2>
            <p style={{ fontSize: 17, lineHeight: 1.55, color: MUTED_DARK, margin: 0 }}>
              Lo hemos oído en todos los estudios: «prefiero quedarme con mi software antes que perder semanas migrando».
              Con Tentare no pierdes ni una tarde — y no te quedas atrapada: entrar es igual de fácil que salir.
            </p>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16, marginBottom: 'clamp(28px,4vw,40px)' }}>
            {GARANTIAS.map((g) => (
              <div key={g.title} style={{ background: CARD_DARK, border: '1px solid rgba(255,255,255,.07)', borderRadius: 18, padding: 24 }}>
                <div style={{ width: 10, height: 10, borderRadius: 999, background: g.color, marginBottom: 14 }} />
                <h3 style={{ fontSize: 17, fontWeight: 700, color: '#fff', margin: '0 0 6px' }}>{g.title}</h3>
                <p style={{ fontSize: 14, lineHeight: 1.55, color: MUTED_DARK, margin: 0 }}>{g.body}</p>
              </div>
            ))}
          </div>

          <div style={{ maxWidth: 560 }}>
            {status === 'ok' ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 14.5, color: '#C9C9C2' }}>
                <span style={{ width: 22, height: 22, borderRadius: '50%', background: 'rgba(124,58,237,.25)', color: '#C9A6F5', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>✓</span>
                Recibido. Te escribimos en menos de 24h para pedirte los exports y ponernos con ello.
              </div>
            ) : (
              <form onSubmit={onSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div className="lp-mono" style={{ fontSize: 11, letterSpacing: '.06em', textTransform: 'uppercase', color: '#8E8E86', marginBottom: 2 }}>
                  Pide tu migración — te la hacemos nosotros
                </div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <input
                    type="email" required value={email} onChange={(e) => setEmail(e.target.value)}
                    placeholder="tu@email.com" style={{ ...inputStyle, flex: '1 1 200px', minWidth: 0 }}
                  />
                  <input
                    type="text" value={software} onChange={(e) => setSoftware(e.target.value)}
                    placeholder="¿Qué software usas ahora?" style={{ ...inputStyle, flex: '1 1 200px', minWidth: 0 }}
                  />
                  <button
                    type="submit" disabled={status === 'loading'}
                    style={{ fontSize: 14.5, fontWeight: 700, padding: '13px 22px', borderRadius: 999, border: 'none', background: ACC, color: '#fff', cursor: status === 'loading' ? 'default' : 'pointer', opacity: status === 'loading' ? 0.7 : 1, flexShrink: 0 }}
                  >
                    {status === 'loading' ? 'Enviando…' : 'Quiero migrar sin dolor'}
                  </button>
                </div>
                {status === 'error' && <span style={{ fontSize: 13, color: '#F0A8A8' }}>Algo ha fallado. Prueba de nuevo en unos segundos.</span>}
              </form>
            )}
          </div>
        </div>
      </Reveal>
    </section>
  );
}
