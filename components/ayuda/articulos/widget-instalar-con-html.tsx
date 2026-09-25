import Link from 'next/link';
import { AyudaPaso, AyudaAntesDeEmpezar, AyudaResultado } from '@/components/ayuda/AyudaPasos';

// 25-sep-2026: «Tentare Widgets» — el método se elige en «Cómo integrarlo» y
// el modo sin iframe se llama «Integración nativa».
//
// Reescrito el 28-ago-2026 tras verificar en vivo Configuración > API >
// Widgets: el código real es un <iframe> con un pequeño <script> de ajuste de
// alto (postMessage), generado por el panel — no un snippet fijo que se
// escribe a mano. La versión anterior de este artículo documentaba solo el
// modo "integración directa" (script + div, sin iframe) como si fuera el
// único camino; es en realidad el modo avanzado, no el que usa la mayoría.
export default function Contenido() {
  return (
    <>
      <AyudaAntesDeEmpezar>
        Necesitas poder editar el HTML de la página donde quieres el widget — la mayoría de constructores web
        (Wix, Squarespace, WordPress con el bloque adecuado…) tienen un bloque de «HTML personalizado» para esto.
      </AyudaAntesDeEmpezar>

      {/* 15-sep-2026: sin captura; enseñaba la fila de pestañas de Configuración
          de antes de reorganizarla por preguntas. */}
      <AyudaPaso numero={1} titulo="Ve a Configuración > Mi app y mi web > Widgets para tu web">
        <p>Elige el widget que quieres (el más habitual es «Horario y reservas») y ajústalo: qué enseña, su diseño y cómo se comporta. La vista previa es el widget real, en escritorio, tablet y móvil, y se actualiza al momento.</p>
      </AyudaPaso>

      <AyudaPaso numero={2} titulo="Copia el código y pégalo en tu web">
        <p style={{ margin: 0 }}>
          En «Cómo integrarlo en tu web», con el método «Incrustado», el botón «Copiar código» te da un{' '}
          <code>&lt;iframe&gt;</code> con un pequeño <code>&lt;script&gt;</code> que ajusta su alto automáticamente
          al contenido — no tienes que fijar una altura a mano. Elige tu plataforma (HTML, WordPress, Webflow o React)
          y sigue los pasos que aparecen debajo del código. Si no te aclaras, pásaselo a quien lleve tu web: está
          pensado para copiar y pegar, no para editarlo.
        </p>
      </AyudaPaso>

      <AyudaResultado>
        Con este método NO hace falta autorizar tu dominio antes — funciona nada más pegarlo. Solo la
        «Integración nativa» del horario —sin marco ni recuadro— lo exige, porque en ese caso el contenido se
        pinta directamente en tu página en vez de dentro de un iframe aislado. Si tras instalarlo no ves nada,
        revisa{' '}
        <Link href="/ayuda/problemas/el-widget-no-carga" style={{ color: 'inherit', textDecoration: 'underline' }}>el widget no carga</Link>.
      </AyudaResultado>
    </>
  );
}
