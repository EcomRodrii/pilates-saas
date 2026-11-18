'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { Sparkles, X } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { useCore } from '@/lib/core-context';
import { useRol } from '@/lib/permisos';
import { puedeVerFinanzas } from '@/lib/permisos-reglas';
import { usePuertaAsistente } from '@/lib/asistente-context';
import { ANCHO_COLUMNA_ASISTENTE, useColumnaAsistente } from '@/lib/asistente-columna';
import dynamic from 'next/dynamic';

// El chat llega aparte, al abrir la columna: no viaja con el panel (lo vigilan e2e/asistente*.spec.ts).
const VistaChat = dynamic(() => import('@/components/asistente/vista-chat').then(m => m.VistaChat), { ssr: false });

// «Pregúntale a Tentare» como columna a la derecha del lienzo y como píldora flotante abajo al
// centro (marco a sangre). Solo con `SHELL_NUEVO` y donde el asistente está disponible (rol, plan
// e interruptor `ASISTENTE_IA`, lo decide `usePuertaAsistente`). Sin Tenti: su lista de sitios
// (`lib/tenti/donde-vive-tenti.test.ts`) no incluye esta superficie.

/** La columna. El lienzo cede el ancho por `lg:pr-[…]` en `dashboard-shell.tsx`. */
export function ColumnaAsistente() {
  const puerta = usePuertaAsistente();
  const { abierta, cerrar, pregunta } = useColumnaAsistente();
  const { studio, instructores } = useCore();
  const { user } = useAuth();
  const rol = useRol();
  if (!puerta || !studio) return null;
  const yo = instructores.find(i => i.authUserId === user?.id);
  const nombre = yo?.nombre?.trim().split(/\s+/)[0] ?? null;
  return (
    <aside
      aria-label="Pregúntale a Tentare"
      aria-hidden={!abierta}
      inert={!abierta}
      data-columna-asistente
      className="fixed bottom-1 right-1 top-1 z-20 hidden flex-col overflow-hidden rounded-2xl bg-card transition-[transform,opacity] duration-300 ease-[cubic-bezier(0.2,0.8,0,1)] lg:flex"
      style={{
        width: ANCHO_COLUMNA_ASISTENTE - 4,
        transform: abierta ? 'none' : 'translateX(calc(100% + 8px))',
        opacity: abierta ? 1 : 0,
      }}
    >
      <header className="flex h-11 shrink-0 items-center justify-between px-3">
        <p className="text-[13px] font-medium text-foreground">Tentare</p>
        <button type="button" onClick={cerrar} aria-label="Cerrar el asistente" className="zona-tactil inline-flex size-7 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">
          <X size={16} aria-hidden="true" />
        </button>
      </header>
      <div className="min-h-0 flex-1">
        {abierta && <VistaChat flotante studioId={studio.id} veDinero={puedeVerFinanzas(rol)} nombre={nombre} preguntaInicial={pregunta} />}
      </div>
    </aside>
  );
}

/** La píldora de abajo al centro del lienzo; se esconde con la columna abierta. */
export function PildoraAsistente() {
  const puerta = usePuertaAsistente();
  const { abierta, abrir, alternar } = useColumnaAsistente();
  const enElChat = (usePathname() ?? '').startsWith('/asistente');
  // ⌘J abre y cierra la columna en lugar de navegar a /asistente. En FASE DE CAPTURA, antes que el
  // atajo del proveedor (que navega), y solo donde el asistente está disponible.
  useEffect(() => {
    if (!puerta) return;
    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || e.key.toLowerCase() !== 'j' || e.shiftKey || e.altKey) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      alternar();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [puerta, alternar]);
  // En /asistente el chat ya es la pantalla: la píldora que lo abre sobraría.
  if (!puerta || enElChat) return null;
  return (
    <button
      type="button"
      onClick={() => abrir()}
      data-pildora-asistente
      aria-hidden={abierta}
      tabIndex={abierta ? -1 : 0}
      className="fixed bottom-4 left-[calc(50%+var(--sidebar-w,0px)/2)] z-20 hidden h-11 w-[300px] -translate-x-1/2 items-center gap-2 rounded-full border border-border bg-card px-3 text-[13px] text-muted-foreground shadow-t-floating transition-[opacity,transform] duration-300 ease-[cubic-bezier(0.2,0.8,0,1)] hover:text-foreground lg:flex"
      style={{ opacity: abierta ? 0 : 1, pointerEvents: abierta ? 'none' : 'auto' }}
    >
      <Sparkles size={15} aria-hidden="true" className="shrink-0 text-[var(--t-blue-500)]" />
      <span className="flex-1 text-left">Pregúntale a Tentare</span>
      <kbd className="font-mono text-[11px] leading-none text-muted-foreground/70">⌘J</kbd>
    </button>
  );
}
