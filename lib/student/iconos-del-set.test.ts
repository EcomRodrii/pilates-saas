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

// ── El juego (P15) ─────────────────────────────────────────────────────────
// Se lee el fichero como texto: `Icono.tsx` es JSX y este runner no lo importa.
const SET = readFileSync(join(RAIZ, 'components/student/ui/Icono.tsx'), 'utf8');
const nombresDelSet = [...SET.matchAll(/^ {2}(?:'([a-z-]+)'|([a-z]+)): \[/gm)].map((m) => m[1] ?? m[2]);

test('el juego tiene los iconos de las filas de Perfil, Ayuda y la ficha', () => {
  // `perfil` hace de «persona» y `instructoras` sigue siendo el de Instructoras.
  const filas = ['perfil', 'ajustes', 'candado', 'bolsa', 'recibo', 'tarjeta', 'ayuda', 'mensaje', 'trofeo', 'escudo', 'salir', 'compartir', 'ubicacion', 'personas', 'campana'];
  const faltan = filas.filter((n) => !nombresDelSet.includes(n));
  assert.deepEqual(faltan, []);
});

test('cada icono dice de qué pieza de HugeIcons sale (no se dibuja ninguno a mano)', () => {
  // La regla de la cabecera de `Icono.tsx`: se pega el `d` del paquete con su
  // nombre al lado. Un icono sin nombre de origen es uno dibujado aquí.
  const sinOrigen = nombresDelSet.filter((n) => {
    const clave = /^[a-z]+$/.test(n) ? `${n}: [` : `'${n}': [`;
    const antes = SET.slice(0, SET.indexOf(`\n  ${clave}`));
    return !/\/\*\* [A-Z][A-Za-z0-9]+[^\n]*\*\/\s*$/.test(antes);
  });
  assert.ok(nombresDelSet.length >= 40, `solo ${nombresDelSet.length} iconos: el recorrido no lee el set`);
  assert.deepEqual(sinOrigen, []);
});

test('la baldosa de las filas usa los tokens del estudio, nunca un color fijo', () => {
  const baldosa = sinComentarios(readFileSync(join(RAIZ, 'components/student/ui/BaldosaIcono.tsx'), 'utf8'));
  assert.match(baldosa, /background: 'var\(--muted\)'/);
  assert.match(baldosa, /color: 'var\(--accent\)'/);
  assert.match(baldosa, /tamano=\{18\}/);
  assert.doesNotMatch(baldosa, /#[0-9a-f]{3,8}\b|rgba?\(|hsla?\(/i, 'un color fijo no sigue los 8 estilos ni el modo oscuro');
  // Y la fila de Perfil la usa cuando se le pasa `icono`, sin cambiar las demás.
  const fila = readFileSync(join(RAIZ, 'components/student/domain/ProfileSection.tsx'), 'utf8');
  assert.match(fila, /icono\?: NombreIcono/);
  assert.match(fila, /<BaldosaIcono nombre=\{it\.icono\} \/>/);
});

test('ningún carácter haciendo de icono', () => {
  // Solo, entre etiquetas o como literal suelto: `>←<`, `'✓'`, `'📡'`. Una
  // flecha o un emoji DENTRO de un texto («Ver horario →», «🎁 Una es tu
  // recompensa») es tipografía y no se toca. Los emoji que el ESTUDIO pone a
  // sus logros y recompensas son datos, no literales, y tampoco los mira.
  const glifo = /(>\s*([←→‹›✓×★✎♥♡⚠+]|\p{Extended_Pictographic})️?\s*<)|(['"]([←‹›✓×★✎♥♡⚠]|\p{Extended_Pictographic})️?['"])|(['"]\\u(2713|2714|2715|2717|00d7|2190|2192|2039|203a|2605|2606|270e|26a0|2665|2661)['"])/iu;
  // ⚠️ Una sola excepción, con motivo: las cinco caras de «¿Qué tal la clase?»
  // NO hacen de icono, SON la escala de la valoración (1 a 5), tal cual la
  // aprobó el fundador en la maqueta (oct-2026); cada una lleva su nombre
  // accesible («Muy bien (4 de 5)»). El set no tiene caras y no se dibujan.
  const GLIFOS_PERMITIDOS = new Set(['components/student/domain/QueTalLaClase.tsx']);
  const fuera = ficheros.filter((f) => !GLIFOS_PERMITIDOS.has(f.ruta) && glifo.test(f.codigo)).map((f) => `${f.ruta}: ${f.codigo.match(glifo)?.[0].trim()}`);
  assert.deepEqual(fuera, []);
});
