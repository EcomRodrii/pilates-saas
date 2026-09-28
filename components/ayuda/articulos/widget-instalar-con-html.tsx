import Link from 'next/link';
import { AyudaPaso, AyudaAntesDeEmpezar, AyudaResultado } from '@/components/ayuda/AyudaPasos';

// 28-sep-2026: el constructor pregunta primero con qué está hecha la web y va
// en tres pasos (qué y dónde, cómo se ve, ponlo en tu web); la integración
// nativa («sin marco») vive en «Para quien te hace la web».
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
        <p>La primera vez te pregunta con qué está hecha tu web (WordPress, Wix, Squarespace, Webflow, otra…). Luego eliges qué quieres poner (lo más habitual es tu horario) y dónde, y ves cómo queda: la vista previa es el widget real, en ordenador y en móvil, y se actualiza al momento.</p>
      </AyudaPaso>

      <AyudaPaso numero={2} titulo="Copia el código y pégalo en tu web">
        <p style={{ margin: 0 }}>
          En el último paso, «Ponlo en tu web», con la forma «Dentro de una página», el botón «Copiar código» te da un{' '}
          <code>&lt;iframe&gt;</code> con un pequeño <code>&lt;script&gt;</code> que ajusta su alto automáticamente
          al contenido — no tienes que fijar una altura a mano. Debajo tienes los pasos de tu web. Si te la lleva
          otra persona, se lo mandas desde ahí mismo con el código y los pasos: está pensado para copiar y pegar,
          no para editarlo.
        </p>
      </AyudaPaso>

      <AyudaResultado>
        Con esta forma NO hace falta autorizar tu dominio antes — funciona nada más pegarlo. Solo el horario
        «sin marco» (la integración nativa, en «Para quien te hace la web») lo exige, porque en ese caso el
        contenido se pinta directamente en tu página en vez de dentro de un iframe aislado. Si tras instalarlo no ves nada,
        revisa{' '}
        <Link href="/ayuda/problemas/el-widget-no-carga" style={{ color: 'inherit', textDecoration: 'underline' }}>el widget no carga</Link>.
      </AyudaResultado>
    </>
  );
}
