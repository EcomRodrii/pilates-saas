import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { SupabaseClient } from '@supabase/supabase-js';
import { repartirAvisoMensaje, repartoAvisoMensaje, type FichaEquipo } from './destinatarios.ts';
import { leerHasta } from './avisos-leidos.ts';

// ─────────────────────────────────────────────────────────────────────────────
// El aviso de un mensaje en un hilo con alumna llega a cada uno con SU papel en
// el hilo, no con lo que sea su cuenta. Antes el motor miraba primero `socios`:
// la propietaria que además es socia de su estudio recibía como SOCIA el aviso
// del mensaje de OTRA alumna al mostrador («Pilates Luz te ha escrito», con un
// enlace al hilo de la app de la alumna que le contesta 403).
// ─────────────────────────────────────────────────────────────────────────────

const RECEPCION: FichaEquipo = { id: 'ins-rec', auth_user_id: 'recepcion', rol: 'RECEPCION', activo: true };
const PROFE: FichaEquipo = { id: 'ins-profe', auth_user_id: 'profe', rol: 'INSTRUCTOR', activo: true };

test('mostrador: escribe la alumna → la dueña como PROPIETARIO aunque sea socia del estudio, y recepción con su rol', () => {
  const r = repartirAvisoMensaje({
    tipo: 'ALUMNA_MOSTRADOR', remitente: 'ana',
    socia: { socioId: 'soc-ana', cuenta: 'ana' },
    staffDelHilo: [], fichas: [RECEPCION], duena: 'duena',
  });
  assert.deepEqual(r, [
    { role: 'PROPIETARIO', userId: 'duena' },
    { role: 'RECEPCION', userId: 'recepcion', instructorId: 'ins-rec' },
  ]);
});

test('mostrador: contesta recepción → la alumna como SOCIA (con su ficha) y el resto del equipo, sin quien escribe', () => {
  const r = repartirAvisoMensaje({
    tipo: 'ALUMNA_MOSTRADOR', remitente: 'recepcion',
    socia: { socioId: 'soc-ana', cuenta: 'ana' },
    staffDelHilo: [], fichas: [RECEPCION], duena: 'duena',
  });
  assert.deepEqual(r, [
    { role: 'SOCIA', userId: 'ana', socioId: 'soc-ana' },
    { role: 'PROPIETARIO', userId: 'duena' },
  ]);
});

test('mostrador: una ficha de instructora o una de baja no es mostrador', () => {
  const r = repartirAvisoMensaje({
    tipo: 'ALUMNA_MOSTRADOR', remitente: 'ana',
    socia: { socioId: 'soc-ana', cuenta: 'ana' },
    staffDelHilo: [],
    fichas: [PROFE, { ...RECEPCION, activo: false }], duena: null,
  });
  assert.deepEqual(r, []);
});

test('hilo con la instructora: la instructora que además es alumna del estudio recibe como INSTRUCTOR, no como SOCIA', () => {
  const r = repartirAvisoMensaje({
    tipo: 'ALUMNA_INSTRUCTORA', remitente: 'ana',
    socia: { socioId: 'soc-ana', cuenta: 'ana' },
    staffDelHilo: ['profe'], fichas: [PROFE], duena: 'duena',
  });
  assert.deepEqual(r, [{ role: 'INSTRUCTOR', userId: 'profe', instructorId: 'ins-profe' }]);
});

test('hilo con la instructora: dada de baja en este estudio no se entera; la alumna sí', () => {
  const r = repartirAvisoMensaje({
    tipo: 'ALUMNA_INSTRUCTORA', remitente: 'profe',
    socia: { socioId: 'soc-ana', cuenta: 'ana' },
    staffDelHilo: ['profe'], fichas: [{ ...PROFE, activo: false }], duena: 'duena',
  });
  assert.deepEqual(r, [{ role: 'SOCIA', userId: 'ana', socioId: 'soc-ana' }]);
});

test('la alumna sin cuenta (la borró) no recibe nada; su ficha sigue siendo la del hilo', () => {
  const r = repartirAvisoMensaje({
    tipo: 'ALUMNA_MOSTRADOR', remitente: 'recepcion',
    socia: { socioId: 'soc-ana', cuenta: null },
    staffDelHilo: [], fichas: [RECEPCION], duena: null,
  });
  assert.deepEqual(r, []);
});

// ── Con la base (falsa): la cuenta de la alumna también por su ficha ──────────

type Fila = Record<string, unknown>;

function adminFalso(tablas: Record<string, Fila[]>): SupabaseClient {
  return {
    from(tabla: string) {
      let filas = tablas[tabla] ?? [];
      const q = {
        select: () => q,
        eq: (col: string, val: unknown) => { filas = filas.filter((f) => f[col] === val); return q; },
        neq: (col: string, val: unknown) => { filas = filas.filter((f) => f[col] !== val); return q; },
        in: (col: string, vals: unknown[]) => { filas = filas.filter((f) => vals.includes(f[col])); return q; },
        maybeSingle: async () => ({ data: filas[0] ?? null, error: null }),
        then: (ok: (r: { data: Fila[]; error: null }) => unknown) => Promise.resolve({ data: filas, error: null }).then(ok),
      };
      return q;
    },
  } as unknown as SupabaseClient;
}

test('la alumna que volvió con otra cuenta recibe en la nueva (su ficha), y el aviso lleva su socioId', async () => {
  const admin = adminFalso({
    studios: [{ id: 's1', owner_auth_user_id: 'duena' }],
    socios: [{ id: 'soc-ana', studio_id: 's1', auth_user_id: 'ana-nueva' }],
    instructores: [{ id: 'ins-rec', studio_id: 's1', auth_user_id: 'recepcion', rol: 'RECEPCION', activo: true }],
    conversacion_participantes: [
      // La fila SOCIO se quedó sin cuenta al borrar la vieja.
      { conversacion_id: 'c1', auth_user_id: null, rol_en_conversacion: 'SOCIO', socio_id: 'soc-ana' },
    ],
  });
  const r = await repartoAvisoMensaje(admin, { id: 'c1', studio_id: 's1', tipo: 'ALUMNA_MOSTRADOR' }, 'recepcion');
  assert.equal(r.socioId, 'soc-ana');
  assert.deepEqual(r.recipients, [
    { role: 'SOCIA', userId: 'ana-nueva', socioId: 'soc-ana' },
    { role: 'PROPIETARIO', userId: 'duena' },
  ]);
  assert.deepEqual(r.authUserIds, ['ana-nueva', 'duena']);
});

test('EQUIPO (congelado) no cambia: sin recipients explícitos ni socioId', async () => {
  const admin = adminFalso({
    studios: [{ id: 's1', owner_auth_user_id: 'duena' }],
    instructores: [{ id: 'ins-rec', studio_id: 's1', auth_user_id: 'recepcion', rol: 'RECEPCION', activo: true }],
    conversacion_participantes: [],
  });
  const r = await repartoAvisoMensaje(admin, { id: 'c9', studio_id: 's1', tipo: 'EQUIPO' }, 'recepcion');
  assert.equal(r.recipients, null);
  assert.equal(r.socioId, null);
  assert.deepEqual(r.authUserIds, ['duena']);
});

// ── «Hasta dónde» ha leído quien abre el hilo ───────────────────────────────

test('leerHasta: sin el campo es un cliente anterior; vacío o raro es «nada pintado»; si no, el id', () => {
  assert.equal(leerHasta({ studioId: 's1' }), undefined);
  assert.equal(leerHasta(null), undefined);
  assert.equal(leerHasta({ hasta: null }), null);
  assert.equal(leerHasta({ hasta: '' }), null);
  assert.equal(leerHasta({ hasta: 42 }), null);
  assert.equal(leerHasta({ hasta: 'x'.repeat(201) }), null);
  assert.equal(leerHasta({ hasta: 'msg-1' }), 'msg-1');
});
