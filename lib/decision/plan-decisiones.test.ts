import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { bloqueoDelPlan, PLAN_SIN_COMPROBAR, SIN_PLAN_DECISIONES } from './plan-decisiones.ts';

// El plan del estudio es una puerta de servidor, no de pantalla: aprobar,
// rechazar, posponer y preguntar por el estado no lo comprobaban, así que un
// estudio sin el Centro de Control en su plan (o con la prueba vencida) que
// conservara una recomendación PENDIENTE podía seguir aprobando cobros con su
// sesión. Ahora todas las rutas de /api/decisiones lo comprueban, justo después
// del rol y antes de leer o escribir nada.

const RAIZ = join(import.meta.dirname, '..', '..');
const leer = (r: string) => readFileSync(join(RAIZ, r), 'utf8');
const sinComentarios = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

test('bloqueoDelPlan: adelante solo con un plan que incluya el Centro de Control y la suscripción en vigor', () => {
  assert.equal(bloqueoDelPlan({ plan: 'ESTUDIO', subscription_status: 'active' }, false), null);
  assert.equal(bloqueoDelPlan({ plan: 'CADENA', subscription_status: 'trialing' }, false), null);
  assert.equal(bloqueoDelPlan({ plan: 'ESTUDIO', subscription_status: 'past_due' }, false), null, 'el periodo de gracia de Stripe');
  const cerrado = { status: 403, error: SIN_PLAN_DECISIONES };
  assert.deepEqual(bloqueoDelPlan({ plan: 'BASE', subscription_status: 'active' }, false), cerrado, 'el plan de entrada no lo incluye');
  assert.deepEqual(bloqueoDelPlan({ plan: 'ESTUDIO', subscription_status: 'trial_expirado' }, false), cerrado, 'la prueba vencida');
  assert.deepEqual(bloqueoDelPlan({ plan: 'ESTUDIO', subscription_status: 'canceled' }, false), cerrado);
  assert.deepEqual(bloqueoDelPlan({ plan: 'ESTUDIO', subscription_status: null }, false), cerrado);
  assert.deepEqual(bloqueoDelPlan(null, false), cerrado, 'sin estudio, cerrado');
});

test('bloqueoDelPlan: si no se ha podido leer el estudio, un 500 para reintentar — no «tu plan no lo incluye»', () => {
  assert.deepEqual(bloqueoDelPlan(null, true), { status: 500, error: PLAN_SIN_COMPROBAR });
  assert.deepEqual(bloqueoDelPlan({ plan: 'ESTUDIO', subscription_status: 'active' }, true), { status: 500, error: PLAN_SIN_COMPROBAR },
    'con error no se da por bueno lo que haya llegado');
});

test('bloqueoPorPlan lee el plan del estudio de la sesión y responde lo que dice bloqueoDelPlan', () => {
  const src = sinComentarios(leer('lib/decision/plan-servidor.ts'));
  assert.match(src, /\.from\('studios'\)\.select\('plan, subscription_status'\)\.eq\('id', studioId\)\.maybeSingle\(\)/);
  assert.match(src, /const bloqueo = bloqueoDelPlan\(data, !!error\);/);
  assert.match(src, /NextResponse\.json\(\{ error: bloqueo\.error \}, \{ status: bloqueo\.status \}\)/);
});

/** Todos los `route.ts` de app/api/decisiones, a cualquier profundidad. */
function rutasDecisiones(dir = join(RAIZ, 'app/api/decisiones')): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) return rutasDecisiones(p);
    return n === 'route.ts' ? [relative(RAIZ, p)] : [];
  });
}

const PUERTA = /if \(sesion\.rol !== 'PROPIETARIO'\) return NextResponse\.json\(\{ error: 'No autorizado' \}, \{ status: 403 \}\);\s*const sinPlan = await bloqueoPorPlan\(sesion\.studioId\);\s*if \(sinPlan\) return sinPlan;/;

test('aprobar, rechazar, posponer, «Ya la he contactado», el estado y el Centro de Control: el plan, justo después del rol', () => {
  for (const ruta of [
    'app/api/decisiones/route.ts',
    'app/api/decisiones/[id]/aprobar/route.ts',
    'app/api/decisiones/[id]/rechazar/route.ts',
    'app/api/decisiones/[id]/posponer/route.ts',
    'app/api/decisiones/[id]/gestionada/route.ts',
    'app/api/decisiones/[id]/estado/route.ts',
  ]) {
    // El manejador, sin los imports (que nombran las funciones que se llaman después).
    const src = sinComentarios(leer(ruta)).replace(/^[\s\S]*?export async function /, '');
    const puerta = src.search(PUERTA);
    assert.ok(puerta >= 0, `${ruta}: sin la puerta del plan justo después del rol`);
    // Antes de leer o escribir nada.
    for (const despues of ['await params', 'dbGet', 'dbList', 'dbTransicionar', '.from(']) {
      const i = src.indexOf(despues);
      if (i >= 0) assert.ok(i > puerta, `${ruta}: «${despues}» antes de comprobar el plan`);
    }
  }
});

test('ninguna ruta de /api/decisiones se queda sin comprobar el plan', () => {
  const rutas = rutasDecisiones();
  assert.ok(rutas.length >= 9, `solo ${rutas.length} rutas: ¿se han movido?`);
  for (const ruta of rutas) {
    const src = sinComentarios(leer(ruta));
    const conAyudante = /await bloqueoPorPlan\(sesion\.studioId\)/.test(src);
    const aMano = /tieneFeature\([^)]*'decisiones'\)/.test(src);
    assert.ok(conAyudante || aMano, `${ruta}: no comprueba que el plan incluya el Centro de Control`);
  }
});
