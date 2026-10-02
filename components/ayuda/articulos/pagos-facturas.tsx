import { AyudaResultado } from '@/components/ayuda/AyudaPasos';

export default function Contenido() {
  return (
    <>
      <p>
        Tentare emite tus facturas: cada cobro que se completa (salvo en efectivo, donde la haces si te la piden)
        genera su factura con número correlativo, sin que tengas que crearlas una a una. La encuentras en Cobros
        &gt; Facturas, con opción de descargarla en PDF. Lo único que hace falta es tu NIF, en Configuración &gt; Cobros y
        facturas, en «Datos fiscales e IVA»: sin él no sale ninguna.
      </p>
      <p>
        Veri*Factu va aparte y está desactivado de entrada: es lo que añade a cada factura su huella y su QR y envía su
        registro a la AEAT. Con el calendario publicado hoy, el reglamento de sistemas de facturación obliga desde el 1
        de enero de 2027 a las sociedades y desde el 1 de julio de 2027 al resto: confírmalo con tu asesoría. Para
        activarlo, tu envío a la AEAT tiene que estar activo: lo autorizas en la propia AEAT y Tentare lo comprueba y lo
        activa. En «Facturación» ves en qué punto está. Si retiras tu autorización o caduca, tus facturas siguen
        saliendo, sin envío, hasta que la renueves.
      </p>
      <p>
        Puedes desactivar Veri*Factu cuando quieras, y lo ya enviado se queda como está. Pero la norma obliga a quien
        ya factura con Veri*Factu a seguir así hasta el 31 de diciembre de ese año: hasta entonces, tus facturas
        tendrán que salir por otro sistema Veri*Factu. Háblalo antes con tu asesoría.
      </p>

      <h2 style={{ fontSize: 18, fontWeight: 700, margin: '24px 0 12px' }}>Veri*Factu</h2>
      <p>
        Con Veri*Factu activado, cada factura lleva además de su número una huella que la encadena con la anterior — el mecanismo que
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
