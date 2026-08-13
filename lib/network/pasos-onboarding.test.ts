import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PASOS_ONBOARDING, pasoIncompletoDe } from './pasos-onboarding.ts';
import type { PerfilNetwork } from './tipos.ts';

function perfil(overrides: Partial<PerfilNetwork> = {}): PerfilNetwork {
  return {
    id: 'red-1', authUserId: 'auth-1', slug: null, nombre: 'Test', fotoUrl: null,
    ciudad: null, zona: null, radioKm: null, descripcion: null, especialidades: [],
    aniosExperiencia: null, tarifaRango: null, disponibilidadEstado: 'no_disponible',
    disponibilidadHorarios: [], tipoTrabajo: [], emailContacto: null, telefonoContacto: null,
    estado: 'draft', destacado: false, identidadVerificadaEn: null,
    creadoEn: '2026-01-01T00:00:00Z', actualizadoEn: '2026-01-01T00:00:00Z', ultimoAccesoEn: null,
    idiomas: [], instagram: null, linkedin: null, web: null,
    ...overrides,
  };
}

test('sin perfil, aterriza en el primer paso (reanudar redirige a crear-perfil de todas formas)', () => {
  assert.equal(pasoIncompletoDe(null), 0);
});

test('perfil publicado, aterriza en el último paso (revisar/publicar)', () => {
  assert.equal(pasoIncompletoDe(perfil({ estado: 'published' })), PASOS_ONBOARDING.length - 1);
});

test('sin ciudad todavía, aterriza en el paso "Dónde estás"', () => {
  const idx = pasoIncompletoDe(perfil({ ciudad: null }));
  assert.equal(PASOS_ONBOARDING[idx].titulo, 'Dónde estás');
});

test('con ciudad pero sin especialidades, aterriza en el paso "Especialidades"', () => {
  const idx = pasoIncompletoDe(perfil({ ciudad: 'Barcelona', especialidades: [] }));
  assert.equal(PASOS_ONBOARDING[idx].titulo, 'Especialidades');
});

test('con ciudad y especialidades, aterriza cerca del final (revisar)', () => {
  const idx = pasoIncompletoDe(perfil({ ciudad: 'Barcelona', especialidades: ['reformer'], estado: 'draft' }));
  assert.equal(idx, PASOS_ONBOARDING.length - 3);
});
