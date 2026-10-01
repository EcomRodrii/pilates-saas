// Reglas puras de la gestión de claves desde el panel (crear, rotar, listar).
// Sin base de datos: las prueba `gestion-reglas.test.ts`.

import { SCOPES_VALIDOS, type ScopeOAuth } from './catalogo-scopes.ts';

export const MAX_CLAVES_ACTIVAS = 20;
export const CADUCIDADES_DIAS = [30, 90, 365] as const;
/** Al rotar, la clave vieja sigue viva este tiempo para cambiarla sin cortar. */
export const HORAS_SOLAPE_ROTACION = 24;

export interface NuevaClave {
  nombre: string;
  scopes: ScopeOAuth[];
  /** null = no caduca. */
  caducaEnDias: number | null;
}

export type Validacion = { ok: true; valor: NuevaClave } | { ok: false; error: string };

/**
 * Valida lo que manda el panel. `permitidos` son los scopes que quien crea la
 * clave puede conceder HOY (rol ∩ plan): una clave nunca nace con más.
 */
export function validarNuevaClave(cuerpo: unknown, permitidos: readonly ScopeOAuth[]): Validacion {
  if (!cuerpo || typeof cuerpo !== 'object') return { ok: false, error: 'Faltan los datos de la clave.' };
  const c = cuerpo as Record<string, unknown>;

  const nombre = typeof c.nombre === 'string' ? c.nombre.trim() : '';
  if (nombre.length < 1 || nombre.length > 80) {
    return { ok: false, error: 'Ponle un nombre (hasta 80 caracteres) para saber para qué es, p. ej. «Contabilidad».' };
  }

  if (!Array.isArray(c.scopes) || c.scopes.length === 0) return { ok: false, error: 'Elige al menos un permiso.' };
  const pedidos = [...new Set(c.scopes.map(String))];
  const desconocidos = pedidos.filter((s) => !(SCOPES_VALIDOS as readonly string[]).includes(s));
  if (desconocidos.length) return { ok: false, error: `Permisos que no existen: ${desconocidos.join(', ')}.` };
  const noPermitidos = pedidos.filter((s) => !(permitidos as readonly string[]).includes(s));
  if (noPermitidos.length) return { ok: false, error: `No puedes dar estos permisos: ${noPermitidos.join(', ')}.` };

  let caducaEnDias: number | null = null;
  if (c.caducaEnDias !== null && c.caducaEnDias !== undefined) {
    if (!(CADUCIDADES_DIAS as readonly number[]).includes(Number(c.caducaEnDias))) {
      return { ok: false, error: `La caducidad es de ${CADUCIDADES_DIAS.join(', ')} días, o sin caducidad.` };
    }
    caducaEnDias = Number(c.caducaEnDias);
  }

  // Orden del catálogo: dos claves con los mismos permisos se leen igual.
  const scopes = SCOPES_VALIDOS.filter((s) => pedidos.includes(s));
  return { ok: true, valor: { nombre, scopes, caducaEnDias } };
}

/** Cuándo caduca una clave creada `ahora` con `dias` de vida (null = nunca). */
export function caducidadDesde(ahora: Date, dias: number | null): string | null {
  return dias === null ? null : new Date(ahora.getTime() + dias * 86_400_000).toISOString();
}

/**
 * Hasta cuándo vive la clave vieja al rotarla: `HORAS_SOLAPE_ROTACION` desde
 * ahora, salvo que ya caducara antes (rotar nunca le alarga la vida).
 */
export function expiraTrasRotar(ahora: Date, expiraEnActual: string | null): string {
  const solape = new Date(ahora.getTime() + HORAS_SOLAPE_ROTACION * 3_600_000);
  if (expiraEnActual && Date.parse(expiraEnActual) < solape.getTime()) return expiraEnActual;
  return solape.toISOString();
}

export type EstadoClave = 'activa' | 'caducada' | 'revocada';

export function estadoClave(c: { revocada_en: string | null; expira_en: string | null }, ahora: Date): EstadoClave {
  if (c.revocada_en) return 'revocada';
  if (c.expira_en && Date.parse(c.expira_en) <= ahora.getTime()) return 'caducada';
  return 'activa';
}
