import { redirect } from 'next/navigation';
import { RUTAS_ANTIGUAS } from '@/lib/configuracion/destino';

// «Personalizar tu panel» se repartió dentro de Configuración (15-sep, v2): el
// menú, el Inicio, la posición del menú y claro u oscuro son la sección «Tu
// panel» (secciones/seccion-panel.tsx), y el color, una tarjeta de «Marca»
// (components/apariencia/). Mismas escrituras. La ruta sigue
// en marcadores, en la guía de otras versiones y en el panel de apariencia de
// la barra: redirige.
export default function PersonalizarPanelPage() {
  redirect(RUTAS_ANTIGUAS['/configuracion/apariencia/panel']);
}
