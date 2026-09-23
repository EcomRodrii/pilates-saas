// ─────────────────────────────────────────────────────────────────────────────
// Eventos que ocurren en una pantalla SIN analítica y se envían en la siguiente
// que sí la tiene — lógica pura, sin SDK, para poder probarla con un Storage
// falso (mismo criterio que `lib/posthog-privacidad.ts`).
//
// El caso: `/login` crea el estudio de una alta que se quedó a medias
// (`pending_studio`) y emitía `alta_estudio_creada`, pero `/login` está en
// `PREFIJOS_EXCLUIDOS_DE_ANALITICA` — ahí vuelve la sesión en el fragmento —,
// así que `capturarEvento` lo tiraba sin avisar y el embudo nunca veía esas
// altas. Encender PostHog en `/login` para un evento sería abrir la puerta que
// esa lista cierra. En su lugar, el evento se aparca en `sessionStorage` y lo
// envía la primera vista permitida de ESA pestaña (el panel, tras la
// redirección), después de identificar a la persona.
//
// Qué se guarda: SOLO nombres de evento de una lista cerrada. Nada de props
// (podrían llevar datos) y nada de identidad: el id lo pone `identificar()` en
// el panel, como siempre. `sessionStorage` muere con la pestaña.
// ─────────────────────────────────────────────────────────────────────────────

export const CLAVE_EVENTOS_DIFERIDOS = 'tentare:posthog-diferidos';

/** Los únicos eventos que se pueden aparcar. Uno nuevo se añade aquí a propósito. */
export const EVENTOS_DIFERIBLES = new Set(['alta_estudio_creada']);

type Almacen = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

function leer(almacen: Almacen): string[] {
  try {
    const crudo = JSON.parse(almacen.getItem(CLAVE_EVENTOS_DIFERIDOS) ?? '[]');
    return Array.isArray(crudo) ? crudo.filter((n): n is string => typeof n === 'string' && EVENTOS_DIFERIBLES.has(n)) : [];
  } catch {
    return [];
  }
}

/** Aparca un evento. Sin duplicados: dos pasadas por /login no son dos altas. */
export function aparcarEvento(almacen: Almacen, nombre: string): void {
  if (!EVENTOS_DIFERIBLES.has(nombre)) return;
  const actuales = leer(almacen);
  if (actuales.includes(nombre)) return;
  try {
    almacen.setItem(CLAVE_EVENTOS_DIFERIDOS, JSON.stringify([...actuales, nombre]));
  } catch { /* modo privado / cuota llena: se pierde, como antes */ }
}

/** Devuelve los eventos aparcados y los borra — cada uno sale una sola vez. */
export function recogerEventos(almacen: Almacen): string[] {
  const eventos = leer(almacen);
  try { almacen.removeItem(CLAVE_EVENTOS_DIFERIDOS); } catch { /* nada que borrar */ }
  return eventos;
}
