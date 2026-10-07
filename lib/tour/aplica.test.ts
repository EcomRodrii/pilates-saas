import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pasoAplica, visitaObligatoria, type EstudioParaVisita } from './aplica.ts';
import { pasoPorId } from './capitulos.ts';

const nuevo: EstudioParaVisita = { tourObligatorio: true, tourCompletadoEn: null, cadenaId: null, bienvenidaVistaEn: '2026-10-07T10:00:00Z' };

test('se impone a la propietaria de un estudio nuevo', () => {
  assert.equal(visitaObligatoria(nuevo, 'PROPIETARIO'), true);
});

test('no se impone a nadie más', () => {
  for (const rol of ['MANAGER', 'RECEPCION', 'INSTRUCTOR', null, undefined]) {
    assert.equal(visitaObligatoria(nuevo, rol), false, String(rol));
  }
});

test('no se impone a un estudio existente, a una sede de cadena, ni a quien la terminó', () => {
  assert.equal(visitaObligatoria({ ...nuevo, tourObligatorio: false }, 'PROPIETARIO'), false);
  assert.equal(visitaObligatoria({ ...nuevo, tourObligatorio: undefined }, 'PROPIETARIO'), false);
  assert.equal(visitaObligatoria({ ...nuevo, cadenaId: 'cad-1' }, 'PROPIETARIO'), false);
  assert.equal(visitaObligatoria({ ...nuevo, tourCompletadoEn: '2026-10-08T10:00:00Z' }, 'PROPIETARIO'), false);
});

test('no empieza encima de la bienvenida: espera a que se haya visto', () => {
  assert.equal(visitaObligatoria({ ...nuevo, bienvenidaVistaEn: null }, 'PROPIETARIO'), false);
  assert.equal(visitaObligatoria(null, 'PROPIETARIO'), false);
});

const ctx = (c: Partial<Parameters<typeof pasoAplica>[1]> = {}) => ({
  puedeVer: () => true, esRutaCongelada: () => false, escritorio: true, ...c,
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

test('la ficha de una clienta se comprueba contra /clientas, no contra el comodín', () => {
  const vistas: string[] = [];
  pasoAplica(pasoPorId('c5.4')!, ctx({ puedeVer: r => { vistas.push(r); return true; } }));
  assert.deepEqual(vistas, ['/clientas']);
});
