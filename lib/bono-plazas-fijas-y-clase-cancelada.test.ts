import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// ─────────────────────────────────────────────────────────────────────────────
// I-1 e I-2 (auditoría 59ª pasada, 13-sep-2026). Dos fugas de saldo de bono en
// `lib/studio-context.tsx`, las dos por la misma causa: el guard existía en los
// hermanos y faltaba justo en este camino.
//
// I-1 · «Eliminar clase» devolvía una sesión de bono por CADA reserva
//       CONFIRMADA de la sesión, incluidas las plazas fijas. Las plazas fijas
//       las inserta `materializar_plazas_fijas` ya confirmadas y SIN consumir
//       bono (0084), así que devolverles una sesión inventa saldo. Los otros
//       tres caminos filtran `res-pf-`: `ejecutarCancelacionReserva`
//       (lib/db/supabase-data-admin.ts) y `/api/reservas/devolver-bonos`, que
//       hasta lo explica en un comentario.
//
// I-2 · El panel llama a `reservar_plaza` DIRECTO desde el navegador. La RPC no
//       comprueba si la sesión está cancelada (su `cancelada` es el de las
//       sesiones ajenas con las que busca solape), y la ficha de una sesión
//       cancelada sí se abre. Resultado: reserva CONFIRMADA en una clase que no
//       se va a dar, y una sesión de bono descontada. El camino público sí lo
//       rechaza, en `crearReservaPublica`.
//
// Guardianes sobre el fuente, como `liberar-cupo-solo-servidor.test.ts`: lo que
// falló no es una función pura que se pueda invocar aquí, sino una condición
// ausente dentro de un Context de React que arrastra Supabase entero.
// ─────────────────────────────────────────────────────────────────────────────

const FUENTE = readFileSync(join(import.meta.dirname, 'studio-context.tsx'), 'utf8');

/** El cuerpo de `async function <nombre>(` hasta su llave de cierre. */
function cuerpoDe(nombre: string): string {
  const inicio = FUENTE.indexOf(`async function ${nombre}(`);
  assert.notEqual(inicio, -1, `no existe la función ${nombre} en lib/studio-context.tsx`);
  const abre = FUENTE.indexOf('{', FUENTE.indexOf(')', inicio));
  let nivel = 0;
  for (let i = abre; i < FUENTE.length; i++) {
    if (FUENTE[i] === '{') nivel++;
    else if (FUENTE[i] === '}' && --nivel === 0) return FUENTE.slice(abre, i + 1);
  }
  throw new Error(`no se pudo delimitar el cuerpo de ${nombre}`);
}

test('⚠️ I-1 · «Eliminar clase» no devuelve bono a las plazas fijas', () => {
  // Sentencia única en el fichero (comprobado abajo): no hace falta delimitar
  // el cuerpo de la función, que lleva JSX y plantillas y hace frágil contar
  // llaves.
  assert.equal(FUENTE.split('const confirmadas = reservas.filter').length - 1, 1,
    'hay más de una selección de reservas confirmadas: revisa cuál es la de deleteSesion');
  const seleccion = FUENTE.match(/const confirmadas = reservas\.filter\([\s\S]*?\);/);
  assert.ok(seleccion, 'ya no se seleccionan las reservas confirmadas antes del DELETE: revisa este guardián');
  // La negación es parte de la aserción: un filtro invertido (quedarse SOLO
  // con las plazas fijas) sería peor que el fallo original y pasaría un
  // `match(/res-pf-/)` a secas.
  assert.match(seleccion[0], /!\s*r\.id\.startsWith\('res-pf-'\)/,
    'las plazas fijas (`res-pf-…`) nunca consumieron bono: devolverles una sesión INVENTA saldo. '
    + 'Mismo filtro que /api/reservas/devolver-bonos y que ejecutarCancelacionReserva.');
});

test('⚠️ I-2 · el panel no deja apuntar a nadie a una clase cancelada', () => {
  const cuerpo = cuerpoDe('addReserva');

  assert.match(cuerpo, /sesion\?\.cancelada/,
    'falta el guard de sesión cancelada: `reservar_plaza` no lo tiene y este camino la llama directa '
    + 'desde el navegador, saltándose `crearReservaPublica`, que sí lo rechaza.');

  // El guard tiene que estar ANTES de la RPC: después no evita ni la reserva ni
  // el consumo de bono, solo cambia lo que se pinta.
  const posGuard = cuerpo.indexOf('sesion?.cancelada');
  const posRpc = cuerpo.indexOf('dbReservarPlaza(');
  assert.notEqual(posRpc, -1, 'ya no se llama a dbReservarPlaza desde addReserva: revisa este guardián');
  assert.ok(posGuard < posRpc,
    'el guard de clase cancelada tiene que ir ANTES de llamar a reservar_plaza, no después');
});
