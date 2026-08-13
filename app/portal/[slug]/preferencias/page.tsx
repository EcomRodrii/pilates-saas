'use client';

import { useState, useEffect, useCallback } from 'react';
import { useStudio } from '@/lib/studio-context';
import { useModo } from '@/lib/portal-modo';
import { Card } from '@/components/portal/ui';
import { portalAuthHeader } from '@/lib/api-client';
import { fetchPreferencias, guardarPreferencia } from '@/lib/notifications/client';
import { CATEGORIAS_POR_ROL, CATEGORIA_ETIQUETA } from '@/lib/notifications/catalog';
import { activarPush, estadoPermiso } from '@/lib/notifications/push-client';
import type { ModoTokens } from '@/lib/portal-modo';
// La tipografía del tema, no tamaños sueltos: `display()` lee
// `--portal-heading-font`, así que con Tentada el título sale en Garamond y
// con Noir en su Instrument Sans. Antes esta pantalla era la única del portal
// con la tipografía a mano, y por eso no seguía a ningún tema.
import { display, micro } from '@/lib/portal-design';

// Antes "Preferencias" (disponibilidad, instructora/tipo/duración/nivel
// favoritos): esos campos se guardaban pero no los leía nada — ni el flujo de
// reserva ni Decision OS — y el propio copy prometía "te ayuda a
// recomendarte mejores horarios" sin que nunca fuera cierto. El nav ya
// llamaba a esta pantalla "Avisos" (portal-perfil-view.tsx), así que se
// retira lo cosmético y se deja solo lo que sí funciona. `favoritos_clase`
// (el chip "Favoritas" del calendario de reserva) es un sistema DISTINTO,
// ya conectado de verdad, y no se toca aquí.
export default function PreferenciasPage() {
  const { studio } = useStudio();
  const { t } = useModo();

  if (!studio?.id) return null;

  return (
    <div style={{ minHeight: '100%', background: t.bg }}>
      <div style={{ padding: '24px 20px 20px' }}>
        <h1 style={{ ...display(28), color: t.ink }}>Avisos</h1>
        <p style={{ color: t.muted, fontSize: 13, marginTop: 4 }}>Elige qué quieres saber y por dónde</p>
      </div>

      <div style={{ padding: '0 16px 24px', display: 'flex', flexDirection: 'column', gap: 20 }}>
        <AvisosSocia t={t} studioId={studio.id} />
      </div>
    </div>
  );
}

// ── Avisos de la socia: qué notificaciones quiere recibir (por categoría/canal).
// Estilo del portal (tokens de tema); guarda al vuelo vía /api/notifications/preferences.
function AvisosSocia({ t, studioId }: { t: ModoTokens; studioId: string }) {
  const cats = CATEGORIAS_POR_ROL.SOCIA;
  const [prefs, setPrefs] = useState<Record<string, { inapp: boolean; push: boolean }>>({});
  const [permiso, setPermiso] = useState<NotificationPermission | 'unsupported'>('default');
  const [activando, setActivando] = useState(false);

  const cargar = useCallback(async () => {
    setPrefs(await fetchPreferencias(portalAuthHeader) as Record<string, { inapp: boolean; push: boolean }>);
  }, []);
  // setState tras await (asíncrono) — falso positivo del lint del compilador.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void cargar(); setPermiso(estadoPermiso()); }, [cargar]);

  async function habilitarPush() {
    setActivando(true);
    const r = await activarPush(studioId, portalAuthHeader);
    setActivando(false);
    setPermiso(estadoPermiso());
    if (r.ok) { alert('¡Listo! Recibirás avisos en este dispositivo.'); return; }
    const msg: Record<string, string> = {
      denied: 'Has bloqueado las notificaciones. Actívalas desde los ajustes del navegador.',
      unsupported: 'En iPhone: instala la app en la pantalla de inicio (Compartir → Añadir a inicio) y ábrela desde ahí para poder recibir avisos.',
      'sin-clave': 'Las notificaciones aún no están listas. Espera unos minutos e inténtalo de nuevo.',
      error: 'No se ha podido activar. Asegúrate de haber abierto la app desde la pantalla de inicio e inténtalo otra vez.',
    };
    alert((msg[r.motivo] ?? 'No se ha podido activar.') + (r.detalle ? `\n\n(${r.detalle})` : ''));
  }

  async function toggle(cat: string, canal: 'inapp' | 'push') {
    const actual = prefs[cat] ?? { inapp: true, push: true };
    const siguiente = { ...actual, [canal]: !actual[canal] };
    setPrefs(p => ({ ...p, [cat]: siguiente }));
    await guardarPreferencia(portalAuthHeader, studioId, cat, siguiente);
  }

  const chip = (on: boolean): React.CSSProperties => ({
    fontSize: 12, fontWeight: 700, padding: '6px 12px', borderRadius: 999, border: 'none', cursor: 'pointer',
    background: on ? 'var(--portal-brand)' : t.surface2, color: on ? 'var(--portal-brand-foreground)' : t.muted,
  });

  return (
    <>
    <Card style={{ padding: 0, overflow: 'hidden' }}>
      {permiso !== 'unsupported' && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: '15px 16px', borderBottom: `1px solid ${t.line}` }}>
          <span style={{ fontSize: 12.5, fontWeight: 700, color: t.ink }}>Avisos en este dispositivo</span>
          {/* Botón SIEMPRE presente: aunque el permiso ya esté concedido puede no
              haber suscripción (falló antes) → hay que poder (re)activar. */}
          <button type="button" onClick={habilitarPush} disabled={activando || permiso === 'denied'}
            style={{ fontSize: 12, fontWeight: 800, padding: '6px 12px', borderRadius: 999, border: 'none', cursor: 'pointer', background: 'var(--portal-brand)', color: 'var(--portal-brand-foreground)', opacity: (activando || permiso === 'denied') ? 0.5 : 1 }}>
            {activando ? '…' : permiso === 'denied' ? 'Bloqueado' : permiso === 'granted' ? 'Reactivar' : 'Activar'}
          </button>
        </div>
      )}
      {cats.map((cat, i) => {
        const p = prefs[cat] ?? { inapp: true, push: true };
        return (
          <div key={cat} style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
            padding: '15px 16px',
            // Filas separadas por hilos dentro de una sola tarjeta, como el
            // diseño — en vez de una lista suelta con hueco entre filas.
            borderBottom: i === cats.length - 1 ? 'none' : `1px solid ${t.line}`,
          }}>
            <span style={{ fontSize: 13.5, fontWeight: 600, color: t.ink }}>{CATEGORIA_ETIQUETA[cat]}</span>
            {/* ⚠️ DOS controles y no un interruptor, aunque el prototipo dibuje
                uno: aquí se elige el canal (en la app o al móvil), y
                colapsarlo le quitaría a la socia poder recibir un aviso sin
                que le suene el teléfono. */}
            <div style={{ display: 'flex', gap: 6 }}>
              <button type="button" onClick={() => toggle(cat, 'inapp')} style={chip(p.inapp)} aria-pressed={p.inapp}>App</button>
              <button type="button" onClick={() => toggle(cat, 'push')} style={chip(p.push)} aria-pressed={p.push}>Push</button>
            </div>
          </div>
        );
      })}
    </Card>
    {/* Al pie y no arriba, como el diseño: es una advertencia, no una
        introducción, y arriba competía con la primera fila por la mirada.
        El texto se conserva tal cual — dice qué se manda siempre, y cambiarlo
        sería afirmar algo que no he comprobado. */}
    <p style={{ ...micro(11.5), color: t.muted, marginTop: 12, padding: '0 4px', lineHeight: 1.55, textTransform: 'none', letterSpacing: 0 }}>
      Elige qué quieres recibir y por dónde. Los avisos importantes de pago se envían siempre.
    </p>
    </>
  );
}
