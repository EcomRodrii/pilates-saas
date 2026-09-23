'use client';

// Adelantar la petición de la agenda del día al arranque del panel.
//
// ── El problema ──────────────────────────────────────────────────────────────
// `DashboardShell` no monta la página hasta que `studio` deja de ser `null`
// (`cargandoDatos`), y `setStudio` se hace al TERMINAR `fetchCriticalStudioData`
// — las ~28 consultas del arranque, en tandas de 8. O sea que «Hoy en el
// estudio» no puede ni EMPEZAR a pedir su día hasta que todo eso ha contestado,
// y solo entonces empieza su viaje de red: la agenda llega tarde por un motivo
// que no tiene nada que ver con la agenda.
//
// El gate no se toca, y no por pereza: existe para que las páginas no pinten
// estados vacíos falsos («Sin recibos», «No hay resultados») en carga fría, y
// este repo ya se quemó tres veces sacando consultas de la carga crítica con la
// promesa de cargarlas en otro sitio (`condiciones_salud`, `posts_comunidad`,
// `bloqueos_maquina` y compañía se quedaron en `[]` PARA SIEMPRE — ver los
// comentarios de `fetchDeferredStudioDataCon`).
//
// ── El arreglo ───────────────────────────────────────────────────────────────
// Lo que sí se puede hacer es lo que la bandeja YA hace y a la agenda nunca se
// le dio: el `Sidebar` se monta FUERA del gate y llama a `useEstadoEstudio()`,
// así que `/api/estado-estudio` viaja en paralelo con el arranque y la bandeja
// lo encuentra ya servido. Esto es lo mismo para `/api/calendario`.
//
// ── De un solo uso, a propósito ──────────────────────────────────────────────
// No es una caché: es un relevo. La respuesta se entrega UNA vez y se suelta.
// Una caché con TTL aquí sería un bug esperando: tras rellenar un hueco, el
// `refrescar()` de la agenda volvería a leer el dato viejo y enseñaría la plaza
// como libre después de haberla llenado. Sin TTL que invalidar no hay nada que
// acordarse de invalidar — el segundo viaje y los siguientes son peticiones de
// verdad, exactamente como antes.

import { authHeader } from '@/lib/api-client';

let relevo: { clave: string; respuesta: Promise<Response> } | null = null;

/**
 * Pide la agenda de un rango sin esperar a nadie. Se llama desde el armazón del
 * panel, que se pinta mientras el arranque carga.
 *
 * `clave` es la URL exacta: si el consumidor pide otro rango (p. ej. se cruzó la
 * medianoche entre las dos llamadas), no se aprovecha nada y hace su petición
 * normal. Nunca se sirve el día equivocado.
 */
export function precargarAgenda(url: string): void {
  if (typeof window === 'undefined' || relevo !== null) return;
  const respuesta = (async () => fetch(url, { headers: await authHeader() }))();
  // Sin esto, una precarga que falle antes de que nadie la recoja es un rechazo
  // sin manejar en la consola. Quien la recoja se encontrará el error igual.
  respuesta.catch(() => {});
  relevo = { clave: url, respuesta };
}

/** La respuesta precargada para esa URL, o `null` si no hay o es de otro rango.
 *  Solo la puede recoger uno: al segundo que pregunte ya no hay nada. */
export function recogerAgendaPrecargada(url: string): Promise<Response> | null {
  if (relevo === null || relevo.clave !== url) return null;
  const { respuesta } = relevo;
  relevo = null;
  return respuesta;
}
