import Link from 'next/link';
import { AyudaPaso, AyudaAntesDeEmpezar, AyudaResultado } from '@/components/ayuda/AyudaPasos';
import { AyudaCaptura } from '@/components/ayuda/AyudaCaptura';

export default function Contenido() {
  return (
    <>
      <AyudaAntesDeEmpezar>
        Sin Stripe conectado puedes seguir marcando cobros como pagados a mano (efectivo, transferencia), pero no
        hay cobro con tarjeta ni tarjeta guardada para renovaciones automáticas.
      </AyudaAntesDeEmpezar>

      <AyudaPaso numero={1} titulo="Ve a Configuración > Pagos">
        <p>Ahí empieza la conexión con Stripe Connect — el cobro llega directo a tu propia cuenta de Stripe, Tentare nunca retiene el dinero de camino.</p>
        <AyudaCaptura alt="Pantalla de conexión con Stripe en Configuración" pendiente="conexión Stripe" />
      </AyudaPaso>

      <AyudaPaso numero={2} titulo="Completa la verificación de Stripe">
        <p>Datos de tu negocio y cuenta bancaria — es el proceso estándar de Stripe, no un formulario propio de Tentare.</p>
      </AyudaPaso>

      <AyudaResultado>
        En cuanto está conectada, tus alumnas pueden guardar tarjeta al reservar o pagar un bono, y tú puedes cobrar
        con tarjeta desde el panel. Sigue con{' '}
        <Link href="/ayuda/pagos/tarjeta-guardada-y-cobro-automatico" style={{ color: 'inherit', textDecoration: 'underline' }}>tarjeta guardada y cobro automático</Link>.
      </AyudaResultado>
    </>
  );
}
