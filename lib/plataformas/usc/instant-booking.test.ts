// El Instant Booking de USC contra una base de datos de mentira: lo que importa
// aquí es CUÁNTAS veces se la llama antes de reservar (USC da 500-1000 ms y no
// reintenta) y que ningún rechazo llegue a la RPC.
import test from 'node:test';
import assert from 'node:assert/strict';
import type { SupabaseClient } from '@supabase/supabase-js';
import { procesarInstantBookingUsc, leerEventoUscEmbebido } from './instant-booking-servidor.ts';

const PETICION = {
  eventoExternoId: 'evt-1', reservaExternaId: 'ext-1', clienteExternoId: 'cli-1', nombre: 'Ana', apellidos: 'Prueba',
};
const ESTUDIO_OK = { subscription_status: 'active', subscription_id: 'sub_1', trial_ends_at: null, contrato_terminado_en: null, suspendido_en: null };

interface Guion {
  embebida?: { data: unknown; error: { code?: string; message: string } | null };
  eventoPlano?: unknown;
  integracion?: { activo: boolean } | null;
  estudio?: unknown;
  rpc?: { data: unknown; error: { message: string } | null };
}

function baseDeMentira(g: Guion) {
  const llamadas: string[] = [];
  const consulta = (tabla: string, columnas: string) => {
    const q: Record<string, unknown> = {};
    const devolver = () => {
      if (tabla === 'plataforma_eventos') {
        return columnas.includes('studios(')
          ? (g.embebida ?? { data: null, error: null })
          : { data: g.eventoPlano ?? null, error: null };
      }
      if (tabla === 'integraciones') return { data: g.integracion ?? null, error: null };
      return { data: g.estudio ?? null, error: null };
    };
    q.eq = () => q;
    q.maybeSingle = async () => devolver();
    return q;
  };
  const admin = {
    from(tabla: string) {
      return { select: (columnas: string) => { llamadas.push(`from:${tabla}`); return consulta(tabla, columnas); } };
    },
    async rpc(nombre: string) {
      llamadas.push(`rpc:${nombre}`);
      return g.rpc ?? { data: [{ reserva_id: 'res-usc-ext-1', repetida: false }], error: null };
    },
  };
  return { admin: admin as unknown as SupabaseClient, llamadas };
}

const fila = (extra: Record<string, unknown> = {}, integraciones: unknown = [{ tipo: 'URBAN_SPORTS_CLUB', activo: true }]) => ({
  studio_id: 'studio-x', sesion_id: 'ses-1', estado_sync: 'SINCRONIZADO',
  studios: { ...ESTUDIO_OK, ...extra, integraciones },
});

test('camino normal: UNA lectura y la RPC, sin tocar studios ni integraciones aparte', async () => {
  const { admin, llamadas } = baseDeMentira({ embebida: { data: fila(), error: null } });
  const r = await procesarInstantBookingUsc(admin, PETICION);
  assert.equal(r.ok, true);
  assert.deepEqual(llamadas, ['from:plataforma_eventos', 'rpc:reservar_plaza_externa']);
});

test('integración apagada: rechaza y no llega a la RPC', async () => {
  const { admin, llamadas } = baseDeMentira({ embebida: { data: fila({}, [{ tipo: 'URBAN_SPORTS_CLUB', activo: false }]), error: null } });
  const r = await procesarInstantBookingUsc(admin, PETICION);
  assert.deepEqual(r, { ok: false, motivo: 'clase-no-existe' });
  assert.ok(!llamadas.includes('rpc:reservar_plaza_externa'));
});

test('sin fila de integración (o con otra plataforma): rechaza', async () => {
  for (const integraciones of [[], null, [{ tipo: 'WELLHUB', activo: true }]]) {
    const { admin, llamadas } = baseDeMentira({ embebida: { data: fila({}, integraciones), error: null } });
    const r = await procesarInstantBookingUsc(admin, PETICION);
    assert.deepEqual(r, { ok: false, motivo: 'clase-no-existe' });
    assert.ok(!llamadas.includes('rpc:reservar_plaza_externa'));
  }
});

test('estudio suspendido: rechaza aunque la integración esté activa', async () => {
  const { admin, llamadas } = baseDeMentira({ embebida: { data: fila({ suspendido_en: '2026-10-01T00:00:00Z' }), error: null } });
  const r = await procesarInstantBookingUsc(admin, PETICION);
  assert.deepEqual(r, { ok: false, motivo: 'clase-no-existe' });
  assert.ok(!llamadas.includes('rpc:reservar_plaza_externa'));
});

test('evento desconocido, cancelado o sin sesión: sus códigos de siempre', async () => {
  let t = baseDeMentira({ embebida: { data: null, error: null } });
  assert.deepEqual(await procesarInstantBookingUsc(t.admin, PETICION), { ok: false, motivo: 'clase-no-existe' });
  t = baseDeMentira({ embebida: { data: { ...fila(), estado_sync: 'CANCELADO' }, error: null } });
  assert.deepEqual(await procesarInstantBookingUsc(t.admin, PETICION), { ok: false, motivo: 'clase-cancelada' });
  t = baseDeMentira({ embebida: { data: { ...fila(), sesion_id: null }, error: null } });
  assert.deepEqual(await procesarInstantBookingUsc(t.admin, PETICION), { ok: false, motivo: 'clase-cancelada' });
  assert.ok(!t.llamadas.includes('rpc:reservar_plaza_externa'));
});

test('error de relación de PostgREST: cae a la lectura por separado y sigue siendo correcta', async () => {
  const { admin, llamadas } = baseDeMentira({
    embebida: { data: null, error: { code: 'PGRST200', message: 'relación no encontrada' } },
    eventoPlano: { studio_id: 'studio-x', sesion_id: 'ses-1', estado_sync: 'SINCRONIZADO' },
    integracion: { activo: true },
    estudio: ESTUDIO_OK,
  });
  const r = await procesarInstantBookingUsc(admin, PETICION);
  assert.equal(r.ok, true);
  assert.ok(llamadas.includes('from:integraciones') && llamadas.includes('from:studios'));
  assert.equal(llamadas.at(-1), 'rpc:reservar_plaza_externa');
});

test('otro error de la base de datos: error interno, sin fallback ni RPC', async () => {
  const { admin, llamadas } = baseDeMentira({ embebida: { data: null, error: { code: '57014', message: 'timeout' } } });
  const r = await procesarInstantBookingUsc(admin, PETICION);
  assert.equal(r.ok, false);
  assert.equal(!r.ok && r.motivo, 'error-interno');
  assert.deepEqual(llamadas, ['from:plataforma_eventos']);
});

test('el estudio como objeto o como lista (según cómo lo devuelva PostgREST)', () => {
  const a = leerEventoUscEmbebido(fila());
  const b = leerEventoUscEmbebido({ ...fila(), studios: [fila().studios] });
  assert.equal(a?.integracionActiva, true);
  assert.deepEqual(a, b);
  assert.equal(leerEventoUscEmbebido({ studio_id: 'x', studios: null }), null);
});
