import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ordenarResultadosNetwork } from './ranking.ts';
import type { PerfilNetworkPublico, FiltroBusquedaNetwork } from './tipos.ts';

const FILTRO_VACIO: FiltroBusquedaNetwork = {
  ciudad: null, especialidades: [], disponibilidad: [], horarios: [], tipoTrabajo: [], experienciaMinima: null, tarifaRango: [], soloIdentidadVerificada: false, soloExperienciaVerificada: false, soloCertificacionVerificada: false, valoracionMinima: null, idioma: null,
};

function perfil(overrides: Partial<PerfilNetworkPublico> & { id: string }): PerfilNetworkPublico {
  return {
    slug: null,
    destacado: false,
    resumenResenas: { promedio: null, total: 0 },
    nombre: 'Test', fotoUrl: null, ciudad: null, zona: null, radioKm: null, descripcion: null,
    especialidades: [], aniosExperiencia: null, tarifaRango: null, experienciaVerificada: false, certificacionVerificada: false, referenciaProfesional: false,
    disponibilidadEstado: 'no_disponible', disponibilidadHorarios: [], tipoTrabajo: [],
    estado: 'published', identidadVerificadaEn: null,
    creadoEn: '2026-01-01T00:00:00Z', actualizadoEn: '2026-01-01T00:00:00Z', ultimoAccesoEn: null,
    idiomas: [], instagram: null, linkedin: null, web: null,
    ...overrides,
  };
}

test('destacado gana a todo lo demás, incluida la disponibilidad', () => {
  const sinDestacar = perfil({ id: 'a', disponibilidadEstado: 'disponible', destacado: false });
  const destacada = perfil({ id: 'b', disponibilidadEstado: 'no_disponible', destacado: true });
  const [primero] = ordenarResultadosNetwork([sinDestacar, destacada], FILTRO_VACIO);
  assert.equal(primero.id, 'b');
});

test('disponible sale antes que no_disponible con todo lo demás igual', () => {
  const a = perfil({ id: 'a', disponibilidadEstado: 'no_disponible' });
  const b = perfil({ id: 'b', disponibilidadEstado: 'disponible' });
  const [primero] = ordenarResultadosNetwork([a, b], FILTRO_VACIO);
  assert.equal(primero.id, 'b');
});

test('coincidencia de especialidad desempata a igualdad de disponibilidad', () => {
  const sinCoincidencia = perfil({ id: 'sin', disponibilidadEstado: 'disponible', especialidades: ['yoga'] });
  const conCoincidencia = perfil({ id: 'con', disponibilidadEstado: 'disponible', especialidades: ['reformer'] });
  const filtro: FiltroBusquedaNetwork = { ...FILTRO_VACIO, especialidades: ['reformer'] };
  const [primero] = ordenarResultadosNetwork([sinCoincidencia, conCoincidencia], filtro);
  assert.equal(primero.id, 'con');
});

test('misma ciudad que el filtro gana a otra ciudad, con el resto igual', () => {
  const otraCiudad = perfil({ id: 'otra', ciudad: 'Madrid' });
  const mismaCiudad = perfil({ id: 'misma', ciudad: 'Barcelona' });
  const filtro: FiltroBusquedaNetwork = { ...FILTRO_VACIO, ciudad: 'barcelona' }; // case-insensitive
  const [primero] = ordenarResultadosNetwork([otraCiudad, mismaCiudad], filtro);
  assert.equal(primero.id, 'misma');
});

test('sin ciudad en el perfil no se descarta: empata con "sin filtro", no con "ciudad distinta"', () => {
  const sinCiudad = perfil({ id: 'sin-ciudad', ciudad: null });
  const otraCiudad = perfil({ id: 'otra-ciudad', ciudad: 'Madrid' });
  const filtro: FiltroBusquedaNetwork = { ...FILTRO_VACIO, ciudad: 'Barcelona' };
  const [primero] = ordenarResultadosNetwork([otraCiudad, sinCiudad], filtro);
  assert.equal(primero.id, 'sin-ciudad');
});

test('más años de experiencia gana a igualdad de disponibilidad/especialidad/ciudad', () => {
  const menos = perfil({ id: 'menos', aniosExperiencia: 2 });
  const mas = perfil({ id: 'mas', aniosExperiencia: 8 });
  const [primero] = ordenarResultadosNetwork([menos, mas], FILTRO_VACIO);
  assert.equal(primero.id, 'mas');
});

test('actividad más reciente desempata en último lugar', () => {
  const antigua = perfil({ id: 'antigua', ultimoAccesoEn: '2026-01-01T00:00:00Z' });
  const reciente = perfil({ id: 'reciente', ultimoAccesoEn: '2026-08-01T00:00:00Z' });
  const [primero] = ordenarResultadosNetwork([antigua, reciente], FILTRO_VACIO);
  assert.equal(primero.id, 'reciente');
});

test('sin ningún filtro ni diferencia, el orden es estable', () => {
  const a = perfil({ id: 'a' });
  const b = perfil({ id: 'b' });
  const resultado = ordenarResultadosNetwork([a, b], FILTRO_VACIO);
  assert.deepEqual(resultado.map(p => p.id), ['a', 'b']);
});
