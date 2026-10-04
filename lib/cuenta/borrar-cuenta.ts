// «Borrar mi cuenta de Tentare» desde la app de la alumna (App Store 5.1.1(v):
// quien tiene cuenta tiene que poder borrarla desde la propia app).
//
// No es la supresión RGPD (lib/student/derechos.ts → `solicitudes_derechos`), que
// la decide y la ejecuta el ESTUDIO sobre su ficha. Esto borra solo la cuenta de
// acceso (auth.users), al momento: las fichas de los estudios se quedan, sin
// cuenta detrás, con lo que la ley les obliga a guardar (facturas, pagos).
//
// ¿Quién puede borrarse por aquí? Quien solo es ALUMNA. Los vínculos son los
// mismos que ya mira la supresión (`VINCULOS_CUENTA`, lib/socios/borrado-cuenta.ts)
// con una diferencia: aquí las fichas de socia NO frenan, porque desvincularlas
// es justo lo que se pide. Todo lo demás frena, cada cosa con su salida:
//   · dueña de un estudio o de una cadena → hay que decidir qué pasa con el
//     estudio (y `cadenas.owner_auth_user_id` es NO ACTION: el borrado fallaría).
//   · equipo de algún estudio → el estudio la elimina del equipo (Equipo →
//     Eliminar), y entonces sí puede borrarse aquí. Borrarla por aquí dejaría su
//     ficha de equipo sin cuenta (FK SET NULL) sin que el estudio lo sepa.
//   · acceso a la plataforma o actividad de Network → con nosotros: son FK NO
//     ACTION (fallaría con 23503) o datos que no se deben llevar en silencio.
//
// ⚠️ Fail-closed, como `decidirBorradoCuenta`: un recuento que no se pudo hacer
// (o que falta) no da vía libre.
//
// Puro, sin I/O ni `@/`: se prueba con `node --test`.

import { VINCULOS_CUENTA, type RecuentoVinculos } from '../socios/borrado-cuenta.ts';

/** Lo que la alumna escribe para confirmar. Lo comprueban la hoja Y el servidor. */
export const PALABRA_BORRAR_CUENTA = 'BORRAR';

/** Tolerante con mayúsculas y espacios (el móvil pone la mayúscula o no), estricta con la palabra. */
export function confirmaBorrarCuenta(texto: unknown): boolean {
  if (typeof texto !== 'string' || texto.length > 50) return false;
  return texto.trim().toUpperCase() === PALABRA_BORRAR_CUENTA;
}

/** El vínculo que SÍ se deshace al borrar: sus fichas de alumna. */
export const VINCULO_DESVINCULABLE = 'otras_fichas_socia';

export type MotivoNoBorrable = 'propietaria' | 'equipo' | 'plataforma' | 'network';

export type DecisionAutoborrado =
  | { borrar: true }
  | { borrar: false; motivo: MotivoNoBorrable; vinculos: string[] }
  | { borrar: false; motivo: 'no_verificable'; sinComprobar: string[] };

const MOTIVO_DE: Record<string, MotivoNoBorrable> = {
  duena_estudio: 'propietaria',
  duena_cadena: 'propietaria',
  instructora: 'equipo',
  admin_plataforma: 'plataforma',
  permiso_plataforma: 'plataforma',
};

// Si tiene varias cosas, manda la que más hay que resolver antes.
const PRIORIDAD: readonly MotivoNoBorrable[] = ['propietaria', 'plataforma', 'equipo', 'network'];

const motivoDe = (clave: string): MotivoNoBorrable => MOTIVO_DE[clave] ?? 'network';

export function decidirAutoborrado(recuento: RecuentoVinculos): DecisionAutoborrado {
  const aMirar = VINCULOS_CUENTA.filter((v) => v.clave !== VINCULO_DESVINCULABLE);
  const sinComprobar = aMirar
    .filter((v) => typeof recuento[v.clave] !== 'number' || !Number.isFinite(recuento[v.clave]))
    .map((v) => v.clave);
  if (sinComprobar.length > 0) return { borrar: false, motivo: 'no_verificable', sinComprobar };

  const vinculos = aMirar.filter((v) => (recuento[v.clave] as number) > 0).map((v) => v.clave);
  if (vinculos.length === 0) return { borrar: true };
  const motivos = new Set(vinculos.map(motivoDe));
  const motivo = PRIORIDAD.find((m) => motivos.has(m)) as MotivoNoBorrable;
  return { borrar: false, motivo, vinculos };
}

const CORREO = 'hola@tentare.app';

/** Qué le decimos, y qué puede hacer. Sin ids ni nombres: le basta con saber el porqué. */
export const MENSAJE_NO_BORRABLE: Record<MotivoNoBorrable | 'no_verificable', string> = {
  propietaria: `Esta cuenta es la dueña de un estudio en Tentare, así que no se puede borrar desde aquí: antes hay que decidir qué pasa con el estudio. Escríbenos a ${CORREO} y lo hacemos contigo.`,
  equipo: 'Esta cuenta también es del equipo de un estudio. Pide al estudio que te elimine del equipo y después podrás borrarla desde aquí.',
  plataforma: `Esta cuenta tiene acceso de administración de Tentare y no se puede borrar desde aquí. Escríbenos a ${CORREO}.`,
  network: `Esta cuenta tiene actividad en Tentare Network y no se puede borrar desde aquí. Escríbenos a ${CORREO} y la borramos contigo.`,
  no_verificable: 'No hemos podido comprobar tu cuenta. No se ha borrado nada: inténtalo de nuevo en unos minutos.',
};
