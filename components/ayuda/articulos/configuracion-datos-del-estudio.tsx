import Link from 'next/link';
import { AyudaResultado } from '@/components/ayuda/AyudaPasos';

// Verificado en vivo el 28-ago-2026 contra la pestaña «Estudio > General».
//
// 15-sep-2026: Configuración se reorganizó por preguntas. Estos datos están en
// «Mi estudio», con un solo «Guardar datos del estudio». Los datos fiscales y
// los textos de la app tienen su sitio en «Cobros y facturas» y «Mi app y mi
// web», y allí hay una fila que trae hasta aquí. La captura enseñaba la fila de
// pestañas de antes (y «Recargar datos», que ya no existe) y se quitó.
export default function Contenido() {
  return (
    <>
      <p>
        En Configuración &gt; Mi estudio guardas los datos de tu negocio: en «Datos y contacto», el nombre del estudio,
        teléfono, email de contacto, web, dirección, ciudad y código postal; y en «Datos fiscales e IVA», la razón
        social y el NIF/CIF. Todo se guarda con el mismo botón, «Guardar datos del estudio».
      </p>

      <h2 style={{ fontSize: 18, fontWeight: 700, margin: '28px 0 12px' }}>Cómo te presentas</h2>
      <p>
        «Textos de tu app», en esa misma pantalla, son textos libres para tu página de reservas y la app de tus
        alumnas: cómo te presentas, tu lema y las frases de bienvenida y de portada. Aquí guardas también las normas
        del centro. Si dejas un texto vacío, ese bloque simplemente no se pinta — no hay texto de relleno.
      </p>

      <h2 style={{ fontSize: 18, fontWeight: 700, margin: '28px 0 12px' }}>Facturación e impuestos</h2>
      <p>
        El IVA general que se aplica a tus próximas facturas se fija en «Datos fiscales e IVA». Cambiarlo no toca las
        facturas ya emitidas y selladas con Veri*Factu — solo afecta a partir de ese momento.
      </p>

      <h2 style={{ fontSize: 18, fontWeight: 700, margin: '28px 0 12px' }}>El resto de Mi estudio</h2>
      <p>
        En la misma sección están también tu horario y los días que cierras, tus salas y, si tienes varias, tus
        sedes. Las reglas de reserva, los cobros y lo legal tienen cada uno su propia sección en Configuración.
      </p>

      <AyudaResultado>
        Revisa el NIF y la dirección antes de tu primer cobro: cambiarlos después no corrige las facturas que ya se
        hayan emitido con los datos anteriores. Relacionado:{' '}
        <Link href="/ayuda/pagos/facturas" style={{ color: 'inherit', textDecoration: 'underline' }}>facturas y Veri*Factu</Link>.
      </AyudaResultado>
    </>
  );
}
