import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

// Ningún icono de la app de la alumna se dibuja fuera de `Icono.tsx`.
//
// Lo que había antes de este test: tres iconos hechos a mano imitando HugeIcons
// —el de Instructoras con un trazo que volvía sobre sí mismo—, nueve de otra
// familia, tres corazones distintos y seis grosores. Nadie lo decidió: cada
// pantalla pegó el `<path>` que tenía a mano. Y la flecha de volver, los
// chevrons y las marcas de «hecho» eran CARACTERES («←», «›», «✓»), que no son
// un icono: son lo que dibuje la fuente de cada móvil.

const RAIZ = process.cwd();
const CARPETAS = ['components/student', 'app/portal'];

// Los únicos sitios donde un `<path>` a mano es lo correcto, cada uno con su
// porqué. Añadir uno aquí es una decisión, no un atajo.
const PERMITIDOS: Record<string, string> = {
  'components/student/ui/Icono.tsx': 'es el set',
  'components/student/ui/Ilustracion.tsx': 'ilustraciones propias, no iconos',
  'app/portal/[slug]/acceso/login/page.tsx': 'el logo de Google, con sus colores de marca',
  'components/student/domain/FiltrosRapidos.tsx': 'los deslizadores de la guía de marca: línea que cruza el mando hueco, que HugeIcons no tiene',
};

function tsx(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? tsx(p) : p.endsWith('.tsx') ? [p] : [];
  });
}

// Sin comentarios: aquí se EXPLICA qué había («el carácter "←"») y un guardia
// que caza comentarios obliga a escribir peor la explicación.
const sinComentarios = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');

const ficheros = CARPETAS.flatMap((c) => tsx(join(RAIZ, c))).map((f) => ({
  ruta: relative(RAIZ, f),
  codigo: sinComentarios(readFileSync(f, 'utf8')),
}));

test('el recorrido encuentra la app (si no, el test pasaría por vacío)', () => {
  assert.ok(ficheros.length > 50, `solo ${ficheros.length} ficheros`);
  assert.ok(ficheros.some((f) => f.ruta === 'components/student/ui/Icono.tsx'));
});

test('ningún <path> fuera del set de iconos', () => {
  const fuera = ficheros
    .filter((f) => !(f.ruta in PERMITIDOS) && /<path\b/.test(f.codigo))
    .map((f) => f.ruta);
  assert.deepEqual(fuera, [], 'usa <Icono nombre="…" /> (components/student/ui/Icono.tsx)');
});

test('ningún carácter haciendo de icono', () => {
  // Solo, entre etiquetas o como literal suelto: `>←<`, `'✓'`. Una flecha
  // DENTRO de un texto («Ver horario →») es tipografía y no se toca.
  const glifo = /(>\s*[←→‹›✓×]\s*<)|(['"][←‹›✓×]['"])/;
  const fuera = ficheros.filter((f) => glifo.test(f.codigo)).map((f) => `${f.ruta}: ${f.codigo.match(glifo)?.[0].trim()}`);
  assert.deepEqual(fuera, []);
});
