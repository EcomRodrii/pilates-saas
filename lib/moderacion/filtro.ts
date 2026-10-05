// Filtro de palabras del chat y del tablón de la app (App Store 1.2: «un método
// para filtrar el material objetable»). Lo aplica el SERVIDOR antes de guardar
// un mensaje de la alumna o de la instructora, o un comentario del tablón: la
// pantalla no decide nada.
//
// Criterio: insultos dirigidos a personas, odio y contenido sexual explícito, y
// amenazas. NO entran tacos de exclamación de uso corriente («joder», «coño»,
// «mierda»): bloquearlos frenaría conversaciones normales entre adultas y no es
// lo que pide la guía. Tampoco palabras con un sentido inocente frecuente en un
// estudio («retrasada»: la clase va retrasada; «perra»; «idiota» dicho de una
// misma). Un falso positivo aquí deja a alguien sin poder escribir: la lista se
// amplía con cuidado, con su caso, y el test que la acompaña.
//
// Se compara por palabra entera tras normalizar (minúsculas, sin tildes, sin
// sustituciones tipo «put0»/«p.u.t.a» ni letras repetidas «puuuta»), así que
// «computadora» o «disputa» no saltan.
//
// Puro, sin `@/`: se prueba con `node --test`.

export const TEXTO_FILTRO =
  'Tu mensaje tiene palabras que no se permiten en la comunidad. Cámbialo y vuelve a enviarlo.';

const PALABRAS = [
  // Insultos a personas
  'puta', 'putas', 'puto', 'putos', 'zorra', 'zorras', 'guarra', 'guarras', 'cabron', 'cabrona', 'cabrones', 'cabronas',
  'gilipollas', 'imbecil', 'imbeciles', 'subnormal', 'subnormales', 'mongolo', 'mongola', 'mongolos', 'mongolas',
  'hijoputa', 'hijaputa', 'hdp', 'malparido', 'malparida', 'capullo', 'capulla', 'pendejo', 'pendeja', 'cerda',
  // Odio
  'maricon', 'maricona', 'maricones', 'marica', 'bollera', 'bolleras', 'sudaca', 'sudacas', 'panchito', 'panchitos',
  'negrata', 'negratas', 'tortillera', 'tortilleras',
  // Sexual explícito
  'follar', 'follarte', 'follamos', 'polla', 'pollas', 'chupamela', 'mamada', 'mamadas', 'porno', 'nudes',
  // Inglés (la app también la usan alumnas que escriben en inglés)
  'fuck', 'fucking', 'fucker', 'bitch', 'bitches', 'whore', 'slut', 'cunt', 'nigger', 'nigga', 'faggot', 'retard',
];

/** Amenazas: frases, no palabras sueltas («matar» a secas es «matar el tiempo»). */
const FRASES = [
  'te voy a matar', 'te mato', 'ojala te mueras', 'muerete', 'te voy a pegar', 'te reviento', 'hijo de puta', 'hija de puta',
  'kill you', 'kill yourself',
];

const CONJUNTO = new Set(PALABRAS);

/** Minúsculas, sin tildes, sin sustituciones de letras y con las repeticiones colapsadas. */
export function normalizarParaFiltro(texto: string): string {
  return texto
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/0/g, 'o').replace(/1/g, 'i').replace(/3/g, 'e').replace(/4/g, 'a').replace(/5/g, 's')
    .replace(/@/g, 'a').replace(/\$/g, 's')
    // «p.u.t.a», «p u t a», «p-u-t-a»: letras sueltas separadas se juntan.
    .replace(/\b(?:[a-zñ][\s.\-_*]){2,}[a-zñ]\b/g, (m) => m.replace(/[\s.\-_*]/g, ''))
    // «puuuuta» → «puta» (tres o más iguales seguidas; «ll» y «rr» se quedan).
    .replace(/([a-zñ])\1{2,}/g, '$1')
    .replace(/[^a-zñ\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Las palabras o frases no permitidas que lleva el texto (vacío = se puede publicar). */
export function palabrasNoPermitidas(texto: string): string[] {
  const limpio = normalizarParaFiltro(texto);
  if (!limpio) return [];
  const halladas = new Set<string>();
  for (const palabra of limpio.split(' ')) if (CONJUNTO.has(palabra)) halladas.add(palabra);
  const conBordes = ` ${limpio} `;
  for (const frase of FRASES) if (conBordes.includes(` ${frase} `)) halladas.add(frase);
  return [...halladas];
}

export function pasaElFiltro(texto: string): boolean {
  return palabrasNoPermitidas(texto).length === 0;
}
