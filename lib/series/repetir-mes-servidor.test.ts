import { test } from 'node:test';
import assert from 'node:assert/strict';
import { crearRepetir, proponerRepetir, repetirDisponible, olvidarSonda } from './repetir-mes-servidor.ts';
import { supabaseFalso } from '../festivos/falso-supabase.test-helper.ts';
import { hoyEnEstudio } from '../utils.ts';

// Un mes que siempre está por venir: el siguiente al de hoy se repite en el de después.
const hoy = hoyEnEstudio();
const [a, m] = hoy.split('-').map(Number);
const MES = m === 12 ? `${a + 1}-01` : `${a}-${String(m + 1).padStart(2, '0')}`;
const ESTUDIO = { codigo_postal: '28013', ciudad: 'Madrid', direccion: null, zona_horaria: 'Europe/Madrid' };
const sesion = (serie: string | null, dia: number, cancelada = false) =>
  ({ serie_id: serie, inicio: `${MES}-${String(dia).padStart(2, '0')}T16:30:00Z`, tipo_clase_id: 'tc', sala_id: 'sala', cancelada });
const simulacion = (o: Record<string, unknown> = {}) => ({
  data: { estado: 'simulacion', periodo: 2, periodo_actual: 1, semanas: 4, desde: '', hasta: '', creadas: 0, omitidas: [],
    sin_instructora: [], instructora_inactiva: false, plazas_fijas: 0, fechas: [], ...o },
});

test('crear: suma lo creado, ignora «ya_renovada», cuenta lo que falla y la primera fecha creada', async () => {
  const { admin, rpcs } = supabaseFalso({ rpc: (nombre, args) => {
    if (nombre === 'materializar_plazas_fijas') return {};
    if (args.p_serie_id === 'falla') return { error: { message: 'boom' } };
    if (args.p_serie_id === 'otra-persona') return { data: { estado: 'ya_renovada', creadas: 3, omitidas: [] } };
    return { data: {
      estado: 'renovada', creadas: 2, omitidas: [{ fecha: '2026-12-01', motivo: 'sala_ocupada' }],
      sin_instructora: ['2026-12-15'], creadas_ids: ['ses-1', 'ses-2'], fechas: ['2026-12-01', '2026-12-08', '2026-12-15'],
      plazas_fijas_ids: ['pf-1'],
    } };
  } });
  const r = await crearRepetir(admin, 'studio-x', 'user-1', '2026-11', [
    { serieId: 'buena', periodoVisto: 1, fechas: ['2026-12-01', '2026-12-08', '2026-12-15'] },
    { serieId: 'falla', periodoVisto: 1, fechas: ['2026-12-02', '2026-12-09'] },
    { serieId: 'otra-persona', periodoVisto: 1, fechas: ['2026-12-03'] },
  ]);
  assert.deepEqual(r, {
    creadas: 2, ids: ['ses-1', 'ses-2'], primeraFecha: '2026-12-08', fallidas: 1, pedidasFallidas: 2, pedidas: 6, sinInstructora: 1,
  });
  // Cada serie, con el estudio de la sesión, su período visto, sus fechas y hasta el último día del mes siguiente.
  const llamada = rpcs.find((x) => x.args.p_serie_id === 'buena')!;
  assert.equal(llamada.args.p_studio_id, 'studio-x');
  assert.equal(llamada.args.p_hasta, '2026-12-31');
  assert.equal(llamada.args.p_simular, false);
  assert.equal(llamada.args.p_actor, 'user-1');
  // Las clases fijas de lo renovado se pasan por el motor, como al renovar.
  assert.ok(rpcs.some((x) => x.nombre === 'materializar_plazas_fijas' && x.args.p_plaza_id === 'pf-1'));
});

test('proponer: un error leyendo el estudio o las clases es un 500, nunca una propuesta sin festivos', async () => {
  const sinEstudio = supabaseFalso({ tablas: { studios: { error: { message: 'boom' } } } });
  assert.deepEqual(await proponerRepetir(sinEstudio.admin, 'studio-x', MES), { ok: false, error: 'No se ha podido leer tu estudio.', status: 500 });
  const sinClases = supabaseFalso({ tablas: { studios: { data: ESTUDIO }, sesiones: { error: { message: 'boom' } } } });
  const r = await proponerRepetir(sinClases.admin, 'studio-x', MES);
  assert.equal(r.ok, false);
  assert.equal(!r.ok && r.status, 500);
});

test('proponer: sin la migración (PGRST202) no está disponible', async () => {
  const { admin } = supabaseFalso({
    tablas: { studios: { data: ESTUDIO }, sesiones: { data: [sesion('s1', 6)] }, series: { data: [{ id: 's1', no_renovar: false }] } },
    rpc: () => ({ error: { code: 'PGRST202', message: 'Could not find the function' } }),
  });
  assert.deepEqual(await proponerRepetir(admin, 'studio-x', MES), { ok: false, error: 'No disponible', status: 404 });
});

test('proponer: «no renovar» y un mes entero cancelado vienen desmarcados; las sueltas se cuentan aparte', async () => {
  const { admin } = supabaseFalso({
    tablas: {
      studios: { data: ESTUDIO },
      sesiones: { data: [sesion('viva', 6), sesion('no-ren', 7), sesion('cerrada', 8, true), sesion(null, 9), sesion(null, 10, true)] },
      series: { data: [{ id: 'viva', no_renovar: false }, { id: 'no-ren', no_renovar: true }, { id: 'cerrada', no_renovar: false }] },
      festivos_abiertos: { data: [] },
    },
    rpc: () => simulacion({ fechas: [] }),
  });
  const r = await proponerRepetir(admin, 'studio-x', MES);
  assert.ok(r.ok);
  const por = Object.fromEntries(r.propuesta.series.map((s) => [s.serieId, s.desmarcadaPor]));
  assert.deepEqual(por, { viva: null, 'no-ren': 'no_renovar', cerrada: 'canceladas' });
  assert.equal(r.propuesta.sueltas, 1, 'la suelta cancelada no cuenta');
  assert.equal(r.propuesta.zona, 'la Comunidad de Madrid');
  assert.equal(r.propuesta.seriesFuera, 0);
});

test('la sonda: disponible solo si la RPC nueva contesta SERIE_NO_ENCONTRADA', async () => {
  olvidarSonda();
  const no = supabaseFalso({ rpc: () => ({ error: { code: 'PGRST202', message: 'Could not find the function' } }) });
  assert.equal(await repetirDisponible(no.admin, 'studio-x'), false);
  olvidarSonda();
  const si = supabaseFalso({ rpc: () => ({ error: { code: 'P0001', message: 'SERIE_NO_ENCONTRADA' } }) });
  assert.equal(await repetirDisponible(si.admin, 'studio-x'), true);
  olvidarSonda();
});
