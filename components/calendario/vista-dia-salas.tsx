'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronsDownUp } from 'lucide-react';
import { escalaDia, minutoDeY, textoTramoPlegado, yDeMinuto } from '@/lib/calendario/escala-dia';
import { redondearAIntervalo } from '@/lib/calendario-arrastre';
import type { ColumnaSala } from '@/lib/calendario-columnas';
import type { EstadoSesion } from '@/lib/calendario-estado';
import type { Sesion, TipoClase, Instructor, Reserva } from '@/lib/types';
import { cn } from '@/lib/utils';
import { tramosCerrados, type HorarioDiaCalendario } from '@/lib/calendario/horas-cerradas';
import { TarjetaClase, type DatosTarjeta } from './tarjeta-clase';

// El Día: una columna por sala, cada clase del alto de su duración. Es la vista
// del mostrador (con la ficha de la clase abierta al lado) y donde se cambia la
// hora exacta de una clase arrastrándola. Las horas muertas se pliegan
// (lib/calendario/escala-dia.ts), y todo —pintar, arrastrar, tocar un hueco—
// pasa por la misma escala.

export interface DatoSesion {
  sesion: Sesion;
  tipo: TipoClase;
  instructor: Instructor | null;
  reservasSesion: Reserva[];
  estado: EstadoSesion;
}

const ANCHO_MIN_COLUMNA_PX = 150;
const ANCHO_GUTTER_PX = 52;

export interface VistaDiaSalasProps {
  columnas: ColumnaSala[];
  tarjetas: ReadonlyMap<string, DatosTarjeta>;
  aperturaMin: number;
  cierreMin: number;
  /** El horario de ESTE día: lo que cae fuera se pinta como «Cerrado». Sin dato, no se pinta nada. */
  horarioDia?: HorarioDiaCalendario;
  pxPorHora: number;
  /** Minutos desde medianoche de «ahora», solo si el día mostrado es hoy. */
  ahoraMin: number | null;
  seleccionadaId: string | null;
  marcadas: ReadonlySet<string>;
  enSeleccion: boolean;
  atenuada: (id: string) => boolean;
  onSeleccionar: (id: string) => void;
  arrastrable: (id: string) => boolean;
  /** Soltar en una sala a una hora (redondeada al cuarto de hora). */
  onMover?: (id: string, destino: { salaId: string; inicioMin: number }) => void;
  /** Tocar un hueco: crear una clase en esa sala a esa hora. */
  onCrearEn?: (destino: { salaId: string; inicioMin: number }) => void;
}

export function VistaDiaSalas({
  columnas, tarjetas, aperturaMin, cierreMin, horarioDia, pxPorHora, ahoraMin, seleccionadaId, marcadas, enSeleccion,
  atenuada, onSeleccionar, arrastrable, onMover, onCrearEn,
}: VistaDiaSalasProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const cuerpoRef = useRef<HTMLDivElement>(null);
  // Una banda plegada se toca y se despliegan las horas: para llevar una clase a
  // las 15:00 arrastrándola, o para crear una tocando ese hueco. Se vuelve a
  // plegar con el botón de la esquina, y al cambiar de día (la vista se monta de nuevo).
  const [desplegado, setDesplegado] = useState(false);
  const todas = useMemo(() => columnas.flatMap(c => c.sesiones), [columnas]);
  const escala = useMemo(
    () => escalaDia(todas.map(s => ({ inicioMin: s.inicioMin, finMin: s.finMin })), {
      aperturaMin, cierreMin, pxPorHora, plegarDesdeMin: desplegado ? Number.POSITIVE_INFINITY : undefined,
    }),
    [todas, aperturaMin, cierreMin, pxPorHora, desplegado],
  );
  const cerrados = useMemo(
    () => tramosCerrados(horarioDia, escala.desdeMin, escala.hastaMin),
    [horarioDia, escala.desdeMin, escala.hastaMin],
  );
  const hayPliegues = useMemo(
    () => escalaDia(todas.map(s => ({ inicioMin: s.inicioMin, finMin: s.finMin })), { aperturaMin, cierreMin, pxPorHora }).tramos.some(t => t.plegado),
    [todas, aperturaMin, cierreMin, pxPorHora],
  );

  // Abre desplazada a «ahora» (con una hora de contexto por encima). Solo al
  // montar: el padre la vuelve a montar al cambiar de día, y en cada minuto que
  // pasa no debe pelearse con el scroll de quien la está usando.
  useEffect(() => {
    if (ahoraMin == null) return;
    // Desde la hora en punto anterior: a las 10:40, la rejilla empieza a las 9:00.
    // (Doce píxeles más arriba, para que la etiqueta de esa hora se lea entera.)
    scrollRef.current?.scrollTo({ top: Math.max(0, yDeMinuto(escala, Math.floor(ahoraMin / 60) * 60 - 60) - 12) });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- solo al montar, ver arriba.
  }, []);

  // De un punto de la pantalla a «esta sala, a este minuto». null = no es un sitio.
  function destinoEn(x: number, y: number): { salaId: string; inicioMin: number } | null {
    const cuerpo = cuerpoRef.current;
    if (!cuerpo) return null;
    let salaId: string | null = null;
    for (const col of cuerpo.querySelectorAll<HTMLElement>('[data-sala-id]')) {
      const r = col.getBoundingClientRect();
      if (x >= r.left && x < r.right) { salaId = col.dataset.salaId ?? null; break; }
    }
    const min = minutoDeY(escala, y - cuerpo.getBoundingClientRect().top);
    if (!salaId || min == null) return null;
    return { salaId, inicioMin: redondearAIntervalo(min) };
  }

  const ahoraY = ahoraMin != null && ahoraMin >= escala.desdeMin && ahoraMin <= escala.hastaMin ? yDeMinuto(escala, ahoraMin) : null;
  const hh = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(Math.round(m % 60)).padStart(2, '0')}`;

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-2xl border border-border bg-card">
      <div ref={scrollRef} data-testid="grid-dia-scroll" className="min-h-0 flex-1 overflow-auto">
        <div style={{ minWidth: ANCHO_GUTTER_PX + columnas.length * ANCHO_MIN_COLUMNA_PX }}>
          <div className="sticky top-0 z-30 flex border-b border-border bg-card">
            <div className="sticky left-0 z-10 flex flex-none items-center justify-center bg-card" style={{ width: ANCHO_GUTTER_PX }}>
              {desplegado && hayPliegues && (
                <button
                  type="button"
                  onClick={() => setDesplegado(false)}
                  title="Plegar las horas sin clases"
                  aria-label="Plegar las horas sin clases"
                  className="flex size-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground"
                >
                  <ChevronsDownUp size={15} />
                </button>
              )}
            </div>
            {columnas.map(c => (
              <div key={c.sala.id} className="min-w-0 flex-1 border-l border-border px-3 py-2">
                <p className="truncate text-[13px] font-semibold text-foreground">{c.sala.nombre}</p>
                <p className="truncate text-[11.5px] text-muted-foreground">
                  {c.sesiones.length === 0 ? 'Sin clases' : `${c.sesiones.length} ${c.sesiones.length === 1 ? 'clase' : 'clases'}`} · {c.sala.capacidad} plazas
                </p>
              </div>
            ))}
          </div>

          <div ref={cuerpoRef} data-rejilla className="relative flex" style={{ height: escala.alto }}>
            {/* Horas, en el margen, que se queda quieto al desplazar las salas de
                lado (tres salas y la ficha al lado no caben en un iPad). Por
                encima de las clases y por debajo de las bandas plegadas. */}
            <div className="sticky left-0 z-[4] flex-none bg-card" style={{ width: ANCHO_GUTTER_PX }}>
              {escala.horas.map(h => (
                <span
                  key={h.min}
                  // La primera de cada tramo no se sube: arriba del todo se saldría
                  // de la rejilla, y bajo una banda plegada se montaría sobre ella.
                  data-hora={hh(h.min)}
                  className={cn('absolute right-1.5 text-[11.5px] tabular-nums text-muted-foreground', !h.trasPliegue && '-translate-y-1/2')}
                  style={{ top: h.trasPliegue ? h.y + 2 : h.y }}
                >
                  {hh(h.min)}
                </span>
              ))}
              {ahoraY != null && ahoraMin != null && (
                <span
                  className="pointer-events-none absolute left-0.5 z-10 -translate-y-1/2 rounded-full px-1 text-[10.5px] font-semibold tabular-nums text-white"
                  style={{ top: ahoraY, background: 'var(--destructive)' }}
                >
                  {hh(ahoraMin)}
                </span>
              )}
            </div>

            {columnas.map(c => (
              <div
                key={c.sala.id}
                data-sala-id={c.sala.id}
                className={cn('relative min-w-0 flex-1 border-l border-border', onCrearEn && !enSeleccion && 'cursor-pointer')}
                onClick={!onCrearEn || enSeleccion ? undefined : e => {
                  // Solo en el fondo de la columna, no sobre una clase.
                  if (e.target !== e.currentTarget) return;
                  const d = destinoEn(e.clientX, e.clientY);
                  if (d) onCrearEn(d);
                }}
              >
                {/* Fuera del horario de este día: no bloquea (se puede crear igualmente,
                    y el formulario avisa), solo dice la verdad. */}
                {cerrados.map(t => {
                  const top = yDeMinuto(escala, t.desdeMin);
                  const alto = yDeMinuto(escala, t.hastaMin) - top;
                  if (alto <= 0) return null;
                  return (
                    <span
                      key={t.desdeMin}
                      data-testid="tramo-cerrado"
                      className="pointer-events-none absolute inset-x-0 flex items-start justify-center bg-muted/70 pt-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground"
                      style={{ top, height: alto, backgroundImage: 'repeating-linear-gradient(135deg, transparent 0 6px, color-mix(in srgb, var(--border) 60%, transparent) 6px 7px)' }}
                    >
                      Cerrado
                    </span>
                  );
                })}
                {escala.horas.map(h => h.y > 0 && (
                  <span key={h.min} className="pointer-events-none absolute inset-x-0 border-t border-border/70" style={{ top: h.y }} />
                ))}
                {/* «Ahora», DETRÁS de las clases: va antes que ellas en el DOM y sin
                    z-index, así que una clase en curso tapa la raya y no al revés. */}
                {ahoraY != null && (
                  <span className="pointer-events-none absolute inset-x-0 h-0.5 -translate-y-1/2" style={{ top: ahoraY, background: 'var(--destructive)' }} aria-hidden />
                )}
                {c.sesiones.map(s => {
                  const d = tarjetas.get(s.id);
                  if (!d) return null;
                  const top = yDeMinuto(escala, s.inicioMin) + 1;
                  const alto = Math.max(22, yDeMinuto(escala, s.finMin) - yDeMinuto(escala, s.inicioMin) - 3);
                  const anchoPct = 100 / s.totalCarriles;
                  const compacta = s.totalCarriles > 1;
                  return (
                    <TarjetaClase
                      key={s.id}
                      d={d}
                      compacta={compacta}
                      conQuien={!compacta}
                      lineas={alto >= (compacta ? 56 : 42) ? (compacta ? 3 : 2) : alto >= 38 && compacta ? 2 : 1}
                      seleccionada={seleccionadaId === s.id}
                      marcada={marcadas.has(s.id)}
                      enSeleccion={enSeleccion}
                      atenuada={atenuada(s.id)}
                      arrastrable={!enSeleccion && arrastrable(s.id)}
                      onSeleccionar={() => onSeleccionar(s.id)}
                      onMover={onMover ? (x, y) => { const dest = destinoEn(x, y); if (dest) onMover(s.id, dest); } : undefined}
                      colocada={{
                        top, height: alto,
                        left: `calc(${s.carril * anchoPct}% + 6px)`,
                        width: `calc(${anchoPct}% - 12px)`,
                      }}
                    />
                  );
                })}
              </div>
            ))}

            {/* Las horas plegadas: una banda de lado a lado, que se toca para verlas. */}
            {escala.tramos.filter(t => t.plegado).map(t => (
              <button
                key={t.desdeMin}
                type="button"
                onClick={() => setDesplegado(true)}
                title="Ver estas horas (para llevar una clase o crear una en ellas)"
                className="group absolute inset-x-0 z-[5] flex items-center gap-1 border-y border-border bg-muted/60 text-left text-[11.5px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                style={{ top: t.y, height: t.alto, paddingLeft: ANCHO_GUTTER_PX + 12 }}
              >
                {textoTramoPlegado(t)}
                <span className="font-medium underline-offset-2 group-hover:underline">· Ver estas horas</span>
              </button>
            ))}

          </div>
        </div>
      </div>
    </div>
  );
}
