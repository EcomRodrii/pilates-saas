'use client';

import { useRef, useState } from 'react';
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
  /** Fase 2: arrastrar para mover. Pointer Events (no `draggable` nativo —
   *  no dispara por touch en iOS Safari, y RECEPCION/PROPIETARIO operan
   *  desde tablet). `onMover` recibe la posición del puntero al soltar; el
   *  padre (VistaDiaSalas/VistaSemana) resuelve la columna de destino. */
  arrastrable?: boolean;
  onMover?: (clientX: number, clientY: number) => void;
}

export function BloqueClase({
  sesion, tipo, instructor, reservasSesion, estado, modo, seleccionada,
  atenuada, style, onSeleccionar, accion, arrastrable, onMover,
}: BloqueClaseProps) {
  const p = PINTA[estado];
  const ancho = modo === 'ancho';

  const arrastreRef = useRef<{ pointerId: number; startX: number; startY: number; moved: boolean } | null>(null);
  const ultimoFueArrastreRef = useRef(false);
  const [arrastrando, setArrastrando] = useState(false);

  function onPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    if (!arrastrable || !onMover) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    arrastreRef.current = { pointerId: e.pointerId, startX: e.clientX, startY: e.clientY, moved: false };
  }
  function onPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    const a = arrastreRef.current;
    if (!a || a.pointerId !== e.pointerId) return;
    const dx = e.clientX - a.startX;
    const dy = e.clientY - a.startY;
    if (!a.moved && Math.abs(dx) + Math.abs(dy) > 4) { a.moved = true; setArrastrando(true); }
    if (a.moved) e.currentTarget.style.transform = `translate3d(${dx}px, ${dy}px, 0)`;
  }
  function onPointerUp(e: React.PointerEvent<HTMLDivElement>) {
    const a = arrastreRef.current;
    if (!a || a.pointerId !== e.pointerId) return;
    e.currentTarget.releasePointerCapture(e.pointerId);
    e.currentTarget.style.transform = '';
    arrastreRef.current = null;
    setArrastrando(false);
    ultimoFueArrastreRef.current = a.moved;
    if (a.moved) onMover?.(e.clientX, e.clientY);
  }
  function onPointerCancel(e: React.PointerEvent<HTMLDivElement>) {
    if (arrastreRef.current?.pointerId !== e.pointerId) return;
    e.currentTarget.style.transform = '';
    arrastreRef.current = null;
    setArrastrando(false);
  }
  function onClick() {
    // El click que sigue a un pointerup de arrastre no debe reabrir/cerrar el
    // panel de la clase — solo el resultado del arrastre importa.
    if (ultimoFueArrastreRef.current) { ultimoFueArrastreRef.current = false; return; }
    onSeleccionar();
  }

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
      onClick={onClick}
      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSeleccionar(); } }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
      title={`${horaTexto} · ${tipo.nombre} · ${instructor?.nombre ?? 'sin instructora'}`}
      style={{
        ...style,
        // El color del TIPO de clase tiñe el bloque, pero SOLO en PROGRAMADA.
        //
        // Los demás estados llevan color semántico a propósito —ámbar = "falta
        // pasar lista", rojo = conflicto— y eso es información, no decoración:
        // teñirlos con el color del tipo la taparía. Pero PROGRAMADA es el caso
        // normal (la inmensa mayoría de las clases) y usaba `var(--card)`,
        // blanco liso: por eso el calendario se veía sin color y costaba
        // distinguir una clase de otra de un vistazo.
        //
        // Cuánto tiñe va en `--calendario-tinte-clase` (globals.css) y NO aquí:
        // hacen falta dos valores, uno por modo, y la nota con las mediciones
        // vive junto a la variable. Un número fijo en este archivo no podría
        // cambiar con el tema.
        background: seleccionada
          ? 'var(--muted)'
          : estado === 'PROGRAMADA' && tipo.color
            ? `color-mix(in srgb, ${tipo.color} var(--calendario-tinte-clase), var(--card))`
            : p.fondo,
        borderLeftColor: estado === 'PROGRAMADA' ? tipo.color : p.barra,
        opacity: arrastrando ? 0.85 : atenuada ? 0.35 : sesion.cancelada ? 0.6 : estado === 'FINALIZADA' ? 0.55 : 1,
        touchAction: arrastrable ? 'none' : undefined,
        zIndex: arrastrando ? 40 : undefined,
        boxShadow: arrastrando ? '0 12px 24px -8px rgba(0,0,0,0.35)' : undefined,
      }}
      className={cn(
        'absolute flex flex-col overflow-hidden rounded-r-md border border-border/60 border-l-[3px]',
        'transition-transform duration-150 hover:-translate-y-px hover:shadow-md hover:z-20',
        arrastrable ? 'cursor-grab active:cursor-grabbing' : 'cursor-pointer',
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
