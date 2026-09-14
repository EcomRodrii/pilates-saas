import Link from 'next/link';
import { AyudaResultado } from '@/components/ayuda/AyudaPasos';

export default function Contenido() {
  return (
    <>
      <h2 style={{ fontSize: 18, fontWeight: 700, margin: '4px 0 12px' }}>Disponibilidad</h2>
      <p>
        Cada instructora pone su propia disponibilidad semanal desde la app del estudio — no tienes que
        preguntársela ni cargarla tú. Es lo que usa Tentare para sugerir candidatas cuando hay que cubrir una clase (ver{' '}
        <Link href="/ayuda/instructores/sustituciones" style={{ color: 'inherit', textDecoration: 'underline' }}>sustituciones</Link>). Si tu estudio lo permite, además puede crear sus propias clases.
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
        Un cambio de tarifa no toca las liquidaciones ya confirmadas o pagadas. Una que siga en borrador sí se
        recalcula con la tarifa nueva, para el mes entero.
      </AyudaResultado>
    </>
  );
}
