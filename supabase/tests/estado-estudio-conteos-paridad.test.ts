// PARIDAD de la bandeja única (migración 20261020100000): `estado_estudio_conteos` (UNA llamada SQL) cuenta
// EXACTAMENTE lo que contaban las ~30 consultas de `contarConteosEstudio` antes de esa migración.
//
// `contarAntes` de abajo son aquellas consultas, tal cual, SOLO como referencia de este test (la ruta de producción ya
// no pasa por ellas: llama a la función una vez). Cada escenario monta un estado real, cuenta de las dos formas y exige
// el mismo número en cada fuente, con dos perfiles de quien mira (la propietaria con todo, y una gerente que da clases:
// sin su propia baja, sin las jornadas de la propietaria ni de otra gerente, solo el tablón en denuncias).
//
// Lo que no se cruza aquí a propósito: los festivos (calendario oficial en TypeScript, siguen leyéndose desde TS) y el
// veredicto del NIF (`nifEmisorValido`, TS): la función devuelve el NIF y el modo en bruto y se comprueba que es el de
// la fila.
//
// Ver `supabase/tests/rls-invariantes.test.ts` para por qué este fichero vive en `supabase/tests/`.
import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  clienteAdminLocal, crearInstructora, crearSocia, crearStudioConPropietaria, limpiarFixtures,
  limpiarInstructora, type InstructoraFixture, type StudioFixture,
} from '../../lib/db/rls-test-helpers.ts';
import { contarConCandidatosNetwork } from '../../lib/estado-estudio.ts';
import { situacionRecibo } from '../../lib/billing/situacion-recibo.ts';
import { hoyEnEstudio, inicioDelDiaEstudio } from '../../lib/utils.ts';

const admin = clienteAdminLocal();
const fixtures: StudioFixture[] = [];
const instructoras: InstructoraFixture[] = [];
let contador = 0;
const idUnico = (prefijo: string) => `${prefijo}-cnt-${process.pid}-${Date.now()}-${contador++}`;

after(async () => {
  for (const i of instructoras) await limpiarInstructora(admin, i);
  await limpiarFixtures(admin, fixtures);
});

const TODAS = [
  'sustitucionesPorDecidir', 'sustitucionesConNetwork', 'reservasPorAprobar', 'recibosFallidos', 'renovacionesSinCobro',
  'penalizacionesPorAprobar', 'devolucionesPorRevisar', 'automatizacionesEsperando', 'canjesPorEntregar', 'bajasPorRevisar',
  'seriesPorRenovar', 'plazasFijasPorDecidir', 'reconciliacionesPorRevisar', 'sustitucionesBuscando', 'ofertasListaEspera',
  'cobrosEnReintento', 'sustitucionesCubiertas24h', 'accionesAutonomasHoy', 'mensajesAutomaticosHoy', 'alertasApertura',
  'jornadasPorRevisar', 'clasesNoDadasPorRevisar', 'clasesSinInstructora', 'doblesCobrosPorRevisar', 'seguimientosParaHoy',
  'denunciasPorRevisar',
] as const;

interface Perfil { userId: string; ambitos: string[]; rolesFicha: string[] }

const HEAD = { count: 'exact', head: true } as const;
async function contar(q: PromiseLike<{ count: number | null; error: { message: string } | null }>): Promise<number> {
  const { count, error } = await q;
  assert.ok(!error, error?.message);
  return count ?? 0;
}

/** Las consultas de `contarConteosEstudio` ANTES de la migración, sin gates por rol (los pone el llamador). */
async function contarAntes(a: SupabaseClient, studioId: string, p: Perfil, ahora: Date): Promise<Record<string, number>> {
  const ahoraISO = ahora.toISOString();
  const hace24hISO = new Date(ahora.getTime() - 24 * 3600_000).toISOString();
  const inicioDiaISO = inicioDelDiaEstudio(hoyEnEstudio(ahora));
  const r: Record<string, number> = {};

  r.sustitucionesPorDecidir = await contar(a.from('sustituciones').select('id, sesiones!inner(inicio)', HEAD).eq('studio_id', studioId)
    .in('estado', ['pendiente_aprobacion', 'agotada']).gt('sesiones.inicio', ahoraISO));
  {
    const { data, error } = await a.from('sustituciones').select('candidatos_network, sesiones!inner(inicio)').eq('studio_id', studioId)
      .eq('estado', 'agotada').gt('sesiones.inicio', ahoraISO).limit(200);
    assert.ok(!error, error?.message);
    r.sustitucionesConNetwork = contarConCandidatosNetwork(data ?? []);
  }
  r.reservasPorAprobar = await contar(a.from('reservas').select('id, sesiones!inner(inicio)', HEAD).eq('studio_id', studioId)
    .eq('estado', 'PENDIENTE_APROBACION').gt('sesiones.inicio', ahoraISO));
  {
    const { data, error } = await a.from('recibos')
      .select('estado, importe, importe_devuelto, reembolso_stripe_id, reembolso_solicitado_en')
      .eq('studio_id', studioId).in('estado', ['FALLIDO', 'DEVUELTO']).limit(2000);
    assert.ok(!error, error?.message);
    r.recibosFallidos = (data ?? []).filter(x => situacionRecibo({
      estado: x.estado, importe: x.importe, importeDevuelto: x.importe_devuelto,
      reembolsoStripeId: x.reembolso_stripe_id, reembolsoSolicitadoEn: x.reembolso_solicitado_en,
    }) === 'IMPAGADO').length;
  }
  r.renovacionesSinCobro = await contar(a.from('recibos').select('id', HEAD).eq('studio_id', studioId).eq('estado', 'PENDIENTE')
    .eq('es_renovacion', true).is('proximo_reintento', null));
  r.penalizacionesPorAprobar =
    await contar(a.from('penalizaciones').select('id', HEAD).eq('studio_id', studioId).eq('estado', 'PENDIENTE_APROBACION'))
    + await contar(a.from('penalizaciones').select('id, recibos!inner(estado, proximo_reintento)', HEAD).eq('studio_id', studioId)
      .eq('estado', 'FALLIDA').eq('recibos.estado', 'PENDIENTE').is('recibos.proximo_reintento', null));
  r.devolucionesPorRevisar = await contar(a.from('devoluciones').select('id', HEAD).eq('studio_id', studioId).eq('estado', 'PENDIENTE_REVISION'));
  r.automatizacionesEsperando = await contar(a.from('automation_logs').select('id', HEAD).eq('studio_id', studioId).eq('resultado', 'PENDIENTE_ADMIN'));
  r.canjesPorEntregar = await contar(a.from('reward_redemptions').select('id', HEAD).eq('studio_id', studioId).eq('estado', 'PENDIENTE'));
  {
    const { data: ficha, error } = await a.from('instructores').select('id').eq('studio_id', studioId).eq('auth_user_id', p.userId).limit(1);
    assert.ok(!error, error?.message);
    const propia = (ficha?.[0]?.id as string | undefined) ?? null;
    let pendientes = a.from('bajas_instructora').select('id', HEAD).eq('studio_id', studioId).eq('revision', 'PENDIENTE');
    if (propia) pendientes = pendientes.neq('instructor_id', propia);
    r.bajasPorRevisar = await contar(pendientes);
  }
  {
    const { data, error } = await a.rpc('series_por_renovar', { p_studio_id: studioId, p_dias: 30 });
    assert.ok(!error, error?.message);
    r.seriesPorRenovar = Array.isArray(data) ? data.length : -1;
  }
  r.plazasFijasPorDecidir = await contar(a.from('solicitudes_plaza_fija').select('id', HEAD).eq('studio_id', studioId).eq('estado', 'PENDIENTE'));
  r.reconciliacionesPorRevisar = await contar(a.from('reconciliaciones_pos').select('payment_intent_id', HEAD).eq('studio_id', studioId).eq('estado', 'PENDIENTE'));
  r.sustitucionesBuscando = await contar(a.from('sustituciones').select('id, sesiones!inner(inicio)', HEAD).eq('studio_id', studioId)
    .eq('estado', 'contactando').gt('sesiones.inicio', ahoraISO));
  r.ofertasListaEspera = await contar(a.from('reservas').select('id', HEAD).eq('studio_id', studioId)
    .eq('estado', 'LISTA_ESPERA').gt('oferta_expira_en', ahoraISO));
  r.cobrosEnReintento = await contar(a.from('recibos').select('id', HEAD).eq('studio_id', studioId).eq('estado', 'PENDIENTE')
    .gt('intentos_reintento', 0).not('proximo_reintento', 'is', null));
  r.sustitucionesCubiertas24h = await contar(a.from('sustituciones').select('id', HEAD).eq('studio_id', studioId)
    .eq('estado', 'confirmada').gte('resuelto_en', hace24hISO));
  r.accionesAutonomasHoy = await contar(a.from('recomendaciones').select('id', HEAD).eq('studio_id', studioId)
    .eq('resuelto_por', 'AUTONOMIA').eq('estado', 'EJECUTADA').gte('resuelto_en', inicioDiaISO));
  r.mensajesAutomaticosHoy = await contar(a.from('automation_logs').select('id', HEAD).eq('studio_id', studioId)
    .eq('resultado', 'EJECUTADO').gte('ejecutado_en', inicioDiaISO));
  r.alertasApertura = await contar(a.from('alertas_opening').select('id', HEAD).eq('studio_id', studioId).is('resuelta_en', null));
  {
    const [equipo, config] = await Promise.all([
      a.from('instructores').select('id, rol').eq('studio_id', studioId),
      a.from('studio_config_tiempo').select('open_session_limit_hours').eq('studio_id', studioId).maybeSingle(),
    ]);
    assert.ok(!equipo.error && !config.error);
    const ids = ((equipo.data ?? []) as { id: string; rol: string }[]).filter(f => p.rolesFicha.includes(f.rol)).map(f => f.id);
    if (ids.length === 0) { r.jornadasPorRevisar = 0; r.clasesNoDadasPorRevisar = 0; } else {
      const horas = (config.data as { open_session_limit_hours: number } | null)?.open_session_limit_hours ?? 12;
      const corte = new Date(ahora.getTime() - horas * 3600_000).toISOString();
      r.jornadasPorRevisar =
        await contar(a.from('instructor_work_sessions').select('id', HEAD).eq('studio_id', studioId).in('instructor_id', ids).eq('status', 'PENDING_REVIEW'))
        + await contar(a.from('instructor_work_sessions').select('id', HEAD).eq('studio_id', studioId).in('instructor_id', ids).eq('status', 'OPEN').lt('check_in_at', corte));
      r.clasesNoDadasPorRevisar = await contar(a.from('clases_impartidas').select('sesion_id', HEAD).eq('studio_id', studioId).in('instructor_id', ids)
        .eq('estado', 'NO_DADA').is('revisada_en', null));
    }
  }
  r.clasesSinInstructora = await contar(a.from('sesiones').select('id, instructores!inner(activo)', HEAD).eq('studio_id', studioId)
    .eq('cancelada', false).gt('inicio', ahoraISO).eq('instructores.activo', false));
  r.doblesCobrosPorRevisar = await contar(a.from('dobles_cobros_detectados').select('id', HEAD).eq('studio_id', studioId).eq('estado', 'DETECTADA'));
  r.seguimientosParaHoy = await contar(a.from('tareas').select('id', HEAD).eq('studio_id', studioId).eq('estado', 'PENDIENTE')
    .not('socio_id', 'is', null).lte('vence_el', hoyEnEstudio(ahora)).or(`asignada_a.is.null,asignada_a.eq.${p.userId}`));
  r.denunciasPorRevisar = p.ambitos.length === 0 ? 0 : await contar(a.from('denuncias').select('id', HEAD).eq('studio_id', studioId)
    .eq('estado', 'PENDIENTE').eq('destino', 'ESTUDIO').in('ambito', p.ambitos)
    .or(`autor_auth_user_id.is.null,autor_auth_user_id.neq.${p.userId}`));
  return r;
}

async function conLaFuncion(studioId: string, p: Perfil, ahora: Date, fuentes: readonly string[] = [...TODAS, 'facturasSinNif']) {
  const { data, error } = await admin.rpc('estado_estudio_conteos', {
    p_studio_id: studioId, p_user_id: p.userId, p_ahora: ahora.toISOString(), p_fuentes: fuentes,
    p_ambitos: p.ambitos, p_roles_ficha: p.rolesFicha, p_horas_limite: 12,
  });
  assert.ok(!error, `estado_estudio_conteos: ${error?.message}`);
  return data as Record<string, unknown>;
}

async function ok(paso: string, q: PromiseLike<{ error: { message: string } | null }>) {
  const { error } = await q;
  assert.ok(!error, `${paso}: ${error?.message}`);
}

const enHoras = (h: number, desde = new Date()) => new Date(desde.getTime() + h * 3600_000).toISOString();

test('la función cuenta lo mismo que las consultas de antes, en un estudio con de todo', async () => {
  const f = await crearStudioConPropietaria(admin);
  fixtures.push(f);
  const gerente = await crearInstructora(admin, f.studioId, 'MANAGER');
  instructoras.push(gerente);
  const recepcion = await crearInstructora(admin, f.studioId, 'RECEPCION');
  instructoras.push(recepcion);
  const baja = await crearInstructora(admin, f.studioId, 'INSTRUCTOR');
  instructoras.push(baja);
  await ok('baja de la ficha', admin.from('instructores').update({ activo: false }).eq('id', baja.instructorId));
  const socio = await crearSocia(admin, f.studioId);
  const ahora = new Date();

  // Clases futuras (una por fila de abajo: la primera con instructora de baja → clasesSinInstructora) y una ya pasada.
  const futuras: string[] = [];
  for (let i = 0; i < 12; i++) {
    const id = idUnico('sesion');
    futuras.push(id);
    await ok('sesión futura', admin.from('sesiones').insert({
      id, studio_id: f.studioId, inicio: enHoras(48 + i, ahora), fin: enHoras(49 + i, ahora),
      instructor_id: i === 0 ? baja.instructorId : null, cancelada: false,
    }));
  }
  const pasada = idUnico('sesion');
  await ok('sesión pasada', admin.from('sesiones').insert({
    id: pasada, studio_id: f.studioId, inicio: enHoras(-48, ahora), fin: enHoras(-47, ahora), cancelada: false,
  }));
  const pasada2 = idUnico('sesion');
  await ok('sesión pasada 2', admin.from('sesiones').insert({
    id: pasada2, studio_id: f.studioId, inicio: enHoras(-72, ahora), fin: enHoras(-71, ahora), cancelada: false,
  }));

  // Sustituciones: por decidir (futura y pasada: la pasada no cuenta), con y sin candidatos de Network, buscando, cubierta.
  const sust = (estado: string, sesion: string, extra: Record<string, unknown> = {}) =>
    admin.from('sustituciones').insert({ id: idUnico('sust'), studio_id: f.studioId, sesion_id: sesion, estado, ...extra });
  await ok('sust agotada con network', sust('agotada', futuras[0], { candidatos_network: [{ id: 'x' }] }));
  await ok('sust agotada sin network', sust('agotada', futuras[1], { candidatos_network: [] }));
  await ok('sust agotada sin lectura', sust('agotada', futuras[2]));
  await ok('sust pendiente', sust('pendiente_aprobacion', futuras[3]));
  await ok('sust pasada', sust('agotada', pasada));
  await ok('sust buscando', sust('contactando', futuras[4]));
  await ok('sust cubierta', sust('confirmada', futuras[5], { resuelto_en: enHoras(-2, ahora) }));
  await ok('sust cubierta vieja', sust('confirmada', futuras[6], { resuelto_en: enHoras(-30, ahora) }));

  // Reservas: pendiente de aprobar (futura y pasada) y oferta de lista de espera viva y caducada.
  const res = (estado: string, sesion: string, extra: Record<string, unknown> = {}) =>
    admin.from('reservas').insert({ id: idUnico('res'), studio_id: f.studioId, sesion_id: sesion, socio_id: socio, estado, ...extra });
  await ok('res pendiente', res('PENDIENTE_APROBACION', futuras[7]));
  await ok('res pendiente pasada', res('PENDIENTE_APROBACION', pasada2));
  await ok('res oferta viva', res('LISTA_ESPERA', futuras[8], { oferta_expira_en: enHoras(2, ahora) }));
  await ok('res oferta caducada', res('LISTA_ESPERA', futuras[9], { oferta_expira_en: enHoras(-2, ahora) }));

  // Recibos: impagados (FALLIDO, devuelto por el banco), no impagados (reembolsos), renovaciones y reintentos, factura sin sellar.
  const rec = (estado: string, extra: Record<string, unknown> = {}) =>
    admin.from('recibos').insert({
      id: idUnico('rec'), studio_id: f.studioId, socio_id: socio, concepto: 'Cuota', importe: 50,
      fecha_vencimiento: hoyEnEstudio(ahora), estado, ...extra,
    });
  await ok('rec fallido', rec('FALLIDO'));
  await ok('rec devuelto banco', rec('DEVUELTO', { importe_devuelto: 0 }));
  await ok('rec devuelto reembolsado', rec('DEVUELTO', { importe_devuelto: 50 }));
  await ok('rec devuelto reembolso stripe', rec('DEVUELTO', { importe_devuelto: 0, reembolso_stripe_id: 're_x' }));
  await ok('rec renovación sin cobro', rec('PENDIENTE', { es_renovacion: true }));
  await ok('rec renovación con reintento', rec('PENDIENTE', { es_renovacion: true, proximo_reintento: enHoras(24, ahora) }));
  await ok('rec en reintento', rec('PENDIENTE', { intentos_reintento: 1, proximo_reintento: enHoras(24, ahora) }));
  await ok('rec cobrado sin sellar', rec('COBRADO', { factura_pendiente_sellar: true, fecha_cobro: hoyEnEstudio(ahora) }));

  // Seguimientos: de quien mira, de nadie, de otra persona (no cuenta), futuro (no cuenta), sin clienta (no cuenta).
  const tarea = (extra: Record<string, unknown>) =>
    admin.from('tareas').insert({ id: idUnico('tarea'), studio_id: f.studioId, titulo: 'Llamar', estado: 'PENDIENTE', socio_id: socio, vence_el: hoyEnEstudio(ahora), ...extra });
  await ok('tarea mía', tarea({ asignada_a: f.authUserId }));
  await ok('tarea de nadie', tarea({ asignada_a: null }));
  await ok('tarea de otra', tarea({ asignada_a: gerente.authUserId }));
  await ok('tarea futura', tarea({ vence_el: '2999-01-01' }));
  await ok('tarea sin clienta', tarea({ socio_id: null }));

  const propietaria: Perfil = {
    userId: f.authUserId, ambitos: ['CHAT_INSTRUCTORA', 'TABLON'], rolesFicha: ['PROPIETARIO', 'MANAGER', 'RECEPCION', 'INSTRUCTOR'],
  };
  const gerenteQueMira: Perfil = { userId: gerente.authUserId, ambitos: ['TABLON'], rolesFicha: ['RECEPCION', 'INSTRUCTOR'] };

  for (const [nombre, perfil] of [['propietaria', propietaria], ['gerente', gerenteQueMira]] as const) {
    const antes = await contarAntes(admin, f.studioId, perfil, ahora);
    const ahoraSql = await conLaFuncion(f.studioId, perfil, ahora);
    for (const clave of TODAS) {
      assert.equal(ahoraSql[clave], antes[clave], `${nombre}: ${clave} (función ${String(ahoraSql[clave])} ≠ consultas de antes ${antes[clave]})`);
    }
    // La paridad no vale si todo es cero: los escenarios de arriba tienen que contar de verdad.
    assert.equal(antes.sustitucionesPorDecidir, 4, `${nombre}: las pasadas no cuentan`);
    assert.equal(antes.sustitucionesConNetwork, 1);
    assert.equal(antes.reservasPorAprobar, 1);
    assert.equal(antes.recibosFallidos, 2);
    assert.equal(antes.renovacionesSinCobro, 1);
    assert.equal(antes.cobrosEnReintento, 1, "solo el que ya falló alguna vez: la renovación con primer cobro programado no cuenta");
    assert.equal(antes.ofertasListaEspera, 1);
    assert.equal(antes.sustitucionesBuscando, 1);
    assert.equal(antes.sustitucionesCubiertas24h, 1);
    assert.equal(antes.clasesSinInstructora, 1);
  }
  const propios = await contarAntes(admin, f.studioId, propietaria, ahora);
  const ajenos = await contarAntes(admin, f.studioId, gerenteQueMira, ahora);
  assert.equal(propios.seguimientosParaHoy, 2, 'los de quien mira y los de nadie');
  assert.equal(ajenos.seguimientosParaHoy, 2, 'los de la gerente y los de nadie');

  // El NIF y el modo salen en bruto, tal cual la fila; los cobros sin sellar, contados.
  const { data: est } = await admin.from('studios').select('nif, modo_facturacion').eq('id', f.studioId).single();
  const bruto = (await conLaFuncion(f.studioId, propietaria, ahora)).facturasSinNif as { nif: string | null; modoFacturacion: string | null; sinSellar: number };
  assert.equal(bruto.nif, est?.nif ?? null);
  assert.equal(bruto.modoFacturacion, est?.modo_facturacion ?? null);
  assert.equal(bruto.sinSellar, 1);
});

test('solo calcula las fuentes pedidas: lo que el rol no ve no sale (ni como cero)', async () => {
  const f = await crearStudioConPropietaria(admin);
  fixtures.push(f);
  const perfil: Perfil = { userId: f.authUserId, ambitos: [], rolesFicha: [] };
  const r = await conLaFuncion(f.studioId, perfil, new Date(), ['reservasPorAprobar', 'cobrosEnReintento']);
  assert.deepEqual(Object.keys(r).sort(), ['cobrosEnReintento', 'reservasPorAprobar']);
  assert.deepEqual(await conLaFuncion(f.studioId, perfil, new Date(), []), {});
});

test('un estudio vacío cuenta ceros y un estudio inexistente no inventa un NIF', async () => {
  const f = await crearStudioConPropietaria(admin);
  fixtures.push(f);
  const perfil: Perfil = { userId: f.authUserId, ambitos: ['TABLON'], rolesFicha: ['INSTRUCTOR'] };
  const vacio = await conLaFuncion(f.studioId, perfil, new Date());
  for (const clave of TODAS) assert.equal(vacio[clave], 0, clave);
  const nadie = await conLaFuncion(`no-existe-${idUnico('x')}`, perfil, new Date());
  assert.equal(nadie.facturasSinNif, null);
});

test('el día de la bandeja es el de Madrid: de 00:00 a 02:00 de Madrid «hoy» ya es el nuevo día', async () => {
  const f = await crearStudioConPropietaria(admin);
  fixtures.push(f);
  const perfil: Perfil = { userId: f.authUserId, ambitos: [], rolesFicha: [] };
  const socio = await crearSocia(admin, f.studioId);
  // 00:30 en Madrid el 1 de julio de 2026 = 22:30 UTC del 30 de junio.
  const ahora = new Date('2026-06-30T22:30:00Z');
  const tarea = (vence: string) => admin.from('tareas').insert({
    id: idUnico('tarea'), studio_id: f.studioId, titulo: 'Llamar', estado: 'PENDIENTE', socio_id: socio, vence_el: vence,
  });
  await ok('tarea de hoy en Madrid', tarea('2026-07-01'));
  await ok('tarea de mañana', tarea('2026-07-02'));
  const r = await conLaFuncion(f.studioId, perfil, ahora, ['seguimientosParaHoy']);
  assert.equal(r.seguimientosParaHoy, 1);
  assert.equal((await contarAntes(admin, f.studioId, perfil, ahora)).seguimientosParaHoy, 1);
});
