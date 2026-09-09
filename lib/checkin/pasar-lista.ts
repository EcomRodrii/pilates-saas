// ─────────────────────────────────────────────────────────────────────────────
// ¿Se pasa lista en esta sesión?
//
// La decisión, separada del barrido que la usa, por el motivo de siempre en
// este repo: `marcar-asistidas-automatico.ts` es I/O (tres consultas paginadas
// y un bucle de escrituras) y no se puede probar sin base de datos. La regla sí.
//
// Import relativo con extensión `.ts` a propósito: `node --test
// --experimental-strip-types` no resuelve el alias `@/`, y un test que lo use
// no falla — simplemente NO SE EJECUTA, que es la peor forma de perder
// cobertura porque parece verde.
import { heredaOverride } from '../booking-logic.ts';

/** Lo mínimo que hace falta de una sesión para decidir. */
export interface SesionParaLista {
  id: string;
  studioId: string;
  /** Nullable de verdad: una sesión puede no tener tipo de clase. */
  tipoClaseId: string | null;
}

/**
 * ¿Hay que pasar lista?
 *
 * `tipos_clase.requiere_checkin_qr` (NULL = hereda) manda sobre
 * `studios.requiere_checkin_qr`. Ambos `?? true` cuando no hay valor: sin dato,
 * SE PASA lista. Es el respaldo seguro — equivocarse hacia `false` daría por
 * asistida a gente que no vino, y con ella créditos, racha y logros que no le
 * tocan.
 */
export function sePasaLista(
  sesion: SesionParaLista,
  requiereQrPorStudio: Map<string, boolean | null | undefined>,
  overridePorTipoClase: Map<string, boolean | null | undefined>,
): boolean {
  const override = sesion.tipoClaseId ? overridePorTipoClase.get(sesion.tipoClaseId) ?? null : null;
  return heredaOverride(override, requiereQrPorStudio.get(sesion.studioId) ?? true);
}

/**
 * Las sesiones en las que NO se pasa lista — las que el barrido tiene que dar
 * por asistidas al terminar.
 *
 * Se devuelve el conjunto complementario y no un filtro genérico porque es
 * exactamente lo que necesita el llamador, y así el criterio («sin dato, se
 * pasa lista») vive en un solo sitio.
 */
export function sesionesQueSeDanPorAsistidas(
  sesiones: SesionParaLista[],
  requiereQrPorStudio: Map<string, boolean | null | undefined>,
  overridePorTipoClase: Map<string, boolean | null | undefined>,
): string[] {
  return sesiones
    .filter(s => !sePasaLista(s, requiereQrPorStudio, overridePorTipoClase))
    .map(s => s.id);
}
