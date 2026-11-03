'use client';

import { useEffect, useState } from 'react';
import { portalAuthHeader } from '@/lib/student/api-publica';
import { activarPushStudent, avisosApagadosAposta, contextoPushStudent } from '@/lib/student/push';
import { estadoPush } from '@/lib/student/push-estado';
import { debeOfrecerTrasReserva } from '@/lib/student/push-invitacion';

// «Avísame antes de mi clase», en la confirmación de la reserva: el momento en
// que más sentido tiene. Solo sale donde el botón funciona y como mucho dos
// veces (ver `debeOfrecerTrasReserva`). El permiso lo pide el botón (un toque
// suyo, como exige iOS), nunca al aparecer. Se dice lo que pasó de verdad.

const claveVeces = (slug: string) => `tentare:avisos-oferta-reserva:${slug}`;
const leerVeces = (slug: string) => { try { return Number(localStorage.getItem(claveVeces(slug)) ?? '0') || 0; } catch { return 0; } };

export function OfertaAvisosTrasReserva({ estudioId, slug }: { estudioId: string; slug: string }) {
  const [ofrecer, setOfrecer] = useState(false);
  const [fase, setFase] = useState<'oferta' | 'activando' | 'hecho' | 'error'>('oferta');

  useEffect(() => {
    let vivo = true;
    void (async () => {
      if (!(await portalAuthHeader()).Authorization) return;
      const e = estadoPush(await contextoPushStudent(slug, estudioId));
      const veces = leerVeces(slug);
      if (!vivo || !debeOfrecerTrasReserva(e, veces, avisosApagadosAposta(slug))) return;
      try { localStorage.setItem(claveVeces(slug), String(veces + 1)); } catch { /* sin almacenamiento: puede repetirse */ }
      setOfrecer(true);
    })().catch(() => undefined);
    return () => { vivo = false; };
  }, [slug, estudioId]);

  if (!ofrecer) return null;

  async function activar() {
    setFase('activando');
    const r = await activarPushStudent(estudioId, slug);
    setFase(r.ok ? 'hecho' : 'error');
  }

  return (
    <div data-testid="oferta-avisos-reserva" data-fase={fase}
      style={{ marginTop: 14, padding: '12px 14px', borderRadius: 14, background: 'var(--muted)', textAlign: 'left' }}>
      {fase === 'hecho' ? (
        <p className="t-small" style={{ margin: 0, fontWeight: 700 }}>Listo: te avisaremos antes de tu clase ✓</p>
      ) : (
        <>
          <p className="t-small" style={{ margin: 0, fontWeight: 700 }}>¿Te avisamos antes de tu clase?</p>
          <p className="t-meta" style={{ margin: '2px 0 0' }}>Un aviso al móvil, aunque tengas la app cerrada. Lo apagas cuando quieras.</p>
          {fase === 'error' && (
            <p role="alert" className="t-meta" style={{ margin: '6px 0 0', color: 'var(--destructive)' }}>
              No hemos podido activarlos. Puedes probar otra vez desde Avisos.
            </p>
          )}
          <button type="button" className="btn btn--secondary btn--sm tap" style={{ marginTop: 10 }}
            disabled={fase === 'activando'} onClick={() => void activar()}>
            {fase === 'activando' ? 'Activando…' : 'Avisarme'}
          </button>
        </>
      )}
    </div>
  );
}
