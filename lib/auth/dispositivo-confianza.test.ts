import test from 'node:test';
import assert from 'node:assert/strict';
import {
  hashToken, huellaCuenta, listarDispositivos, quitarDispositivos, recordarDispositivo, sesionConfiada, usarDispositivo,
  type AccionCookie,
} from './dispositivo-confianza.ts';
import { MAX_DISPOSITIVOS_POR_CUENTA } from './dispositivo-confianza-reglas.ts';

// ── Una base de datos en memoria con lo justo del cliente de Supabase ───────
// `sesion_confiada_de` imita la función SQL (migr 20261003110108); la de
// verdad la prueba supabase/tests/rls-dispositivo-confianza.test.ts.
type Fila = Record<string, unknown>;

function bdFalsa() {
  const tablas: Record<string, Fila[]> = { dispositivos_confianza: [], sesiones_confiadas: [] };
  const conFactor = new Set<string>([ANA, BEA]);
  const reloj = { ahora: HOY };
  let siguienteId = 1;

  function consulta(tabla: string) {
    let op: 'select' | 'update' | 'delete' | 'insert' | 'upsert' = 'select';
    let valores: Fila = {};
    let devolver = false;
    let orden: { col: string; asc: boolean } | null = null;
    const filtros: ((f: Fila) => boolean)[] = [];
    const filas = () => tablas[tabla].filter(f => filtros.every(fn => fn(f)));

    function ejecutar(): { data: Fila[] | null; error: null } {
      if (op === 'insert') {
        tablas[tabla].push({ id: `disp-${siguienteId++}`, ...valores });
        return { data: null, error: null };
      }
      if (op === 'upsert') {
        if (!tablas[tabla].some(f => f.session_id === valores.session_id)) tablas[tabla].push({ ...valores });
        return { data: null, error: null };
      }
      const afectadas = filas();
      if (op === 'update') afectadas.forEach(f => Object.assign(f, valores));
      if (op === 'delete') {
        tablas[tabla] = tablas[tabla].filter(f => !afectadas.includes(f));
        // ON DELETE CASCADE de la FK de sesiones_confiadas
        if (tabla === 'dispositivos_confianza') {
          const ids = new Set(afectadas.map(f => f.id));
          tablas.sesiones_confiadas = tablas.sesiones_confiadas.filter(s => !ids.has(s.dispositivo_id));
        }
      }
      let out = afectadas.map(f => ({ ...f }));
      if (orden) {
        const { col, asc } = orden;
        out = out.sort((a, b) => (String(a[col]) < String(b[col]) ? -1 : 1) * (asc ? 1 : -1));
      }
      return { data: op === 'select' || devolver ? out : null, error: null };
    }

    const q = {
      select() { if (op !== 'select') devolver = true; return q; },
      update(v: Fila) { op = 'update'; valores = v; return q; },
      insert(v: Fila) { op = 'insert'; valores = v; return q; },
      upsert(v: Fila) { op = 'upsert'; valores = v; return q; },
      delete() { op = 'delete'; return q; },
      eq(c: string, v: unknown) { filtros.push(f => f[c] === v); return q; },
      in(c: string, vs: unknown[]) { filtros.push(f => vs.includes(f[c])); return q; },
      lte(c: string, v: string) { filtros.push(f => String(f[c]) <= v); return q; },
      gt(c: string, v: string) { filtros.push(f => String(f[c]) > v); return q; },
      order(col: string, o?: { ascending?: boolean }) { orden = { col, asc: o?.ascending !== false }; return q; },
      maybeSingle() { const r = ejecutar(); return Promise.resolve({ data: r.data?.[0] ?? null, error: null }); },
      then(res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) { return Promise.resolve(ejecutar()).then(res, rej); },
    };
    return q;
  }

  function rpc(nombre: string, args: { p_usuario: string; p_sesion: string }) {
    assert.equal(nombre, 'sesion_confiada_de');
    const s = tablas.sesiones_confiadas.find(x => x.session_id === args.p_sesion && x.auth_user_id === args.p_usuario);
    const d = s && tablas.dispositivos_confianza.find(x => x.id === s.dispositivo_id && x.auth_user_id === args.p_usuario);
    const vale = !!d && String(d.caduca_en) > reloj.ahora.toISOString() && conFactor.has(args.p_usuario);
    return Promise.resolve({ data: vale, error: null });
  }

  return { db: { from: consulta, rpc } as never, tablas, conFactor, reloj };
}

const ANA = '11111111-1111-4111-8111-111111111111';
const BEA = '22222222-2222-4222-8222-222222222222';
const SESION_1 = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const SESION_2 = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const HOY = new Date('2026-10-03T10:00:00Z');
const dias = (n: number) => new Date(HOY.getTime() + n * 24 * 60 * 60 * 1000);

async function recordar(db: never, userId = ANA, ahora = HOY, tokenActual: string | null = null) {
  return recordarDispositivo(db, { userId, nombre: 'iPad · Safari', ip: '203.0.113.7', tokenActual, ahora });
}

function tokenPuesto(c: AccionCookie): string {
  assert.ok(c && c !== 'borrar', `se esperaba poner la cookie, y es ${JSON.stringify(c)}`);
  return c.poner;
}

test('recordar guarda solo el hash del token, nunca el token, y no guarda la IP de alta', async () => {
  const { db, tablas } = bdFalsa();
  const token = await recordar(db);
  assert.equal(token.length, 43);
  const [fila] = tablas.dispositivos_confianza;
  assert.equal(fila.token_hash, hashToken(token));
  assert.ok(!JSON.stringify(fila).includes(token));
  assert.equal(fila.caduca_en, dias(30).toISOString());
  assert.ok(!('ip_alta' in fila));
});

test('el mismo navegador vuelve a recordarlo: se alarga el que tenía, no se crea otro', async () => {
  const { db, tablas } = bdFalsa();
  const token = await recordar(db);
  const otra = await recordar(db, ANA, dias(10), token);
  assert.equal(otra, token);
  assert.equal(tablas.dispositivos_confianza.length, 1);
  assert.equal(tablas.dispositivos_confianza[0].caduca_en, dias(40).toISOString());
});

test('el caso de uso: login nuevo en un navegador recordado → entra sin código, y el token rota', async () => {
  const { db, tablas, reloj } = bdFalsa();
  const token = await recordar(db);
  reloj.ahora = dias(5);
  const r = await usarDispositivo(db, { userId: ANA, sessionId: SESION_1, token, ip: '198.51.100.2', ahora: dias(5) });
  assert.equal(r.confiada, true);
  assert.equal(r.nueva, true);
  const rotado = tokenPuesto(r.cookie);
  assert.notEqual(rotado, token, 'al confiar una sesión nueva el token cambia');
  assert.equal(await sesionConfiada(db, ANA, SESION_1), true);
  assert.equal(tablas.dispositivos_confianza[0].ip_ultima, '198.51.100.2');
  // «30 días desde el último uso»: se alarga.
  assert.equal(tablas.dispositivos_confianza[0].caduca_en, dias(35).toISOString());
  // La cookie copiada antes de rotar ya no vale; la nueva sí.
  assert.equal((await usarDispositivo(db, { userId: ANA, sessionId: SESION_2, token, ip: null, ahora: dias(6) })).confiada, false);
  assert.equal((await usarDispositivo(db, { userId: ANA, sessionId: SESION_2, token: rotado, ip: null, ahora: dias(6) })).confiada, true);
});

test('la sesión ya confiada: cada uso alarga el dispositivo; la cookie solo se reemite si es la suya', async () => {
  const { db, tablas } = bdFalsa();
  const token = await recordar(db);
  const r1 = await usarDispositivo(db, { userId: ANA, sessionId: SESION_1, token, ip: null, ahora: dias(1) });
  const rotado = tokenPuesto(r1.cookie);
  const sinCookie = await usarDispositivo(db, { userId: ANA, sessionId: SESION_1, token: null, ip: null, ahora: dias(25) });
  assert.deepEqual(sinCookie, { confiada: true, nueva: false, cookie: null });
  assert.equal(tablas.dispositivos_confianza[0].caduca_en, dias(55).toISOString());
  const conLaSuya = await usarDispositivo(db, { userId: ANA, sessionId: SESION_1, token: rotado, ip: null, ahora: dias(26) });
  assert.deepEqual(conLaSuya.cookie, { poner: rotado });
  const conOtra = await usarDispositivo(db, { userId: ANA, sessionId: SESION_1, token: 'C'.repeat(43), ip: null, ahora: dias(27) });
  assert.equal(conOtra.cookie, null, 'una cookie que no es la de su dispositivo no se alarga');
});

test('una sesión confiada cuyo dispositivo caducó deja de contar, en el servidor y en la BD', async () => {
  const { db, reloj } = bdFalsa();
  const token = await recordar(db);
  await usarDispositivo(db, { userId: ANA, sessionId: SESION_1, token, ip: null, ahora: dias(1) });
  reloj.ahora = dias(40);
  assert.equal(await sesionConfiada(db, ANA, SESION_1), false);
  const r = await usarDispositivo(db, { userId: ANA, sessionId: SESION_1, token: null, ip: null, ahora: dias(40) });
  assert.equal(r.confiada, false, 'caducado no se revive al usarlo');
});

test('sin la verificación activada, una sesión confiada no cuenta', async () => {
  const { db, conFactor } = bdFalsa();
  const token = await recordar(db);
  await usarDispositivo(db, { userId: ANA, sessionId: SESION_1, token, ip: null, ahora: dias(1) });
  conFactor.delete(ANA);
  assert.equal(await sesionConfiada(db, ANA, SESION_1), false);
});

test('el dispositivo de OTRA cuenta no vale, aunque el token sea bueno', async () => {
  const { db } = bdFalsa();
  const tokenDeAna = await recordar(db, ANA);
  const r = await usarDispositivo(db, { userId: BEA, sessionId: SESION_2, token: tokenDeAna, ip: null, ahora: dias(1) });
  assert.equal(r.confiada, false);
  assert.equal(await sesionConfiada(db, BEA, SESION_2), false);
});

test('pasados 30 días sin usarlo, vuelve a pedir el código y la cookie se borra', async () => {
  const { db } = bdFalsa();
  const token = await recordar(db);
  const r = await usarDispositivo(db, { userId: ANA, sessionId: SESION_1, token, ip: null, ahora: dias(31) });
  assert.deepEqual(r, { confiada: false, nueva: false, cookie: 'borrar' });
});

test('sin cookie, o con una que no casa con nada, hay que escribir el código', async () => {
  const { db } = bdFalsa();
  await recordar(db);
  assert.deepEqual(await usarDispositivo(db, { userId: ANA, sessionId: SESION_1, token: null, ip: null, ahora: dias(1) }),
    { confiada: false, nueva: false, cookie: null });
  assert.deepEqual(await usarDispositivo(db, { userId: ANA, sessionId: SESION_1, token: 'B'.repeat(43), ip: null, ahora: dias(1) }),
    { confiada: false, nueva: false, cookie: 'borrar' });
  assert.deepEqual(await usarDispositivo(db, { userId: ANA, sessionId: SESION_1, token: 'basura', ip: null, ahora: dias(1) }),
    { confiada: false, nueva: false, cookie: 'borrar' });
});

test('sin session_id en el token no se confía nada', async () => {
  const { db } = bdFalsa();
  const token = await recordar(db);
  const r = await usarDispositivo(db, { userId: ANA, sessionId: null, token, ip: null, ahora: dias(1) });
  assert.equal(r.confiada, false);
});

test('quitar un dispositivo: sus sesiones dejan de contar como verificadas al momento', async () => {
  const { db, tablas } = bdFalsa();
  const token = await recordar(db);
  const r = await usarDispositivo(db, { userId: ANA, sessionId: SESION_1, token, ip: null, ahora: dias(1) });
  const rotado = tokenPuesto(r.cookie);
  const id = tablas.dispositivos_confianza[0].id as string;
  // Otra cuenta no puede quitar el de Ana.
  await quitarDispositivos(db, BEA, id);
  assert.equal(await sesionConfiada(db, ANA, SESION_1), true);
  await quitarDispositivos(db, ANA, id);
  assert.equal(await sesionConfiada(db, ANA, SESION_1), false);
  assert.equal((await usarDispositivo(db, { userId: ANA, sessionId: SESION_2, token: rotado, ip: null, ahora: dias(2) })).confiada, false);
});

test('la lista: solo los de la cuenta, sin caducados, y marca en cuál estás', async () => {
  const { db } = bdFalsa();
  const tokenEste = await recordar(db, ANA, HOY);
  await recordar(db, ANA, dias(1));
  await recordar(db, BEA, HOY);
  const lista = await listarDispositivos(db, ANA, tokenEste, dias(2));
  assert.equal(lista.length, 2);
  assert.deepEqual(lista.map(d => d.esEste), [false, true], 'más reciente primero, y el de la cookie marcado');
  assert.ok(lista.every(d => !('token_hash' in d)), 'el hash no sale de la base de datos hacia el navegador');
  assert.equal((await listarDispositivos(db, ANA, tokenEste, dias(40))).length, 0);
});

test(`como mucho ${MAX_DISPOSITIVOS_POR_CUENTA} por cuenta: se van los menos usados`, async () => {
  const { db, tablas } = bdFalsa();
  for (let i = 0; i < MAX_DISPOSITIVOS_POR_CUENTA + 3; i++) await recordar(db, ANA, new Date(HOY.getTime() + i * 60_000));
  assert.equal(tablas.dispositivos_confianza.length, MAX_DISPOSITIVOS_POR_CUENTA);
});

test('la huella que da nombre a la cookie es estable por cuenta y no deja ver el id', () => {
  assert.equal(huellaCuenta(ANA), huellaCuenta(ANA));
  assert.notEqual(huellaCuenta(ANA), huellaCuenta(BEA));
  assert.match(huellaCuenta(ANA), /^[0-9a-f]{16}$/);
  assert.ok(!ANA.replace(/-/g, '').includes(huellaCuenta(ANA)));
});
