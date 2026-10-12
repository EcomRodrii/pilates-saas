// ─────────────────────────────────────────────────────────────────────────────
// Guardia de la lista cerrada de analítica (P0.2, 12-oct-2026).
//
// Lo que sale hacia PostHog se decide en dos catálogos: `lib/analytics-eventos.ts`
// (servidor, distinct_id = estudio) y `lib/analytics-navegador.ts` (navegador).
// Los tipos ya cierran la puerta; esta guardia la vigila por si alguien la abre
// con un `as`, con una variable o con un import puesto de paso:
//   1. Cada evento que el código emite está en su catálogo.
//   2. Ninguna prop de ningún catálogo se llama como un dato personal.
//   3. `posthog-js` solo se carga desde la puerta (`lib/posthog-cliente.ts`).
//   4. Nada de lo que ve la alumna (su app, la reserva pública, el widget, el
//      kiosko) importa la analítica del navegador.
//   5. Lo que se aparca en /login está en el catálogo.
//
// Qué es una llamada lo dice el AST de TypeScript, no una regex: un comentario
// que cite `capturarEvento('x')` no cuenta.
// ─────────────────────────────────────────────────────────────────────────────
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import ts from 'typescript';
import { EVENTOS_NAVEGADOR, esEventoNavegador, filtrarEventoNavegador } from './analytics-navegador.ts';
import { PROPS_PERMITIDAS } from './analytics-eventos.ts';
import { EVENTOS_DIFERIBLES } from './posthog-diferidos.ts';
import { EVENTOS_LANDING } from './landing/medicion.ts';

const raiz = join(import.meta.dirname, '..');
const rel = (f: string) => relative(raiz, f).split('\\').join('/');

function ficheros(dir: string): string[] {
  const salida: string[] = [];
  let entradas: string[];
  try { entradas = readdirSync(dir); } catch { return salida; }
  for (const e of entradas) {
    if (e === 'node_modules' || e.startsWith('.')) continue;
    const ruta = join(dir, e);
    if (statSync(ruta).isDirectory()) salida.push(...ficheros(ruta));
    else if (/\.(ts|tsx)$/.test(e) && !/\.test\.tsx?$/.test(e)) salida.push(ruta);
  }
  return salida;
}

const CODIGO = ['app', 'components', 'lib'].flatMap(d => ficheros(join(raiz, d)));
const fuente = (f: string) =>
  ts.createSourceFile(f, readFileSync(f, 'utf8'), ts.ScriptTarget.Latest, true, f.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);

function recorrer(n: ts.Node, visita: (n: ts.Node) => void) {
  visita(n);
  n.forEachChild(h => recorrer(h, visita));
}

/** Los nombres posibles de una expresión: literales, ternarios y `EVENTOS_LANDING.x`. `null` = no se puede saber aquí. */
function nombresDe(e: ts.Expression): string[] | null {
  if (ts.isStringLiteralLike(e)) return [e.text];
  if (ts.isParenthesizedExpression(e) || ts.isAsExpression(e) || ts.isSatisfiesExpression(e) || ts.isTypeAssertionExpression(e)) {
    return nombresDe(e.expression); // un `as` no saca a nadie de la lista
  }
  if (ts.isConditionalExpression(e)) {
    const a = nombresDe(e.whenTrue); const b = nombresDe(e.whenFalse);
    return a && b ? [...a, ...b] : null;
  }
  if (ts.isPropertyAccessExpression(e) && ts.isIdentifier(e.expression) && e.expression.text === 'EVENTOS_LANDING') {
    const v = (EVENTOS_LANDING as Record<string, string>)[e.name.text];
    return v ? [v] : null;
  }
  return null;
}

/**
 * Las llamadas con un nombre que no es literal, y por qué están bien: el tipo
 * de lo que reciben es ya un nombre del catálogo. Una nueva aquí es una
 * decisión, con su motivo.
 */
const NOMBRE_DINAMICO_PERMITIDO: Record<string, string> = {
  'components/onboarding/asistente-rapido.tsx': '`EventoWizard.nombre` es una unión de nombres del catálogo',
  'components/network-v2/EnlaceRastreo.tsx': 'la prop `evento` es `NombreEventoNavegador`',
  'lib/posthog-cliente.ts': 'la puerta misma: `capturarAlLlegar` reenvía su `nombre`, que es `NombreEventoNavegador`',
};

test('1a · cada evento que emite el navegador está en EVENTOS_NAVEGADOR', () => {
  const fuera: string[] = [];
  const dinamicos = new Set<string>();
  let vistos = 0;
  for (const f of CODIGO) {
    const sf = fuente(f);
    recorrer(sf, n => {
      if (ts.isCallExpression(n) && ts.isIdentifier(n.expression)
        && (n.expression.text === 'capturarEvento' || n.expression.text === 'capturarAlLlegar')
        && n.arguments.length > 0) {
        const nombres = nombresDe(n.arguments[0]);
        if (nombres === null) { dinamicos.add(rel(f)); return; }
        for (const nombre of nombres) {
          vistos++;
          if (!esEventoNavegador(nombre)) fuera.push(`${rel(f)}: «${nombre}»`);
        }
      }
      // <EnlaceRastreo evento="…">
      if (ts.isJsxAttribute(n) && n.name.getText(sf) === 'evento' && n.initializer && ts.isStringLiteral(n.initializer)) {
        if (!esEventoNavegador(n.initializer.text)) fuera.push(`${rel(f)}: «${n.initializer.text}» (evento=)`);
      }
    });
  }
  assert.ok(vistos > 20, `La guardia solo ha visto ${vistos} eventos del navegador: se ha quedado ciega (¿cambió el nombre de capturarEvento()?).`);
  assert.deepEqual(fuera, [], `Evento fuera del catálogo del navegador. Añádelo a lib/analytics-navegador.ts con sus props, o no lo emitas:\n${fuera.join('\n')}`);
  const sinMotivo = [...dinamicos].filter(f => !(f in NOMBRE_DINAMICO_PERMITIDO));
  assert.deepEqual(sinMotivo, [], `Llamada con un nombre de evento que esta guardia no puede leer. Usa un literal, o añádela a NOMBRE_DINAMICO_PERMITIDO con su motivo:\n${sinMotivo.join('\n')}`);
});

test('1b · cada evento que emite el servidor está en PROPS_PERMITIDAS', () => {
  const fuera: string[] = [];
  let vistos = 0;
  for (const f of CODIGO) {
    const sf = fuente(f);
    recorrer(sf, n => {
      if (!ts.isCallExpression(n) || !ts.isIdentifier(n.expression)) return;
      if (n.expression.text !== 'capturar' && n.expression.text !== 'enviarAhora') return;
      const evento = n.arguments[1];
      if (!evento || !ts.isObjectLiteralExpression(evento)) return;
      const prop = evento.properties.find(p => ts.isPropertyAssignment(p) && p.name.getText(sf) === 'nombre');
      if (!prop || !ts.isPropertyAssignment(prop)) return;
      const nombres = nombresDe(prop.initializer);
      if (nombres === null) { fuera.push(`${rel(f)}: nombre no literal`); return; }
      for (const nombre of nombres) {
        vistos++;
        if (!Object.hasOwn(PROPS_PERMITIDAS, nombre)) fuera.push(`${rel(f)}: «${nombre}»`);
      }
    });
  }
  assert.ok(vistos > 5, `La guardia solo ha visto ${vistos} eventos de servidor: se ha quedado ciega (¿cambió el nombre de capturar()?).`);
  assert.deepEqual(fuera, [], `Evento de servidor fuera de PROPS_PERMITIDAS (lib/analytics-eventos.ts):\n${fuera.join('\n')}`);
});

// Nombres que delatan un dato de una persona. Contiene, no igual: `email_socia`
// también cae.
const PARECE_DATO_PERSONAL = /email|correo|telefono|phone|movil|nombre|name|apellido|dni|nif|nie\b|iban|direccion|address|socio|socia|alumna|cliente|usuario|user|salud|nacimiento|ip$/i;

test('2 · ninguna prop de ningún catálogo se llama como un dato personal', () => {
  const props = [
    ...Object.entries(EVENTOS_NAVEGADOR).flatMap(([e, ps]) => ps.map(p => `${e}.${p}`)),
    ...Object.entries(PROPS_PERMITIDAS).flatMap(([e, ps]) => (ps as readonly string[]).map(p => `${e}.${p}`)),
  ];
  const sospechosas = props.filter(p => PARECE_DATO_PERSONAL.test(p.split('.')[1]));
  assert.deepEqual(sospechosas, [], `Prop con nombre de dato personal. La analítica dice dónde está y qué hizo, nunca quién es:\n${sospechosas.join('\n')}`);
});

test('3 · posthog-js solo se carga desde la puerta', () => {
  const PERMITIDOS = new Set(['lib/posthog-cliente.ts', 'lib/posthog-privacidad.ts']);
  const fuera = CODIGO.filter(f => /['"]posthog-js['"]/.test(readFileSync(f, 'utf8')) && !PERMITIDOS.has(rel(f))).map(rel);
  assert.deepEqual(fuera, [], `Importa posthog-js fuera de lib/posthog-cliente.ts (que decide dónde puede cargarse):\n${fuera.join('\n')}`);
  // posthog-privacidad.ts solo puede traer TIPOS del SDK.
  const privacidad = readFileSync(join(raiz, 'lib/posthog-privacidad.ts'), 'utf8');
  assert.match(privacidad, /import type \{[^}]*\} from 'posthog-js'/);
  assert.doesNotMatch(privacidad, /import \{[^}]*\} from 'posthog-js'|import\(\s*'posthog-js'\s*\)/);
});

// Lo que ve la alumna, o un visitante del estudio. `lib/posthog-privacidad.ts`
// ya excluye sus rutas; esto evita que el código esté siquiera ahí.
const DE_LA_ALUMNA = [
  'app/portal', 'app/portal-preview', 'app/app', 'app/reservar', 'app/i', 'app/kiosk',
  'app/widget-auth-retorno', 'app/widget-bundle',
  'components/student', 'components/reservar', 'components/widget',
];

test('4 · nada de lo que ve la alumna importa la analítica del navegador', () => {
  const fuera = DE_LA_ALUMNA.flatMap(d => ficheros(join(raiz, d)))
    .filter(f => /posthog-cliente|analytics-navegador|['"]posthog-js['"]/.test(readFileSync(f, 'utf8')))
    .map(rel);
  assert.deepEqual(fuera, [], `Analítica importada en una pantalla de la alumna:\n${fuera.join('\n')}`);
  // Y que la lista no se haya quedado mirando carpetas que ya no existen.
  assert.ok(ficheros(join(raiz, 'app/portal')).length > 0, 'app/portal no tiene ficheros: revisa DE_LA_ALUMNA');
});

test('5 · lo que se aparca en /login está en el catálogo', () => {
  for (const nombre of EVENTOS_DIFERIBLES) assert.ok(esEventoNavegador(nombre), `«${nombre}» es diferible pero no está en EVENTOS_NAVEGADOR`);
  for (const nombre of Object.values(EVENTOS_LANDING)) assert.ok(esEventoNavegador(nombre), `«${nombre}» (EVENTOS_LANDING) no está en EVENTOS_NAVEGADOR`);
});

test('filtrarEventoNavegador: fuera lo que no está y las props que no tocan', () => {
  assert.equal(filtrarEventoNavegador('evento_inventado', { a: 1 }), null);
  assert.equal(filtrarEventoNavegador(undefined), null);
  assert.equal(filtrarEventoNavegador('toString'), null); // nada heredado del prototipo
  assert.deepEqual(filtrarEventoNavegador('landing_precio_visto'), { nombre: 'landing_precio_visto' });
  assert.deepEqual(
    filtrarEventoNavegador('alta_estudio_creada', { plan: 'BASE', email: 'alguien@example.com', studio: { id: 'x' } }),
    { nombre: 'alta_estudio_creada', props: { plan: 'BASE' } },
  );
  // Una prop permitida con un objeto dentro tampoco sale: solo valores sueltos.
  assert.deepEqual(
    filtrarEventoNavegador('tour_paso_completado', { paso: { id: 'c1', texto: 'x' } }),
    { nombre: 'tour_paso_completado', props: {} },
  );
  assert.deepEqual(
    filtrarEventoNavegador('bienvenida_paso', { paso: 'espacio', n: 2, total: 6, retomado: true }),
    { nombre: 'bienvenida_paso', props: { paso: 'espacio', n: 2, total: 6, retomado: true } },
  );
});
