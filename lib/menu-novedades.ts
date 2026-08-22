// ─────────────────────────────────────────────────────────────────────────────
// Badge «NUEVO» en el menú del panel.
//
// Tentare marca desde `/interno` qué entrada del menú es nueva, y a la
// propietaria le aparece un distintivo al lado. Existe porque publicar algo en
// el changelog no basta: si no se sabe DÓNDE está lo nuevo, no se encuentra.
//
// Puramente manual a propósito: una fila ES un badge vivo, y la ÚNICA forma de
// apagarlo es borrarla desde /interno. No caduca por fecha ni se apaga solo al
// visitar la sección — quien lo marca espera que se quede hasta que ella misma
// lo quite, no que desaparezca sin que nadie haya hecho nada.
//
// Reglas puras (sin BD ni React) para poder probarlas con `node --test`.
// ─────────────────────────────────────────────────────────────────────────────

// Relativos y con `.ts`: el runner de `node --test` no resuelve el alias `@/`.
// Sin esto el fichero de test no se carga siquiera — no falla, DESAPARECE.
import { MODULOS } from './nav-config.ts';

/** Lo que /interno guarda por cada entrada marcada. `href` es la clave. */
export interface NovedadMenu {
  href: string;
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
