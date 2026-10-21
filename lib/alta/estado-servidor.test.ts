import { test } from 'node:test';
import assert from 'node:assert/strict';
import { estadoDelAlta } from './estado-servidor.ts';
import type { RespuestaPuedeReservar } from '../onboarding/puede-reservar.ts';

// Lo que contesta GET /api/alta/estado (PR-5), contra un cliente falso: de dónde
// sale cada cosa y que la clase reservable es el SÍ del servidor (o el hito ya
// apuntado), nunca un tipo de clase.

type Res = { data: unknown; error: { message: string } | null; count?: number };

/** Un cliente que contesta por tabla, y apunta qué filtros se le pidieron. */
function adminFalso(tablas: Record<string, Res>) {
  const filtros: Record<string, string[]> = {};
  const admin = {
    from(tabla: string) {
      const anota = (f: string) => { (filtros[tabla] ??= []).push(f); return cadena; };
      const res = () => tablas[tabla] ?? { data: [], error: null };
      const cadena: Record<string, unknown> = {
        select: (_c: string, o?: { count?: string; head?: boolean }) => (o?.head ? anota('head') : cadena),
        eq: (c: string, v: unknown) => anota(`${c}=${v}`),
        in: (c: string) => anota(`${c} in`),
        is: (c: string, v: unknown) => anota(`${c} is ${v}`),
        gt: (c: string) => anota(`${c}>`),
        not: (c: string) => anota(`not ${c}`),
        limit: () => cadena,
        maybeSingle: async () => res(),
        then: (ok: (r: Res) => unknown, ko: (e: unknown) => unknown) => Promise.resolve(res()).then(ok, ko),
      };
      return cadena;
    },
  };
  return { admin: admin as never, filtros };
}

const AHORA = new Date('2026-10-22T10:00:00Z');
const nunca = async (): Promise<RespuestaPuedeReservar> => { throw new Error('no debería preguntar'); };

test('estudio recién creado: nada hecho, sin preguntar a nadie (no hay clase por venir)', async () => {
  const { admin, filtros } = adminFalso({ studios: { data: { cadena_id: null }, error: null } });
  const { estado, apuntarClaseReservable } = await estadoDelAlta(admin, 's-1', AHORA, {}, nunca);
  assert.deepEqual(estado, {
    claseReservable: false, avisoClase: null, enlaceCompartido: false, alumnas: false, primeraReserva: false,
    recorridoVisto: false, planEnsenado: false, sedesAbiertas: 1, foundingGratis: false,
  });
  assert.equal(apuntarClaseReservable, false);
  // Todo acotado al estudio de la sesión.
  for (const t of ['studios', 'embudo_alta', 'socios', 'reservas', 'sesiones']) {
    assert.ok(filtros[t]?.some(f => f === 's-1' || f.endsWith('=s-1')), `${t} sin filtrar por estudio`);
  }
  assert.ok(filtros.socios.includes('borrado_en is null'), 'las fichas borradas no cuentan');
});

test('lo apuntado en el embudo y lo que hay en las tablas', async () => {
  const { admin } = adminFalso({
    studios: { data: { cadena_id: null }, error: null },
    embudo_alta: { data: [{ paso: 'enlace_compartido' }, { paso: 'recorrido_visto' }, { paso: 'plan_ensenado' }, { paso: 'clase_reservable' }], error: null },
    socios: { data: [{ id: 'soc-1' }], error: null },
    reservas: { data: [{ id: 'res-1' }], error: null },
    sesiones: { data: [{ id: 'ses-1' }], error: null },
  });
  const { estado, apuntarClaseReservable } = await estadoDelAlta(admin, 's-1', AHORA, { FOUNDING_GRATIS: 'on' }, nunca);
  assert.equal(estado.claseReservable, true, 'el hito ya apuntado basta: no se vuelve a preguntar');
  assert.equal(apuntarClaseReservable, false);
  assert.equal(estado.enlaceCompartido, true);
  assert.equal(estado.recorridoVisto, true);
  assert.equal(estado.planEnsenado, true);
  assert.equal(estado.alumnas, true);
  assert.equal(estado.primeraReserva, true);
  assert.equal(estado.foundingGratis, true);
});

test('con una clase por venir y sin hito, se pregunta al motor de la reserva: el SÍ marca y se apunta', async () => {
  const { admin } = adminFalso({
    studios: { data: { cadena_id: null }, error: null },
    sesiones: { data: [{ id: 'ses-1' }], error: null },
  });
  let preguntas = 0;
  const si = async (): Promise<RespuestaPuedeReservar> => { preguntas += 1; return { estado: 'SI' }; };
  const r = await estadoDelAlta(admin, 's-1', AHORA, {}, si);
  assert.equal(preguntas, 1);
  assert.equal(r.estado.claseReservable, true);
  assert.equal(r.apuntarClaseReservable, true);
});

test('con un «no», la lista dice qué falta; si no se puede preguntar, ni marca ni avisa', async () => {
  const tablas = { studios: { data: { cadena_id: null }, error: null }, sesiones: { data: [{ id: 'ses-1' }], error: null } };
  const no = await estadoDelAlta(adminFalso(tablas).admin, 's-1', AHORA, {}, async () => ({ estado: 'NO', motivo: 'STRIPE_SIN_CUENTA' }));
  assert.equal(no.estado.claseReservable, false);
  assert.match(no.estado.avisoClase!.texto, /sin Stripe/);
  assert.equal(no.estado.avisoClase!.href, '/configuracion?tab=conexiones#integracion-stripe');
  const roto = await estadoDelAlta(adminFalso(tablas).admin, 's-1', AHORA, {}, async () => { throw new Error('sin red'); });
  assert.equal(roto.estado.claseReservable, false);
  assert.equal(roto.estado.avisoClase, null);
});

test('las sedes de su cadena, contadas; y un fallo de lectura no marca nada (lanza)', async () => {
  const { admin } = adminFalso({ studios: { data: { cadena_id: 'cad-1' }, error: null, count: 3 } });
  const { estado } = await estadoDelAlta(admin, 's-1', AHORA, {}, nunca);
  assert.equal(estado.sedesAbiertas, 3);
  const roto = adminFalso({ socios: { data: null, error: { message: 'permission denied' } }, studios: { data: { cadena_id: null }, error: null } });
  await assert.rejects(() => estadoDelAlta(roto.admin, 's-1', AHORA, {}, nunca), /permission denied/);
});
