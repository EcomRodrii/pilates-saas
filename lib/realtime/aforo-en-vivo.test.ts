// ─────────────────────────────────────────────────────────────────────────────
// Guardias del aforo en vivo.
//
// El fallo original: la propietaria quitaba a una alumna de una clase llena y
// su propio calendario seguía diciendo 8/8, y la app de la alumna seguía
// diciendo «en lista de espera». Con F5 salía bien — la BD estuvo correcta todo
// el tiempo, lo que no existía era una vía para que las pantallas ABIERTAS se
// enteraran.
//
// Estos tests son estructurales a propósito. Lo que hay que impedir no es que
// una función devuelva mal un número: es que alguien añada una pantalla nueva,
// o una acción nueva, y se olvide de engancharla — que es exactamente cómo
// nació el fallo (24 manejadores llamaban a `refrescarVista()` y uno no).
// ─────────────────────────────────────────────────────────────────────────────
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const raiz = join(import.meta.dirname, '..', '..');
const leer = (p: string) => readFileSync(join(raiz, p), 'utf8');

// La definición viva del trigger es la de la migración MÁS RECIENTE que lo
// reescribe — mismo criterio que los guardias de `reservar_plaza`.
function migracionViva(marca: string): string {
  const dir = join(raiz, 'supabase', 'migrations');
  const f = readdirSync(dir).filter(x => x.endsWith('.sql'))
    .filter(x => readFileSync(join(dir, x), 'utf8').includes(marca))
    .sort().pop();
  assert.ok(f, `ninguna migración contiene ${marca}`);
  return readFileSync(join(dir, f!), 'utf8');
}

// ── Lo que viaja por el canal ────────────────────────────────────────────────
test('el aviso NO lleva datos personales, solo el id de la clase', () => {
  const sql = migracionViva('function public.difundir_cambio_aforo');
  const envio = sql.slice(sql.indexOf('realtime.send'));
  assert.match(envio, /jsonb_build_object\('sesionId'/,
    'El aviso tiene que ser «la clase X ha cambiado», nada más.');
  // El canal es del ESTUDIO entero y lo escuchan otras socias: difundir la fila
  // de `reservas` metería `socio_id` de unas en la pantalla de otras.
  for (const prohibido of ['socio_id', 'record', 'to_jsonb(new)', 'old_record']) {
    assert.ok(!envio.includes(prohibido),
      `'${prohibido}' no puede viajar en un canal que escucha todo el estudio.`);
  }
});

test('el trigger no puede tumbar la reserva que lo dispara', () => {
  const sql = migracionViva('function public.difundir_cambio_aforo');
  const cuerpo = sql.slice(sql.indexOf('function public.difundir_cambio_aforo'));
  assert.match(cuerpo, /exception when others then/,
    'Cuelga de la transacción de reservar y cancelar, que mueve bonos y dinero: '
    + 'un fallo al avisar no puede dejar a una socia sin reservar.');
});

// ── Qué cambios despiertan a las pantallas ───────────────────────────────────
// Si una columna que SE VE queda fuera del WHEN, el fallo es silencioso: no
// falla nada, simplemente la pantalla no se entera. Igual que el bug original.
test('el WHEN de reservas cubre todo lo que la rejilla pinta', () => {
  const sql = migracionViva('trg_difundir_cambio_aforo_reservas_upd');
  const when = sql.slice(sql.indexOf('trg_difundir_cambio_aforo_reservas_upd'));
  for (const col of ['estado', 'spot_id', 'check_in_en', 'posicion_espera', 'oferta_expira_en']) {
    assert.match(when, new RegExp(`old\\.${col} is distinct from new\\.${col}`), col);
  }
});

test('el WHEN de sesiones cubre capacidad, cancelación y encuadre', () => {
  const sql = migracionViva('trg_difundir_cambio_aforo_sesiones_upd');
  const when = sql.slice(sql.indexOf('trg_difundir_cambio_aforo_sesiones_upd'));
  // `aforo_maximo` es el «/8» del «8/8»: cambiarlo mueve el contador igual que
  // quitar a una alumna.
  for (const col of ['aforo_maximo', 'cancelada', 'inicio', 'fin', 'sala_id', 'instructor_id']) {
    assert.match(when, new RegExp(`old\\.${col} is distinct from new\\.${col}`), col);
  }
});

// ── La cerradura de tenant ───────────────────────────────────────────────────
test('solo escucha el staff del estudio o una socia activa suya', () => {
  // ⚠️ Con el nombre a secas casaría también `aforo_broadcast_lectura_anonima`,
  // que lo lleva dentro — la misma trampa de prefijo de `LIMITE_SEMANAL`.
  const sql = migracionViva('create policy aforo_broadcast_lectura on');
  const pol = sql.slice(sql.indexOf('create policy aforo_broadcast_lectura on'));
  assert.match(pol, /split_part\(realtime\.topic\(\), ':', 2\)/,
    'El estudio va en el 2º segmento del topic, como en el feed.');
  assert.match(pol, /s\.auth_user_id = \(select auth\.uid\(\)\)/, 'vía socia');
  assert.match(pol, /public\.current_studio_id\(\)/, 'vía staff');
  assert.match(pol, /s\.activo = true/,
    'Una socia dada de baja no sigue escuchando el estudio.');
});

// ── Que nadie se olvide de engancharlo ───────────────────────────────────────
test('las pantallas de la alumna que enseñan plazas o su reserva están enganchadas', () => {
  const pantallas = [
    'app/portal/[slug]/page.tsx',
    'app/portal/[slug]/mis-reservas/page.tsx',
    'app/portal/[slug]/mis-reservas/[reservaId]/page.tsx',
    'app/portal/[slug]/reservar/page.tsx',
    'app/portal/[slug]/reservar/[claseId]/page.tsx',
    'app/portal/[slug]/calendario/page.tsx',
  ];
  for (const p of pantallas) {
    assert.match(leer(p), /useAforoEnVivoPortal\(/,
      `${p} enseña plazas o el estado de su reserva y no se entera de los cambios.`);
  }
});

test('el calendario del panel escucha, y quitar a una alumna refresca su vista', () => {
  const cal = leer('app/(dashboard)/calendario/page.tsx');
  assert.match(cal, /useAforoEnVivo\(supabase, \{/, 'el calendario no escucha el canal');

  // ⚠️ ESTE es el bug exacto que se reportó. La pantalla tiene DOS fuentes para
  // el mismo número: `datosVista` (que pinta «8/8») y `reservas` del contexto
  // (que pinta la lista de asistentes). `cancelarReserva` solo toca la segunda,
  // así que sin `refrescarVista()` la alumna desaparecía de la lista y el
  // contador se quedaba en 8/8.
  const i = cal.indexOf('onQuitar:');
  assert.ok(i > 0, 'no encuentro el manejador de quitar');
  const bloque = cal.slice(i, i + 1200);
  assert.match(bloque, /refrescarVista\(\)/,
    'Quitar a una alumna tiene que refrescar `datosVista`: es de donde sale el contador.');
});

// ── El widget que el estudio incrusta en su propia web ──────────────────────
// Lo mira alguien SIN cuenta, así que el canal se abrió a `anon`. Son dos
// pantallas distintas y hay que enganchar las dos: `/reservar/{slug}` (Modo A,
// la página alojada) y `public/widget.js` (Modo B, el script embebido, que se
// alimenta de `usar-datos-widget`).
test('los dos modos del widget escuchan el canal', () => {
  for (const p of ['app/reservar/[slug]/page.tsx', 'lib/widget/usar-datos-widget.ts']) {
    assert.match(leer(p), /useAforoEnVivo\(/, `${p} no escucha el aforo`);
  }
});

test('el sondeo del widget es RESPALDO: no corre con el canal vivo', () => {
  // Si el `setInterval` no depende del estado de la conexión, se está pagando
  // dos veces por lo mismo — y el usuario pidió expresamente que la solución no
  // fuera un sondeo.
  for (const p of ['app/reservar/[slug]/page.tsx', 'lib/widget/usar-datos-widget.ts']) {
    const src = leer(p);
    const i = src.indexOf('setInterval');
    assert.ok(i > 0, `${p}: no encuentro el tic`);
    const bloque = src.slice(Math.max(0, i - 400), i);
    assert.match(bloque, /if \(aforoEnVivo\) return;/,
      `${p}: el tic corre aunque el canal esté conectado.`);
  }
});

test('la policy anónima está acotada a los topics de aforo', () => {
  const sql = migracionViva('aforo_broadcast_lectura_anonima');
  const pol = sql.slice(sql.indexOf('create policy aforo_broadcast_lectura_anonima'));
  assert.match(pol, /to anon/);
  assert.match(pol, /split_part\(realtime\.topic\(\), ':', 1\) = 'aforo'/,
    'Sin el prefijo, un anónimo entraría también en el feed y en la mensajería.');
  assert.match(pol, /for select/,
    'Solo lectura: publicar sigue siendo cosa del trigger.');
});

test('el bundle embebible NO monta un SupabaseClient completo', () => {
  const src = leer('lib/widget/canales-widget.ts');
  assert.match(src, /RealtimeClient/);
  // Importar `lib/db/supabase` aquí metería Postgrest y Storage en un script
  // que se sirve desde la web del estudio: ~110 KB sin usar. Mismo motivo por
  // el que `supabasePortal` es solo `.auth`.
  assert.ok(!/from '@\/lib\/db\/supabase'/.test(src),
    'El cliente completo no puede entrar en el bundle embebible.');
});

// El aviso llega por la red y agrupado; la acción de uno mismo no debe esperarlo.
test('el hook agrupa los avisos en ráfaga', () => {
  // La fontanería se movió a `canal-en-vivo.ts` al aparecer el segundo canal
  // (créditos): duplicarla habría hecho que una de las dos copias se quedara
  // vieja y fallara en silencio. Lo que se vigila es lo mismo, en su sitio.
  const src = leer('lib/realtime/canal-en-vivo.ts');
  assert.match(src, /AGRUPAR_MS/,
    'Cancelar una clase entera cambia N reservas a la vez: sin agrupar son N recargas.');
  assert.match(src, /TOKEN_REFRESHED/,
    'Sin renovar el token el canal enmudece a la hora, con el mismo síntoma que el bug.');
});

test('los dos canales comparten la fontanería, no la copian', () => {
  // Si alguien vuelve a duplicarla, la copia que se quede sin el reintento de
  // token enmudece a la hora sin fallar — el síntoma exacto del bug original.
  for (const f of ['lib/realtime/aforo-en-vivo.ts', 'lib/realtime/creditos-en-vivo.ts']) {
    assert.match(leer(f), /useCanalEnVivo/, `${f} debe delegar en canal-en-vivo.ts`);
    assert.doesNotMatch(leer(f), /TOKEN_REFRESHED/, `${f} no debe reimplementar la renovación de token`);
  }
});

test('el aviso de créditos NO dice de quién es el saldo', () => {
  // El canal es del estudio y lo escuchan otras socias: mandar el `socio_id`
  // metería el identificador de una clienta en un canal ajeno. Mismo criterio
  // que el de aforo con la fila de `reservas`.
  const sql = leer('supabase/migrations/20260908220000_creditos_en_vivo.sql');
  // Solo las líneas VIVAS: el comentario de la migración menciona `socio_id`
  // precisamente para explicar por qué NO va en el mensaje, y contarlo sería
  // el mismo verde-por-comentario que ya mordió al guardián de lazy-load.
  const vivas = sql.split('\n').filter((l) => !l.trimStart().startsWith('--')).join('\n');
  assert.doesNotMatch(vivas, /socio_id/, 'el payload no puede llevar el socio_id');
  assert.match(sql, /jsonb_build_object\('cambio'/, 'el aviso solo dice que algo cambió');
  // Y no puede tumbar la escritura que lo provoca: mueve créditos.
  assert.match(sql, /exception when others/,
    'un fallo del esquema de realtime no puede impedir ganar o canjear créditos');
});
