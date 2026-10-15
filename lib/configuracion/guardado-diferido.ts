// Guardar mientras se escribe, sin perder letras y sin decir «Guardado» antes de tiempo.
//
// En «Contenido de tu app» cada tecla mandaba una escritura y el campo enseñaba el
// valor del contexto, que solo cambia cuando vuelve el servidor: mientras tanto
// React pintaba el valor viejo y la tecla siguiente se añadía sobre él. Escribiendo
// deprisa, se comían letras. Ahora el campo enseña lo que se teclea (estado local) y
// esto agrupa los cambios y los manda cuando se deja de escribir:
//   · una escritura cada vez, en orden: lo que llega mientras otra va de camino se
//     suma y sale en cuanto vuelve;
//   · «guardado» solo cuando el servidor dice que sí, y solo si no queda nada por mandar;
//   · si falla, lo no guardado se queda y sale con el siguiente cambio o al reintentar;
//     nunca se reintenta solo (un fallo de permisos daría vueltas sin fin);
//   · `vaciar()` lo manda ya (al salir del campo, al cambiar de ficha, al desmontar).
//
// Pura y sin React: se prueba con `node --test` (los relojes se inyectan).

export type Resultado = { ok: true } | { ok: false; error: string };

export type EstadoGuardado =
  | { e: 'quieto' }
  | { e: 'pendiente' }
  | { e: 'guardando' }
  | { e: 'guardado' }
  | { e: 'error'; error: string };

export interface Relojes {
  setTimeout: (fn: () => void, ms: number) => unknown;
  clearTimeout: (t: unknown) => void;
}

const RELOJES: Relojes = {
  setTimeout: (fn, ms) => globalThis.setTimeout(fn, ms),
  clearTimeout: (t) => globalThis.clearTimeout(t as ReturnType<typeof globalThis.setTimeout>),
};

export class GuardadoDiferido<T extends object> {
  private pendiente: Partial<T> | null = null;
  private enVuelo: Promise<void> | null = null;
  private temporizador: unknown = null;
  private readonly guardar: (cambios: Partial<T>) => Promise<Resultado>;
  private readonly alCambiar: (estado: EstadoGuardado) => void;
  private readonly esperaMs: number;
  private readonly relojes: Relojes;

  constructor(
    guardar: (cambios: Partial<T>) => Promise<Resultado>,
    alCambiar: (estado: EstadoGuardado) => void,
    esperaMs = 600,
    relojes: Relojes = RELOJES,
  ) {
    this.guardar = guardar;
    this.alCambiar = alCambiar;
    this.esperaMs = esperaMs;
    this.relojes = relojes;
  }

  /** Apunta un cambio. Con `inmediato` (un interruptor, una fecha, un desplegable) sale ya. */
  cambiar(cambios: Partial<T>, inmediato = false): void {
    this.pendiente = { ...(this.pendiente ?? {}), ...cambios };
    this.parar();
    if (inmediato) { void this.vaciar(); return; }
    if (!this.enVuelo) this.alCambiar({ e: 'pendiente' });
    this.temporizador = this.relojes.setTimeout(() => { this.temporizador = null; void this.vaciar(); }, this.esperaMs);
  }

  /** Manda ya lo pendiente (o espera a lo que ya va de camino, que lo mandará al volver). */
  vaciar(): Promise<void> {
    this.parar();
    if (this.enVuelo) return this.enVuelo;
    if (!this.pendiente) return Promise.resolve();
    const cambios = this.pendiente;
    this.pendiente = null;
    this.alCambiar({ e: 'guardando' });
    this.enVuelo = (async () => {
      let r: Resultado;
      try {
        r = await this.guardar(cambios);
      } catch {
        r = { ok: false, error: 'No se ha podido guardar. Comprueba la conexión e inténtalo otra vez.' };
      }
      this.enVuelo = null;
      if (!r.ok) {
        // Lo que no entró se queda, debajo de lo que se haya tecleado mientras tanto.
        this.pendiente = { ...cambios, ...(this.pendiente ?? {}) };
        this.alCambiar({ e: 'error', error: r.error });
        return;
      }
      if (this.pendiente) { await this.vaciar(); return; }
      this.alCambiar({ e: 'guardado' });
    })();
    return this.enVuelo;
  }

  /** ¿Queda algo por mandar o va algo de camino? */
  ocupado(): boolean {
    return !!this.pendiente || !!this.enVuelo;
  }

  private parar(): void {
    if (this.temporizador !== null) {
      this.relojes.clearTimeout(this.temporizador);
      this.temporizador = null;
    }
  }
}
