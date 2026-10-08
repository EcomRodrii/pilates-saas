// Guardián estático de la tarjeta regalo: lo que NO puede deshacerse sin que alguien se entere.
// No prueba que la RPC funcione (eso lo hace supabase/tests/rls-regalo.test.ts contra Postgres):
// impide que se retiren las cerraduras. Si falla, alguien ha tocado una línea que tapa un agujero.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const RAIZ = join(import.meta.dirname, '..', '..');
const leer = (r: string) => readFileSync(join(RAIZ, r), 'utf8');
const sql = leer('supabase/migrations/20261008231136_tarjetas_regalo.sql');

test('la migración se leyó de verdad', () => {
  assert.ok(sql.length > 5000);
  for (const f of ['regalo_crear', 'regalo_vincular', 'regalo_usar', 'regalo_anular']) {
    assert.match(sql, new RegExp(`create or replace function public\\.${f}\\(`));
  }
});

test('el código sale de gen_random_bytes, nunca de random()', () => {
  assert.match(sql, /extensions\.gen_random_bytes\(16\)/);
  assert.doesNotMatch(sql.replace(/--.*$/gm, ''), /\brandom\s*\(/);
});

test('el «hoy» es el de Madrid: ni current_date ni now()::date', () => {
  const codigo = sql.replace(/--.*$/gm, '');
  assert.doesNotMatch(codigo, /current_date/i);
  assert.doesNotMatch(codigo, /now\(\)\s*::\s*date/i);
  assert.match(codigo, /public\.hoy_estudio\(\)/);
});

test('las RPC son solo de service_role (REVOKE a public, anon y authenticated)', () => {
  for (const f of ['regalo_generar_codigo', 'regalo_normalizar_codigo', 'regalo_huella_codigo', 'regalo_crear', 'regalo_vincular', 'regalo_usar', 'regalo_anular']) {
    assert.match(sql, new RegExp(`revoke all on function public\\.${f}\\([^)]*\\) from public, anon, authenticated;`), `${f} sin REVOKE`);
    assert.match(sql, new RegExp(`grant execute on function public\\.${f}\\([^)]*\\) to service_role;`), `${f} sin GRANT a service_role`);
  }
});

test('RLS: lectura solo con funciones envueltas, 2FA restrictiva y cero escritura de navegador', () => {
  for (const t of ['regalo_ajustes', 'tarjetas_regalo', 'movimientos_regalo']) {
    assert.match(sql, new RegExp(`alter table public\\.${t} enable row level security`));
    assert.ok(sql.includes(`'${t}'`), `${t} sin exige_doble_factor`);
  }
  assert.match(sql, /\(select public\.current_studio_id\(\)\)/);
  assert.match(sql, /\(select public\.puede_ver_finanzas\(\)\)/);
  assert.doesNotMatch(sql, /=\s*public\.current_studio_id\(\)/, 'función de ayuda sin envolver en una política');
  assert.match(sql, /as restrictive for all to authenticated/);
  // Nadie del navegador escribe ni lee el código.
  assert.match(sql, /revoke all on public\.regalo_ajustes, public\.tarjetas_regalo, public\.movimientos_regalo from anon, authenticated/);
  const grantTarjetas = sql.match(/grant select \(([^)]*)\)\s+on public\.tarjetas_regalo to authenticated/)?.[1] ?? '';
  assert.ok(grantTarjetas.length > 20, 'grant por columnas de tarjetas_regalo no encontrado');
  assert.doesNotMatch(grantTarjetas, /\bcodigo\b/);
  assert.doesNotMatch(grantTarjetas, /codigo_hash/);
  assert.doesNotMatch(sql, /grant (insert|update|delete|all)[^;]*to authenticated/i);
});

test('el libro es solo de inserción y tiene un único COMPRA y una clave de idempotencia por tarjeta', () => {
  assert.match(sql, /create trigger trg_movimientos_regalo_inmutable\s+before update on public\.movimientos_regalo/);
  assert.match(sql, /create unique index movimientos_regalo_una_compra[^;]*where tipo = 'COMPRA'/);
  assert.match(sql, /create unique index movimientos_regalo_idem[^;]*\(tarjeta_id, idem_key\)/);
  assert.match(sql, /create unique index tarjetas_regalo_sesion_unica/);
});

test('gastar y anular toman candado de fila', () => {
  const usar = sql.slice(sql.indexOf('function public.regalo_usar'), sql.indexOf('function public.regalo_anular'));
  assert.match(usar, /for update/);
  const anular = sql.slice(sql.indexOf('function public.regalo_anular'));
  assert.match(anular, /for update/);
});

const ruta = (r: string) => leer(r);

test('compra pública: límites, trampa, captcha de SERVIDOR y el importe nunca sale del cliente', () => {
  const r = ruta('app/api/public/regalo/comprar/route.ts');
  assert.match(r, /enforceRateLimit\(req, 'public-regalo-comprar'/);
  assert.match(r, /cayoEnLaTrampa\(/);
  assert.match(r, /captchaDeServidorListo\(\)/);
  assert.match(r, /verificarCaptcha\(/);
  assert.match(r, /comprobarModoStripe\(\)/);
  assert.match(r, /validarImporte\(estudio\.ajustes/);
  assert.match(r, /stripeAccount: estudio\.stripeAccountId/);
  // El orden importa: nunca se crea la sesión antes de comprobar el captcha.
  assert.ok(r.indexOf('verificarCaptcha(') < r.indexOf('checkout.sessions.create'));
  // El estudio sale del slug en servidor, no de un studioId del body.
  assert.doesNotMatch(r, /body\.studioId/);
});

test('canje: sesión real de alumna, límite por IP y por cuenta, captcha de servidor', () => {
  const r = ruta('app/api/public/regalo/canjear/route.ts');
  assert.match(r, /verificarUsuarioSupabase\(req\)/);
  assert.match(r, /socioAutenticado\(user\.userId/);
  assert.match(r, /enforceRateLimit\(req, 'public-regalo-canjear'/);
  assert.match(r, /public-regalo-canjear-cuenta:\$\{user\.userId\}/);
  assert.match(r, /verificarCaptcha\(/);
  assert.ok(r.indexOf('verificarUsuarioSupabase') < r.indexOf('canjearCodigo('));
});

test('panel: cada verbo comprueba el rol en servidor', () => {
  const lista = ruta('app/api/regalo/route.ts');
  assert.match(lista, /puedeVerFinanzas\(sesion\.rol\)/);
  assert.match(lista, /sesion\.rol !== 'PROPIETARIO'/);
  assert.match(lista, /puedeMoverDinero\(sesion\.rol\)/);
  assert.match(ruta('app/api/regalo/[id]/route.ts'), /puedeMoverDinero\(sesion\.rol\)/);
});

test('webhook: la sesión de regalo se resuelve DESPUÉS de autorizar la cuenta Connect y antes de las ramas de recibo', () => {
  const w = ruta('app/api/stripe/webhook/route.ts');
  const tenant = w.indexOf('tenantAutorizado(studioDeCuenta, studioId)');
  const regalo = w.indexOf('esSesionDeRegalo(session.metadata');
  const setup = w.indexOf("session.mode === 'setup' && session.metadata?.purpose === 'tarjeta'");
  assert.ok(tenant > 0 && regalo > tenant && regalo < setup, 'orden tenant → regalo → resto');
  assert.match(w, /anularRegaloPorPago\(adminRegalo, studioRegalo, piId, 'Reembolso total en Stripe'\)/);
  assert.match(w, /anularRegaloPorPago\(adminRegalo, studioRegalo, piId, 'Disputa perdida'\)/);
});

test('la tarjeta regalo NO crea recibos ni toca las cifras de ingresos', () => {
  for (const f of ['lib/regalo/servidor.ts', 'lib/regalo/stripe.ts', 'lib/regalo/enviar.ts', 'app/api/regalo/route.ts', 'app/api/regalo/[id]/route.ts', 'app/api/public/regalo/comprar/route.ts']) {
    const c = leer(f);
    assert.doesNotMatch(c, /from\('recibos'\)/, `${f} escribe recibos`);
    assert.doesNotMatch(c, /confirmarCobro/, `${f} usa confirmarCobro`);
  }
});
