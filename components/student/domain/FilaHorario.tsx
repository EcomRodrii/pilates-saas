'use client';

import Link from 'next/link';
import { TRANSICION_ADELANTE } from '@/lib/student/transiciones';
import { usePortalHref } from '@/components/student/contexto';
import type { Clase, Disponibilidad, Instructora } from '@/lib/student/tipos';
import type { EstadoTemporal } from '@/lib/student/fila-horario';
import { Foto } from '@/components/student/ui/Foto';
import { horaFin } from '@/lib/student/formato';
import { EstadoDeClase } from '@/components/student/domain/EstadoDeClase';
import { Icono } from '@/components/student/ui/Icono';
import { CaraInstructora } from '@/components/student/domain/InstructorCard';

/**
 * La fila de una clase en el HORARIO, copia de la maqueta de los cuatro iPhones (fundador, 19-oct-2026): la foto de la
 * clase a la izquierda, el nombre, «08:00 · 50 min» con su reloj, la sala y la instructora con su cara; a la derecha, el
 * chip de plazas (`EstadoDeClase`: en curso, terminada o «se abre…» cuando toca) y la flecha. Toda la fila lleva a la
 * ficha, que es donde se reserva. Inicio y Calendario siguen con `ClassCard`.
 *
 * La foto es la de la clase (`fotoUrl`: la del tipo, la de su sala o la de por defecto de su disciplina), como en la
 * maqueta: antes solo se ponía la foto PROPIA y las demás filas salían con una inicial.
 */
export function FilaHorario({ clase, instructora, estado, temporal, delay = 0, entrada = true }: {
  clase: Clase; instructora?: Instructora; estado: Disponibilidad; temporal: EstadoTemporal;
  delay?: number;
  /** Con su animación de entrada. Solo las primeras filas: una cascada de 40 tardaba más de 2 s en quedarse quieta. */
  entrada?: boolean;
}) {
  const href = usePortalHref();
  const suya = estado === 'reservada';
  return (
    <Link
      href={href('/reservar/' + clase.id)}
      transitionTypes={TRANSICION_ADELANTE}
      className={'card card--tap fila-horario' + (entrada ? ' a-up' : '')}
      data-testid="fila-horario"
      data-clase={clase.id}
      style={{
        display: 'flex', alignItems: 'stretch', gap: 12, padding: 8, animationDelay: entrada ? delay + 'ms' : undefined, color: 'var(--foreground)',
        borderColor: suya ? 'var(--accent)' : undefined, borderWidth: suya ? 1.5 : 1,
      }}
    >
      <span aria-hidden data-testid="foto-clase" style={{ width: 92, minHeight: 88, flexShrink: 0, borderRadius: 14, overflow: 'hidden', background: 'var(--muted)', position: 'relative' }}>
        <Foto src={clase.fotoUrl} ancho={92} alto={92} sizes="92px" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
        {clase.logoUrl && (
          <span data-testid="logo-clase" style={{ position: 'absolute', right: 5, bottom: 5, width: 20, height: 20, borderRadius: 6, background: 'url(' + clase.logoUrl + ') center/cover', border: '1px solid var(--card)' }} />
        )}
      </span>
      <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 3, padding: '4px 0' }}>
        <span className="fila-horario__nombre" style={{ fontSize: 'var(--t-body)', fontWeight: 800, lineHeight: 1.2 }}>{clase.nombre}</span>
        <span className="t-meta t-num" style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <Icono nombre="reloj" tamano={14} />{clase.hora} · {temporal === 'en-curso' ? `hasta ${horaFin(clase.hora, clase.duracionMin)}` : `${clase.duracionMin} min`}
        </span>
        <span className="t-meta" style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
          {instructora && <CaraInstructora i={instructora} lado={18} />}
          <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{[clase.sala, instructora?.nombre].filter(Boolean).join(' · ')}</span>
        </span>
      </span>
      <span style={{ flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'flex-end', justifyContent: 'space-between', padding: '4px 4px 4px 0' }}>
        {/* En curso, solo el chip: la hora de fin va en la línea de la hora (a la derecha se comía la instructora). */}
        <EstadoDeClase clase={clase} estado={estado} temporal={temporal} compacta />
        <span aria-hidden className="flecha-fila"><Icono nombre="chevron-derecha" tamano={18} /></span>
      </span>
    </Link>
  );
}
