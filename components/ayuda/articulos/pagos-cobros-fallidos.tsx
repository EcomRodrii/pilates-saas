import Link from 'next/link';
import { QueEstaPasando, CausasComunes, ComoSolucionarlo } from '@/components/ayuda/TroubleshootShell';
import { AyudaResultado } from '@/components/ayuda/AyudaPasos';

// Verificado contra lib/billing/dunning.ts (planificarTrasFallo): 3 intentos en
// total —el del vencimiento y reintentos a +3 y +7 días—; al tercer fallo el
// recibo queda FALLIDO y dunning-server.ts cancela la suscripción.
export default function Contenido() {
  return (
    <>
      <QueEstaPasando>
        Un cobro con la tarjeta guardada de una alumna no ha entrado — tarjeta caducada, sin fondos, o el banco lo
        ha rechazado por su cuenta.
      </QueEstaPasando>

      <CausasComunes items={[
        'La tarjeta guardada ha caducado.',
        'No hay fondos suficientes en el momento del cobro.',
        'El banco de la alumna bloquea el cargo (antifraude, límite de la tarjeta).',
      ]} />

      <ComoSolucionarlo>
        <p style={{ margin: '0 0 12px' }}>
          No hace falta que hagas nada en el primer fallo: Tentare lo reintenta solo a los 3 y a los 7 días del
          vencimiento — tres intentos en total. A la alumna le llega un aviso en el primer fallo para que revise su
          tarjeta; si un reintento entra, el plan sigue activo.
        </p>
        <p style={{ margin: 0 }}>
          Si los tres fallan, el recibo queda como «No se pudo cobrar», su cuota se cancela y te llega un aviso.
          Puedes volver a cobrarlo tú a mano desde Cobros en cuanto la alumna actualice su tarjeta.
        </p>
      </ComoSolucionarlo>

      <AyudaResultado>
        Un cobro fallido nunca deja a la alumna con acceso a la vez que sin pagar de forma silenciosa: el estado de
        su plan refleja siempre si el último cobro entró o no. Relacionado:{' '}
        <Link href="/ayuda/pagos/reembolsos" style={{ color: 'inherit', textDecoration: 'underline' }}>reembolsos</Link>.
      </AyudaResultado>
    </>
  );
}
