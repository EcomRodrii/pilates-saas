import { AyudaPaso, AyudaAntesDeEmpezar, AyudaResultado } from '@/components/ayuda/AyudaPasos';

export default function Contenido() {
  return (
    <>
      <AyudaAntesDeEmpezar>
        Un reembolso se pide desde Tentare, pero el dinero lo devuelve Stripe directamente a la tarjeta de la
        alumna — Tentare nunca gestiona el dinero fuera de ese circuito.
      </AyudaAntesDeEmpezar>

      <AyudaPaso numero={1} titulo="Localiza el cobro en Cobros o en la ficha de la clienta">
        <p>Cada cobro muestra si ya está facturado y si tiene algún reembolso previo.</p>
      </AyudaPaso>

      <AyudaPaso numero={2} titulo="Pide el reembolso, total o parcial">
        <p style={{ margin: 0 }}>La petición se envía a Stripe; el dinero tarda lo que tarde normalmente un reembolso con tarjeta (unos días, según el banco de la alumna) en aparecer en su cuenta.</p>
      </AyudaPaso>

      <AyudaResultado>
        Un reembolso genera su propia factura rectificativa — no se edita la factura original, se anula o se
        corrige con una nueva, para que tu contabilidad quede siempre trazable.
      </AyudaResultado>
    </>
  );
}
