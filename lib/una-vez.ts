// Deduplicación de peticiones EN VUELO.
//
// Vivía dentro de `lib/api-client.ts`, que es donde nació (dos peticiones
// idénticas por carga a /api/layout, /api/theme y /api/billing/status). Está
// aquí porque el mismo problema aparece FUERA de esa capa: `fetchMisEstudios`
// —una RPC de Supabase, no un endpoint propio— la piden `SedeActiva` y
// `NotificationBell` con 9 ms de diferencia en cada carga del panel, sin saber
// una de la otra. Medido con StrictMode APAGADO, que es lo único que separa un
// duplicado real del doble efecto de desarrollo.
//
// Esto NO es una caché: la entrada se borra en cuanto la petición termina, así
// que solo pueden compartirla las llamadas literalmente simultáneas. No puede
// servir un dato viejo ni retrasar una invalidación — el peor caso es que no
// coincidan y se hagan las dos, exactamente como antes.
//
// Por eso no lleva TTL: un TTL sí introduce staleness, y estos datos (menú,
// tema, estado de suscripción, sedes) los reescribe el propio panel y tienen
// que verse al instante. Lo que necesite sobrevivir al final de la petición
// necesita una caché de verdad, con su invalidación — no esto.
//
// ⚠️ SOLO EN EL NAVEGADOR, y esto no es una precaución teórica.
//
// Un `Map` a nivel de módulo en el servidor lo comparten TODAS las peticiones
// del proceso, o sea personas distintas de estudios distintos: dos usuarias
// pidiendo lo mismo a la vez se llevarían la misma promesa, y con ella los datos
// de la primera. Es exactamente el fallo que este repo ya pagó una vez (una
// caché por slug sirviendo los datos de OTRA socia). `lib/supabase-data.ts` no
// lleva `'use client'`, así que nada impide que se evalúe en el servidor —
// el guardia va aquí, en el único sitio donde no puede olvidarse.
const enVuelo = new Map<string, Promise<unknown>>();

export function unaVez<T>(clave: string, hacer: () => Promise<T>): Promise<T> {
  if (typeof window === 'undefined') return hacer();
  const yaVa = enVuelo.get(clave);
  if (yaVa) return yaVa as Promise<T>;
  // `finally` y no `then`: la entrada también tiene que soltarse si la petición
  // falla, o un fallo puntual dejaría a todo el mundo pegado a una promesa
  // rechazada para siempre.
  const p = hacer().finally(() => { enVuelo.delete(clave); });
  enVuelo.set(clave, p);
  return p;
}
