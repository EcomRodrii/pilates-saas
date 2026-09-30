// «Aplicar en mi web» del contenido de un widget pegado con su id (./pieza.ts):
// qué acepta /api/estudio/widget-pieza. Puro, para probarlo con `node --test`.
//
// Lo que se guarda es la config NORMALIZADA (la de `entradaDePieza`: validada
// campo a campo y con las listas acotadas), nunca el cuerpo tal cual: el jsonb
// es texto libre para la base de datos y lo lee una ruta pública.
//
// `esperado` es la fecha de lo publicado que la dueña tenía en pantalla (`null`
// = no había nada): si ya no es la de la base de datos, otra pestaña aplicó
// algo entretanto y se responde 409 en vez de pisarlo.

import type { ConfigConstructor } from './config.ts';
import { entradaDePieza } from './pieza-destino.ts';

export interface PedidoPieza {
  widget: string;
  config: ConfigConstructor;
  esperado: string | null;
}

export const MENSAJE_PIEZA_CAMBIADA =
  'Mientras lo tenías abierto, se aplicaron otros cambios a este widget. Recarga la página para ver lo que hay en tu web antes de aplicar.';

const MAX_CUERPO = 20_000;
const MAX_LISTA = 200;

export function validarPedidoPieza(raw: unknown): { ok: true; pedido: PedidoPieza } | { ok: false; error: string } {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { ok: false, error: 'Petición no válida' };
  if (JSON.stringify(raw).length > MAX_CUERPO) return { ok: false, error: 'Petición demasiado grande' };
  const o = raw as Record<string, unknown>;
  if (typeof o.widget !== 'string') return { ok: false, error: 'Falta el widget' };
  if (!o.config || typeof o.config !== 'object' || Array.isArray(o.config)) return { ok: false, error: 'Falta la configuración' };
  const c = o.config as Record<string, unknown>;
  for (const k of ['tipos', 'instructoras', 'salas', 'tiposPlan']) {
    if (Array.isArray(c[k]) && (c[k] as unknown[]).length > MAX_LISTA) return { ok: false, error: 'Demasiados elementos en un filtro' };
  }
  let esperado: string | null = null;
  if (o.esperado != null) {
    if (typeof o.esperado !== 'string' || o.esperado.length > 64 || Number.isNaN(Date.parse(o.esperado))) {
      return { ok: false, error: 'Petición no válida' };
    }
    esperado = o.esperado;
  }
  const e = entradaDePieza({ widget: o.widget, config: o.config }, 'x');
  if (!e) return { ok: false, error: 'Ese widget no se puede poner en tu web' };
  if (e.widget.contenido.includes('sesion') && !e.config.sesion) return { ok: false, error: 'Elige la clase antes de aplicarlo.' };
  return { ok: true, pedido: { widget: e.widget.id, config: e.config, esperado } };
}

const BASE62 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

/**
 * Un id nuevo: 10 caracteres base62 al azar (~59 bits), del generador
 * criptográfico. Sin sesgo de módulo: los bytes de 248 en adelante se
 * descartan (248 = 62 × 4).
 */
export function nuevoIdPieza(aleatorio: (n: Uint8Array) => Uint8Array = b => crypto.getRandomValues(b)): string {
  let id = '';
  while (id.length < 10) {
    for (const b of aleatorio(new Uint8Array(16))) {
      if (b < 248 && id.length < 10) id += BASE62[b % 62];
    }
  }
  return id;
}
