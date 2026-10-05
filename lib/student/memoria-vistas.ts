// Lo último que vio cada pantalla, para pintarlo AL MOMENTO al volver a ella
// mientras se refresca por detrás (`useAsync` con `clave`). Puro y sin `@/`
// (memoria-vistas.test.ts).
//
// ⚠️ La IDENTIDAD va en la clave, no solo el estudio. Lo que se guarda son
// datos de la socia (sus reservas, sus bonos, su ficha), y una caché «por
// estudio» ya sirvió una vez lo de una alumna a la siguiente que entró en la
// misma tablet (ver lib/student/catalogo-clave.ts). Aquí la persona es la que
// está en el DISPOSITIVO (`personaEnElDispositivo`) en el instante de leer y en
// el de guardar:
//
//   · al LEER, solo vale lo guardado para la persona de ahora;
//   · al GUARDAR, si la persona cambió entre pedir y recibir (cerró sesión y
//     entró otra a media petición), no se guarda nada: esos datos eran de la
//     anterior.
//
// Y además se vacía entera al cerrar sesión (`useAsync`) y por estudio tras
// cualquier escritura (`invalidarCatalogo`): volver a «Mis clases» justo
// después de reservar no puede enseñar la lista de antes.
//
// Las claves que se le pasan son `<app>:<slug>:<pantalla>` (p. ej.
// `alumna:mi-estudio:inicio`, `instr:mi-estudio:agenda:…`): el segundo tramo es
// el estudio, y es por lo que se vacía.

/** La persona anónima es una identidad distinta de cualquier autenticada. */
const ANONIMA = 'anon';

const claveInterna = (persona: string | null, clave: string) => `${persona || ANONIMA}\u0000${clave}`;

export class MemoriaVistas {
  private readonly datos = new Map<string, unknown>();

  /** Lo guardado para esa pantalla y ESA persona; `undefined` si no hay nada. */
  leer<T>(clave: string, persona: string | null): T | undefined {
    return this.datos.get(claveInterna(persona, clave)) as T | undefined;
  }

  tiene(clave: string, persona: string | null): boolean {
    return this.datos.has(claveInterna(persona, clave));
  }

  /**
   * Guarda lo recibido si la persona no cambió mientras se pedía. Devuelve si
   * lo guardó.
   */
  guardar(clave: string, personaAlPedir: string | null, personaAlRecibir: string | null, valor: unknown): boolean {
    if ((personaAlPedir || ANONIMA) !== (personaAlRecibir || ANONIMA)) return false;
    this.datos.set(claveInterna(personaAlRecibir, clave), valor);
    return true;
  }

  /** Todo lo de un estudio, de cualquier persona. Tras una escritura. */
  olvidarEstudio(slug: string): number {
    let n = 0;
    for (const k of Array.from(this.datos.keys())) {
      const clave = k.slice(k.indexOf('\u0000') + 1);
      if (clave.split(':')[1] === slug) { this.datos.delete(k); n++; }
    }
    return n;
  }

  /** Al cerrar sesión y en los tests. */
  olvidarTodo(): void {
    this.datos.clear();
  }

  get tamano(): number {
    return this.datos.size;
  }
}

/** La única de la app: la comparten `useAsync` y `invalidarCatalogo`. */
export const memoriaVistas = new MemoriaVistas();

/**
 * El usuario de una sesión de Supabase tal y como la guarda auth-js en el
 * almacén (`{ access_token, user: { id } … }`). `null` si no hay sesión o no se
 * entiende: tratarlo como anónima es lo seguro (no casa con nadie).
 */
export function personaDeSesionGuardada(crudo: string | null | undefined): string | null {
  if (!crudo) return null;
  try {
    const s = JSON.parse(crudo) as { user?: { id?: unknown } | null } | null;
    const id = s?.user?.id;
    return typeof id === 'string' && id ? id : null;
  } catch {
    return null;
  }
}
