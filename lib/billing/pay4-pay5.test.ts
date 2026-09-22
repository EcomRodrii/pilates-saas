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
    /const \{ error \} = await admin\.from\('cobros_intentos'\)\.insert\(/.test(cuerpo),
    'el insert se espera y su error se inspecciona, no se descarta',
  );
});
