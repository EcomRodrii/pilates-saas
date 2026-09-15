import Link from 'next/link';
import { AyudaPaso, AyudaAntesDeEmpezar, AyudaResultado } from '@/components/ayuda/AyudaPasos';

// 15-sep-2026: sin captura. La que había enseñaba la fila de pestañas de
// Configuración de antes de reorganizarla por preguntas; mejor ninguna imagen
// que una de una pantalla que ya no existe (mismo criterio que bonos-crear-un-plan).
export default function Contenido() {
  return (
    <>
      <AyudaAntesDeEmpezar>
        Sin Stripe conectado puedes seguir marcando cobros como pagados a mano (efectivo, transferencia), pero no
        hay cobro con tarjeta ni tarjeta guardada para renovaciones automáticas.
      </AyudaAntesDeEmpezar>

      <AyudaPaso numero={1} titulo="Ve a Configuración > Cobros y facturas">
        <p>
          En la fila «Cobro con tarjeta (Stripe)», pulsa «Conectar» — un clic, sin pegar ninguna clave. Cuando
          está conectado, la fila lo dice y, al tocarla, puedes abrir tu cuenta de Stripe o desconectarla.
        </p>
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
