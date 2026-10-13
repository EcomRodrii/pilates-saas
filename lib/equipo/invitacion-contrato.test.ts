import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// ─────────────────────────────────────────────────────────────────────────────
// Guardián de la invitación al equipo (13-oct-2026).
//
// Las reglas viven en funciones puras con sus tests (`reclamar-reglas.ts`,
// `enlaces.ts`, `invitacion-publica.ts`), pero lo que las hace valer es que cada
// puerta las llame con lo que toca: el correo de la CUENTA (no uno del body), el
// enlace vigente, y el enlace gastado al terminar. Eso son pocas líneas que un
// refactor puede quitar sin que ningún e2e lo note (los e2e mockean las rutas).
//
// Si esto falla, no se relaja el test: se vuelve a poner la condición.
// ─────────────────────────────────────────────────────────────────────────────

const RAIZ = join(import.meta.dirname, '../..');
const sinComentarios = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '');
const leer = (ruta: string) => sinComentarios(readFileSync(join(RAIZ, ruta), 'utf8'));

const reclamar = leer('lib/actions/equipo/equipoReclamarAction.ts');
const unirse = leer('app/api/portal/instructora/unirse/route.ts');
const publica = leer('app/api/public/invitacion/route.ts');
const invitar = leer('lib/actions/equipo/equipoInvitarAction.ts');
const login = leer('app/login/page.tsx');
const pantalla = leer('app/invitacion/page.tsx');

const CUENTA = /cuenta: \{ email: user\.email \?\? null, emailConfirmado: Boolean\(user\.email_confirmed_at\) \}/;

test('las dos puertas comparan con el correo VERIFICADO de la cuenta de la sesión y con el rol firmado', () => {
  for (const [nombre, src] of [['equipoReclamarAction', reclamar], ['unirse', unirse]] as const) {
    assert.match(src, CUENTA, `${nombre}: el correo sale de la sesión, nunca del body`);
    assert.match(src, /rolFirmado: rolDelEnlace\(claim\.rolFicha\)/, `${nombre}: el rol firmado en el enlace`);
    assert.match(src, /email: fila?\.email|email: ficha\.email/, `${nombre}: contra el correo de la ficha`);
    assert.doesNotMatch(src, /body\??\.(email|rol)\b/, `${nombre}: nada que decida sale del body`);
  }
});

test('las dos puertas gastan la invitación DESPUÉS de unir', () => {
  const update = reclamar.indexOf('.update({ auth_user_id: user.id })');
  const gastar = reclamar.indexOf('await gastarInvitacion(admin');
  assert.ok(update > 0 && gastar > update, 'equipoReclamarAction: se gasta tras el UPDATE');
  const updateU = unirse.indexOf('.update({ auth_user_id: user.id })');
  const gastarU = unirse.indexOf('await gastarInvitacion(admin, studioId, ficha.instructorId)');
  assert.ok(updateU > 0 && gastarU > updateU, 'unirse: se gasta tras el UPDATE');
  assert.doesNotMatch(unirse.slice(updateU, gastarU), /if \(enlace\)/, 'unirse: también al unirse por correo');
});

test('reclamar: «ya es suya» antes que la revocación, y el enlace vigente antes de unir', () => {
  const yaEra = reclamar.indexOf('if (ficha.auth_user_id === user.id) return');
  const revocado = reclamar.indexOf("await enlaceRevocado(admin, claim.instructorId, 'invitacion', token)");
  const update = reclamar.indexOf('.update({ auth_user_id: user.id })');
  assert.ok(yaEra > 0 && revocado > yaEra && update > revocado);
});

test('reclamar: el UPDATE repite lo comprobado (sin cuenta, mismo rol, mismo correo, esta sede, no de baja)', () => {
  const update = reclamar.slice(reclamar.indexOf('.update({ auth_user_id: user.id })'));
  const cadena = update.slice(0, update.indexOf('.select('));
  assert.match(cadena, /\.eq\('studio_id', ficha\.studio_id\)/);
  assert.match(cadena, /\.eq\('rol', ficha\.rol as string\)/);
  assert.match(cadena, /\.eq\('email', ficha\.email as string\)/);
  assert.match(cadena, /\.not\('activo', 'is', false\)/);
  assert.match(cadena, /\.is\('auth_user_id', null\)/);
});

test('unirse: el UPDATE tampoco une una ficha dada de baja', () => {
  const update = unirse.slice(unirse.indexOf('.update({ auth_user_id: user.id })'));
  const cadena = update.slice(0, update.indexOf('.select('));
  assert.match(cadena, /\.not\('activo', 'is', false\)/);
});

test('la ruta pública mira si el enlace está revocado y no devuelve el correo de la ficha a pelo', () => {
  assert.match(publica, /enlaceRevocado\(admin, claim\.instructorId, 'invitacion', token\)/);
  assert.match(publica, /respuestaInvitacionPublica\(/);
  assert.doesNotMatch(publica, /NextResponse\.json\(\{[^}]*email/, 'el correo solo sale tapado, por respuestaInvitacionPublica');
});

test('invitar firma siempre un enlace nuevo, y no dice «enviada» si el correo no salió', () => {
  assert.match(invitar, /await emitirInvitacion\(admin, sesion\.studioId, instructor\.id as string, sesion\.rol, instructor\.rol as string\)/);
  assert.doesNotMatch(invitar, /obtenerOFirmarEnlace/);
  assert.match(invitar, /if \(!envio\.ok\)/);
});

test('/login no canjea un enlace con una sesión que ya estaba abierta al llegar', () => {
  assert.match(login, /if \(token && !session\) recordarTokenInvitacion\(token\)/);
  assert.match(login, /if \(tokenEnUrl && sesionAlLlegar\.current\) \{\s*window\.location\.replace\(`\/invitacion\?token=/);
});

test('/invitacion guarda el enlace al PULSAR, no al abrirla', () => {
  const cargar = pantalla.slice(pantalla.indexOf('const cargar = useCallback'), pantalla.indexOf('async function continuar'));
  assert.doesNotMatch(cargar, /recordarTokenInvitacion\(/, 'abrir la pantalla no es aceptar');
  const continuar = pantalla.slice(pantalla.indexOf('async function continuar'), pantalla.indexOf('function irALaApp'));
  assert.match(continuar, /recordarTokenInvitacion\(tokenPulsado\)/);
  assert.doesNotMatch(pantalla, /con este correo o con otro/, 'ya no vale con otro correo');
});

test('invitar no manda una invitación que al abrirla no serviría (gerencia → recepción)', () => {
  // Lo que comprueba la puerta al reclamar (`ROL_POR_ENCIMA_DE_QUIEN_INVITA`)
  // se comprueba también al invitar: si no, salía un correo que no valía.
  assert.match(invitar, /!puedeActivarAccesoDelRol\(sesion\.rol, instructor\.rol as Rol\)/);
});
