// ─────────────────────────────────────────────────────────────────────────────
// Un icono, un significado.
//
// `Sparkles` en este producto quiere decir **novedad**: es el icono del
// changelog (`app/ayuda/novedades`, el aviso NUEVO del menú, el botón «Señalar
// en el menú» del backoffice). No puede querer decir además «aquí está
// pensando Tentare» — con los dos significados encima del mismo dibujo, ninguno
// se lee.
//
// Donde Tentare trabaja SOLO va el Orb. Esto es estructural a propósito: lo que
// hay que impedir no es un cálculo mal hecho, es que el destello vuelva por la
// puerta de atrás la próxima vez que alguien añada un icono «de IA» a estas dos
// pantallas. El aspecto del Orb se mira en el navegador, no aquí.
// ─────────────────────────────────────────────────────────────────────────────
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const raiz = join(import.meta.dirname, '..');
// Sin comentarios: los ficheros vigilados explican en los suyos POR QUÉ va el
// Orb y no el destello, y esa explicación no puede hacer fallar al guardia que
// describe. Se quitan también los bloques `{/* … */}` de JSX, que es donde vive
// esa nota: filtrar solo por línea inicial deja pasar las líneas de en medio.
const leerCodigo = (p: string) =>
  readFileSync(join(raiz, p), 'utf8')
    .replace(/\{?\/\*[\s\S]*?\*\/\}?/g, '')
    .split('\n')
    .filter(l => !/^\s*\/\//.test(l))
    .join('\n');

// Donde Tentare piensa o ejecuta por su cuenta. Las tres primeras son
// pantallas que trabajan solas; las tres últimas, botones que llaman de verdad
// a un modelo (lib/ai/*).
const CON_ORB = [
  'components/decision/piloto-automatico.tsx',
  'app/(dashboard)/automatizaciones/page.tsx',
  'app/(dashboard)/dashboard/page.tsx',
  'app/(dashboard)/calendario/page.tsx',
  'components/socios/ficha-salud.tsx',
  'components/socios/modal-nota-voz.tsx',
];

// Los tres botones «con IA». Antes eran `<Bot>` y, al pulsar, `<Loader2>`
// girando: dos dibujos distintos para el mismo objeto: al empezar a trabajar
// parecía que hubiera empezado otra cosa. El Orb tiene DOS estados
// precisamente para esto, así que el icono no se sustituye — cambia de estado.
const BOTONES_IA: [string, string][] = [
  ['app/(dashboard)/calendario/page.tsx', 'prepIALoading'],
  ['components/socios/ficha-salud.tsx', 'adaptacionIALoading'],
  ['components/socios/modal-nota-voz.tsx', 'procesando'],
];

for (const [fichero, cargando] of BOTONES_IA) {
  test(`${fichero}: el botón de IA no cambia de icono al ponerse a trabajar`, () => {
    const src = leerCodigo(fichero);
    assert.match(src, new RegExp(`TentareOrb[^>]*estado=\\{${cargando} \\? 'pensando' : 'reposo'\\}`),
      'El mismo Orb, en su estado «pensando». No un icono que se cambia por otro.');
    assert.doesNotMatch(src, /Loader2/,
      'El spinner genérico sobraba: el Orb ya dice que está trabajando, y el texto del botón también.');
  });
}

for (const fichero of CON_ORB) {
  test(`${fichero}: donde Tentare trabaja solo va el Orb`, () => {
    const src = leerCodigo(fichero);
    assert.match(src, /TentareOrb/,
      'Esta pantalla dice que el sistema actúa por su cuenta: le toca el Orb.');
    assert.doesNotMatch(src, /\bSparkles\b/,
      '`Sparkles` significa «novedad» (el changelog). Para «lo ha pensado Tentare», el Orb.');
    assert.doesNotMatch(src, /<Bot\b/,
      'El robot tampoco: Tentare no es un bot que responde, es un sistema que decide.');
  });
}

// El otro lado del trato. Si algún día `Sparkles` deja de significar «novedad»,
// este test cae y obliga a revisar la regla entera en vez de dejarla a medias.
test('«Sparkles» sigue siendo el icono del changelog', () => {
  const src = leerCodigo('app/ayuda/novedades/page.tsx');
  assert.match(src, /NUEVA_FUNCIONALIDAD[\s\S]{0,120}Sparkles/,
    'Si esto cambia, el Orb deja de tener con qué contrastar y hay que replantear el criterio.');
});
