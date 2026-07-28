// Reglas de quién puede vincular su cuenta a qué ficha de equipo, sin Supabase
// ni React para que se puedan probar solas (`npm test`). Las aplica
// app/api/equipo/reclamar/route.ts, que corre con service-role y por tanto se
// salta la RLS entera: aquí no hay red de seguridad debajo, esto ES la cerradura.

import { puedeMoverDinero } from '../permisos-reglas.ts';
import type { Rol } from '../types';

// ── Por qué hace falta el enlace firmado, y no basta el email ────────────────
//
// El diseño original vinculaba la ficha cuyo email coincidiera con el de la
// cuenta. Suena inofensivo y no lo es: el alta de estudios es pública y
// gratuita, así que cualquiera puede montar un estudio, crear una ficha de
// INSTRUCTOR con el correo de otra persona y esperar. La próxima vez que esa
// persona entre en Tentare —a SU panel, un día normal— su cuenta queda
// enganchada al estudio del atacante sin haber aceptado nada.
//
// Y no acaba en un enganche inerte: `current_studio_id()` resuelve por
// `instructores ... order by studio_id limit 1` ANTES que por propietaria, y el
// id de estudio es un hash del nombre — o sea, ajustable a fuerza bruta hasta
// que ordene el primero. La víctima aterriza en un panel con la marca del
// atacante y todo lo que teclee ahí cae en su base de datos.
//
// Tampoco lo arreglaba limitar los roles: RECEPCION mueve dinero e INSTRUCTOR ve
// la ficha clínica completa (datos de salud de las socias). No hay ningún rol
// "inofensivo" que repartir a ciegas.
//
// Por eso la vinculación exige el enlace firmado del correo de invitación. El
// consentimiento es el clic: la persona abre un enlace que le han mandado a ella
// y ve de qué estudio se trata antes de entrar. Es el mismo modelo que cualquier
// invitación a un equipo, y es el que no se puede disparar a distancia.
//
// Lo que se pierde a cambio: quien no reciba el correo (o lo borre) necesita que
// se lo reenvíen desde Equipo. Un clic de la dueña, y la pantalla ya lo ofrece.

export type MotivoRechazo =
  | 'ROL_NO_AUTORECLAMABLE'
  | 'ROL_POR_ENCIMA_DE_QUIEN_INVITA'
  | 'FICHA_INACTIVA'
  | 'YA_ES_DE_OTRA_CUENTA';

export interface FichaReclamable {
  rol: Rol;
  activo: boolean | null;
  authUserId: string | null;
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
// niega (0113). O sea: podía fabricarse una ficha de recepción con un segundo
// correo suyo, mandarse la invitación y acabar cobrando. Mientras el self-claim
// estuvo roto eso no era alcanzable; al arreglarlo, lo sería.
//
// Se corta aquí y no tocando el modelo de roles: que un manager dé de alta a su
// recepcionista es razonable y no se cambia por esto. Lo que no puede es
// ACTIVARLE el acceso — eso lo manda la propietaria, que es de quien sale el
// dinero.
//
// `rolEmisor` null = token antiguo, de antes de que se firmara quién invitaba.
// Se trata como "no consta", no como "propietaria": la duda no puede resolverse
// a favor de dar más permisos.
function emisorPuedeDarlo(rolFicha: Rol, rolEmisor: Rol | null): boolean {
  if (!puedeMoverDinero(rolFicha)) return true;
  return rolEmisor !== null && puedeMoverDinero(rolEmisor);
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
export function motivoNoReclamable(
  ficha: FichaReclamable,
  userId: string,
  rolEmisor: Rol | null,
): MotivoRechazo | null {
  if (ficha.authUserId && ficha.authUserId !== userId) return 'YA_ES_DE_OTRA_CUENTA';
  if (ficha.activo === false) return 'FICHA_INACTIVA';
  if (!reclamable(ficha.rol)) return 'ROL_NO_AUTORECLAMABLE';
  if (!emisorPuedeDarlo(ficha.rol, rolEmisor)) return 'ROL_POR_ENCIMA_DE_QUIEN_INVITA';
  return null;
}

export const MENSAJE_RECHAZO: Record<MotivoRechazo, string> = {
  ROL_NO_AUTORECLAMABLE:
    'Este acceso lo tiene que activar la propietaria desde Equipo. Escríbele y te lo da en un momento.',
  ROL_POR_ENCIMA_DE_QUIEN_INVITA:
    'Esta invitación la tiene que enviar la propietaria. Pídeselo y te llegará un enlace nuevo.',
  FICHA_INACTIVA: 'Esta invitación ya no está disponible. Pídele a tu estudio que te la envíe de nuevo.',
  YA_ES_DE_OTRA_CUENTA: 'Esa ficha ya está vinculada a otra cuenta. Pídele a tu estudio que lo revise.',
};
