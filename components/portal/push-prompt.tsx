'use client';

import { useEffect, useState } from 'react';
import { Bell, X } from 'lucide-react';
import { usePortalAuth } from '@/lib/portal-auth';
import { useStudio } from '@/lib/studio-context';
import { useModo } from '@/lib/portal-modo';
import { portalAuthHeader } from '@/lib/api-client';
import { activarPush, estadoPermiso, esIOS, esStandalone } from '@/lib/notifications/push-client';

// Aviso proactivo de UN TOQUE para activar las notificaciones nada más entrar al
// portal, en vez de esconderlo en Ajustes (la clienta nunca lo encontraba y se
// quedaba sin avisos). El navegador EXIGE un gesto del usuario para pedir permiso,
// así que esto es un CTA que ella pulsa, NO un auto-disparo silencioso.
// - permiso 'granted' → re-suscribe en silencio (auto-sanación) y no molesta.
// - permiso 'default'  → muestra el CTA (salvo que ya lo descartara antes).
// - iOS sin instalar   → explica "Añadir a pantalla de inicio" (única vía en iPhone).
// - 'denied'           → nada (el navegador ya no volverá a preguntar).
type Vista = 'oculto' | 'cta' | 'ios-instalar';

export function PushPrompt() {
  const { session } = usePortalAuth();
  const { studio } = useStudio();
  const { t } = useModo();
  const [vista, setVista] = useState<Vista>('oculto');
  const [procesando, setProcesando] = useState(false);

  const socioId = session?.socioId ?? null;
  const studioId = studio?.id ?? null;

  useEffect(() => {
    if (!socioId || !studioId) return;
    let descartado = false;
    try { descartado = localStorage.getItem(`ps_portal_push_prompt_dismissed_${socioId}`) === '1'; } catch { /* modo privado */ }

    const permiso = estadoPermiso();
    if (permiso === 'granted') {
      // Ya concedido: re-suscribe en silencio para asegurar que la suscripción
      // sigue guardada en BD (un intento anterior pudo fallar). No requiere gesto.
      void activarPush(studioId, portalAuthHeader);
      return;
    }
    if (descartado) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- Consulta Notification.permission, una API del navegador. No existe en servidor.
    if (permiso === 'default') setVista('cta');
    else if (permiso === 'unsupported' && esIOS() && !esStandalone()) setVista('ios-instalar');
  }, [socioId, studioId]);

  function descartar() {
    if (socioId) { try { localStorage.setItem(`ps_portal_push_prompt_dismissed_${socioId}`, '1'); } catch { /* modo privado */ } }
    setVista('oculto');
  }

  async function activar() {
    if (!studioId) return;
    setProcesando(true);
    // ok o denegado: en ambos casos ocultamos (el navegador no re-preguntará).
    await activarPush(studioId, portalAuthHeader);
    setProcesando(false);
    setVista('oculto');
  }

  if (vista === 'oculto') return null;

  return (
    <div style={{ position: 'absolute', top: 'calc(env(safe-area-inset-top) + 10px)', left: 16, right: 16, zIndex: 45 }}>
      <div style={{ background: t.surface, border: `1px solid ${t.line}`, borderRadius: 16, padding: 14, boxShadow: '0 10px 30px rgba(0,0,0,0.20)', display: 'flex', gap: 12, alignItems: 'flex-start' }}>
        <div style={{ width: 36, height: 36, borderRadius: 10, background: 'var(--ap-tinta, #1A1A1A)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <Bell size={18} style={{ color: '#F1ECE1' }} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          {vista === 'cta' ? (
            <>
              <p style={{ fontSize: 14, fontWeight: 600, color: t.ink, margin: 0 }}>¿Te avisamos de tus clases?</p>
              <p style={{ fontSize: 12.5, color: t.muted, margin: '2px 0 10px' }}>Recordatorios, cambios de horario y huecos libres, directo al móvil.</p>
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={activar} disabled={procesando} style={{ background: 'var(--ap-tinta, #1A1A1A)', color: '#F1ECE1', border: 'none', borderRadius: 999, padding: '7px 14px', fontSize: 13, fontWeight: 600, opacity: procesando ? 0.6 : 1, cursor: 'pointer' }}>
                  {procesando ? 'Activando…' : 'Sí, avísame'}
                </button>
                <button onClick={descartar} style={{ background: 'transparent', color: t.muted, border: 'none', borderRadius: 999, padding: '7px 12px', fontSize: 13, fontWeight: 500, cursor: 'pointer' }}>Ahora no</button>
              </div>
            </>
          ) : (
            <>
              <p style={{ fontSize: 14, fontWeight: 600, color: t.ink, margin: 0 }}>Activa los avisos en tu iPhone</p>
              <p style={{ fontSize: 12.5, color: t.muted, margin: '2px 0 0' }}>Toca <b>Compartir</b> y luego <b>Añadir a pantalla de inicio</b>. Abre Tentare desde ahí y podrás recibir notificaciones.</p>
            </>
          )}
        </div>
        <button onClick={descartar} aria-label="Cerrar" style={{ background: 'transparent', border: 'none', color: t.muted, flexShrink: 0, padding: 2, cursor: 'pointer' }}>
          <X size={16} />
        </button>
      </div>
    </div>
  );
}
