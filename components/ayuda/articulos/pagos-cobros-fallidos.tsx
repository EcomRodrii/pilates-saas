import Link from 'next/link';
import { QueEstaPasando, CausasComunes, ComoSolucionarlo } from '@/components/ayuda/TroubleshootShell';
import { AyudaResultado } from '@/components/ayuda/AyudaPasos';

// Verificado contra lib/billing/dunning.ts: 3 reintentos a +1/+3/+7 días tras
// el vencimiento; al agotarlos, el plan pasa a estado de impago.
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
          No hace falta que hagas nada en el primer intento: Tentare reintenta automáticamente a 1, 3 y 7 días del
          fallo — hasta 3 intentos en total. Si alguno de esos reintentos entra, el plan sigue activo sin que la
          alumna note nada.
        </p>
        <p style={{ margin: 0 }}>
          Si los tres reintentos fallan, el plan queda marcado como impago y puedes ver el detalle en Cobros o en la
          ficha de la clienta — desde ahí puedes reintentarlo tú a mano en cuanto la alumna actualice su tarjeta.
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
