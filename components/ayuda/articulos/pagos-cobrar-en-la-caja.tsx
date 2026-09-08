import { AyudaPaso, AyudaAntesDeEmpezar, AyudaResultado } from '@/components/ayuda/AyudaPasos';

export default function Contenido() {
  return (
    <>
      <AyudaAntesDeEmpezar>
        La Caja está en <strong>Ventas &gt; Caja</strong>, y es una pantalla de mostrador: se usa de pie, con la
        clienta delante. Solo la ven la propietaria y recepción — quien no mueve dinero no la tiene en el menú.
      </AyudaAntesDeEmpezar>

      <AyudaPaso numero={1} titulo="Monta el ticket">
        <p>
          Toca lo que vendes. En el catálogo están tus productos y tus paquetes —cuotas, bonos y clases sueltas—,
          los mismos que en Paquetes: no hay que darlos de alta dos veces.
        </p>
        <p style={{ margin: 0 }}>
          ¿Es algo que no está en el catálogo? <strong>Importe libre</strong> te deja teclear el concepto y el
          precio a mano, sin tener que crear un producto para un taller que das una vez.
        </p>
      </AyudaPaso>

      <AyudaPaso numero={2} titulo="Elige cómo paga">
        <p>Cinco formas, y no todas quieren decir lo mismo:</p>
        <ul style={{ paddingLeft: 20, lineHeight: 1.7 }}>
          <li><strong>Efectivo</strong> — lo cuentas tú, y el recuento del cierre lo verifica.</li>
          <li><strong>Datáfono</strong> — se manda al lector; el cobro lo confirma Stripe.</li>
          <li><strong>Bizum</strong> — paga desde su móvil; también lo confirma Stripe.</li>
          <li><strong>Tarjeta</strong> — el TPV de tu banco. Ese cobro Tentare no lo ve.</li>
          <li><strong>Transferencia</strong> — ya te la han hecho.</li>
        </ul>
        <p>
          La diferencia entre los tres primeros y los dos últimos importa, y por eso la pantalla no los trata
          igual. En Datáfono y Bizum, «Cobrado» significa que Stripe lo ha confirmado. En Tarjeta y Transferencia
          significa <strong>que lo has dicho tú</strong>: nadie más puede saberlo, así que Tentare te lo pregunta
          en vez de darlo por hecho. Registrarlo es correcto; pintarlo como un cobro verificado no lo sería.
        </p>
        <p style={{ margin: 0 }}>
          Datáfono y Bizum solo están disponibles si tienes lector emparejado y Stripe conectado. Si no, aparecen
          apagados: mejor eso que un botón que falla con alguien esperando.
        </p>
      </AyudaPaso>

      <AyudaPaso numero={3} titulo="Si vendes un bono, di de quién es">
        <p>
          Al cobrar puedes asignar la venta a una clienta, y el bono se le entrega ahí mismo con sus sesiones
          contadas. El cobro le aparece en su historial como cualquier otro.
        </p>
        <p style={{ margin: 0 }}>
          Y si cobras una clase de prueba de pie, sin ficha todavía, no pasa nada: desde <strong>Ventas</strong>{' '}
          puedes asignar esa venta más tarde —ese mismo día o tres semanas después— y entonces se crea el bono y
          el recibo pasa a su ficha.
        </p>
      </AyudaPaso>

      <AyudaPaso numero={4} titulo="«Vengo a pagar la cuota»">
        <p style={{ margin: 0 }}>
          Eso también se hace desde aquí: buscas a la clienta y le cobras el recibo que tenga pendiente. Hacerlo
          en la Caja y no en Cobros no es un capricho — si el efectivo entra en el cajón sin pasar por la Caja,
          el recuento del cierre te sale sobrado y sin explicación.
        </p>
      </AyudaPaso>

      <AyudaResultado>
        Cada venta lleva su factura, igual que cualquier otro cobro de Tentare, y queda en <strong>Ventas</strong>{' '}
        con su número y su método. Ojo con una cosa: la factura de una venta sin clienta se emite como{' '}
        <strong>simplificada</strong>, y asignarla después <em>no</em> le cambia el receptor — un documento fiscal
        ya sellado no se reescribe. Si hace falta la factura a su nombre, se hace una rectificativa desde Facturas.
      </AyudaResultado>
    </>
  );
}
