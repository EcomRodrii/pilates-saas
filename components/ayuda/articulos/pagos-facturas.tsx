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
        exige Veri*Factu para que nadie pueda editar o borrar una factura después sin que se note. Se firma y se
        envía a la AEAT automáticamente, sin que tengas que hacer ningún trámite aparte al facturar.
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
