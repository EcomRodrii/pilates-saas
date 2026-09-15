import Link from 'next/link';
import { AyudaResultado } from '@/components/ayuda/AyudaPasos';

// Verificado en vivo el 28-ago-2026 contra la pestaña «Estudio > General».
//
// 15-sep-2026: Configuración se reorganizó por preguntas, y el formulario único
// de «Guardar datos del estudio» se partió en tres, cada uno en su sección y con
// su propio botón: «Datos y contacto» (Mi estudio), «Datos fiscales e IVA»
// (Cobros y facturas) y «Textos de tu app» (Mi app y mi web). La captura
// enseñaba la fila de pestañas de antes y se quitó.
//
// 15-sep-2026 (v2): Mi estudio son filas que dicen lo guardado; cada una se abre
// para cambiarla, con «Guardar». «Datos y contacto» se partió en «Nombre y
// dirección» y «Contacto» (components/configuracion/tab-datos-contacto.tsx).
export default function Contenido() {
  return (
    <>
      <p>
        En Configuración &gt; Mi estudio, cada fila dice lo que tienes guardado y, al tocarla, se abre para cambiarlo.
        «Nombre y dirección» tiene el nombre del estudio, la dirección, la ciudad y el código postal; «Contacto», el
        teléfono, el email de contacto y la web. Cada una se guarda con su botón «Guardar», que sale en cuanto cambias
        algo.
      </p>

      <h2 style={{ fontSize: 18, fontWeight: 700, margin: '28px 0 12px' }}>Datos fiscales e IVA</h2>
      <p>
        La razón social, el NIF/CIF y el IVA general están en Configuración &gt; Cobros y facturas, en «Datos fiscales e
        IVA», con su propio botón «Guardar datos fiscales». Cambiar el IVA no toca las facturas ya emitidas y selladas
        con Veri*Factu — solo afecta a partir de ese momento.
      </p>

      <h2 style={{ fontSize: 18, fontWeight: 700, margin: '28px 0 12px' }}>Cómo te presentas</h2>
      <p>
        «Textos de tu app», en Configuración &gt; Marca, son textos libres para tu página de reservas y la app
        de tus alumnas: cómo te presentas, tu lema, las frases de bienvenida y de portada, y las normas del centro. Se
        guardan con «Guardar textos de tu app». Si dejas un texto vacío, ese bloque simplemente no se pinta — no hay
        texto de relleno.
      </p>

      <p>
        Cada botón guarda solo lo de su tarjeta: guardar el teléfono no toca tu NIF ni tus textos, y lo que estés
        escribiendo en otra tarjeta se queda como está.
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
