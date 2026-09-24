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
    assert.equal(puedeApuntarEnClase(rol), true, rol);
  }
});

test('la instructora ya no apunta en ninguna clase desde el panel, ni en las suyas (Tentare Core retirado)', () => {
  assert.equal(puedeApuntarEnClase('INSTRUCTOR'), false);
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

// ── RES-1 (auditoría 2026-09-23) ────────────────────────────────────────────
// El mostrador comprobaba DOS cosas (existe, no cancelada) donde el camino
// público comprueba TRES, y el comentario del propio código afirmaba la paridad
// que no existía. `reservar_plaza` tampoco compara `inicio` con `now()` — es la
// única de su familia que no lo hace; sus hermanas (`aceptar_oferta_lista_espera`,
// `resolver_reserva_pendiente`, `promocionar_siguiente_espera`,
// `confirmar_sustitucion`) sí. Resultado: recepción podía dejar una reserva
// CONFIRMADA sobre una clase de ayer, CON consumo real de bono, disparando sus
// avisos y sus créditos, y ensuciando asistencia, ocupación y liquidaciones.
test('⚠️ el mostrador NO puede apuntar a nadie a una clase que ya empezó', () => {
  const i = ADMIN.indexOf('export async function crearReservaMostrador');
  assert.ok(i > 0, 'no se encuentra crearReservaMostrador: revisa este guardián');
  // Solo el cuerpo de la función, hasta la llamada a la RPC: el guard tiene que
  // estar ANTES de reservar, no después.
  const hastaLaRpc = ADMIN.slice(i, ADMIN.indexOf("admin.rpc('reservar_plaza'", i));
  assert.ok(
    /\.select\('cancelada, inicio'\)/.test(hastaLaRpc),
    'sin leer `inicio` no se puede comprobar si la clase ya empezó',
  );
  assert.ok(
    /new Date\(ses\.inicio as string\)\.getTime\(\) <= Date\.now\(\)/.test(hastaLaRpc),
    'falta el guard de clase ya empezada, el mismo que tiene el camino público',
  );
  assert.ok(
    hastaLaRpc.includes('ya ha empezado'),
    'y quien lo sufre tiene que leer por qué, no un error genérico',
  );
});

test('⚠️ el guard de clase empezada del mostrador rechaza con 400, no con 500', () => {
  const i = ADMIN.indexOf('export async function crearReservaMostrador');
  const hastaLaRpc = ADMIN.slice(i, ADMIN.indexOf("admin.rpc('reservar_plaza'", i));
  const j = hastaLaRpc.indexOf('ya ha empezado');
  const linea = hastaLaRpc.slice(hastaLaRpc.lastIndexOf('return', j), j);
  assert.match(linea, /status: 400/, 'es una regla de negocio, no una avería del servidor');
});

// ── RES-9 (auditoría 2026-09-24) ────────────────────────────────────────────
// Los créditos de «Primera reserva» (20, `lib/configuracion/creditos.ts`) los
// otorgaba SOLO `crearReservaMostrador`. La alumna que reservaba ella misma
// —widget, PWA, OAuth— o que pagaba online no los recibía nunca, que es el
// camino mayoritario, mientras la app se los anunciaba como logro. Gemelo
// divergente: `trasReservaCreada` es el dueño único de los efectos
// post-reserva en este fichero («la misma reserva avisaba o no según quién
// pulsara el botón») y este efecto se había quedado fuera de él.
test('⚠️ «Primera reserva» se otorga en trasReservaCreada, común a los tres caminos', () => {
  const i = ADMIN.indexOf('async function trasReservaCreada');
  assert.ok(i > 0, 'no se encuentra trasReservaCreada: revisa este guardián');
  const fin = ADMIN.indexOf('\nexport async function crearReservaPublica', i);
  const cuerpo = ADMIN.slice(i, fin > 0 ? fin : i + 20_000);
  assert.ok(
    cuerpo.includes('otorgarPrimeraReservaSiToca(admin, p.studioId, p.socioId)'),
    'si esto no está aquí, el premio vuelve a depender de quién pulse el botón',
  );
});

test('⚠️ y NO se otorga además desde crearReservaMostrador (sería el gemelo otra vez)', () => {
  const i = ADMIN.indexOf('export async function crearReservaMostrador');
  assert.ok(i > 0);
  const fin = ADMIN.indexOf('\nasync function otorgarPrimeraReservaSiToca', i);
  const cuerpo = ADMIN.slice(i, fin > 0 ? fin : i + 20_000);
  assert.doesNotMatch(
    cuerpo, /await otorgarPrimeraReservaSiToca\(/,
    'el mostrador ya pasa por trasReservaCreada; llamarlo aquí duplica la vía',
  );
});
