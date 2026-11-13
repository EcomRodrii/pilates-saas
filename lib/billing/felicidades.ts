// El momento en que un estudio gratis pasa de 150 reservas al mes: no es un cobro, es una
// buena noticia, y se le dice así (decisión del fundador, 4-nov-2026) con una frase bonita y, justo debajo, el plan
// de pago listo para contratar en un clic.
//
// Puro, sin `@/`: se prueba con `node --test`.

/** Frases para ese momento. Cada una dice la verdad y no promete nada que el producto no haga. */
export const FRASES_FELICIDADES: readonly string[] = [
  'Detrás de cada clase llena hay alguien que decidió volver. Hoy son muchas, y eso lo has construido tú.',
  'Un estudio no crece por casualidad: crece porque cuidas a quienes entran por la puerta. Gracias por hacerlo tan bien.',
  'Hace no tanto era tu primera clase. Mira lo que has levantado: personas que organizan su semana alrededor de la tuya.',
  'Crecer así es el mejor resumen de tu trabajo: la gente vuelve, y trae a otras. Seguimos a tu lado.',
];

/** Un hash pequeño y estable: la misma clave da siempre la misma frase (no cambia al recargar). */
function hashEstable(clave: string): number {
  let h = 0;
  for (let i = 0; i < clave.length; i++) h = (h * 31 + clave.charCodeAt(i)) >>> 0;
  return h;
}

export function fraseDeFelicidades(clave: string): string {
  return FRASES_FELICIDADES[hashEstable(clave) % FRASES_FELICIDADES.length];
}

/** La marca que dice «esta felicitación ya se vio»: una por cada vez que se pasa (por la fecha de cierre del margen). */
export const claveFelicidadesVista = (cierraEl: string) => `tentare:felicidades-crecimiento:${cierraEl}`;

/**
 * ¿Toca felicitar? Solo a la propietaria, solo mientras corre el margen (`MARGEN`: ya se pasó y aún no se cierra nada)
 * y solo si no la ha visto ya. Con el margen acabado (`CERRADO`) el panel ya manda a elegir plan: ahí no se felicita.
 */
export function tocaFelicitar(e: { fase: string; esPropietaria: boolean; cierraEl: string | null; yaVista: boolean }): boolean {
  return e.fase === 'MARGEN' && e.esPropietaria && !!e.cierraEl && !e.yaVista;
}
