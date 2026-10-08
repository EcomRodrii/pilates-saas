import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pasoAplica, visitaObligatoria, type EstudioParaVisita } from './aplica.ts';
import { pasoPorId } from './capitulos.ts';

const nuevo: EstudioParaVisita = { tourObligatorio: true, tourCompletadoEn: null, bienvenidaVistaEn: '2026-10-07T10:00:00Z' };

test('se impone a la propietaria de un estudio nuevo', () => {
  assert.equal(visitaObligatoria(nuevo, 'PROPIETARIO'), true);
});

test('no se impone a nadie más', () => {
  for (const rol of ['MANAGER', 'RECEPCION', 'INSTRUCTOR', null, undefined]) {
    assert.equal(visitaObligatoria(nuevo, rol), false, String(rol));
  }
});

test('no se impone a un estudio existente ni a quien la terminó', () => {
  assert.equal(visitaObligatoria({ ...nuevo, tourObligatorio: false }, 'PROPIETARIO'), false);
  assert.equal(visitaObligatoria({ ...nuevo, tourObligatorio: undefined }, 'PROPIETARIO'), false);
  assert.equal(visitaObligatoria({ ...nuevo, tourCompletadoEn: '2026-10-08T10:00:00Z' }, 'PROPIETARIO'), false);
});

test('se puede activar a mano en un estudio de una cadena: la exclusión de las sedes la hace el trigger al nacer', () => {
  assert.equal(visitaObligatoria({ ...nuevo, cadenaId: 'cad-1' } as EstudioParaVisita, 'PROPIETARIO'), true);
});

test('no empieza encima de la bienvenida: espera a que se haya visto', () => {
  assert.equal(visitaObligatoria({ ...nuevo, bienvenidaVistaEn: null }, 'PROPIETARIO'), false);
  assert.equal(visitaObligatoria(null, 'PROPIETARIO'), false);
});

const ctx = (c: Partial<Parameters<typeof pasoAplica>[1]> = {}) => ({
  puedeVer: () => true, esRutaCongelada: () => false, fueraDelMenu: () => false, escritorio: true, ...c,
});

test('un paso se salta si la persona no ve esa pantalla, si está congelada, o si es solo de escritorio', () => {
  const calendario = pasoPorId('c3.1')!;
  assert.equal(pasoAplica(calendario, ctx()), true);
  assert.equal(pasoAplica(calendario, ctx({ puedeVer: () => false })), false);
  assert.equal(pasoAplica(calendario, ctx({ esRutaCongelada: () => true })), false);
  const buscador = pasoPorId('c1.3')!;
  assert.equal(pasoAplica(buscador, ctx({ escritorio: false })), false);
  assert.equal(pasoAplica(buscador, ctx({ escritorio: true })), true);
});

test('lo que no existe en el menú no se enseña: Marketing apagado se salta', () => {
  const marketing = pasoPorId('c8.4')!;
  assert.equal(pasoAplica(marketing, ctx()), true);
  assert.equal(pasoAplica(marketing, ctx({ fueraDelMenu: r => r === '/marketing' })), false);
  // y lo demás del mismo capítulo sigue en pie
  assert.equal(pasoAplica(pasoPorId('c8.1')!, ctx({ fueraDelMenu: r => r === '/marketing' })), true);
});

test('la ficha de una clienta se comprueba contra /clientas, no contra el comodín', () => {
  const vistas: string[] = [];
  pasoAplica(pasoPorId('c5.4')!, ctx({ puedeVer: r => { vistas.push(r); return true; } }));
  assert.deepEqual(vistas, ['/clientas']);
});
