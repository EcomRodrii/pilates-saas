'use client';

import { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { Maximize2, PanelRight, SquarePen, Sparkles, X } from 'lucide-react';
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
  const router = useRouter();
  if (!puerta || !studio) return null;
  const yo = instructores.find(i => i.authUserId === user?.id);
  const nombre = yo?.nombre?.trim().split(/\s+/)[0] ?? null;
  return (
    <aside
      aria-label="Pregúntale a Tentare"
      aria-hidden={!abierta}
      inert={!abierta}
      data-columna-asistente
      className="fixed bottom-1 right-1 top-1 z-20 hidden flex-col overflow-hidden rounded-2xl bg-card shadow-[0_24px_56px_-12px_#0000003d,0_0_0_1px_#00000012] transition-[transform,opacity] duration-300 ease-[cubic-bezier(0.2,0.8,0,1)] md:flex"
      style={{
        width: ANCHO_COLUMNA_ASISTENTE - 4,
        transform: abierta ? 'none' : 'translateX(calc(100% + 8px))',
        opacity: abierta ? 1 : 0,
      }}
    >
      {/* Cabecera de Shopify: el título a la izquierda y tres botones redondos con el cristal de las píldoras. */}
      <header className="flex h-12 shrink-0 items-center justify-between pl-4 pr-2">
        <p className="text-[13px] font-medium text-[#4a4a4a]">Tentare</p>
        <div className="flex items-center gap-1.5">
          <BotonCabecera etiqueta="Nueva conversación" onClick={() => window.dispatchEvent(new Event('asistente:nueva'))}><SquarePen size={15} aria-hidden="true" /></BotonCabecera>
          <BotonCabecera etiqueta="Abrir a pantalla completa" onClick={() => { cerrar(); router.push('/asistente'); }}><Maximize2 size={15} aria-hidden="true" /></BotonCabecera>
          <BotonCabecera etiqueta="Cerrar el asistente" onClick={cerrar}><X size={16} aria-hidden="true" /></BotonCabecera>
        </div>
      </header>
      <div className="min-h-0 flex-1">
        {abierta && <VistaChat flotante studioId={studio.id} veDinero={puedeVerFinanzas(rol)} nombre={nombre} preguntaInicial={pregunta} />}
      </div>
    </aside>
  );
}

function BotonCabecera({ etiqueta, onClick, children }: { etiqueta: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button" onClick={onClick} aria-label={etiqueta} title={etiqueta}
      className="zona-tactil inline-flex size-7 items-center justify-center rounded-full bg-white text-foreground shadow-[0_0_0_1px_#00000012,0_2px_20px_#00000008,0_5px_20px_#00000008] transition-[background-color,transform] duration-150 hover:bg-[#f7f7f7] active:scale-95 focus-visible:outline-2 focus-visible:outline-ring"
    >
      {children}
    </button>
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
      className="group fixed bottom-4 left-[calc(50%+var(--sidebar-w,0px)/2)] z-20 hidden h-11 w-[340px] -translate-x-1/2 items-center gap-2 rounded-full bg-white pl-2 pr-1.5 text-[13px] text-[#4a4a4a] shadow-[0_0_0_1px_#00000012,0_2px_20px_#00000008,0_5px_20px_#00000008,0_8px_60px_#00000008] transition-[transform,box-shadow,opacity] duration-200 ease-[cubic-bezier(0.2,0.8,0,1)] hover:-translate-y-0.5 hover:shadow-[0_0_0_1px_#0000001f,0_6px_24px_#00000014,0_12px_60px_#0000000f] active:translate-y-0 active:scale-[0.99] focus-visible:outline-2 focus-visible:outline-ring md:flex"
      style={{ opacity: abierta ? 0 : 1, pointerEvents: abierta ? 'none' : 'auto' }}
    >
      <span aria-hidden="true" className="flex size-7 shrink-0 items-center justify-center rounded-full bg-[color-mix(in_srgb,var(--t-blue-500)_12%,white)] text-[var(--t-blue-500)]">
        <Sparkles size={14} />
      </span>
      <span className="flex-1 truncate text-left">Pregúntale a Tentare</span>
      <kbd className="font-mono text-[11px] leading-none text-muted-foreground/70">⌘J</kbd>
      <span aria-hidden="true" className="mx-0.5 h-4 w-px bg-black/10" />
      <span aria-hidden="true" className="flex size-7 items-center justify-center rounded-full text-foreground transition-colors group-hover:bg-[#f7f7f7]"><PanelRight size={15} /></span>
    </button>
  );
}
