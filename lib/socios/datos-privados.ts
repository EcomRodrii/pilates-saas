// Datos PRIVADOS de la socia (auditoría RGPD 2026-09-13, M1).
//
// Los ven solo PROPIETARIO y RECEPCION (`puedeVerDatosPrivadosSocia`). El panel
// lee lo público de la tabla `socios` y lo privado por la RPC
// `socios_datos_privados()`, que devuelve cero filas a los demás roles; aquí
// vive lo que se puede probar sin Supabase: qué columnas son privadas, cómo se
// juntan las dos lecturas y qué se puede mandar al guardar.
//
// Sin imports a propósito: `node --test` no resuelve el alias `@/`.

// Las 12 columnas. La migración de cierre concede SELECT por columnas a
// `authenticated` con TODAS las de `socios` MENOS estas; si se añade una aquí,
// hay que quitarla también de ese grant (lo vigila
// lib/rgpd-socios-datos-privados-contrato.test.ts).
export const COLUMNAS_PRIVADAS_SOCIA = [
  'nif', 'direccion', 'fecha_nacimiento',
  'tarjeta_marca', 'tarjeta_ultimos4', 'tarjeta_exp_mes', 'tarjeta_exp_anio',
  'stripe_customer_id', 'stripe_payment_method_id',
  'sepa_mandate_id', 'sepa_payment_method_id',
  'aceptacion_firma',
] as const;

export type ColumnaPrivadaSocia = typeof COLUMNAS_PRIVADAS_SOCIA[number];

export type FilaDatosPrivadosSocia = { id: string } & Partial<Record<ColumnaPrivadaSocia, string | number | null>>;

/**
 * Junta las filas públicas de `socios` con las de la RPC por `id`.
 *
 * Una fila sin su pareja privada se queda como está (sin las claves): es lo que
 * recibe un MANAGER o una INSTRUCTORA, y `mapSocio` las convierte en `null`.
 * Solo se copian las 12 columnas privadas — la RPC no puede pisar nada público.
 */
export function fusionarDatosPrivados<T extends { id: string }>(
  filas: readonly T[],
  privadas: readonly FilaDatosPrivadosSocia[],
): T[] {
  if (privadas.length === 0) return [...filas];
  const porId = new Map(privadas.map(p => [p.id, p]));
  return filas.map(fila => {
    const p = porId.get(fila.id);
    if (!p) return fila;
    const extra: Partial<Record<ColumnaPrivadaSocia, unknown>> = {};
    for (const col of COLUMNAS_PRIVADAS_SOCIA) {
      if (col in p) extra[col] = p[col];
    }
    return { ...fila, ...extra };
  });
}

// Claves de `Socio` (camelCase) que escriben columnas privadas.
// `aceptacionContrato` va entera: escribirla escribe `aceptacion_firma`.
export const CAMPOS_PRIVADOS_SOCIO = [
  'nif', 'direccion', 'fechaNacimiento',
  'tarjetaMarca', 'tarjetaUltimos4', 'tarjetaExpMes', 'tarjetaExpAnio',
  'stripeCustomerId', 'stripePaymentMethodId',
  'sepaMandateId', 'sepaPaymentMethodId',
  'aceptacionContrato',
] as const;

const vacio = (v: unknown) => v === undefined || v === null || v === '';

/**
 * Lo que un formulario del panel puede mandar a `updateSocio`/`addSocio`.
 *
 *  · Sin permiso, ningún campo privado sale: el campo está oculto y su valor
 *    en el formulario es `''`, así que mandarlo BORRARÍA el NIF de la socia
 *    (y tras la migración de cierre, la BD lo rechaza con 42501).
 *  · Con permiso y `original`, solo sale lo que CAMBIÓ. Si la RPC falló al
 *    cargar, el formulario enseña `''` donde había un NIF; sin esta
 *    comparación, guardar el teléfono lo habría vaciado.
 */
export type CampoPrivadoSocio = typeof CAMPOS_PRIVADOS_SOCIO[number];

export function cambiosSociaPermitidos<T extends Record<string, unknown>>(
  cambios: T,
  opciones: { puedeVerPrivados: boolean; original?: object | null },
): Omit<T, CampoPrivadoSocio> & Partial<Pick<T, Extract<keyof T, CampoPrivadoSocio>>> {
  const salida: Record<string, unknown> = { ...cambios };
  const original = opciones.original as Readonly<Record<string, unknown>> | null | undefined;
  for (const campo of CAMPOS_PRIVADOS_SOCIO) {
    if (!(campo in salida)) continue;
    if (!opciones.puedeVerPrivados) { delete salida[campo]; continue; }
    if (original && campo !== 'aceptacionContrato') {
      const antes = original[campo];
      const ahora = salida[campo];
      if ((vacio(antes) && vacio(ahora)) || antes === ahora) delete salida[campo];
    }
  }
  return salida as Omit<T, CampoPrivadoSocio> & Partial<Pick<T, Extract<keyof T, CampoPrivadoSocio>>>;
}

/**
 * 'MM-DD' del cumpleaños. En el panel llega `cumpleMmDd` (columna generada,
 * visible para todo el personal); en servidor, además, la fecha completa.
 */
export function cumpleMesDia(s: { cumpleMmDd?: string | null; fechaNacimiento?: string | null } | null | undefined): string | null {
  if (!s) return null;
  if (s.cumpleMmDd && /^\d{2}-\d{2}$/.test(s.cumpleMmDd)) return s.cumpleMmDd;
  const m = s.fechaNacimiento?.match(/^\d{4}-(\d{2})-(\d{2})/);
  return m ? `${m[1]}-${m[2]}` : null;
}

/** «14 de marzo». Año bisiesto fijo para que el 29 de febrero exista. */
export function formatearCumple(mmdd: string | null): string | null {
  const m = mmdd?.match(/^(\d{2})-(\d{2})$/);
  if (!m) return null;
  const mes = Number(m[1]);
  const dia = Number(m[2]);
  if (mes < 1 || mes > 12 || dia < 1 || dia > 31) return null;
  return new Date(2000, mes - 1, dia).toLocaleDateString('es-ES', { day: 'numeric', month: 'long' });
}

/** Días hasta el próximo cumpleaños (0 = hoy), en la hora local de `now`. */
export function diasHastaCumple(mmdd: string, now: Date): number | null {
  const m = mmdd.match(/^(\d{2})-(\d{2})$/);
  if (!m) return null;
  const mes = Number(m[1]) - 1;
  const dia = Number(m[2]);
  const hoy = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  let objetivo = new Date(now.getFullYear(), mes, dia);
  if (objetivo.getTime() < hoy.getTime()) objetivo = new Date(now.getFullYear() + 1, mes, dia);
  return Math.round((objetivo.getTime() - hoy.getTime()) / 86_400_000);
}
