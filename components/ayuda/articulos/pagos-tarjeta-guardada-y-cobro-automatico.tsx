import Link from 'next/link';
import { AyudaResultado } from '@/components/ayuda/AyudaPasos';

export default function Contenido() {
  return (
    <>
      <p>
        En el checkout de un plan o bono, la alumna paga con el formulario de pago de Stripe — que ya muestra Apple
        Pay o Google Pay solos si su dispositivo y navegador los soportan, sin que tengas que activar nada aparte.
      </p>

      <h2 style={{ fontSize: 18, fontWeight: 700, margin: '24px 0 12px' }}>Qué pasa en cada renovación</h2>
      <p>
        Si su plan es mensual, la tarjeta guardada se carga sola en la fecha de renovación. No hace falta que tú
        hagas nada: el cobro, la factura y el aviso a la alumna salen solos.
      </p>

      <h2 style={{ fontSize: 18, fontWeight: 700, margin: '28px 0 12px' }}>Si quiere cambiar de tarjeta</h2>
      <p>
        Puede hacerlo ella misma desde su portal, sin pedírtelo a ti. La próxima renovación usará la tarjeta nueva.
      </p>

      <AyudaResultado>
        Un cobro nunca se da por hecho hasta que Stripe confirma que ha entrado de verdad — si algo falla, sigue en{' '}
        <Link href="/ayuda/pagos/cobros-fallidos" style={{ color: 'inherit', textDecoration: 'underline' }}>cobros fallidos</Link>.
      </AyudaResultado>
    </>
  );
}
