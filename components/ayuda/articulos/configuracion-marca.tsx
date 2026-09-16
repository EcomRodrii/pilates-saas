import Link from 'next/link';
import { AyudaResultado } from '@/components/ayuda/AyudaPasos';

// Reescrito el 14-sep-2026: la versión del 28-ago mandaba a «Editar marca y
// apariencia» y a un editor de tema con borrador y «Publicar». Ese editor está
// en mantenimiento desde el 7-sep y el botón ya no existe: el logo y el favicon
// se suben en Configuración y el color abre /configuracion/apariencia/panel,
// que guarda al momento («Guardar colores»). La captura enseñaba el editor
// cerrado y se quitó.
//
// 15-sep-2026: Configuración se reorganizó por preguntas. «Marca» es una
// sección, con el logo, el color y los textos de tu app juntos; el nombre del
// estudio sigue en «Datos y contacto», en «Mi estudio». El color ya no abre otra
// pantalla, y el favicon se publica al subirlo (components/configuracion/tab-marca.tsx).
//
// 16-sep-2026 (v2): Marca son filas que dicen lo que tienes puesto y se abren
// para cambiarlo. «Guardar colores» ya no existe: el color se guarda con el
// «Guardar» de su cajón, como el resto. «Textos de tu app» se partió en «Cómo te
// presentas» y «Textos de bienvenida».
export default function Contenido() {
  return (
    <>
      <p>
        En Configuración &gt; Marca cada fila dice cómo lo tienes y, al tocarla, se abre para cambiarlo. «Logo y
        favicon» es la única que se guarda al momento: el archivo se sube en cuanto lo eliges, así que no hay nada que
        confirmar después. El favicon es el icono de la pestaña de tu página de reservas. El nombre de tu estudio está
        en Configuración &gt; Mi estudio, en «Nombre y dirección».
      </p>

      <p>
        El color está en esa misma sección, en «El color de tu marca»: eliges tu color principal y el secundario, los
        ves aplicados mientras los pruebas y los dejas puestos con «Guardar». Lo ven tus alumnas en tu página de
        reservas y en su app. Si sales sin guardar, vuelve el que tenías.
      </p>

      <p>
        Los textos que leen tus alumnas están en dos filas: «Cómo te presentas» (tu descripción, tu lema, tu año de
        apertura y las normas del centro) y «Textos de bienvenida» (las tres frases del inicio de su app). Lo que dejes
        vacío no se muestra.
      </p>

      <AyudaResultado>
        La foto de la portada todavía no se cambia desde aquí: su editor, la tipografía y las secciones del portal
        están en mantenimiento, y la que ya tengas puesta se sigue viendo igual. Ver{' '}
        <Link href="/ayuda/portal/personalizar-tu-portal" style={{ color: 'inherit', textDecoration: 'underline' }}>personalizar tu portal</Link>.
      </AyudaResultado>
    </>
  );
}
