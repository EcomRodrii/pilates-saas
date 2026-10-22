// ─────────────────────────────────────────────────────────────────────────────
// Lo que el panel del alta nueva pregunta al servidor para marcar «Pon en
// marcha tu estudio» (PR-5 del plan del 21-oct-2026): GET /api/alta/estado.
//
// Solo lo que el NAVEGADOR no puede saber por sí mismo, y siempre sin datos de
// nadie (booleanos, un número de sedes y una frase genérica):
//   · `claseReservable`: el SÍ del servidor a «¿puede una alumna nueva reservar
//     ya?» (`puedeReservarEnServidor`, el mismo motor que la reserva de verdad),
//     o el hito `clase_reservable` del embudo si ya se apuntó. Nunca «tiene un
//     tipo de clase»: eso es lo que marcaba mal la guía de siempre.
//   · `avisoClase`: si hay clase pero una alumna nueva aún no puede reservarla,
//     por qué (la misma frase que «¡Listo!», `avisoListo`) y dónde se arregla.
//     «Crea tu primera clase» no puede ofrecer crearla a quien ya la tiene.
//   · `enlaceCompartido`, `recorridoVisto` y `planEnsenado`: lo que solo deja
//     huella en el embudo del alta (`embudo_alta`).
//   · `alumnas` y `primeraReserva`: también los mira el navegador con lo que
//     tiene cargado; el servidor cuenta en la tabla entera, sin ventanas.
//   · `sedesAbiertas`: cuántas sedes tiene ya su cadena (1 sin cadena), para
//     «Abre tus otras N sedes».
//   · `foundingGratis`: si la tarjeta del plan puede hablar de Founding gratis.
//
// Puro, sin `@/` y sin el motor de «¿puede reservar?» (lo lee el marco del
// panel): el aviso lo escribe lib/alta/aviso-clase.ts, en el servidor.
// Lo prueba `node --test` (estado.test.ts).
// ─────────────────────────────────────────────────────────────────────────────

export interface AvisoClase {
  /** Qué falta, dicho como en «¡Listo!». */
  texto: string;
  /** Dónde se arregla. */
  href: string;
}

export interface EstadoAlta {
  claseReservable: boolean;
  avisoClase: AvisoClase | null;
  enlaceCompartido: boolean;
  alumnas: boolean;
  primeraReserva: boolean;
  recorridoVisto: boolean;
  planEnsenado: boolean;
  sedesAbiertas: number;
  foundingGratis: boolean;
}

/**
 * Lo que contesta la ruta, leído sin dar nada por hecho: los e2e mockean
 * `/api/**` como `{}`, y una respuesta rara no puede marcar nada ni enseñar
 * nada. Sin `claseReservable` booleano es que no es nuestra respuesta: `null`,
 * y quien la usa no da por visto el recorrido ni por enseñado el plan (no los
 * enseña).
 */
export function leerEstadoAlta(x: unknown): EstadoAlta | null {
  if (!x || typeof x !== 'object' || Array.isArray(x)) return null;
  const r = x as Record<string, unknown>;
  if (typeof r.claseReservable !== 'boolean') return null;
  const si = (v: unknown) => v === true;
  const aviso = r.avisoClase as Record<string, unknown> | null | undefined;
  const avisoClase = aviso && typeof aviso === 'object' && typeof aviso.texto === 'string' && aviso.texto.trim()
    && typeof aviso.href === 'string' && aviso.href.startsWith('/')
    ? { texto: aviso.texto, href: aviso.href }
    : null;
  const sedes = typeof r.sedesAbiertas === 'number' && Number.isFinite(r.sedesAbiertas) && r.sedesAbiertas >= 1
    ? Math.floor(r.sedesAbiertas)
    : 1;
  return {
    claseReservable: r.claseReservable,
    avisoClase: r.claseReservable ? null : avisoClase,
    enlaceCompartido: si(r.enlaceCompartido),
    alumnas: si(r.alumnas),
    primeraReserva: si(r.primeraReserva),
    recorridoVisto: si(r.recorridoVisto),
    planEnsenado: si(r.planEnsenado),
    sedesAbiertas: sedes,
    foundingGratis: si(r.foundingGratis),
  };
}

/** Lo que se dice al ir a compartir el enlace sin ninguna clase que reservar todavía. */
export const AVISO_SIN_CLASE_AL_COMPARTIR = 'Tu app ya existe, pero todavía no hay ninguna clase que una alumna nueva pueda reservar: crea tu primera clase antes de mandarlo.';

/**
 * Antes de mandar el enlace: si una alumna nueva todavía no puede reservar, por
 * qué. `null` si puede, o si no se sabe (no se inventa un aviso).
 */
export function avisoAlCompartir(e: EstadoAlta | null | undefined): string | null {
  if (!e || e.claseReservable) return null;
  return e.avisoClase?.texto ?? AVISO_SIN_CLASE_AL_COMPARTIR;
}
