import Link from 'next/link';
import { AyudaResultado } from '@/components/ayuda/AyudaPasos';

export default function Contenido() {
  return (
    <>
      <p>
        Una cuota (mensual, trimestral, semestral o anual) con tarjeta o SEPA guardados se cobra sola al vencer —
        no hace falta que tú ni la alumna hagáis nada para que siga activa. Sin método guardado, el recibo queda
        pendiente en Cobros para cobrarlo a mano.
      </p>

      <h2 style={{ fontSize: 18, fontWeight: 700, margin: '24px 0 12px' }}>Qué comprueba antes de cobrar</h2>
      <p>
        En la renovación se vuelve a comprobar que hay una tarjeta guardada válida. Si el cobro falla, entra en el
        mismo circuito de reintentos que cualquier otro pago —{' '}
        <Link href="/ayuda/pagos/cobros-fallidos" style={{ color: 'inherit', textDecoration: 'underline' }}>ver cobros fallidos</Link> —; si los tres intentos fallan, el recibo queda como no cobrado y la suscripción se cancela.
      </p>

      <h2 style={{ fontSize: 18, fontWeight: 700, margin: '28px 0 12px' }}>Bonos, no</h2>
      <p>
        Un bono de sesiones no se renueva solo: al agotarse o caducar, la alumna necesita comprar uno nuevo o que se
        lo asignes tú. Solo las cuotas tienen renovación automática.
      </p>

      <AyudaResultado>
        Cada renovación genera su propio cobro y su propia factura — nunca se junta con la del mes anterior, aunque
        el importe sea idéntico cada vez.
      </AyudaResultado>
    </>
  );
}
