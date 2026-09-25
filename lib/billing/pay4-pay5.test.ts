// Libro de intentos de cobro (PAY-4): `registrarIntentoCobro`.
//
// ⚠️ Reescrito entero en la auditoría del 2026-09-21. Lo que había aquí eran
// CUATRO tests tautológicos sobre literales locales —`assert.ok(true, 'PAY-4
// es idempotente por PK')`, `assert.strictEqual(['pi_111','pi_222'].length, 2)`,
// `assert.strictEqual('PROPIETARIO', 'PROPIETARIO')`— que no importaban ni
// ejecutaban una sola línea del código que decían probar. Cuatro tests en
// verde respaldando un commit titulado «detector de dobles + alertas + tests».
// Un test que miente es peor que no tenerlo: sostiene la creencia de que un
// camino de dinero está cubierto.
//
// Los de PAY-5/PAY-6 se han retirado en vez de reescribirse: verificado contra
// producción el 2026-09-21, ni la tabla `dobles_cobros_detectados` ni la
// función `detectar_dobles_cobros` existen ahí (la migración que las crea
// nunca se aplicó), y `emitirAlertaDobleCobroDetectado` no tiene ni un
// llamador. No hay comportamiento que proteger todavía.
//
// Lo que SÍ se prueba aquí es lo único de PAY-4 que corre de verdad, y el bug
// que esta misma auditoría encontró en ello.
import { test } from 'node:test';
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import type { SupabaseClient } from '@supabase/supabase-js';
import { registrarIntentoCobro } from './confirmar-cobro.ts';

type FilaInsertada = Record<string, unknown>;

/** Supabase de mentira, suficiente para este camino: una lectura de `recibos`
 *  y un insert en `cobros_intentos`. Devuelve lo que se intentó insertar. */
function adminFalso(opts: {
  importeRecibo: number | null;
  errorInsert?: { message: string; code: string } | null;
  /** D-4: lo que el libro ya tenía anotado para ese PaymentIntent. */
  desenlaceExistente?: string | null;
}): { admin: SupabaseClient; insertados: FilaInsertada[] } {
  const insertados: FilaInsertada[] = [];
  const admin = {
    from(tabla: string) {
      if (tabla === 'recibos') {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                maybeSingle: async () => ({
                  data: opts.importeRecibo === null ? null : { importe: opts.importeRecibo },
                  error: null,
                }),
              }),
            }),
          }),
        };
      }
      if (tabla === 'cobros_intentos') {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({
                data: opts.desenlaceExistente ? { desenlace: opts.desenlaceExistente } : null,
                error: null,
              }),
            }),
          }),
          // Auditoría 2026-09-22: era `insert`. Pasó a `upsert` porque el mismo
          // PaymentIntent puede anotarse dos veces (primero 'pendiente' si el
          // recibo no era cobrable en ese instante, luego 'cobrado' cuando sí lo
          // marca) y el 23505 tragado dejaba el libro diciendo 'pendiente' de un
          // cargo cobrado. El doble falso recoge las dos formas para que el test
          // falle si alguien vuelve a un insert plano sin pensarlo.
          upsert: async (fila: FilaInsertada, opciones?: { onConflict?: string; ignoreDuplicates?: boolean }) => {
            insertados.push({
              ...fila,
              __onConflict: opciones?.onConflict,
              // PAY-1: en Postgres esto es lo que decide entre DO NOTHING y
              // DO UPDATE, es decir, si una reentrega puede degradar el libro.
              __ignoreDuplicates: opciones?.ignoreDuplicates,
            });
            return { error: opts.errorInsert ?? null };
          },
          insert: async (fila: FilaInsertada) => {
            insertados.push(fila);
            return { error: opts.errorInsert ?? null };
          },
        };
      }
      throw new Error(`tabla inesperada: ${tabla}`);
    },
  } as unknown as SupabaseClient;
  return { admin, insertados };
}

const PARAMS = {
  paymentIntentId: 'pi_test_123',
  studioId: 'st-1',
  reciboId: 'rec-abc',
  origen: 'checkout' as const,
  desenlace: 'cobrado' as const,
};

// El bug real: `recibos.importe` son EUROS (numeric) y la columna del libro es
// `importe_centimos integer`. Insertar el importe a pelo hacía que 85,50 €
// se anotara como 86 — 100× menos y redondeado— en la única tabla con la que
// se contesta «me habéis cobrado dos veces».
test('PAY-4: el importe se anota en CÉNTIMOS, no en euros', async () => {
  const { admin, insertados } = adminFalso({ importeRecibo: 85.5 });
  await registrarIntentoCobro(admin, PARAMS);

  assert.strictEqual(insertados.length, 1, 'se anota una fila');
  assert.strictEqual(
    insertados[0].importe_centimos, 8550,
    'un recibo de 85,50 € se anota como 8550 céntimos (antes se anotaba 86)',
  );
  assert.ok(
    Number.isInteger(insertados[0].importe_centimos),
    'la columna es integer: nunca puede llegar un decimal',
  );
});

test('PAY-4: los céntimos con redondeo sucio no arrastran el float', async () => {
  // 0.1 + 0.2 y familia: 10.07 * 100 = 1006.9999999999999 en coma flotante.
  const { admin, insertados } = adminFalso({ importeRecibo: 10.07 });
  await registrarIntentoCobro(admin, PARAMS);
  assert.strictEqual(insertados[0].importe_centimos, 1007);
});

test('PAY-4: la fila anota el intento, el estudio y el desenlace', async () => {
  const { admin, insertados } = adminFalso({ importeRecibo: 20 });
  await registrarIntentoCobro(admin, { ...PARAMS, desenlace: 'fallido' });

  assert.strictEqual(insertados[0].payment_intent_id, 'pi_test_123');
  assert.strictEqual(insertados[0].studio_id, 'st-1');
  assert.strictEqual(insertados[0].recibo_id, 'rec-abc');
  assert.strictEqual(insertados[0].desenlace, 'fallido',
    'un intento FALLIDO también se anota: el libro no es solo de cobros buenos');
});

test('PAY-4: un choque de clave primaria (23505) no revienta — es la idempotencia', async () => {
  // El PaymentIntent es la PK del libro, así que un reintento del webhook con
  // el mismo intent choca A PROPÓSITO. Esta rama NO llama a Sentry, así que sí
  // se puede ejercitar de verdad.
  const { admin } = adminFalso({
    importeRecibo: 30,
    errorInsert: { message: 'duplicate key value', code: '23505' },
  });
  await assert.doesNotReject(() => registrarIntentoCobro(admin, PARAMS));
});

// Las dos ramas que quedan llaman a `Sentry.captureMessage`, que no es
// ejecutable en `node --test` en este repo (el SDK no se inicializa fuera del
// runtime de Next). Se verifican por código fuente, que es la convención ya
// establecida aquí — ver `procesar-reembolso.test.ts`, misma limitación.
test('PAY-4: sin recibo resoluble no se anota nada Y se avisa', () => {
  const fuente = readFileSync(new URL('./confirmar-cobro.ts', import.meta.url), 'utf8');
  const cuerpo = fuente.slice(fuente.indexOf('export async function registrarIntentoCobro'));
  assert.ok(
    /if \(!recibo\) \{[\s\S]*?Sentry\.captureMessage[\s\S]*?return;/.test(cuerpo),
    'un intento sin recibo resoluble avisa y sale sin insertar: un libro con filas inventadas es peor que uno con un hueco',
  );
});

test('PAY-4: un error de escritura que NO es 23505 se reporta y NO se traga', () => {
  // Aquí hubo un `.then(() => {}).catch(() => {})` que silenciaba cualquier
  // fallo de escritura mientras la tabla ni siquiera existía en producción.
  // Este test es el que impide que vuelva.
  const fuente = readFileSync(new URL('./confirmar-cobro.ts', import.meta.url), 'utf8');
  const cuerpo = fuente.slice(fuente.indexOf('export async function registrarIntentoCobro'));
  assert.ok(
    cuerpo.includes("if (error && error.code !== '23505')"),
    'el 23505 se tolera (idempotencia) y cualquier otro error NO',
  );
  assert.ok(cuerpo.includes('Sentry.captureMessage'), 'el resto de errores se reportan');
  // El `.catch(() => {})` que silenciaba esto sigue CITADO en el comentario de
  // arriba (por eso no se puede buscar a secas en todo el cuerpo): lo que se
  // comprueba es que el insert se espera con `await` y su `error` se mira.
  assert.ok(
    /const \{ error \} = await admin\.from\('cobros_intentos'\)\.upsert\(/.test(cuerpo),
    'la escritura se espera y su error se inspecciona, no se descarta',
  );
  // Auditoría 2026-09-22: y tiene que ser un UPSERT por PaymentIntent. Con un
  // insert plano, la segunda anotación del mismo cargo (pendiente → cobrado)
  // choca 23505, se tolera y el libro se queda con el desenlace viejo.
  assert.ok(
    cuerpo.includes("onConflict: 'payment_intent_id'"),
    'el upsert resuelve por payment_intent_id: el desenlace se corrige, no se descarta',
  );
  // ⚠️ Auditoría 2026-09-23 (PAY-1). El upsert simétrico que dejó el 22-sep
  // permitía la transición que SÍ se quería ('pendiente' → 'cobrado') y también
  // la inversa, que es la que de verdad ocurre: `confirmarCobroRecibo` excluye
  // COBRADO de su `.in('estado', …)`, así que CADA reentrega del mismo evento
  // cae en la rama `!marcado` y anotaba 'pendiente' encima del 'cobrado'. El
  // libro acababa diciendo 'pendiente' de cargos cobrados — justo el dato con
  // el que se contesta «me habéis cobrado dos veces».
  assert.ok(
    /ignoreDuplicates:\s*!esDesenlaceFirme/.test(cuerpo),
    'los desenlaces de tránsito no pisan una fila ya escrita',
  );
  assert.ok(
    /const esDesenlaceFirme =\s*desenlace === 'cobrado' \|\| desenlace === 'fallido'/.test(cuerpo),
    'solo cobrado/fallido son firmes: pendiente y reintentando no degradan el libro',
  );
});

test('PAY-1: un desenlace de tránsito NO pisa el que ya hay; uno firme sí', async () => {
  // El doble falso recoge `ignoreDuplicates`, que es lo que en Postgres decide
  // si el upsert es un `DO NOTHING` o un `DO UPDATE`.
  const pendiente = adminFalso({ importeRecibo: 85.5 });
  await registrarIntentoCobro(pendiente.admin, {
    paymentIntentId: 'pi_1', studioId: 'st-1', reciboId: 'rec-1',
    origen: 'checkout', desenlace: 'pendiente',
  });
  assert.equal(
    pendiente.insertados[0].__ignoreDuplicates, true,
    "'pendiente' no puede degradar un 'cobrado' ya anotado",
  );

  const cobrado = adminFalso({ importeRecibo: 85.5 });
  await registrarIntentoCobro(cobrado.admin, {
    paymentIntentId: 'pi_1', studioId: 'st-1', reciboId: 'rec-1',
    origen: 'off_session', desenlace: 'cobrado',
  });
  assert.equal(
    cobrado.insertados[0].__ignoreDuplicates, false,
    "'cobrado' SÍ corrige el 'pendiente' previo: es la transición que M-1 necesitaba",
  );
});

test('PAY-2: el camino off-session también escribe en el libro de cobros', () => {
  // El detector `detectar_dobles_cobros` agrupa por recibo y cuenta
  // PaymentIntents distintos. Mientras solo escribiera el camino de CHECKOUT,
  // era estructuralmente ciego en el único camino que el propio repo documenta
  // como duplicable: la Idempotency-Key de `cobrarReciboOffSession` lleva el nº
  // de intento, así que el reintento del día siguiente es un cargo real nuevo.
  const offSession = readFileSync(new URL('./stripe-cobros.ts', import.meta.url), 'utf8');
  assert.ok(
    offSession.includes('registrarIntentoCobro'),
    'cobrarReciboOffSession anota el cargo: sin fila no hay doble cobro detectable',
  );
  assert.ok(
    /origen: 'off_session'/.test(offSession),
    'se distingue del camino de checkout por su origen',
  );
  const owner = readFileSync(new URL('./confirmar-cobro.ts', import.meta.url), 'utf8');
  const ini = owner.indexOf('export async function confirmarCobroExitoso');
  const fin = owner.indexOf('export type CierreOffSession');
  assert.ok(ini > 0 && fin > ini, 'no se encuentra confirmarCobroExitoso: revisa este guardián');
  const exitoso = owner.slice(ini, fin);
  assert.ok(
    exitoso.includes('registrarIntentoCobro') && /origen: 'off_session'/.test(exitoso),
    'confirmarCobroExitoso (SEPA y reconciliación de tarjeta) también anota, con origen off_session',
  );
});

// ── D-1 (auditoría 2026-09-24) ──────────────────────────────────────────────
// El barrido de dunning de las 08:30 cobraba off-session recibos que la socia
// estaba pagando ELLA con un enlace de pago abierto. Su gemelo,
// `lib/inngest/renovaciones.ts`, sí filtra por `checkout_session_id is null` y
// lo explica («esto lo está llevando ella en persona, no lo adoptes») — pero
// ese filtro protege solo el momento de la ADOPCIÓN. Un recibo ya adoptado al
// que la socia abre después el enlace lo cobraba igual: si pagaba el enlace,
// dos cargos reales. El segundo se detecta y NADIE lo devuelve.
test('⚠️ el dunning no cobra un recibo con un enlace de pago abierto', () => {
  const dunning = readFileSync(new URL('../inngest/dunning.ts', import.meta.url), 'utf8');
  const i = dunning.indexOf("step.run('lecturas'");
  assert.ok(i > 0, 'no se encuentra el step de lecturas del dunning: revisa este guardián');
  const hastaElLimite = dunning.slice(i, dunning.indexOf('.limit(200)', i));
  assert.match(
    hastaElLimite, /\.is\('checkout_session_id', null\)/,
    'sin este filtro vuelve el doble cargo: el cron y el enlace cobran los dos',
  );
});

test('⚠️ y el criterio sigue estando también en renovaciones (los dos gemelos, no uno)', () => {
  const renov = readFileSync(new URL('../inngest/renovaciones.ts', import.meta.url), 'utf8');
  assert.match(renov, /\.is\('checkout_session_id', null\)/);
});

// ── D-2 (auditoría 2026-09-24) ──────────────────────────────────────────────
// Toda la detección de segundo cargo vivía DENTRO del `if (!esSepa)`. El
// comentario de la rama SEPA («es una reentrega del evento») dejó de ser cierto
// cuando `confirmarCobroRecibo` empezó a aceptar `EN_CURSO`: un recibo con
// adeudo SEPA en vuelo conserva su enlace de pago abierto, la socia puede
// cerrarlo con tarjeta, y días después el adeudo liquida repitiendo los efectos
// completos —incluido un segundo «pago realizado»— sin un solo aviso.
test('⚠️ la detección de segundo cargo cubre SEPA, no solo tarjeta', () => {
  // Desde el refactor del dueño único, la detección vive en `confirmarCobro`
  // (rama `otro_cobro`) y es la misma para SEPA y tarjeta: no puede depender del
  // método. Si alguien la metiera detrás de un `if (metodo …)`, el camino SEPA
  // volvería a quedar mudo.
  const fuente = readFileSync(new URL('./confirmar-cobro.ts', import.meta.url), 'utf8');
  const ini = fuente.indexOf("case 'otro_cobro':");
  const fin = fuente.indexOf("case 'no_cobrable':");
  assert.ok(ini > 0 && fin > ini, "no se encuentra la rama 'otro_cobro': revisa este guardián");
  const rama = fuente.slice(ini, fin);
  assert.ok(rama.includes('SEGUNDO cobro del mismo recibo'), 'el aviso de segundo cobro sigue en su rama');
  assert.ok(
    !/esSepa|metodo\s*===|metodo\s*!==/.test(rama),
    'el aviso no puede depender del método de pago: dentro de un if de tarjeta, SEPA queda mudo',
  );
});

// D-4: la precedencia del libro es cobrado > fallido > reintentando > pendiente.
test('D-4: un cobrado ya anotado NO se degrada a fallido', async () => {
  const { admin, insertados } = adminFalso({ importeRecibo: 20, desenlaceExistente: 'cobrado' });
  await registrarIntentoCobro(admin, { ...PARAMS, desenlace: 'fallido' });
  assert.strictEqual(insertados.length, 0, 'no se escribe nada: el cargo ya se cobró');
});

test('D-4: un fallido SÍ pisa un pendiente o un reintentando (transición hacia arriba)', async () => {
  for (const previo of ['pendiente', 'reintentando']) {
    const { admin, insertados } = adminFalso({ importeRecibo: 20, desenlaceExistente: previo });
    await registrarIntentoCobro(admin, { ...PARAMS, desenlace: 'fallido' });
    assert.strictEqual(insertados.length, 1, `fallido sobre ${previo}`);
    assert.strictEqual(insertados[0].__ignoreDuplicates, false);
  }
});

test('D-4: un cobrado sigue pisando un fallido (el cargo salió después de un rechazo)', async () => {
  const { admin, insertados } = adminFalso({ importeRecibo: 20, desenlaceExistente: 'fallido' });
  await registrarIntentoCobro(admin, { ...PARAMS, desenlace: 'cobrado' });
  assert.strictEqual(insertados.length, 1);
  assert.strictEqual(insertados[0].__ignoreDuplicates, false);
});
