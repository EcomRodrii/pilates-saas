// ─────────────────────────────────────────────────────────────────────────────
// Guardia: Tentare no promete ayuda que nadie da (fundador, 21-oct-2026).
//
// Nadie llama a los estudios y nadie los configura ni les hace la migración por
// ellos. Hasta el 21-oct el asistente de bienvenida ofrecía que la llamaran o que
// le configuraran el estudio, la web prometía «si prefieres, te lo hacemos
// nosotros» en una docena de páginas y un aviso decía «te ayudamos a montarlo».
// Se quitaron todas. Esta guardia falla si una de esas frases vuelve a `app`,
// `components` o `lib`.
//
// Qué NO mira, a propósito:
//   · Las líneas de comentario: un comentario que cuenta por qué se quitó algo
//     tiene que poder nombrarlo, y no se lo enseña a nadie.
//   · Los tests (`*.test.ts`), que nombran las frases para comprobar que no están.
//   · Las frases verdaderas de soporte, que no están en la lista: restaurar una
//     copia o borrar una cuenta «contigo desde soporte» se hace de verdad.
//
// Si una frase de la lista tiene que salir en algún sitio, va en EXCEPCIONES con
// su motivo: nunca se quita de la lista.
// ─────────────────────────────────────────────────────────────────────────────
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const raiz = join(import.meta.dirname, '..');
const DIRECTORIOS = ['app', 'components', 'lib'];
const EXTENSIONES = /\.(ts|tsx|js|jsx|mjs|json)$/;

/** Las promesas falsas, en minúsculas y sin tildes (se comparan así). */
const FRASES = [
  // El asistente de bienvenida.
  'que me llamen',
  'configuradlo por mi',
  'te llamamos',
  'subimos a lo primero de tu panel',
  // El paso «Programa tus clases» y el aviso de estudio sin horario.
  'te proponemos un horario',
  'te ayudamos a montarlo',
  // La migración hecha por Tentare, en la web y en el producto.
  'te lo hacemos nosotros',
  'lo hacemos nosotros',
  'la hacemos nosotros',
  'te ayudamos nosotros',
  'te ayudamos a traer',
  'traemos tus datos',
  'migramos tus datos',
  'migremos nosotros',
];

/** Fichero → frases que puede nombrar, con el motivo. */
const EXCEPCIONES: Record<string, { frases: string[]; motivo: string }> = {
  'lib/interno/hoy.ts': {
    frases: ['que me llamen'],
    motivo: 'El «Hoy» de /interno le cuenta al fundador las solicitudes de llamada que ya existen '
      + '(siguen en solicitudes_llamada para atenderlas): nombra la opción que eligieron, no la ofrece.',
  },
};

const normalizar = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
const esComentario = (linea: string) => /^\s*(\/\/|\/\*|\*|\{\s*\/\*)/.test(linea);

function ficheros(dir: string): string[] {
  return readdirSync(join(raiz, dir)).flatMap((nombre) => {
    const rel = `${dir}/${nombre}`;
    if (statSync(join(raiz, rel)).isDirectory()) return ficheros(rel);
    if (!EXTENSIONES.test(nombre) || /\.test\.tsx?$/.test(nombre)) return [];
    return [rel];
  });
}

test('ninguna pantalla, correo ni página promete llamar, configurar o migrar por la propietaria', () => {
  const infracciones: string[] = [];
  for (const f of DIRECTORIOS.flatMap(ficheros)) {
    const permitidas = EXCEPCIONES[f]?.frases ?? [];
    readFileSync(join(raiz, f), 'utf8').split('\n').forEach((linea, i) => {
      if (esComentario(linea)) return;
      const texto = normalizar(linea);
      for (const frase of FRASES) {
        if (texto.includes(frase) && !permitidas.includes(frase)) infracciones.push(`${f}:${i + 1} «${frase}»`);
      }
    });
  }
  assert.deepEqual(infracciones, [], 'Vuelve una promesa de ayuda que nadie da. Quítala (o, si es verdad, ponla en EXCEPCIONES con su motivo):');
});

test('la lista se compara normalizada y cada excepción sigue haciendo falta', () => {
  for (const frase of FRASES) assert.equal(frase, normalizar(frase), `«${frase}» tiene que ir en minúsculas y sin tildes`);
  for (const [f, { frases }] of Object.entries(EXCEPCIONES)) {
    const texto = normalizar(readFileSync(join(raiz, f), 'utf8'));
    for (const frase of frases) {
      assert.ok(FRASES.includes(frase), `${f}: «${frase}» no está en la lista`);
      assert.ok(texto.includes(frase), `${f} ya no dice «${frase}»: quita la excepción`);
    }
  }
});

test('la guardia ve la frase escrita con tildes y mayúsculas, y no ve la de un comentario', () => {
  assert.ok(normalizar('«Configuradlo por mí»').includes('configuradlo por mi'));
  assert.ok(normalizar('Si prefieres, Te Lo Hacemos Nosotros.').includes('te lo hacemos nosotros'));
  assert.equal(esComentario('  // fuera «que me llamen»'), true);
  assert.equal(esComentario('   * lo hacemos nosotros'), true);
  assert.equal(esComentario("  label: 'Prefiero que me llamen',"), false);
});
