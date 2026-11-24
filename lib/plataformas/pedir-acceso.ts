// «Pedir acceso» a una plataforma que vende plazas (ClassPass, Wellhub, y la beta
// de Urban Sports Club): el estudio le dice a Tentare que la quiere, y a Tentare
// le llega un correo a soporte con quién, desde qué estudio y a dónde contestar.
//
// Por qué a Tentare y no a la plataforma: ClassPass y Wellhub abren la conexión a
// un software cuando muchos estudios se la piden, y el trámite con ellas lo hace
// Tentare (no el estudio). Contar cuántos la piden es la fuerza que tiene Tentare
// para pedirla. Un correo directo de cada estudio a ClassPass o Wellhub no
// llegaría a quien decide.
//
// Sin alias `@/`: lo leen `node --test` y la ruta del servidor.

import { NOMBRE_PLATAFORMA, esPlataforma, type Plataforma } from './catalogo.ts';

/** A dónde llega la petición. Es la dirección de la empresa, no la de una persona. */
export const CORREO_PETICIONES_PLATAFORMA = 'soporte@tentare.app';

/** Las que todavía no tienen conexión automática: se muestran como «Próximamente». */
export const PLATAFORMAS_PROXIMAMENTE: readonly Plataforma[] = ['CLASSPASS', 'WELLHUB'];

export function esProximamente(p: Plataforma): boolean {
  return (PLATAFORMAS_PROXIMAMENTE as readonly string[]).includes(p);
}

/** Qué pide el estudio: acceso a una conexión que no existe, o entrar en la beta de la que sí. */
export function tipoDePeticion(p: Plataforma): 'ACCESO' | 'BETA' {
  return esProximamente(p) ? 'ACCESO' : 'BETA';
}

export function plataformaDePeticion(v: unknown): Plataforma | null {
  return esPlataforma(v) ? v : null;
}

function limpio(s: string, max: number): string {
  return s.replace(/[\r\n\t]+/g, ' ').trim().slice(0, max);
}

export function asuntoPeticion(p: Plataforma, estudio: string): string {
  const que = tipoDePeticion(p) === 'BETA' ? 'Beta de' : 'Acceso a';
  return `[Plataformas] ${que} ${NOMBRE_PLATAFORMA[p]} · ${limpio(estudio, 80) || 'Estudio'}`;
}

export function textoPeticion(p: Plataforma, d: { estudio: string; estudioId: string; correo: string | null }): string {
  const beta = tipoDePeticion(p) === 'BETA';
  return [
    beta
      ? `Un estudio quiere probar la beta de la conexión con ${NOMBRE_PLATAFORMA[p]}.`
      : `Un estudio pide que Tentare tenga conexión con ${NOMBRE_PLATAFORMA[p]}.`,
    `Estudio: ${limpio(d.estudio, 120) || '—'} (${limpio(d.estudioId, 80)})`,
    `Contesta a: ${d.correo ? limpio(d.correo, 160) : 'sin correo en la cuenta'}`,
    beta
      ? 'Siguiente paso: confirmar si es partner de Urban Sports Club y pasarle los datos de la beta.'
      : 'Siguiente paso: sumarlo a la lista de estudios que la piden y avisarle cuando esté lista.',
  ].join('\n');
}
