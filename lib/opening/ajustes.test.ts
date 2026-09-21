import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ajustesDesdeConfig, validarAjustes, type AjustesApertura } from './ajustes.ts';

const defecto: AjustesApertura = {
  objetivoPreventaPct: 40, conversionLeadsPct: 20, umbralAmarilloPct: 70, umbralRojoPct: 85,
  ventanaSemanas: 6, sesionesSemanaSinTope: 2, semanasBonoSinCaducidad: 8,
};

test('los valores por defecto de hoy se leen y se guardan sin cambiar nada', () => {
  const desdeConfig = ajustesDesdeConfig({
    umbralAmarillo: 0.7, umbralRojo: 0.85, conversionLeads: 0.2, ventanaAnalisisDias: 42,
    sesionesSemanaSinTope: 2, semanasBonoSinCaducidad: 8, objetivoPreventa: 0.4,
  });
  assert.deepEqual(desdeConfig, defecto);
  assert.deepEqual(validarAjustes(defecto), { ok: true, fila: {
    objetivo_preventa: 0.4, conversion_leads: 0.2, umbral_amarillo: 0.7, umbral_rojo: 0.85,
    ventana_analisis_dias: 42, sesiones_semana_sin_tope: 2, semanas_bono_sin_caducidad: 8,
  } });
});

test('acepta lo que llega de un formulario como texto', () => {
  const r = validarAjustes({ ...defecto, objetivoPreventaPct: '50', sesionesSemanaSinTope: '2.5' });
  assert.ok(r.ok && r.fila.objetivo_preventa === 0.5 && r.fila.sesiones_semana_sin_tope === 2.5);
});

test('rechaza con un motivo legible lo que la BD no aceptaría', () => {
  const error = (p: Partial<Record<keyof AjustesApertura, unknown>>) => {
    const r = validarAjustes({ ...defecto, ...p });
    return r.ok ? null : r.error;
  };
  assert.match(error({ umbralAmarilloPct: 90, umbralRojoPct: 85 })!, /tiene que ser menor/);
  assert.match(error({ objetivoPreventaPct: 0 })!, /objetivo de preventa/);
  assert.match(error({ ventanaSemanas: 20 })!, /1 a 17 semanas/);
  assert.match(error({ sesionesSemanaSinTope: 0.2 })!, /0,5 a 7/);
  assert.match(error({ sesionesSemanaSinTope: 2.25 })!, /un decimal/);
  assert.match(error({ semanasBonoSinCaducidad: 2.5 })!, /bono/);
  assert.match(error({ conversionLeadsPct: '' })!, /interesadas/);
});
