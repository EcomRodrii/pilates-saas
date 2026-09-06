import { AyudaResultado } from '@/components/ayuda/AyudaPasos';

export default function Contenido() {
  return (
    <>
      <p>
        Cada cobro que se completa genera su factura automáticamente — no tienes que crearlas tú una a una. La
        encuentras en Facturas, con opción de descargarla en PDF.
      </p>

      <h2 style={{ fontSize: 18, fontWeight: 700, margin: '24px 0 12px' }}>Veri*Factu</h2>
      <p>
        Cada factura lleva numeración correlativa y una huella que la encadena con la anterior — el mecanismo que
        exige Veri*Factu para que nadie pueda editar o borrar una factura después sin que se note. Eso se hace solo,
        en cuanto se cobra, y lleva su código QR de verificación.
      </p>
      <p>
        El <strong>envío del registro a la AEAT está en camino</strong>: la parte que firma y encadena ya funciona, y
        la que transmite está construida pero todavía no activada. Te avisaremos cuando puedas encenderla. Mientras
        tanto, tus facturas cumplen con el encadenado y el QR, que es lo que evita que una factura se pueda tocar
        después sin que se note.
      </p>

      <h2 style={{ fontSize: 18, fontWeight: 700, margin: '28px 0 12px' }}>Datos fiscales</h2>
      <p>
        Los datos que aparecen en tus facturas (nombre fiscal, NIF, dirección) salen de lo que tengas configurado en
        Configuración &gt; Estudio — revísalos antes de tu primer cobro real.
      </p>

      <AyudaResultado>
        Al cierre de año, tus facturas ya están listas para pasárselas a tu gestoría — no hace falta ninguna
        exportación especial.
      </AyudaResultado>
    </>
  );
}
