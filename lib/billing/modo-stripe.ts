// ─────────────────────────────────────────────────────────────────────────────
// En qué modo de Stripe estamos, y si ese modo pega con dónde estamos corriendo.
//
// Incidente 22-ago: STRIPE_SECRET_KEY rotada (auditoría 14ª pasada, C-2 —
// Sentry JAVASCRIPT-NEXTJS-1P). Este commit solo fuerza el redeploy real: el
// `ignoreCommand` de vercel.json cancela un redeploy manual sin commit nuevo
// (diff vacío contra sí mismo) — guardar la env var en Vercel no basta.
//
// El código ya era agnóstico de modo: `STRIPE_SECRET_KEY` puede ser `sk_live_` o
// `sk_test_` y todo funciona igual (el centinela `sk_test_XXXX` significa "sin
// configurar", no "modo test"). Lo que faltaba era impedir la mezcla, que tiene
// dos caras y las dos son caras:
//
//   · CLAVE LIVE FUERA DE PRODUCCIÓN — la peligrosa. Copiar el `.env.local` de
//     producción a una máquina de desarrollo deja el portapapeles cargado: un
//     `npm run dev` y un cobro de prueba mueven dinero REAL de la tarjeta de una
//     socia real. Pasó a punto de pasar montando esto (2026-08-11).
//
//   · CLAVE TEST EN PRODUCCIÓN — la silenciosa. Nada falla: los cobros
//     "funcionan", los recibos se marcan COBRADO y los ingresos del mes suben.
//     Solo que no ha entrado un euro. Se descubre cuadrando con el banco, semanas
//     después.
//
// Por eso esto BLOQUEA en vez de avisar: un log de advertencia en un cron que
// corre a las 8:30 de la mañana no lo lee nadie.
//
// Puro y sin I/O (ver modo-stripe.test.ts).
// ─────────────────────────────────────────────────────────────────────────────

export type ModoStripe = 'live' | 'test' | 'sin-configurar';

/** El centinela de "no hay Stripe puesto" que ya usan los endpoints. */
const SIN_CONFIGURAR = 'sk_test_XXXX';

export function modoDeClave(clave: string | undefined | null): ModoStripe {
  if (!clave || clave.startsWith(SIN_CONFIGURAR)) return 'sin-configurar';
  if (clave.startsWith('sk_live_') || clave.startsWith('rk_live_')) return 'live';
  if (clave.startsWith('sk_test_') || clave.startsWith('rk_test_')) return 'test';
  // Una clave con una forma que no reconocemos NO se asume segura: se trata
  // como sin configurar, que es el camino que no cobra.
  return 'sin-configurar';
}

export type EntornoDespliegue = 'produccion' | 'preview' | 'local';

/**
 * Dónde corre esto. `VERCEL_ENV` es la fuente buena en Vercel ('production' |
 * 'preview' | 'development'); fuera de Vercel (una máquina, un runner de CI)
 * no existe y entonces esto es local.
 */
export function entornoDespliegue(env: NodeJS.ProcessEnv = process.env): EntornoDespliegue {
  if (env.VERCEL_ENV === 'production') return 'produccion';
  if (env.VERCEL_ENV === 'preview') return 'preview';
  return 'local';
}

export interface VeredictoModo {
  modo: ModoStripe;
  entorno: EntornoDespliegue;
  /** false = NO se puede mover dinero con esta combinación. */
  puedeCobrar: boolean;
  /** Qué decir cuando no se puede. `null` si sí se puede. */
  motivo: string | null;
}

/**
 * ¿Pega el modo de la clave con el entorno?
 *
 * Producción exige `live`. Todo lo demás (preview, local, CI) exige `test`.
 * Sin configurar no bloquea: ese caso ya lo cortan los guardias de cada
 * endpoint con su propio mensaje, y duplicarlo aquí solo cambiaría el texto
 * del error.
 *
 * Escotilla `STRIPE_PERMITIR_MODO_CRUZADO=1` para el caso legítimo y raro de
 * depurar producción desde una preview. Va por env a propósito: obliga a
 * ponerla a mano en Vercel, que es justo la fricción que se busca.
 */
export function comprobarModoStripe(env: NodeJS.ProcessEnv = process.env): VeredictoModo {
  const modo = modoDeClave(env.STRIPE_SECRET_KEY);
  const entorno = entornoDespliegue(env);
  const base = { modo, entorno };

  if (modo === 'sin-configurar') return { ...base, puedeCobrar: true, motivo: null };
  if (env.STRIPE_PERMITIR_MODO_CRUZADO === '1') return { ...base, puedeCobrar: true, motivo: null };

  if (entorno === 'produccion' && modo === 'test') {
    return {
      ...base, puedeCobrar: false,
      motivo: 'Producción tiene una clave de Stripe de TEST: los cobros parecerían entrar y no entraría un euro. Pon la clave live en Vercel.',
    };
  }
  if (entorno !== 'produccion' && modo === 'live') {
    return {
      ...base, puedeCobrar: false,
      motivo: `Esto es ${entorno} y la clave de Stripe es LIVE: un cobro aquí movería dinero real de una socia real. Usa una clave sk_test_.`,
    };
  }
  return { ...base, puedeCobrar: true, motivo: null };
}
