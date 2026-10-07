// La verificación en dos pasos se exige en el SERVIDOR, en una sola puerta
// (`verificarUsuarioSupabase` / `pasoDeLaSesion`, lib/auth-server.ts). Este
// test falla si aparece una ruta que identifica a alguien con `getUser` a pelo
// sin pasar por ella, o si alguien más se salta el segundo paso a propósito.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const RAIZ = new URL('../../', import.meta.url).pathname;

function ficheros(dir: string): string[] {
  // Ojo con excluir por nombre: 'public' dejaba fuera app/api/public, que es
  // justo donde viven las rutas de la alumna. Solo se recorren app/ y lib/.
  const fuera = new Set(['node_modules', '.next']);
  return readdirSync(dir).flatMap((n) => {
    if (fuera.has(n)) return [];
    const p = join(dir, n);
    if (statSync(p).isDirectory()) return ficheros(p);
    return /\.(ts|tsx)$/.test(n) && !/\.test\.tsx?$/.test(n) ? [p] : [];
  });
}

/** El código sin comentarios de línea ni de bloque (lo justo para no contar menciones). */
function sinComentarios(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
}

const servidor = [...ficheros(join(RAIZ, 'app')), ...ficheros(join(RAIZ, 'lib'))]
  .filter((p) => !readFileSync(p, 'utf8').slice(0, 200).includes("'use client'"))
  // El arnés de stripe-mock (lib/billing/stripe-mock.integracion.test.ts) no es una puerta: es
  // código de PRUEBA que sustituye estas funciones por una alumna fija. Nada de app/ lo importa.
  .filter((p) => !p.endsWith('lib/billing/stripe-mock-arnes.ts'));

test('nadie identifica a una persona con getUser sin pasar por el segundo paso', () => {
  const sueltos = servidor
    .filter((p) => /\.auth\.(getUser|getClaims)\(/.test(sinComentarios(readFileSync(p, 'utf8'))))
    .filter((p) => !p.endsWith('lib/auth-server.ts'))
    .filter((p) => !/pasoDeLaSesion\(/.test(sinComentarios(readFileSync(p, 'utf8'))))
    .map((p) => relative(RAIZ, p));
  assert.deepEqual(sueltos, [], 'Usa verificarUsuarioSupabase, o pasoDeLaSesion tras getUser (lib/auth-server.ts).');
});

test('saltarse el segundo paso es una lista cerrada', () => {
  const conSalto = servidor
    // A secas, no `sinSegundoPaso: true`: una variable o un spread de opciones también lo salta.
    .filter((p) => /sinSegundoPaso/.test(sinComentarios(readFileSync(p, 'utf8'))))
    .filter((p) => !p.endsWith('lib/auth-server.ts'))
    .map((p) => relative(RAIZ, p)).sort();
  // Cada una, con su motivo en el propio fichero: la zona interna tiene su propio
  // `aal2` (más estricto) y destino-post-login solo decide a dónde va la persona.
  assert.deepEqual(conSalto, ['app/api/auth/destino-post-login/route.ts', 'lib/interno/auth.ts']);
});

test('identificar SIN cortar por el segundo paso es una lista cerrada', () => {
  const usan = (nombre: string) => servidor
    .filter((p) => !p.endsWith('lib/auth-server.ts'))
    .filter((p) => new RegExp(`\\b${nombre}\\b`).test(sinComentarios(readFileSync(p, 'utf8'))))
    .map((p) => relative(RAIZ, p)).sort();
  // `usuarioConToken`: solo las rutas del PROPIO segundo paso (recordar el
  // dispositivo, mandar y comprobar el código), que existen para quien aún no lo ha pasado.
  assert.deepEqual(usan('usuarioConToken'), [
    'app/api/auth/dispositivo-confianza/route.ts',
    'app/api/auth/dispositivo-confianza/usar/route.ts',
    'app/api/auth/doble-factor-correo/enviar/route.ts',
    'app/api/auth/doble-factor-correo/reabrir/route.ts',
    'app/api/auth/doble-factor-correo/verificar/route.ts',
  ]);
  // `usuarioSupabaseConPaso`: las de arranque, que contestan `doble_factor_requerido`
  // en vez de datos; cada una mira `paso` antes de dar nada. La de la entrada de la
  // app de iOS (/app) lo es por lo mismo: con un 401 la mandaría a entrar, en bucle. Y la
  // comprobación de un pago desde la app (estado-pago con sesión, P01): la alumna acaba de
  // pagar y un 401 a secas la mandaría a entrar sin decirle que el pago no se pierde. Y las
  // opciones de una clase (P06) y su clase de prueba (P07), que la app pregunta antes de ofrecerle pagar; y el cobro
  // incrustado, para que la hoja de pago mande a verificar en vez de a entrar.
  const arranque = usan('usuarioSupabaseConPaso');
  assert.deepEqual(arranque, [
    'app/api/app/mis-estudios/route.ts', 'app/api/public/checkout-embebido/route.ts', 'app/api/public/estado-pago/route.ts', 'app/api/public/opciones-clase/route.ts',
    'app/api/public/prueba/route.ts', 'app/api/public/session/route.ts', 'app/api/public/studio-data/route.ts',
  ]);
  for (const r of arranque) assert.match(readFileSync(join(RAIZ, r), 'utf8'), /paso\s*===\s*'doble_factor'/, `${r}: no mira el paso`);
});
