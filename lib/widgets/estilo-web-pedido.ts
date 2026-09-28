// Lo que manda el panel a /api/estudio/widget-estilo («Aplicar en mi web» y su
// Deshacer), validado ANTES de leer ni escribir nada.
//
// La ruta solo escribe lo que sale de aquí, y aquí solo sale lo que pasa
// `widgetWebSchema` —la cerradura del tema: enums cerrados y hex de 6 dígitos—
// entero y en `.strict()`, también por fuera: una clave de más (un `studioId`,
// un `widgetFondo`) es un 400, no algo que se ignora. El estudio sale siempre
// de la sesión. Lo validado es la SALIDA de zod, no el objeto que llegó: lo que
// acaba en el tema publicado, y de ahí en estilos en línea de /reservar, no
// lleva nada que el esquema no nombre.
//
// Mismo patrón que `validarDominiosWidget` (lib/widget/dominios-autorizados.ts):
// puro, sin Supabase ni Next, para probarlo con `node --test`.

import { z } from 'zod';
import { widgetWebSchema } from '../theme-schema.ts';
import type { WidgetWeb } from '../reservar/estilo-web-tipos.ts';

export const MENSAJE_PEDIDO_ESTILO_INVALIDO = 'Los cambios de estilo no son válidos.';

/** 409: lo publicado ya no es lo que la dueña tenía en pantalla (otra pestaña, u otra escritura del tema). */
export const MENSAJE_ESTILO_WEB_CAMBIADO =
  'El estilo de tus widgets acaba de cambiar desde otra pestaña. Recarga la página para ver el de ahora.';

export interface PedidoEstiloWeb {
  /** Lo que se aplica. `null` = nada elegido (se guarda como ausente). */
  estilo: WidgetWeb | null;
  /** Lo que la dueña tenía por publicado al pulsar: si ya no lo es, 409. */
  esperado: WidgetWeb | null;
  motivo: 'aplicar' | 'deshacer';
}

const pedidoSchema = z.object({
  estilo: widgetWebSchema.nullable(),
  esperado: widgetWebSchema.nullable(),
  motivo: z.enum(['aplicar', 'deshacer']),
}).strict();

export type ResultadoPedidoEstiloWeb =
  | { ok: true; pedido: PedidoEstiloWeb }
  | { ok: false; error: string };

export function validarPedidoEstiloWeb(cuerpo: unknown): ResultadoPedidoEstiloWeb {
  const r = pedidoSchema.safeParse(cuerpo);
  return r.success ? { ok: true, pedido: r.data } : { ok: false, error: MENSAJE_PEDIDO_ESTILO_INVALIDO };
}
