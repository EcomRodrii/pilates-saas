// ─────────────────────────────────────────────────────────────────────────────
// Regresión: los 3 barridos globales de Vercel no pueden volver a recorrer
// todos los estudios en serie.
//
// Contexto. Los tres corren en una función de Vercel con `maxDuration = 300` y
// procesan "todos los estudios en una sola invocación" (lo dice su propio
// comentario). Al agotar el techo, Vercel los mata a media pasada y **no queda
// constancia de por dónde iban**: la siguiente ejecución empieza otra vez por el
// principio, así que si el barrido no cabe en 300 s los estudios del final de la
// lista no se procesan NUNCA.
//
// Es la misma familia que el truncado a 1.000 filas, pero cortando por TIEMPO en
// vez de por filas, y con el mismo síntoma engañoso: no se ve como una caída,
// se ve como "a unos estudios les funciona y a otros no".
//
// Se comprueba sobre el fuente, mismo idioma que `crons-paginacion.test.ts` y
// `tope-socias-idempotencia.test.ts`: estos módulos arrastran el cliente de
// Supabase y el motor de notificaciones, así que no se pueden importar aquí.
// ─────────────────────────────────────────────────────────────────────────────
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const RAIZ = join(import.meta.dirname, '..');
const leer = (rel: string) => readFileSync(join(RAIZ, rel), 'utf8');

// Quita comentarios antes de afirmar sobre el CÓDIGO. Sin esto, un comentario
// que menciona lo que se acaba de quitar ("antes esto era un console.error…")
// hace que el test se acuse a sí mismo — que es justo lo que pasó al escribirlo.
const soloCodigo = (s: string) => s.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');

test('calcularDependenciaTodosLosEstudios no recorre los estudios en serie', () => {
  const fuente = leer('lib/instructor-dependency.ts');
  const ini = fuente.indexOf('export async function calcularDependenciaTodosLosEstudios');
  assert.ok(ini > 0, 'no encuentro calcularDependenciaTodosLosEstudios: ¿se renombró?');
  // Es la última exportación del fichero, así que `indexOf` devolvería -1 y el
  // slice quedaría raro: se corta hasta el final explícitamente.
  const sig = fuente.indexOf('\nexport ', ini + 1);
  const cuerpo = soloCodigo(fuente.slice(ini, sig > 0 ? sig : undefined));

  assert.ok(
    cuerpo.includes('mapLimit('),
    'debe abanicar con mapLimit: un `for` con await por estudio no cabe en los 300 s de Vercel a escala',
  );
  assert.ok(
    !/for\s*\(const\s+\w+\s+of\s+studios/.test(cuerpo),
    'volvió el bucle secuencial sobre studios',
  );
  assert.ok(
    cuerpo.includes('.range('),
    'la lista de estudios debe ir paginada: PostgREST corta a 1.000 en silencio',
  );
  // El fallo de un estudio no puede desaparecer en un console.error: mapLimit
  // además exige que la tarea no lance.
  assert.ok(
    cuerpo.includes('capturarExcepcion(') && !cuerpo.includes('console.error'),
    'un estudio cuyo cálculo falle debe reportarse, no perderse en consola',
  );
});

test('el cron de dependency-risk no publica los avisos en serie por estudio', () => {
  const fuente = soloCodigo(leer('app/api/cron/dependency-risk/route.ts'));
  assert.ok(fuente.includes('mapLimit('), 'el bucle de publicación debe ir en paralelo acotado');
  assert.ok(
    !/for\s*\(const\s+\{\s*studioId/.test(fuente),
    'volvió el bucle secuencial sobre resultados',
  );
  // La idempotencia no puede depender del orden: si dependiera, paralelizar
  // duplicaría avisos.
  assert.ok(
    fuente.includes('dedupKey:'),
    'la idempotencia del aviso debe seguir viniendo del dedupKey, no del orden de recorrido',
  );
});

test('materializarPlazasFijas no manda los avisos de hueco en serie', () => {
  const fuente = leer('lib/db/supabase-data-admin.ts');
  const ini = fuente.indexOf('export async function materializarPlazasFijas');
  assert.ok(ini > 0, 'no encuentro materializarPlazasFijas: ¿se renombró?');
  const cuerpo = soloCodigo(fuente.slice(ini, fuente.indexOf('\nexport ', ini + 1)));

  assert.ok(cuerpo.includes('mapLimit('), 'los avisos de plaza no materializada deben ir en paralelo acotado');
  assert.ok(!/for\s*\(const\s+f\s+of\s+filas/.test(cuerpo), 'volvió el bucle secuencial sobre filas');
});

test('barrerNoShows pide el TRABAJO, no todas las sesiones de la ventana', () => {
  const fuente = leer('lib/db/supabase-data-admin.ts');
  const ini = fuente.indexOf('export async function barrerNoShows');
  assert.ok(ini > 0, 'no encuentro barrerNoShows: ¿se renombró?');
  const sigNS = fuente.indexOf('\nexport ', ini + 1);
  const cuerpo = soloCodigo(fuente.slice(ini, sigNS > 0 ? sigNS : undefined));

  // Consultar `reservas` (el trabajo) en vez de `sesiones` (el universo) es lo
  // que hace que el conjunto se encoja a ~0 cuando el barrido va al día. Con la
  // ventana de 30 días, la versión antigua re-barría cada noche lo de los 29
  // días anteriores: medido en producción, 35 sesiones escaneadas para 1 con
  // trabajo real.
  assert.ok(
    cuerpo.includes(".from('reservas')") && cuerpo.includes('sesiones!inner'),
    'debe leer las reservas CONFIRMADA con join a su sesión, no listar todas las sesiones de la ventana',
  );
  // Los dos filtros que NO se pueden perder al reformular la consulta.
  assert.ok(cuerpo.includes("eq('sesiones.cancelada', false)"), 'no se marca falta en una clase cancelada');
  assert.ok(cuerpo.includes("lt('sesiones.fin'"), 'solo se barren clases que ya han TERMINADO');
  // Guardia de carrera entre la lectura y el UPDATE.
  assert.ok(
    cuerpo.includes("eq('estado', 'CONFIRMADA')"),
    'el UPDATE debe seguir filtrando por CONFIRMADA para no pisar una cancelación hecha desde el panel entre medias',
  );
  // Orden estable = paginación sin saltos ni repeticiones.
  assert.ok(cuerpo.includes(".order('id'"), 'la paginación necesita un orden estable');
});
