// ─────────────────────────────────────────────────────────────────────────────
// Un error se ve como error (P0.3, 12-oct-2026): trinquete.
//
// El mecanismo existe desde la auditoría del 15-sep (`components/ui/toast.tsx`:
// `showError`, `{ variant: 'error' }`, rojo, `role="alert"`, 8 s), pero casi
// nadie lo usaba: los fallos salían con el ✓ VERDE del éxito durante 3 s. Es el
// bug histórico de este repo —anunciar éxito con el servidor diciendo que no—
// movido a la capa que lo enseña: la escritura sí distinguía, la pantalla no.
//
// Esta guardia cuenta, por fichero, las llamadas a un toast —o a los callbacks
// con que una pantalla se lo pasa a sus piezas: `onHecho`, `onAviso`,
// `setAviso`— cuyo texto es un error (`.error`, «No se ha podido…», «no se
// pudieron…») y que NO dicen `variant: 'error'`. Con el AST: una llamada en
// varias líneas cuenta, un comentario no. El tope de cada fichero solo puede BAJAR, y un fichero que
// no está en la lista tiene tope 0. Las cinco pantallas de P0.3 (Calendario,
// la ficha de la clienta, Paquetes, Tipos de clase y Clientas) ya están a 0.
//
// ── Si esto falla ────────────────────────────────────────────────────────────
// · Has añadido un error en verde: usa `showError` / `showToastError`, o pasa
//   `{ variant: 'error' }` (y que el `<Toast>` de esa pantalla reciba `variant`).
// · Has arreglado errores de un fichero: baja su número aquí (o bórralo si llega
//   a 0). Así el trinquete no vuelve a subir.
// · Es un falso positivo (un texto que no es un fallo): pon el comentario
//   `// toast-no-es-error` en esa línea, con el motivo.
// ─────────────────────────────────────────────────────────────────────────────
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import ts from 'typescript';

const raiz = join(import.meta.dirname, '..');

/** Lo que queda por pasar a rojo, medido el 12-oct-2026. Solo puede bajar. */
const TOPES: Record<string, number> = {
  'app/(dashboard)/automatizaciones/page.tsx': 2,
  'app/(dashboard)/cierre/page.tsx': 3,
  'app/(dashboard)/dashboard/page.tsx': 2,
  'app/(dashboard)/equipo/liquidaciones/page.tsx': 6,
  'app/(dashboard)/equipo/page.tsx': 4,
  'app/(dashboard)/equipo/tiempo-trabajado/page.tsx': 1,
  'app/(dashboard)/equipo/verificaciones-network/page.frozen.tsx': 1,
  'app/(dashboard)/marketing/page.tsx': 14,
  'app/(dashboard)/ondemand/page.frozen.tsx': 1,
  'app/interno/crecimiento/prospeccion.tsx': 1,
  'app/interno/denuncias/page.tsx': 1,
  'app/network/solicitudes/page.tsx': 1,
  'app/portal/[slug]/bonos/page.tsx': 1,
  'app/portal/[slug]/equipo/alumnas/[socioId]/page.tsx': 1,
  'app/portal/[slug]/equipo/ausencias/page.tsx': 1,
  'app/portal/[slug]/equipo/disponibilidad/page.tsx': 1,
  'app/portal/[slug]/equipo/fichaje/page.tsx': 1,
  'app/portal/[slug]/equipo/page.tsx': 2,
  'app/portal/[slug]/equipo/perfil/page.tsx': 2,
  'app/portal/[slug]/logros/page.tsx': 2,
  'app/portal/[slug]/mensajes/page.tsx': 1,
  'app/portal/[slug]/mis-reservas/page.tsx': 3,
  'app/portal/[slug]/notificaciones/page.tsx': 3,
  'app/portal/[slug]/perfil/datos/page.tsx': 1,
  'app/portal/[slug]/perfil/preferencias/page.tsx': 4,
  'app/portal/[slug]/perfil/qr/page.tsx': 1,
  'app/portal/[slug]/valoracion/page.tsx': 1,
  'components/acceso/accesos-de-la-clienta.tsx': 1,
  'components/apariencia/editor-apariencia-app.tsx': 2,
  'components/clientas/ficha/dialogo-doble-factor.tsx': 1,
  'components/configuracion/canales-comunicacion.tsx': 3,
  'components/configuracion/formulario-estudio.tsx': 1,
  'components/configuracion/herramientas/herramienta-avisos-del-movil.tsx': 1,
  'components/configuracion/plataformas-externas.tsx': 2,
  'components/configuracion/tab-campos-personalizados.tsx': 5,
  'components/configuracion/tab-canjes.tsx': 1,
  'components/configuracion/tab-catalogo-cadena.tsx': 3,
  'components/configuracion/tab-cuestionario-salud.tsx': 5,
  'components/configuracion/tab-estudio-certificado.tsx': 2,
  'components/configuracion/tab-estudio-enlaces.tsx': 1,
  'components/configuracion/tab-estudio-sedes.tsx': 1,
  'components/configuracion/tab-logros.tsx': 1,
  'components/configuracion/tab-marca.tsx': 3,
  'components/configuracion/tab-niveles.tsx': 2,
  'components/configuracion/tab-perfil.tsx': 2,
  'components/configuracion/tab-plantillas-email.tsx': 2,
  'components/configuracion/tab-recompensas.tsx': 3,
  'components/configuracion/tab-retos.tsx': 2,
  'components/configuracion/tab-salas.tsx': 3,
  'components/configuracion/tab-servicios-cita.tsx': 2,
  'components/dashboard/bajas-por-revisar.tsx': 1,
  'components/dashboard/canjes-pendientes.tsx': 2,
  'components/dashboard/clases-sin-instructora.tsx': 2,
  'components/dashboard/denuncias-por-revisar.tsx': 1,
  'components/dashboard/devoluciones-pendientes.tsx': 1,
  'components/dashboard/dobles-cobros-por-revisar.tsx': 1,
  'components/dashboard/plazas-fijas-por-decidir.tsx': 1,
  'components/dashboard/series-por-renovar.tsx': 1,
  'components/decision/codigos-descuento.tsx': 1,
  'components/network/boton-favorito-alumna.tsx': 1,
  'components/regalo/panel-regalo.tsx': 1,
  'components/student/domain/AnadirAWallet.tsx': 2,
  'components/student/domain/CompartirClase.tsx': 1,
  'components/student/domain/FavoritoButton.tsx': 1,
  'components/student/domain/HiloConversacion.tsx': 4,
  'components/student/domain/MiClaseFija.tsx': 1,
  'components/student/domain/MisDatos.tsx': 2,
  'components/student/domain/NormasComunidad.tsx': 1,
  'components/student/domain/OposicionPerfilado.tsx': 1,
  'components/student/domain/PagoPendiente.tsx': 1,
  'components/student/domain/PersonasBloqueadas.tsx': 1,
  'components/student/domain/PostCard.tsx': 5,
  'components/student/domain/PushPorTipo.tsx': 1,
  'components/student/domain/QueTalLaClase.tsx': 2,
  'components/student/domain/ValorarClase.tsx': 1,
  'components/theme/contenido-portal-editor.tsx': 8,
  'components/widgets/constructor-widgets.tsx': 1,
  'components/widgets/dominios.tsx': 2,
  'components/widgets/paso-ponlo.tsx': 3,
};

// Las pantallas de P0.3: a 0, y que no vuelvan a subir aunque alguien toque TOPES.
const A_CERO = [
  'app/(dashboard)/calendario/page.tsx',
  'components/clientas/ficha-clienta.tsx',
  'app/(dashboard)/productos/page.tsx',
  'components/configuracion/tab-clases.tsx',
  'app/(dashboard)/clientas/page.tsx',
];

// Quién avisa: los toasts y los callbacks con los que una pantalla se los pasa a
// sus piezas (`onHecho`, `onAviso`, el `setAviso` de Paquetes…).
const AVISADORES = new Set(['showToast', 'onToast', 'setToast', 'toast', 'setAviso', 'onHecho', 'onAviso']);
const ES_ERROR = /\.error\b|No (se ha|se han|hemos) podido|no se ha podido|no se han podido|no se pudo|no se pudieron/;

function ficheros(dir: string): string[] {
  const salida: string[] = [];
  for (const e of readdirSync(dir)) {
    if (e === 'node_modules' || e.startsWith('.')) continue;
    const ruta = join(dir, e);
    if (statSync(ruta).isDirectory()) salida.push(...ficheros(ruta));
    else if (/\.tsx?$/.test(e) && !/\.test\./.test(e)) salida.push(ruta);
  }
  return salida;
}

/**
 * Las llamadas a un avisador cuyo primer argumento es un error y que no dicen
 * `variant: 'error'`. Con el AST de TypeScript, no línea a línea: una llamada
 * partida en varias líneas también cuenta, y un comentario no.
 */
function erroresEnVerde(codigo: string, nombre = 'x.tsx'): number {
  const sf = ts.createSourceFile(nombre, codigo, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const lineas = codigo.split('\n');
  let n = 0;
  const visita = (nodo: ts.Node) => {
    if (ts.isCallExpression(nodo) && ts.isIdentifier(nodo.expression) && AVISADORES.has(nodo.expression.text) && nodo.arguments.length > 0) {
      const linea = lineas[sf.getLineAndCharacterOfPosition(nodo.getStart(sf)).line] ?? '';
      const primero = nodo.arguments[0].getText(sf);
      const resto = nodo.arguments.slice(1).map((a) => a.getText(sf)).join(' ');
      if (!linea.includes('toast-no-es-error') && ES_ERROR.test(primero) && !resto.includes("variant: 'error'")) n++;
    }
    nodo.forEachChild(visita);
  };
  visita(sf);
  return n;
}

const MEDIDO: Record<string, number> = {};
for (const f of [...ficheros(join(raiz, 'app')), ...ficheros(join(raiz, 'components'))]) {
  const n = erroresEnVerde(readFileSync(f, 'utf8'), f);
  if (n > 0) MEDIDO[relative(raiz, f).split('\\').join('/')] = n;
}

test('ningún fichero tiene más errores en verde que su tope (los nuevos, 0)', () => {
  const pasados = Object.entries(MEDIDO)
    .filter(([f, n]) => n > (TOPES[f] ?? 0))
    .map(([f, n]) => `${f}: ${n} (tope ${TOPES[f] ?? 0})`);
  assert.deepEqual(pasados, [], `Errores que salen con el ✓ verde del éxito. Usa showError o { variant: 'error' }:\n${pasados.join('\n')}`);
});

test('las pantallas de P0.3 se quedan a cero', () => {
  for (const f of A_CERO) assert.equal(MEDIDO[f] ?? 0, 0, f);
  for (const f of A_CERO) assert.ok(!(f in TOPES), `${f} no puede tener tope: está a 0`);
});

test('el trinquete solo baja: un tope por encima de lo medido se baja', () => {
  const altos = Object.entries(TOPES)
    .filter(([f, tope]) => (MEDIDO[f] ?? 0) < tope)
    .map(([f, tope]) => `${f}: tope ${tope}, medido ${MEDIDO[f] ?? 0}`);
  assert.deepEqual(altos, [], `Has arreglado errores: baja su tope en TOPES (o bórralo si es 0):\n${altos.join('\n')}`);
});

test('la guardia no está ciega', () => {
  assert.equal(erroresEnVerde("if (!res.ok) { showToast(res.error); return; }"), 1);
  // Partida en varias líneas, y por los callbacks que se pasan a las piezas.
  assert.equal(erroresEnVerde("showToast(\n  res.error,\n);"), 1);
  assert.equal(erroresEnVerde("onHecho(res.error);"), 1);
  assert.equal(erroresEnVerde("setAviso(res.error);"), 1);
  assert.equal(erroresEnVerde("onHecho(res.error, { variant: 'error' });"), 0);
  // Un comentario no es una llamada.
  assert.equal(erroresEnVerde("// showToast(res.error)"), 0);
  assert.equal(erroresEnVerde("showToast(res.error); // toast-no-es-error: motivo"), 0);
  assert.equal(erroresEnVerde("showToast('No se ha podido guardar');"), 1);
  assert.equal(erroresEnVerde("if (!res.ok) { showToast(res.error, { variant: 'error' }); return; }"), 0);
  assert.equal(erroresEnVerde("if (!res.ok) { showToastError(res.error); return; }"), 0);
  assert.equal(erroresEnVerde("showToast('Guardado');"), 0);
  assert.ok(Object.keys(MEDIDO).length > 10, 'La guardia no ve casi nada: ¿ha cambiado cómo se llaman los toasts?');
});
