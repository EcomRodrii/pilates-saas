// El aviso del panel que invita a la instructora a la app del estudio.
//
// Decisión del fundador (14-sep-2026): la app de la alumna es también la de la
// instructora y Tentare Core se elimina. Primero se OCULTA con un aviso (esto),
// y se borra cuando haya paridad y lleve un tiempo sin instructoras en el panel.
// El aviso no bloquea nada: el panel sigue funcionando igual.
//
// Reglas PURAS, sin imports: las prueba el runner de Node.

/** Cuánto deja de verse tras pulsar «Ahora no». */
export const DIAS_OCULTO_TRAS_DESCARTAR = 7;

/** Por estudio: en una cadena, descartarlo en una sede no lo oculta en otra. */
export function claveAvisoApp(studioId: string): string {
  return `tentare:aviso-app-instructora:${studioId}`;
}

/** Lo que se guarda al descartar: hasta cuándo (epoch ms) no se enseña. */
export function hastaTrasDescartar(ahoraMs: number): string {
  return String(ahoraMs + DIAS_OCULTO_TRAS_DESCARTAR * 86_400_000);
}

/** ¿Sigue descartado? Un valor ilegible cuenta como no descartado: mejor verlo que perderlo. */
export function avisoAppDescartado(guardado: string | null, ahoraMs: number): boolean {
  if (!guardado) return false;
  const hasta = Number(guardado);
  return Number.isFinite(hasta) && hasta > ahoraMs;
}

/** «Hoy» de la instructora en la app de su estudio. */
export function urlAppInstructora(slug: string): string {
  return `/portal/${encodeURIComponent(slug)}/equipo`;
}
