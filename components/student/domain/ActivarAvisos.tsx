'use client';

import { useCallback, useEffect, useState } from 'react';
import { portalAuthHeader } from '@/lib/api-client';
import { activarPushStudent, contextoPushStudent } from '@/lib/student/push';
import { estadoPush, textoPush, type EstadoPush } from '@/lib/student/push-estado';
import { debeInvitar } from '@/lib/student/push-invitacion';

// Invitación a activar los avisos, en Inicio. Era el hueco más grande del sistema
// de notificaciones: el único interruptor estaba en Perfil → Preferencias y casi
// nadie lo encontraba (3 de 10 socias con cuenta tenían un dispositivo suscrito).
//
// Reglas:
//  · Solo aparece si ella PUEDE hacer algo (activar, o instalar la app en iPhone).
//  · El permiso lo pide el botón (un toque suyo, como exige iOS), nunca al abrir.
//  · «Ahora no» la oculta 14 días. Bloqueado en el navegador no se insiste.
//  · Un fallo se dice; nunca «activado» sin estarlo.

const claveOculta = (slug: string) => `tentare:avisos-invitacion:${slug}`;

const MENSAJES_ERROR: Record<string, string> = {
  unsupported: 'Este navegador no admite avisos. Prueba desde Chrome o Safari actualizados.',
  'sin-clave': 'Los avisos no están disponibles todavía. No es cosa tuya.',
  error: 'No hemos podido activar los avisos. Ciérrala, ábrela otra vez e inténtalo de nuevo.',
};

export function ActivarAvisos({ estudioId, slug }: { estudioId: string; slug: string }) {
  const [estado, setEstado] = useState<EstadoPush | null>(null);
  const [visible, setVisible] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const leer = useCallback(async () => {
    const haySesion = !!(await portalAuthHeader()).Authorization;
    const e = estadoPush(await contextoPushStudent(slug, estudioId));
    let oculta: number | null = null;
    try { oculta = Number(localStorage.getItem(claveOculta(slug)) ?? 'NaN'); } catch { /* sin almacenamiento */ }
    setEstado(e);
    setVisible(debeInvitar(e, oculta, Date.now(), haySesion));
  }, [slug, estudioId]);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void leer().catch(() => setVisible(false)); }, [leer]);

  if (!visible || !estado) return null;

  const instalar = estado === 'ios-sin-instalar';
  const t = textoPush(estado);

  async function activar() {
    setOcupado(true);
    setError(null);
    const r = await activarPushStudent(estudioId, slug);
    setOcupado(false);
    if (r.ok) { await leer(); return; }
    if (r.motivo === 'denied') { await leer(); return; } // pasa a «bloqueados» y deja de ofrecerse
    setError((MENSAJES_ERROR[r.motivo] ?? MENSAJES_ERROR.error) + (r.detalle ? ` (${r.detalle})` : ''));
  }

  function ahoraNo() {
    try { localStorage.setItem(claveOculta(slug), String(Date.now())); } catch { /* da igual */ }
    setVisible(false);
  }

  return (
    <section className="a-up card" data-testid="invitacion-avisos" data-estado={estado}
      style={{ padding: 'var(--s-4)', display: 'flex', flexDirection: 'column', gap: 'var(--s-2)' }}>
      <p className="t-card-title" style={{ margin: 0 }}>
        {instalar ? t.titulo : 'Activa los avisos'}
      </p>
      <p className="t-small t-dim" style={{ margin: 0 }}>
        {instalar ? t.cuerpo : 'Te avisamos cuando se libera una plaza y antes de tu clase, aunque tengas la app cerrada.'}
      </p>
      {error && <p role="alert" className="t-small" style={{ margin: 0, color: 'var(--danger, #b3261e)' }}>{error}</p>}
      <div style={{ display: 'flex', gap: 'var(--s-2)', marginTop: 'var(--s-1)' }}>
        {!instalar && (
          <button type="button" className="btn btn--primary btn--sm tap" disabled={ocupado}
            style={{ boxShadow: 'none' }} onClick={() => void activar()}>
            {ocupado ? 'Activando…' : 'Activar avisos'}
          </button>
        )}
        <button type="button" className="btn btn--ghost btn--sm tap" onClick={ahoraNo}>
          {instalar ? 'Entendido' : 'Ahora no'}
        </button>
      </div>
    </section>
  );
}
