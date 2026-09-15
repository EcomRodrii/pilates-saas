import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hayPenalizacionConfigurada } from './penalizacion-activa.ts';

const tipo = (penalizacionImporteEur: number | null) => ({ penalizacionImporteEur });

test('sin importe en ningún sitio no hay penalización', () => {
  assert.equal(hayPenalizacionConfigurada({ penalizacionImporteEur: null }, []), false);
  assert.equal(hayPenalizacionConfigurada({ penalizacionImporteEur: 0 }, [tipo(null), tipo(0)]), false);
  assert.equal(hayPenalizacionConfigurada(null, []), false);
});

test('la del estudio cuenta, también sin tipos de clase todavía', () => {
  assert.equal(hayPenalizacionConfigurada({ penalizacionImporteEur: 5 }, []), true);
  assert.equal(hayPenalizacionConfigurada({ penalizacionImporteEur: 5 }, [tipo(null)]), true);
});

test('un tipo de clase con importe propio basta, aunque el estudio no tenga', () => {
  assert.equal(hayPenalizacionConfigurada({ penalizacionImporteEur: null }, [tipo(null), tipo(8)]), true);
});

test('un override a 0 apaga la del estudio para ese tipo (coalesce, como la SQL)', () => {
  assert.equal(hayPenalizacionConfigurada({ penalizacionImporteEur: 5 }, [tipo(0), tipo(0)]), false);
  assert.equal(hayPenalizacionConfigurada({ penalizacionImporteEur: 5 }, [tipo(0), tipo(null)]), true);
});
