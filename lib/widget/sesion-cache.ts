// Un solo vuelo y una caché corta para «¿quién es esta socia en este estudio?».
// Sin imports ni `@/` (ver push-estado.ts): probable con el runner de Node.
//
// `useSesionWidget` se monta varias veces a la vez (guardia del layout + la
// pantalla + …) y cada instancia resolvía la socia por su cuenta contra
// `/api/public/session`, que verifica el JWT en Supabase: 4 peticiones
// idénticas al abrir la Home. Aquí todas comparten la misma promesa y, dentro
// del TTL, el mismo resultado. La clave es (baseUrl, slug, usuario): un
// TOKEN_REFRESHED no cambia quién es la socia, así que no vuelve a pedirla.

export interface Entrada<T> { valor: T; cuando: number }

// Sin `private` ni parameter properties: `--experimental-strip-types` no los
// transforma y el test dejaría de cargar.
interface Vuelo<T> { p: Promise<T>; forzado: boolean }

export class CacheSesion<T> {
  enVuelo = new Map<string, Vuelo<T>>();
  guardado = new Map<string, Entrada<T>>();
  ttlMs: number;
  constructor(ttlMs = 30_000) { this.ttlMs = ttlMs; }

  /**
   * Devuelve la promesa compartida; `forzar` ignora lo guardado (tras un
   * login/alta) pero SE UNE a un vuelo forzado ya en marcha: tres instancias
   * que fuerzan a la vez son una sola carga. Y solo el vuelo vigente escribe
   * en la caché: uno lento que llegue tarde no pisa a uno más nuevo.
   */
  obtener(clave: string, cargar: () => Promise<T>, ahora: number, forzar = false): Promise<T> {
    const v = this.enVuelo.get(clave);
    if (!forzar) {
      const g = this.guardado.get(clave);
      if (g && ahora - g.cuando < this.ttlMs) return Promise.resolve(g.valor);
      if (v) return v.p;
    } else if (v?.forzado) {
      return v.p;
    }
    const vuelo: Vuelo<T> = { forzado: forzar, p: undefined as unknown as Promise<T> };
    vuelo.p = cargar().then(
      (valor) => {
        if (this.enVuelo.get(clave) === vuelo) { this.guardado.set(clave, { valor, cuando: ahora }); this.enVuelo.delete(clave); }
        return valor;
      },
      (e) => { if (this.enVuelo.get(clave) === vuelo) this.enVuelo.delete(clave); throw e; },
    );
    this.enVuelo.set(clave, vuelo);
    return vuelo.p;
  }

  /** Al cerrar sesión: nada de lo guardado vale. */
  vaciar(): void { this.enVuelo.clear(); this.guardado.clear(); }

  /** Solo para tests. */
  tamano(): number { return this.guardado.size; }
}

export function claveSesion(baseUrl: string, slug: string, userId: string): string {
  return `${baseUrl}|${slug}|${userId}`;
}
