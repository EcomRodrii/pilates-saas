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

      <AyudaPaso numero={1} titulo="Ve a Configuración > Integraciones">
        <p>La tarjeta de Stripe es la primera de la lista — «Cobra suscripciones y bonos con tarjeta o SEPA. El dinero va directo a tu propia cuenta de Stripe».</p>
        <AyudaCaptura
          src="/help/pagos/configuracion-integraciones-stripe.png"
          alt="Tarjeta de Stripe en Configuración > Integraciones, con el botón Conectar con Stripe"
          caption="Configuración &gt; Integraciones — un clic, sin pegar ninguna clave."
        />
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
