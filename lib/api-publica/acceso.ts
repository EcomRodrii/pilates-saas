// ¿Tiene un estudio la API pública? Desde el 16-oct-2026 la tiene TODO estudio.
//
// `api_acceso_estudios` ya no es una lista de permitidos sino el interruptor de
// apagado (kill switch) de /interno: una fila con `desactivada_en` puesto corta
// ese estudio; sin fila, o con la fila sin desactivar, la API vale. Así un
// estudio recién creado (o una sede nueva de una cadena) la tiene desde el
// primer minuto sin que nadie tenga que activarla.
//
// Una sola regla para la puerta de la API, el panel, los webhooks y /interno:
// la misma que aplica en SQL el trigger `api_registrar_evento`
// (migr 20261016100000). Pura y sin imports: la ejecuta `node --test`.

export interface FilaAccesoApi { desactivada_en?: string | null }

/** Activa salvo desactivación explícita. Una lectura que falla NO llega aquí. */
export function apiActivaSegunFila(fila: FilaAccesoApi | null | undefined): boolean {
  return !fila?.desactivada_en;
}

/** De una lista de ids y las filas DESACTIVADAS, los ids con la API activa. */
export function idsConApiActiva(ids: readonly string[], desactivados: ReadonlySet<string>): Set<string> {
  return new Set(ids.filter((id) => !desactivados.has(id)));
}
