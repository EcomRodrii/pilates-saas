// ¿A la sesión de la alumna (o de la instructora en la app del estudio) le
// falta el segundo paso de la verificación en dos pasos? Lo mira la app al
// arrancar, antes de pedir sus datos, para mandarla a `/acceso/dos-pasos`.
//
// Es una guardia de USABILIDAD: la cerradura está en el servidor
// (`verificarUsuarioSupabase` → `pasoDeLaSesion`, lib/auth-server.ts), que sin
// el segundo paso no da ni un dato. Esto solo evita que la app pinte vacía.
//
// ⚠️ Quien NO la tiene activada no paga nada: el nivel y los factores salen de
// la sesión guardada en el dispositivo (`getAuthenticatorAssuranceLevel` no va
// a la red), y solo se pregunta al servidor si hay factor y falta el paso.
import { supabasePortal } from '@/lib/db/supabase-portal';
import { confiarDispositivo } from '@/lib/auth/doble-factor-acciones';
import { sesionDelToken } from '@/lib/auth/dispositivo-confianza-reglas';
import { factoresVerificados } from '@/lib/auth/doble-factor-reglas';
import { decidirPasoPortal, type PasoPortal } from './doble-factor-portal-reglas.ts';

export type { PasoPortal } from './doble-factor-portal-reglas.ts';

/**
 * Sesiones que ya contaron como verificadas en esta carga de la app: la guardia
 * monta en cada pantalla y no hace falta preguntar otra vez por cada una.
 */
const yaConfiadas = new Set<string>();

/**
 * `mismoOrigen`: `false` en el widget que el estudio incrusta en su web. Allí
 * la cookie del dispositivo recordado no viaja (es de otro sitio), así que ni
 * se pregunta: con el factor activado, el widget pide el código de la app.
 */
export async function pasoDelPortal(token: string, mismoOrigen = true): Promise<PasoPortal> {
  let nivel: { actual: string | null; siguiente: string | null };
  try {
    const [{ data }, { data: { session } }] = await Promise.all([
      supabasePortal.auth.mfa.getAuthenticatorAssuranceLevel(), supabasePortal.auth.getSession(),
    ]);
    // `nextLevel` lo pone cualquier factor, también el de la zona interna de
    // Tentare, que aquí no cuenta (lib/auth/doble-factor-reglas.ts).
    const deCuenta = factoresVerificados(session?.user.factors) > 0;
    nivel = { actual: data?.currentLevel ?? null, siguiente: deCuenta ? data?.nextLevel ?? null : null };
  } catch {
    // Sin poder leerlo, que decida el servidor (contestará `doble_factor_requerido`).
    return 'ok';
  }
  const sesion = sesionDelToken(token);
  const previa = decidirPasoPortal({ ...nivel, yaConfiada: !!sesion && yaConfiadas.has(sesion) });
  if (previa !== 'preguntar') return previa;
  if (!mismoOrigen) return 'dos-pasos';
  // Varias piezas de la app montan la sesión a la vez (guardia, cabecera, QR…):
  // una sola pregunta por token, y las demás esperan esa misma respuesta.
  const enVuelo = preguntando.get(token);
  if (enVuelo) return enVuelo;
  const pregunta = confiarDispositivo(token).then((confianza): PasoPortal => {
    if (confianza === 'no') return 'dos-pasos';
    if (sesion) yaConfiadas.add(sesion);
    return 'ok';
  }).finally(() => { preguntando.delete(token); });
  preguntando.set(token, pregunta);
  return pregunta;
}

const preguntando = new Map<string, Promise<PasoPortal>>();

/** Tras verificar o cerrar sesión: que la próxima vez se vuelva a mirar. */
export function olvidarConfianzaPortal(): void {
  yaConfiadas.clear();
}
