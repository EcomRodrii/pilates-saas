// ─────────────────────────────────────────────────────────────────────────────
// Dónde vive Tenti, y dónde no.
//
// Tenti es «una primera vez tuya en Tentare»: te conoce en la pantalla del logo
// y celebra cuando una alumna nueva ya puede reservar en tu página. Nada más.
// No sale en lo diario, ni junto a dinero, errores o soporte, ni en la marca
// blanca del estudio, y solo lo ve la propietaria.
//
// Estructural a propósito: el motor dibuja once estados y siete emociones, y la
// tentación de «ponerle cara» a una pantalla más es constante. Cada sitio nuevo
// reabre una discusión entera (batería del iPad de recepción, una mascota junto
// a un cobro, un «todo bien» encubierto en un estado vacío), y esa discusión no
// puede saltarse por un import puesto de paso. Cómo se VE Tenti se mira en el
// navegador; aquí solo se vigila dónde está y qué se le deja hacer.
//
// ⚠️ Añadir un sitio exige editar las listas de abajo CON SU MOTIVO en un
// comentario, como lib/repo-publico-guardia.test.ts. «Para que pase» no es un
// motivo.
// ─────────────────────────────────────────────────────────────────────────────
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, posix } from 'node:path';
import ts from 'typescript';
import { ESTADOS, EMOCIONES } from './motor.ts';

const raiz = join(import.meta.dirname, '..', '..');

// ── Leer el código como lo lee el compilador ─────────────────────────────────
//
// Qué es comentario y qué es un import lo dice TypeScript, no una regex. La que
// había (`/\{?\/\*[\s\S]*?\*\/\}?/g`, quitando los bloques antes que las líneas)
// leía el `components/calendario/*` de un `//` como el principio de un bloque y
// se tragaba el código hasta el siguiente `*/`: no veía ni un import de
// /calendario, de donde cuelga Listo, ni de app/widget-bundle/main.tsx, raíz de
// la marca blanca, y seguía en verde con Tenti metido en cualquiera de los dos.
// Un escáner suelto tampoco basta: sin el parser no sabe si un `/` abre una regex
// (`/https:\/*/` lleva dentro un `/*`), dónde vuelve a empezar una plantilla, ni
// que el texto de un JSX no es código.

const leer = (rel: string) => readFileSync(join(raiz, rel), 'utf8');
const arbol = (rel: string, texto: string) =>
  ts.createSourceFile(rel, texto, ts.ScriptTarget.Latest, false, rel.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);

/** El texto sin comentarios, con el mismo largo y los mismos saltos de línea.
 *  Un comentario solo puede estar entre dos tokens, y el parser es el único que
 *  sabe dónde acaba cada uno: se recogen los de delante de cada token. */
function sinComentarios(sf: ts.SourceFile): string {
  const t = sf.text;
  const rangos = new Map<number, number>();
  const visitar = (n: ts.Node): void => {
    // El JSDoc ya sale como comentario del token al que precede, y el texto de
    // un JSX es contenido: un `http://` ahí no abre nada.
    if (ts.isJSDoc(n) || n.kind === ts.SyntaxKind.JsxText) return;
    const hijos = n.getChildren(sf);
    if (hijos.length) { hijos.forEach(visitar); return; }
    // Los del final de la línea anterior son «trailing»; los de las siguientes, «leading».
    for (const r of [...ts.getTrailingCommentRanges(t, n.pos) ?? [], ...ts.getLeadingCommentRanges(t, n.pos) ?? []]) {
      rangos.set(r.pos, r.end);
    }
  };
  visitar(sf);
  let out = '';
  let i = 0;
  for (const [desde, hasta] of [...rangos].sort((a, b) => a[0] - b[0])) {
    out += t.slice(i, desde) + t.slice(desde, hasta).replace(/[^\r\n]/g, ' ');
    i = hasta;
  }
  return out + t.slice(i);
}

// Sin comentarios: los ficheros vigilados explican en los suyos por qué NO
// importan el componente directo, y esa explicación no puede hacer fallar a la
// guardia.
const leerCodigo = (rel: string) => sinComentarios(arbol(rel, leer(rel)));

/** Cada import, export…from, import() (también el de un tipo) y require() con
 *  una ruta literal, con el nodo que lo hace. */
function importsDe(sf: ts.SourceFile): { spec: string; nodo: ts.Node }[] {
  const out: { spec: string; nodo: ts.Node }[] = [];
  const anotar = (nodo: ts.Node, e: ts.Node | undefined) => { if (e && ts.isStringLiteralLike(e)) out.push({ spec: e.text, nodo }); };
  const visitar = (n: ts.Node): void => {
    if (ts.isImportDeclaration(n) || ts.isExportDeclaration(n)) anotar(n, n.moduleSpecifier);
    else if (ts.isImportEqualsDeclaration(n) && ts.isExternalModuleReference(n.moduleReference)) anotar(n, n.moduleReference.expression);
    else if (ts.isCallExpression(n) && (n.expression.kind === ts.SyntaxKind.ImportKeyword
      || (ts.isIdentifier(n.expression) && n.expression.text === 'require'))) anotar(n, n.arguments[0]);
    else if (ts.isImportTypeNode(n) && ts.isLiteralTypeNode(n.argument)) anotar(n, n.argument.literal);
    ts.forEachChild(n, visitar);
  };
  visitar(sf);
  return out;
}

const COMPONENTE = 'components/tenti/tenti';
const DIFERIDO = 'components/tenti/tenti-diferido';

// ── Quién puede importar a Tenti. Cada entrada, con su motivo. ───────────────

/** Los únicos que importan `components/tenti/tenti`. */
const IMPORTAN_EL_COMPONENTE = new Set([
  // El catálogo de Tentare-empresa: el único sitio donde se enciende todo
  // (sonido, toques, insignias, los once estados).
  'app/interno/tenti/page.tsx',
  // La bienvenida del logo. Import ESTÁTICO a propósito: el fichero ya viaja en
  // el chunk diferido de PantallaBienvenida, y el ref de saludar()/emocion() no
  // atraviesa next/dynamic.
  'components/onboarding/pantallas-valor.tsx',
  // El envoltorio diferido, que solo importa el TIPO y el módulo dentro de dynamic().
  'components/tenti/tenti-diferido.tsx',
]);

/** Los únicos que importan `components/tenti/tenti-diferido`. */
const IMPORTAN_EL_DIFERIDO = new Set([
  // «Tu estudio ya puede recibir reservas»: cuelga sin diferir de /calendario y
  // de PrimerHorario, así que el motor solo puede llegar por el diferido.
  'components/onboarding/listo-para-reservar.tsx',
]);

/** Donde 'hecho' está permitido: significa UNA cosa en todo el producto, que el
 *  servidor confirmó que una alumna nueva puede reservar. */
const DONDE_SE_CELEBRA = new Set(['components/onboarding/listo-para-reservar.tsx']);

/** Donde se saluda: el primer contacto, en la pantalla del logo. */
const DONDE_SE_SALUDA = new Set(['components/onboarding/pantallas-valor.tsx']);

/** Lo que el catálogo enciende y nadie más: valores por defecto seguros. */
const PROPS_SOLO_DEL_CATALOGO = ['interactivo', 'sonido', 'saludaAlAparecer', 'insignias', 'titulo'];

/** Estados y emociones que se dejan usar fuera del catálogo (la fase 1). */
const ESTADOS_PERMITIDOS = new Set(['reposo', 'hecho']);
const EMOCIONES_PERMITIDAS = new Set(['feliz']);

/** Por debajo de 64 px el motor entra en modo mini, que es otro dibujo. */
const TAMANO_MINIMO = 64;

/** Marca blanca (manda la marca del ESTUDIO) y la migración (dinero, con alumnas
 *  delante y desde cualquier rol). Ni directo ni de rebote. */
const SIN_TENTI = [
  'app/portal', 'app/reservar', 'app/kiosk', 'app/widget-bundle', 'app/(dashboard)/migracion',
  'components/student', 'components/reserva', 'components/reservar', 'components/widget',
  'lib/emails', 'emails',
];

// Lo que ya vigila su propio fichero: el catálogo y el componente por dentro.
const FUERA_DE_LAS_REGLAS = (rel: string) => rel === 'app/interno/tenti/page.tsx' || rel.startsWith('components/tenti/');

// ── El recorrido ─────────────────────────────────────────────────────────────

// Los tests no viajan al navegador (y esta guardia nombra las rutas en sus regex).
function fuentes(dir: string, acc: string[] = []): string[] {
  for (const e of readdirSync(join(raiz, dir))) {
    if (e === 'node_modules' || e.startsWith('.')) continue;
    const rel = `${dir}/${e}`;
    const st = statSync(join(raiz, rel));
    if (st.isDirectory()) fuentes(rel, acc);
    else if (/\.(ts|tsx)$/.test(e) && !/\.test\.tsx?$/.test(e) && !e.endsWith('.d.ts')) acc.push(rel);
  }
  return acc;
}
const TODAS = ['app', 'components', 'lib', 'emails'].flatMap(d => fuentes(d));

/** El módulo al que apunta, relativo a la raíz y sin extensión; null si es un paquete. */
function modulo(desde: string, spec: string): string | null {
  let ruta: string;
  if (spec.startsWith('@/')) ruta = spec.slice(2);
  else if (spec.startsWith('.')) ruta = posix.normalize(posix.join(posix.dirname(desde), spec));
  else return null;
  return ruta.replace(/\.(tsx?|jsx?)$/, '').replace(/\/index$/, '');
}

const esTenti = (m: string | null) => m === 'components/tenti' || !!m?.startsWith('components/tenti/');

const TEXTOS = new Map(TODAS.map(f => [f, leer(f)]));
const imports = new Map(TODAS.map(f => [f, importsDe(arbol(f, TEXTOS.get(f)!)).map(i => modulo(f, i.spec))]));

/** El fichero real de un módulo, o null si no está entre las fuentes. */
const PORMODULO = new Map(TODAS.map(f => [f.replace(/\.tsx?$/, '').replace(/\/index$/, ''), f]));

// ── 0 · La guardia ve el código que hay ──────────────────────────────────────

test('sin comentarios quita los comentarios y nada más', () => {
  const src = [
    '// components/calendario/* no abre ningún bloque',
    "import { A } from './a';",
    'const r = /https:\\/*/; // y aquí sí empieza uno',
    'const t = `// no es comentario ${1 /* este sí */}`;',
    'export const X = () => <p>http://texto {/* este también */}</p>;',
    "/** y el JSDoc */ import { B } from './b';",
  ].join('\n');
  const sin = sinComentarios(arbol('x.tsx', src));
  assert.equal(sin.length, src.length);
  assert.equal(sin.split('\n').length, src.split('\n').length);
  for (const queda of ["import { A } from './a';", 'const r = /https:\\/*/;', '`// no es comentario ${1', '<p>http://texto {', "import { B } from './b';"]) {
    assert.ok(sin.includes(queda), `se ha comido código: ${queda}`);
  }
  for (const va of ['calendario/*', 'aquí sí', 'este sí', 'este también', 'JSDoc']) {
    assert.ok(!sin.includes(va), `sigue el comentario: ${va}`);
  }
});

test('la guardia ve todos los imports del proyecto que ve TypeScript', () => {
  // Un segundo lector, independiente: preProcessFile, con el que el propio TS
  // descubre los módulos de un proyecto. Solo rutas del proyecto: también lee
  // como import el ejemplo de código que una plantilla genera para el estudio.
  const ciegos = TODAS.flatMap(f => {
    const ve = new Set(imports.get(f));
    return ts.preProcessFile(TEXTOS.get(f)!, true, true).importedFiles
      .map(i => modulo(f, i.fileName))
      .filter(m => m != null && !ve.has(m))
      .map(m => `${f} → ${m}`);
  });
  assert.deepEqual(ciegos, [], 'La guardia no ve estos imports: lo que no ve, no lo vigila.');
  // Los dos que la regex no veía, por nombre: de /calendario cuelga Listo, y el
  // widget es la raíz de la marca blanca.
  assert.ok(imports.get('app/(dashboard)/calendario/page.tsx')!.includes('components/onboarding/listo-para-reservar'));
  assert.ok(imports.get('app/widget-bundle/main.tsx')!.includes('components/reserva/reserva-calendario'));
});

// ── 1 · Quién importa ────────────────────────────────────────────────────────

test('solo tres ficheros importan el componente de Tenti, y solo Listo el diferido', () => {
  const delComponente = TODAS.filter(f => imports.get(f)!.includes(COMPONENTE)).sort();
  assert.deepEqual(delComponente, [...IMPORTAN_EL_COMPONENTE].sort(),
    'Un sitio nuevo para Tenti es una decisión de producto: añádelo a IMPORTAN_EL_COMPONENTE con su motivo. ' +
    'Y si cuelga de algo que se carga siempre, que use TentiDiferido.');
  const delDiferido = TODAS.filter(f => imports.get(f)!.includes(DIFERIDO)).sort();
  assert.deepEqual(delDiferido, [...IMPORTAN_EL_DIFERIDO].sort(),
    'TentiDiferido solo está en «Tu estudio ya puede recibir reservas».');
  const otros = TODAS.filter(f => !f.startsWith('components/tenti/')
    && imports.get(f)!.some(m => esTenti(m) && m !== COMPONENTE && m !== DIFERIDO));
  assert.deepEqual(otros, [], 'components/tenti solo expone el componente y su versión diferida.');
});

test('quien importa a Tenti no le cambia el nombre (la guardia lo busca por su etiqueta)', () => {
  for (const f of TODAS.filter(x => !FUERA_DE_LAS_REGLAS(x) && imports.get(x)!.some(esTenti))) {
    for (const { spec, nodo } of importsDe(arbol(f, TEXTOS.get(f)!))) {
      if (!esTenti(modulo(f, spec))) continue;
      // Un import() o un re-export lo deja con el nombre que quiera quien lo use.
      const clausula = ts.isImportDeclaration(nodo) ? nodo.importClause : undefined;
      const nombres = clausula?.namedBindings;
      assert.ok(clausula && !clausula.name && nombres && ts.isNamedImports(nombres),
        `${f}: \`import { … } from\`, no por defecto, \`* as\`, import() ni re-export.`);
      for (const e of nombres.elements) {
        assert.ok(!e.propertyName, `${f}: un alias esconde las etiquetas <Tenti> de esta guardia.`);
      }
    }
  }
});

// ── 2 · El diferido decide antes de descargar nada ───────────────────────────

test('TentiDiferido solo trae el motor por dynamic(), sin SSR, y solo para la propietaria', () => {
  const src = leerCodigo(`${DIFERIDO}.tsx`);
  for (const m of src.matchAll(/import\s+([^;]*?)\s+from\s*['"]\.\/tenti['"]/g)) {
    assert.match(m[1], /^type\s/, 'De ./tenti solo el tipo: un import de valor mete el motor en el chunk de Listo, y Listo viaja con /calendario.');
  }
  const dinamicos = [...src.matchAll(/\bimport\s*\(\s*['"]\.\/tenti['"]\s*\)/g)];
  assert.equal(dinamicos.length, 1, 'Un solo import() del componente.');
  // A nivel de MÓDULO (empieza la línea), con la ruta literal y ssr: false
  // (Next 16, lazy-loading.md): dentro de un componente se recrearía en cada render.
  assert.match(src, /^const\s+\w+\s*=\s*dynamic\s*(<[^>]*>)?\s*\(\s*\(\)\s*=>\s*import\s*\(\s*['"]\.\/tenti['"]\s*\)[\s\S]*?\{[^}]*\bssr\s*:\s*false/m,
    'dynamic(() => import(\'./tenti\'), { ssr: false }) a nivel de módulo.');
  assert.match(src, /\buseRol\s*\(\s*\)/, 'El rol se mira aquí dentro, no en cada pantalla.');
  const salida = src.search(/if\s*\(\s*rol\s*!==\s*['"]PROPIETARIO['"]\s*\)\s*return\b/);
  assert.ok(salida > 0, 'Con cualquier otro rol, sale con `reserva` antes de tocar el chunk.');
  assert.ok(salida < src.lastIndexOf('<TentiCanvas'), 'La salida temprana va ANTES de pintar el lienzo diferido.');
  assert.match(src, /estado\s*:\s*'reposo'\s*\|\s*'hecho'\s*;/,
    'El tipo de `estado` se queda en reposo | hecho: así lo vigila también el tsc del CI.');
  for (const p of PROPS_SOLO_DEL_CATALOGO) {
    assert.doesNotMatch(src.slice(src.indexOf('interface PropsTentiDiferido'), src.indexOf('const ReservaCtx')),
      new RegExp(`\\b${p}\\b`), `TentiDiferido no expone \`${p}\`.`);
  }
});

// ── 3 · Lo que se le deja hacer fuera del catálogo ───────────────────────────

interface Etiqueta { fichero: string; nombre: string; props: Map<string, string | null>; esparce: boolean }

/** Las etiquetas <Tenti …> y <TentiDiferido …>, con sus props al nivel de la etiqueta. */
function etiquetas(fichero: string, src: string): Etiqueta[] {
  const out: Etiqueta[] = [];
  for (const m of src.matchAll(/<(TentiDiferido|Tenti)(?![\w$])/g)) {
    const props = new Map<string, string | null>();
    let esparce = false;
    let i = m.index + m[0].length;
    while (i < src.length) {
      const c = src[i];
      if (c === '/' && src[i + 1] === '>') break;
      if (c === '>') break;
      if (c === '{') {
        // Un `{...x}` suelto en la etiqueta: no se puede saber qué pasa.
        const fin = cierre(src, i);
        if (/^\{\s*\.\.\./.test(src.slice(i, fin + 1))) esparce = true;
        i = fin + 1;
        continue;
      }
      const nom = /^[A-Za-z_$][\w$-]*/.exec(src.slice(i));
      if (!nom) { i++; continue; }
      i += nom[0].length;
      let valor: string | null = null;
      const tras = /^\s*=\s*/.exec(src.slice(i));
      if (tras) {
        i += tras[0].length;
        if (src[i] === '{') { const fin = cierre(src, i); valor = src.slice(i + 1, fin).trim(); i = fin + 1; }
        else { const q = src[i]; const fin = src.indexOf(q, i + 1); valor = src.slice(i, fin + 1); i = fin + 1; }
      }
      props.set(nom[0], valor);
    }
    out.push({ fichero, nombre: m[1], props, esparce });
  }
  return out;
}

/** Dónde se cierra la llave que abre en `i`, saltando cadenas. */
function cierre(src: string, i: number): number {
  let n = 0;
  for (let j = i; j < src.length; j++) {
    const c = src[j];
    if (c === '"' || c === "'" || c === '`') { j = src.indexOf(c, j + 1); if (j < 0) break; continue; }
    if (c === '{') n++;
    else if (c === '}' && --n === 0) return j;
  }
  throw new Error('llave sin cerrar');
}

const literales = (expr: string) => [...expr.matchAll(/['"]([^'"]*)['"]/g)].map(m => m[1]);
const VOCABULARIO_ESTADOS = new Set(Object.keys(ESTADOS));

/** Los estados que puede tomar un `estado={…}`: un literal, o una const del mismo fichero. */
function estadosPosibles(src: string, valor: string): string[] | null {
  const v = valor.trim();
  if (/^['"][^'"]*['"]$/.test(v)) return literales(v);
  const id = /^[A-Za-z_$][\w$]*$/.exec(v)?.[0];
  if (!id) return null;
  const def = new RegExp(`\\bconst\\s+${id}\\s*(?::[^=]+)?=\\s*([^;]+);`).exec(src);
  return def ? literales(def[1]).filter(l => VOCABULARIO_ESTADOS.has(l)) : null;
}

const CONSUMIDORES = TODAS.filter(f => !FUERA_DE_LAS_REGLAS(f) && imports.get(f)!.some(esTenti));

test('fuera de /interno, Tenti no suena, no se toca, no saluda solo, no lleva insignia y es decorativo', () => {
  const vistas = CONSUMIDORES.flatMap(f => etiquetas(f, leerCodigo(f)));
  assert.ok(vistas.length >= 3, 'La guardia tiene que ver las etiquetas de la bienvenida (2) y de Listo (1).');
  for (const e of vistas) {
    assert.ok(!e.esparce, `${e.fichero}: <${e.nombre} {...}> no se puede vigilar; pasa cada prop a mano.`);
    for (const p of PROPS_SOLO_DEL_CATALOGO) {
      assert.ok(!e.props.has(p), `${e.fichero}: <${e.nombre} ${p}> es del catálogo, no de una pantalla de estudio.`);
    }
  }
});

test("fuera de /interno, Tenti solo está en 'reposo' o 'hecho', y 'hecho' solo en Listo", () => {
  for (const f of CONSUMIDORES) {
    const src = leerCodigo(f);
    for (const e of etiquetas(f, src)) {
      const valor = e.props.get('estado');
      assert.ok(valor != null, `${f}: <${e.nombre}> con un estado explícito.`);
      const posibles = estadosPosibles(src, valor!);
      assert.ok(posibles && posibles.length > 0,
        `${f}: estado={${valor}} tiene que ser un literal o una const de este fichero, para poder vigilarlo.`);
      for (const s of posibles!) {
        assert.ok(ESTADOS_PERMITIDOS.has(s), `${f}: '${s}' no es un estado del panel (fase 1: reposo y hecho).`);
        if (s === 'hecho') assert.ok(DONDE_SE_CELEBRA.has(f), `${f}: 'hecho' solo significa «una alumna nueva ya puede reservar».`);
      }
    }
  }
});

test("la única emoción es 'feliz', y saludar() solo en la pantalla del logo", () => {
  for (const f of CONSUMIDORES) {
    const src = leerCodigo(f);
    for (const m of src.matchAll(/\.emocion\s*\(([^)]*)\)/g)) {
      const l = literales(m[1]);
      assert.ok(l.length === 1 && EMOCIONES_PERMITIDAS.has(l[0]) && Object.hasOwn(EMOCIONES, l[0]),
        `${f}: emocion(${m[1].trim()}) — fuera del catálogo solo 'feliz', al guardarse el logo.`);
    }
    if (/\.saludar\s*\(/.test(src)) assert.ok(DONDE_SE_SALUDA.has(f), `${f}: saludar() es del primer contacto, en el logo.`);
  }
});

test(`cada Tenti tiene un tamaño fijo de ${TAMANO_MINIMO} px o más`, () => {
  for (const f of CONSUMIDORES) {
    for (const e of etiquetas(f, leerCodigo(f))) {
      const t = e.props.get('tamano');
      assert.ok(t != null && /^\d+$/.test(t), `${f}: tamano literal (cambiarlo recrea el motor).`);
      assert.ok(Number(t) >= TAMANO_MINIMO, `${f}: tamano={${t}} entra en modo mini.`);
    }
  }
});

// ── 4 · El yogui ya no existe ────────────────────────────────────────────────

test('el yogui SVG de #1333 no vuelve: el blob es el único Tenti', () => {
  for (const f of ['components/marca/tenti.tsx', 'components/marca/tenti-poses.ts']) {
    assert.ok(!existsSync(join(raiz, f)), `${f}: dos mascotas con el mismo nombre son peores que ninguna.`);
  }
  const citan = TODAS.filter(f => imports.get(f)!.some(m => m === 'components/marca/tenti' || m === 'components/marca/tenti-poses'));
  assert.deepEqual(citan, []);
});

// ── 5 · Ni en la marca blanca ni en la migración, tampoco de rebote ──────────

test('nada de la marca blanca ni de la migración llega a components/tenti, ni directo ni de rebote', () => {
  for (const d of SIN_TENTI) assert.ok(existsSync(join(raiz, d)), `${d} ya no existe: actualiza SIN_TENTI.`);
  const vigilados = TODAS.filter(f => SIN_TENTI.some(d => f === d || f.startsWith(`${d}/`)));
  assert.ok(vigilados.length > 0);
  // Hacia atrás desde quien importa components/tenti: todo lo que llega a él,
  // de una pasada. El camino solo se reconstruye si hay culpables.
  const quienImporta = new Map<string, string[]>();
  for (const [f, ms] of imports) for (const m of ms) {
    const g = m ? PORMODULO.get(m) : undefined;
    if (g) quienImporta.set(g, [...(quienImporta.get(g) ?? []), f]);
  }
  const llegan = new Set(TODAS.filter(f => imports.get(f)!.some(esTenti)));
  for (const cola = [...llegan]; cola.length;) {
    for (const g of quienImporta.get(cola.pop()!) ?? []) if (!llegan.has(g)) { llegan.add(g); cola.push(g); }
  }
  const culpables = vigilados.filter(f => llegan.has(f)).map(f => {
    const camino = [f];
    let x = f;
    while (!imports.get(x)!.some(esTenti)) {
      x = imports.get(x)!.map(m => (m ? PORMODULO.get(m) : undefined)).find(g => g && llegan.has(g) && !camino.includes(g))!;
      camino.push(x);
    }
    return [...camino, imports.get(x)!.find(esTenti)].join(' → ');
  });
  assert.deepEqual(culpables, [], 'Ahí manda la marca del estudio, o se mueve dinero con alumnas delante.');
});
