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

test('⚠️ I-1 · «Eliminar clase» no devuelve bono a las plazas fijas, ni a ciegas', () => {
  // Fase 2 del motor de derechos: ya no hay una selección de «confirmadas» ni un `+1` en el
  // navegador. «Eliminar» cancela las reservas y las libera POR EL SERVIDOR antes de borrar la
  // clase (el borrado se lleva las reservas por cascada), y quien decide qué se devuelve es
  // `liberar_derecho`, que solo devuelve lo que esa reserva consumió: una plaza fija o una
  // pagada por la cuota no consumieron bono y no recuperan nada.
  // Solo el código: los comentarios que cuentan la historia pueden nombrarla.
  const codigo = FUENTE.split('\n').filter(l => !/^\s*\/\//.test(l)).join('\n');
  assert.ok(!/\b(devolverSesionBono|dbDevolverSesionBono)\b/.test(codigo),
    'ha vuelto la devolución a ciegas desde el navegador: sin la reserva no sabe qué bono pagó ni si hubo pago');
  // `cuerpoDe` no sirve aquí: el tipo de retorno de deleteSesion lleva llaves antes del cuerpo.
  const ini = FUENTE.indexOf('async function deleteSesion(');
  assert.notEqual(ini, -1, 'no existe deleteSesion');
  const cuerpo = FUENTE.slice(ini, FUENTE.indexOf('// ── Series de clases recurrentes', ini));
  const liberar = cuerpo.indexOf("cancelarReservasDeSesiones([id], 'deleteSesion', 'eliminar_clase')");
  const borrar = cuerpo.indexOf('dbDeleteSesion(id)');
  assert.ok(liberar > 0, 'deleteSesion ya no cancela y libera las reservas por el servidor');
  assert.ok(borrar > 0, 'deleteSesion ya no borra la clase: revisa este guardián');
  assert.ok(liberar < borrar,
    'liberar va ANTES de borrar: el DELETE se lleva las reservas por cascada y con ellas lo que había que devolver');
  // Si liberar falla NO se borra.
  const entre = cuerpo.slice(liberar, borrar);
  assert.match(entre, /if \(!liberadas\.ok\) return liberadas;/,
    'si no se pueden cancelar las reservas, no se puede borrar la clase');
  // Y tampoco si alguna devolución falló: borrar se llevaría las reservas, que son lo único que dice a quién hay que devolver.
  assert.match(entre, /if \(liberadas\.avisoBono\) \{\s*return \{\s*ok: false/,
    'si alguna devolución falla, la clase no se borra: se queda cancelada con sus reservas a la vista');
  // Y el servidor sigue sin tocar las plazas fijas.
  const ruta = readFileSync(join(import.meta.dirname, '..', 'app/api/reservas/devolver-bonos/route.ts'), 'utf8');
  assert.match(ruta, /!\(r\.id as string\)\.startsWith\('res-pf-'\)/, '/api/reservas/devolver-bonos dejó de excluir las plazas fijas');
});

test('⚠️ I-2 · el panel no deja apuntar a nadie a una clase cancelada', () => {
  const cuerpo = cuerpoDe('addReserva');

  assert.match(cuerpo, /sesion\?\.cancelada/,
    'falta el guard de sesión cancelada: `reservar_plaza` no lo tiene y este camino la llama directa '
    + 'desde el navegador, saltándose `crearReservaPublica`, que sí lo rechaza.');

  // El guard tiene que estar ANTES de pedir la reserva: después no evita ni la
  // reserva ni el consumo de bono, solo cambia lo que se pinta. Desde que el
  // panel reserva por el servidor, `crearReservaMostrador` repite el mismo guard
  // (defensa en profundidad), pero el del cliente ahorra el viaje y la fila
  // optimista.
  const posGuard = cuerpo.indexOf('sesion?.cancelada');
  const posPeticion = cuerpo.indexOf("'/api/reservas/crear'");
  assert.notEqual(posPeticion, -1, 'addReserva ya no reserva por /api/reservas/crear: revisa este guardián');
  assert.ok(posGuard < posPeticion,
    'el guard de clase cancelada tiene que ir ANTES de pedir la reserva, no después');
  // Y el panel no vuelve a llamar a la RPC directo desde el navegador: por ahí
  // no hay aviso a la alumna ni autorización de servidor.
  assert.doesNotMatch(cuerpo, /dbReservarPlaza\(|rpc\('reservar_plaza'/,
    'el panel vuelve a llamar a reservar_plaza desde el navegador: debe pasar por /api/reservas/crear');
});
