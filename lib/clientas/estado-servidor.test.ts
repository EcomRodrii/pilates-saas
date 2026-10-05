import { test } from 'node:test';
import assert from 'node:assert/strict';
import { supabaseFalso } from '../db/supabase-falso.ts';
import { cargarClientasServidor, cargarEstadosClientas } from './estado-servidor.ts';
import { contarPorEstado, contarSinVenir, estadosDeClientas, hechosDeAsistencia } from './estado.ts';
import type { PlanTarifa, Reserva, Sesion, Socio, Suscripcion } from '../types.ts';

const AHORA = new Date('2026-10-05T10:00:00Z');
const ST = 'st-1';

// 1.300 socias (más de una página de PostgREST) con historias variadas, y una
// socia de OTRO estudio que no puede contar.
function fixture() {
  const socios = Array.from({ length: 1300 }, (_, i) => ({
    id: `s-${String(i).padStart(4, '0')}`, studio_id: ST, activo: i % 17 !== 0,
    fecha_alta: i % 5 === 0 ? '2026-09-20' : '2025-01-10', lead_stage: null, borrado_en: null,
  }));
  socios.push({ id: 's-otra', studio_id: 'st-2', activo: true, fecha_alta: '2026-10-01', lead_stage: null, borrado_en: null });
  const planes = [{ id: 'p-bono', studio_id: ST, tipo: 'BONO', es_prueba: false }];
  const suscripciones = socios.filter((_, i) => i % 3 === 0).map((s, i) => ({
    id: `su-${i}`, studio_id: s.studio_id, socio_id: s.id, plan_id: 'p-bono', estado: 'ACTIVA',
    fecha_inicio: '2026-09-01', fecha_fin: i % 2 ? '2026-12-01' : '2026-09-15', sesiones_restantes: i % 4,
  }));
  const sesiones = [
    { id: 'se-viejo', studio_id: ST, inicio: '2026-07-01T09:00:00Z' },
    { id: 'se-reciente', studio_id: ST, inicio: '2026-09-28T09:00:00Z' },
  ];
  const reservas = socios.filter((_, i) => i % 2 === 0).map((s, i) => ({
    id: `r-${i}`, studio_id: s.studio_id, socio_id: s.id, sesion_id: i % 4 ? 'se-viejo' : 'se-reciente', estado: 'ASISTIDA',
  }));
  return { socios, planes, suscripciones, sesiones, reservas };
}

test('cargarClientasServidor: «sin venir» y activas dan lo mismo que el Resumen con las mismas filas, y solo del estudio', async () => {
  const f = fixture();
  const { admin, consultas } = supabaseFalso({
    socios: f.socios, planes_tarifa: f.planes, suscripciones: f.suscripciones, sesiones: f.sesiones, reservas: f.reservas,
  });
  const leido = await cargarClientasServidor(admin, ST, { ahora: AHORA });
  assert.ok(leido);

  // Lo que hace el Resumen en el navegador (useEstadosClientas + contarSinVenir).
  const delEstudio = <T extends { studio_id: string }>(xs: T[]) => xs.filter(x => x.studio_id === ST);
  const datos = {
    socios: delEstudio(f.socios).map(s => ({ id: s.id, activo: s.activo, fechaAlta: s.fecha_alta, leadStage: undefined }) as Pick<Socio, 'id' | 'activo' | 'fechaAlta' | 'leadStage'>),
    suscripciones: delEstudio(f.suscripciones).map(s => ({ id: s.id, socioId: s.socio_id, planId: s.plan_id, estado: s.estado, fechaInicio: s.fecha_inicio, fechaFin: s.fecha_fin, sesionesRestantes: s.sesiones_restantes }) as unknown as Suscripcion),
    planesTarifa: f.planes.map(p => ({ id: p.id, tipo: p.tipo, esPrueba: false }) as unknown as PlanTarifa),
    reservas: delEstudio(f.reservas).map(r => ({ socioId: r.socio_id, sesionId: r.sesion_id, estado: r.estado }) as Pick<Reserva, 'socioId' | 'sesionId' | 'estado'>),
    sesiones: f.sesiones as unknown as Pick<Sesion, 'id' | 'inicio'>[],
  };
  const hechos = hechosDeAsistencia(datos.reservas, datos.sesiones, AHORA);
  const estados = estadosDeClientas(datos, AHORA, hechos);
  const esperadoSinVenir = contarSinVenir(datos.socios.map(s => ({ id: s.id, fechaAlta: s.fechaAlta })), estados, hechos, AHORA);

  assert.equal(leido.fichas.length, 1300, 'las 1.300 del estudio, sin la de otro');
  assert.equal(contarSinVenir(leido.fichas, leido.estados, leido.hechos, AHORA), esperadoSinVenir);
  assert.deepEqual(contarPorEstado(leido.estados), contarPorEstado(estados));
  assert.ok(esperadoSinVenir > 0 && esperadoSinVenir < 1300, 'el fixture tiene de las dos');
  for (const c of consultas) assert.ok(c.eqs.includes(`studio_id=${ST}`), `${c.tabla} sin acotar al estudio`);
});

test('cargarEstadosClientas sigue devolviendo lo mismo que antes (envuelve a la nueva)', async () => {
  const f = fixture();
  const tablas = { socios: f.socios, planes_tarifa: f.planes, suscripciones: f.suscripciones, sesiones: f.sesiones, reservas: f.reservas };
  const todas = await cargarEstadosClientas(supabaseFalso(tablas).admin, ST, { ahora: AHORA });
  const nueva = await cargarClientasServidor(supabaseFalso(tablas).admin, ST, { ahora: AHORA });
  assert.deepEqual(todas, nueva?.estados);
  const unas = await cargarEstadosClientas(supabaseFalso(tablas).admin, ST, { ahora: AHORA, socioIds: ['s-0000', 's-0003'] });
  assert.deepEqual([...unas!.keys()].sort(), ['s-0000', 's-0003']);
  assert.deepEqual(unas!.get('s-0003'), nueva!.estados.get('s-0003'));
});

test('cargarClientasServidor: si falla una lectura, null (nunca «no hay nadie»)', async () => {
  const f = fixture();
  const { admin } = supabaseFalso({ socios: f.socios, reservas: f.reservas }, { fallan: ['reservas'] });
  assert.equal(await cargarClientasServidor(admin, ST, { ahora: AHORA }), null);
});
