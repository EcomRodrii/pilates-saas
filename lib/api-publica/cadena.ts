// Claves de cadena: UNA clave para todas las sedes de una cadena.
//
// La API sigue trabajando sobre una sola sede por petición (`ctx.studioId`, que
// cada consulta filtra a mano: rutas.test.ts). Una clave de cadena no cambia
// eso: cada petición dice a qué sede va con la cabecera `Tentare-Estudio`, y la
// puerta (`conApiPublica`) comprueba que la clave llega a esa sede. Es el mismo
// patrón que la cabecera `Stripe-Account` de Stripe Connect.
//
// Sin cabecera, una clave de cadena no lee nada: leer en silencio una sola sede
// (la de origen) dejaría a quien sincroniza la contabilidad con un hueco que no
// ve. La única excepción es `GET /api/v1/estudios`, que lista a dónde llega.
//
// Puro, para probarlo entero; las consultas viven en servidor.ts y gestion.ts.

import { suscripcionActiva } from '../billing/entitlements.ts';

export const CABECERA_ESTUDIO = 'Tentare-Estudio';
const RE_ESTUDIO = /^[A-Za-z0-9_-]{1,100}$/;

/** `null` sin cabecera; `'invalido'` si no tiene forma de id de sede. */
export function leerEstudioPedido(valor: string | null | undefined): string | null | 'invalido' {
  if (valor === null || valor === undefined) return null;
  const v = valor.trim();
  return RE_ESTUDIO.test(v) ? v : 'invalido';
}

/** A dónde llega una credencial. */
export interface AlcanceCredencial {
  /** Su sede. En una clave de cadena, la sede desde la que se creó. */
  estudioId: string;
  /** Solo en una clave de cadena. */
  cadenaId: string | null;
}

export type SedeResuelta =
  | { ok: true; studioId: string; /** Clave de cadena: falta comprobar que llega a esa sede. */ deCadena: boolean }
  | { ok: false; status: 400 | 404; codigo: 'invalid_request' | 'not_found'; mensaje: string };

export const MENSAJE_NO_LLEGA = 'Esa sede no existe o esta credencial no llega a ella.';

/**
 * La sede de esta petición. `sinSede`: la ruta no lee datos de una sede (solo
 * `GET /api/v1/estudios`); ahí una clave de cadena sin cabecera usa su sede de
 * origen, para auditar la llamada en algún sitio.
 */
export function resolverSede(alcance: AlcanceCredencial, pedido: string | null | 'invalido', sinSede: boolean): SedeResuelta {
  if (pedido === 'invalido') {
    return { ok: false, status: 400, codigo: 'invalid_request', mensaje: `La cabecera ${CABECERA_ESTUDIO} tiene que ser el id de una sede.` };
  }
  if (!alcance.cadenaId) {
    // Una credencial de una sede solo llega a la suya. Puede mandar la cabecera
    // (un integrador que trata todas las credenciales igual), pero con esa sede.
    if (pedido !== null && pedido !== alcance.estudioId) return { ok: false, status: 404, codigo: 'not_found', mensaje: MENSAJE_NO_LLEGA };
    return { ok: true, studioId: alcance.estudioId, deCadena: false };
  }
  if (pedido === null) {
    if (sinSede) return { ok: true, studioId: alcance.estudioId, deCadena: true };
    return {
      ok: false, status: 400, codigo: 'invalid_request',
      mensaje: `Esta clave es de toda la cadena: di a qué sede va cada petición con la cabecera ${CABECERA_ESTUDIO}. GET /api/v1/estudios las lista.`,
    };
  }
  return { ok: true, studioId: pedido, deCadena: true };
}

/** Lo que hace falta de una sede para saber si una clave de cadena llega a ella. */
export interface SedeParaClave {
  cadena_id: string | null;
  owner_auth_user_id: string | null;
}

export type LlegaClaveDeCadena = 'llega' | 'no_llega' | 'ya_no_es_duena';

/**
 * ¿Llega una clave de cadena a esta sede? Solo si la sede es de la cadena de la
 * clave, y quien la creó es HOY la dueña de la cadena y de la sede (las claves
 * son solo de la propietaria). Si ha dejado de ser dueña de la cadena, la clave
 * no llega a ninguna: muere con su acceso, como una clave de sede.
 *
 * Lo demás (API activada en la sede, estudio con acceso, permisos de su rol) es
 * lo mismo que para cualquier credencial y lo comprueba la puerta.
 */
export function claveDeCadenaLlega(p: { sede: SedeParaClave | null; cadenaId: string; duenaCadena: string | null; creadaPor: string }): LlegaClaveDeCadena {
  if (p.duenaCadena !== p.creadaPor) return 'ya_no_es_duena';
  if (!p.sede || p.sede.cadena_id !== p.cadenaId || p.sede.owner_auth_user_id !== p.creadaPor) return 'no_llega';
  return 'llega';
}

/** Un estudio con acceso a Tentare ahora mismo: ni suspendido ni sin suscripción. */
export function estudioConAcceso(s: { suspendido_en: string | null; subscription_status: string | null }): boolean {
  return !s.suspendido_en && suscripcionActiva(s.subscription_status);
}

export interface SedeDeCadena extends SedeParaClave {
  id: string;
  nombre: string;
  suspendido_en: string | null;
  subscription_status: string | null;
}

/**
 * Las sedes a las que una clave de cadena llega AHORA: las que la puerta dejaría
 * pasar, en el mismo orden que llegan. Es lo que responde `GET /api/v1/estudios`.
 */
export function sedesAlcanzables(p: {
  sedes: readonly SedeDeCadena[]; conApiActivada: ReadonlySet<string>; cadenaId: string; duenaCadena: string | null; creadaPor: string;
}): SedeDeCadena[] {
  return p.sedes.filter((s) =>
    claveDeCadenaLlega({ sede: s, cadenaId: p.cadenaId, duenaCadena: p.duenaCadena, creadaPor: p.creadaPor }) === 'llega'
    && p.conApiActivada.has(s.id)
    && estudioConAcceso(s));
}
