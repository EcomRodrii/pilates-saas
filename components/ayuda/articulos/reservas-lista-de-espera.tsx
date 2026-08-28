import Link from 'next/link';
import { AyudaAntesDeEmpezar, AyudaResultado } from '@/components/ayuda/AyudaPasos';

export default function Contenido() {
  return (
    <>
      <AyudaAntesDeEmpezar>
        La lista de espera se activa por tipo de clase — puedes tenerla encendida en unas clases y apagada en otras
        (ver <Link href="/ayuda/reservas/reglas-de-reserva-por-clase" style={{ color: 'inherit', textDecoration: 'underline' }}>reglas de reserva por tipo de clase</Link>).
      </AyudaAntesDeEmpezar>

      <p>
        Cuando una clase está completa, una alumna que intenta reservar entra en lista de espera en vez de quedarse
        sin plaza. Si más tarde alguien cancela, la plaza no se pierde: se ofrece automáticamente a la primera de la
        lista.
      </p>

      <h2 style={{ fontSize: 18, fontWeight: 700, margin: '24px 0 12px' }}>Confirmación instantánea o con plazo</h2>
      <p>
        Por defecto, la primera de la lista pasa a CONFIRMADA al momento en cuanto se libera el hueco. Si tu estudio
        tiene configurado un plazo de aceptación, en vez de confirmarse sola se le abre una oferta con tiempo límite:
        si no la acepta a tiempo, pierde el turno por completo (no pasa al final de la cola) y la plaza se ofrece a
        la siguiente.
      </p>

      <h2 style={{ fontSize: 18, fontWeight: 700, margin: '28px 0 12px' }}>Qué ve la alumna</h2>
      <p>
        En su portal, una reserva en lista de espera se distingue claramente de una CONFIRMADA. Si tiene una oferta
        de plaza pendiente de aceptar, se le muestra el plazo que le queda.
      </p>

      <AyudaResultado>
        El orden de la lista es de llegada: quien pidió antes la clase, sube antes cuando se libera un hueco. Si una
        alumna dice que no le ha llegado su plaza, comprueba primero{' '}
        <Link href="/ayuda/problemas/una-reserva-no-aparece" style={{ color: 'inherit', textDecoration: 'underline' }}>una reserva no aparece</Link>.
      </AyudaResultado>
    </>
  );
}
