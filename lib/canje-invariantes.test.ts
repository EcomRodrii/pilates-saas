import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// ─────────────────────────────────────────────────────────────────────────────
// Guardián: lo que un canje NO puede volver a perder.
//
// ── Por qué existe ───────────────────────────────────────────────────────────
// El 9-sep-2026 el fundador canjeó una botella por 5 créditos en producción, no
// vio nada, y volvió a pulsar 41 segundos después: dos canjes, 10 créditos, una
// botella. Los datos estaban BIEN —los dos canjes existen y los dos descuentos
// cuadran—, así que ningún test de consistencia lo habría cazado. Lo que
// faltaba era el objeto del que hablar: sin código, sin entrega y sin estado,
// no había nada que enseñarle.
//
// Esto no prueba que la RPC funcione —eso se verificó en vivo contra producción
// con `execute_sql` + ROLLBACK, que es lo único que prueba SQL de verdad—. Esto
// impide que las decisiones se deshagan sin que nadie se entere.
//
// ── Si esto falla ────────────────────────────────────────────────────────────
// Alguien ha tocado la migración del canje. Ninguna de estas líneas es
// decorativa: cada una tapa un agujero concreto que ya estuvo abierto.
// ─────────────────────────────────────────────────────────────────────────────

const RAIZ = join(import.meta.dirname, '..');
const MIGRACION = 'supabase/migrations/20260909154359_canjes_codigo_y_entrega.sql';
const sql = readFileSync(join(RAIZ, MIGRACION), 'utf8');

test('la migración se ha leído de verdad, no está vacía', () => {
  // Verde por vacío, otra vez no: si el fichero se renombra, este test tiene
  // que gritar, no pasar comparando cadenas contra nada.
  assert.ok(sql.length > 2000, `${MIGRACION} leída a medias (${sql.length} bytes)`);
  assert.match(sql, /create or replace function public\.canjear_recompensa/);
  assert.match(sql, /create or replace function public\.entregar_canje/);
});

test('el código no se genera con `random()`', () => {
  // `random()` es un PRNG sembrable: con la semilla se reproduce la secuencia
  // entera. Un código que autoriza llevarse algo del estudio no puede salir de
  // ahí — y el encargo pide explícitamente que no sea adivinable.
  const generador = sql.slice(sql.indexOf('generar_codigo_canje'), sql.indexOf('canjear_recompensa'));
  assert.ok(!/\brandom\(\)/.test(generador), 'el generador de códigos ha vuelto a `random()`');
  assert.match(generador, /gen_random_bytes/, 'el código tiene que salir de bytes criptográficos');
});

test('el alfabeto del código no tiene caracteres que se confundan al dictarlo', () => {
  const m = sql.match(/v_alfabeto constant text := '([^']+)'/);
  assert.ok(m, 'no se encontró el alfabeto del código');
  const alfabeto = m[1];
  // El código se dicta en voz alta y se teclea en un mostrador. Una O que es un
  // cero convierte una entrega en una discusión.
  for (const prohibido of ['O', '0', 'I', '1']) {
    assert.ok(!alfabeto.includes(prohibido), `el alfabeto incluye «${prohibido}», que se confunde al dictarlo`);
  }
  // Potencia de dos: `& 31` solo reparte sin sesgo si el alfabeto mide 32.
  assert.equal(alfabeto.length, 32, 'con un alfabeto que no mida 32, `& 31` sesga el sorteo');
});

test('el canje entero va bajo un `for update` del catálogo', () => {
  const fn = sql.slice(sql.indexOf('function public.canjear_recompensa'), sql.indexOf('function public.entregar_canje'));
  assert.match(fn, /from reward_catalog c[\s\S]*?for update/,
    'sin el cerrojo, dos canjes simultáneos leen el mismo stock y el mismo conteo');
  // Las tres escrituras tienen que estar DENTRO de la misma función: sacarlas
  // devuelve el agujero de «créditos descontados y canje que no aparece».
  assert.match(fn, /ajustar_creditos/, 'el descuento tiene que ir dentro de la transacción');
  assert.match(fn, /insert into reward_redemptions/, 'el canje tiene que ir dentro de la transacción');
  assert.match(fn, /insert into credit_transactions/, 'el apunte tiene que ir dentro de la transacción');
});

test('el coste sale del catálogo, nunca de quien llama', () => {
  const fn = sql.slice(sql.indexOf('function public.canjear_recompensa'), sql.indexOf('function public.entregar_canje'));
  assert.ok(!/p_coste/.test(fn), 'el coste ha pasado a ser un parámetro: quien llama no decide cuánto cuesta una recompensa');
  assert.match(fn, /c\.coste_creditos/);
});

test('entregar dos veces el mismo canje se rechaza', () => {
  const fn = sql.slice(sql.indexOf('function public.entregar_canje'));
  assert.match(fn, /YA_ENTREGADO/, 'sin esto la misma botella sale dos veces del estudio');
  assert.match(fn, /CANJE_CANCELADO/);
  assert.match(fn, /for update/, 'dos pulsaciones simultáneas verían las dos el estado PENDIENTE');
  assert.match(fn, /entregado_en = now\(\)/, 'hay que dejar constancia de CUÁNDO');
  assert.match(fn, /entregado_por = auth\.uid\(\)/, 'y de QUIÉN');
});

test('el código no es la única llave: se puede entregar por id', () => {
  // El encargo insiste: la propietaria que reconoce a la clienta tiene que
  // poder entregar sin pedirle nada. Si `p_codigo` fuera obligatorio, el código
  // pasaría de ayuda a barrera.
  assert.match(sql, /p_redemption_id text default null,\s*\n?\s*p_codigo text default null/,
    'los dos identificadores tienen que seguir siendo opcionales');
  assert.match(sql, /FALTA_IDENTIFICADOR/, 'pero alguno de los dos hace falta');
});

test('la RLS distingue leer de escribir, y escribir exige rol', () => {
  // ⚠️ Había UNA política, `ALL` con solo `studio_id`: una instructora podía
  // marcar un canje como entregado o CANCELARLO — y cancelar devuelve créditos
  // y stock. La tabla de al lado, `recuperaciones`, ya lo distinguía.
  assert.match(sql, /drop policy if exists admin_reward_redemptions/,
    'la política vieja de `ALL` sin rol tiene que seguir borrada');
  assert.match(sql, /for select using \(studio_id = public\.current_studio_id\(\)\)/);
  for (const cmd of ['insert', 'update', 'delete']) {
    const politica = new RegExp(`reward_redemptions_${cmd}[\\s\\S]{0,220}puede_gestionar_clientas`);
    assert.match(sql, politica, `la política de ${cmd.toUpperCase()} ya no exige rol de gestión`);
  }
});

test('los grants se rehacen a mano en las tres funciones nuevas', () => {
  // Firma nueva = objeto función nuevo = `EXECUTE` a PUBLIC por defecto, y en
  // este proyecto `pg_default_acl` además se lo da directo a anon/authenticated.
  // Va documentado en tentare-os.md y ha mordido cuatro veces.
  for (const fn of ['generar_codigo_canje', 'canjear_recompensa', 'entregar_canje']) {
    assert.match(sql, new RegExp(`revoke all on function public\\.${fn}`), `${fn} sin revoke`);
    assert.match(sql, new RegExp(`grant execute on function public\\.${fn}`), `${fn} sin grant explícito`);
  }
  // El generador es un ayudante interno: si `authenticated` pudiera llamarlo,
  // cualquiera podría sondear qué códigos existen ya en su estudio.
  assert.match(sql, /revoke all on function public\.generar_codigo_canje\(text\) from public, anon, authenticated/);
});
