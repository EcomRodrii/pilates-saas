import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { textoNoAbrir } from '../student/mensajes-instructora.ts';
import { TEXTO_MENOR_CHAT } from './reglas.ts';

// Denunciar y bloquear en el chat (App Store 1.2) corren con service-role: la
// RLS no actúa. Lo que lo hace seguro es que quién pide salga SIEMPRE del token
// (y de su ficha en ese estudio) y que se compruebe que el hilo es suyo antes de
// escribir nada. Esto lo fija en el código, igual que
// `mensajes-servidor-contrato.test.ts` para leer y escribir mensajes.

const RAIZ = join(import.meta.dirname, '..', '..');
const leer = (r: string) => readFileSync(join(RAIZ, r), 'utf8');

test('la alumna: quién es sale del token y de su ficha en ESTE estudio, nunca del body', () => {
  for (const ruta of [
    'app/api/public/mensajeria/conversaciones/[id]/denunciar/route.ts',
    'app/api/public/mensajeria/conversaciones/[id]/bloquear/route.ts',
  ]) {
    const f = leer(ruta);
    assert.match(f, /const user = await verificarUsuarioSupabase\(req\)/, ruta);
    assert.match(f, /const socioId = await socioAutenticado\(user\.userId, studioId\)/, ruta);
    assert.match(f, /yo: \{ tipo: 'ALUMNA', socioId, authUserId: user\.userId \}/, ruta);
    assert.doesNotMatch(f, /body\??\.(socioId|authUserId|autor)/, ruta);
    assert.match(f, /if \(!r\) return NextResponse\.json\(\{ error: 'No autorizado' \}, \{ status: 403 \}\)/, ruta);
  }
});

test('la instructora: por su sesión de instructora, y sus acciones van al servidor de su chat', () => {
  const f = leer('app/api/portal/instructora/mensajes/route.ts');
  assert.match(f, /'denunciar', 'bloquear'\] as const/);
  assert.match(f, /denunciarEnHilo\(suya, conversacionId as string, mensajeId as string, detalle\)/);
  assert.match(f, /bloquearEnHilo\(suya, conversacionId as string, body\.bloquear as boolean, detalle\)/);
  const s = leer('lib/portal-instructora/mensajes-servidor.ts');
  assert.match(s, /yo: \{ tipo: 'INSTRUCTORA', authUserId: p\.userId \}/);
});

test('el servidor comprueba que el hilo es suyo antes de escribir, y bloquear solo toca su fila', () => {
  const s = leer('lib/moderacion/chat-servidor.ts');
  const denunciar = s.slice(s.indexOf('export async function denunciarMensaje'), s.indexOf('export async function bloquearEnChat'));
  assert.ok(denunciar.indexOf('hiloModerable(') < denunciar.indexOf('registrarDenuncia('), 'primero el hilo, luego la denuncia');
  assert.match(denunciar, /\.eq\('conversacion_id', p\.conversacionId\)\.eq\('studio_id', p\.studioId\)/, 'el mensaje es de ese hilo y ese estudio');
  assert.match(denunciar, /No puedes denunciar un mensaje tuyo/);

  const bloquear = s.slice(s.indexOf('export async function bloquearEnChat'), s.indexOf('export async function alumnaMenorParaChat'));
  assert.ok(bloquear.indexOf('hiloModerable(') < bloquear.indexOf('.update('), 'primero el hilo, luego el UPDATE');
  assert.match(bloquear, /if \(hilo\.tipo !== 'ALUMNA_INSTRUCTORA'\)/, 'el hilo con el estudio no se bloquea');
  // Su fila y solo la suya: la alumna por su ficha, la instructora por su cuenta.
  assert.match(bloquear, /q\.eq\('rol_en_conversacion', 'SOCIO'\)\.eq\('socio_id', p\.yo\.socioId\)/);
  assert.match(bloquear, /q\.eq\('rol_en_conversacion', 'STAFF'\)\.eq\('auth_user_id', p\.yo\.authUserId\)/);
  assert.match(bloquear, /motivo: 'BLOQUEO'/, 'el estudio se entera del bloqueo');

  // La instructora solo modera en sus hilos con alumnas.
  assert.match(s, /yo\.tipo === 'INSTRUCTORA' \? tipo !== 'ALUMNA_INSTRUCTORA'/);
});

test('menores de 14: no se abre un chat con instructora desde ninguna de las dos apps', () => {
  assert.equal(textoNoAbrir('MENOR'), TEXTO_MENOR_CHAT);
  const alumna = leer('app/api/public/mensajeria/conversaciones/route.ts');
  assert.ok(alumna.indexOf('alumnaMenorParaChat(') > 0 && alumna.indexOf('alumnaMenorParaChat(') < alumna.indexOf(".rpc('abrir_conversacion'"));
  const instructora = leer('lib/portal-instructora/mensajes-servidor.ts');
  assert.ok(instructora.indexOf('alumnaMenorParaChat(') > 0 && instructora.indexOf('alumnaMenorParaChat(') < instructora.indexOf(".rpc('abrir_conversacion'"));
});

test('«Personas bloqueadas»: solo lo que bloqueó ELLA, por su ficha en ESTE estudio', () => {
  const f = leer('app/api/public/bloqueos/route.ts');
  assert.match(f, /const socioId = await socioAutenticado\(user\.userId, studioId\)/);
  assert.match(f, /\.eq\('estado', 'bloqueada'\)\.eq\('bloqueada_por', socioId\)/, 'nunca quién la bloqueó a ella');
  assert.match(f, /\.eq\('socio_id', socioId\)\.eq\('rol_en_conversacion', 'SOCIO'\)/);
  assert.match(f, /\.eq\('studio_id', studioId\)\.eq\('tipo', 'ALUMNA_INSTRUCTORA'\)/);
});
