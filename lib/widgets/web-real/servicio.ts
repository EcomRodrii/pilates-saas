// «¿Se puede enseñar mi web en la vista previa?»: de la lista de webs autorizadas
// del estudio a una de cuatro respuestas, con su caché y su tope. La ruta
// (app/api/estudio/vista-previa-web) pone la sesión, la lectura del estudio y el
// limitador; esto es lo que decide, sin red ni base de datos (todo se inyecta),
// para probarlo con `node --test`.
//
//  · Sin web autorizada: `sin-dominio`, y NO se hace ninguna petición.
//  · La web que se mira es siempre la PRIMERA autorizada que se puede consultar
//    (https, puerto estándar): sale de lo guardado, nunca del navegador.
//  · Lo que se averigua se guarda 1 hora por estudio y dirección (`TTL_DEFINITIVO_MS`):
//    una web que deja o no deja enmarcar no cambia cada minuto. «No sabemos»
//    (sin respuesta, DNS privada…) solo 5 minutos: puede ser pasajero, y no se
//    debe machacar.
//  · Cada consulta de verdad cuenta contra un TOPE por estudio (`tope`), y
//    «Probar de nuevo» (`forzar`) también: se salta la caché, no el tope.
//
// ⚠️ La caché vive en la memoria de cada proceso (es serverless: varios a la
// vez). Es un ahorro, no una garantía; el tope es el que acota de verdad el
// gasto, porque es un contador de base de datos compartido por todos.

import { consultarEnmarcable, type ResultadoConsulta } from './consulta.ts';
import { normalizarOrigenWidget } from '../../widget/dominios-autorizados.ts';
import { esDominioPropio } from '../../api-publica/webhooks/destino.ts';

export const TTL_DEFINITIVO_MS = 60 * 60 * 1000;
export const TTL_SIN_SABER_MS = 5 * 60 * 1000;
const MAX_ENTRADAS = 500;

/** Lo que sabe la pantalla. Ningún motivo técnico: la frase la pone ella. */
export type EstadoWebReal =
  | { estado: 'sin-dominio' }
  | { estado: 'se-deja'; origen: string }
  | { estado: 'no-se-deja' }
  | { estado: 'sin-saber' }
  | { estado: 'tope' };

export class CacheWebReal {
  private readonly datos = new Map<string, { hasta: number; estado: Exclude<EstadoWebReal, { estado: 'sin-dominio' | 'tope' }> }>();
  private readonly ahora: () => number;
  constructor(ahora: () => number = Date.now) { this.ahora = ahora; }

  leer(clave: string): Exclude<EstadoWebReal, { estado: 'sin-dominio' | 'tope' }> | null {
    const e = this.datos.get(clave);
    if (!e) return null;
    if (e.hasta <= this.ahora()) { this.datos.delete(clave); return null; }
    return e.estado;
  }

  guardar(clave: string, estado: Exclude<EstadoWebReal, { estado: 'sin-dominio' | 'tope' }>): void {
    if (this.datos.size >= MAX_ENTRADAS && !this.datos.has(clave)) {
      const primera = this.datos.keys().next().value;
      if (primera !== undefined) this.datos.delete(primera);
    }
    this.datos.set(clave, { hasta: this.ahora() + (estado.estado === 'sin-saber' ? TTL_SIN_SABER_MS : TTL_DEFINITIVO_MS), estado });
  }

  get tamano(): number { return this.datos.size; }
}

/** La primera web autorizada que se puede consultar: https y puerto estándar. `null` si ninguna. */
export function elegirOrigen(dominios: readonly string[]): string | null {
  for (const d of dominios) {
    const origen = normalizarOrigenWidget(d);
    if (!origen) continue;
    const u = new URL(origen);
    if (u.protocol === 'https:' && (!u.port || u.port === '443')) return `https://${u.hostname}`;
  }
  return null;
}

function aEstado(r: ResultadoConsulta, origen: string): Exclude<EstadoWebReal, { estado: 'sin-dominio' | 'tope' }> {
  if (r.tipo === 'enmarcable') return { estado: 'se-deja', origen };
  return r.tipo === 'no-enmarcable' ? { estado: 'no-se-deja' } : { estado: 'sin-saber' };
}

export async function resolverWebReal(
  x: { studioId: string; dominios: readonly string[]; forzar: boolean; nuestroOrigen: string },
  deps: {
    cache: CacheWebReal;
    /** ¿Queda tope para otra consulta de este estudio? Cuenta una. */
    tope: () => Promise<boolean>;
    consultar?: typeof consultarEnmarcable;
  },
): Promise<EstadoWebReal> {
  // Sin web autorizada no se hace NADA: ni caché, ni tope, ni red.
  if (x.dominios.length === 0) return { estado: 'sin-dominio' };
  const origen = elegirOrigen(x.dominios);
  // Hay web autorizada pero no se puede consultar (sin https o con puerto raro): no se sabe, y sin tocar la red.
  if (!origen) return { estado: 'sin-saber' };
  // Un dominio de Tentare autorizado como «web»: el servidor se consultaría a sí mismo (y nuestras páginas no se
  // enseñan aquí). No se rompe la lista autorizada —puede ser a propósito, p. ej. en pruebas—: solo no se enseña,
  // sin red, sin tope y sin caché.
  if (esDominioPropio(new URL(origen).hostname)) return { estado: 'no-se-deja' };

  const clave = `${x.studioId}|${origen}`;
  if (!x.forzar) {
    const guardado = deps.cache.leer(clave);
    if (guardado) return guardado;
  }
  if (!(await deps.tope())) return { estado: 'tope' };

  const consultar = deps.consultar ?? consultarEnmarcable;
  const estado = aEstado(await consultar(origen, x.nuestroOrigen), origen);
  deps.cache.guardar(clave, estado);
  return estado;
}
