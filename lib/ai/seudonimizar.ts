// ─────────────────────────────────────────────────────────────────────────────
// Quitar nombres de un texto ANTES de mandarlo a la IA, y ponerlos de vuelta en
// lo que contesta (contrato de encargo, decisión del fundador 2-oct-2026).
//
// La nota de sesión dictada es dato de salud y la instructora suele nombrar a
// la alumna («Ana ha venido con la rodilla mejor…»). La IA no necesita saber
// quién es para ordenar la nota: necesita saber que es la misma persona. Así
// que cada palabra del nombre y los apellidos de la alumna y del equipo del
// estudio se cambia por una marca (`[ALUMNA_1]`, `[EQUIPO2_1]`), igual los
// correos y teléfonos (`[EMAIL_1]`, `[TELEFONO_1]`), y al volver se deshace.
//
// ⚠️ Lo que NO atrapa: una tercera persona nombrada de pasada que no sea del
// equipo («igual que su hermana Lucía»). Es el límite aceptado; el texto
// sigue saliendo como dato de salud bajo el contrato con Anthropic.
//
// Puro, para probarlo con node --test.
// ─────────────────────────────────────────────────────────────────────────────

export interface PersonaASeudonimizar {
  /** Prefijo de sus marcas: `ALUMNA`, `EQUIPO1`… Solo mayúsculas y cifras. */
  marca: string;
  nombre: string | null | undefined;
  apellidos?: string | null | undefined;
}

export interface TextoSeudonimizado {
  texto: string;
  /** Marca → valor original, para deshacerlo. */
  tabla: ReadonlyMap<string, string>;
}

// Partículas de los apellidos: cambiarlas rompería el texto («la clase de hoy»)
// sin proteger a nadie.
const PARTICULAS = new Set(['de', 'del', 'la', 'las', 'los', 'el', 'y', 'e', 'i', 'da', 'do', 'dos', 'das', 'van', 'von', 'der', 'san', 'santa', 'mc']);

// Nombres que también son palabras de una nota de clase. Sueltos NO se cambian:
// con una alumna «Dolores», «dolores lumbares» acabaría en «[ALUMNA_1]
// lumbares» y la alerta de salud se perdería. Solo se cambian pegados a otra
// palabra del nombre de la misma persona («Dolores García»). Mejor dejar a la
// vista un nombre de pila corriente que borrar un síntoma.
const PALABRAS_COMUNES = new Set([
  'dolores', 'salud', 'luz', 'paz', 'sol', 'mar', 'rosa', 'cruz', 'pilar', 'soledad', 'consuelo', 'esperanza',
  'gracia', 'aurora', 'alba', 'blanca', 'nieves', 'victoria', 'rosario', 'amparo', 'socorro', 'remedios',
  'angustias', 'piedad', 'fe', 'caridad', 'estrella', 'cielo', 'flor', 'perla', 'leon', 'rey', 'santos',
  'angeles', 'reyes', 'mercedes', 'sagrario', 'milagros', 'olvido', 'presentacion', 'encarnacion', 'asuncion',
  'concepcion', 'inmaculada', 'purificacion', 'visitacion', 'patrocinio', 'rocio', 'montserrat', 'iris', 'india',
  'instructora', 'eliminada', 'alumna', 'equipo', 'clase',
]);

const PALABRA = /[\p{L}\p{M}]+(?:['’-][\p{L}\p{M}]+)*/gu;
const EMAIL = /[\p{L}\p{N}._%+-]+@[\p{L}\p{N}-]+(?:\.[\p{L}\p{N}-]+)+/gu;
// Un teléfono dictado: 9+ cifras con espacios, puntos o guiones, y prefijo opcional.
const TELEFONO = /(?:\+|00)?\d(?:[\s.-]?\d){8,}/g;
const MARCA = /\[(?:[A-Z]+\d*_\d+)\]/g;

/** Para comparar: sin tildes y en minúsculas. «Álvarez» y «alvarez» son la misma palabra dictada. */
export function claveDePalabra(p: string): string {
  return p.normalize('NFD').replace(/\p{M}/gu, '').toLocaleLowerCase('es');
}

function palabrasDe(texto: string | null | undefined): string[] {
  return (texto ?? '').match(PALABRA)?.filter(p => p.length >= 2 && !PARTICULAS.has(claveDePalabra(p))) ?? [];
}

export function seudonimizar(texto: string, personas: readonly PersonaASeudonimizar[]): TextoSeudonimizado {
  const tabla = new Map<string, string>();
  const porClave = new Map<string, string>(); // clave de palabra → marca

  // El orden manda: la alumna primero, así una palabra compartida con alguien
  // del equipo se queda como suya.
  for (const p of personas) {
    let n = 0;
    for (const palabra of [...palabrasDe(p.nombre), ...palabrasDe(p.apellidos)]) {
      const clave = claveDePalabra(palabra);
      if (porClave.has(clave)) continue;
      const marca = `[${p.marca}_${++n}]`;
      porClave.set(clave, marca);
      tabla.set(marca, palabra);
    }
  }

  let emails = 0;
  let telefonos = 0;
  const conMarca = (prefijo: 'EMAIL' | 'TELEFONO', valor: string) => {
    const marca = `[${prefijo}_${prefijo === 'EMAIL' ? ++emails : ++telefonos}]`;
    tabla.set(marca, valor);
    return marca;
  };

  // Correos y teléfonos antes que las palabras: un correo lleva el nombre dentro.
  const sinContacto = texto
    .replace(EMAIL, m => conMarca('EMAIL', m))
    .replace(TELEFONO, m => conMarca('TELEFONO', m));
  // Para las palabras comunes hace falta ver la siguiente: se trocea antes.
  const palabras = [...sinContacto.matchAll(PALABRA)];
  const persona = (marca: string | undefined) => marca?.slice(1, marca.lastIndexOf('_'));
  let resultado = '';
  let ultimo = 0;
  palabras.forEach((m, i) => {
    const palabra = m[0];
    const clave = claveDePalabra(palabra);
    const marca = porClave.get(clave);
    let cambiar = !!marca;
    if (marca && PALABRAS_COMUNES.has(clave)) {
      const vecinas = [palabras[i - 1], palabras[i + 1]].filter((v): v is RegExpExecArray => !!v);
      cambiar = vecinas.some(v => {
        const entre = v.index! < m.index! ? sinContacto.slice(v.index! + v[0].length, m.index!) : sinContacto.slice(m.index! + palabra.length, v.index!);
        const otra = porClave.get(claveDePalabra(v[0]));
        return /^\s+$/.test(entre) && !!otra && persona(otra) === persona(marca) && !PALABRAS_COMUNES.has(claveDePalabra(v[0]));
      });
    }
    resultado += sinContacto.slice(ultimo, m.index!) + (cambiar ? marca : palabra);
    ultimo = m.index! + palabra.length;
  });
  resultado += sinContacto.slice(ultimo);
  return { texto: resultado, tabla };
}

/** Pone de vuelta lo que se quitó. Una marca que no está en la tabla se deja tal cual. */
export function restaurar(texto: string | null | undefined, tabla: ReadonlyMap<string, string>): string | null {
  if (texto === null || texto === undefined) return null;
  return texto.replace(MARCA, m => tabla.get(m) ?? m);
}

/** Lo que se le explica a la IA sobre las marcas, para que las copie y no las «arregle». */
export const INSTRUCCION_MARCAS = `El texto puede llevar marcas entre corchetes en lugar de datos personales: [ALUMNA_1], [ALUMNA_2]… son el nombre y los apellidos de la alumna; [EQUIPO1_1]… los de alguien del equipo; [EMAIL_1] y [TELEFONO_1], un correo o un teléfono. Si las necesitas, cópialas EXACTAMENTE igual, con sus corchetes; no las traduzcas ni intentes adivinar a quién se refieren.`;
