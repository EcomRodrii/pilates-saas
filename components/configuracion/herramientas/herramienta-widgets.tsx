'use client';

import { TabApi } from '@/components/configuracion/tab-api';
import { TuWebWidgets } from '@/components/widgets/v2/tu-web-widgets';
import { useMiWebNueva, usePanelNuevo } from '@/lib/estudio/panel-nuevo-cliente';

// El constructor de widgets y, en su otra pestaña, cómo le va a tu página. La
// tarjeta (`#widgets`) la pinta el propio TabApi.
//
// «Tu web» v2 (16-oct-2026, propuesta aprobada por el fundador el 15-oct): el
// ÚNICO punto donde se elige entre la de siempre y la nueva. Por aquí pasan
// todas las entradas (Configuración › Tu web, `?abrir=widgets`, los enlaces viejos `?tab=api`,
// la línea de Actividad y la tarjeta del embudo): si se eligiera más abajo, un
// estudio con el interruptor vería dos constructores según por dónde entrase.
// Con el panel nuevo Y `MI_WEB_NUEVA` (la v2 está hecha con las piezas del panel
// nuevo: con el viejo alrededor no encaja). Apagado, lo de siempre sin un píxel distinto.
export function HerramientaWidgets({ showToast }: { showToast: (m: string) => void }) {
  // Los dos siempre, y después el `&&`: un hook detrás de un `&&` no se llamaría
  // siempre, y React necesita el mismo orden en cada render.
  const panelNuevo = usePanelNuevo();
  const miWebNueva = useMiWebNueva();
  return panelNuevo && miWebNueva ? <TuWebWidgets showToast={showToast} /> : <TabApi showToast={showToast} />;
}
