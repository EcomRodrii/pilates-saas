// ─────────────────────────────────────────────────────────────────────────────
// Panel interno — quién puede tocar el acceso de quién.
//
// Esta es la pantalla que decide quién decide, así que las reglas van aquí,
// puras y probadas, y no repartidas por dentro de un handler. La UI las usa
// para pintar en gris lo que no se puede hacer; la API las vuelve a aplicar,
// porque la UI nunca es el límite de seguridad (`lib/permisos-reglas.ts`).
//
// Las cuatro reglas y por qué existe cada una:
//
//   1. Nadie se edita a sí mismo. Cierra las dos puertas a la vez: ascenderte
//      solo, y dejarte fuera sin querer. Si de verdad hace falta cambiarte los
//      permisos, te lo hace otra persona y queda en el registro.
//   2. Solo se concede lo que uno tiene. Con `users.create` a secas no se
//      fabrica un `admin.full`: sería una escalada de privilegios en un clic.
//   3. `PERMISOS_SOLO_CEO` no se delegan ni teniéndolos. Borrar un estudio
//      destruye los datos de las clientas de otra persona, y `users.delete` /
//      `admin.full` permiten reescribir quién manda. Se conceden a mano y
//      queda registrado.
//   4. Nunca se queda la plataforma sin ningún `admin.full` activo. Sin eso,
//      un despiste deja el backoffice sin nadie que pueda arreglarlo, y no hay
//      pantalla desde la que salir del agujero — solo SQL a mano.
// ─────────────────────────────────────────────────────────────────────────────
import { PERMISOS_SOLO_CEO, tienePermiso, type Permiso } from './permisos.ts';

export interface ActorInterno {
  userId: string;
  permisos: readonly string[];
}

export interface MiembroInterno {
  userId: string;
  nombre: string;
  activo: boolean;
  permisos: readonly string[];
}

/** `ok: false` trae SIEMPRE el motivo, para enseñarlo tal cual. */
export type Veredicto = { ok: true } | { ok: false; motivo: string };

const OK: Veredicto = { ok: true };
const no = (motivo: string): Veredicto => ({ ok: false, motivo });

/** Regla 1. Se comprueba por `userId`, no por email: el email se puede cambiar. */
export function puedeTocarA(actor: ActorInterno, objetivoUserId: string): Veredicto {
  if (actor.userId === objetivoUserId) {
    return no('No puedes cambiar tu propio acceso. Que te lo cambie otra persona del equipo.');
  }
  return OK;
}

/** Reglas 2 y 3, sobre el conjunto de permisos que se quiere dejar concedido. */
export function puedeConceder(actor: ActorInterno, permisos: readonly Permiso[]): Veredicto {
  const esCeo = actor.permisos.includes('admin.full');

  for (const p of permisos) {
    if (!tienePermiso(actor.permisos, p)) {
      return no(`No puedes conceder "${p}" porque tú no lo tienes.`);
    }
    if (PERMISOS_SOLO_CEO.includes(p) && !esCeo) {
      return no(`"${p}" no se delega: solo lo concede quien tiene acceso total.`);
    }
  }
  return OK;
}

/**
 * Regla 4. `equipo` es el equipo COMPLETO tal y como está ahora, antes del
 * cambio; `despues` es cómo quedaría la persona afectada.
 *
 * Se cuenta sobre el estado resultante en vez de comprobar casos sueltos
 * ("¿es el último?"), porque los caminos que dejan sin CEO son varios —
 * desactivar, quitar el permiso, y cualquier combinación— y enumerarlos a mano
 * es como se escapa uno.
 */
export function quedaAlgunCeo(
  equipo: readonly MiembroInterno[],
  objetivoUserId: string,
  despues: { activo: boolean; permisos: readonly string[] },
): Veredicto {
  const resultante = equipo.map(m =>
    m.userId === objetivoUserId ? { ...m, activo: despues.activo, permisos: despues.permisos } : m,
  );
  const ceos = resultante.filter(m => m.activo && m.permisos.includes('admin.full'));
  if (ceos.length === 0) {
    return no('Esto dejaría la plataforma sin nadie con acceso total. Dáselo antes a otra persona.');
  }
  return OK;
}

/** Las cuatro reglas de una vez, para un cambio de permisos o de estado. */
export function puedeGuardarCambio(
  actor: ActorInterno,
  equipo: readonly MiembroInterno[],
  objetivoUserId: string,
  despues: { activo: boolean; permisos: readonly Permiso[] },
): Veredicto {
  const propio = puedeTocarA(actor, objetivoUserId);
  if (!propio.ok) return propio;

  const existe = equipo.some(m => m.userId === objetivoUserId);
  if (!existe) return no('Esa persona no está en el equipo interno.');

  // Solo se validan los permisos que se AÑADEN. Quitarle a alguien un permiso
  // que uno no tiene es legítimo: reducir acceso nunca es una escalada, y si no
  // fuera así nadie podría limpiar los permisos de un CEO saliente.
  const antes = equipo.find(m => m.userId === objetivoUserId)!.permisos;
  const nuevos = despues.permisos.filter(p => !antes.includes(p));
  const concesion = puedeConceder(actor, nuevos);
  if (!concesion.ok) return concesion;

  return quedaAlgunCeo(equipo, objetivoUserId, despues);
}

/** Alta de alguien nuevo. No hay regla 4 que comprobar: sumar no deja sin CEO. */
export function puedeDarDeAlta(actor: ActorInterno, permisos: readonly Permiso[]): Veredicto {
  return puedeConceder(actor, permisos);
}
