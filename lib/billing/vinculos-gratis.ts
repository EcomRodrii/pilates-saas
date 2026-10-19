// ─────────────────────────────────────────────────────────────────────────────
// Founding Studio gratis: un estudio no se queda gratis para siempre cambiando
// de cuenta (decisión del fundador, 19-oct-2026).
//
// El uso ya se sumaba por dueña (uso-gratis-servidor.ts): con un correo nuevo
// empezaba de cero, con límites nuevos y otros 30 días de margen. Ahora se suman
// también los estudios de OTRAS cuentas que son el mismo negocio. Lo que no se
// puede cambiar en cinco minutos no es el móvil ni la IP, es el negocio:
//
//   · CUENTAN (se suma su uso; hereda el exceso y el margen no vuelve a empezar),
//     siempre contra un estudio MÁS ANTIGUO de otra dueña que ya se pasó de un
//     límite o está cerrado:
//     'stripe'  — la misma cuenta de Stripe Connect, aunque ya la desconectara
//                 del estudio viejo (`cuentas_stripe_vistas`; solo la escribe el
//                 servidor, no se puede falsificar).
//     'alumnas' — al menos MIN_ALUMNAS_COMUNES alumnas en común (correo o móvil)
//                 Y la mitad de las suyas. Nadie salta de cuenta sin llevárselas.
//
// ⚠️ Solo puede salir perjudicado el estudio que COPIA, nunca el copiado (la
// revisión de seguridad lo pidió: el NIF lo escribe la dueña y las alumnas se
// importan). Por eso: (1) el vínculo va del nuevo al viejo y el grupo solo lo
// sigue en esa dirección; (2) alumnas y NIF solo cuentan con lo que el SERVIDOR
// vio en el viejo ANTES del alta del nuevo (`rastro_gratis`, HMAC con la hora
// del servidor): meter hoy las alumnas o el NIF de otra en un estudio cerrado no
// la toca; (3) medir nunca escribe la fecha de exceso en estudios de otra dueña.
//   · SOLO AVISAN (`cuenta = false`): 'nif' (lo escribe la dueña sin verificar:
//     alguien podría «ocupar» hoy el NIF de un negocio que aún no está en
//     Tentare), y 'dispositivo' e 'ip', la huella del alta, tras HUELLA_ALTA.
//     Una IP compartida (un local, un coworking) no es el mismo negocio.
//
// Lo detecta la base de datos (`detectar_vinculos_gratis`: las alumnas no salen
// de allí) cada vez que se mide un estudio gratis. Un vínculo se deshace desde
// /interno (`descartado_en`), nunca solo, y cada vínculo nuevo que cuenta va a
// Sentry para que el fundador lo mire.
//
// Puro, sin `@/`: se prueba con `node --test`.
// ─────────────────────────────────────────────────────────────────────────────

/** Alumnas en común para sumar dos estudios (con un 5 en común no se toca a nadie). */
export const MIN_ALUMNAS_COMUNES = 30;
/** …y que sean al menos esta parte de las suyas. */
export const PCT_ALUMNAS_COMUNES = 0.5;

export type MotivoVinculo = 'stripe' | 'nif' | 'alumnas' | 'dispositivo' | 'ip';

export const MOTIVOS_VINCULO: readonly MotivoVinculo[] = ['stripe', 'nif', 'alumnas', 'dispositivo', 'ip'];

/** Los que suman el uso. Los demás solo avisan. Debe coincidir con la función SQL. */
export const MOTIVOS_QUE_CUENTAN: readonly MotivoVinculo[] = ['stripe', 'alumnas'];

/** Cuánto se guarda el rastro (HMAC de alumnas y NIF) antes de borrarse solo. */
export const RETENCION_RASTRO_MESES = 18;

/** Cómo se lee cada motivo en /interno. */
export const TEXTO_MOTIVO: Record<MotivoVinculo, string> = {
  stripe: 'La misma cuenta de Stripe',
  nif: 'El mismo NIF',
  alumnas: 'Comparten la mayoría de sus alumnas',
  dispositivo: 'Se dio de alta desde el mismo navegador',
  ip: 'Se dio de alta desde la misma conexión',
};

export interface FilaVinculo {
  studio_id: string;
  vinculado_id: string;
  cuenta: boolean;
  descartado_en: string | null;
}

/**
 * Los estudios a los que se suma un grupo: el estudio VIEJO de cada vínculo que
 * cuenta y no está descartado, cuando el NUEVO es del grupo. Solo en esa
 * dirección: un estudio viejo nunca carga con el uso de quien lo copia.
 */
export function vinculadosDelGrupo(grupo: readonly string[], vinculos: readonly FilaVinculo[]): string[] {
  const dentro = new Set(grupo);
  const fuera = new Set<string>();
  for (const v of vinculos) {
    if (!v.cuenta || v.descartado_en) continue;
    if (dentro.has(v.studio_id) && !dentro.has(v.vinculado_id)) fuera.add(v.vinculado_id);
  }
  return [...fuera];
}

/** La huella del alta se apunta solo en los primeros días del estudio: es «desde dónde se dio de alta». */
export const DIAS_HUELLA_ALTA = 14;

export function enDiasDeAlta(creadoEn: string | null | undefined, ahora: Date): boolean {
  if (!creadoEn) return false;
  return ahora.getTime() - new Date(creadoEn).getTime() < DIAS_HUELLA_ALTA * 86_400_000;
}

/**
 * La huella del alta (IP y navegador) solo se apunta con HUELLA_ALTA=on. Es la
 * única parte que toca la LSSI (art. 22.2: guardar algo en el navegador): se
 * enciende después de que lo revise un abogado, nunca por defecto.
 */
export function huellaAltaActiva(env: Record<string, string | undefined>): boolean {
  return env.HUELLA_ALTA?.trim() === 'on';
}

/** El nombre de la cookie que marca el navegador de la dueña (solo con HUELLA_ALTA). */
export const COOKIE_DISPOSITIVO = 'tentare_disp';

/** Un vínculo, visto desde la ficha de un estudio en /interno. */
export interface VinculoFicha {
  /** El otro estudio. */
  otroId: string;
  otroNombre: string;
  otroEstado: string | null;
  /** Los motivos (puede haber varios, en las dos direcciones). */
  motivos: MotivoVinculo[];
  /** ¿Suma el uso? (alguno de sus motivos cuenta y no está descartado). */
  cuenta: boolean;
  /** Alumnas en común, si ese fue un motivo. */
  alumnas: { comunes: number; total: number } | null;
  detectadoEn: string;
  descartado: boolean;
}
