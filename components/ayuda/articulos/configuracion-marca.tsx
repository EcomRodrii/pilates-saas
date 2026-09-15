import Link from 'next/link';
import { AyudaResultado } from '@/components/ayuda/AyudaPasos';

// Reescrito el 14-sep-2026: la versión del 28-ago mandaba a «Editar marca y
// apariencia» y a un editor de tema con borrador y «Publicar». Ese editor está
// en mantenimiento desde el 7-sep y el botón ya no existe: el logo y el favicon
// se suben en Configuración y el color abre /configuracion/apariencia/panel,
// que guarda al momento («Guardar colores»). La captura enseñaba el editor
// cerrado y se quitó.
//
// 15-sep-2026: Configuración se reorganizó por preguntas. La tarjeta «Marca» se
// pinta en «Mi estudio» (su sitio definitivo es «Mi app y mi web», que tiene
// una fila que lleva hasta ella) y el nombre del estudio está en «Datos y
// contacto».
export default function Contenido() {
  return (
    <>
      <p>
        En Configuración &gt; Mi estudio, «Datos y contacto» tiene el nombre de tu estudio, que se guarda con el botón
        «Guardar datos del estudio». Justo debajo, «Marca»: el logo y el favicon se guardan solos en cuanto los subes,
        y subirlos no borra nada de lo que estés escribiendo en el resto de la pantalla.
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
