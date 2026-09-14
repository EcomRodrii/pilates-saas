import Link from 'next/link';
import { AyudaResultado } from '@/components/ayuda/AyudaPasos';

// Reescrito el 14-sep-2026: la versión del 28-ago mandaba a «Editar marca y
// apariencia» y a un editor de tema con borrador y «Publicar». Ese editor está
// en mantenimiento desde el 7-sep y el botón ya no existe: el logo y el favicon
// se suben en Estudio > General, y el color abre /configuracion/apariencia/panel,
// que guarda al momento («Guardar colores»). La captura enseñaba el editor
// cerrado y se quitó.
export default function Contenido() {
  return (
    <>
      <p>
        En Configuración &gt; Estudio &gt; General, el bloque «Tu marca» reúne lo que ven tus alumnas: el nombre de tu
        estudio, tu logo y tu favicon, que subes ahí mismo.
      </p>

      <p>
        El color va desde «El color de tu marca», en ese mismo bloque: abre «Personalizar tu panel», donde eliges tu
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
