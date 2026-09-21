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
      <p>
        Por defecto, la parte variable de la liquidación son las <strong>horas de clase</strong> por la tarifa, con
        recargo en las sustituciones. Si tu equipo ficha la entrada y la salida, puedes calcularla por{' '}
        <strong>horas fichadas</strong> en su lugar: en Equipo → Liquidaciones, «Parte variable calculada por». Lo
        cambia solo la propietaria. Por horas fichadas se pagan las jornadas cerradas del mes (sin recargo de
        sustitución: esas horas ya están dentro de lo fichado), y una liquidación con jornadas sin cerrar no se puede
        confirmar hasta corregirlas en Equipo → Tiempo trabajado.
      </p>
      <p>
        Además, cada clase cuenta según si se dio: una que la instructora dijo no dar no se paga, y una que terminó
        sin saberse si la dio se paga por su horario pero no deja confirmar la liquidación. Las autónomas se pagan
        siempre por clases. Todo esto, en{' '}
        <Link href="/ayuda/instructores/control-horario" style={{ color: 'inherit', textDecoration: 'underline' }}>control horario: jornadas y clases</Link>.
      </p>

      <AyudaResultado>
        Un cambio de tarifa no toca las liquidaciones ya confirmadas o pagadas. Una que siga en borrador sí se
        recalcula con la tarifa nueva, para el mes entero.
      </AyudaResultado>
    </>
  );
}
