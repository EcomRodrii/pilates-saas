// ─────────────────────────────────────────────────────────────────────────────
// Lo que se VE de «Pon en marcha tu estudio» (la lógica y los datos, en
// tarjeta-pasos-menu.tsx). Pura presentación: recibe un paso ya resuelto.
//
// Tarjeta de dos capas, sin nada solapado: cabecera con el degradado de la
// maqueta (gris → rosa → melocotón) y el regalo dentro; debajo, el cuerpo oscuro
// con el paso, el progreso y la acción. Plegable a una fila; se recuerda.
// ─────────────────────────────────────────────────────────────────────────────

'use client';

import Link from 'next/link';
import { useSyncExternalStore } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { cn } from '@/lib/utils';
import { BOTON_DESTACADO } from '@/components/dashboard/vivo';
import { RegaloMonedas } from './regalo-monedas';

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

/** Auto = abierta en pantallas altas, recogida en las bajas; lo que elija ella manda. */
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

/** Progreso en segmentos: llenos hasta el paso en que va. */
function Segmentos({ hechas, total }: { hechas: number; total: number }) {
  return (
    <span role="img" aria-label={`${hechas} de ${total} hechos`} className="flex flex-1 items-center gap-1">
      {Array.from({ length: total }, (_, i) => (
        <span
          key={i}
          aria-hidden
          className={cn('h-[4px] flex-1 rounded-full transition-colors', i < hechas ? 'bg-[#F08A32]' : 'bg-white/15')}
        />
      ))}
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

export function TarjetaVista({ vista, colapsado, onOmitir, onCompartir }: {
  vista: Vista; colapsado: boolean; onOmitir: () => void; onCompartir: () => void;
}) {
  const [modo, fijar] = useModo();
  // Mismo número que el Resumen y la píldora de arriba: tareas HECHAS de total.
  const hechas = vista.paso - 1;
  const texto = `${hechas} de ${vista.total} hechos`;

  // Menú pequeño: solo el regalo. Lleva a lo que toca, o al Resumen si se marca solo.
  if (colapsado) {
    const clase = 'zona-tactil group mx-auto flex size-10 items-center justify-center rounded-full transition-colors hover:bg-card/5';
    const regalo = <RegaloMonedas className="size-8 object-contain transition-transform group-hover:-rotate-6 group-hover:scale-110" />;
    const titulo = `Pon en marcha tu estudio · ${texto}`;
    return (
      <div className="shrink-0 px-2 pb-2" data-tarjeta-menu-pasos="" data-testid="tarjeta-menu-pasos">
        {vista.accion
          ? <Accion vista={vista} onCompartir={onCompartir} className={clase}>{regalo}<span className="sr-only">{titulo}</span></Accion>
          : <Link href="/dashboard" title={titulo} className={clase}>{regalo}<span className="sr-only">{titulo}</span></Link>}
      </div>
    );
  }

  const mostrarFila = cn(modo === 'recogida' ? 'block' : modo === 'abierta' ? 'hidden' : '[@media(min-height:1000px)]:hidden');
  const mostrarTarjeta = cn(modo === 'recogida' ? 'hidden' : modo === 'abierta' ? 'block' : 'hidden [@media(min-height:1000px)]:block');

  return (
    <div className="shrink-0 px-3 pb-2" data-tarjeta-menu-pasos="" data-testid="tarjeta-menu-pasos">
      {/* Fila recogida: para no robarle sitio al menú. */}
      <div className={cn('flex items-center gap-1 rounded-2xl bg-white/[0.06] p-1.5 pr-1', mostrarFila)}>
        {vista.accion ? (
          <Accion vista={vista} onCompartir={onCompartir} className="zona-tactil group flex min-w-0 flex-1 items-center gap-2.5 rounded-xl p-1 text-left transition-colors hover:bg-white/5">
            <FilaContenido texto={texto} />
          </Accion>
        ) : (
          <Link href="/dashboard" className="zona-tactil group flex min-w-0 flex-1 items-center gap-2.5 rounded-xl p-1 text-left transition-colors hover:bg-white/5">
            <FilaContenido texto={texto} />
          </Link>
        )}
        <button
          type="button"
          onClick={() => fijar('abierta')}
          aria-label="Desplegar «Pon en marcha tu estudio»"
          className="zona-tactil grid size-8 shrink-0 place-items-center rounded-full text-white/50 transition-colors hover:bg-white/10 hover:text-white"
        >
          <ChevronUp size={15} aria-hidden />
        </button>
      </div>

      {/* Tarjeta entera. */}
      <section
        aria-label="Pon en marcha tu estudio"
        className={cn('overflow-hidden rounded-[22px] bg-[#141414] ring-1 ring-white/10 shadow-[0_14px_30px_-16px_rgba(0,0,0,0.8)]', mostrarTarjeta)}
      >
        {/* Cabecera: el degradado de la maqueta, con el regalo dentro (nada se sale). */}
        <div
          className="relative h-[104px] overflow-hidden"
          style={{ backgroundImage: 'linear-gradient(120deg, #9b9aa3 0%, #d9a4c6 46%, #f5b99a 100%)' }}
        >
          <span className="absolute left-3 top-3 rounded-full bg-black/35 px-2.5 py-1 font-t-mono text-[10.5px] font-medium tabular-nums text-white backdrop-blur-sm">
            {texto}
          </span>
          <RegaloMonedas className="pointer-events-none absolute bottom-1 right-3 h-[92px] w-auto -rotate-3 object-contain drop-shadow-[0_10px_10px_rgba(60,20,40,0.35)]" />
          <button
            type="button"
            onClick={() => fijar('recogida')}
            aria-label="Recoger «Pon en marcha tu estudio»"
            className="zona-tactil absolute left-2 bottom-2 grid size-7 place-items-center rounded-full bg-black/30 text-white/85 backdrop-blur-sm transition-colors hover:bg-black/50"
          >
            <ChevronDown size={14} aria-hidden />
          </button>
        </div>

        <div className="p-3.5 pt-3">
          <h2 className="text-[14.5px] font-bold leading-tight text-white">Pon en marcha tu estudio</h2>
          <p className="mt-1.5 line-clamp-3 text-[11.5px] leading-[16px] text-white/60">
            <b className="font-semibold text-white/90">{vista.titulo}.</b> {vista.para}
            {vista.minutos ? <span className="ml-1 font-t-mono text-[10.5px] text-white/45">≈ {vista.minutos} min</span> : null}
          </p>

          <div className="mt-3 flex items-center gap-2.5">
            <Segmentos hechas={hechas} total={vista.total} />
            <span className="font-t-mono text-[10.5px] tabular-nums text-white/55">{hechas}/{vista.total}</span>
          </div>

          {vista.accion && (
            <Accion vista={vista} onCompartir={onCompartir} className={cn(BOTON_DESTACADO, 'mt-3 h-9 w-full px-3 text-[12.5px]')}>
              <span className="truncate">{vista.accion.label}</span>
            </Accion>
          )}

          {vista.puedeOmitir && (
            <button
              type="button"
              onClick={onOmitir}
              className="zona-tactil mt-1.5 w-full rounded-full py-1.5 text-center text-[11.5px] font-medium text-white/45 transition-colors hover:bg-white/5 hover:text-white/80"
            >
              Omitir
            </button>
          )}
        </div>
      </section>
    </div>
  );
}

function FilaContenido({ texto }: { texto: string }) {
  return (
    <>
      <span
        className="grid size-10 shrink-0 place-items-center rounded-xl"
        style={{ backgroundImage: 'linear-gradient(135deg, #9b9aa3, #d9a4c6 55%, #f5b99a)' }}
      >
        <RegaloMonedas className="size-8 object-contain transition-transform group-hover:-rotate-6" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[12.5px] font-semibold leading-tight text-white">Pon en marcha tu estudio</span>
        <span className="block font-t-mono text-[10.5px] leading-tight text-white/55">{texto}</span>
      </span>
    </>
  );
}
