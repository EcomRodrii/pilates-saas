import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// /api/public/equipo-email corre con service-role y sin sesión: dice si un correo
// tiene ficha de equipo, y /login lo usa para mandar a /crear-estudio a quien no
// es de ningún equipo. Se fija en el código lo que NO puede cambiar sin decidirlo.

const ruta = readFileSync(new URL('../../app/api/public/equipo-email/route.ts', import.meta.url), 'utf8')
  .replace(/\/\/.*$/gm, '');
const login = readFileSync(new URL('../../app/login/page.tsx', import.meta.url), 'utf8')
  .replace(/\/\/.*$/gm, '');

test('límites por IP primero, antes de leer el cuerpo y de tocar la base de datos', () => {
  const hitos = ['enforceRateLimit(', 'req.json()', 'EMAIL_VALIDO.test(', 'getSupabaseAdmin()', "from('instructores')"]
    .map(h => [h, ruta.indexOf(h)] as const);
  for (const [h, i] of hitos) assert.ok(i > 0, `no se encuentra ${h}`);
  const pos = hitos.map(([, i]) => i);
  assert.deepEqual(pos, [...pos].sort((a, b) => a - b));
  assert.match(ruta, /'public-equipo-email', \{ max: 6, windowSeconds: 60 \}/);
  assert.match(ruta, /'public-equipo-email-dia', \{ max: 40, windowSeconds: 86_400 \}/);
});

test('solo devuelve un booleano: nunca estudio, nombre, rol ni id', () => {
  assert.match(ruta, /NextResponse\.json\(\{ esDelEquipo: \(data\?\.length \?\? 0\) > 0 \}\)/);
  assert.match(ruta, /\.select\('id'\)/);
  assert.doesNotMatch(ruta, /select\('\*'\)|studio_id|nombre|rol\b/);
});

test('el correo se escapa para el patrón y una baja explícita no cuenta (un activo NULL sí)', () => {
  assert.match(ruta, /\.ilike\('email', escaparLike\(email\)\)/);
  assert.match(ruta, /\.or\('activo\.is\.null,activo\.eq\.true'\)/);
  // `.neq('activo', false)` dejaría fuera los NULL.
  assert.doesNotMatch(ruta, /\.neq\('activo'/);
});

test('un fallo de la base de datos no dice «no es del equipo»', () => {
  assert.match(ruta, /if \(error\) return NextResponse\.json\(\{ error: [^}]+\}, \{ status: 503 \}\);/);
});

test('/login: sin enlace de invitación comprueba antes de gastar el captcha, y solo un «no» explícito manda a crear estudio', () => {
  const comprobacion = login.indexOf("fetch('/api/public/equipo-email'");
  const captcha = login.indexOf('const token = await pedirToken();', login.indexOf('async function handleSubmit'));
  assert.ok(comprobacion > 0 && captcha > comprobacion, 'la comprobación tiene que ir antes de pedir el token de captcha');
  assert.match(login, /modo === 'crear' && !leerTokenInvitacion\(\)/);
  assert.match(login, /typeof j\?\.esDelEquipo === 'boolean' \? j\.esDelEquipo : null/);
  assert.match(login, /\.catch\(\(\) => null\)/);
  assert.match(login, /if \(esDelEquipo === false\) \{[\s\S]*?window\.location\.href = '\/crear-estudio';[\s\S]*?return;/);
});
