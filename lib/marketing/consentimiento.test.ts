import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Socio } from '@/lib/types';
import { tieneConsentimientoMarketingVigente, tieneConsentimientoMarketingAlgunaVez, filtrarPorConsentimientoMarketing } from './consentimiento.ts';

test('tieneConsentimientoMarketingVigente: sin texto guardado → false', () => {
  assert.equal(tieneConsentimientoMarketingVigente(undefined, 'texto vigente'), false);
});

test('tieneConsentimientoMarketingVigente: texto guardado coincide con el vigente → true', () => {
  assert.equal(tieneConsentimientoMarketingVigente('el texto', 'el texto'), true);
});

test('tieneConsentimientoMarketingVigente: el texto vigente cambió → false (hay que volver a pedirlo)', () => {
  assert.equal(tieneConsentimientoMarketingVigente('texto antiguo', 'texto nuevo, con una cláusula añadida'), false);
});

test('tieneConsentimientoMarketingAlgunaVez: presencia aproximada para la UI', () => {
  const conConsentimiento: Socio = {
    id: '1', studioId: 'e1', nombre: 'A', apellidos: 'B', email: 'a@b.c', telefono: null, nif: null,
    fechaAlta: '2026-01-01', activo: true,
    consentimientoMarketing: { fecha: '2026-08-01', texto: '', registradoPor: 'SOCIA' },
  };
  const sinConsentimiento: Socio = { ...conConsentimiento, consentimientoMarketing: undefined };
  assert.equal(tieneConsentimientoMarketingAlgunaVez(conConsentimiento), true);
  assert.equal(tieneConsentimientoMarketingAlgunaVez(sinConsentimiento), false);
});

test('filtrarPorConsentimientoMarketing: solo pasan las que tienen el texto vigente exacto', () => {
  const destinatarias = [{ id: '1' }, { id: '2' }, { id: '3' }];
  const consentimientos = new Map([
    ['1', 'texto vigente'],
    ['2', 'texto viejo'], // cambió el texto vigente, ya no cuenta
    // '3' sin entrada: nunca dio consentimiento
  ]);
  const r = filtrarPorConsentimientoMarketing(destinatarias, consentimientos, 'texto vigente');
  assert.deepEqual(r.map(d => d.id), ['1']);
});
