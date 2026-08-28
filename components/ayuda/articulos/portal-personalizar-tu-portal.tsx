import Link from 'next/link';
import { AyudaResultado } from '@/components/ayuda/AyudaPasos';

// Verificado: app/(dashboard)/configuracion/apariencia (listado de temas) y
// .../apariencia/editor (editor en vivo) — es su propia sección, no una
// pestaña dentro de Configuración > Estudio.
export default function Contenido() {
  return (
    <>
      <p>
        Desde Configuración &gt; Apariencia tienes un editor de temas con vista previa en vivo de tu portal —
        cambias un color o una tipografía y ves el resultado al momento, antes de publicarlo.
      </p>

      <h2 style={{ fontSize: 18, fontWeight: 700, margin: '24px 0 12px' }}>Qué puedes personalizar</h2>
      <ul style={{ margin: '0 0 20px', paddingLeft: 22, display: 'flex', flexDirection: 'column', gap: 6, fontSize: 15, lineHeight: 1.6 }}>
        <li>Colores de marca, más allá del único color básico de Configuración &gt; Estudio.</li>
        <li>Tipografía del portal.</li>
        <li>El tono de los textos que ve tu alumna en pantallas clave.</li>
      </ul>

      <h2 style={{ fontSize: 18, fontWeight: 700, margin: '28px 0 12px' }}>Borrador y publicación</h2>
      <p>
        Los cambios se quedan en borrador hasta que decides publicarlos — puedes probar combinaciones sin que tus
        alumnas vean nada a medias.
      </p>

      <AyudaResultado>
        El tema que publiques aquí es el mismo que usa tanto tu portal como el{' '}
        <Link href="/ayuda/widget/que-es-el-widget" style={{ color: 'inherit', textDecoration: 'underline' }}>widget</Link> incrustado en tu web — no hace falta configurarlo dos veces.
      </AyudaResultado>
    </>
  );
}
