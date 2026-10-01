import { test } from 'node:test';
import assert from 'node:assert/strict';
import { scopesQuePuedeConceder, scopesEfectivos, scopesDelPlan, repartirScopesConsentimiento } from './scopes.ts';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { SCOPES_VALIDOS } from './catalogo-scopes.ts';

test('la propietaria puede dar todo el catálogo', () => {
  assert.deepEqual(scopesQuePuedeConceder('PROPIETARIO'), [...SCOPES_VALIDOS]);
});

test('un MANAGER no puede dar dinero ni datos fiscales: no los ve en el panel', () => {
  const m = scopesQuePuedeConceder('MANAGER');
  for (const s of ['pagos:leer', 'facturas:leer', 'clientas:datos_fiscales'] as const) {
    assert.ok(!m.includes(s), `MANAGER no puede conceder ${s}`);
  }
  assert.ok(m.includes('clientas:leer') && m.includes('reservas:escribir'));
});

test('quien no gestiona apps no concede nada', () => {
  assert.deepEqual(scopesQuePuedeConceder('RECEPCION'), []);
  assert.deepEqual(scopesQuePuedeConceder('INSTRUCTOR'), []);
  assert.deepEqual(scopesQuePuedeConceder(null), []);
});

test('lo que vale en una petición se recorta al rol que tiene HOY quien la concedió', () => {
  const credencial = ['clientas:leer', 'pagos:leer', 'facturas:leer'];
  assert.deepEqual(scopesEfectivos({ credencial, rolDeQuienConcedio: 'PROPIETARIO', plan: 'BASE' }), ['clientas:leer', 'pagos:leer', 'facturas:leer']);
  // La propietaria que autorizó ya no lo es (p. ej. pasó a MANAGER): el dinero se cae.
  assert.deepEqual(scopesEfectivos({ credencial, rolDeQuienConcedio: 'MANAGER', plan: 'BASE' }), ['clientas:leer']);
  // Ya no está en el estudio: nada.
  assert.deepEqual(scopesEfectivos({ credencial, rolDeQuienConcedio: null, plan: 'BASE' }), []);
});

test('scopes desconocidos en una credencial no se cuelan', () => {
  assert.deepEqual(scopesEfectivos({ credencial: ['pagos:escribir', 'clientas:leer'], rolDeQuienConcedio: 'PROPIETARIO', plan: 'CADENA' }), ['clientas:leer']);
});

test('hoy ningún plan recorta scopes (sin límites comerciales inventados)', () => {
  for (const plan of ['BASE', 'ESTUDIO', 'CADENA'] as const) assert.deepEqual([...scopesDelPlan(plan)], [...SCOPES_VALIDOS]);
});

// ── Lo que cada app OAuth puede pedir (oauth_clientes.scopes_permitidos) ─────

test('un token OAuth vale solo en lo que su app puede pedir HOY (recortarla vale al momento)', () => {
  const credencial = ['clientas:leer', 'pagos:leer', 'clientas:datos_fiscales'];
  assert.deepEqual(
    scopesEfectivos({ credencial, rolDeQuienConcedio: 'PROPIETARIO', plan: 'BASE', app: ['clientas:leer', 'pagos:leer'] }).sort(),
    ['clientas:leer', 'pagos:leer'],
  );
  // Una app sin lista no puede nada; una clave de API (sin `app`) no se ve afectada.
  assert.deepEqual(scopesEfectivos({ credencial, rolDeQuienConcedio: 'PROPIETARIO', plan: 'BASE', app: [] }), []);
  assert.equal(scopesEfectivos({ credencial, rolDeQuienConcedio: 'PROPIETARIO', plan: 'BASE' }).length, 3);
});

test('consentimiento: se recorta a la app y al rol, y se dice por qué queda fuera cada cosa', () => {
  const r = repartirScopesConsentimiento({
    rol: 'MANAGER',
    app: ['clientas:leer', 'reservas:leer', 'pagos:leer'],
    pedidos: ['clientas:leer', 'reservas:leer', 'pagos:leer', 'clientas:datos_fiscales'],
  });
  assert.deepEqual(r.concedibles, ['clientas:leer', 'reservas:leer']);
  assert.deepEqual(r.fueraPorApp, ['clientas:datos_fiscales'], 'la app no puede pedirlo, sea quien sea quien autorice');
  assert.deepEqual(r.fueraPorRol, ['pagos:leer'], 'la app puede pedirlo, pero un MANAGER no lo da');
  // Un scope inventado no aparece en ninguna lista.
  const raro = repartirScopesConsentimiento({ rol: 'PROPIETARIO', app: ['clientas:leer'], pedidos: ['clientas:leer', 'admin:todo'] });
  assert.deepEqual(raro, { concedibles: ['clientas:leer'], fueraPorApp: [], fueraPorRol: [] });
});

test('la lista de Zapier son scopes del catálogo, sin datos fiscales ni facturas', () => {
  const dir = join(import.meta.dirname, '..', '..', 'supabase', 'migrations');
  const m = readdirSync(dir).find((n) => n.endsWith('_oauth_scopes_por_app.sql'));
  assert.ok(m, 'falta la migración de scopes por app');
  const sql = readFileSync(join(dir, m!), 'utf8');
  const lista = /set scopes_permitidos = array\[([\s\S]*?)\]::text\[\]\s*where id = 'zapier'/.exec(sql);
  assert.ok(lista, 'no encuentro la lista de Zapier');
  const scopes = [...lista![1].matchAll(/'([a-z_]+:[a-z_]+)'/g)].map((x) => x[1]);
  assert.ok(scopes.length > 0 && scopes.every((x) => (SCOPES_VALIDOS as readonly string[]).includes(x)));
  assert.ok(!scopes.includes('clientas:datos_fiscales') && !scopes.includes('facturas:leer'));
  // Una app nueva nace sin permisos: el default es la lista vacía.
  assert.match(sql, /scopes_permitidos text\[\] not null default '\{\}'::text\[\]/);
});

test('la autorización y cada petición usan la lista de la app', () => {
  const raiz = join(import.meta.dirname, '..', '..');
  const authorize = readFileSync(join(raiz, 'app/api/oauth/authorize/route.ts'), 'utf8');
  assert.equal((authorize.match(/repartirScopes\(sesion\.rol, cliente\.scopesPermitidos, v\.scopes\)/g) ?? []).length, 2, 'GET y POST');
  const servidor = readFileSync(join(raiz, 'lib/api-publica/servidor.ts'), 'utf8');
  assert.match(servidor, /select\('activo, scopes_permitidos'\)/);
  assert.match(servidor, /scopesEfectivos\(\{ credencial: scopesCredencial, rolDeQuienConcedio: rol, plan, app: scopesDeLaApp \}\)/);
});
