import { AyudaPaso, AyudaAntesDeEmpezar, AyudaResultado } from '@/components/ayuda/AyudaPasos';

export default function Contenido() {
  return (
    <>
      <AyudaAntesDeEmpezar>
        Con el datáfono de Stripe conectado, cobrar con tarjeta en la Caja es un solo gesto: eliges <strong>Datáfono</strong>,
        el importe aparece en su pantalla, la clienta pasa la tarjeta y la venta queda cobrada sola. Necesitas el cobro con
        tarjeta conectado (<strong>Configuración &gt; Cobros y facturas</strong>) y un datáfono de Stripe:{' '}
        <strong>Stripe Reader S700</strong> o <strong>BBPOS WisePOS E</strong>. Lo conectan la propietaria o recepción.
      </AyudaAntesDeEmpezar>

      <AyudaPaso numero={1} titulo="Si todavía no lo tienes">
        <p style={{ margin: 0 }}>
          Se compra en tu propia cuenta de Stripe (la misma con la que ya cobras con tarjeta), en el apartado de Terminal,
          y te llega a casa. Stripe se queda una comisión por cada cobro con el datáfono; la tienes en sus tarifas para
          pagos en persona. El datáfono de tu banco suele cobrar menos por operación; a cambio, aquí no tecleas el importe
          y cada cobro queda apuntado solo.
        </p>
      </AyudaPaso>

      <AyudaPaso numero={2} titulo="Abre «Conectar datáfono»">
        <p style={{ margin: 0 }}>
          En la <strong>Caja</strong>, pulsa Cobrar: sin datáfono, el botón dice <strong>Conectar datáfono</strong>. Lo
          mismo desde <strong>Configuración &gt; Cobros y facturas</strong>, en la fila Datáfono. Si estabas cobrando, al
          terminar vuelves a la misma venta.
        </p>
      </AyudaPaso>

      <AyudaPaso numero={3} titulo="Escribe el código que enseña el datáfono">
        <p>
          Enciéndelo y conéctalo al wifi del estudio. Desliza desde el borde izquierdo de su pantalla, entra en{' '}
          <strong>Ajustes</strong> (si te pide una clave, es la de fábrica de Stripe, <strong>07139</strong>) y pulsa{' '}
          <strong>Generar código de emparejamiento</strong>. Salen tres palabras: escríbelas en Tentare.
        </p>
        <p style={{ margin: 0 }}>
          Ponle un nombre (por defecto, «Mostrador») y revisa la dirección: Stripe pide dónde está el datáfono y usamos la
          de tu estudio. Si tu estudio no la tiene puesta, te la pedimos ahí y la guardamos también en tu estudio.
        </p>
      </AyudaPaso>

      <AyudaResultado>
        En la hoja de cobro, el botón dice <strong>Datáfono · Mostrador · listo</strong>. Al elegirlo, el importe aparece
        en su pantalla y la venta queda <strong>Cobrada</strong> cuando Stripe confirma el pago, no antes.
      </AyudaResultado>

      <h2 style={{ fontSize: 18, fontWeight: 700, margin: '28px 0 12px' }}>Si dice «sin conexión»</h2>
      <p>
        El datáfono está apagado o sin wifi. No se le manda nada: enciéndelo, comprueba el wifi y pulsa{' '}
        <strong>Volver a comprobar</strong>.
      </p>

      <h2 style={{ fontSize: 18, fontWeight: 700, margin: '28px 0 12px' }}>Si el código no vale</h2>
      <p>
        Los códigos caducan. Genera otro en el datáfono y vuelve a escribirlo. Las tres palabras van separadas por guiones,
        como salen en su pantalla.
      </p>

      <h2 style={{ fontSize: 18, fontWeight: 700, margin: '28px 0 12px' }}>Con un SumUp Solo (próximamente)</h2>
      <p>
        En el primer paso sale <strong>Un SumUp Solo</strong> con la etiqueta <strong>Próximamente</strong>: todavía no
        se puede conectar. Cuando se pueda, cobrarás con él aunque no tengas Stripe, y el dinero irá a tu cuenta de SumUp,
        con las comisiones que ya tengas con ellos. Será así:
      </p>
      <p>
        La primera vez, la propietaria conecta la cuenta de SumUp: se abre SumUp, entra con su usuario y acepta. Después,
        en el Solo, abre el <strong>Menú</strong>, entra en <strong>Conexiones › API</strong> y pulsa{' '}
        <strong>Conectar</strong>: sale un código de 8 o 9 letras y números. Escríbelo en Tentare y listo.
      </p>
      <p>
        Cobrar es igual: eliges <strong>Datáfono</strong>, el importe sale en el Solo y la venta queda cobrada cuando
        SumUp lo confirma. Devolverla es igual que cualquier otra venta, desde <strong>Ventas</strong> en la Caja: el
        dinero vuelve a su tarjeta por SumUp. Si ya la devolviste desde la app de SumUp, al devolver aquí lo mismo solo se
        apunta, sin devolver nada más.
      </p>

      <h2 style={{ fontSize: 18, fontWeight: 700, margin: '28px 0 12px' }}>Con el datáfono de tu banco (próximamente)</h2>
      <p>
        También sale en el primer paso, como <strong>Próximamente</strong>. Mientras, cobra en la Caja con{' '}
        <strong>Tarjeta</strong>: tecleas el importe en el datáfono de tu banco y el cobro queda apuntado en Tentare.
      </p>

      <h2 style={{ fontSize: 18, fontWeight: 700, margin: '28px 0 12px' }}>Cambiarlo o desconectarlo</h2>
      <p>
        En <strong>Configuración &gt; Cobros y facturas</strong>, fila Datáfono: ves si está encendido, le cambias el
        nombre, conectas otro en su lugar o lo desconectas. Con SumUp, también ves qué cuenta
        está conectada y la propietaria puede desconectarla. Desconectarlo no toca los cobros ya hechos; hasta que conectes
        otro, en la Caja no podrás cobrar con datáfono. Puedes seguir cobrando con «Tarjeta», el datáfono de tu banco, como
        siempre.
      </p>
    </>
  );
}
