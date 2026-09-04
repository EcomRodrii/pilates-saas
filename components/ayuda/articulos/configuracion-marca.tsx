import Link from 'next/link';
import { AyudaCaptura } from '@/components/ayuda/AyudaCaptura';
import { AyudaResultado } from '@/components/ayuda/AyudaPasos';

// Reescrito el 28-ago-2026: la versión anterior decía que el color y el logo
// se editaban dentro de Configuración > Estudio — falso, esa pestaña solo
// tiene un enlace ("Editar marca y apariencia") que lleva a un editor
// completamente aparte, con su propia URL (/configuracion/apariencia/editor).
export default function Contenido() {
  return (
    <>
      <p>
        Desde Configuración &gt; Estudio, el bloque «Marca» tiene un único botón — «Editar marca y apariencia» —
        que te lleva al editor de tema: vista previa en vivo de tu portal, con panel de secciones y de ajustes.
      </p>

      <AyudaCaptura
        src="/help/configuracion/apariencia-ajustes-tema.png"
        alt="Editor de tema, pestaña Ajustes: paleta, imágenes de marca, color, tipografía, esquinas, botón principal, tarjetas, navegación, redes sociales y más"
        caption="Ajustes del tema — mucho más que un color y un logo."
      />

      <p>
        En «Ajustes del tema» está todo lo que normalmente se entiende por marca (logo, favicon, color, tipografía),
        pero también el resto de la identidad visual de tu portal: forma de las esquinas, estilo de los botones y
        tarjetas, cómo se navega, tus redes sociales, la portada de tu página de reservas y hasta el texto con el
        que le hablas a tu clienta.
      </p>

      <AyudaResultado>
        Los cambios se guardan como borrador hasta que pulsas «Publicar» — puedes probar combinaciones sin que tus
        alumnas vean nada a medias. Sigue con{' '}
        <Link href="/ayuda/portal/personalizar-tu-portal" style={{ color: 'inherit', textDecoration: 'underline' }}>personalizar tu portal</Link>, que detalla el resto del editor (secciones y bloques).
      </AyudaResultado>
    </>
  );
}
