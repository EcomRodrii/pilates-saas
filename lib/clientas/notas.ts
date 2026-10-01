// Las NOTAS del equipo sobre una clienta: quién las ve, quién las cambia, y
// cómo se llama quien las escribió. Es el espejo de la RLS de `notas_internas`
// (migr …_notas_internas_autora_y_visibilidad): la base de datos ya no devuelve
// lo que no toca, y esto decide lo que la pantalla OFRECE (no enseñar «Editar»
// a quien la política se lo va a rechazar).
//
// Puro: se prueba con `node --test`.

import type { Rol } from '../types.ts';

export type VisibilidadNota = 'EQUIPO' | 'PRIVADA';

export interface NotaParaPermisos {
  autorUid: string | null;
  visibilidad: VisibilidadNota;
}

const GESTIONAN = new Set<Rol>(['PROPIETARIO', 'MANAGER', 'RECEPCION']);

/** La de equipo la ve el mostrador entero; la privada, su autora y la propietaria. */
export function notaVisiblePara(nota: NotaParaPermisos, rol: Rol, uid: string | null): boolean {
  if (!GESTIONAN.has(rol)) return false;
  return nota.visibilidad === 'EQUIPO' || (!!uid && nota.autorUid === uid) || rol === 'PROPIETARIO';
}

/** Cambiar el texto, para quién es o fijarla: la autora (las antiguas sin autora, la propietaria). */
export function puedeEditarNota(nota: NotaParaPermisos, rol: Rol, uid: string | null): boolean {
  if (!GESTIONAN.has(rol)) return false;
  return (!!uid && nota.autorUid === uid) || (nota.autorUid === null && rol === 'PROPIETARIO');
}

/** Borrarla: la autora o la propietaria. */
export function puedeBorrarNota(nota: NotaParaPermisos, rol: Rol, uid: string | null): boolean {
  if (!GESTIONAN.has(rol)) return false;
  return (!!uid && nota.autorUid === uid) || rol === 'PROPIETARIO';
}

const ROL_EN_PALABRAS: Record<Rol, string> = {
  PROPIETARIO: 'propietaria',
  MANAGER: 'gerencia',
  RECEPCION: 'recepción',
  INSTRUCTOR: 'instructora',
};

/**
 * «Ana · recepción», «Tú», o null si no se sabe (las notas antiguas no
 * guardaban autora: no se inventa ninguna). Una cuenta que ya no está en el
 * equipo sale como «Alguien que ya no está en el equipo».
 */
export function nombreAutora(
  autorUid: string | null,
  ctx: { uid: string | null; ownerUid: string | null; equipo: readonly { authUserId: string | null; nombre: string; rol: Rol }[] },
): string | null {
  if (!autorUid) return null;
  if (ctx.uid && autorUid === ctx.uid) return 'Tú';
  const ficha = ctx.equipo.find(p => p.authUserId === autorUid);
  if (ficha) return `${ficha.nombre.split(' ')[0]} · ${ROL_EN_PALABRAS[autorUid === ctx.ownerUid ? 'PROPIETARIO' : ficha.rol]}`;
  if (ctx.ownerUid && autorUid === ctx.ownerUid) return 'La propietaria';
  return 'Alguien que ya no está en el equipo';
}

/** Para quién es, en palabras de quien la escribe. Sin mentir: la propietaria también lee las privadas. */
export function textoVisibilidad(v: VisibilidadNota, rol: Rol): string {
  if (v === 'EQUIPO') return 'Todo el equipo';
  return rol === 'PROPIETARIO' ? 'Solo propietarias' : 'Solo tú y la propietaria';
}
