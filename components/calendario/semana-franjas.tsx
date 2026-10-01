'use client';

import { Fragment, useMemo, useRef, useState } from 'react';
import { Plus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { clasesPorCelda, claveCelda, diasConClases, filasDeFranjas, textoHueco, type ClaseEnFranja } from '@/lib/calendario/franjas';
import { TarjetaClase, type DatosTarjeta } from './tarjeta-clase';

// La semana por franjas (decisión 4 del rediseño, aprobada el 1-oct-2026): una
// fila por hora en la que empieza alguna clase, las horas sin clases y los días
// sin clases plegados. Cabe la semana entera sin desplazarse.
//
// Arrastrar una clase a OTRO DÍA la lleva a ese día a la misma hora; la hora
// exacta se cambia en el Día, que es una rejilla de tiempo de verdad.

const NOMBRE_DIA = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];

export interface ResumenDia {
  clases: number;
  /** 0..1; null sin clases. */
  ocupacion: number | null;
}

export interface SemanaFranjasProps {
  /** Las fechas de las columnas (la ventana visible, que empieza hoy). */
  fechas: Date[];
  hoyIndex: number | null;
  /** Las clases que se ven (ya filtradas por sala), con su columna y su minuto de inicio. */
  clases: ClaseEnFranja[];
  tarjetas: ReadonlyMap<string, DatosTarjeta>;
  /** El estudio no abre ese día (horario del estudio). */
  cerrados: boolean[];
  resumenDia: (dia: number) => ResumenDia;
  /** Tarjetas de tres líneas: iPad en vertical, o con la ficha abierta al lado. */
  compacta: boolean;
  seleccionadaId: string | null;
  marcadas: ReadonlySet<string>;
  enSeleccion: boolean;
  atenuada: (id: string) => boolean;
  onSeleccionar: (id: string) => void;
  arrastrable: (id: string) => boolean;
  /** Soltar en otro día: misma hora, ese día. */
  onMoverADia?: (id: string, dia: number) => void;
  /** Tocar una casilla vacía: crear una clase ese día a esa hora. */
  onCrearEn?: (dia: number, hora: number) => void;
}

export function SemanaFranjas({
  fechas, hoyIndex, clases, tarjetas, cerrados, resumenDia, compacta, seleccionadaId, marcadas, enSeleccion,
  atenuada, onSeleccionar, arrastrable, onMoverADia, onCrearEn,
}: SemanaFranjasProps) {
  const rejillaRef = useRef<HTMLDivElement>(null);
  const [destino, setDestino] = useState<number | null>(null);
  const filas = useMemo(() => filasDeFranjas(clases), [clases]);
  const celdas = useMemo(() => clasesPorCelda(clases), [clases]);
  const conClases = useMemo(() => diasConClases(clases, fechas.length), [clases, fechas.length]);
  const diaDe = useMemo(() => new Map(clases.map(c => [c.id, c.dia])), [clases]);

  // Qué día hay bajo el puntero: por la X de las cabeceras, no por lo que haya
  // debajo (mientras se arrastra, debajo está la propia tarjeta).
  function diaEnX(x: number): number | null {
    const cabeceras = rejillaRef.current?.querySelectorAll<HTMLElement>('[data-cabecera-dia]') ?? [];
    for (const c of cabeceras) {
      const r = c.getBoundingClientRect();
      if (x >= r.left && x < r.right) return Number(c.dataset.cabeceraDia);
    }
    return null;
  }

  const ancho = (i: number) => (conClases[i] ? 'minmax(0,1fr)' : compacta ? '36px' : '60px');
  const plantilla = `${compacta ? '44px' : '52px'} ${fechas.map((_, i) => ancho(i)).join(' ')}`;

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-2xl border border-border bg-card">
      <div className="min-h-0 flex-1 overflow-auto" data-testid="semana-franjas">
        <div ref={rejillaRef} data-rejilla className="grid min-w-[560px]" style={{ gridTemplateColumns: plantilla }}>
          {/* Cabecera de días, fija arriba al desplazarse. */}
          <div className="sticky top-0 z-20 border-b border-border bg-card" />
          {fechas.map((f, i) => {
            const esHoy = hoyIndex === i;
            const r = resumenDia(i);
            const pct = r.ocupacion == null ? null : Math.round(r.ocupacion * 100);
            return (
              <div
                key={i}
                data-cabecera-dia={i}
                className={cn(
                  'sticky top-0 z-20 min-w-0 border-b border-l border-border px-2 py-2',
                  esHoy ? 'bg-[color-mix(in_srgb,var(--brand)_7%,var(--card))]' : 'bg-card',
                  destino === i && 'bg-[color-mix(in_srgb,var(--brand)_14%,var(--card))]',
                )}
              >
                {conClases[i] ? (
                  <>
                    <p className="flex min-w-0 items-center gap-1.5 text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">
                      <span>{NOMBRE_DIA[f.getDay()]}</span>
                      <span className={cn(
                        'tabular-nums normal-case',
                        esHoy ? 'flex size-6 items-center justify-center rounded-full bg-brand text-[13px] text-brand-foreground' : 'text-[15px] text-foreground',
                      )}>
                        {f.getDate()}
                      </span>
                      {/* `--brand` es el color del estudio, fijo en los dos modos (lib/panel-theme): como letra
                          en oscuro no se ve. `--brand-medio` es la tinta de marca para texto, con su versión oscura. */}
                      {esHoy && !compacta && <span className="text-[11.5px] font-semibold normal-case tracking-normal text-brand-medio">Hoy</span>}
                    </p>
                    <div className="mt-1 flex items-center gap-1.5" title={pct == null ? undefined : `${r.clases} clases · ${pct} % de ocupación`}>
                      <span className="h-1 min-w-3 flex-1 overflow-hidden rounded-full bg-muted">
                        <span className="block h-full rounded-full bg-foreground/45" style={{ width: `${pct ?? 0}%` }} />
                      </span>
                      <span className="shrink-0 text-[11.5px] tabular-nums text-muted-foreground">
                        {compacta ? `${pct ?? 0} %` : `${r.clases} · ${pct ?? 0} %`}
                      </span>
                    </div>
                  </>
                ) : (
                  <p className="text-center text-[11.5px] font-semibold uppercase leading-tight text-muted-foreground">
                    {NOMBRE_DIA[f.getDay()]}
                    <br />
                    <span className="text-[15px] normal-case text-foreground/60">{f.getDate()}</span>
                    {/* «Cerrado» es el horario del estudio; «Sin clases», un día abierto en el que no hay nada. */}
                    {!compacta && <span className="mt-0.5 block text-[10.5px] normal-case leading-tight tracking-normal">{cerrados[i] ? 'Cerrado' : 'Sin clases'}</span>}
                  </p>
                )}
              </div>
            );
          })}

          {filas.map(fila => fila.tipo === 'hueco' ? (
            <div key={`h-${fila.desde}`} className="col-span-full border-b border-border bg-muted/40 px-3 py-1 text-[11.5px] text-muted-foreground">
              {textoHueco(fila)}
            </div>
          ) : (
            <Fragment key={fila.hora}>
              <div className="border-b border-border px-1.5 pt-2 text-right text-[12px] font-medium tabular-nums text-muted-foreground">
                {String(fila.hora).padStart(2, '0')}:00
              </div>
              {fechas.map((_, dia) => {
                const ids = celdas.get(claveCelda(dia, fila.hora)) ?? [];
                const vacia = ids.length === 0;
                const crear = vacia && onCrearEn && !enSeleccion;
                return (
                  <div
                    key={dia}
                    data-dia-index={dia}
                    data-hora={fila.hora}
                    className={cn(
                      'group relative min-w-0 space-y-1.5 border-b border-l border-border p-1.5',
                      hoyIndex === dia && 'bg-[color-mix(in_srgb,var(--brand)_4%,var(--card))]',
                      destino === dia && 'bg-[color-mix(in_srgb,var(--brand)_10%,var(--card))]',
                      crear && conClases[dia] && 'min-h-[52px] cursor-pointer',
                      crear && !conClases[dia] && 'cursor-pointer',
                    )}
                    onClick={crear ? e => { if (e.target === e.currentTarget || (e.target as HTMLElement).closest('[data-crear-aqui]')) onCrearEn(dia, fila.hora); } : undefined}
                  >
                    {ids.map(id => {
                      const d = tarjetas.get(id);
                      if (!d) return null;
                      return (
                        <TarjetaClase
                          key={id}
                          d={d}
                          compacta={compacta || !conClases[dia]}
                          seleccionada={seleccionadaId === id}
                          marcada={marcadas.has(id)}
                          enSeleccion={enSeleccion}
                          atenuada={atenuada(id)}
                          arrastrable={!enSeleccion && arrastrable(id)}
                          onSeleccionar={() => onSeleccionar(id)}
                          onMoviendo={onMoverADia ? p => setDestino(p ? diaEnX(p.x) : null) : undefined}
                          onMover={onMoverADia ? x => {
                            const nuevo = diaEnX(x);
                            if (nuevo != null && nuevo !== diaDe.get(id)) onMoverADia(id, nuevo);
                          } : undefined}
                        />
                      );
                    })}
                    {crear && conClases[dia] && (
                      <span
                        data-crear-aqui
                        className="pointer-events-auto absolute inset-1.5 hidden items-center justify-center gap-1 rounded-lg border border-dashed border-foreground/30 text-[12px] font-medium text-muted-foreground pointer-fine:group-hover:flex"
                      >
                        <Plus size={13} aria-hidden />Clase a las {String(fila.hora).padStart(2, '0')}:00
                      </span>
                    )}
                  </div>
                );
              })}
            </Fragment>
          ))}
        </div>
      </div>
    </div>
  );
}
