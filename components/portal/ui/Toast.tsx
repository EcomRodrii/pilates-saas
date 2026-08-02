'use client';

// Aviso flotante temporal — sustituye al patrón de siempre en el portal (un
// párrafo gris fijo debajo de la lista, sin animación ni auto-desaparecer,
// ver portal-clases-view.tsx antes de esta fase). Sube desde abajo, se queda
// unos segundos y se retira sola — mismo lenguaje de feedback que el resto
// de la app (los estados de HojaPase también sustituyen contenido en el
// sitio en vez de apilar mensajes).
//
// `position: fixed` centrado por viewport (no `absolute` dentro de la
// pantalla, que es un contenedor con scroll propio): así queda anclado al
// fondo real de la ventana, alineado con el ancho del FRAME del portal
// (`components/portal/portal-shell.tsx`, `maxWidth:480` centrado), por
// encima de la tab bar flotante.

import { useEffect, useRef } from 'react';
import { CheckCircle2, AlertCircle } from 'lucide-react';
import { useModo } from '@/lib/portal-modo';
import { semantic } from '@/lib/portal-tokens';
import { EASE, dur } from '@/lib/portal-design';

export interface AvisoToast {
  texto: string;
  error?: boolean;
}

const DURACION_MS = { ok: 3000, error: 5000 };

export function Toast({ aviso, onDismiss }: { aviso: AvisoToast | null; onDismiss: () => void }) {
  const { t } = useModo();

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
    const id = setTimeout(() => onDismissRef.current(), aviso.error ? DURACION_MS.error : DURACION_MS.ok);
    return () => clearTimeout(id);
  }, [aviso]);

  const activo = !!aviso;

  return (
    <div
      aria-hidden={!activo}
      style={{
        position: 'fixed', left: '50%', bottom: 'calc(22px + env(safe-area-inset-bottom) + 76px)',
        width: 'min(calc(100% - 36px), 444px)', zIndex: 30,
        display: 'flex', justifyContent: 'center', pointerEvents: 'none',
        transform: `translateX(-50%) translateY(${activo ? 0 : 12}px)`,
        opacity: activo ? 1 : 0,
        transition: `opacity ${dur.card}ms ${EASE}, transform ${dur.card}ms ${EASE}`,
      }}
    >
      {aviso && (
        <div
          role={aviso.error ? 'alert' : 'status'}
          aria-live={aviso.error ? 'assertive' : 'polite'}
          style={{
            display: 'flex', alignItems: 'center', gap: 10, minWidth: 0,
            padding: '13px 16px', borderRadius: 16,
            background: aviso.error ? semantic.danger.text : t.ink,
            color: aviso.error ? '#FFFFFF' : t.bg,
            boxShadow: '0 14px 32px -12px rgba(0,0,0,.4)',
            fontSize: 13, fontWeight: 600, lineHeight: 1.3,
            pointerEvents: 'auto',
          }}
        >
          {aviso.error
            ? <AlertCircle size={16} style={{ flexShrink: 0 }} />
            : <CheckCircle2 size={16} style={{ flexShrink: 0 }} />}
          <span>{aviso.texto}</span>
        </div>
      )}
    </div>
  );
}
