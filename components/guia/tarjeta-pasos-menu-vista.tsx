// ─────────────────────────────────────────────────────────────────────────────
// Lo que se VE de «Configuración inicial» en el menú lateral (la lógica y los
// datos, en tarjeta-pasos-menu.tsx). Pura presentación: recibe un paso ya resuelto.
//
// Reglas (revisión del fundador, 5-nov-2026, tras ver la primera versión):
//   · Navegación estable: ocupa una ALTURA FIJA y pequeña, y NUNCA empuja ni oculta
//     un enlace del menú. Solo hay dos tamaños —la tarjeta (~96 px) y una fila
//     (~40 px)— y pasar de uno a otro no mueve nada más que a ella misma.
//   · Progreso visible pero sin protagonismo: «4/6» y una barra fina.
//   · Sin imágenes ni degradados: es una herramienta del menú, no un banner. El
//     detalle de cada paso vive en el Resumen / la lista de la barra superior.
//   · Se recoge y se recuerda; el progreso no se pierde (lo calcula el estudio).
//
// ⚠️ Vive dentro de la píldora oscura del menú, que es SIEMPRE oscura (también en
// modo claro): nada de tokens que se inviertan. Colores en blanco con alfa.
// ─────────────────────────────────────────────────────────────────────────────

'use client';

import Link from 'next/link';
import { useSyncExternalStore } from 'react';
import { ChevronDown, ChevronRight, ChevronUp, SkipForward } from 'lucide-react';
import { cn } from '@/lib/utils';

/** Lo que la tarjeta necesita saber, venga de la lista que venga. */
export interface Vista {
  /** El paso que se ofrece, contando desde 1. */
  paso: number;
  total: number;
  id: string;
  titulo: string;
  para: string;
  accion?: { label: string; href: string } | { label: string; abre: 'compartir' };
  /** Sin botón, la tarea se marca sola y no se puede omitir. */
  puedeOmitir: boolean;
  /** Lo que tarda, si la tarea lo dice (el Resumen enseña «≈ N min»). */
  minutos?: number;
}

type Modo = 'auto' | 'abierta' | 'recogida';
const CLAVE_MODO = 'tentare-tarjeta-menu-modo';

/** Auto = tarjeta en pantallas altas, fila en las bajas; lo que elija ella manda. */
const oyentes = new Set<() => void>();
function suscribir(cb: () => void) {
  oyentes.add(cb);
  return () => { oyentes.delete(cb); };
}
function leerModo(): Modo {
  try {
    const v = localStorage.getItem(CLAVE_MODO);
    if (v === 'abierta' || v === 'recogida') return v;
  } catch { /* sin almacenamiento: auto */ }
  return 'auto';
}
function useModo(): [Modo, (m: Modo) => void] {
  const modo = useSyncExternalStore(suscribir, leerModo, () => 'auto' as Modo);
  const fijar = (m: Modo) => {
    try { localStorage.setItem(CLAVE_MODO, m); } catch { /* idem */ }
    oyentes.forEach((cb) => cb());
  };
  return [modo, fijar];
}

/** Progreso en segmentos finos: llenos hasta las tareas hechas. */
function Segmentos({ hechas, total }: { hechas: number; total: number }) {
  return (
    <span role="img" aria-label={`${hechas} de ${total} hechos`} className="flex flex-1 items-center gap-[3px]">
      {Array.from({ length: total }, (_, i) => (
        <span key={i} aria-hidden className={cn('h-[3px] flex-1 rounded-full transition-colors', i < hechas ? 'bg-white/85' : 'bg-white/15')} />
      ))}
    </span>
  );
}

/** Anillo de progreso para el menú pequeño (el menú entero mide ~72 px de ancho). */
function Anillo({ hechas, total }: { hechas: number; total: number }) {
  const r = 14;
  const c = 2 * Math.PI * r;
  return (
    <span aria-hidden className="relative grid size-9 place-items-center">
      <svg viewBox="0 0 36 36" className="absolute inset-0 -rotate-90">
        <circle cx="18" cy="18" r={r} fill="none" strokeWidth="3" className="stroke-white/15" />
        <circle cx="18" cy="18" r={r} fill="none" strokeWidth="3" strokeLinecap="round" className="stroke-white/85"
          strokeDasharray={c} strokeDashoffset={c * (1 - hechas / total)} />
      </svg>
      <span className="font-t-mono text-[11px] font-medium tabular-nums text-white">{hechas}</span>
    </span>
  );
}

function Accion({ vista, onCompartir, className, children }: {
  vista: Vista; onCompartir: () => void; className: string; children: React.ReactNode;
}) {
  const a = vista.accion;
  if (!a) return null;
  if ('abre' in a) return <button type="button" onClick={onCompartir} className={className}>{children}</button>;
  return <Link href={a.href} className={className}>{children}</Link>;
}

const FOCO = 'outline-none focus-visible:ring-2 focus-visible:ring-white/40';

export function TarjetaVista({ vista, colapsado, onOmitir, onCompartir }: {
  vista: Vista; colapsado: boolean; onOmitir: () => void; onCompartir: () => void;
}) {
  const [modo, fijar] = useModo();
  // Mismo número que el Resumen y la píldora de arriba: tareas HECHAS de total.
  const hechas = vista.paso - 1;
  const pendientes = vista.total - hechas;
  const texto = `${hechas} de ${vista.total} hechos`;

  // Menú pequeño: solo el anillo. Lleva a lo que toca, o al Resumen si se marca solo.
  if (colapsado) {
    const clase = cn('zona-tactil mx-auto flex size-10 items-center justify-center rounded-full transition-colors hover:bg-white/10', FOCO);
    const titulo = `Configuración inicial · ${texto}`;
    return (
      <div className="shrink-0 px-2 pb-2" data-tarjeta-menu-pasos="" data-testid="tarjeta-menu-pasos">
        {vista.accion
          ? <Accion vista={vista} onCompartir={onCompartir} className={clase}><Anillo hechas={hechas} total={vista.total} /><span className="sr-only">{titulo}</span></Accion>
          : <Link href="/dashboard" title={titulo} className={clase}><Anillo hechas={hechas} total={vista.total} /><span className="sr-only">{titulo}</span></Link>}
      </div>
    );
  }

  const mostrarFila = cn(modo === 'recogida' ? 'flex' : modo === 'abierta' ? 'hidden' : 'flex [@media(min-height:900px)]:hidden');
  const mostrarTarjeta = cn(modo === 'recogida' ? 'hidden' : modo === 'abierta' ? 'block' : 'hidden [@media(min-height:900px)]:block');

  return (
    <div className="shrink-0 px-3 pb-2" data-tarjeta-menu-pasos="" data-testid="tarjeta-menu-pasos">
      {/* Fila (recogida): 40 px, para no robarle sitio al menú. */}
      <div className={cn('h-10 items-center gap-2 rounded-xl bg-white/[0.06] pl-3 pr-1', mostrarFila)}>
        <Link href="/dashboard" className={cn('zona-tactil flex min-w-0 flex-1 items-center gap-2 rounded-lg py-1', FOCO)}>
          <span className="truncate text-[12px] font-semibold text-white/90">Configuración inicial</span>
          <span className="shrink-0 font-t-mono text-[11px] tabular-nums text-white/55">{hechas}/{vista.total}</span>
        </Link>
        <button type="button" onClick={() => fijar('abierta')} aria-label="Mostrar «Configuración inicial»"
          className={cn('zona-tactil grid size-8 shrink-0 place-items-center rounded-full text-white/50 transition-colors hover:bg-white/10 hover:text-white', FOCO)}>
          <ChevronUp size={15} aria-hidden />
        </button>
      </div>

      {/* Tarjeta: altura contenida (~96 px), siempre la misma. */}
      <section aria-label="Configuración inicial" className={cn('rounded-xl bg-white/[0.06] p-3', mostrarTarjeta)}>
        <div className="flex items-center gap-2">
          <h2 className="min-w-0 flex-1 truncate text-[12px] font-semibold text-white/90">Configuración inicial</h2>
          <span className="shrink-0 font-t-mono text-[11px] tabular-nums text-white/60">{hechas}/{vista.total}</span>
          <button type="button" onClick={() => fijar('recogida')} aria-label="Recoger «Configuración inicial»"
            className={cn('zona-tactil -mr-1 grid size-6 shrink-0 place-items-center rounded-full text-white/45 transition-colors hover:bg-white/10 hover:text-white', FOCO)}>
            <ChevronDown size={14} aria-hidden />
          </button>
        </div>

        <div className="mt-2"><Segmentos hechas={hechas} total={vista.total} /></div>

        <div className="mt-2.5 flex items-center gap-1">
          {(() => {
            const contenido = (
              <>
                <span className="min-w-0 flex-1 text-left">
                  <span className="block truncate text-[12.5px] font-semibold leading-tight text-white">{vista.titulo}</span>
                  <span className="mt-0.5 block truncate text-[11px] leading-tight text-white/55">
                    {vista.minutos ? `≈ ${vista.minutos} min · ` : ''}{vista.para}
                  </span>
                </span>
                <ChevronRight size={15} aria-hidden className="shrink-0 text-white/45 transition-transform group-hover:translate-x-0.5 group-hover:text-white" />
              </>
            );
            const clase = cn('zona-tactil group -mx-1 flex min-w-0 flex-1 items-center gap-1.5 rounded-lg px-1 py-1 transition-colors hover:bg-white/5', FOCO);
            return vista.accion
              ? <Accion vista={vista} onCompartir={onCompartir} className={clase}>{contenido}</Accion>
              : <Link href="/dashboard" className={clase}>{contenido}</Link>;
          })()}
          {vista.puedeOmitir && (
            <button type="button" onClick={onOmitir} aria-label="Omitir este paso" title={`Omitir este paso (quedan ${pendientes})`}
              className={cn('zona-tactil grid size-7 shrink-0 place-items-center rounded-full text-white/40 transition-colors hover:bg-white/10 hover:text-white/80', FOCO)}>
              <SkipForward size={13} aria-hidden />
            </button>
          )}
        </div>
      </section>
    </div>
  );
}
