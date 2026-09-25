import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// AUT-C / AUT-4 / AUT-6. Guardianes de estructura: los motores de envío viven
// detrás de Inngest y de Resend, así que lo que se ata aquí es que el cableado
// no desaparezca.

const AUTO = readFileSync(new URL('./automatizaciones.ts', import.meta.url), 'utf8');
const CAMPANAS = readFileSync(new URL('./campanas.ts', import.meta.url), 'utf8');

test('AUT-C: ningún log se escribe con un await a pelo, que traga el fallo', () => {
  assert.equal(
    AUTO.split('await dbUpsertAutomationLog(').length - 1, 1,
    'solo `guardarLogOFallar` puede llamar a dbUpsertAutomationLog: si el log no se guarda, el motor tiene que lanzar',
  );
  assert.equal(AUTO.split('await guardarLogOFallar(log)').length - 1, 2, 'los dos motores (clásico y marketing) lo usan');
  assert.match(AUTO, /if \(!r\.ok\) throw new Error/);
});

test('AUT-4: los dos motores de automatización cortan el correo comercial a un buzón roto ANTES de redactarlo', () => {
  const clasico = AUTO.indexOf('c.comercial && opts.emailsRotos?.has(');
  const mkt = AUTO.indexOf('opts.emailsRotos?.has(normalizarEmail(c.socio.email))', clasico + 10);
  assert.ok(clasico > 0 && mkt > clasico, 'falta el corte en uno de los dos motores');
  assert.ok(AUTO.indexOf('correoAutomatizacion({', clasico) > clasico, 'el corte va antes de construir el correo (clásico)');
  assert.ok(AUTO.indexOf('correoAutomatizacion({', mkt) > mkt, 'el corte va antes de construir el correo (marketing)');
});

test('AUT-4: el aviso de servicio NO se corta por un rebote', () => {
  assert.match(AUTO, /c\.comercial && opts\.emailsRotos/, 'el motor clásico solo corta lo comercial');
});

test('AUT-4: las campañas por email excluyen los buzones rotos como a las sin consentimiento', () => {
  assert.ok(CAMPANAS.includes("step.run('fetch-rebotes'"));
  assert.match(CAMPANAS, /filtrarPorConsentimientoMarketing\(sinRotos,/);
});

test('AUT-6: el id de Resend se guarda en el log de los dos motores', () => {
  assert.equal(AUTO.split('proveedorId: r.id ?? null').length - 1, 2);
});

test('AU-12: el contador «Ejecutada N veces» solo cuenta lo EJECUTADO, no los candidatos ni los fallidos', () => {
  const clasico = AUTO.indexOf('firedPorRegla.set(');
  const mkt = AUTO.indexOf('firedPorAuto.set(');
  assert.ok(clasico > 0 && mkt > 0);
  assert.match(AUTO.slice(clasico - 90, clasico), /if \(log\.resultado === 'EJECUTADO'\)/);
  assert.match(AUTO.slice(mkt - 90, mkt), /if \(log\.resultado === 'EJECUTADO'\)/);
});
