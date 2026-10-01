// El secreto de firma de un webhook, cifrado en reposo.
//
// A diferencia de una clave de API (de la que basta el hash), el secreto hay
// que tenerlo en claro para firmar. Se guarda cifrado con la clave de las
// integraciones (lib/integraciones/cifrado-credenciales.ts), con el webhook
// como dato autenticado: copiado a otra fila no se descifra.
//
// ⚠️ Falla CERRADO, al revés que las credenciales de Gmail o Zoom: sin clave de
// cifrado no se crea ningún webhook (el CHECK de la tabla tampoco admite un
// secreto en claro). Aquí no hay un token que un tercero rote y que haya que
// guardar como sea.

import {
  cifrarCredencial, descifrarCredencial, estaCifrado, pideCifrarse, type ClavesCredenciales,
} from '../../integraciones/cifrado-credenciales.ts';

export function contextoSecretoWebhook(studioId: string, webhookId: string): string {
  return `${studioId}:api_webhooks:${webhookId}:secreto`;
}

export function cifrarSecretoWebhook(secreto: string, studioId: string, webhookId: string, claves: ClavesCredenciales): string | null {
  if (!claves.actual) return null;
  return cifrarCredencial(secreto, contextoSecretoWebhook(studioId, webhookId), claves.actual);
}

export function descifrarSecretoWebhook(valor: string, studioId: string, webhookId: string, claves: ClavesCredenciales): string | null {
  // Nunca debería haber uno en claro (el CHECK lo impide); si lo hubiera, no se usa.
  if (!estaCifrado(valor)) return null;
  const r = descifrarCredencial(valor, contextoSecretoWebhook(studioId, webhookId), claves);
  return r.ok ? r.valor : null;
}

/**
 * Los secretos con los que se firma AHORA: el actual y, durante las 24 h
 * siguientes a rotarlo, también el anterior. `null` si el actual no se puede
 * descifrar (falta la clave o cambió sin la anterior puesta).
 */
export function secretosVigentes(
  w: { id: string; studio_id: string; secreto_cifrado: string; secreto_anterior_cifrado: string | null; secreto_anterior_expira_en: string | null },
  claves: ClavesCredenciales,
  ahora: Date,
): string[] | null {
  const actual = descifrarSecretoWebhook(w.secreto_cifrado, w.studio_id, w.id, claves);
  if (!actual) return null;
  const anteriorVigente = w.secreto_anterior_cifrado && w.secreto_anterior_expira_en
    && Date.parse(w.secreto_anterior_expira_en) > ahora.getTime();
  const anterior = anteriorVigente ? descifrarSecretoWebhook(w.secreto_anterior_cifrado!, w.studio_id, w.id, claves) : null;
  return anterior ? [actual, anterior] : [actual];
}

/** Para el barrido nocturno: ¿hay que volver a cifrar con la clave actual? */
export function secretoPideRecifrarse(valor: string, claves: ClavesCredenciales): boolean {
  return estaCifrado(valor) && pideCifrarse(valor, claves);
}
