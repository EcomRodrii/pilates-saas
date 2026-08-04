'use client';

import { useEffect, useRef } from 'react';
import { BloqueClase } from '@/components/calendario/bloque-clase';
import { etiquetaOcupacion } from '@/lib/ocupacion';
import { calcularScrollInicial } from '@/lib/calendario-scroll';
import type { ColumnaSala } from '@/lib/calendario-columnas';
import type { EstadoSesion } from '@/lib/calendario-estado';
import type { Sesion, TipoClase, Instructor, Reserva } from '@/lib/types';

export interface DatoSesion {
  sesion: Sesion;
  tipo: TipoClase;
  instructor: Instructor | null;
  reservasSesion: Reserva[];
  estado: EstadoSesion;
}

export interface VistaDiaSalasProps {
  columnas: ColumnaSala[];
  datos: Map<string, DatoSesion>;
  /** Minutos desde medianoche. Ej. 8*60 / 22*60 (studios.hora_apertura/cierre). */
  horaInicioMin: number;
  horaFinMin: number;
  pxPorHora: number;
  /** Minutos desde medianoche de "ahora", solo si el día mostrado es hoy — null lo apaga. */
  ahoraMin: number | null;
  seleccionadaId: string | null;
  onSeleccionar: (id: string) => void;
  /** true = esta clase se atenúa (filtro por instructora, punto 9: nunca se esconde). */
  atenuada?: (d: DatoSesion) => boolean;
  accionPara?: (d: DatoSesion) => { texto: string; onClick: () => void } | null;
  /** Fase 2: true = esta clase se puede arrastrar (permiso ya resuelto por el
   *  llamador — una instructora solo puede arrastrar sus propias clases). */
  arrastrable?: (d: DatoSesion) => boolean;
  /** offsetYPx: distancia en px desde el borde superior de la columna DONDE
   *  SE SOLTÓ (puede ser otra sala) — el propio componente resuelve la
   *  columna de destino con `elementFromPoint`, el caller no necesita saber
   *  de geometría. */
  onMoverSesion?: (sesionId: string, destino: { salaId: string; offsetYPx: number; pxPorHora: number }) => void;
  /** Clic en un hueco vacío de la rejilla (no sobre una clase) — abre "Nueva
   *  clase" con la sala/hora ya rellenados. */
  onClickVacio?: (destino: { salaId: string; offsetYPx: number; pxPorHora: number }) => void;
}

export function VistaDiaSalas({
  columnas, datos, horaInicioMin, horaFinMin, pxPorHora, ahoraMin,
  seleccionadaId, onSeleccionar, atenuada, accionPara, arrastrable, onMoverSesion, onClickVacio,
}: VistaDiaSalasProps) {
  const altoTotal = ((horaFinMin - horaInicioMin) / 60) * pxPorHora;
  const scrollRef = useRef<HTMLDivElement>(null);

  // Punto 10: la rejilla abre desplazada a "ahora", no siempre arriba del
  // todo. Deliberadamente `[]` — solo al abrir esta vista (o al cambiar de
  // día, si el padre remonta con `key={fecha}`), nunca en cada tick del reloj
  // que actualiza `ahoraMin` (si no, pelearía con el scroll del usuario).
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: calcularScrollInicial(ahoraMin, horaInicioMin, horaFinMin, pxPorHora) });
  }, []);
  const horas: { label: string; topPx: number }[] = [];
  for (let m = horaInicioMin; m <= horaFinMin; m += 60) {
    const h = Math.floor(m / 60);
    horas.push({ label: `${String(h).padStart(2, '0')}:00`, topPx: ((m - horaInicioMin) / 60) * pxPorHora });
  }

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-2xl border border-border bg-card">
      {/* Cabeceras: una por sala, con capacidad y ocupación media (punto 2). */}
      <div className="flex flex-none border-b border-border">
        <div className="w-14 flex-none" />
        {columnas.map(c => (
          <div key={c.sala.id} className="min-w-0 flex-1 border-l border-border/60 px-2 py-2 text-center">
            <p className="flex items-center justify-center gap-1.5 min-w-0">
              {c.hayAtencion && <span className="h-1.5 w-1.5 flex-none rounded-full" style={{ background: 'var(--destructive)' }} />}
              <span className="truncate text-[11px] font-bold uppercase tracking-wide text-foreground">{c.sala.nombre}</span>
            </p>
            {/* Columnas estrechas (móvil, varias salas) no caben las 4 piezas
                de info en una línea sin truncar a "50…" — versión corta ahí,
                completa desde `lg`. */}
            <p className="mt-0.5 truncate text-[10.5px] text-muted-foreground lg:hidden">
              {c.sesiones.length > 0
                ? `${c.sesiones.length} ${c.sesiones.length === 1 ? 'clase' : 'clases'} · ${Math.round(c.ocupacionMedia * 100)}%`
                : 'Sin clases'}
            </p>
            <p className="mt-0.5 hidden truncate text-[10.5px] text-muted-foreground lg:block">
              {c.sesiones.length > 0
                ? `${c.sesiones.length} ${c.sesiones.length === 1 ? 'clase' : 'clases'} · ${c.sala.capacidad} plazas · ${Math.round(c.ocupacionMedia * 100)}% · ${etiquetaOcupacion(c.ocupacionMedia)}`
                : `${c.sala.capacidad} plazas · sin clases`}
            </p>
          </div>
        ))}
      </div>

      {/* Rejilla: scrollea ELLA, no la página (punto 10). */}
      <div ref={scrollRef} data-testid="grid-dia-scroll" className="min-h-0 flex-1 overflow-y-auto">
        <div className="flex" style={{ height: altoTotal }}>
          <div className="relative w-14 flex-none">
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

          <div className="grid min-w-0 flex-1" style={{ gridTemplateColumns: `repeat(${columnas.length || 1},minmax(0,1fr))` }}>
            {columnas.map(c => (
              <div
                key={c.sala.id}
                data-sala-id={c.sala.id}
                className="relative min-w-0 border-l border-border/60"
                style={{
                  backgroundImage: `repeating-linear-gradient(to bottom, var(--border) 0 1px, transparent 1px ${pxPorHora}px)`,
                  cursor: onClickVacio ? 'pointer' : undefined,
                }}
                onClick={!onClickVacio ? undefined : e => {
                  // Solo si el clic fue en el fondo de la columna, no en una
                  // clase (BloqueClase no para la propagación).
                  if (e.target !== e.currentTarget) return;
                  const rect = e.currentTarget.getBoundingClientRect();
                  onClickVacio({ salaId: c.sala.id, offsetYPx: e.clientY - rect.top, pxPorHora });
                }}
              >
                {c.sesiones.length === 0 && (
                  <span className="absolute inset-0 flex items-center justify-center text-[11px] font-semibold uppercase tracking-wide text-border">
                    Sin clases
                  </span>
                )}

                {c.sesiones.map(s => {
                  const d = datos.get(s.id);
                  if (!d) return null;
                  const inicioMin = s.inicioMin - horaInicioMin;
                  const topPx = (inicioMin / 60) * pxPorHora + 1;
                  const altoPx = ((s.finMin - s.inicioMin) / 60) * pxPorHora - 3;
                  const anchoPct = 100 / s.totalCarriles;
                  return (
                    <BloqueClase
                      key={s.id}
                      sesion={d.sesion}
                      tipo={d.tipo}
                      instructor={d.instructor}
                      reservasSesion={d.reservasSesion}
                      estado={d.estado}
                      modo={s.totalCarriles === 1 ? 'ancho' : 'compacto'}
                      seleccionada={seleccionadaId === s.id}
                      atenuada={atenuada?.(d)}
                      onSeleccionar={() => onSeleccionar(s.id)}
                      accion={accionPara?.(d) ?? null}
                      arrastrable={arrastrable?.(d) ?? false}
                      onMover={!onMoverSesion ? undefined : (clientX, clientY) => {
                        const destino = (document.elementFromPoint(clientX, clientY) as HTMLElement | null)
                          ?.closest<HTMLElement>('[data-sala-id]');
                        const salaId = destino?.dataset.salaId ?? c.sala.id;
                        const rect = destino?.getBoundingClientRect();
                        const offsetYPx = rect ? clientY - rect.top : clientY;
                        onMoverSesion(s.id, { salaId, offsetYPx, pxPorHora });
                      }}
                      style={{
                        top: topPx, height: Math.max(altoPx, 20),
                        left: `calc(${s.carril * anchoPct}% + 4px)`,
                        width: `calc(${anchoPct}% - 8px)`,
                      }}
                    />
                  );
                })}

                {ahoraMin != null && ahoraMin >= horaInicioMin && ahoraMin <= horaFinMin && (
                  <div
                    className="pointer-events-none absolute inset-x-0 z-30"
                    style={{ top: ((ahoraMin - horaInicioMin) / 60) * pxPorHora }}
                  >
                    <span className="absolute -left-1 -top-1 h-2 w-2 rounded-full" style={{ background: 'var(--destructive)' }} />
                    <span className="absolute inset-x-0 -top-px h-0.5" style={{ background: 'var(--destructive)' }} />
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
