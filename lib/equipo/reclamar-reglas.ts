// Reglas de quién puede vincular su cuenta a qué ficha de equipo, sin Supabase
// ni React para que se puedan probar solas (`npm test`). Las aplica
// app/api/equipo/reclamar/route.ts, que corre con service-role y por tanto se
// salta la RLS entera: aquí no hay red de seguridad debajo, esto ES la cerradura.

import { puedeActivarAccesoDelRol, puedeMoverDinero } from '../permisos-reglas.ts';
import type { Rol } from '../types';

// ── Por qué hace falta el enlace firmado, y no basta el email ────────────────
//
// El diseño original vinculaba la ficha cuyo email coincidiera con el de la
// cuenta. No basta: el alta de estudios es pública, y una ficha la crea el
// estudio, no la persona. Una cuenta no se une a un estudio sin haberlo
// aceptado, y ningún rol es «inofensivo» para repartirlo a ciegas: RECEPCION
// mueve dinero e INSTRUCTOR ve datos de salud de las socias.
//
// Por eso la vinculación exige el enlace firmado del correo de invitación. El
// consentimiento es el clic: la persona abre un enlace que le han mandado a ella
// y ve de qué estudio se trata antes de entrar. Es el mismo modelo que cualquier
// invitación a un equipo, y es el que no se puede disparar a distancia.
//
// Lo que se pierde a cambio: quien no reciba el correo (o lo borre) necesita que
// se lo reenvíen desde Equipo. Un clic de la dueña, y la pantalla ya lo ofrece.
//
// ── Y además, el correo de la ficha (13-oct-2026, decisión del fundador) ─────
//
// Hasta aquí el enlace valía con CUALQUIER cuenta («crea tu cuenta con este
// correo o con otro»). Ahora hacen falta las dos cosas: el enlace Y una cuenta
// con el correo VERIFICADO de la ficha. No reabre lo de arriba (el correo solo
// nunca basta) y se midió antes de decidirlo: ninguna cuenta vinculada usaba un
// correo distinto al de su ficha. Quien quiera entrar con otro correo pide al
// estudio que lo cambie en su ficha y le reenvíe la invitación.
//
// Y el enlace lleva firmado el ROL que tenía la ficha al invitar: si cambia, hay
// que reenviarlo (ENLACE_DESFASADO). El permiso de quien invita vale para el rol
// que eligió al invitar, no para otro.
//
// ── La segunda puerta: «Entrar como instructora» (15-sep-2026) ───────────────
//
// Decisión del fundador: quien entra en la app de un estudio con un correo que
// ese estudio tiene dado de alta como instructora elige entrar como instructora
// o como alumna (`/api/portal/instructora/unirse`). NO reabre lo de arriba: nada
// se une solo al entrar. Hace falta lo mismo que daba el enlace —correo
// verificado y un clic dentro de la app de ESE estudio, con su nombre delante—,
// y solo vale para fichas de rol INSTRUCTOR. El resto de roles sigue exigiendo
// el enlace firmado.

export type MotivoRechazo =
  | 'ROL_NO_AUTORECLAMABLE'
  | 'ROL_POR_ENCIMA_DE_QUIEN_INVITA'
  | 'FICHA_INACTIVA'
  | 'YA_ES_DE_OTRA_CUENTA'
  | 'ENLACE_DESFASADO'
  | 'CORREO_NO_COINCIDE'
  | 'CORREO_SIN_CONFIRMAR';

export interface FichaReclamable {
  rol: Rol;
  activo: boolean | null;
  authUserId: string | null;
  email: string | null;
}

/** Lo que trae quien canjea el enlace: el rol firmado en él y la cuenta con la que entra. */
export interface EnlaceQueReclama {
  /** El rol de la ficha cuando se firmó. `null` en los firmados antes del 13-oct-2026 (caducan como tarde el 20-oct). */
  rolFirmado: Rol | null;
  cuenta: { email: string | null; emailConfirmado: boolean };
}

const ROLES: readonly Rol[] = ['PROPIETARIO', 'MANAGER', 'RECEPCION', 'INSTRUCTOR'];

/** Un rol leído del enlace firmado (`ref`, `rolFicha`); lo que no sea un rol conocido, `null`. */
export function rolDelEnlace(valor: string | null): Rol | null {
  return ROLES.includes(valor as Rol) ? (valor as Rol) : null;
}

/** El mismo correo, sin mayúsculas ni espacios alrededor. Vacío nunca coincide. */
export function mismoCorreo(a: string | null | undefined, b: string | null | undefined): boolean {
  const x = (a ?? '').trim().toLowerCase();
  const y = (b ?? '').trim().toLowerCase();
  return x.length > 0 && x === y;
}

// Una ficha de PROPIETARIO sin reclamar es una credencial al portador sobre el
// negocio entero, y un correo se reenvía. Para eso está el traspaso deliberado.
function reclamable(rol: Rol): boolean {
  return rol !== 'PROPIETARIO';
}

// Nadie reparte poderes que no tiene.
//
// `/api/equipo/invitar` ya impide que un MANAGER invite por encima de su rol,
// pero su listón es `rolesQuePuedeAsignar`, que le deja crear fichas de
// RECEPCION — y RECEPCION mueve dinero, que es justo lo que a un MANAGER se le
// niega (0113). Por eso el enlace lleva firmado quién invita.
//
// Se corta aquí y no tocando el modelo de roles: que un manager dé de alta a su
// recepcionista es razonable y no se cambia por esto. Lo que no puede es
// ACTIVARLE el acceso — eso lo manda la propietaria, que es de quien sale el
// dinero.
//
// `rolEmisor` null = token antiguo, de antes de que se firmara quién invitaba.
// Se trata como "no consta", no como "propietaria": la duda no puede resolverse
// a favor de dar más permisos.
//
// La regla en sí (`puedeActivarAccesoDelRol`) vive en permisos-reglas.ts porque
// no es solo de este enlace: el alta entre sedes y el cambio de rol sobre una
// ficha con cuenta la aplican también, y una copia por sitio es como se abren
// huecos.
function emisorPuedeDarlo(rolFicha: Rol, rolEmisor: Rol | null): boolean {
  if (rolEmisor === null) return !puedeMoverDinero(rolFicha);
  return puedeActivarAccesoDelRol(rolEmisor, rolFicha);
}

// Devuelve null si se puede vincular, o el motivo por el que no.
//
// `activo === null` cuenta como activa: solo una baja EXPLÍCITA cierra la
// puerta. Un nulo accidental no debe dejar fuera a nadie (mismo criterio que el
// `coalesce(activo, true)` de la 0130).
//
// Si la ficha ya es de esta misma cuenta no es un rechazo: es que ya estaba
// hecho. El endpoint puede llamarse más de una vez con el mismo enlace, así que
// tiene que poder repetirse sin efecto y sin ruido.
//
// El correo se compara con el de la ficha AHORA, no con el del día de la
// invitación: si el estudio corrige una dirección mal tecleada, el enlace que
// fue a la equivocada deja de servir a quien la tenga.
export function motivoNoReclamable(
  ficha: FichaReclamable,
  userId: string,
  rolEmisor: Rol | null,
  enlace: EnlaceQueReclama,
): MotivoRechazo | null {
  if (ficha.authUserId === userId) return null;
  // La cuenta, antes que nada de la ficha: a quien entra con otra cuenta no se
  // le cuenta en qué estado está (de baja, ya vinculada, otro rol…). Y «sin
  // confirmar» antes que «otro correo», para que no sirva de prueba de correos.
  if (!enlace.cuenta.emailConfirmado) return 'CORREO_SIN_CONFIRMAR';
  if (!mismoCorreo(ficha.email, enlace.cuenta.email)) return 'CORREO_NO_COINCIDE';
  if (ficha.authUserId) return 'YA_ES_DE_OTRA_CUENTA';
  if (ficha.activo === false) return 'FICHA_INACTIVA';
  if (!reclamable(ficha.rol)) return 'ROL_NO_AUTORECLAMABLE';
  if (enlace.rolFirmado !== null && enlace.rolFirmado !== ficha.rol) return 'ENLACE_DESFASADO';
  if (!emisorPuedeDarlo(ficha.rol, rolEmisor)) return 'ROL_POR_ENCIMA_DE_QUIEN_INVITA';
  return null;
}

/** El código HTTP de cada rechazo: lo que ya no existe es 404, lo que choca con el estado actual de la ficha, 409. */
export function estadoHttpDelRechazo(motivo: MotivoRechazo): 403 | 404 | 409 {
  if (motivo === 'FICHA_INACTIVA') return 404;
  if (motivo === 'CORREO_SIN_CONFIRMAR') return 403;
  return 409;
}

export const MENSAJE_RECHAZO: Record<MotivoRechazo, string> = {
  ROL_NO_AUTORECLAMABLE:
    'Este acceso lo tiene que activar la propietaria desde Equipo. Escríbele y te lo da en un momento.',
  ROL_POR_ENCIMA_DE_QUIEN_INVITA:
    'Esta invitación la tiene que enviar la propietaria. Pídeselo y te llegará un enlace nuevo.',
  FICHA_INACTIVA: 'Esta invitación ya no está disponible. Pídele a tu estudio que te la envíe de nuevo.',
  YA_ES_DE_OTRA_CUENTA: 'Esa ficha ya está vinculada a otra cuenta. Pídele a tu estudio que lo revise.',
  ENLACE_DESFASADO:
    'Tu estudio ha cambiado tu acceso desde que te mandó esta invitación. Pídele que te la envíe de nuevo.',
  CORREO_NO_COINCIDE:
    'Esta invitación es para otro correo. Entra con el correo en el que la has recibido, o pídele a tu estudio que cambie el de tu ficha y te la envíe de nuevo.',
  CORREO_SIN_CONFIRMAR: 'Antes tienes que confirmar tu correo con el código que te hemos enviado.',
};
