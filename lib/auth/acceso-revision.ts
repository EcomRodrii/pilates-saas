// Acceso para la revisión de Apple (App Store, «Sign-in required»).
//
// La app entra con email + código de 6 cifras que llega por correo, y el
// revisor de Apple no puede leer ese correo. Apple exige unas credenciales que
// funcionen, así que hay UNA cuenta de demo que entra con un código FIJO:
//
//   APP_REVIEW_EMAIL      el email exacto de la cuenta de demo
//   APP_REVIEW_CODIGO     su código fijo (6 cifras, que no sea trivial)
//   APP_REVIEW_STUDIO_ID  el estudio donde está su ficha de alumna
//
// Sin las tres variables (o con una mal escrita) esto no existe: `configAccesoRevision`
// devuelve null y el código de la cuenta de demo es el del correo, como el de
// cualquiera. La única puerta es `/api/auth/otp/verificar`, la misma del código
// del correo, y va DESPUÉS de sus límites de intentos (por IP y por email).
//
// Qué garantiza, y dónde:
//   · Solo ese email exacto (minúsculas y espacios aparte) — `esEmailDeRevision`.
//   · El código se compara en tiempo constante — `codigoDeRevisionCoincide`.
//   · Tope DIARIO propio, además de los 6 intentos/15 min por email de la ruta: el
//     código fijo no caduca, así que el tope corto solo no basta. Si el contador
//     no puede contar, el código fijo NO vale (cerrado) — `LIMITE_DIARIO_REVISION`.
//     Y se responde igual que a un código malo (sigue al camino del correo, que lo
//     rechaza): si el código bueno contestara distinto con el tope agotado, el
//     tiempo de respuesta diría cuál es.
//   · No se salta la verificación en dos pasos de nadie: la sesión que emite es
//     una sesión normal de código por correo (`aal1`, amr `otp`), y una cuenta
//     con un factor verificado se rechaza antes de emitir nada. Las guardias de
//     siempre (`verificarUsuarioSupabase`) siguen pidiendo el segundo paso.
//   · Solo una cuenta que es SOLO alumna (`decidirAutoborrado`, el mismo criterio
//     que «Borrar mi cuenta»: ni equipo, ni dueña, ni Tentare, ni Network) y con
//     ficha en EL estudio de la demo (no en cualquiera: otro estudio podría darla
//     de alta con ese email). Si alguien pusiera ahí el email de una propietaria,
//     el código fijo no le abre el panel.
//   · Quien tenga el código no se queda la cuenta: en cada entrada se le pone una
//     contraseña al azar (borra la que hubiera puesto) y se cierran sus demás
//     sesiones — `blindarCuenta`. Retirar la demo tras la revisión: docs/APP-IOS.md.
//   · No crea cuentas: si el email no tiene cuenta, se rechaza.
//   · Rastro: cada entrada y cada rechazo van a Sentry (sin el email ni el código).
//
// Cuando el código fijo coincide pero algo de lo anterior falla, la respuesta al
// cliente es la MISMA que la de un código equivocado: el motivo solo va al log.
//
// Puro (sin `@/` ni I/O): el I/O real lo inyecta lib/auth/acceso-revision-servidor.ts
// y `node --test` lo prueba con dobles.

import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import type { RecuentoVinculos } from '../socios/borrado-cuenta.ts';
import { decidirAutoborrado } from '../cuenta/borrar-cuenta.ts';

export interface ConfigAccesoRevision {
  email: string;
  codigo: string;
  studioId: string;
}

/** Cuántas veces al día se puede probar un código con el email de la demo (bueno o malo). */
export const LIMITE_DIARIO_REVISION = { max: 20, windowSeconds: 86_400 } as const;

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export function normalizarEmail(email: string): string {
  return email.trim().toLowerCase();
}

/**
 * Un código que se adivina a la primera no vale: todos iguales (000000, 111111…)
 * o una escalera (123456, 654321, 012345…).
 */
export function codigoTrivial(codigo: string): boolean {
  if (/^(\d)\1+$/.test(codigo)) return true;
  const d = [...codigo].map(Number);
  const paso = d[1] - d[0];
  return Math.abs(paso) === 1 && d.every((x, i) => i === 0 || x - d[i - 1] === paso);
}

/** La configuración, o null si falta algo o está mal: entonces el acceso de revisión no existe. */
export function configAccesoRevision(env: Record<string, string | undefined>): ConfigAccesoRevision | null {
  const email = normalizarEmail(env.APP_REVIEW_EMAIL ?? '');
  const codigo = (env.APP_REVIEW_CODIGO ?? '').trim();
  const studioId = (env.APP_REVIEW_STUDIO_ID ?? '').trim();
  if (!email || !EMAIL_RE.test(email)) return null;
  if (!/^\d{6}$/.test(codigo) || codigoTrivial(codigo)) return null;
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(studioId)) return null;
  return { email, codigo, studioId };
}

export function esEmailDeRevision(cfg: ConfigAccesoRevision, email: string): boolean {
  return normalizarEmail(email) === cfg.email;
}

// Clave aleatoria por proceso: se comparan los HMAC (misma longitud siempre) y no
// los textos, así `timingSafeEqual` no se salta por longitudes distintas ni deja
// ver por tiempos cuántas cifras coinciden.
const CLAVE_COMPARAR = randomBytes(32);
const huella = (s: string) => createHmac('sha256', CLAVE_COMPARAR).update(s, 'utf8').digest();

export function codigoDeRevisionCoincide(cfg: ConfigAccesoRevision, codigo: string): boolean {
  return timingSafeEqual(huella(codigo), huella(cfg.codigo));
}

export type MotivoRechazoRevision =
  | 'limite_diario'
  | 'sin_cuenta'
  | 'email_distinto'
  | 'cuenta_bloqueada'
  | 'doble_factor'
  | 'no_solo_alumna'
  | 'sin_ficha'
  | 'sin_sesion'
  | 'error';

export type ResultadoRevision =
  /** No es la cuenta de demo, o el código no es el fijo: sigue el camino de siempre (el código del correo). */
  | { tipo: 'no_aplica' }
  /** Era el código fijo de la demo, pero no se puede entrar: misma respuesta que un código equivocado. */
  | { tipo: 'rechazado'; motivo: MotivoRechazoRevision }
  | { tipo: 'ok'; userId: string; session: { access_token: string; refresh_token: string } };

export interface UsuarioRevision {
  id: string;
  email: string | null;
  /** `banned_until` de Auth, si lo tiene. */
  bloqueadoHasta: string | null;
}

/** El I/O, inyectado. Cualquier `throw` acaba en `rechazado: error` (cerrado). */
export interface DepsRevision {
  /** Cuenta un intento con el email de la demo. `contado: false` = el contador no ha podido contar. */
  contarIntento: () => Promise<{ permitido: boolean; contado: boolean }>;
  /** id de la cuenta con ese email, sin crearla. */
  buscarCuenta: (email: string) => Promise<string | null>;
  leerUsuario: (userId: string) => Promise<UsuarioRevision | null>;
  factoresVerificados: (userId: string) => Promise<number>;
  vinculos: (userId: string) => Promise<RecuentoVinculos>;
  /** ¿Tiene ficha de alumna sin borrar en ese estudio (suya o con su email, aún sin vincular)? */
  tieneFicha: (userId: string, email: string, studioId: string) => Promise<boolean>;
  /** Sesión normal de código por correo para ESA cuenta (null si sale de otra o no sale). */
  emitirSesion: (userId: string, email: string) => Promise<{ access_token: string; refresh_token: string } | null>;
  /** Contraseña al azar y cierre de las demás sesiones de la cuenta (la nueva sigue). */
  blindarCuenta: (userId: string, accessToken: string) => Promise<void>;
  /** Rastro (Sentry + log). Nunca recibe el email ni el código. */
  avisar: (evento: 'entrada' | 'rechazo', datos: { motivo?: MotivoRechazoRevision; userId?: string }) => void;
  ahora?: () => Date;
}

export async function intentarAccesoRevision(
  cfg: ConfigAccesoRevision | null,
  email: string,
  codigo: string,
  deps: DepsRevision,
): Promise<ResultadoRevision> {
  if (!cfg || !esEmailDeRevision(cfg, email)) return { tipo: 'no_aplica' };

  // El tope diario cuenta TODOS los intentos con este email, aciertos y fallos.
  let intento: { permitido: boolean; contado: boolean };
  try {
    intento = await deps.contarIntento();
  } catch {
    intento = { permitido: false, contado: false };
  }
  const coincide = codigoDeRevisionCoincide(cfg, codigo);
  if (!intento.permitido || !intento.contado) {
    // Sin poder contar, o agotado: el código fijo deja de valer y se trata como
    // uno cualquiera (el camino del correo lo rechaza; el código del correo vale).
    if (coincide) deps.avisar('rechazo', { motivo: 'limite_diario' });
    return { tipo: 'no_aplica' };
  }
  if (!coincide) return { tipo: 'no_aplica' };

  const rechazar = (motivo: MotivoRechazoRevision, userId?: string): ResultadoRevision => {
    deps.avisar('rechazo', { motivo, userId });
    return { tipo: 'rechazado', motivo };
  };

  let userId: string | undefined;
  try {
    const id = await deps.buscarCuenta(cfg.email);
    if (!id) return rechazar('sin_cuenta');
    userId = id;

    const usuario = await deps.leerUsuario(id);
    if (!usuario) return rechazar('sin_cuenta', id);
    if (!usuario.email || normalizarEmail(usuario.email) !== cfg.email) return rechazar('email_distinto', id);
    const ahora = (deps.ahora ?? (() => new Date()))();
    if (usuario.bloqueadoHasta && new Date(usuario.bloqueadoHasta).getTime() > ahora.getTime()) {
      return rechazar('cuenta_bloqueada', id);
    }

    if ((await deps.factoresVerificados(id)) > 0) return rechazar('doble_factor', id);
    if (!decidirAutoborrado(await deps.vinculos(id)).borrar) return rechazar('no_solo_alumna', id);
    if (!(await deps.tieneFicha(id, cfg.email, cfg.studioId))) return rechazar('sin_ficha', id);

    const session = await deps.emitirSesion(id, cfg.email);
    if (!session?.access_token || !session.refresh_token) return rechazar('sin_sesion', id);
    await deps.blindarCuenta(id, session.access_token);

    deps.avisar('entrada', { userId: id });
    return { tipo: 'ok', userId: id, session };
  } catch {
    return rechazar('error', userId);
  }
}
