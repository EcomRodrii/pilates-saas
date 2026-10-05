// Reglas puras de los comentarios del tablón (App Store 1.2 y RGPD). Sin `@/`:
// se prueban con `node --test`.

import { nombresParaLista } from '../student/agenda-instructora.ts';

/**
 * ¿Es una publicación para un grupo (no para «Todas»)? En ellas cada alumna ve
 * solo sus comentarios y los del estudio: los demás dirían quién más está en el
 * grupo (por ejemplo, «embarazadas» o «con bono sin renovar»).
 */
export function esPublicacionDeGrupo(audiencia: string | null | undefined): boolean {
  return Boolean(audiencia) && audiencia !== 'TODAS';
}

/**
 * Con qué nombre sale una alumna en el tablón: nombre e inicial del primer
 * apellido («Lucía M.»), lo mismo que ve su instructora en la lista de clase.
 * Lo mínimo: las compañeras no necesitan sus apellidos. La migración
 * `20261005150500_comentarios_nombre_corto` recorta con la MISMA regla lo que ya
 * estaba guardado; un test cruza las dos.
 */
export function nombreEnElTablon(p: { nombre: string | null; apellidos: string | null }): { nombre: string; inicial: string } {
  const [nombre] = nombresParaLista([p]);
  const limpio = nombre === 'Sin nombre' ? 'Clienta' : nombre;
  // La del avatar: la del nombre y la del primer apellido («LM»), como la migración.
  const primera = (p.nombre ?? '').trim().charAt(0);
  const deApellido = ((p.apellidos ?? '').trim().split(/\s+/)[0] ?? '').charAt(0);
  const inicial = (primera + deApellido).toUpperCase() || 'C';
  return { nombre: limpio, inicial };
}

export function esSuyo(c: { socio_id: string | null; autor_id: string | null }, yo: { socioId: string; authUserId: string }): boolean {
  return c.autor_id === yo.authUserId || (c.socio_id != null && c.socio_id === yo.socioId);
}

/**
 * Qué comentarios ve una socia de una publicación:
 * · lo retirado por el estudio, solo quien lo escribió;
 * · nada de alguien con quien hay un bloqueo;
 * · en una publicación para un grupo (audiencia distinta de «Todas»), solo los
 *   suyos y los del estudio: quién más ha comentado diría quién más está en ese
 *   grupo (QA, 5-oct-2026; en vez de prohibir comentar en ellas).
 */
export function filtrarComentariosParaSocia<T extends { socio_id: string | null; autor_id: string | null; oculto_en: string | null }>(
  filas: readonly T[],
  p: { socioId: string; authUserId: string; audiencia: string | null; bloqueadas: ReadonlySet<string> },
): (T & { esMio: boolean })[] {
  const deGrupo = esPublicacionDeGrupo(p.audiencia);
  return filas
    .map((f) => ({ ...f, esMio: esSuyo(f, p) }))
    .filter((f) => !f.oculto_en || f.esMio)
    .filter((f) => f.esMio || !f.socio_id || !p.bloqueadas.has(f.socio_id))
    .filter((f) => !deGrupo || f.esMio || !f.socio_id);
}

