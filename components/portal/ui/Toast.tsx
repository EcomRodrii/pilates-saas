'use client';

// Aviso flotante temporal — sustituye al patrón de siempre en el portal (un
// párrafo gris fijo debajo de la lista, sin animación ni auto-desaparecer,
// ver portal-clases-view.tsx antes de esta fase). Entra desde arriba con
// `apToast` (CHEATSHEET-CSS.md "Toast"), se queda unos segundos y se retira
// sola — mismo lenguaje de feedback que el resto de la app (los estados de
// HojaPase también sustituyen contenido en el sitio en vez de apilar
// mensajes).
//
// `position: fixed` centrado por viewport (no `absolute` dentro de la
// pantalla, que es un contenedor con scroll propio): así queda anclado al
// fondo real de la ventana, alineado con el ancho del FRAME del portal
// (`components/portal/portal-shell.tsx`, `maxWidth:480` centrado).

import { useEffect, useRef } from 'react';
import { CheckCircle2, AlertCircle } from 'lucide-react';
import { sans } from '@/lib/portal-design';

export interface AvisoToast {
  texto: string;
  error?: boolean;
  // Feature #1 (autoservicio de cancelación/recuperación): "Reagendar" tras
  // cancelar una plaza fija con crédito de recuperación. Opcional — el resto
  // de toasts del portal no lo necesitan.
  accion?: { texto: string; onClick: () => void };
}

// Con CTA se da más margen: 3s es tiempo de sobra para leer pero no para
// reaccionar y tocar un botón.
const DURACION_MS = { ok: 3000, error: 5000, accion: 7000 };

export function Toast({ aviso, onDismiss }: { aviso: AvisoToast | null; onDismiss: () => void }) {
  // `onDismiss` casi siempre llega como una arrow function nueva en cada
  // render del padre (`() => setAviso(null)`) — con ella en las dependencias,
  // cualquier re-render del padre reinicia la cuenta atrás desde cero. Con el
  // refresco activo de Fase 3 (REFRESCO_ACTIVO_MS, cada 5s) los padres que
  // muestran este toast se re-renderizan solos con frecuencia, así que el
  // aviso podía no desaparecer nunca por su cuenta. Guardar la última
  // referencia en un ref y depender solo de `aviso` en el efecto lo aísla.
  const onDismissRef = useRef(onDismiss);
  useEffect(() => { onDismissRef.current = onDismiss; });
  useEffect(() => {
    if (!aviso) return;
    const duracion = aviso.accion ? DURACION_MS.accion : (aviso.error ? DURACION_MS.error : DURACION_MS.ok);
    const id = setTimeout(() => onDismissRef.current(), duracion);
    return () => clearTimeout(id);
  }, [aviso]);

  return (
    <div
      aria-hidden={!aviso}
      style={{
        position: 'fixed', left: '50%', top: 58,
        width: 'min(calc(100% - 36px), 444px)', zIndex: 30,
        display: 'flex', justifyContent: 'center', pointerEvents: 'none',
        transform: 'translateX(-50%)',
      }}
    >
      {aviso && (
        <div
          role={aviso.error ? 'alert' : 'status'}
          aria-live={aviso.error ? 'assertive' : 'polite'}
          style={{
            display: 'flex', alignItems: 'center', gap: 10, minWidth: 0,
            padding: '10px 18px', borderRadius: 999,
            background: aviso.error ? '#C2503A' : '#1A1A1A',
            color: aviso.error ? '#FFFFFF' : '#F1ECE1',
            boxShadow: '0 14px 34px rgba(15,15,15,.35)',
            fontFamily: sans, fontSize: 12.5, fontWeight: 700, lineHeight: 1.3,
            pointerEvents: 'auto',
            animation: 'apToast .35s cubic-bezier(.34,1.4,.5,1) both',
          }}
        >
          {aviso.error
            ? <AlertCircle size={16} style={{ flexShrink: 0 }} />
            : <CheckCircle2 size={16} style={{ flexShrink: 0 }} />}
          <span style={{ flex: 1 }}>{aviso.texto}</span>
          {aviso.accion && (
            <button
              type="button"
              onClick={() => { onDismissRef.current(); aviso.accion?.onClick(); }}
              style={{
                flexShrink: 0, border: 'none', background: 'transparent', cursor: 'pointer',
                color: 'inherit', fontFamily: sans, fontSize: 12.5, fontWeight: 800, textDecoration: 'underline',
                // Mínimo táctil de 44px (mismo criterio que Button.tsx/Pill.tsx/
                // Tabs.tsx en este mismo directorio) — el texto solo no llega ni
                // de lejos; el contenedor centra verticalmente (`alignItems:
                // 'center'`), así que esto ensancha el toast entero en vez de
                // dejar el botón clavado en una esquina imposible de tocar.
                minHeight: 44, minWidth: 44, padding: '0 4px', display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}
            >
              {aviso.accion.texto}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
