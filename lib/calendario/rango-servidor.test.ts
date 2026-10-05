import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { supabaseFalso } from '../db/supabase-falso.ts';
import { sesionesYReservasDelRango } from './rango-servidor.ts';

const ST = 'st-1';

test('sesionesYReservasDelRango: reservas y sustituciones acotadas al estudio también, paginadas y sin el motivo de la baja', async () => {
  const sesiones = Array.from({ length: 150 }, (_, i) => ({
    id: `se-${String(i).padStart(3, '0')}`, studio_id: ST, tipo_clase_id: 'tc-1', sala_id: 'sa-1', instructor_id: 'in-1',
    inicio: `2026-10-0${1 + (i % 7)}T0${i % 10}:00:00Z`, fin: '2026-10-08T00:00:00Z', aforo_maximo: 10, cancelada: false, incidencia_texto: null,
  }));
  const reservas = sesiones.flatMap((s, i) => Array.from({ length: 10 }, (_, j) => ({
    id: `r-${i}-${j}`, studio_id: ST, sesion_id: s.id, socio_id: `so-${j}`, estado: 'CONFIRMADA', check_in_en: null,
    confirmacion_pedida_en: null, confirmado_en: null, oferta_expira_en: null, posicion_espera: null,
  })));
  // Un id de sesión que también existe en OTRO estudio: con service-role, sin el
  // filtro por estudio en `reservas`, se colaría.
  reservas.push({ ...reservas[0], id: 'r-ajena', studio_id: 'st-2' });
  const sustituciones = [{ id: 'su-1', studio_id: ST, sesion_id: 'se-000', estado: 'buscando', motivo: 'algo privado', creado_en: '2026-10-01T00:00:00Z' }];
  const { admin, consultas } = supabaseFalso({
    sesiones, reservas, sustituciones, tipos_clase: [{ id: 'tc-1', studio_id: ST, nombre: 'Reformer' }], salas: [{ id: 'sa-1', studio_id: ST, nombre: 'Sala 1' }],
  });
  const r = await sesionesYReservasDelRango(admin, ST, '2026-10-01T00:00:00Z', '2026-10-09T00:00:00Z');
  assert.ok(r);
  assert.equal(r.sesiones.length, 150);
  assert.equal(r.reservas.length, 1500, 'pasa de mil y no se corta, y la ajena no entra');
  assert.ok(!r.reservas.some(x => x.id === 'r-ajena'));
  assert.deepEqual(r.sustituciones, [{ id: 'su-1', sesion_id: 'se-000', estado: 'buscando', motivo: null }]);
  assert.equal(r.tiposClase.get('tc-1'), 'Reformer');
  for (const c of consultas) assert.ok(c.eqs.includes(`studio_id=${ST}`), `${c.tabla} sin acotar al estudio`);
});

test('rango-servidor no lee el motivo de una sustitución (puede ser salud)', () => {
  const src = readFileSync(new URL('./rango-servidor.ts', import.meta.url), 'utf8');
  const lectura = src.slice(src.indexOf(".from('sustituciones')"), src.indexOf(".from('sustituciones')") + 200);
  assert.doesNotMatch(lectura, /motivo/);
});
