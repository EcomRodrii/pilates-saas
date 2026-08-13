import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calcularCompletitudPerfil } from './completitud.ts';

const VACIO = {
  nombre: '', ciudad: null, fotoUrl: null,
  especialidades: [], disponibilidadHorarios: [], tarifaRango: null, tipoTrabajo: [],
} as const;

test('perfil vacío da 0%', () => {
  const { porcentaje, detalle } = calcularCompletitudPerfil(VACIO, false);
  assert.equal(porcentaje, 0);
  assert.equal(detalle.datosBasicos, false);
});

test('perfil completo (con experiencia) da 100%', () => {
  const { porcentaje, detalle } = calcularCompletitudPerfil({
    nombre: 'Laura García', ciudad: 'Barcelona', fotoUrl: 'https://x/foto.webp',
    especialidades: ['reformer', 'mat'],
    disponibilidadHorarios: ['mananas'],
    tarifaRango: '25-30',
    tipoTrabajo: ['freelance'],
  }, true);
  assert.equal(porcentaje, 100);
  assert.deepEqual(detalle, {
    datosBasicos: true, foto: true, especialidades: true,
    experiencia: true, disponibilidad: true, tarifa: true, preferencias: true,
  });
});

test('nombre sin ciudad no cuenta como datos básicos completos', () => {
  const { detalle } = calcularCompletitudPerfil({ ...VACIO, nombre: 'Laura' }, false);
  assert.equal(detalle.datosBasicos, false);
});

test('sin experiencia (Fase 6 aún no existe) se queda en 80% aunque el resto esté completo', () => {
  const { porcentaje } = calcularCompletitudPerfil({
    nombre: 'Laura García', ciudad: 'Barcelona', fotoUrl: 'https://x/foto.webp',
    especialidades: ['reformer'],
    disponibilidadHorarios: ['mananas'],
    tarifaRango: '25-30',
    tipoTrabajo: ['freelance'],
  }, false);
  assert.equal(porcentaje, 80);
});

test('espacios en blanco no cuentan como nombre/ciudad rellenos', () => {
  const { detalle } = calcularCompletitudPerfil({ ...VACIO, nombre: '   ', ciudad: '   ' }, false);
  assert.equal(detalle.datosBasicos, false);
});
