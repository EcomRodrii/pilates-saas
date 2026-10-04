import test from 'node:test';
import assert from 'node:assert/strict';
import { comprobarCodigo, hashCodigo, pedirCodigo } from './codigo-correo.ts';
import { MAX_INTENTOS_CODIGO_CORREO } from './codigo-correo-reglas.ts';

// ── Una base de datos en memoria con lo justo ───────────────────────────────
// Las RPC imitan las de la migración 20261003160000; las de verdad las prueba
// supabase/tests/rls-doble-factor-correo.test.ts contra Postgres.
type Fila = Record<string, unknown>;
const ANA = '11111111-1111-4111-8111-111111111111';
const SESION = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const OTRA = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const SECRETO = 'secreto-de-prueba';
const HOY = new Date('2026-10-03T10:00:00Z');
const seg = (n: number) => new Date(HOY.getTime() + n * 1000);

function bdFalsa() {
  const codigos: Fila[] = [];
  const confiadas: Fila[] = [];
  const estado = { motivo: null as string | null, ahora: HOY, llamadasIntento: 0 };
  const buscar = (s: unknown, u: unknown) => codigos.find(c => c.session_id === s && c.auth_user_id === u);

  function from(tabla: string) {
    assert.equal(tabla, 'codigos_correo_doble_factor');
    const filtros: Record<string, unknown> = {};
    let op: 'select' | 'delete' = 'select';
    const q = {
      select() { return q; },
      delete() { op = 'delete'; return q; },
      eq(c: string, v: unknown) { filtros[c] = v; return q; },
      maybeSingle() { return Promise.resolve({ data: buscar(filtros.session_id, filtros.auth_user_id) ?? null, error: null }); },
      upsert(v: Fila) {
        const i = codigos.findIndex(c => c.session_id === v.session_id);
        if (i >= 0) codigos.splice(i, 1);
        codigos.push({ ...v });
        return Promise.resolve({ error: null });
      },
      then(res: (v: unknown) => unknown) {
        if (op === 'delete') {
          const i = codigos.findIndex(c => c.session_id === filtros.session_id && c.auth_user_id === filtros.auth_user_id);
          if (i >= 0) codigos.splice(i, 1);
        }
        return Promise.resolve({ error: null }).then(res);
      },
    };
    return q;
  }

  function rpc(nombre: string, a: Record<string, unknown>) {
    const ahora = estado.ahora.toISOString();
    if (nombre === 'correo_doble_factor_disponible') return Promise.resolve({ data: estado.motivo, error: null });
    if (nombre === 'intento_codigo_correo') {
      estado.llamadasIntento++;
      if (estado.motivo) return Promise.resolve({ data: [{ estado: 'no_disponible', codigo_hash: null }], error: null });
      const c = buscar(a.p_sesion, a.p_usuario);
      if (!c || c.usado_en) return Promise.resolve({ data: [{ estado: 'sin_codigo', codigo_hash: null }], error: null });
      if (String(c.caduca_en) <= ahora) return Promise.resolve({ data: [{ estado: 'caducado', codigo_hash: null }], error: null });
      if ((c.intentos as number) >= (a.p_max_intentos as number)) return Promise.resolve({ data: [{ estado: 'agotado', codigo_hash: null }], error: null });
      c.intentos = (c.intentos as number) + 1;
      return Promise.resolve({ data: [{ estado: 'vivo', codigo_hash: c.codigo_hash }], error: null });
    }
    if (nombre === 'confirmar_codigo_correo') {
      const c = buscar(a.p_sesion, a.p_usuario);
      if (!c || c.usado_en || c.codigo_hash !== a.p_hash || String(c.caduca_en) <= ahora) return Promise.resolve({ data: false, error: null });
      c.usado_en = ahora;
      confiadas.push({ session_id: a.p_sesion, auth_user_id: a.p_usuario, origen: 'correo' });
      return Promise.resolve({ data: true, error: null });
    }
    throw new Error(`rpc inesperada: ${nombre}`);
  }
  return { db: { from, rpc } as never, codigos, confiadas, estado };
}

async function pedir(db: never, ahora = HOY, reenviar = false) {
  return pedirCodigo(db, { userId: ANA, sessionId: SESION, secreto: SECRETO, reenviar, ahora });
}

test('el hash va atado a la cuenta y a la sesión, y no existe sin secreto', () => {
  const h = hashCodigo(SECRETO, ANA, SESION, '123456');
  assert.match(h, /^[0-9a-f]{64}$/);
  assert.notEqual(h, hashCodigo(SECRETO, ANA, OTRA, '123456'), 'otra sesión, otro hash');
  assert.notEqual(h, hashCodigo('otro', ANA, SESION, '123456'), 'otro secreto, otro hash');
  assert.ok(!h.includes('123456'));
  assert.throws(() => hashCodigo('', ANA, SESION, '123456'));
});

test('pedir: seis dígitos, guardado solo su hash, y caduca en 10 minutos', async () => {
  const { db, codigos } = bdFalsa();
  const r = await pedir(db);
  assert.ok('codigo' in r);
  assert.match(r.codigo, /^\d{6}$/);
  assert.equal(codigos.length, 1);
  assert.ok(!JSON.stringify(codigos).includes(r.codigo), 'el código en claro no se guarda');
  assert.equal(codigos[0].codigo_hash, hashCodigo(SECRETO, ANA, SESION, r.codigo));
  assert.equal(codigos[0].caduca_en, '2026-10-03T10:10:00.000Z');
});

test('recargar la pantalla no manda otro; el botón sí, pero no antes de 30 s', async () => {
  const { db, codigos } = bdFalsa();
  await pedir(db);
  assert.deepEqual(await pedir(db, seg(120)), { yaEnviado: true });
  assert.deepEqual(await pedir(db, seg(10), true), { espera: 20 });
  const otro = await pedir(db, seg(31), true);
  assert.ok('codigo' in otro);
  assert.equal(codigos.length, 1, 'uno vivo por sesión: el nuevo sustituye al anterior');
});

test('si la BD dice que no (sin contraseña, bloqueado), no se crea código', async () => {
  const { db, codigos, estado } = bdFalsa();
  estado.motivo = 'sin_contrasena';
  assert.deepEqual(await pedir(db), { motivo: 'sin_contrasena' });
  estado.motivo = 'bloqueado';
  assert.deepEqual(await pedir(db), { motivo: 'bloqueado' });
  assert.equal(codigos.length, 0);
});

test('el código bueno confía la sesión y se gasta: una sola vez', async () => {
  const { db, confiadas } = bdFalsa();
  const r = await pedir(db) as { codigo: string };
  assert.equal(await comprobarCodigo(db, { userId: ANA, sessionId: SESION, codigo: r.codigo, secreto: SECRETO }), 'ok');
  assert.deepEqual(confiadas, [{ session_id: SESION, auth_user_id: ANA, origen: 'correo' }]);
  assert.equal(await comprobarCodigo(db, { userId: ANA, sessionId: SESION, codigo: r.codigo, secreto: SECRETO }), 'sin_codigo');
  assert.equal(confiadas.length, 1);
});

test('el código de una sesión no vale en otra (una contraseña robada abre otra sesión)', async () => {
  const { db, confiadas } = bdFalsa();
  const r = await pedir(db) as { codigo: string };
  assert.equal(await comprobarCodigo(db, { userId: ANA, sessionId: OTRA, codigo: r.codigo, secreto: SECRETO }), 'sin_codigo');
  assert.equal(confiadas.length, 0);
});

test(`${MAX_INTENTOS_CODIGO_CORREO} intentos y fuera: ni el bueno vale después`, async () => {
  const { db, confiadas } = bdFalsa();
  const r = await pedir(db) as { codigo: string };
  const malo = r.codigo === '000000' ? '000001' : '000000';
  for (let i = 0; i < MAX_INTENTOS_CODIGO_CORREO; i++) {
    assert.equal(await comprobarCodigo(db, { userId: ANA, sessionId: SESION, codigo: malo, secreto: SECRETO }), 'incorrecto');
  }
  assert.equal(await comprobarCodigo(db, { userId: ANA, sessionId: SESION, codigo: r.codigo, secreto: SECRETO }), 'agotado');
  assert.equal(confiadas.length, 0);
});

test('caducado no vale', async () => {
  const { db, estado, confiadas } = bdFalsa();
  const r = await pedir(db) as { codigo: string };
  estado.ahora = seg(10 * 60);
  assert.equal(await comprobarCodigo(db, { userId: ANA, sessionId: SESION, codigo: r.codigo, secreto: SECRETO }), 'caducado');
  assert.equal(confiadas.length, 0);
});

test('lo que no son seis dígitos no gasta intento ni llega a la BD', async () => {
  const { db, estado } = bdFalsa();
  await pedir(db);
  for (const c of ['12345', 'abcdef', null, 123456, '1234567']) {
    assert.equal(await comprobarCodigo(db, { userId: ANA, sessionId: SESION, codigo: c, secreto: SECRETO }), 'incorrecto');
  }
  assert.equal(estado.llamadasIntento, 0);
});

test('si la BD deja de aceptar el correo (cambió la contraseña), el código ya pedido no vale', async () => {
  const { db, estado, confiadas } = bdFalsa();
  const r = await pedir(db) as { codigo: string };
  estado.motivo = 'bloqueado';
  assert.equal(await comprobarCodigo(db, { userId: ANA, sessionId: SESION, codigo: r.codigo, secreto: SECRETO }), 'no_disponible');
  assert.equal(confiadas.length, 0);
});
