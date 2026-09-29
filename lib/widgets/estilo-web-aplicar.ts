// «Aplicar en mi web»: qué se escribe en el tema publicado, decidido sin BD.
//
// El endpoint (`/api/estudio/widget-estilo`) lee la fila del tema, llama a esto
// y escribe lo que diga, en el bucle de escritura optimista de siempre
// (lib/theme-data.ts). Aquí solo la decisión, para poder probarla entera con
// `node --test`:
//   · `cambiado` si lo publicado ya no es lo que la dueña tenía en pantalla
//     (`esperado`): otra pestaña lo cambió entretanto. Sin esto, un Deshacer
//     pisaría en silencio lo que otra aplicó.
//   · `contraste` si no se lee (`validarEstiloWeb`, el mismo veredicto que el
//     panel): nada ilegible llega a la web de nadie, lo pida quien lo pida.
//   · `escribir` en otro caso, con el `anterior` sacado de ESTA MISMA lectura
//     —no de lo que diga el cliente—, que es lo que el panel guarda para
//     Deshacer.
//
// ⚠️ «Nada elegido» se guarda como AUSENTE (`widgetWeb: undefined`, que el
// JSON de la fila no conserva), no como un objeto neutro: un tema sin la clave
// y uno con todo a `null` tienen que ser el mismo tema para quien los compare.

import { esNeutro, leerWidgetWeb, mismoWidgetWeb, type WidgetWeb } from '../reservar/estilo-web-tipos.ts';
import {
  baseEstiloWeb, textoActividadEstiloWeb, validarEstiloWeb, type ErrorEstiloWeb,
} from '../reservar/estilo-web.ts';

export type DecisionEstiloWeb =
  | { tipo: 'cambiado' }
  | { tipo: 'contraste'; errores: ErrorEstiloWeb[] }
  | {
    tipo: 'escribir';
    cambios: { widgetWeb: WidgetWeb | undefined };
    aplicado: WidgetWeb | null;
    anterior: WidgetWeb | null;
    /** La línea de Actividad. */
    texto: string;
  };

export function decidirEstiloWeb(
  publicado: { widgetWeb?: unknown; primary?: unknown; appAlumna?: unknown },
  pedido: { estilo: WidgetWeb | null; esperado: WidgetWeb | null; motivo: 'aplicar' | 'deshacer' },
): DecisionEstiloWeb {
  const leido = leerWidgetWeb(publicado.widgetWeb);
  const anterior = esNeutro(leido) ? null : leido;
  if (!mismoWidgetWeb(anterior, pedido.esperado)) return { tipo: 'cambiado' };
  const aplicado = esNeutro(pedido.estilo) ? null : pedido.estilo;
  const base = baseEstiloWeb(publicado.primary, publicado.appAlumna);
  if (aplicado) {
    const errores = validarEstiloWeb(aplicado, base);
    if (errores.length) return { tipo: 'contraste', errores };
  }
  return {
    tipo: 'escribir',
    cambios: { widgetWeb: aplicado ?? undefined },
    aplicado,
    anterior,
    texto: textoActividadEstiloWeb(aplicado, base.app, pedido.motivo),
  };
}
