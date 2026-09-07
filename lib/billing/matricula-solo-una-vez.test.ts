import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// ─────────────────────────────────────────────────────────────────────────────
// El guardián de la matrícula: una cuota de alta se cobra UNA VEZ.
//
// `planes_tarifa.matricula` (migr 20260907120000) es una columna APARTE y no
// una suma al precio, y eso no es una preferencia de presentación: el cron de
// renovaciones emite el recibo del ciclo siguiente con `plan.precio` tal cual
// (`lib/inngest/renovaciones.ts`, «Renovación {nombre}»). El día que alguien
// «simplifique» sumando la matrícula al precio del plan —o la añada al importe
// de la renovación— cada socia con cuota pagaría su alta otra vez cada mes,
// cada trimestre o cada año, y nadie lo notaría hasta que una clienta llamara.
//
// No se puede importar `renovaciones.ts` aquí (arrastra Inngest y el cliente
// admin), así que se comprueba sobre el código fuente — mismo patrón que
// `lib/planes/persistencia.test.ts` y `socia-publica-campos-editables.test.ts`.
// ─────────────────────────────────────────────────────────────────────────────

function fuente(ruta: string): string {
  return readFileSync(new URL(ruta, import.meta.url), 'utf8');
}

test('⚠️ el cron de renovación no sabe NADA de la matrícula', () => {
  const cron = fuente('../inngest/renovaciones.ts');
  assert.ok(
    !/matricula/i.test(cron),
    'el cron de renovaciones menciona la matrícula: si entra en el importe del ' +
      'recibo, se cobra la cuota de alta en CADA ciclo',
  );
});

test('⚠️ la renovación de servidor tampoco la toca', () => {
  const renov = fuente('./renovacion-server.ts');
  assert.ok(
    !/matricula/i.test(renov),
    'renovacion-server.ts menciona la matrícula: esta mitad decide QUÉ SE ENTREGA ' +
      'en cada ciclo y la matrícula no es de ningún ciclo',
  );
});

test('el recibo de renovación se emite con el precio del plan, y nada más', () => {
  const cron = fuente('../inngest/renovaciones.ts');
  assert.match(
    cron,
    /importe:\s*plan\.precio\b/,
    'el importe de la renovación ha dejado de ser `plan.precio` a secas: ' +
      'revisa que no se le esté sumando ningún extra de una sola vez',
  );
});

test('los dos caminos de mostrador cobran la matrícula en un recibo APARTE', () => {
  // Aparte y sin `suscripcionId`: si colgara del ciclo, cancelar la suscripción
  // arrastraría un alta ya cobrada, que es una venta cerrada.
  const ctx = fuente('../studio-context.tsx');
  const recibos = [...ctx.matchAll(/concepto: `Matrícula — \$\{plan\.nombre\}`/g)];
  assert.equal(
    recibos.length, 2,
    'debería haber exactamente dos recibos de matrícula (alta de socia y asignar plan): ' +
      `encontrados ${recibos.length}`,
  );
  // El importe del recibo del PLAN nunca puede llevarla dentro.
  assert.ok(
    !/importe:\s*plan\.precio\s*\+/.test(ctx),
    'se está sumando algo al precio del plan al crear su recibo',
  );
});

test('⚠️ ante la duda de si ya la pagó, NO se cobra', () => {
  // `dbSocioTieneAlgunPlan` devuelve `null` cuando la consulta falla. Un `!==
  // false` es lo que hace que ese null cuente como «ya tenía plan»: quedarse
  // corto se arregla en el mostrador, cobrar dos veces es una devolución.
  const ctx = fuente('../studio-context.tsx');
  assert.ok(
    /await dbSocioTieneAlgunPlan\([^;]*?===\s*false/.test(ctx),
    'la comprobación de «primer plan» ya no trata el fallo de consulta como ' +
      '«ya tenía plan»: un error de red cobraría la matrícula otra vez',
  );
});
