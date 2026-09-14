import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';

// La ayuda se queda vieja sin que nada falle: la pantalla cambia de sitio o de
// nombre, el artículo sigue mandando a la dueña al sitio antiguo, y ella se lo
// repite a su recepcionista. Esto no comprueba que cada artículo diga la verdad
// —eso solo se sabe leyendo el código de la pantalla—, pero sí caza los nombres
// de menú que ya sabemos que NO existen, para que no vuelvan por copiar y pegar.
//
// Se miran los textos, no los comentarios: un comentario que explica «antes
// esto estaba en Configuración → Planes» es memoria del código, no ayuda falsa.

const RAIZ = new URL('../../', import.meta.url).pathname;
const DIR_ARTICULOS = join(RAIZ, 'components/ayuda/articulos');

const FICHEROS = [
  ...readdirSync(DIR_ARTICULOS).filter((f) => f.endsWith('.tsx')).map((f) => join(DIR_ARTICULOS, f)),
  join(RAIZ, 'lib/faqs.ts'),
  join(RAIZ, 'lib/ayuda/registro.ts'),
  join(RAIZ, 'lib/ayuda/pantallas.ts'),
  join(RAIZ, 'app/portal/[slug]/ayuda/page.tsx'),
];

function sinComentarios(codigo: string): string {
  return codigo
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');
}

const FLECHA = String.raw`\s*(?:&gt;|>|→|›)\s*`;

// Cada entrada: qué no puede aparecer y dónde está ahora, para que el fallo
// diga cómo arreglarlo y no solo que algo va mal.
const PROHIBIDOS: { patron: RegExp; ahora: string }[] = [
  { patron: /Planes y tarifas/, ahora: 'las tarifas están en Paquetes (/productos)' },
  { patron: new RegExp(`Configuración${FLECHA}Planes`), ahora: 'las tarifas están en Paquetes (/productos)' },
  { patron: /Transacciones/, ahora: 'es Cobros (Quién me debe · Lo que he cobrado · Facturas)' },
  { patron: /\bDashboard\b/, ahora: 'la entrada del menú se llama Inicio' },
  { patron: /Tentare Core/, ahora: 'la instructora trabaja en la app del estudio' },
  { patron: new RegExp(`Configuración${FLECHA}Suscripción`), ahora: 'Suscripción es su propia entrada del menú, no una pestaña' },
  // «Logros» a secas era la pestaña vieja; «Logros y motivación» es la de hoy.
  { patron: new RegExp(`Configuración${FLECHA}(?:Recompensas|Niveles|Retos|Logros(?! y motivación))\\b`), ahora: 'van dentro de Configuración > Logros y motivación' },
  { patron: new RegExp(`Configuración${FLECHA}Reservas`), ahora: 'es Configuración > Estudio > Reservas y cancelaciones' },
];

test('la ayuda no manda a pantallas o nombres de menú que ya no existen', () => {
  const fallos: string[] = [];
  for (const fichero of FICHEROS) {
    const texto = sinComentarios(readFileSync(fichero, 'utf8'));
    for (const { patron, ahora } of PROHIBIDOS) {
      const m = texto.match(patron);
      if (m) fallos.push(`${fichero.slice(RAIZ.length)}: «${m[0]}» — ${ahora}`);
    }
  }
  assert.ok(FICHEROS.length > 40, 'no se han leído los artículos: ¿cambió la carpeta?');
  assert.deepEqual(fallos, []);
});
