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
        Tentare solo emite facturas con Veri*Factu, es decir, enviando el registro de cada una a la AEAT. Por eso,
        antes de emitirlas, tu envío a la AEAT tiene que estar activo: lo autorizas en la propia AEAT y Tentare lo
        comprueba y lo activa. En «Facturación» ves en qué punto está. Desde ese día, cada cobro que se completa
        (salvo en efectivo) genera su factura automáticamente — no tienes que crearlas tú una a una. La encuentras
        en Facturas, con opción de descargarla en PDF. Si retiras tu autorización en la AEAT o caduca, Tentare deja de
        emitirlas hasta que la renueves, porque ya no puede enviarlas.
      </p>
      <p>
        Puedes dejar de emitirlas cuando quieras, y las que ya emitiste se quedan como están. Pero la norma obliga a
        quien ya factura con Veri*Factu a seguir así hasta el 31 de diciembre de ese año: hasta entonces, tus
        facturas tendrán que salir por otro sistema Veri*Factu. Háblalo antes con tu asesoría.
      </p>

      <h2 style={{ fontSize: 18, fontWeight: 700, margin: '24px 0 12px' }}>Veri*Factu</h2>
      <p>
        Cada factura que emite Tentare lleva numeración correlativa y una huella que la encadena con la anterior — el mecanismo que
        exige Veri*Factu para que nadie pueda editar o borrar una factura después sin que se note — y su registro se
        envía a la AEAT. Eso se hace solo, en cuanto se cobra. El código QR de verificación se imprime en la factura
        cuando la AEAT ya tiene su registro: un QR que la AEAT no puede cotejar le diría a tu clienta que su factura
        no consta.
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
