import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GuardadoDiferido, type EstadoGuardado, type Relojes, type Resultado } from './guardado-diferido.ts';

// Relojes a mano: `avanzar()` dispara lo que tocaría, sin esperar de verdad.
function relojesFalsos() {
  let siguiente = 1;
  const pendientes = new Map<number, () => void>();
  const relojes: Relojes = {
    setTimeout: (fn) => { const id = siguiente++; pendientes.set(id, fn); return id; },
    clearTimeout: (t) => { pendientes.delete(t as number); },
  };
  return { relojes, avanzar: () => { const fns = [...pendientes.values()]; pendientes.clear(); fns.forEach((f) => f()); }, cuantos: () => pendientes.size };
}

/** Un servidor que contesta cuando se le dice. */
function servidor() {
  const llamadas: { cambios: Record<string, unknown>; responder: (r: Resultado) => void }[] = [];
  const guardar = (cambios: Record<string, unknown>) => new Promise<Resultado>((responder) => llamadas.push({ cambios, responder }));
  return { llamadas, guardar };
}

const tick = () => new Promise((r) => setImmediate(r));

test('teclear deprisa es UNA escritura, con lo último, cuando se deja de escribir', async () => {
  const { relojes, avanzar } = relojesFalsos();
  const s = servidor();
  const estados: EstadoGuardado['e'][] = [];
  const g = new GuardadoDiferido<{ titulo: string }>(s.guardar, (e) => estados.push(e.e), 600, relojes);
  for (const t of ['B', 'Bo', 'Bon', 'Bono']) g.cambiar({ titulo: t });
  assert.equal(s.llamadas.length, 0, 'mientras se escribe, no sale nada');
  avanzar();
  assert.equal(s.llamadas.length, 1);
  assert.deepEqual(s.llamadas[0].cambios, { titulo: 'Bono' });
  s.llamadas[0].responder({ ok: true });
  await tick();
  assert.deepEqual(estados, ['pendiente', 'pendiente', 'pendiente', 'pendiente', 'guardando', 'guardado']);
});

test('lo que se teclea mientras otra escritura va de camino sale en cuanto vuelve, y «guardado» solo al final', async () => {
  const { relojes, avanzar } = relojesFalsos();
  const s = servidor();
  const estados: EstadoGuardado['e'][] = [];
  const g = new GuardadoDiferido<{ titulo: string; texto: string }>(s.guardar, (e) => estados.push(e.e), 600, relojes);
  g.cambiar({ titulo: 'Bono' });
  avanzar();
  g.cambiar({ texto: 'Diez clases' });
  avanzar();
  assert.equal(s.llamadas.length, 1, 'una a la vez: la segunda espera a la primera');
  s.llamadas[0].responder({ ok: true });
  await tick();
  assert.equal(s.llamadas.length, 2);
  assert.deepEqual(s.llamadas[1].cambios, { texto: 'Diez clases' });
  assert.ok(!estados.includes('guardado'), 'con algo aún por mandar, no se dice «guardado»');
  s.llamadas[1].responder({ ok: true });
  await tick();
  assert.equal(estados.at(-1), 'guardado');
});

test('si el servidor dice que no, lo no guardado se queda, se dice, y sale con el siguiente cambio', async () => {
  const { relojes, avanzar } = relojesFalsos();
  const s = servidor();
  let ultimo: EstadoGuardado = { e: 'quieto' };
  const g = new GuardadoDiferido<{ titulo: string; texto: string }>(s.guardar, (e) => { ultimo = e; }, 600, relojes);
  g.cambiar({ titulo: 'Bono' });
  avanzar();
  s.llamadas[0].responder({ ok: false, error: 'No tienes permiso.' });
  await tick();
  assert.deepEqual(ultimo, { e: 'error', error: 'No tienes permiso.' });
  assert.equal(g.ocupado(), true);
  assert.equal(s.llamadas.length, 1, 'nunca se reintenta solo');
  g.cambiar({ texto: 'Diez' });
  avanzar();
  assert.deepEqual(s.llamadas[1].cambios, { titulo: 'Bono', texto: 'Diez' }, 'lo que falló va con lo nuevo');
  s.llamadas[1].responder({ ok: true });
});

test('si lo de debajo falla y encima se tecleó algo del mismo campo, gana lo último', async () => {
  const { relojes, avanzar } = relojesFalsos();
  const s = servidor();
  const g = new GuardadoDiferido<{ titulo: string }>(s.guardar, () => {}, 600, relojes);
  g.cambiar({ titulo: 'Bon' });
  avanzar();
  g.cambiar({ titulo: 'Bono' });
  s.llamadas[0].responder({ ok: false, error: 'Sin red' });
  await tick();
  void g.vaciar();
  assert.deepEqual(s.llamadas[1].cambios, { titulo: 'Bono' });
  s.llamadas[1].responder({ ok: true });
});

test('«inmediato» (un interruptor, una fecha) sale sin esperar, y vaciar() manda lo pendiente ya', async () => {
  const { relojes, cuantos } = relojesFalsos();
  const s = servidor();
  const g = new GuardadoDiferido<{ activo: boolean; titulo: string }>(s.guardar, () => {}, 600, relojes);
  g.cambiar({ activo: true }, true);
  assert.equal(s.llamadas.length, 1);
  assert.equal(cuantos(), 0);
  s.llamadas[0].responder({ ok: true });
  await tick();
  g.cambiar({ titulo: 'Bono' });
  void g.vaciar();
  assert.equal(s.llamadas.length, 2, 'al salir del campo o cambiar de ficha no se espera');
  assert.equal(cuantos(), 0, 'y no queda un temporizador que lo mande otra vez');
  s.llamadas[1].responder({ ok: true });
});

test('una escritura que lanza en vez de contestar cuenta como fallo, no como guardado', async () => {
  const { relojes, avanzar } = relojesFalsos();
  let ultimo: EstadoGuardado = { e: 'quieto' };
  const g = new GuardadoDiferido<{ titulo: string }>(() => Promise.reject(new Error('fetch failed')), (e) => { ultimo = e; }, 600, relojes);
  g.cambiar({ titulo: 'Bono' });
  avanzar();
  await tick();
  assert.equal(ultimo.e, 'error');
});
