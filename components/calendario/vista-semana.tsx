'use client';

import { useEffect, useRef } from 'react';
import { BloqueClase } from '@/components/calendario/bloque-clase';
import { calcularScrollInicial } from '@/lib/calendario-scroll';
import type { ColumnaDia } from '@/lib/calendario-columnas';
import type { DatoSesion } from '@/components/calendario/vista-dia-salas';

const DIAS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];

// Ancho mínimo de cada columna-día. Sin esto, en móvil (o con la ventana del
// panel estrecha) `flex-1`/`grid-cols-7` reparte 7 columnas en el ancho que
// haya SIN SUELO — se veían columnas de ~40px donde "Cerrado" (centrado,
// `absolute inset-0`, sin overflow-hidden) desbordaba sobre las columnas
// vecinas y se solapaba con las suyas, ilegible. Por debajo de este ancho
// total, la rejilla entera scrollea en horizontal en vez de seguir
// encogiendo columnas.
const ANCHO_MIN_COLUMNA_PX = 92;
const ANCHO_GUTTER_PX = 56; // w-14

export interface VistaSemanaProps {
  columnas: ColumnaDia[];
  datos: Map<string, DatoSesion>;
  /** Las 7 fechas de la semana mostrada, Lunes a Domingo. */
  fechasSemana: Date[];
  /** Índice (0-6) que es HOY, o null si la semana mostrada no es la actual. */
  hoyIndex: number | null;
  /** Minutos desde medianoche de "ahora" — solo tiene efecto si `hoyIndex` no es null (punto 10). */
  ahoraMin?: number | null;
  horaInicioMin: number;
  horaFinMin: number;
  pxPorHora: number;
  seleccionadaId: string | null;
  onSeleccionar: (id: string) => void;
  atenuada?: (d: DatoSesion) => boolean;
  /** Fase 2: aquí las columnas son DÍAS, no salas — arrastrar solo puede
   *  cambiar día+hora, nunca sala (para eso hace falta la vista de Día o el
   *  formulario de editar). */
  arrastrable?: (d: DatoSesion) => boolean;
  onMoverSesion?: (sesionId: string, destino: { diaColumna: number; offsetYPx: number; pxPorHora: number }) => void;
  /** Clic en un hueco vacío de la rejilla (no sobre una clase) — abre "Nueva
   *  clase" con el día/hora ya rellenados. */
  onClickVacio?: (destino: { diaColumna: number; offsetYPx: number; pxPorHora: number }) => void;
}

export function VistaSemana({
  columnas, datos, fechasSemana, hoyIndex, ahoraMin, horaInicioMin, horaFinMin, pxPorHora,
  seleccionadaId, onSeleccionar, atenuada, arrastrable, onMoverSesion, onClickVacio,
}: VistaSemanaProps) {
  const altoTotal = ((horaFinMin - horaInicioMin) / 60) * pxPorHora;
  const scrollRef = useRef<HTMLDivElement>(null);

  // Mismo criterio que VistaDiaSalas: solo al abrir (eslint-disable a
  // propósito, ver ese componente). Sin "hoy" en la semana mostrada, no hay
  // "ahora" que perseguir — abre arriba del todo.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    const min = hoyIndex != null ? ahoraMin ?? null : null;
    scrollRef.current?.scrollTo({ top: calcularScrollInicial(min, horaInicioMin, horaFinMin, pxPorHora) });
  }, []);
  const horas: { label: string; topPx: number }[] = [];
  for (let m = horaInicioMin; m <= horaFinMin; m += 60) {
    horas.push({ label: `${String(Math.floor(m / 60)).padStart(2, '0')}:00`, topPx: ((m - horaInicioMin) / 60) * pxPorHora });
  }

  const anchoMinTotal = ANCHO_GUTTER_PX + columnas.length * ANCHO_MIN_COLUMNA_PX;

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-2xl border border-border bg-card">
      {/* Un único contenedor con scroll en las dos direcciones: horizontal
          para las 7 columnas cuando no caben (móvil), vertical para las
          horas. La cabecera va `sticky top-0` DENTRO de este contenedor —
          así al hacer scroll horizontal se mueve solidaria con la rejilla en
          vez de desincronizarse (dos scrolls separados no se sincronizan
          solos). El gutter de horas va `sticky left-0` por el mismo motivo,
          en la dirección contraria. */}
      <div ref={scrollRef} className="min-h-0 flex-1 overflow-auto">
        <div style={{ minWidth: anchoMinTotal }}>
          <div className="sticky top-0 z-10 flex border-b border-border bg-card">
            <div className="sticky left-0 z-10 w-14 flex-none bg-card" />
            {columnas.map((c, i) => {
              const esHoy = hoyIndex === i;
              return (
                <div
                  key={c.dia}
                  className="min-w-0 flex-1 overflow-hidden border-l border-border/60 px-2 py-2 text-center"
                  style={{ background: esHoy ? 'var(--muted)' : undefined, minWidth: ANCHO_MIN_COLUMNA_PX }}
                >
                  <p className="flex items-center justify-center gap-1.5 min-w-0">
                    {c.hayAtencion && <span className="h-1.5 w-1.5 flex-none rounded-full" style={{ background: 'var(--destructive)' }} />}
                    <span
                      className="text-[11px] font-bold uppercase tracking-wide"
                      style={{ color: esHoy ? 'var(--brand-medio)' : 'var(--muted-foreground)' }}
                    >
                      {DIAS[i]}
                    </span>
                    <span className="text-sm font-bold tracking-tight text-foreground">{fechasSemana[i]?.getDate()}</span>
                  </p>
                  <p className="mt-0.5 truncate text-[10.5px] text-muted-foreground">
                    {c.vacio ? 'Cerrado' : `${c.sesiones.length} ${c.sesiones.length === 1 ? 'clase' : 'clases'}`}
                  </p>
                </div>
              );
            })}
          </div>

          <div className="flex" style={{ height: altoTotal }}>
            <div className="sticky left-0 z-[5] w-14 flex-none bg-card">
              {horas.map(h => (
                <span
                  key={h.label}
                  className="absolute right-2 -translate-y-1.5 text-[10.5px] font-semibold tabular-nums text-muted-foreground"
                  style={{ top: h.topPx }}
                >
                  {h.label}
                </span>
              ))}
            </div>

            <div className="grid min-w-0 flex-1" style={{ gridTemplateColumns: `repeat(${columnas.length || 1}, minmax(${ANCHO_MIN_COLUMNA_PX}px, 1fr))` }}>
              {columnas.map((c, i) => (
                <div
                  key={c.dia}
                  data-dia-index={i}
                  className="relative min-w-0 overflow-hidden border-l border-border/60"
                  style={{
                    background: hoyIndex === i ? 'color-mix(in srgb, var(--muted) 60%, var(--card))' : undefined,
                    backgroundImage: `repeating-linear-gradient(to bottom, var(--border) 0 1px, transparent 1px ${pxPorHora}px)`,
                    cursor: onClickVacio ? 'pointer' : undefined,
                  }}
                  onClick={!onClickVacio ? undefined : e => {
                    // Solo si el clic fue en el fondo de la columna, no en una
                    // clase (BloqueClase no para la propagación): así no hace
                    // falta tocarlo para que esto conviva con seleccionar/
                    // arrastrar una clase existente.
                    if (e.target !== e.currentTarget) return;
                    const rect = e.currentTarget.getBoundingClientRect();
                    onClickVacio({ diaColumna: i, offsetYPx: e.clientY - rect.top, pxPorHora });
                  }}
                >
                  {c.vacio && (
                    // pointer-events-none: sin esto, este rótulo (que cubre TODA
                    // la columna) se comía cualquier clic en un día cerrado antes
                    // de que llegara a onClickVacio — la comprobación de "clic en
                    // el fondo, no en una clase" lo veía como target distinto y
                    // lo descartaba en silencio.
                    <span className="pointer-events-none absolute inset-0 flex items-center justify-center text-[11px] font-semibold uppercase tracking-wide text-border">
                      Cerrado
                    </span>
                  )}

                {c.sesiones.map(s => {
                  const d = datos.get(s.id);
                  if (!d) return null;
                  const topPx = ((s.inicioMin - horaInicioMin) / 60) * pxPorHora + 1;
                  const altoPx = ((s.finMin - s.inicioMin) / 60) * pxPorHora - 2;
                  const anchoPct = 100 / s.totalCarriles;
                  return (
                    <BloqueClase
                      key={s.id}
                      sesion={d.sesion}
                      tipo={d.tipo}
                      instructor={d.instructor}
                      reservasSesion={d.reservasSesion}
                      estado={d.estado}
                      modo="compacto"
                      seleccionada={seleccionadaId === s.id}
                      atenuada={atenuada?.(d)}
                      onSeleccionar={() => onSeleccionar(s.id)}
                      arrastrable={arrastrable?.(d) ?? false}
                      onMover={!onMoverSesion ? undefined : (clientX, clientY) => {
                        const destino = (document.elementFromPoint(clientX, clientY) as HTMLElement | null)
                          ?.closest<HTMLElement>('[data-dia-index]');
                        const diaColumna = destino ? Number(destino.dataset.diaIndex) : i;
                        const rect = destino?.getBoundingClientRect();
                        const offsetYPx = rect ? clientY - rect.top : clientY;
                        onMoverSesion(s.id, { diaColumna, offsetYPx, pxPorHora });
                      }}
                      style={{
                        top: topPx, height: Math.max(altoPx, 14),
                        left: `calc(${s.carril * anchoPct}% + 2px)`,
                        width: `calc(${anchoPct}% - 3px)`,
                      }}
                    />
                  );
                })}
              </div>
            ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
