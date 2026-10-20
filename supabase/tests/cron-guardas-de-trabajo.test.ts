// Guardas de pg_cron (migr 20261020110000): «hay trabajo ⇒ la guarda llama; no hay trabajo ⇒ no llama», contra una
// base real. Una guarda que dice «nada» cuando sí hay es un aviso o un cierre que no sale, en silencio.
//
// Cada función admite un `p_studio_id` solo para esto: acota la guarda a un estudio de fixture y no depende de lo que
// dejen otros tests en la base (el job la llama sin argumento).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  clienteAdminLocal, crearSocia, crearStudioConPropietaria, limpiarFixtures, sqlLocal, type StudioFixture,
} from '../../lib/db/rls-test-helpers.ts';
import { franjaRecordatorio } from '../../lib/notificaciones/recordatorio-clase.ts';

const admin = clienteAdminLocal();
const sql = sqlLocal();
let contador = 0;
const idUnico = (prefijo: string) => `${prefijo}-cg-${process.pid}-${Date.now()}-${contador++}`;
const enMin = (n: number) => new Date(Date.now() + n * 60_000);
const RAIZ = join(import.meta.dirname, '../..');

async function conEstudio(prueba: (studio: StudioFixture) => Promise<void>) {
  const studio = await crearStudioConPropietaria(admin);
  try { await prueba(studio); } finally { await limpiarFixtures(admin, [studio]); }
}

async function tipo(studioId: string) {
  const id = idUnico('tc');
  const { error } = await admin.from('tipos_clase').insert({ id, studio_id: studioId, nombre: `Tipo ${id}` });
  assert.ok(!error, error?.message);
  return id;
}
async function sesion(studioId: string, tipoId: string, inicio: Date, p: { aforo?: number; cancelada?: boolean; duracionMin?: number } = {}) {
  const id = idUnico('ses');
  const { error } = await admin.from('sesiones').insert({
    id, studio_id: studioId, tipo_clase_id: tipoId, inicio: inicio.toISOString(),
    fin: new Date(inicio.getTime() + (p.duracionMin ?? 50) * 60_000).toISOString(),
    aforo_maximo: p.aforo ?? 8, cancelada: p.cancelada ?? false,
  });
  assert.ok(!error, `sesión: ${error?.message}`);
  return id;
}
async function reserva(studioId: string, sesionId: string, estado: string, extra: Record<string, unknown> = {}) {
  const id = idUnico('res');
  const { error } = await admin.from('reservas').insert({
    id, studio_id: studioId, sesion_id: sesionId, socio_id: await crearSocia(admin, studioId), estado, ...extra,
  });
  assert.ok(!error, `reserva: ${error?.message}`);
  return id;
}
async function guarda(nombre: string, studioId: string): Promise<boolean> {
  const [r] = await sql.unsafe(`select public.${nombre}($1) as v`, [studioId]);
  return r.v as boolean;
}

// ── notif-recordatorios ──────────────────────────────────────────────────────
test('recordatorios: sin reservas confirmadas en la ventana no llama; con una, sí', async () => {
  await conEstudio(async ({ studioId }) => {
    const t = await tipo(studioId);
    assert.equal(await guarda('cron_hay_recordatorios_de_clase', studioId), false, 'sin clases');
    const lejana = await sesion(studioId, t, enMin(60 * 60)); // 60 h: fuera de las 24,5 h
    await reserva(studioId, lejana, 'CONFIRMADA');
    assert.equal(await guarda('cron_hay_recordatorios_de_clase', studioId), false, 'clase demasiado lejana');
    const proxima = await sesion(studioId, t, enMin(23 * 60));
    await reserva(studioId, proxima, 'LISTA_ESPERA');
    assert.equal(await guarda('cron_hay_recordatorios_de_clase', studioId), false, 'solo lista de espera: nadie a quien avisar');
    await reserva(studioId, proxima, 'CONFIRMADA');
    assert.equal(await guarda('cron_hay_recordatorios_de_clase', studioId), true, 'confirmada en la franja tardía/larga');
  });
});

test('recordatorios: clase cancelada o estudio suspendido no llaman', async () => {
  await conEstudio(async ({ studioId }) => {
    const t = await tipo(studioId);
    const cancelada = await sesion(studioId, t, enMin(23 * 60), { cancelada: true });
    await reserva(studioId, cancelada, 'CONFIRMADA');
    assert.equal(await guarda('cron_hay_recordatorios_de_clase', studioId), false, 'clase cancelada');
    const viva = await sesion(studioId, t, enMin(23 * 60));
    await reserva(studioId, viva, 'CONFIRMADA');
    assert.equal(await guarda('cron_hay_recordatorios_de_clase', studioId), true);
    const { error } = await admin.from('studios').update({ suspendido_en: new Date().toISOString() }).eq('id', studioId);
    assert.ok(!error, error?.message);
    assert.equal(await guarda('cron_hay_recordatorios_de_clase', studioId), false, 'estudio suspendido (la ruta lo excluye)');
  });
});

// Todo inicio de clase en el que la RUTA actuaría (`franjaRecordatorio`, la misma función que usa el barrido) tiene
// que dar guarda en verdad, para cada antelación que un estudio puede elegir. Fuera de la ventana ± margen, falsa.
test('recordatorios: dondequiera que el barrido actúe, la guarda llama (cada antelación posible)', async () => {
  for (const [largoHoras, cortoMinutos] of [[24, 60], [12, 30], [48, 120], [12, 120], [48, 30]] as const) {
    await conEstudio(async ({ studioId }) => {
      const { error } = await admin.from('studios').update({ recordatorio_largo_horas: largoHoras, recordatorio_corto_minutos: cortoMinutos }).eq('id', studioId);
      assert.ok(!error, error?.message);
      const t = await tipo(studioId);
      const s = await sesion(studioId, t, enMin(120));
      await reserva(studioId, s, 'CONFIRMADA');
      for (let min = -20; min <= largoHoras * 60 + 90; min += 7) {
        const ahora = Date.now();
        const inicio = new Date(ahora + min * 60_000);
        await sql`update public.sesiones set inicio = ${inicio}, fin = ${new Date(inicio.getTime() + 50 * 60_000)} where id = ${s}`;
        const hay = await guarda('cron_hay_recordatorios_de_clase', studioId);
        const barrido = franjaRecordatorio(inicio, ahora, { largoHoras, cortoMinutos }) !== null;
        if (barrido) assert.equal(hay, true, `largo=${largoHoras} corto=${cortoMinutos}: a ${min} min el barrido actúa y la guarda no llama`);
        if (min < cortoMinutos - 17 || min > largoHoras * 60 + 32) assert.equal(hay, false, `largo=${largoHoras} corto=${cortoMinutos}: a ${min} min no hay nada`);
      }
    });
  }
});

// ── checkin-automatico ───────────────────────────────────────────────────────
test('checkin automático: solo si una clase no cancelada terminó en las últimas 2 h con alguien confirmado', async () => {
  await conEstudio(async ({ studioId }) => {
    const t = await tipo(studioId);
    assert.equal(await guarda('cron_hay_checkin_automatico', studioId), false, 'sin clases');
    const futura = await sesion(studioId, t, enMin(30));
    await reserva(studioId, futura, 'CONFIRMADA');
    assert.equal(await guarda('cron_hay_checkin_automatico', studioId), false, 'aún no ha terminado');
    const antigua = await sesion(studioId, t, enMin(-5 * 60));
    await reserva(studioId, antigua, 'CONFIRMADA');
    assert.equal(await guarda('cron_hay_checkin_automatico', studioId), false, 'terminó hace más de 2 h');
    const reciente = await sesion(studioId, t, enMin(-80)); // termina hace 30 min
    await reserva(studioId, reciente, 'ASISTIDA');
    assert.equal(await guarda('cron_hay_checkin_automatico', studioId), false, 'ya asistida: nada que marcar');
    await reserva(studioId, reciente, 'CONFIRMADA');
    assert.equal(await guarda('cron_hay_checkin_automatico', studioId), true, 'confirmada en una clase de hace 30 min');
  });
});

test('checkin automático: una clase cancelada no llama; el borde de las 2 h sí', async () => {
  await conEstudio(async ({ studioId }) => {
    const t = await tipo(studioId);
    const cancelada = await sesion(studioId, t, enMin(-80), { cancelada: true });
    await reserva(studioId, cancelada, 'CONFIRMADA');
    assert.equal(await guarda('cron_hay_checkin_automatico', studioId), false);
    const casi = await sesion(studioId, t, enMin(-(119 + 50))); // termina hace 119 min: dentro de la ventana de la ruta
    await reserva(studioId, casi, 'CONFIRMADA');
    assert.equal(await guarda('cron_hay_checkin_automatico', studioId), true);
  });
});

test('recordatorios: una reserva confirmada sin socia no llama (la ruta la descarta)', async () => {
  await conEstudio(async ({ studioId }) => {
    const t = await tipo(studioId);
    const s = await sesion(studioId, t, enMin(23 * 60));
    const { error } = await admin.from('reservas').insert({ id: idUnico('res'), studio_id: studioId, sesion_id: s, socio_id: null, estado: 'CONFIRMADA' });
    assert.ok(!error, error?.message);
    assert.equal(await guarda('cron_hay_recordatorios_de_clase', studioId), false);
  });
});

test('checkin automático: bordes de 120 y 121 min (la guarda es más ancha que la ruta, nunca más estrecha)', async () => {
  for (const [haceMin, esperado] of [[119, true], [120, true], [121, true], [123, false]] as const) {
    await conEstudio(async ({ studioId }) => {
      const t = await tipo(studioId);
      const s = await sesion(studioId, t, enMin(-haceMin - 50)); // termina hace `haceMin` min
      await reserva(studioId, s, 'CONFIRMADA');
      assert.equal(await guarda('cron_hay_checkin_automatico', studioId), esperado, `terminó hace ${haceMin} min`);
    });
  }
});

// ── sustituciones-cerrar-vencidas ────────────────────────────────────────────
async function sustitucion(studioId: string, sesionId: string, estado: string) {
  const { error } = await admin.from('sustituciones').insert({ id: idUnico('sus'), studio_id: studioId, sesion_id: sesionId, estado });
  assert.ok(!error, `sustitución: ${error?.message}`);
}

test('sustituciones: cada estado en juego con la clase ya empezada llama; clase futura o estado cerrado, no', async () => {
  const fuente = readFileSync(join(RAIZ, 'lib/sustituciones/contacto.ts'), 'utf8');
  const enJuego = [...fuente.match(/ESTADOS_EN_JUEGO\s*=\s*\[([^\]]+)\]/)![1].matchAll(/'([^']+)'/g)].map(m => m[1]);
  assert.ok(enJuego.length >= 4, 'no se pudo leer ESTADOS_EN_JUEGO');
  const migracion = readFileSync(join(RAIZ, 'supabase/migrations/20261020110000_pg_cron_guardas_de_trabajo_tanda_2.sql'), 'utf8');
  const enMigracion = [...migracion.match(/su\.estado in \(([^)]+)\)/)![1].matchAll(/'([^']+)'/g)].map(m => m[1]);
  assert.deepEqual([...enMigracion].sort(), [...enJuego].sort(), 'la guarda y ESTADOS_EN_JUEGO deben decir lo mismo');

  for (const estado of enJuego) {
    await conEstudio(async ({ studioId }) => {
      const t = await tipo(studioId);
      const futura = await sesion(studioId, t, enMin(120));
      await sustitucion(studioId, futura, estado);
      assert.equal(await guarda('cron_hay_sustituciones_vencidas', studioId), false, `${estado}: la clase no ha empezado`);
      const pasada = await sesion(studioId, t, enMin(-30));
      await sustitucion(studioId, pasada, estado);
      assert.equal(await guarda('cron_hay_sustituciones_vencidas', studioId), true, `${estado}: clase empezada`);
    });
  }
  await conEstudio(async ({ studioId }) => {
    const t = await tipo(studioId);
    const pasada = await sesion(studioId, t, enMin(-30));
    for (const cerrado of ['confirmada', 'sin_sustituta', 'cancelada']) await sustitucion(studioId, pasada, cerrado);
    assert.equal(await guarda('cron_hay_sustituciones_vencidas', studioId), false, 'ya cerradas: nada que cerrar');
  });
});

test('sustituciones: una clase cancelada con sustitución en juego SÍ llama (la ruta no mira `cancelada`)', async () => {
  await conEstudio(async ({ studioId }) => {
    const t = await tipo(studioId);
    const s = await sesion(studioId, t, enMin(-30), { cancelada: true });
    await sustitucion(studioId, s, 'buscando');
    assert.equal(await guarda('cron_hay_sustituciones_vencidas', studioId), true);
  });
});

// ── zoom-sync ────────────────────────────────────────────────────────────────
test('zoom: llama si el estudio tiene Zoom conectado (haya o no clases online), no si no', async () => {
  await conEstudio(async ({ studioId }) => {
    assert.equal(await guarda('cron_hay_zoom_sync', studioId), false);
    const { error } = await admin.from('studios').update({ zoom_email: 'estudio@example.com' }).eq('id', studioId);
    assert.ok(!error, error?.message);
    assert.equal(await guarda('cron_hay_zoom_sync', studioId), true);
  });
});

// ── lista-espera-ofertas-expirar ─────────────────────────────────────────────
async function original(studioId: string): Promise<boolean> {
  // La guarda de antes de esta migración, tal cual, acotada al estudio.
  const [r] = await sql`
    select (exists (select 1 from public.reservas r where r.studio_id = ${studioId} and r.estado = 'LISTA_ESPERA'
                      and r.oferta_expira_en is not null and r.oferta_expira_en <= now())
         or exists (select 1 from public.sesiones_con_plazas_liberadas(interval '15 minutes') x where x.studio_id = ${studioId})) as v`;
  return r.v as boolean;
}

test('lista de espera: la guarda nueva da lo mismo que la de antes en cada escenario', async () => {
  await conEstudio(async ({ studioId }) => {
    const t = await tipo(studioId);
    assert.equal(await guarda('cron_hay_trabajo_lista_espera', studioId), false, 'vacío');
    assert.equal(await original(studioId), false);

    // Espera sin oferta y sin plataforma que aparte: no hay nada.
    const s = await sesion(studioId, t, enMin(2 * 60 - 5), { aforo: 3 });
    await reserva(studioId, s, 'CONFIRMADA');
    await reserva(studioId, s, 'LISTA_ESPERA', { posicion_espera: 1 });
    assert.equal(await guarda('cron_hay_trabajo_lista_espera', studioId), await original(studioId));
    assert.equal(await guarda('cron_hay_trabajo_lista_espera', studioId), false);

    // ClassPass encendida, cede 2 plazas y las libera 2 h antes: hace 5 min que se liberaron.
    const { error: e1 } = await admin.from('integraciones').insert({ id: idUnico('intg'), studio_id: studioId, tipo: 'CLASSPASS', activo: true });
    assert.ok(!e1, e1?.message);
    const { error: e2 } = await admin.from('plataforma_cupos').insert({ studio_id: studioId, plataforma: 'CLASSPASS', tipo_clase_id: t, plazas: 2 });
    assert.ok(!e2, e2?.message);
    const { error: e3 } = await admin.from('plataforma_ajustes').insert({ studio_id: studioId, plataforma: 'CLASSPASS', liberar_horas_antes: 2 });
    assert.ok(!e3, e3?.message);
    assert.equal(await original(studioId), true, 'precondición: la función cara ve plazas recién liberadas');
    assert.equal(await guarda('cron_hay_trabajo_lista_espera', studioId), true, 'plazas liberadas con cola');

    // Sin cola esperando ya no hay a quién subir.
    await admin.from('reservas').delete().eq('sesion_id', s).eq('estado', 'LISTA_ESPERA');
    assert.equal(await guarda('cron_hay_trabajo_lista_espera', studioId), await original(studioId));
    assert.equal(await guarda('cron_hay_trabajo_lista_espera', studioId), false);
  });
});

test('lista de espera: una oferta caducada llama aunque no haya plataformas; una viva, no', async () => {
  await conEstudio(async ({ studioId }) => {
    const t = await tipo(studioId);
    const s = await sesion(studioId, t, enMin(5 * 60));
    await reserva(studioId, s, 'LISTA_ESPERA', { posicion_espera: 1, oferta_expira_en: enMin(30).toISOString() });
    assert.equal(await guarda('cron_hay_trabajo_lista_espera', studioId), false, 'oferta viva');
    assert.equal(await original(studioId), false);
    await reserva(studioId, s, 'LISTA_ESPERA', { posicion_espera: 2, oferta_expira_en: enMin(-1).toISOString() });
    assert.equal(await guarda('cron_hay_trabajo_lista_espera', studioId), true, 'oferta caducada');
    assert.equal(await original(studioId), true);
  });
});

// ── los jobs ─────────────────────────────────────────────────────────────────
test('los cinco jobs conservan nombre y cadencia, y llaman solo si la guarda lo dice', async () => {
  const [{ hay }] = await sql`select to_regclass('cron.job') is not null as hay`;
  if (!hay) return; // sin pg_cron en esta base no hay jobs que mirar
  const esperados: Record<string, [string, string]> = {
    'notif-recordatorios': ['*/15 * * * *', 'cron_hay_recordatorios_de_clase()'],
    'checkin-automatico': ['*/30 * * * *', 'cron_hay_checkin_automatico()'],
    'sustituciones-cerrar-vencidas': ['*/30 * * * *', 'cron_hay_sustituciones_vencidas()'],
    'zoom-sync': ['*/15 * * * *', 'cron_hay_zoom_sync()'],
    'lista-espera-ofertas-expirar': ['*/5 * * * *', 'cron_hay_trabajo_lista_espera()'],
  };
  for (const [nombre, [cadencia, guardaSql]] of Object.entries(esperados)) {
    const filas = await sql`select schedule, command from cron.job where jobname = ${nombre}`;
    if (filas.length === 0) continue; // base local sin ese job (se crea en otra migración)
    assert.equal(filas[0].schedule, cadencia, `${nombre}: la cadencia no cambia`);
    assert.ok((filas[0].command as string).includes(`where public.${guardaSql}`), `${nombre}: el job debe llamar a su guarda`);
    assert.ok((filas[0].command as string).includes('/api/cron/'), `${nombre}: sigue llamando a su ruta`);
  }
});

test.after(async () => { await sql.end(); });
