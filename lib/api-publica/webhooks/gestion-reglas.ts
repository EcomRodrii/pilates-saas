// Reglas de los webhooks en el panel (puras, para probarlas sin servidor).

import { esTipoEvento, type TipoEvento } from './catalogo.ts';
import { validarUrlWebhook } from './destino.ts';

export const MAX_WEBHOOKS = 10;
export const HORAS_SOLAPE_SECRETO = 24;

export interface NuevoWebhook { url: string; descripcion: string | null; tipos: TipoEvento[] }

export type Validacion<T> = { ok: true; valor: T } | { ok: false; error: string };

function leerTipos(x: unknown, permitidos: readonly TipoEvento[]): Validacion<TipoEvento[]> {
  if (!Array.isArray(x) || x.length === 0) return { ok: false, error: 'Elige al menos un aviso.' };
  const unicos = [...new Set(x)];
  if (!unicos.every(esTipoEvento)) return { ok: false, error: 'Hay un tipo de aviso que no existe.' };
  const fuera = unicos.filter((t) => !permitidos.includes(t));
  if (fuera.length) return { ok: false, error: 'Hay avisos que tu cuenta no puede activar.' };
  return { ok: true, valor: unicos };
}

function leerDescripcion(x: unknown): Validacion<string | null> {
  if (x === undefined || x === null || x === '') return { ok: true, valor: null };
  if (typeof x !== 'string') return { ok: false, error: 'La descripción no es válida.' };
  const limpia = x.trim();
  if (limpia.length > 120) return { ok: false, error: 'La descripción es demasiado larga (120 caracteres como mucho).' };
  return { ok: true, valor: limpia || null };
}

export function validarNuevoWebhook(cuerpo: unknown, permitidos: readonly TipoEvento[]): Validacion<NuevoWebhook> {
  if (!cuerpo || typeof cuerpo !== 'object') return { ok: false, error: 'Faltan los datos del webhook.' };
  const c = cuerpo as Record<string, unknown>;
  const url = validarUrlWebhook(c.url);
  if (!url.ok) return url;
  const tipos = leerTipos(c.tipos, permitidos);
  if (!tipos.ok) return tipos;
  const descripcion = leerDescripcion(c.descripcion);
  if (!descripcion.ok) return descripcion;
  return { ok: true, valor: { url: url.url.toString(), descripcion: descripcion.valor, tipos: tipos.valor } };
}

export interface CambiosWebhook { url?: string; descripcion?: string | null; tipos?: TipoEvento[]; activo?: boolean; retirarSecretoAnterior?: true }

export function validarCambiosWebhook(cuerpo: unknown, permitidos: readonly TipoEvento[]): Validacion<CambiosWebhook> {
  if (!cuerpo || typeof cuerpo !== 'object') return { ok: false, error: 'No hay nada que cambiar.' };
  const c = cuerpo as Record<string, unknown>;
  const cambios: CambiosWebhook = {};
  if ('url' in c) {
    const url = validarUrlWebhook(c.url);
    if (!url.ok) return url;
    cambios.url = url.url.toString();
  }
  if ('tipos' in c) {
    const tipos = leerTipos(c.tipos, permitidos);
    if (!tipos.ok) return tipos;
    cambios.tipos = tipos.valor;
  }
  if ('descripcion' in c) {
    const d = leerDescripcion(c.descripcion);
    if (!d.ok) return d;
    cambios.descripcion = d.valor;
  }
  if ('activo' in c) {
    if (typeof c.activo !== 'boolean') return { ok: false, error: '«activo» es sí o no.' };
    cambios.activo = c.activo;
  }
  if ('retirarSecretoAnterior' in c) {
    // Tras una filtración: el secreto anterior deja de firmar ya, sin esperar
    // a que pasen las 24 h de solape.
    if (c.retirarSecretoAnterior !== true) return { ok: false, error: '«retirarSecretoAnterior» solo puede ser sí.' };
    cambios.retirarSecretoAnterior = true;
  }
  if (Object.keys(cambios).length === 0) return { ok: false, error: 'No hay nada que cambiar.' };
  return { ok: true, valor: cambios };
}

export type EstadoWebhook = 'activo' | 'fallando' | 'desactivado';

export interface FilaWebhookPanel {
  id: string; url: string; descripcion: string | null; tipos: string[]; creado_en: string;
  desactivado_en: string | null; desactivado_motivo: string | null; fallando_desde: string | null;
  ultimo_exito_en: string | null; ultimo_intento_en: string | null; ultimo_estado_http: number | null;
  ultimo_error: string | null; secreto_anterior_expira_en: string | null;
}

export const COLUMNAS_WEBHOOK_PANEL = 'id, url, descripcion, tipos, creado_en, desactivado_en, desactivado_motivo, fallando_desde, ultimo_exito_en, ultimo_intento_en, ultimo_estado_http, ultimo_error, secreto_anterior_expira_en';

/** Lo que ve el panel de un webhook. Nunca el secreto. */
export function webhookPanel(f: FilaWebhookPanel, ahora: Date) {
  const estado: EstadoWebhook = f.desactivado_en ? 'desactivado' : f.fallando_desde ? 'fallando' : 'activo';
  return {
    id: f.id, url: f.url, descripcion: f.descripcion, tipos: f.tipos, creadoEn: f.creado_en, estado,
    desactivadoEn: f.desactivado_en, motivoDesactivado: f.desactivado_motivo, fallandoDesde: f.fallando_desde,
    ultimoExitoEn: f.ultimo_exito_en, ultimoIntentoEn: f.ultimo_intento_en,
    ultimoEstadoHttp: f.ultimo_estado_http, ultimoError: f.ultimo_error,
    secretoAnteriorHasta: f.secreto_anterior_expira_en && Date.parse(f.secreto_anterior_expira_en) > ahora.getTime()
      ? f.secreto_anterior_expira_en : null,
  };
}

export { textoMotivoDesactivado } from './textos.ts';
