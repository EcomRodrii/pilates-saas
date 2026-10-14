import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { festivosPorDecidir } from './por-decidir-servidor.ts';
import { supabaseFalso } from './falso-supabase.test-helper.ts';

// El 20-nov-2026 a mediodía (Madrid): la ventana llega al 11-dic y en Madrid
// caen el 7 (Constitución, trasladado) y el 8 (Inmaculada).
const AHORA = new Date('2026-11-20T11:00:00Z');
const ESTUDIO = { codigo_postal: '28013', ciudad: 'Madrid', direccion: null, zona_horaria: 'Europe/Madrid' };
const args = { studioId: 'studio-x', ahora: AHORA, alcance: 'aviso' as const, conReservas: true };

let antes: string | undefined;
beforeEach(() => { antes = process.env.FESTIVOS_AVISO; process.env.FESTIVOS_AVISO = 'on'; });
afterEach(() => { if (antes === undefined) delete process.env.FESTIVOS_AVISO; else process.env.FESTIVOS_AVISO = antes; });

test('con el interruptor apagado: apagado, y ni una consulta', async () => {
  process.env.FESTIVOS_AVISO = 'estudios:otro';
  const { admin, llamadas } = supabaseFalso();
  assert.deepEqual(await festivosPorDecidir(admin, args), { disponible: false });
  assert.equal(llamadas.length, 0);
});

test('sin la tabla de «abrimos igualmente» (migración sin aplicar): apagado', async () => {
  const { admin } = supabaseFalso({ tablas: {
    studios: { data: ESTUDIO },
    festivos_abiertos: { error: { code: 'PGRST205', message: 'Could not find the table' } },
  } });
  assert.deepEqual(await festivosPorDecidir(admin, args), { disponible: false });
});

test('un error de lectura es null, nunca un cero inventado', async () => {
  const estudioFalla = supabaseFalso({ tablas: { studios: { error: { message: 'boom' } } } });
  assert.equal(await festivosPorDecidir(estudioFalla.admin, args), null);
  const cierresFalla = supabaseFalso({ tablas: {
    studios: { data: ESTUDIO }, festivos_abiertos: { data: [] }, cierres_estudio: { error: { message: 'boom' } },
  } });
  assert.equal(await festivosPorDecidir(cierresFalla.admin, args), null);
  const clasesFalla = supabaseFalso({ tablas: {
    studios: { data: ESTUDIO }, festivos_abiertos: { data: [] }, cierres_estudio: { data: [] }, sesiones: { error: { message: 'boom' } },
  } });
  assert.equal(await festivosPorDecidir(clasesFalla.admin, args), null);
});

test('sin comunidad conocida: disponible y sin festivos', async () => {
  const { admin } = supabaseFalso({ tablas: { studios: { data: { ...ESTUDIO, codigo_postal: '46001', ciudad: 'Valencia' } }, festivos_abiertos: { data: [] } } });
  assert.deepEqual(await festivosPorDecidir(admin, args), { disponible: true, zona: null, festivos: [], propios: false });
});

test('cuenta clases y reservas confirmadas de cada festivo, y quita lo ya decidido', async () => {
  const { admin } = supabaseFalso({ tablas: {
    studios: { data: ESTUDIO },
    festivos_abiertos: (f) => ({ data: f.some((x) => x.startsWith('gte:') && x.includes('2026-11-21')) ? [{ fecha: '2026-12-07' }] : [] }),
    cierres_estudio: { data: [] },
    sesiones: { data: [{ id: 's1' }, { id: 's2' }] },
    reservas: { count: 9 },
  } });
  const r = await festivosPorDecidir(admin, args);
  assert.ok(r && r.disponible);
  // El 7 se abrió («abrimos igualmente»): solo queda el 8.
  assert.deepEqual(r.festivos, [{ fecha: '2026-12-08', nombre: 'Inmaculada', clases: 2, reservas: 9 }]);
});

test('un festivo sin clases no se avisa', async () => {
  const { admin } = supabaseFalso({ tablas: {
    studios: { data: ESTUDIO }, festivos_abiertos: { data: [] }, cierres_estudio: { data: [] }, sesiones: { data: [] },
  } });
  const r = await festivosPorDecidir(admin, args);
  assert.deepEqual(r, { disponible: true, zona: 'MADRID', festivos: [], propios: false });
});

test('un cierre que cubre el festivo lo da por decidido', async () => {
  const { admin, llamadas } = supabaseFalso({ tablas: {
    studios: { data: ESTUDIO }, festivos_abiertos: { data: [] },
    cierres_estudio: { data: [{ desde: '2026-12-05', hasta: '2026-12-09' }] },
    sesiones: { data: [{ id: 's1' }] },
  } });
  const r = await festivosPorDecidir(admin, args);
  assert.deepEqual(r, { disponible: true, zona: 'MADRID', festivos: [], propios: false });
  assert.ok(!llamadas.includes('sesiones'), 'lo cerrado ni se cuenta');
});

// ─── Módulo Festivos (panel nuevo): lo que el estudio ha guardado ───────────

test('un festivo local guardado también espera decisión, aunque no tengamos su comunidad', async () => {
  const { admin } = supabaseFalso({ tablas: {
    studios: { data: { ...ESTUDIO, codigo_postal: '46001', ciudad: 'Valencia' } },
    festivos_abiertos: { data: [] }, cierres_estudio: { data: [] },
    festivos_estudio: { data: [{ fecha: '2026-12-01', nombre: 'Fiesta del barrio', origen: 'manual' }] },
    sesiones: { data: [{ id: 's1' }] }, reservas: { count: 3 },
  } });
  const r = await festivosPorDecidir(admin, args);
  assert.deepEqual(r, { disponible: true, zona: null, festivos: [{ fecha: '2026-12-01', nombre: 'Fiesta del barrio', clases: 1, reservas: 3 }], propios: true });
});

test('un guardado en un día oficial no sale dos veces (manda el oficial)', async () => {
  const { admin } = supabaseFalso({ tablas: {
    studios: { data: ESTUDIO }, festivos_abiertos: { data: [] }, cierres_estudio: { data: [] },
    festivos_estudio: { data: [{ fecha: '2026-12-08', nombre: 'Otra cosa', origen: 'manual' }] },
    sesiones: { data: [{ id: 's1' }] }, reservas: { count: 0 },
  } });
  const r = await festivosPorDecidir(admin, args);
  assert.ok(r && r.disponible);
  assert.deepEqual(r.festivos.map((f) => [f.fecha, f.nombre]), [['2026-12-07', 'Día de la Constitución, trasladado'], ['2026-12-08', 'Inmaculada']]);
});

test('sin la tabla del módulo (migración sin aplicar), el aviso de los oficiales sigue igual', async () => {
  const { admin } = supabaseFalso({ tablas: {
    studios: { data: ESTUDIO }, festivos_abiertos: { data: [] }, cierres_estudio: { data: [] },
    festivos_estudio: { error: { code: 'PGRST205', message: 'Could not find the table' } },
    sesiones: { data: [] },
  } });
  assert.deepEqual(await festivosPorDecidir(admin, args), { disponible: true, zona: 'MADRID', festivos: [], propios: false });
});

test('«Comprobar clases» lo enciende el panel nuevo aunque el aviso esté apagado', async () => {
  process.env.FESTIVOS_AVISO = 'estudios:otro';
  const { admin } = supabaseFalso({ tablas: { studios: { data: ESTUDIO }, festivos_abiertos: { data: [] }, cierres_estudio: { data: [] }, sesiones: { data: [] } } });
  assert.deepEqual(await festivosPorDecidir(admin, { ...args, alcance: 'todos', encendido: true }), { disponible: true, zona: 'MADRID', festivos: [], propios: false });
  assert.deepEqual(await festivosPorDecidir(admin, args), { disponible: false });
});
