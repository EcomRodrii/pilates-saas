// ─────────────────────────────────────────────────────────────────────────────
// Dónde vive Tenti, y dónde no.
//
// Tenti es Tentare. Donde Tentare interviene —lo hace solo, lo vigila o te lo
// ofrece— va Tenti, y desde el 5-oct-2026 (decisión del fundador) va en TODOS
// los sitios donde antes iba el Orb, que ya no existe. `Sparkles` sigue
// queriendo decir «novedad» (el changelog), y el robot sigue fuera: Tentare no
// es un bot que responde.
//
// Un solo dibujo (lib/tenti/geometria.ts), pintado de dos maneras:
//   · el ICONO (components/tenti/tenti-icono.tsx): SVG quieto, en lo diario. Lo
//     ve quien veía el Orb en cada sitio, también recepción y gerencia.
//   · el PERSONAJE (components/tenti/tenti.tsx): el canvas animado, en las
//     primeras veces de la propietaria (la pantalla del logo y Listo) y, desde
//     el 5-oct (decisión del fundador), decorativo y en reposo en dos sitios
//     que se ven a diario: el buscador ⌘K y el resumen de Automatizaciones.
//     Ahí va siempre por TentiDecorativo, y el motor duerme entre parpadeos.
//
// Estructural a propósito: el motor dibuja once estados y siete emociones, y la
// tentación de «ponerle cara» a una pantalla más es constante. Cada sitio nuevo
// reabre una discusión entera (batería del iPad de recepción, una mascota junto
// a un cobro, un «todo bien» encubierto en un estado vacío), y esa discusión no
// puede saltarse por un import puesto de paso.
//
// ⚠️ Añadir un sitio exige editar las listas de abajo CON SU MOTIVO en un
// comentario, como lib/repo-publico-guardia.test.ts. «Para que pase» no es un
// motivo.
//
// Lo que esta guardia NO ve: cómo se ve Tenti (se mira en el navegador, en claro
// y en oscuro), si la silueta se despega del fondo (lo mide
// lib/tenti/paleta.test.ts) ni cuántos Tentis hay de verdad en una pantalla
// (lo cuentan los e2e, empezando por e2e/tenti-relevo-orb.spec.ts).
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

// Sin comentarios: los ficheros vigilados explican en los suyos por qué va Tenti
// (o por qué no va el destello), y esa explicación no puede hacer fallar a la
// guardia que la describe.
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

/** Los imports que meten código en el chunk de quien importa: estáticos y de
 *  valor. Fuera los `import type`, los que solo traen tipos y los import(), que
 *  van a un chunk aparte (así llega el motor a Listo y a la bienvenida). */
function importsDeValor(sf: ts.SourceFile): string[] {
  const out: string[] = [];
  for (const st of sf.statements) {
    if (ts.isImportDeclaration(st) && ts.isStringLiteral(st.moduleSpecifier)) {
      const c = st.importClause;
      if (c?.isTypeOnly) continue;
      const nb = c?.namedBindings;
      if (c && !c.name && nb && ts.isNamedImports(nb) && nb.elements.length > 0 && nb.elements.every((e) => e.isTypeOnly)) continue;
      out.push(st.moduleSpecifier.text);
    } else if (ts.isExportDeclaration(st) && !st.isTypeOnly && st.moduleSpecifier && ts.isStringLiteral(st.moduleSpecifier)) {
      out.push(st.moduleSpecifier.text);
    }
  }
  return out;
}

const COMPONENTE = 'components/tenti/tenti';
const DIFERIDO = 'components/tenti/tenti-diferido';
const DECORATIVO = 'components/tenti/tenti-decorativo';
const ICONO = 'components/tenti/tenti-icono';
const MOTOR = 'lib/tenti/motor';
const GEOMETRIA = 'lib/tenti/geometria';
const AVISO_MIT = 'Copyright (c) 2026 Louis Raillé';

// ── El icono: dónde está, uno por uno y con su motivo ────────────────────────

/**
 * Cada sitio con Tenti de icono, con cuántos lleva. Son exactamente los sitios
 * donde estaba el Orb (12 en 11 ficheros), con el tamaño de icono que tenía el
 * Orb: ninguno sale ni entra sin editar esta lista. Ya no hay «uno por
 * pantalla»: donde el Orb salía tres veces (Resumen), Tenti también; la
 * densidad es la que ya había.
 */
const CON_TENTI: Record<string, { usos: number; motivo: string }> = {
  // Resumen: los tres sitios donde estaba el Orb.
  'app/(dashboard)/dashboard/page.tsx': { usos: 1, motivo: 'el enlace «Sistema autónomo»: Tentare ejecuta cosas por su cuenta (solo la propietaria)' },
  'components/dashboard/hoy-en-el-estudio.tsx': { usos: 1, motivo: 'la tira «Tentare ha encontrado…»: lo que Tentare ha visto en la agenda del día' },
  'components/dashboard/estado-del-estudio.tsx': { usos: 1, motivo: '«Tentare lo está haciendo»: lo que está en marcha sin que lo toques' },
  'app/(dashboard)/automatizaciones/page.tsx': { usos: 2, motivo: '«Esto ya lo hace Tentare…» (lo que hace solo y de serie) y la fila «Sistema autónomo» del resumen del día' },
  'components/decision/piloto-automatico.tsx': { usos: 1, motivo: 'el piloto automático: ejecuta solo lo de alta confianza' },
  'app/(dashboard)/migracion/page.tsx': { usos: 1, motivo: 'el botón «Analizar»: Tentare lee archivos que no ha visto nunca y decide qué es cada columna' },
  'app/(dashboard)/clientas/importar/page.tsx': { usos: 1, motivo: 'el enlace a la migración automática: lleva la marca de su destino' },
  // Los tres botones que llaman de verdad a un modelo (lib/ai/*).
  'components/calendario/adaptaciones-clase.tsx': { usos: 1, motivo: '«Preparar clase con IA»' },
  'components/socios/ficha-salud.tsx': { usos: 1, motivo: '«Adaptar ejercicios con IA»' },
  'components/socios/modal-nota-voz.tsx': { usos: 1, motivo: '«Estructurar con IA», del piloto de la nota de voz' },
  'app/(dashboard)/bienvenido-apertura/page.tsx': { usos: 1, motivo: 'las tres preguntas de apertura, donde estaba el Orb (ningún enlace trae aquí desde #2270)' },
};

/** Los únicos props del icono. El tipo cierra el resto (titulo incluido), y
 *  components/tenti/tenti-icono.tipos.ts lo comprueba con tsc. */
const PROPS_DEL_ICONO = new Set(['ancho', 'estado', 'sobre', 'className']);
const ANCHOS_DEL_ICONO = new Set(['18', '20', '22', '24', '28']);

/**
 * Donde Tenti puede estar 'pensando': una petición de verdad en vuelo y con
 * fin, cuyo resultado vuelve a esa misma pantalla. Nunca por un clic optimista,
 * un guardado, una importación de filas o la carga de la pantalla.
 *
 * Los botones, uno a uno: antes eran `<Bot>`/`<Sparkles>` y, al pulsar,
 * `<Loader2>` girando: dos dibujos distintos para el mismo objeto, y al empezar
 * a trabajar parecía que hubiera empezado otra cosa. Tenti no se cambia: cambia
 * de estado, siempre con la forma `X ? 'pensando' : 'reposo'`, y el botón dice
 * aria-busy mientras tanto (ocupado no es deshabilitado: no se atenúa).
 *
 * `sinSpinner` dice si en ese fichero NO puede quedar ningún `Loader2`. En la
 * migración queda uno legítimo y a propósito: el paso de importar es meter
 * filas en la base de datos, trabajo mecánico, no Tentare decidiendo nada.
 */
const PENSANDO_CUANDO: { fichero: string; variable: string; sinSpinner: boolean }[] = [
  { fichero: 'components/calendario/adaptaciones-clase.tsx', variable: 'preparando', sinSpinner: true },
  { fichero: 'components/socios/ficha-salud.tsx', variable: 'adaptacionIALoading', sinSpinner: true },
  { fichero: 'components/socios/modal-nota-voz.tsx', variable: 'procesando', sinSpinner: true },
  { fichero: 'app/(dashboard)/migracion/page.tsx', variable: "paso === 'analizando'", sinSpinner: false },
];

// ── El personaje (canvas): quién puede importarlo. Cada entrada, con su motivo.

/** Los únicos que importan `components/tenti/tenti`. */
const IMPORTAN_EL_COMPONENTE = new Set([
  // El catálogo de Tentare-empresa: el único sitio donde se enciende todo
  // (sonido, toques, insignias, los once estados).
  'app/interno/tenti/page.tsx',
  // La bienvenida del logo. Import ESTÁTICO a propósito: el fichero ya viaja en
  // el chunk diferido de PantallaBienvenida, y el ref de saludar()/emocion() no
  // atraviesa next/dynamic.
  'components/onboarding/pantallas-valor.tsx',
  // Los dos envoltorios diferidos, que solo importan el TIPO y el módulo dentro de dynamic().
  'components/tenti/tenti-diferido.tsx',
  'components/tenti/tenti-decorativo.tsx',
]);

/** Los únicos que importan `components/tenti/tenti-diferido`. */
const IMPORTAN_EL_DIFERIDO = new Set([
  // «Tu estudio ya puede recibir reservas»: cuelga sin diferir de /calendario y
  // de PrimerHorario, así que el motor solo puede llegar por el diferido.
  'components/onboarding/listo-para-reservar.tsx',
]);

/**
 * Los únicos que importan `components/tenti/tenti-decorativo`: el canvas en lo
 * diario, con su tamaño. Decorativo, siempre en reposo y sin nada que pedir más
 * que hacia dónde mira; lo ve cualquier rol que llegue ahí.
 */
const IMPORTAN_EL_DECORATIVO: Record<string, { tamano: number; motivo: string }> = {
  // El buscador ⌘K («¿Qué quieres hacer o buscar?»): al abrir la hoja, Tenti
  // aparece en el sitio de la lupa y mira hacia lo que se escribe. Lo ven los
  // tres roles del panel. Solo vive con la hoja abierta. 40 px: la fila del
  // input no crece (el cuerpo mide unos 27 px).
  'components/search/global-search.tsx': { tamano: 40, motivo: 'el buscador ⌘K: Tentare te ayuda a encontrar lo que quieres hacer' },
  // El resumen del día de Automatizaciones, en el sitio de la baldosa del Zap
  // (56 px, la misma caja): la cara de lo que Tentare hace solo. Pantalla solo
  // de la propietaria.
  'app/(dashboard)/automatizaciones/page.tsx': { tamano: 56, motivo: 'el resumen del día de Automatizaciones: lo que Tentare hace solo' },
};

/** Los únicos props de <TentiDecorativo>. El tipo cierra el resto (estado incluido). */
const PROPS_DEL_DECORATIVO = new Set(['tamano', 'reserva', 'mira', 'className']);

/** Donde 'hecho' está permitido: significa UNA cosa en todo el producto, que el
 *  servidor confirmó que una alumna nueva puede reservar. */
const DONDE_SE_CELEBRA = new Set(['components/onboarding/listo-para-reservar.tsx']);

/** Donde se saluda: el primer contacto, en la pantalla del logo. */
const DONDE_SE_SALUDA = new Set(['components/onboarding/pantallas-valor.tsx']);

/** Lo que el catálogo enciende y nadie más: valores por defecto seguros. */
const PROPS_SOLO_DEL_CATALOGO = ['interactivo', 'sonido', 'saludaAlAparecer', 'insignias', 'titulo', 'catalogo'];

/** Estados y emociones del canvas fuera del catálogo. 'pensando' no está: en el
 *  panel solo existe en el icono (ver PENSANDO_CUANDO). */
const ESTADOS_PERMITIDOS = new Set(['reposo', 'hecho']);
const EMOCIONES_PERMITIDAS = new Set(['feliz']);

/** Lo que fuera del catálogo no aparece ni como texto en quien usa a Tenti:
 *  'trabajando' se lee «la IA escribe», 'buscando' escanea sin fin, 'esperaTuOk'
 *  es de la bandeja única (#1401) y contradice el Contrato, 'dormido' se lee
 *  «Tentare apagado» con los crons corriendo. 'error' no está porque es una
 *  palabra de cualquier pantalla: la vigila la etiqueta (`estado=`), no el texto. */
const ESTADOS_DEL_CATALOGO = ['esperaTuOk', 'trabajando', 'buscando', 'dormido', 'pregunta', 'agobiado', 'mareado'];

/** Por debajo de 64 px el motor entra en modo mini, que es otro dibujo. */
const TAMANO_MINIMO = 64;

/**
 * Donde no entra ningún Tenti, ni directo ni de rebote, con su motivo. Los
 * ficheros de Informes solo directo: Tenti entrará ahí por un componente propio
 * de lecturas, nunca por las piezas del dinero.
 */
const VETADOS: { grupo: string; motivo: string; rutas: string[]; deRebote: boolean }[] = [
  {
    grupo: 'marca blanca', deRebote: true,
    motivo: 'ahí manda la marca del ESTUDIO: la alumna no conoce a Tentare',
    rutas: [
      'app/portal', 'app/reservar', 'app/kiosk', 'app/widget-bundle', 'app/widget-auth-retorno',
      'components/widget', 'components/widgets', 'components/checkout-widget', 'components/cuenta-widget',
      'components/student', 'components/reserva', 'components/reservar', 'lib/emails', 'emails',
    ],
  },
  {
    grupo: 'web comercial', deRebote: true,
    motivo: 'son promesas de venta que decide el fundador: Tenti en la web se propone, no se pone',
    rutas: [
      'components/landing', 'components/funcionalidades', 'app/funcionalidades', 'app/precios',
      'app/comparativa', 'app/soluciones', 'app/recursos', 'app/glosario',
    ],
  },
  {
    grupo: 'soporte', deRebote: true,
    motivo: 'la promesa es «te responde una persona, no una IA», y una mascota en el punto de contacto se lee como un bot',
    rutas: ['components/layout/whatsapp-fab.tsx', 'components/layout/help-widget.tsx', 'components/ayuda', 'app/ayuda'],
  },
  {
    grupo: 'dinero', deRebote: true,
    motivo: 'tiene que ser sobrio: una mascota junto a un cobro se lee como manipulación',
    rutas: [
      'app/(dashboard)/cobros', 'app/(dashboard)/pos', 'app/(dashboard)/cierre', 'app/(dashboard)/facturas',
      'app/(dashboard)/pagos', 'app/(dashboard)/transacciones', 'components/cobros', 'components/pos', 'components/billing',
    ],
  },
  {
    grupo: 'dinero de Informes', deRebote: false,
    motivo: 'el titular, el dinero y el margen van sin cara; Tenti entra en Informes solo por su propio componente de lecturas',
    rutas: [
      'app/(dashboard)/informes/page.tsx', 'components/informes/piezas.tsx', 'components/informes/bloque-dinero.tsx',
      'components/informes/grafico-dinero.tsx', 'components/informes/bloque-clientas.tsx', 'components/informes/bloque-clases.tsx',
    ],
  },
  {
    grupo: 'Centro de Control', deRebote: true,
    motivo: 'el veredicto, el Contrato y las filas los puede redactar un modelo en primera persona: una cara al lado es «la IA que te habla»',
    rutas: [
      'veredicto-del-dia', 'contrato-decision-os', 'empty-state', 'while-you-slept', 'fila-situacion', 'fila-especialista',
      'activity-list', 'bandeja-hoy', 'action-center', 'riesgo-planton', 'especialista-cartera', 'codigos-descuento',
    ].map((f) => `components/decision/${f}.tsx`),
  },
];

// Lo que ya vigila su propio fichero: el catálogo y Tenti por dentro.
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
const esDeTenti = (m: string | null) => esTenti(m) || m === 'lib/tenti' || !!m?.startsWith('lib/tenti/');

const TEXTOS = new Map(TODAS.map(f => [f, leer(f)]));
const ARBOLES = new Map(TODAS.map(f => [f, arbol(f, TEXTOS.get(f)!)]));
const imports = new Map(TODAS.map(f => [f, importsDe(ARBOLES.get(f)!).map(i => modulo(f, i.spec))]));
const importsValor = new Map(TODAS.map(f => [f, importsDeValor(ARBOLES.get(f)!).map(s => modulo(f, s))]));

/** El fichero real de un módulo, o null si no está entre las fuentes. */
const PORMODULO = new Map(TODAS.map(f => [f.replace(/\.tsx?$/, '').replace(/\/index$/, ''), f]));

/** Todo lo que entra en el chunk de `desde` por imports estáticos de valor. */
function cierreDeValor(desde: string): Set<string> {
  const vistos = new Set<string>([desde]);
  for (const cola = [desde]; cola.length;) {
    for (const m of importsValor.get(cola.pop()!) ?? []) {
      const g = m ? PORMODULO.get(m) : undefined;
      if (g && !vistos.has(g)) { vistos.add(g); cola.push(g); }
    }
  }
  return vistos;
}
const sinExt = (f: string) => f.replace(/\.tsx?$/, '');

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

test('los imports de valor dejan fuera los tipos y los import() (otro chunk)', () => {
  const src = [
    "import type { A } from './solo-tipo';",
    "import { type B, type C } from './solo-tipos';",
    "import { D, type E } from './valor-y-tipo';",
    "import './estilos.css';",
    "export { F } from './reexporta';",
    "export type { G } from './reexporta-tipo';",
    "const H = dynamic(() => import('./diferido'));",
  ].join('\n');
  assert.deepEqual(importsDeValor(arbol('x.tsx', src)), ['./valor-y-tipo', './estilos.css', './reexporta']);
});

// ── 1 · El Orb ya no existe ──────────────────────────────────────────────────

test('el Orb ya no existe: ni su componente, ni quien lo use, ni su CSS', () => {
  assert.ok(!existsSync(join(raiz, 'components/marca/tentare-orb.tsx')),
    'Tenti releva al Orb (5-oct-2026, decisión del fundador): dos marcas de «esto lo hace Tentare» no dicen nada.');
  // Primero el texto en crudo (barato) y luego sin comentarios: una historia
  // contada en un comentario no es un Orb.
  const conOrb = TODAS.filter(f => (TEXTOS.get(f)!.includes('TentareOrb') && /\bTentareOrb\b/.test(leerCodigo(f)))
    || imports.get(f)!.includes('components/marca/tentare-orb'));
  assert.deepEqual(conOrb, [], 'Donde iba el Orb va <TentiIcono>.');
  // En CUALQUIER bloque y también en los comentarios: el Orb vivía en un
  // segundo :root que paleta.test.ts no lee, y un comentario que lo nombra es
  // una invitación a devolverlo.
  const css = leer('app/globals.css');
  for (const resto of ['.orb-tentare', '.orb-luz', '--orb-', 'orb-giro', 'orb-respira']) {
    assert.ok(!css.includes(resto), `app/globals.css aún tiene «${resto}»`);
  }
});

test('el yogui SVG de #1333 no vuelve: el blob es el único Tenti', () => {
  for (const f of ['components/marca/tenti.tsx', 'components/marca/tenti-poses.ts']) {
    assert.ok(!existsSync(join(raiz, f)), `${f}: dos mascotas con el mismo nombre son peores que ninguna.`);
  }
  const citan = TODAS.filter(f => imports.get(f)!.some(m => m === 'components/marca/tenti' || m === 'components/marca/tenti-poses'));
  assert.deepEqual(citan, []);
});

// ── 2 · El icono: en todos los sitios del Orb, y solo en ellos ───────────────

test('el icono lo importan exactamente los sitios de CON_TENTI', () => {
  const importan = TODAS.filter(f => !f.startsWith('components/tenti/') && imports.get(f)!.includes(ICONO)).sort();
  assert.deepEqual(importan, Object.keys(CON_TENTI).sort(),
    'Un sitio nuevo para Tenti (o uno que lo pierde) es una decisión de producto: edita CON_TENTI con su motivo.');
});

for (const [fichero, { usos, motivo }] of Object.entries(CON_TENTI)) {
  test(`${fichero}: ${usos === 1 ? 'un Tenti' : `${usos} Tentis`} (${motivo}), sin destellos ni robot`, () => {
    const src = leerCodigo(fichero);
    assert.equal(src.match(/<TentiIcono\b/g)?.length ?? 0, usos,
      `Tenti va exactamente ${usos} vez/veces aquí. Si cambia, cambia CON_TENTI con su motivo.`);
    // El nombre a secas: el import y una etiqueta por uso, nada más. Un alias
    // (`const Cara = TentiIcono; <Cara estado="pensando" />`) se saltaría el
    // recuento, los props cerrados y la regla de 'pensando', y tsc no lo para.
    assert.equal(src.match(/\bTentiIcono\b/g)?.length ?? 0, usos + 1,
      `${fichero}: TentiIcono solo puede aparecer en su import y en sus ${usos} etiqueta(s); nada de alias.`);
    assert.doesNotMatch(src, /\bSparkles\b/, '`Sparkles` significa «novedad» (el changelog). Para «esto lo hace Tentare», Tenti.');
    assert.doesNotMatch(src, /<Bot\b/, 'El robot tampoco: Tentare no es un bot que responde, es un sistema que decide.');
  });
}

test('cada <TentiIcono> lleva un ancho cerrado, sin esparcir props', () => {
  const vistas = Object.keys(CON_TENTI).flatMap(f => etiquetas(f, leerCodigo(f), ['TentiIcono']));
  assert.equal(vistas.length, Object.values(CON_TENTI).reduce((s, c) => s + c.usos, 0));
  for (const e of vistas) {
    assert.ok(!e.esparce, `${e.fichero}: <TentiIcono {...}> no se puede vigilar; pasa cada prop a mano.`);
    for (const p of e.props.keys()) assert.ok(PROPS_DEL_ICONO.has(p), `${e.fichero}: <TentiIcono ${p}> no es un prop del icono.`);
    const ancho = e.props.get('ancho');
    assert.ok(ancho != null && ANCHOS_DEL_ICONO.has(ancho), `${e.fichero}: ancho={${ancho}}: los anchos son ${[...ANCHOS_DEL_ICONO].join(', ')}.`);
    const sobre = e.props.get('sobre');
    assert.ok(sobre == null || sobre === '"invertida"', `${e.fichero}: sobre=${sobre}: o se omite o es "invertida".`);
  }
});

test("'pensando' solo con una petición en vuelo, con su forma exacta y aria-busy", () => {
  const conPensando = new Map(PENSANDO_CUANDO.map(p => [p.fichero, p.variable]));
  for (const f of Object.keys(CON_TENTI)) {
    const src = leerCodigo(f);
    for (const e of etiquetas(f, src, ['TentiIcono'])) {
      const valor = e.props.get('estado');
      if (valor == null || valor === "'reposo'" || valor === '"reposo"') continue;
      const variable = conPensando.get(f);
      assert.ok(variable, `${f}: estado={${valor}}. Fuera de PENSANDO_CUANDO, Tenti es la firma: 'reposo' (o sin estado).`);
      assert.equal(valor, `${variable} ? 'pensando' : 'reposo'`,
        `${f}: 'pensando' va con la forma «${variable} ? 'pensando' : 'reposo'», la de su petición en vuelo.`);
    }
  }
});

for (const { fichero, variable, sinSpinner } of PENSANDO_CUANDO) {
  test(`${fichero}: el botón no cambia de icono al ponerse a trabajar, y dice aria-busy`, () => {
    const src = leerCodigo(fichero);
    const esc = variable.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    assert.match(src, new RegExp(`<TentiIcono[^>]*estado=\\{${esc} \\? 'pensando' : 'reposo'\\}`),
      'El mismo Tenti, en su estado «pensando». No un icono que se cambia por otro.');
    assert.match(src, new RegExp(`aria-busy=\\{${esc}\\}`),
      'Mientras trabaja, el botón dice aria-busy (ocupado no es deshabilitado: no se atenúa).');
    if (sinSpinner) {
      assert.doesNotMatch(src, /Loader2/,
        'El spinner genérico sobra: Tenti ya dice que está trabajando, y el texto del botón también.');
    }
  });
}

test('el icono no arrastra el motor: SVG quieto, la geometría compartida y el aviso de la licencia', () => {
  const icono = leerCodigo(`${ICONO}.tsx`);
  assert.doesNotMatch(icono, /requestAnimationFrame/, 'El icono no anima por JavaScript: \'pensando\' respira por CSS.');
  assert.ok(importsValor.get(`${ICONO}.tsx`)!.includes(GEOMETRIA), 'El icono se dibuja con lib/tenti/geometria.');
  const cierre = cierreDeValor(`${ICONO}.tsx`);
  for (const m of [MOTOR, COMPONENTE, 'lib/tenti/sonidos']) {
    assert.ok(![...cierre].some(f => sinExt(f) === m), `El icono mete ${m} en el chunk de cada pantalla que lo usa.`);
  }
  assert.ok(importsValor.get(`${MOTOR}.ts`)!.includes(GEOMETRIA), 'motor.ts dibuja con la misma geometría que el icono.');
  for (const f of [`${GEOMETRIA}.ts`, `${ICONO}.tsx`, `${MOTOR}.ts`]) {
    assert.ok(leer(f).includes(AVISO_MIT), `${f}: el dibujo es de Coucou (MIT) y lleva su aviso.`);
  }
  // Los tipos cerrados del icono los vigila tsc, no esta guardia: que el fichero
  // que lo comprueba siga ahí y con sus casos.
  const tipos = leer(`${ICONO}.tipos.ts`);
  for (const caso of ['{ ancho: 16 }', "estado: 'hecho'", "estado: 'esperaTuOk'", "titulo: 'Tenti'"]) {
    assert.ok(new RegExp(`@ts-expect-error[^\\n]*\\n[^\\n]*${caso.replace(/[{}]/g, '\\$&')}`).test(tipos),
      `${ICONO}.tipos.ts ya no comprueba ${caso}.`);
  }
});

// ── 3 · El personaje (canvas): quién lo importa ──────────────────────────────

test('solo cuatro ficheros importan el componente de Tenti, solo Listo el diferido y los sitios de lo diario el decorativo', () => {
  const delComponente = TODAS.filter(f => imports.get(f)!.includes(COMPONENTE)).sort();
  assert.deepEqual(delComponente, [...IMPORTAN_EL_COMPONENTE].sort(),
    'Un sitio nuevo para el canvas es una decisión de producto: añádelo a IMPORTAN_EL_COMPONENTE con su motivo. ' +
    'Y si cuelga de algo que se carga siempre, que use TentiDiferido.');
  const delDiferido = TODAS.filter(f => imports.get(f)!.includes(DIFERIDO)).sort();
  assert.deepEqual(delDiferido, [...IMPORTAN_EL_DIFERIDO].sort(),
    'TentiDiferido solo está en «Tu estudio ya puede recibir reservas».');
  const delDecorativo = TODAS.filter(f => imports.get(f)!.includes(DECORATIVO)).sort();
  assert.deepEqual(delDecorativo, Object.keys(IMPORTAN_EL_DECORATIVO).sort(),
    'El canvas en una pantalla de todos los días es una decisión de producto: añádelo a IMPORTAN_EL_DECORATIVO con su motivo.');
  const otros = TODAS.filter(f => !f.startsWith('components/tenti/')
    && imports.get(f)!.some(m => esTenti(m) && m !== COMPONENTE && m !== DIFERIDO && m !== DECORATIVO && m !== ICONO));
  assert.deepEqual(otros, [], 'components/tenti solo expone el componente, sus dos versiones diferidas y el icono.');
});

test('el motor solo lo importan Tenti por dentro y el catálogo', () => {
  const importanMotor = TODAS.filter(f => imports.get(f)!.includes(MOTOR));
  for (const f of importanMotor) {
    assert.ok(f.startsWith('lib/tenti/') || f === `${COMPONENTE}.tsx` || f.startsWith('app/interno/'),
      `${f} importa el motor: el canvas se usa a través de <Tenti>, y el icono no lo necesita.`);
  }
});

test('ninguna pantalla del panel lleva el motor en su chunk: llega aparte, y solo al hacer falta', () => {
  // Siguiendo solo imports estáticos de valor: el motor entra en Listo y en la
  // bienvenida por import() (otro chunk), y en ninguna pantalla de lo diario
  // por el camino de siempre.
  const panel = TODAS.filter(f => f.startsWith('app/(dashboard)/'));
  assert.ok(panel.length > 30);
  const llevan = panel.filter(f => [...cierreDeValor(f)].some(g => sinExt(g) === MOTOR || sinExt(g) === COMPONENTE));
  assert.deepEqual(llevan, [], 'Estas pantallas descargan el motor de Tenti nada más entrar.');
});

test('quien importa a Tenti no le cambia el nombre (la guardia lo busca por su etiqueta)', () => {
  for (const f of TODAS.filter(x => !FUERA_DE_LAS_REGLAS(x) && imports.get(x)!.some(esTenti))) {
    for (const { spec, nodo } of importsDe(ARBOLES.get(f)!)) {
      if (!esTenti(modulo(f, spec))) continue;
      // Un import() o un re-export lo deja con el nombre que quiera quien lo use.
      const clausula = ts.isImportDeclaration(nodo) ? nodo.importClause : undefined;
      const nombres = clausula?.namedBindings;
      assert.ok(clausula && !clausula.name && nombres && ts.isNamedImports(nombres),
        `${f}: \`import { … } from\`, no por defecto, \`* as\`, import() ni re-export.`);
      for (const e of nombres.elements) {
        assert.ok(!e.propertyName, `${f}: un alias esconde las etiquetas <Tenti…> de esta guardia.`);
      }
    }
  }
});

// ── 4 · El diferido decide antes de descargar nada ───────────────────────────

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

test('TentiDecorativo trae el motor por dynamic(), sin SSR, con la reserva mientras carga y siempre en reposo', () => {
  const src = leerCodigo(`${DECORATIVO}.tsx`);
  for (const m of src.matchAll(/import\s+([^;]*?)\s+from\s*['"]\.\/tenti['"]/g)) {
    assert.match(m[1], /^type\s/, 'De ./tenti solo el tipo: un import de valor mete el motor en el chunk del panel (el buscador va en todas las pantallas).');
  }
  assert.equal([...src.matchAll(/\bimport\s*\(\s*['"]\.\/tenti['"]\s*\)/g)].length, 1, 'Un solo import() del componente.');
  assert.match(src, /^const\s+\w+\s*=\s*dynamic\s*(<[^>]*>)?\s*\(\s*\(\)\s*=>\s*import\s*\(\s*['"]\.\/tenti['"]\s*\)[\s\S]*?\.catch\([\s\S]*?\{[^}]*\bssr\s*:\s*false/m,
    "dynamic(() => import('./tenti').then(…).catch(…), { ssr: false }) a nivel de módulo: si el chunk no llega, lo de siempre.");
  assert.match(src, /loading\s*:\s*\(\)\s*=>\s*<SoloReserva\s*\/>/, 'Mientras llega el chunk, la reserva (la lupa, el Zap): nada salta.');
  const lienzos = etiquetas(`${DECORATIVO}.tsx`, src, ['TentiCanvas']);
  assert.equal(lienzos.length, 1);
  const [lienzo] = lienzos;
  assert.equal(lienzo.props.get('estado'), '"reposo"', 'Siempre en reposo: si hay algo que avisar, lo dice el texto.');
  assert.deepEqual([...lienzo.props.keys()].sort(), ['className', 'estado', 'mira', 'reserva', 'tamano'],
    'Ni sonido, ni toques, ni saludo, ni insignias, ni seguir al cursor, ni nombre accesible: es decorativo.');
  const props = src.slice(src.indexOf('interface PropsTentiDecorativo'), src.indexOf('const ReservaCtx'));
  assert.match(props, /tamano\s*:\s*40\s*\|\s*56\s*;/, 'Los tamaños del decorativo son cerrados (40 | 56): así lo vigila también tsc.');
  for (const p of [...PROPS_SOLO_DEL_CATALOGO, 'estado', 'sigueCursor']) {
    assert.doesNotMatch(props, new RegExp(`\\b${p}\\b`), `TentiDecorativo no expone \`${p}\`.`);
  }
});

for (const [fichero, { tamano, motivo }] of Object.entries(IMPORTAN_EL_DECORATIVO)) {
  test(`${fichero}: un TentiDecorativo de ${tamano} px (${motivo})`, () => {
    const src = leerCodigo(fichero);
    const vistas = etiquetas(fichero, src, ['TentiDecorativo']);
    assert.equal(vistas.length, 1, 'Uno, en su sitio. Si cambia, cambia IMPORTAN_EL_DECORATIVO con su motivo.');
    assert.equal(src.match(/\bTentiDecorativo\b/g)?.length ?? 0, 2, 'TentiDecorativo solo en su import y en su etiqueta: nada de alias.');
    const [e] = vistas;
    assert.ok(!e.esparce, '<TentiDecorativo {...}> no se puede vigilar; pasa cada prop a mano.');
    for (const p of e.props.keys()) assert.ok(PROPS_DEL_DECORATIVO.has(p), `<TentiDecorativo ${p}> no es un prop del decorativo.`);
    assert.equal(e.props.get('tamano'), String(tamano), `tamano={${tamano}}, literal: cambiarlo recrea el motor.`);
    assert.ok(e.props.get('reserva'), 'Con la reserva de siempre (la lupa, el Zap) para mientras carga o si falla.');
  });
}

// ── 5 · Lo que se le deja hacer fuera del catálogo ───────────────────────────

interface Etiqueta { fichero: string; nombre: string; props: Map<string, string | null>; esparce: boolean }

/** Las etiquetas <Nombre …> pedidas, con sus props al nivel de la etiqueta. */
function etiquetas(fichero: string, src: string, nombres = ['TentiDiferido', 'Tenti']): Etiqueta[] {
  const out: Etiqueta[] = [];
  for (const m of src.matchAll(new RegExp(`<(${nombres.join('|')})(?![\\w$])`, 'g'))) {
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

test('fuera de /interno, el canvas no suena, no se toca, no saluda solo, no lleva insignia y es decorativo', () => {
  const vistas = CONSUMIDORES.flatMap(f => etiquetas(f, leerCodigo(f)));
  assert.ok(vistas.length >= 3, 'La guardia tiene que ver las etiquetas de la bienvenida (2) y de Listo (1).');
  for (const e of vistas) {
    assert.ok(!e.esparce, `${e.fichero}: <${e.nombre} {...}> no se puede vigilar; pasa cada prop a mano.`);
    for (const p of PROPS_SOLO_DEL_CATALOGO) {
      assert.ok(!e.props.has(p), `${e.fichero}: <${e.nombre} ${p}> es del catálogo, no de una pantalla de estudio.`);
    }
  }
});

test("fuera de /interno, el canvas solo está en 'reposo' o 'hecho', y 'hecho' solo en Listo", () => {
  for (const f of CONSUMIDORES) {
    const src = leerCodigo(f);
    for (const e of etiquetas(f, src)) {
      const valor = e.props.get('estado');
      assert.ok(valor != null, `${f}: <${e.nombre}> con un estado explícito.`);
      const posibles = estadosPosibles(src, valor!);
      assert.ok(posibles && posibles.length > 0,
        `${f}: estado={${valor}} tiene que ser un literal o una const de este fichero, para poder vigilarlo.`);
      for (const s of posibles!) {
        assert.ok(ESTADOS_PERMITIDOS.has(s), `${f}: '${s}' no es un estado del canvas en el panel (reposo y hecho; 'pensando' es solo del icono).`);
        if (s === 'hecho') assert.ok(DONDE_SE_CELEBRA.has(f), `${f}: 'hecho' solo significa «una alumna nueva ya puede reservar».`);
      }
    }
  }
});

test('fuera de /interno, ningún estado del catálogo asoma en quien usa a Tenti', () => {
  // Una regex suelta sobre «'error'» casaría con el `'error' in r` de media
  // docena de pantallas; estos siete nombres solo los usa el motor.
  for (const f of TODAS.filter(x => !FUERA_DE_LAS_REGLAS(x) && !x.startsWith('lib/tenti/') && imports.get(x)!.some(esDeTenti))) {
    const src = leerCodigo(f);
    for (const e of ESTADOS_DEL_CATALOGO) {
      assert.doesNotMatch(src, new RegExp(`['"\`]${e}['"\`]`), `${f}: '${e}' es del catálogo (/interno/tenti), no de una pantalla de estudio.`);
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

test(`cada canvas tiene un tamaño fijo de ${TAMANO_MINIMO} px o más`, () => {
  for (const f of CONSUMIDORES) {
    for (const e of etiquetas(f, leerCodigo(f))) {
      const t = e.props.get('tamano');
      assert.ok(t != null && /^\d+$/.test(t), `${f}: tamano literal (cambiarlo recrea el motor).`);
      assert.ok(Number(t) >= TAMANO_MINIMO, `${f}: tamano={${t}} entra en modo mini.`);
    }
  }
});

// ── 6 · Donde no entra ningún Tenti ──────────────────────────────────────────

test('ningún Tenti en la marca blanca, la web comercial, el soporte, el dinero ni el Centro de Control', () => {
  // Hacia atrás desde quien importa algo de Tenti: todo lo que llega a él, de
  // una pasada. El camino solo se reconstruye si hay culpables.
  const quienImporta = new Map<string, string[]>();
  for (const [f, ms] of imports) for (const m of ms) {
    const g = m ? PORMODULO.get(m) : undefined;
    if (g) quienImporta.set(g, [...(quienImporta.get(g) ?? []), f]);
  }
  const directos = new Set(TODAS.filter(f => imports.get(f)!.some(esDeTenti)));
  const llegan = new Set(directos);
  for (const cola = [...llegan]; cola.length;) {
    for (const g of quienImporta.get(cola.pop()!) ?? []) if (!llegan.has(g)) { llegan.add(g); cola.push(g); }
  }
  const camino = (f: string) => {
    const pasos = [f];
    let x = f;
    while (!directos.has(x)) {
      x = imports.get(x)!.map(m => (m ? PORMODULO.get(m) : undefined)).find(g => g && llegan.has(g) && !pasos.includes(g))!;
      pasos.push(x);
    }
    return [...pasos, imports.get(x)!.find(esDeTenti)].join(' → ');
  };
  const culpables: string[] = [];
  for (const { grupo, motivo, rutas, deRebote } of VETADOS) {
    for (const r of rutas) assert.ok(existsSync(join(raiz, r)), `${r} ya no existe: actualiza VETADOS (${grupo}).`);
    const vigilados = TODAS.filter(f => rutas.some(r => f === r || f.startsWith(`${r}/`)));
    assert.ok(vigilados.length > 0, `${grupo}: no vigila ningún fichero`);
    for (const f of vigilados) {
      if (deRebote ? llegan.has(f) : directos.has(f)) culpables.push(`${grupo} (${motivo}): ${camino(f)}`);
    }
  }
  assert.deepEqual(culpables, []);
});

// ── 7 · Un icono, un significado ─────────────────────────────────────────────

// El otro lado del trato. Si algún día `Sparkles` deja de significar «novedad»,
// este test cae y obliga a revisar la regla entera en vez de dejarla a medias.
test('«Sparkles» sigue siendo el icono del changelog', () => {
  const src = leerCodigo('app/ayuda/novedades/page.tsx');
  assert.match(src, /NUEVA_FUNCIONALIDAD[\s\S]{0,120}Sparkles/,
    'Si esto cambia, Tenti deja de tener con qué contrastar y hay que replantear el criterio.');
});

// El emoji era peor que un icono equivocado: ni siquiera era parte de un
// sistema. Se comprueba aparte porque CON_TENTI mira etiquetas, no caracteres.
test('app/(dashboard)/clientas/importar/page.tsx: ya no queda ningún ✨ suelto', () => {
  assert.doesNotMatch(leerCodigo('app/(dashboard)/clientas/importar/page.tsx'), /✨/,
    'Aquí va Tenti: es un enlace a lo que Tentare hace por ti, y su marca no es un emoji que cada sistema dibuja a su manera.');
});
