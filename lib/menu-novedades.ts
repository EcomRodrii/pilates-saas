// ─────────────────────────────────────────────────────────────────────────────
// Badge «NUEVO» en el menú del panel.
//
// Tentare marca desde `/interno` qué entrada del menú es nueva, y a la
// propietaria le aparece un distintivo al lado. Existe porque publicar algo en
// el changelog no basta: si no se sabe DÓNDE está lo nuevo, no se encuentra.
//
// Reglas puras (sin BD ni React) para poder probarlas con `node --test`.
// ─────────────────────────────────────────────────────────────────────────────

// Relativos y con `.ts`: el runner de `node --test` no resuelve el alias `@/`.
// Sin esto el fichero de test no se carga siquiera — no falla, DESAPARECE.
import { MODULOS } from './nav-config.ts';

/** Lo que /interno guarda por cada entrada marcada. `href` es la clave. */
export interface NovedadMenu {
  href: string;
  /** Día (YYYY-MM-DD) en que el badge deja de mostrarse. */
  expiraEn: string;
}

/**
 * Días por defecto que dura el badge.
 *
 * No es configurable a propósito en la BD, solo el valor concreto que se
 * guarda: la fecha se escribe siempre, así que un badge SIEMPRE se retira
 * solo. Un «NUEVO» permanente deja de significar nada en dos semanas, y nadie
 * se acuerda de ir a quitarlo.
 */
export const DIAS_BADGE_NUEVO = 30;

export function expiracionPorDefecto(hoy: Date): string {
  return new Date(hoy.getTime() + DIAS_BADGE_NUEVO * 86_400_000).toISOString().slice(0, 10);
}

/**
 * ¿Sigue viva esta marca hoy?
 *
 * Se compara por CADENA (`YYYY-MM-DD`), no con `Date`: `expira_en` es un DATE
 * de Postgres, y pasarlo por `new Date()` lo interpreta como medianoche UTC —
 * con lo que en España el badge se apagaría a las 2 de la madrugada del día
 * anterior. El último día cuenta como vigente.
 */
export function novedadVigente(n: NovedadMenu, hoyISO: string): boolean {
  return n.expiraEn >= hoyISO;
}

/**
 * `href` válido = una entrada REAL del menú.
 *
 * Sin esto, un dedazo en `/interno` (`/clientes` por `/clientas`) guarda una
 * fila que nunca pinta nada y no da ningún error: se marcaría como nuevo algo
 * que nadie ve. Se valida contra `MODULOS`, que ya excluye rutas congeladas y
 * módulos apagados por flag — marcar como «NUEVO» algo que no está en el menú
 * de nadie sería igual de inútil.
 */
export function esHrefDeMenu(href: string): boolean {
  return MODULOS.some(m => m.href === href);
}

/** Las entradas marcables, para el desplegable de `/interno`. */
export function opcionesDeMenu(): Array<{ href: string; label: string }> {
  return MODULOS.map(m => ({ href: m.href, label: m.label }));
}

/**
 * Qué badges pinta el menú AHORA, ya descontando los que esta persona ya ha
 * visto.
 *
 * `vistos` son los `href` que ya visitó desde ESTE navegador
 * (`localStorage`). Es deliberadamente per-navegador y no una tabla: el badge
 * es un empujón, no un dato de negocio, y una fila por socia y por novedad
 * para decir «ya lo vi» no vale lo que cuesta. Lo peor que pasa si cambia de
 * dispositivo es que lo vea dos veces.
 */
export function hrefsConBadge(
  novedades: readonly NovedadMenu[], hoyISO: string, vistos: readonly string[],
): Set<string> {
  return new Set(
    novedades
      .filter(n => novedadVigente(n, hoyISO) && !vistos.includes(n.href))
      .map(n => n.href),
  );
}
