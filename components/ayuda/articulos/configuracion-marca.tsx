import Link from 'next/link';
import { AyudaResultado } from '@/components/ayuda/AyudaPasos';

// Reescrito el 14-sep-2026: la versión del 28-ago mandaba a «Editar marca y
// apariencia» y a un editor de tema con borrador y «Publicar». Ese editor está
// en mantenimiento desde el 7-sep y el botón ya no existe: el logo y el favicon
// se suben en Configuración y el color abre /configuracion/apariencia/panel,
// que guarda al momento («Guardar colores»). La captura enseñaba el editor
// cerrado y se quitó.
//
// 15-sep-2026: Configuración se reorganizó por preguntas. La tarjeta «Marca»
// está en «Mi app y mi web», y el nombre del estudio en «Datos y contacto», en
// «Mi estudio».
export default function Contenido() {
  return (
    <>
      <p>
        En Configuración &gt; Mi app y mi web, la tarjeta «Marca» tiene el logo y el favicon: se guardan solos en cuanto
        los subes, y subirlos no borra nada de lo que estés escribiendo en «Textos de tu app», justo debajo. El nombre de
        tu estudio está en Configuración &gt; Mi estudio, en «Datos y contacto».
      </p>

      <p>
        El color va desde «El color de tu marca», en esa misma tarjeta: abre «Personalizar tu panel», donde eliges tu
        color principal y el secundario y los pruebas antes de guardarlos. Lo ven tus alumnas en tu página de
        reservas y en su app.
      </p>

      <AyudaResultado>
        Los colores se aplican en cuanto pulsas «Guardar colores» — no hay borrador. La portada, la tipografía y las
        secciones del portal están en mantenimiento: ver{' '}
        <Link href="/ayuda/portal/personalizar-tu-portal" style={{ color: 'inherit', textDecoration: 'underline' }}>personalizar tu portal</Link>.
      </AyudaResultado>
    </>
  );
}
