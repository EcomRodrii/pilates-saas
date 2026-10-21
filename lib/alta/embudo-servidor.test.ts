import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { apuntarPaso, olvidarPasosDeHoy } from './embudo-servidor.ts';

// Apuntar un paso del embudo: lo llaman la puerta del panel y el «¿puede
// reservar?» desde `after()`. Si esto lanzara, tumbaría lo que se mide.

const AHORA = new Date('2026-10-21T10:00:00Z');
const HACE_3_DIAS = '2026-10-18T10:00:00Z';
const HACE_90_DIAS = '2026-07-23T10:00:00Z';

function adminFalso(o: { creadoEn?: string | null; errorLectura?: string; errorEscritura?: string; revienta?: boolean } = {}) {
  const escrituras: { tabla: string; fila: unknown; opciones: unknown }[] = [];
  let lecturas = 0;
  const admin = {
    from(tabla: string) {
      if (o.revienta) throw new Error('sin red');
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: async () => {
              lecturas += 1;
              return o.errorLectura
                ? { data: null, error: { message: o.errorLectura } }
                : { data: o.creadoEn === undefined ? null : { creado_en: o.creadoEn }, error: null };
            },
          }),
        }),
        upsert: async (fila: unknown, opciones: unknown) => {
          escrituras.push({ tabla, fila, opciones });
          return { error: o.errorEscritura ? { message: o.errorEscritura } : null };
        },
      };
    },
  };
  return { admin: admin as never, escrituras, lecturas: () => lecturas };
}

beforeEach(() => olvidarPasosDeHoy());

test('apunta el paso del estudio, una vez al día por la clave primaria, sin pisar la primera hora', async () => {
  const { admin, escrituras, lecturas } = adminFalso();
  assert.equal(await apuntarPaso(admin, 'st-1', 'enlace_compartido', { detalle: 'qr', creadoEn: HACE_3_DIAS, ahora: AHORA }), true);
  assert.equal(lecturas(), 0, 'con creadoEn no vuelve a leer el estudio');
  assert.deepEqual(escrituras, [{
    tabla: 'embudo_alta',
    fila: { studio_id: 'st-1', paso: 'enlace_compartido', detalle: 'qr' },
    opciones: { onConflict: 'studio_id,paso,dia', ignoreDuplicates: true },
  }]);
});

test('sin creadoEn lo lee, y un estudio veterano no se apunta', async () => {
  const joven = adminFalso({ creadoEn: HACE_3_DIAS });
  assert.equal(await apuntarPaso(joven.admin, 'st-1', 'clase_reservable', { ahora: AHORA }), true);
  assert.equal(joven.lecturas(), 1);
  assert.deepEqual(joven.escrituras.map(e => (e.fila as { detalle: unknown }).detalle), [null]);

  const veterano = adminFalso({ creadoEn: HACE_90_DIAS });
  assert.equal(await apuntarPaso(veterano.admin, 'st-1', 'clase_reservable', { ahora: AHORA }), false);
  assert.deepEqual(veterano.escrituras, []);

  const sinEstudio = adminFalso({ creadoEn: undefined });
  assert.equal(await apuntarPaso(sinEstudio.admin, 'st-1', 'clase_reservable', { ahora: AHORA }), false);
  assert.deepEqual(sinEstudio.escrituras, []);
});

test('un intento por estudio, paso y día: la siguiente carga del panel no vuelve a escribir', async () => {
  const { admin, escrituras } = adminFalso({ errorEscritura: 'relation "public.embudo_alta" does not exist' });
  assert.equal(await apuntarPaso(admin, 'st-1', 'panel_abierto', { creadoEn: HACE_3_DIAS, ahora: AHORA }), false);
  assert.equal(await apuntarPaso(admin, 'st-1', 'panel_abierto', { creadoEn: HACE_3_DIAS, ahora: AHORA }), false);
  assert.equal(escrituras.length, 1, 'con la migración sin aplicar, un aviso al día y no uno por carga');
  // Otro paso, otro estudio u otro día de Madrid sí.
  await apuntarPaso(admin, 'st-1', 'clase_reservable', { creadoEn: HACE_3_DIAS, ahora: AHORA });
  await apuntarPaso(admin, 'st-2', 'panel_abierto', { creadoEn: HACE_3_DIAS, ahora: AHORA });
  await apuntarPaso(admin, 'st-1', 'panel_abierto', { creadoEn: HACE_3_DIAS, ahora: new Date('2026-10-21T22:30:00Z') });
  assert.equal(escrituras.length, 4, 'las 00:30 de Madrid ya son el día siguiente');
});

test('⚠️ nunca lanza: un error de lectura, de escritura o del propio cliente devuelve false', async () => {
  for (const o of [{ errorLectura: 'timeout' }, { creadoEn: HACE_3_DIAS, errorEscritura: 'relation does not exist' }, { revienta: true }]) {
    olvidarPasosDeHoy();
    const { admin } = adminFalso(o);
    assert.equal(await apuntarPaso(admin, 'st-1', 'panel_abierto', { ahora: AHORA }), false, JSON.stringify(o));
  }
  assert.equal(await apuntarPaso(adminFalso().admin, '', 'panel_abierto', { creadoEn: HACE_3_DIAS, ahora: AHORA }), false);
});

test('las marcas de «ya se enseñó» se apuntan también pasados los 40 días (PR-5)', async () => {
  for (const paso of ['recorrido_visto', 'plan_ensenado', 'correo_primera_clase'] as const) {
    const { admin, escrituras } = adminFalso();
    assert.equal(await apuntarPaso(admin, `s-${paso}`, paso, { creadoEn: HACE_90_DIAS, ahora: AHORA }), true, paso);
    assert.equal(escrituras.length, 1);
  }
  // Una medida, no.
  const { admin, escrituras } = adminFalso();
  assert.equal(await apuntarPaso(admin, 's-medida', 'enlace_compartido', { creadoEn: HACE_90_DIAS, ahora: AHORA, detalle: 'copiar' }), false);
  assert.equal(escrituras.length, 0);
});
