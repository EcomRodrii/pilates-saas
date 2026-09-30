import { AyudaResultado } from '@/components/ayuda/AyudaPasos';

export default function Contenido() {
  return (
    <>
      <p>
        Tú eliges si Tentare emite tus facturas. Se cambia en Configuración &gt; Cobros y facturas, en
        «Facturación». Si no lo activas, Tentare no emite ninguna: cada cobro deja su recibo, tu alumna recibe su
        justificante de pago y tus facturas las haces con tu gestoría o con otro programa.
      </p>
      <p>
        Si lo activas, cada cobro que se completa (salvo en efectivo) genera su factura automáticamente — no tienes
        que crearlas tú una a una. La encuentras en Facturas, con opción de descargarla en PDF. Puedes desactivarlo
        cuando quieras: las facturas que ya emitiste se quedan como están.
      </p>

      <h2 style={{ fontSize: 18, fontWeight: 700, margin: '24px 0 12px' }}>Veri*Factu</h2>
      <p>
        Si Tentare emite tus facturas, cada una lleva numeración correlativa y una huella que la encadena con la anterior — el mecanismo que
        exige Veri*Factu para que nadie pueda editar o borrar una factura después sin que se note. Eso se hace solo,
        en cuanto se cobra. El código QR de verificación se imprime en la factura cuando la AEAT ya tiene su
        registro: un QR que la AEAT no puede cotejar le diría a tu clienta que su factura no consta.
      </p>
      <p>
        El <strong>envío del registro a la AEAT está en camino</strong>: la parte que firma y encadena ya funciona, y
        la que transmite está construida pero todavía no activada. Te avisaremos cuando puedas encenderla. Mientras
        tanto, cada factura queda numerada y encadenada a la anterior, que es lo que evita que se pueda tocar
        después sin que se note; el QR aparecerá en tus facturas cuando el envío esté activo.
      </p>

      <h2 style={{ fontSize: 18, fontWeight: 700, margin: '28px 0 12px' }}>Datos fiscales</h2>
      <p>
        Los datos que aparecen en tus facturas (nombre fiscal, NIF, dirección) salen de lo que tengas configurado en
        Configuración &gt; Cobros y facturas, en «Datos fiscales e IVA» — revísalos antes de tu primer cobro real.
      </p>

      <AyudaResultado>
        Al cierre de año, tus facturas ya están listas para pasárselas a tu gestoría — no hace falta ninguna
        exportación especial.
      </AyudaResultado>
    </>
  );
}
