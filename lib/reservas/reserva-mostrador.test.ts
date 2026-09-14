import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { leerPeticionReservaMostrador, puedeApuntarEnClase } from './reserva-mostrador.ts';

const BASE = { sesionId: 'ses-1', socioId: 'soc-1', reservaId: 'res-mf3k2-1a-x9z8q' };

// ── La petición ─────────────────────────────────────────────────────────────

test('una petición completa se acepta y, sin decir nada, se avisa a la alumna', () => {
  const r = leerPeticionReservaMostrador(BASE);
  assert.deepEqual(r, { ok: true, datos: { ...BASE, avisar: true } });
});

test('«Avisar a la alumna» desmarcado viaja como avisar:false', () => {
  const r = leerPeticionReservaMostrador({ ...BASE, avisar: false });
  assert.equal(r.ok && r.datos.avisar, false);
});

test('solo un false de verdad apaga el aviso: ante la duda, se avisa', () => {
  for (const avisar of ['false', 0, null, undefined, 'no']) {
    const r = leerPeticionReservaMostrador({ ...BASE, avisar });
    assert.equal(r.ok && r.datos.avisar, true, `avisar=${String(avisar)} no debe dejar a la alumna sin aviso`);
  }
});

test('sin clase, sin clienta o sin cuerpo no se reserva nada', () => {
  assert.equal(leerPeticionReservaMostrador(null).ok, false);
  assert.equal(leerPeticionReservaMostrador('texto').ok, false);
  assert.equal(leerPeticionReservaMostrador({ ...BASE, sesionId: '' }).ok, false);
  assert.equal(leerPeticionReservaMostrador({ ...BASE, socioId: 42 }).ok, false);
  assert.equal(leerPeticionReservaMostrador({ ...BASE, socioId: ' soc-1' }).ok, false);
  assert.equal(leerPeticionReservaMostrador({ ...BASE, sesionId: 'x'.repeat(201) }).ok, false);
});

test('⚠️ un id de reserva con prefijo de plaza fija se rechaza', () => {
  // `res-pf-` hace que cancelarla no devuelva bono y dé una recuperación.
  const r = leerPeticionReservaMostrador({ ...BASE, reservaId: 'res-pf-abc' });
  assert.equal(r.ok, false);
});

test('el id de reserva tiene que tener la forma que genera el panel', () => {
  for (const reservaId of [undefined, '', 'abc', 'res-', 'res-a b', "res-x';drop", `res-${'a'.repeat(97)}`]) {
    assert.equal(leerPeticionReservaMostrador({ ...BASE, reservaId }).ok, false, `aceptó ${String(reservaId)}`);
  }
});

// ── Quién puede apuntar en qué clase ────────────────────────────────────────

test('propietaria, manager y recepción apuntan en cualquier clase', () => {
  for (const rol of ['PROPIETARIO', 'MANAGER', 'RECEPCION'] as const) {
    assert.equal(puedeApuntarEnClase({ rol, instructorIdStaff: null, instructorIdClase: 'ins-otra' }), true, rol);
    assert.equal(puedeApuntarEnClase({ rol, instructorIdStaff: null, instructorIdClase: null }), true, rol);
  }
});

test('la instructora solo apunta en sus propias clases', () => {
  assert.equal(puedeApuntarEnClase({ rol: 'INSTRUCTOR', instructorIdStaff: 'ins-1', instructorIdClase: 'ins-1' }), true);
  assert.equal(puedeApuntarEnClase({ rol: 'INSTRUCTOR', instructorIdStaff: 'ins-1', instructorIdClase: 'ins-2' }), false);
  assert.equal(puedeApuntarEnClase({ rol: 'INSTRUCTOR', instructorIdStaff: 'ins-1', instructorIdClase: null }), false);
});

test('⚠️ instructora sin ficha: ninguna clase, tampoco las que no tienen instructora', () => {
  assert.equal(puedeApuntarEnClase({ rol: 'INSTRUCTOR', instructorIdStaff: null, instructorIdClase: null }), false);
});

// ── Guardianes sobre el código ──────────────────────────────────────────────

const RAIZ = join(import.meta.dirname, '..', '..');
const ADMIN = readFileSync(join(RAIZ, 'lib/db/supabase-data-admin.ts'), 'utf8');
const RUTA = readFileSync(join(RAIZ, 'app/api/reservas/crear/route.ts'), 'utf8');

/** Nombre de la función de primer nivel que contiene la posición `i`. */
function funcionQueContiene(fuente: string, i: number): string | null {
  const antes = fuente.slice(0, i);
  const decls = [...antes.matchAll(/\n(?:export\s+)?async function (\w+)\(/g)];
  return decls.length ? decls[decls.length - 1][1] : null;
}

test('⚠️ un dueño por hecho: solo los tres dueños descuentan bono en servidor', () => {
  const duenos = new Set(['trasReservaCreada', 'trasPlazaConfirmada', 'trasPromocionDeEspera']);
  const llamadas = [...ADMIN.matchAll(/consumirBonoServidor\(/g)]
    .map(m => m.index!)
    .filter(i => !ADMIN.slice(Math.max(0, i - 'function '.length), i).endsWith('function '));
  assert.ok(llamadas.length >= 3, 'no se encuentran las llamadas de los dueños: revisa este guardián');
  for (const i of llamadas) {
    const dentro = funcionQueContiene(ADMIN, i);
    assert.ok(duenos.has(dentro ?? ''),
      `consumirBonoServidor se llama desde ${dentro}: un camino que confirma plaza llama a su dueño `
      + '(trasReservaCreada / trasPlazaConfirmada / trasPromocionDeEspera), no al descuento suelto');
  }
});

test('⚠️ la ruta del mostrador saca el estudio de la sesión y comprueba el rol', () => {
  assert.match(RUTA, /verificarSesionStaff\(req\)/);
  assert.match(RUTA, /studioId: sesion\.studioId/);
  assert.doesNotMatch(RUTA, /body\.studioId|datos\.studioId|peticion\.datos\.studioId/);
  // El rol se comprueba ANTES de reservar.
  assert.ok(RUTA.indexOf('puedeApuntarEnClase(') > 0);
  assert.ok(RUTA.indexOf('puedeApuntarEnClase(') < RUTA.indexOf('crearReservaMostrador({'),
    'la autorización tiene que ir antes de llamar a crearReservaMostrador');
});
