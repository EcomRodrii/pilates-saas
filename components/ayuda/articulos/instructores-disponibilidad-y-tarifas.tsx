import Link from 'next/link';
import { AyudaResultado } from '@/components/ayuda/AyudaPasos';

export default function Contenido() {
  return (
    <>
      <h2 style={{ fontSize: 18, fontWeight: 700, margin: '4px 0 12px' }}>Disponibilidad</h2>
      <p>
        Cada instructora pone su propia disponibilidad semanal desde su panel — no tienes que preguntársela ni
        cargarla tú. Es lo que usa Tentare para sugerir candidatas cuando hay que cubrir una clase (ver{' '}
        <Link href="/ayuda/instructores/sustituciones" style={{ color: 'inherit', textDecoration: 'underline' }}>sustituciones</Link>) y para que ella misma pueda crear sus propias clases dentro de ese horario.
      </p>
      <p>
        Si tiene más de una sede, su disponibilidad es independiente por sede — la que pone en una no afecta a la
        otra, igual que su rol y su tarifa.
      </p>

      <h2 style={{ fontSize: 18, fontWeight: 700, margin: '28px 0 12px' }}>Tarifa por hora</h2>
      <p>
        La tarifa la fija la propietaria o manager, nunca la propia instructora — ella solo puede consultar la suya,
        no editarla. Sirve de base para la liquidación mensual de horas trabajadas.
      </p>

      <AyudaResultado>
        Un cambio de tarifa no es retroactivo: afecta a las horas que se liquiden a partir de ese momento, no
        recalcula liquidaciones ya cerradas.
      </AyudaResultado>
    </>
  );
}
