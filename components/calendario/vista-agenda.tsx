'use client';

import { Check, RefreshCw } from 'lucide-react';
import { colorOcupacion, ratioOcupacion } from '@/lib/ocupacion';
import { PINTA } from '@/lib/calendario-estado';
import { cn, horaEstudio } from '@/lib/utils';
import type { DatoSesion } from '@/components/calendario/vista-dia-salas';

// ─────────────────────────────────────────────────────────────────────────────
// El calendario en el móvil: Día y Semana como una lista por hora.
//
// El fundador: «se ve muy muy pequeño el calendario». Medido a 375×812: la
// cabecera, los filtros y la franja de decisiones se comían unos 600 px, la
// rejilla de horas quedaba en una tira de ~100 px al fondo y las clases iban a
// 9,5 px con sus siete columnas de 92 px desplazándose de lado. Está pensado
// para mirar el calendario desde casa, con calma, en el teléfono.
//
// Por debajo de `md` Día y Semana se pintan aquí, sobre las MISMAS columnas que
// la rejilla (lib/calendario-agenda.ts): filtros, búsqueda, estado y ocupación
// son los de siempre. Cada clase dice hora, clase, sala e instructora con letra
// de 14–16 px, y se toca entera (64 px). Arrastrar para mover se queda en la
// tablet y el ordenador: aquí una clase se mueve desde «Editar».
// ─────────────────────────────────────────────────────────────────────────────

/** Por debajo de esto (el `md` de Tailwind, 768 px) Día y Semana van en lista. */
export const CONSULTA_AGENDA = '(max-width: 767.98px)';

export interface ClaseDeAgenda extends DatoSesion {
  salaNombre: string | null;
}

export interface DiaDeAgenda {
  clave: string;
  fecha: Date;
  esHoy: boolean;
  cerrado: boolean;
  sesiones: ClaseDeAgenda[];
}

/** Ids en orden de lectura → las clases con sus datos. Una que no esté en el mapa no se inventa. */
export function clasesDeAgenda(
  ids: string[], datos: Map<string, DatoSesion>, salas: { id: string; nombre: string }[],
): ClaseDeAgenda[] {
  const nombreSala = new Map(salas.map((s) => [s.id, s.nombre]));
  return ids.flatMap((id) => {
    const d = datos.get(id);
    return d ? [{ ...d, salaNombre: nombreSala.get(d.sesion.salaId) ?? null }] : [];
  });
}

export interface VistaAgendaProps {
  modo: 'dia' | 'semana';
  dias: DiaDeAgenda[];
  seleccionadaId: string | null;
  /** Marcadas en una selección múltiple: aquí solo se pintan (la decisión vive en page.tsx). */
  marcadas?: ReadonlySet<string>;
  onSeleccionar: (id: string) => void;
  atenuada?: (d: DatoSesion) => boolean;
  accionPara?: (d: DatoSesion) => { texto: string; onClick: () => void } | null;
}

const DIA_SEMANA = new Intl.DateTimeFormat('es-ES', { weekday: 'long' });

export function VistaAgenda({ modo, dias, seleccionadaId, marcadas, onSeleccionar, atenuada, accionPara }: VistaAgendaProps) {
  const total = dias.reduce((n, d) => n + d.sesiones.length, 0);

  return (
    <div data-agenda={modo} className="flex flex-col gap-5">
      {modo === 'dia' && total === 0 && (
        <p className="rounded-2xl border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
          No hay clases este día.
        </p>
      )}

      {dias.map((d) => (
        <section key={d.clave} data-agenda-dia={d.clave} aria-label={modo === 'semana' ? `${DIA_SEMANA.format(d.fecha)} ${d.fecha.getDate()}` : undefined}>
          {modo === 'semana' && (
            <h3 className="mb-2 flex items-center gap-2 px-1">
              <span className="text-base font-bold capitalize text-foreground">
                {DIA_SEMANA.format(d.fecha)} {d.fecha.getDate()}
              </span>
              {d.esHoy && (
                <span className="rounded-full px-2 py-0.5 text-sm font-bold text-white" style={{ background: 'var(--brand-medio)' }}>
                  Hoy
                </span>
              )}
              <span className="ml-auto text-sm text-muted-foreground">
                {d.cerrado
                  ? 'Cerrado'
                  : d.sesiones.length === 0
                    ? 'Sin clases'
                    : `${d.sesiones.length} ${d.sesiones.length === 1 ? 'clase' : 'clases'}`}
              </span>
            </h3>
          )}

          {d.sesiones.length > 0 && (
            <ul className="flex flex-col gap-2">
              {d.sesiones.map((c) => (
                <Clase
                  key={c.sesion.id}
                  clase={c}
                  seleccionada={seleccionadaId === c.sesion.id}
                  marcada={marcadas?.has(c.sesion.id) ?? false}
                  atenuada={atenuada?.(c) ?? false}
                  accion={accionPara?.(c) ?? null}
                  onSeleccionar={() => onSeleccionar(c.sesion.id)}
                />
              ))}
            </ul>
          )}
        </section>
      ))}
    </div>
  );
}

function Clase({ clase, seleccionada, marcada, atenuada, accion, onSeleccionar }: {
  clase: ClaseDeAgenda;
  seleccionada: boolean;
  marcada: boolean;
  atenuada: boolean;
  accion: { texto: string; onClick: () => void } | null;
  onSeleccionar: () => void;
}) {
  const { sesion, tipo, instructor, reservasSesion, estado } = clase;
  const p = PINTA[estado];
  const confirmadas = reservasSesion.filter((r) => r.estado === 'CONFIRMADA' || r.estado === 'ASISTIDA').length;
  const enEspera = reservasSesion.filter((r) => r.estado === 'LISTA_ESPERA').length;
  const ratio = ratioOcupacion(confirmadas, sesion.aforoMaximo);
  const donde = [clase.salaNombre, instructor?.nombre ?? 'Sin instructora'].filter(Boolean).join(' · ');

  return (
    <li
      data-agenda-clase={sesion.id}
      className="flex flex-col"
      // Mismo criterio que el bloque de la rejilla: el filtro por instructora
      // atenúa, no esconde; lo terminado y lo cancelado se ve, más apagado.
      style={{ opacity: atenuada ? 0.45 : sesion.cancelada || estado === 'FINALIZADA' ? 0.7 : 1 }}
    >
      <button
        type="button"
        onClick={onSeleccionar}
        aria-pressed={marcada ? true : undefined}
        className={cn(
          'relative flex min-h-16 w-full items-stretch gap-3 overflow-hidden rounded-2xl border py-3 pl-4 pr-3 text-left transition-colors active:bg-muted',
          seleccionada ? 'border-foreground bg-muted' : 'border-border bg-card',
          marcada && 'ring-2 ring-brand ring-offset-1 ring-offset-card',
        )}
      >
        {/* El color del tipo de clase va en la barra, no en el fondo: con el fondo
            teñido el texto apagado dejaba de medirse contra la tarjeta. Fuera de
            PROGRAMADA, la barra lleva el color del estado (aviso, conflicto…). */}
        <span aria-hidden className="absolute inset-y-0 left-0 w-1.5" style={{ background: estado === 'PROGRAMADA' ? tipo.color : p.barra }} />

        <span className="flex w-12 shrink-0 flex-col tabular-nums">
          <span className="text-base font-bold leading-tight text-foreground">{horaEstudio(sesion.inicio)}</span>
          <span className="text-sm leading-tight text-muted-foreground">{horaEstudio(sesion.fin)}</span>
        </span>

        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="flex min-w-0 items-center gap-1.5">
            <span className={cn('truncate text-base font-semibold leading-tight text-foreground', sesion.cancelada && 'line-through')}>
              {tipo.nombre}
            </span>
            {sesion.serieId && (
              <span role="img" aria-label="Se repite cada semana" title="Se repite cada semana" className="inline-flex shrink-0 text-muted-foreground">
                <RefreshCw size={14} strokeWidth={2.5} aria-hidden />
              </span>
            )}
          </span>
          <span className="truncate text-sm text-muted-foreground">{donde}</span>
          {estado !== 'PROGRAMADA' && (
            <span className="text-sm font-semibold" style={{ color: p.tinta }}>{p.label}</span>
          )}
        </span>

        <span className="flex shrink-0 flex-col items-end gap-1.5">
          {marcada ? (
            <span aria-hidden className="flex h-6 w-6 items-center justify-center rounded-full bg-brand text-brand-foreground">
              <Check size={14} strokeWidth={3} />
            </span>
          ) : (
            <span className="text-sm font-bold tabular-nums text-foreground">{confirmadas}/{sesion.aforoMaximo}</span>
          )}
          <span aria-hidden className="block h-1.5 w-10 overflow-hidden rounded-full bg-border">
            <span className="block h-full rounded-full" style={{ width: `${Math.min(100, Math.round(ratio * 100))}%`, background: colorOcupacion(ratio) }} />
          </span>
          {enEspera > 0 && <span className="text-sm text-muted-foreground">{enEspera} en espera</span>}
        </span>
      </button>

      {accion && (
        <button
          type="button"
          onClick={accion.onClick}
          className="mt-1.5 flex min-h-11 items-center self-end rounded-full px-4 text-sm font-bold text-white transition-[filter] hover:brightness-110"
          style={{ background: p.tinta }}
        >
          {accion.texto}
        </button>
      )}
    </li>
  );
}
