'use client';

// Sección "no migras tú" — ataca de frente la objeción nº1 real (30/30
// propietarias entrevistadas): "ya migré una vez y fue horrible; prefiero
// quedarme con mi software". Las tres garantías que enseña son features
// reales del producto (analizador IA + lotes reversibles + importación sin
// tocar el software anterior), no promesas.

import { useEffect, useMemo, useState } from 'react';
import { ACC, CARD_DARK, DARK, MUTED_DARK } from './theme';
import { Reveal } from './Reveal';
import { analizarDeterminista } from '@/lib/migracion/clasificador';
import { EJEMPLOS } from '@/lib/migracion/ejemplos';

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

// Demo en vivo: la propietaria elige su software actual y ve un archivo con SU
// formato reconocerse solo, aquí mismo. Corre `analizarDeterminista` (el MISMO
// clasificador de la migración real) EN EL NAVEGADOR sobre un export de ejemplo
// — no se sube nada, no hace falta cuenta. Prueba sin pedir confianza.
// Rotación automática: la demo se reproduce sola en bucle (Timp → Eversports →
// Excel casero) para quien solo pasa scrolleando, hasta que pulsa un software y
// se queda en el suyo. Respeta prefers-reduced-motion (arranca en Timp y no
// cicla). Es "la demo en bucle" nativa, sin incrustar un GIF pesado.
const ROTACION = ['timp', 'eversports', 'excel'];

function DemoMigracion() {
  const [sel, setSel] = useState<string>('timp');
  const [fijado, setFijado] = useState(false); // el usuario ya eligió → deja de ciclar
  const plataforma = EJEMPLOS.find(e => e.id === sel) ?? null;
  const plan = useMemo(() => (plataforma ? analizarDeterminista(plataforma.archivos) : null), [plataforma]);

  useEffect(() => {
    if (fijado) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    let i = Math.max(0, ROTACION.indexOf(sel));
    const t = setInterval(() => { i = (i + 1) % ROTACION.length; setSel(ROTACION[i]); }, 2600);
    return () => clearInterval(t);
    // Solo depende de `fijado`: leer `sel` una vez al armar el intervalo evita
    // reiniciarlo en cada tick (que congelaría la rotación en el primer paso).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fijado]);

  function elegir(id: string) {
    setFijado(true);
    setSel(id);
  }

  const ETIQUETA_ENTIDAD: Record<string, string> = {
    socias: 'Clientas', membresias: 'Bonos y membresías', clases: 'Clases', reservas: 'Reservas', citas: 'Citas',
  };

  return (
    <div style={{ background: 'rgba(255,255,255,.04)', border: '1px solid rgba(255,255,255,.08)', borderRadius: 20, padding: 'clamp(20px,3vw,28px)', marginBottom: 'clamp(28px,4vw,40px)' }}>
      <div className="lp-mono" style={{ display: 'inline-flex', alignItems: 'center', gap: 7, fontSize: 11, letterSpacing: '.06em', textTransform: 'uppercase', color: '#8E8E86', marginBottom: 10 }}>
        <span aria-hidden="true" style={{ width: 7, height: 7, borderRadius: 999, background: '#7BD3A8', animation: 'lp-pulse 1.8s ease-in-out infinite' }} />
        {fijado ? 'Tu formato, reconocido' : 'En vivo · pasando por cada software'}
      </div>
      <p style={{ fontSize: 15, color: '#E8E8E4', margin: '0 0 16px', lineHeight: 1.5 }}>
        Esto es lo que ve cada propietaria con <strong>su formato exacto</strong>, reconociéndose aquí mismo —
        sin subir nada, sin crear cuenta. ¿Usas otro? Pulsa el tuyo.
      </p>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: plan ? 20 : 0 }}>
        {EJEMPLOS.map(e => (
          <button
            key={e.id}
            onClick={() => elegir(e.id)}
            style={{
              fontSize: 13.5, fontWeight: 700, padding: '9px 16px', borderRadius: 999, cursor: 'pointer',
              border: `1px solid ${sel === e.id ? ACC : 'rgba(255,255,255,.18)'}`,
              background: sel === e.id ? ACC : 'rgba(255,255,255,.06)',
              color: '#fff',
            }}
          >
            {e.label}
          </button>
        ))}
      </div>

      {plan && plataforma && (
        <div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {plan.archivos.map(a => (
              <div key={a.nombre} style={{ background: CARD_DARK, border: '1px solid rgba(255,255,255,.07)', borderRadius: 14, padding: 16 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: a.muestra.length ? 12 : 0 }}>
                  <span className="lp-mono" style={{ fontSize: 11.5, color: '#8E8E86' }}>{a.nombre}</span>
                  {a.entidad ? (
                    <span style={{ fontSize: 12.5, fontWeight: 700, color: '#7BD3A8' }}>
                      ✓ reconocido: {ETIQUETA_ENTIDAD[a.entidad]} · {a.ok} filas listas
                    </span>
                  ) : (
                    <span style={{ fontSize: 12.5, color: '#F0C98A' }}>necesita una mirada — se asigna a mano</span>
                  )}
                  {a.cuarentena.length > 0 && (
                    <span style={{ fontSize: 12, color: '#C9C9C2' }}>· {a.cuarentena.length} a revisar (visible, no se pierde)</span>
                  )}
                </div>
                {a.muestra.length > 0 && (
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', fontSize: 12.5, borderCollapse: 'collapse', color: '#D8D8D2' }}>
                      <thead>
                        <tr style={{ textAlign: 'left', color: '#8E8E86' }}>
                          {Object.keys(a.muestra[0]).filter(k => a.muestra.some(m => (m as Record<string, unknown>)[k])).slice(0, 5).map(k => (
                            <th key={k} style={{ padding: '2px 14px 6px 0', fontWeight: 600 }}>{k}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {a.muestra.slice(0, 3).map((m, i) => (
                          <tr key={i}>
                            {Object.keys(a.muestra[0]).filter(k => a.muestra.some(mm => (mm as Record<string, unknown>)[k])).slice(0, 5).map(k => (
                              <td key={k} style={{ padding: '3px 14px 3px 0', whiteSpace: 'nowrap' }}>{String((m as Record<string, unknown>)[k] ?? '')}</td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            ))}
          </div>
          <p style={{ fontSize: 12, color: '#8E8E86', margin: '12px 0 0', lineHeight: 1.5 }}>
            {plataforma.nota} Esto es exactamente lo que hace la migración real, corriendo en tu navegador.
          </p>
        </div>
      )}
    </div>
  );
}

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

          <DemoMigracion />

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
