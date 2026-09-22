import Link from 'next/link';
import { AyudaPaso, AyudaResultado } from '@/components/ayuda/AyudaPasos';

// 22-sep-2026: el editor volvió, rehecho y guiado — «Apariencia de tu app»
// (/configuracion/apariencia). Este artículo contaba desde el 14-sep que
// estaba en mantenimiento.
export default function Contenido() {
  return (
    <>
      <p>
        En <Link href="/configuracion/apariencia" style={{ color: 'inherit', textDecoration: 'underline' }}>Configuración &gt; Marca &gt; Apariencia de tu app</Link>{' '}
        eliges cómo se ve la app de tus alumnas. A la derecha tienes un móvil con tu app de verdad, con tus clases: cada
        cambio se ve ahí al momento, y puedes navegar por ella. Tus alumnas no ven nada hasta que pulsas «Publicar».
      </p>

      <AyudaPaso numero={1} titulo="Elige un estilo">
        Crema, Luz, Arena, Rubor o Piedra: el fondo, las tarjetas y la forma de las esquinas y los botones. Todos se leen bien con cualquier color.
      </AyudaPaso>
      <AyudaPaso numero={2} titulo="Pon tu color">
        «Suave» lo lleva a una versión apagada y elegante; «Tal cual» lo deja como es (si es muy claro, lo oscurecemos lo justo para que el texto encima se lea). Decide también si el botón principal va oscuro o en tu color.
      </AyudaPaso>
      <AyudaPaso numero={3} titulo="Elige la tipografía">
        Seis parejas de letra para títulos y texto, pensadas para ir juntas.
      </AyudaPaso>
      <AyudaPaso numero={4} titulo="Sube tu portada">
        La foto grande del inicio y de la pantalla de entrada, y qué parte de ella se ve. Las fotos se guardan al subirlas, sin esperar a «Publicar».
      </AyudaPaso>
      <AyudaPaso numero={5} titulo="Publica">
        Si no te convence, «Descartar» vuelve a lo que tenías.
      </AyudaPaso>

      <AyudaResultado>
        Tu logo, las fotos de tus clases y las de tu equipo tienen su sitio en Configuración y en Equipo; desde la misma
        pantalla hay un acceso a cada una. Ver también{' '}
        <Link href="/ayuda/configuracion/marca" style={{ color: 'inherit', textDecoration: 'underline' }}>tu marca: logo y textos</Link>.
      </AyudaResultado>
    </>
  );
}
