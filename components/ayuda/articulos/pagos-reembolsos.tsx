import { AyudaPaso, AyudaAntesDeEmpezar, AyudaResultado } from '@/components/ayuda/AyudaPasos';

export default function Contenido() {
  return (
    <>
      <AyudaAntesDeEmpezar>
        Un reembolso se pide desde Tentare, pero el dinero lo devuelve Stripe directamente a la tarjeta de la
        alumna — Tentare nunca gestiona el dinero fuera de ese circuito.
      </AyudaAntesDeEmpezar>

      <AyudaPaso numero={1} titulo="Abre el cobro en la ficha de la clienta">
        <p>El botón «Devolver» de la ficha aparece cuando has activado tu política de devoluciones en Configuración &gt; Estudio &gt; Cobros. El «Devolver» de la pantalla de Cobros solo lo apunta como devuelto: no mueve dinero.</p>
      </AyudaPaso>

      <AyudaPaso numero={2} titulo="Pide el reembolso">
        <p style={{ margin: 0 }}>Desde Tentare se devuelve el cobro entero; si necesitas uno parcial, hazlo en Stripe. La petición va a Stripe, y el dinero tarda lo que tarde normalmente un reembolso con tarjeta (unos días, según el banco de la alumna) en aparecer en su cuenta.</p>
      </AyudaPaso>

      <AyudaResultado>
        Un reembolso no toca la factura original: cuando el cobro figura como devuelto, emites tú la rectificativa
        con «Rectificar» — se corrige con una nueva, para que tu contabilidad quede siempre trazable.
      </AyudaResultado>
    </>
  );
}
