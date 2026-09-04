import Link from 'next/link';
import { AyudaCaptura } from '@/components/ayuda/AyudaCaptura';
import { AyudaPaso, AyudaAntesDeEmpezar, AyudaResultado } from '@/components/ayuda/AyudaPasos';

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

      <AyudaPaso numero={1} titulo="Ve a Configuración > API > Widgets">
        <p>Elige el widget que quieres (el más habitual es «Horario y reserva de clases») y personalízalo: qué mostrar, colores, tipo de diseño. La vista previa de la derecha se actualiza al momento.</p>
        <AyudaCaptura
          src="/help/widget/configuracion-api-widget-full.png"
          alt="Configuración > API > Widgets: elección de widget, personalización de apariencia y colores, vista previa en directo y código para pegar en la web"
          caption="Elige, personaliza y copia — todo en la misma pantalla."
        />
      </AyudaPaso>

      <AyudaPaso numero={2} titulo="Copia el código y pégalo en tu web">
        <p style={{ margin: 0 }}>
          El botón «Copiar código» te da un <code>&lt;iframe&gt;</code> con un pequeño <code>&lt;script&gt;</code> que
          ajusta su alto automáticamente al contenido — no tienes que fijar una altura fija a mano. Pégalo donde
          quieras que aparezca. Si no te aclaras con el código, pásaselo a quien lleve tu web: está pensado para
          copiar y pegar, no para editarlo.
        </p>
      </AyudaPaso>

      <AyudaResultado>
        Con este modo NO hace falta autorizar tu dominio antes — funciona nada más pegarlo. Solo la variante
        «Calendario embebido (integración directa)» —sin marco ni recuadro— lo exige, porque en ese caso el
        contenido se pinta directamente en tu página en vez de dentro de un iframe aislado. Si tras instalarlo no
        ves nada, revisa{' '}
        <Link href="/ayuda/problemas/el-widget-no-carga" style={{ color: 'inherit', textDecoration: 'underline' }}>el widget no carga</Link>.
      </AyudaResultado>
    </>
  );
}
