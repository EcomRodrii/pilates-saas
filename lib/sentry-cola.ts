// La cola que hace segura la carga diferida de Sentry.
//
// Vive aparte de `lib/sentry-cliente.ts` por una razón concreta: aquél hace
// `import('@sentry/nextjs')`, y un test que tenga que simular ese import acaba
// probando el simulacro. Esto es lógica pura —sin red, sin SDK, sin navegador—
// así que el test de `sentry-cola.test.ts` ejecuta EL MISMO código que corre en
// producción. Importa que sea así: si esta cola se rompe no se ve nada raro en
// pantalla, simplemente dejas de enterarte de los errores del arranque.

export type Llamada = { metodo: string; args: unknown[] };
export type Destino = Record<string, unknown>;

export interface Cola {
  /** Ejecuta contra el destino si ya está, o guarda para cuando llegue. */
  pedir(metodo: string, args: unknown[]): void;
  /** Conecta el destino real y vuelca lo guardado, en orden. */
  conectar(destino: Destino): void;
  /** Cuántas capturas esperan al destino. */
  readonly pendientes: number;
  /** Cuántas se descartaron por desbordar el tope (0 si ninguna). */
  readonly descartadas: number;
  readonly conectada: boolean;
}

function invocar(destino: Destino, { metodo, args }: Llamada) {
  const fn = destino[metodo];
  // Un método que el SDK no tenga (versión distinta, export renombrado) se
  // ignora en vez de reventar el volcado y llevarse por delante el resto.
  if (typeof fn === 'function') (fn as (...a: unknown[]) => unknown)(...args);
}

/**
 * @param maxCola tope de capturas guardadas. Si algo entra en bucle de errores
 *   antes de que llegue el destino, no queremos comernos la memoria del móvil.
 *   Se conservan las PRIMERAS: explican el fallo original, mientras que las
 *   siguientes suelen ser su consecuencia.
 */
export function crearCola(maxCola = 100): Cola {
  let destino: Destino | null = null;
  const cola: Llamada[] = [];
  let descartadas = 0;

  return {
    pedir(metodo, args) {
      if (destino) { invocar(destino, { metodo, args }); return; }
      if (cola.length < maxCola) cola.push({ metodo, args });
      else descartadas++;
    },
    conectar(d) {
      destino = d;
      // El orden importa: `setUser` y `setTag` se encolaron antes que el error,
      // y si salieran después el error llegaría a Sentry sin usuario ni estudio
      // — justo los dos datos para los que existen.
      for (const ll of cola) invocar(d, ll);
      cola.length = 0;
    },
    get pendientes() { return cola.length; },
    get descartadas() { return descartadas; },
    get conectada() { return destino !== null; },
  };
}
