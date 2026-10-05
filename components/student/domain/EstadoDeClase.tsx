import type { Clase, Disponibilidad } from '@/lib/student/tipos';
import type { EstadoTemporal } from '@/lib/student/fila-horario';
import { AvailabilityBadge, EnCursoBadge, TerminadaBadge } from '@/components/student/ui/Badge';
import { horaFin } from '@/lib/student/formato';
import { etiquetaSeAbre } from '@/lib/reservar/apertura-texto';

/**
 * Lo que se dice de una clase en ESTE momento, a la derecha de su fila: «En curso · hasta», «Terminada», «Se abre…» o
 * sus plazas. Sale de `estadoTemporalDeFila`, así que la fila de Inicio y Calendario (`ClassCard`) y la del horario
 * (`FilaHorario`) no pueden decir cosas distintas de la misma clase.
 *
 * En curso no se pintan plazas: «Quedan 2» sobre una clase que se está dando es una plaza que el servidor niega.
 */
export function EstadoDeClase({ clase, estado, temporal }: { clase: Clase; estado: Disponibilidad; temporal: EstadoTemporal }) {
  if (temporal === 'en-curso') return <EnCursoBadge terminaA={horaFin(clase.hora, clase.duracionMin)} />;
  if (temporal === 'terminada') return <TerminadaBadge />;
  if (temporal === 'se-abre' && clase.seAbreEl) {
    return <p data-se-abre="" className="t-meta" style={{ margin: 0, fontWeight: 700, color: 'var(--muted-foreground)', whiteSpace: 'nowrap' }}>{etiquetaSeAbre(clase.seAbreEl)}</p>;
  }
  return <AvailabilityBadge estado={estado} plazas={clase.plazasLibres} />;
}
