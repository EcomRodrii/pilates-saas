import test from 'node:test';
import assert from 'node:assert/strict';

import { encajeBusquedaDe } from './encaje-busqueda.ts';
import type { FiltroBusquedaNetwork } from './tipos.ts';
import type { PerfilNetworkPublico } from './tipos.ts';

const FILTRO_VACIO: FiltroBusquedaNetwork = {
  ciudad: null, especialidades: [], disponibilidad: [], horarios: [], tipoTrabajo: [],
  experienciaMinima: null, tarifaRango: [], soloIdentidadVerificada: false, soloExperienciaVerificada: false,
  soloCertificacionVerificada: false, valoracionMinima: null,
};

function perfil(overrides: Partial<PerfilNetworkPublico> = {}): PerfilNetworkPublico {
  return {
    id: 'p1', slug: null, nombre: 'Test', fotoUrl: null, ciudad: null, zona: null, radioKm: null,
    descripcion: null, especialidades: [], aniosExperiencia: null, tarifaRango: null,
    disponibilidadEstado: 'disponible', disponibilidadHorarios: [], tipoTrabajo: [],
    estado: 'published', destacado: false, identidadVerificadaEn: null,
    creadoEn: '2026-01-01T00:00:00Z', actualizadoEn: '2026-01-01T00:00:00Z', ultimoAccesoEn: null,
    idiomas: [], instagram: null, linkedin: null, web: null,
    experienciaVerificada: false, certificacionVerificada: false, resumenResenas: { promedio: null, total: 0 },
    ...overrides,
  };
}

test('sin filtro activo: sin criterios, barra 0', () => {
  const e = encajeBusquedaDe(FILTRO_VACIO, perfil());
  assert.deepEqual(e, { barra: 0, criterios: [] });
});

test('una sola especialidad pedida: no cuenta como criterio (cobertura trivial 1/1)', () => {
  const filtro: FiltroBusquedaNetwork = { ...FILTRO_VACIO, especialidades: ['reformer'] };
  const e = encajeBusquedaDe(filtro, perfil({ especialidades: ['reformer'] }));
  assert.deepEqual(e, { barra: 0, criterios: [] });
});

test('2+ especialidades pedidas: mide cobertura parcial real', () => {
  const filtro: FiltroBusquedaNetwork = { ...FILTRO_VACIO, especialidades: ['reformer', 'mat', 'yoga'] };
  const cubreUna = perfil({ especialidades: ['reformer'] });
  const cubreDos = perfil({ especialidades: ['reformer', 'mat'] });
  const cubreTodas = perfil({ especialidades: ['reformer', 'mat', 'yoga'] });
  assert.equal(encajeBusquedaDe(filtro, cubreUna).barra, 33);
  assert.equal(encajeBusquedaDe(filtro, cubreDos).barra, 67);
  assert.equal(encajeBusquedaDe(filtro, cubreTodas).barra, 100);
});

test('ciudad/tarifa/verificaciones NUNCA entran en el cálculo, aunque estén activos', () => {
  const filtro: FiltroBusquedaNetwork = {
    ...FILTRO_VACIO, ciudad: 'Madrid', tarifaRango: ['25-30'], soloIdentidadVerificada: true, valoracionMinima: 4,
  };
  const e = encajeBusquedaDe(filtro, perfil());
  assert.deepEqual(e, { barra: 0, criterios: [] });
});

test('varios campos con 2+ opciones: la barra es la media de las coberturas, no solo una', () => {
  const filtro: FiltroBusquedaNetwork = {
    ...FILTRO_VACIO, especialidades: ['reformer', 'mat'], horarios: ['mananas', 'tardes'],
  };
  // Especialidad: 1/2 = 50%. Horario: 2/2 = 100%. Media = 75%.
  const p = perfil({ especialidades: ['reformer'], disponibilidadHorarios: ['mananas', 'tardes'] });
  const e = encajeBusquedaDe(filtro, p);
  assert.equal(e.criterios.length, 2);
  assert.equal(e.barra, 75);
});

test('sin ninguna coincidencia: barra 0 pero SÍ hay criterios (no es "sin datos")', () => {
  const filtro: FiltroBusquedaNetwork = { ...FILTRO_VACIO, especialidades: ['reformer', 'mat'] };
  const e = encajeBusquedaDe(filtro, perfil({ especialidades: ['yoga'] }));
  assert.equal(e.criterios.length, 1);
  assert.equal(e.barra, 0);
});
