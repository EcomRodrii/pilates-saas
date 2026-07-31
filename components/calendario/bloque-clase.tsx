'use client';

import { colorOcupacion, etiquetaOcupacion, ratioOcupacion } from '@/lib/ocupacion';
import { PINTA, type EstadoSesion } from '@/lib/calendario-estado';
import { cn, horaEstudio } from '@/lib/utils';
import type { Sesion, TipoClase, Instructor, Reserva } from '@/lib/types';

// Bloque de clase de la rejilla del Calendario — mismo componente para la
// vista de Día (modo="ancho") y de Semana (modo="compacto"), como pide el
// rediseño: una sola fuente de verdad visual, sin reimplementar el bloque dos
// veces con el riesgo de que diverjan.
//
// El posicionamiento absoluto (top/height/left/width dentro de la columna) lo
// calcula quien llama (VistaDiaSalas/VistaSemana, con lib/calendario-carriles)
// — este componente solo pinta lo que le dan.
export interface BloqueClaseProps {
  sesion: Pick<Sesion, 'inicio' | 'fin' | 'aforoMaximo' | 'cancelada'>;
  tipo: Pick<TipoClase, 'nombre' | 'color'>;
  instructor: Pick<Instructor, 'nombre'> | null;
  reservasSesion: Pick<Reserva, 'estado'>[];
  estado: EstadoSesion;
  modo: 'ancho' | 'compacto';
  seleccionada: boolean;
  /** Filtro por instructora: esta clase no es de la instructora elegida — se
   *  atenúa, no se esconde (punto 9: no se pierde el contexto del estudio). */
  atenuada?: boolean;
  style: React.CSSProperties;
  onSeleccionar: () => void;
  accion?: { texto: string; onClick: () => void } | null;
}

export function BloqueClase({
  sesion, tipo, instructor, reservasSesion, estado, modo, seleccionada,
  atenuada, style, onSeleccionar, accion,
}: BloqueClaseProps) {
  const p = PINTA[estado];
  const ancho = modo === 'ancho';

  const confirmadas = reservasSesion.filter(r => r.estado === 'CONFIRMADA' || r.estado === 'ASISTIDA').length;
  const enEspera = reservasSesion.filter(r => r.estado === 'LISTA_ESPERA').length;
  const ratio = ratioOcupacion(confirmadas, sesion.aforoMaximo);

  const horaTexto = ancho
    ? `${horaEstudio(sesion.inicio)} – ${horaEstudio(sesion.fin)}`
    : horaEstudio(sesion.inicio);

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onSeleccionar}
      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSeleccionar(); } }}
      title={`${horaTexto} · ${tipo.nombre} · ${instructor?.nombre ?? 'sin instructora'}`}
      style={{
        ...style,
        background: seleccionada ? 'var(--muted)' : p.fondo,
        borderLeftColor: estado === 'PROGRAMADA' ? tipo.color : p.barra,
        opacity: atenuada ? 0.35 : sesion.cancelada ? 0.6 : estado === 'FINALIZADA' ? 0.55 : 1,
      }}
      className={cn(
        'absolute flex flex-col overflow-hidden rounded-r-md border border-border/60 border-l-[3px]',
        'cursor-pointer transition-transform duration-150 hover:-translate-y-px hover:shadow-md hover:z-20',
        ancho ? 'gap-1 p-2' : 'gap-0.5 px-1.5 py-1',
      )}
    >
      <span className="flex items-center gap-1.5 min-w-0">
        <span
          className={cn('font-bold tabular-nums whitespace-nowrap', ancho ? 'text-xs' : 'text-[9.5px]')}
          style={{ color: p.tinta }}
        >
          {horaTexto}
        </span>
        {ancho && estado !== 'PROGRAMADA' && (
          <span
            className="rounded-full bg-white/60 px-1.5 py-0.5 text-[9.5px] font-bold whitespace-nowrap"
            style={{ color: p.tinta }}
          >
            {p.label}
          </span>
        )}
      </span>

      <span
        className={cn('font-semibold leading-tight truncate', ancho ? 'text-[15px]' : 'text-[10.5px]')}
        style={{ color: p.tinta, textDecoration: sesion.cancelada ? 'line-through' : 'none' }}
      >
        {tipo.nombre}
      </span>

      {ancho && (
        <span className="text-[10.5px] truncate" style={{ color: estado === 'PROGRAMADA' ? 'var(--muted-foreground)' : p.tinta }}>
          {instructor?.nombre ?? 'Sin instructora'} · {confirmadas} de {sesion.aforoMaximo} · {etiquetaOcupacion(ratio)}
          {enEspera > 0 ? ` · ${enEspera} en espera` : ''}
        </span>
      )}

      {accion && ancho && (
        <button
          type="button"
          onClick={e => { e.stopPropagation(); accion.onClick(); }}
          className="mt-auto self-start rounded-full px-2.5 py-1 text-[11px] font-bold text-white transition-[filter] hover:brightness-110"
          style={{ background: p.tinta }}
        >
          {accion.texto}
        </button>
      )}

      <span className="absolute inset-x-0 bottom-0 h-[3px] bg-black/5">
        <span
          className="block h-full transition-[width] duration-500"
          style={{ width: `${Math.min(100, Math.round(ratio * 100))}%`, background: colorOcupacion(ratio) }}
        />
      </span>
    </div>
  );
}
