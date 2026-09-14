// Guardia barata: el panel no manda a sitios que ya no existen.
//
// Un texto de ayuda que dice «ve a Configuración → Planes» cuando las tarifas
// viven en Paquetes (desde el 13-sep) no rompe ningún test ni ninguna pantalla:
// solo manda a la dueña a buscar una pestaña que no está. Pasó con varios
// textos a la vez tras la reorganización del menú, así que se fija aquí la
// lista de lugares retirados. Si uno vuelve a existir, se quita de la lista.
//
// Solo mira líneas de copy: los comentarios pueden contar la historia.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const RAIZ = join(import.meta.dirname, '..');

const DIRECTORIOS = ['app/(dashboard)', 'components', 'app/portal', 'lib/guia'];
const FICHEROS = ['lib/onboarding.ts', 'lib/tour-pasos.ts', 'lib/funciones-catalogo.ts'];
const EXCLUIDOS = ['components/ayuda/articulos', 'components/landing'];

const LUGARES_RETIRADOS: { patron: RegExp; ahora: string }[] = [
  { patron: /Configuración → Planes/, ahora: 'Paquetes (/productos)' },
  { patron: /Configuración → Mi estudio/, ahora: 'Configuración → Estudio' },
  { patron: /\b(en|a|desde) Mi estudio\b/, ahora: 'Configuración' },
  { patron: /Configuración → Servicios de cita/, ahora: 'Configuración → Citas → Servicios' },
  { patron: /Ir a Migración/, ahora: 'Traer mis datos' },
  // No hay pantalla para emparejar un datáfono: no se manda a buscarla.
  { patron: /Empareja uno en Configuración/, ahora: 'solo el estado («Sin datáfono emparejado»)' },
];

function ficherosDe(dir: string): string[] {
  const abs = join(RAIZ, dir);
  return (readdirSync(abs, { recursive: true }) as string[])
    .map((r) => join(dir, r))
    .filter((r) => /\.tsx?$/.test(r) && !/\.test\.ts$/.test(r))
    .filter((r) => !EXCLUIDOS.some((e) => r.startsWith(e)))
    .filter((r) => statSync(join(RAIZ, r)).isFile());
}

function esComentario(linea: string): boolean {
  const t = linea.trim();
  return t.startsWith('//') || t.startsWith('*') || t.startsWith('/*') || t.startsWith('{/*');
}

test('ningún texto del panel manda a un lugar que ya no existe', () => {
  const ficheros = [...DIRECTORIOS.flatMap(ficherosDe), ...FICHEROS];
  assert.ok(ficheros.length > 100, 'la guardia no encuentra los ficheros del panel');
  const hallazgos: string[] = [];
  for (const f of ficheros) {
    const lineas = readFileSync(join(RAIZ, f), 'utf8').split('\n');
    lineas.forEach((linea, i) => {
      if (esComentario(linea)) return;
      for (const { patron, ahora } of LUGARES_RETIRADOS) {
        if (patron.test(linea)) hallazgos.push(`${f}:${i + 1} menciona «${linea.trim().slice(0, 80)}» — ahora es ${ahora}`);
      }
    });
  }
  assert.deepEqual(hallazgos, []);
});
