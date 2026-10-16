import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { marcarUso, olvidarMarcasDeHoy } from './marcar-uso.ts';
import { registrarSituacionDiaria } from './situacion-diaria.ts';

// Las marcas de uso y el informe diario: solo con BAJAS_AUTOMATICAS=informe,
// como mucho una llamada al día por estudio, y nunca tumban la petición.

type Llamada = { fn: string; args: Record<string, unknown> };
function adminFalso(error: { message: string } | null = null, data: unknown = null) {
  const llamadas: Llamada[] = [];
  const admin = {
    rpc: async (fn: string, args: Record<string, unknown>) => {
      llamadas.push({ fn, args });
      return { data, error };
    },
  };
  return { admin: admin as never, llamadas };
}
const informe = { BAJAS_AUTOMATICAS: 'informe' };

beforeEach(() => olvidarMarcasDeHoy());

test('apagado: no llama a nada', async () => {
  const { admin, llamadas } = adminFalso();
  assert.equal(await marcarUso(admin, 'panel', 'studio-1', { entorno: {} }), false);
  assert.equal(await marcarUso(admin, 'app', 'socio-1', { entorno: { BAJAS_AUTOMATICAS: 'activa' } }), false);
  assert.deepEqual(llamadas, []);
});

test('informe: una llamada por estudio y día de Madrid, con la función y el parámetro de cada uso', async () => {
  const { admin, llamadas } = adminFalso();
  const ahora = new Date('2026-10-16T10:00:00Z');
  assert.equal(await marcarUso(admin, 'panel', 'studio-1', { entorno: informe, ahora }), true);
  assert.equal(await marcarUso(admin, 'panel', 'studio-1', { entorno: informe, ahora }), false);
  assert.equal(await marcarUso(admin, 'app', 'socio-1', { entorno: informe, ahora }), true);
  // 00:30 del 17 en Madrid (22:30 UTC del 16): ya es otro día.
  assert.equal(await marcarUso(admin, 'panel', 'studio-1', { entorno: informe, ahora: new Date('2026-10-16T22:30:00Z') }), true);
  assert.deepEqual(llamadas, [
    { fn: 'marcar_uso_panel', args: { p_studio_id: 'studio-1' } },
    { fn: 'marcar_uso_app', args: { p_socio_id: 'socio-1' } },
    { fn: 'marcar_uso_panel', args: { p_studio_id: 'studio-1' } },
  ]);
});

test('si la marca falla, no lanza ni se reintenta en cada petición del día', async () => {
  const { admin, llamadas } = adminFalso({ message: 'function public.marcar_uso_panel(text) does not exist' });
  const ahora = new Date('2026-10-16T10:00:00Z');
  await assert.doesNotReject(marcarUso(admin, 'panel', 'studio-1', { entorno: informe, ahora }));
  await marcarUso(admin, 'panel', 'studio-1', { entorno: informe, ahora });
  assert.equal(llamadas.length, 1);
  const lanza = { rpc: async () => { throw new Error('red'); } } as never;
  await assert.doesNotReject(marcarUso(lanza, 'app', 'socio-2', { entorno: informe, ahora }));
});

test('informe diario: apagado no llama; en informe, una RPC y su resumen', async () => {
  const resumen = { dia: '2026-10-16', escritas: 18, ya_estaban: 0, errores: 0, marcas_de_panel_iniciales: 15 };
  const { admin, llamadas } = adminFalso(null, resumen);
  assert.deepEqual(await registrarSituacionDiaria(admin, {}), { skipped: 'BAJAS_AUTOMATICAS no está en informe' });
  assert.deepEqual(llamadas, []);
  assert.deepEqual(await registrarSituacionDiaria(admin, informe), resumen);
  assert.deepEqual(llamadas.map(l => l.fn), ['registrar_situacion_diaria']);
  const { admin: roto } = adminFalso({ message: 'x' });
  await assert.rejects(registrarSituacionDiaria(roto, informe), /registrar_situacion_diaria/);
});

test('las marcas se escriben donde dice el diseño: el panel, la app de la alumna y la del equipo, siempre después de contestar', () => {
  const leer = (r: string) => readFileSync(join(import.meta.dirname, '../..', r), 'utf8');
  const status = leer('app/api/billing/status/route.ts');
  assert.match(status, /after\(\(\) => marcarUso\(admin, 'panel', sesion\.studioId\)\)/);
  assert.match(leer('app/api/public/session/route.ts'), /after\(\(\) => marcarUso\(admin, 'app', socia\.socioId\)\)/);
  assert.match(leer('app/api/portal/instructora/sesion/route.ts'), /after\(\(\) => marcarUso\(admin, 'panel', sesion\.studioId\)\)/);
  // El informe diario cuelga del cron que ya existe, sin cron nuevo.
  assert.match(leer('app/api/cron/notif-trial/route.ts'), /registrarSituacionDiaria\(requireSupabaseAdmin\(\)\)/);
});
