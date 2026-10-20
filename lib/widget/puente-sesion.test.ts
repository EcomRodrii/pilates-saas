import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  CLAVE_SESION_PUENTE, CLAVES_SESION_PUENTE, ERROR_COMPROBAR_CUENTA, MENSAJE_CUENTA_DE_EQUIPO, MOTIVO_CUENTA_DE_EQUIPO,
  olvidarSesionDelPuente, RUTA_CUENTA_DE_EQUIPO, veredictoCuenta,
  emailDelIntento, encargoDelIntento, esAvisoPuenteListo, mensajeEncargo, nonceValido, resultadoDelPuente,
  sesionAutenticadaPorEmailDespuesDe, sesionPorContrasenaDespuesDe, TOLERANCIA_PUENTE_MS,
  TIPO_EMAIL_DEL_INTENTO, TIPO_ENCARGO_ACCESO, TIPO_ENLACE_ENVIADO, TIPO_PUENTE_LISTO, TIPO_RESULTADO_ACCESO,
  urlPuente, urlReservarCompleta,
} from './puente-sesion.ts';

function b64url(obj: unknown): string {
  return Buffer.from(JSON.stringify(obj)).toString('base64url');
}

function jwt(payload: unknown): string {
  return `${b64url({ alg: 'HS256', typ: 'JWT' })}.${b64url(payload)}.firma-falsa`;
}

const ABIERTO_EN = Date.UTC(2026, 8, 13, 10, 0, 0);
const seg = (ms: number) => Math.floor(ms / 1000);

test('OTP posterior a abrir el puente → se reenvía', () => {
  const token = jwt({ sub: 'u1', amr: [{ method: 'otp', timestamp: seg(ABIERTO_EN + 45_000) }] });
  assert.equal(sesionAutenticadaPorEmailDespuesDe(token, ABIERTO_EN), true);
});

test('magiclink (flujo PKCE) posterior → se reenvía', () => {
  const token = jwt({ amr: [{ method: 'magiclink', timestamp: seg(ABIERTO_EN + 5_000) }] });
  assert.equal(sesionAutenticadaPorEmailDespuesDe(token, ABIERTO_EN), true);
});

test('OTP anterior a abrir el puente → NO se reenvía (sesión preexistente)', () => {
  const token = jwt({ amr: [{ method: 'otp', timestamp: seg(ABIERTO_EN - 3_600_000) }] });
  assert.equal(sesionAutenticadaPorEmailDespuesDe(token, ABIERTO_EN), false);
});

test('OTP un poco anterior pero dentro de la tolerancia de reloj → se reenvía', () => {
  const token = jwt({ amr: [{ method: 'otp', timestamp: seg(ABIERTO_EN - 10_000) }] });
  assert.equal(sesionAutenticadaPorEmailDespuesDe(token, ABIERTO_EN), true);
});

test('justo fuera de la tolerancia → NO', () => {
  const token = jwt({ amr: [{ method: 'otp', timestamp: seg(ABIERTO_EN - TOLERANCIA_PUENTE_MS - 2_000) }] });
  assert.equal(sesionAutenticadaPorEmailDespuesDe(token, ABIERTO_EN), false);
});

test('tolerancia explícita a cero', () => {
  const token = jwt({ amr: [{ method: 'otp', timestamp: seg(ABIERTO_EN - 10_000) }] });
  assert.equal(sesionAutenticadaPorEmailDespuesDe(token, ABIERTO_EN, 0), false);
});

test('password u oauth recientes → NO (no es un acceso por email)', () => {
  for (const method of ['password', 'oauth', 'token_refresh', 'anonymous', 'totp']) {
    const token = jwt({ amr: [{ method, timestamp: seg(ABIERTO_EN + 1_000) }] });
    assert.equal(sesionAutenticadaPorEmailDespuesDe(token, ABIERTO_EN), false, method);
  }
});

test('OTP antiguo + password reciente en el mismo amr → NO', () => {
  const token = jwt({
    amr: [
      { method: 'password', timestamp: seg(ABIERTO_EN + 1_000) },
      { method: 'otp', timestamp: seg(ABIERTO_EN - 3_600_000) },
    ],
  });
  assert.equal(sesionAutenticadaPorEmailDespuesDe(token, ABIERTO_EN), false);
});

test('sin amr, amr vacío o amr en formato RFC sin fecha → NO', () => {
  assert.equal(sesionAutenticadaPorEmailDespuesDe(jwt({ sub: 'u1' }), ABIERTO_EN), false);
  assert.equal(sesionAutenticadaPorEmailDespuesDe(jwt({ amr: [] }), ABIERTO_EN), false);
  assert.equal(sesionAutenticadaPorEmailDespuesDe(jwt({ amr: ['otp'] }), ABIERTO_EN), false);
  assert.equal(sesionAutenticadaPorEmailDespuesDe(jwt({ amr: [{ method: 'otp' }] }), ABIERTO_EN), false);
  assert.equal(sesionAutenticadaPorEmailDespuesDe(jwt({ amr: [{ method: 'otp', timestamp: String(seg(ABIERTO_EN + 1_000)) }] }), ABIERTO_EN), false);
});

test('tokens malformados → NO', () => {
  const payloadBueno = b64url({ amr: [{ method: 'otp', timestamp: seg(ABIERTO_EN + 1_000) }] });
  assert.equal(sesionAutenticadaPorEmailDespuesDe('basura', ABIERTO_EN), false);
  assert.equal(sesionAutenticadaPorEmailDespuesDe('', ABIERTO_EN), false);
  assert.equal(sesionAutenticadaPorEmailDespuesDe(`cabecera.${payloadBueno}`, ABIERTO_EN), false);
  assert.equal(sesionAutenticadaPorEmailDespuesDe(`a.${payloadBueno}.c.d`, ABIERTO_EN), false);
  assert.equal(sesionAutenticadaPorEmailDespuesDe(`a.${Buffer.from('no es json').toString('base64url')}.c`, ABIERTO_EN), false);
  assert.equal(sesionAutenticadaPorEmailDespuesDe(`a.${Buffer.from('"texto"').toString('base64url')}.c`, ABIERTO_EN), false);
  assert.equal(sesionAutenticadaPorEmailDespuesDe('a.%%%.c', ABIERTO_EN), false);
  assert.equal(sesionAutenticadaPorEmailDespuesDe(undefined as unknown as string, ABIERTO_EN), false);
});

test('desdeMs no numérico → NO', () => {
  const token = jwt({ amr: [{ method: 'otp', timestamp: seg(ABIERTO_EN + 1_000) }] });
  assert.equal(sesionAutenticadaPorEmailDespuesDe(token, Number.NaN), false);
});

test('nonceValido acepta un UUID y rechaza lo demás', () => {
  assert.equal(nonceValido('3f1c2a4e-9b7d-4c1e-8a2b-5d6e7f8a9b0c'), true);
  assert.equal(nonceValido(undefined), false);
  assert.equal(nonceValido(''), false);
  assert.equal(nonceValido('corto'), false);
  assert.equal(nonceValido('a'.repeat(65)), false);
  assert.equal(nonceValido('3f1c2a4e 9b7d 4c1e 8a2b'), false);
  assert.equal(nonceValido('<script>alert(1)</script>xx'), false);
  assert.equal(nonceValido(['3f1c2a4e-9b7d-4c1e-8a2b-5d6e7f8a9b0c']), false);
});

// ── Código del correo dentro del puente ──────────────────────────────────────
const NONCE = '0123456789abcdef-intento';

test('el widget solo atiende el «listo» del puente de SU intento', () => {
  assert.equal(esAvisoPuenteListo({ tipo: TIPO_PUENTE_LISTO, nonce: NONCE }, NONCE), true);
  assert.equal(esAvisoPuenteListo({ tipo: TIPO_PUENTE_LISTO, nonce: 'otro-intento-cualquiera' }, NONCE), false);
  // Sin intento en curso no se contesta a nadie.
  assert.equal(esAvisoPuenteListo({ tipo: TIPO_PUENTE_LISTO, nonce: NONCE }, null), false);
  assert.equal(esAvisoPuenteListo({ tipo: 'tentare-widget-auth', nonce: NONCE }, NONCE), false);
  assert.equal(esAvisoPuenteListo(null, NONCE), false);
  assert.equal(esAvisoPuenteListo('listo', NONCE), false);
});

test('el puente acepta el email de su intento, y solo con forma de email', () => {
  assert.equal(emailDelIntento({ tipo: TIPO_EMAIL_DEL_INTENTO, nonce: NONCE, email: ' nueva@example.com ' }, NONCE), 'nueva@example.com');
  assert.equal(emailDelIntento({ tipo: TIPO_EMAIL_DEL_INTENTO, nonce: 'otro-intento-cualquiera', email: 'nueva@example.com' }, NONCE), null);
  assert.equal(emailDelIntento({ tipo: TIPO_EMAIL_DEL_INTENTO, nonce: NONCE, email: 'no-es-un-email' }, NONCE), null);
  assert.equal(emailDelIntento({ tipo: TIPO_EMAIL_DEL_INTENTO, nonce: NONCE, email: 42 }, NONCE), null);
  assert.equal(emailDelIntento({ tipo: TIPO_EMAIL_DEL_INTENTO, nonce: NONCE, email: `${'a'.repeat(250)}@example.com` }, NONCE), null);
  assert.equal(emailDelIntento({ tipo: TIPO_PUENTE_LISTO, nonce: NONCE, email: 'nueva@example.com' }, NONCE), null);
  // Un puente sin nonce válido no tiene intento: no acepta nada.
  assert.equal(emailDelIntento({ tipo: TIPO_EMAIL_DEL_INTENTO, nonce: NONCE, email: 'nueva@example.com' }, null), null);
});

// ── El acceso entero en la ventana de Tentare (16-oct-2026) ──────────────────
// La site key de Turnstile da 110200 fuera de tentare.app: el widget encarga el
// acceso a la ventana del puente. Estas son las reglas de forma de ese
// intercambio; el origen y la ventana los comprueba quien escucha.

test('el encargo que manda el widget es exactamente el que acepta el puente', () => {
  const conClave = mensajeEncargo(NONCE, { accion: 'password', email: 'socia@example.com', password: 'secreto-123' });
  assert.equal(conClave.tipo, TIPO_ENCARGO_ACCESO);
  assert.deepEqual(encargoDelIntento(conClave, NONCE), { accion: 'password', email: 'socia@example.com', password: 'secreto-123' });
  const enlace = mensajeEncargo(NONCE, { accion: 'enlace', email: ' nueva@example.com ' });
  assert.deepEqual(encargoDelIntento(enlace, NONCE), { accion: 'enlace', email: 'nueva@example.com' });
});

test('el puente no acepta el encargo de otro intento, ni sin intento', () => {
  const m = mensajeEncargo(NONCE, { accion: 'enlace', email: 'socia@example.com' });
  assert.equal(encargoDelIntento(m, 'otro-intento-cualquiera'), null);
  assert.equal(encargoDelIntento(m, null), null);
  assert.equal(encargoDelIntento({ ...m, nonce: undefined }, NONCE), null);
});

test('el puente rechaza encargos con forma rara', () => {
  const base = { tipo: TIPO_ENCARGO_ACCESO, nonce: NONCE };
  // Acción desconocida (p. ej. pedir un alta o un OAuth que no existe aquí).
  assert.equal(encargoDelIntento({ ...base, accion: 'signup', email: 'a@example.com', password: 'x' }, NONCE), null);
  assert.equal(encargoDelIntento({ ...base, accion: 'oauth', email: 'a@example.com' }, NONCE), null);
  // Email sin forma de email, o de otro tipo.
  assert.equal(encargoDelIntento({ ...base, accion: 'enlace', email: 'no-es-un-email' }, NONCE), null);
  assert.equal(encargoDelIntento({ ...base, accion: 'enlace', email: ['a@example.com'] }, NONCE), null);
  assert.equal(encargoDelIntento({ ...base, accion: 'enlace', email: `${'a'.repeat(250)}@example.com` }, NONCE), null);
  // Contraseña vacía, no texto o absurdamente larga.
  assert.equal(encargoDelIntento({ ...base, accion: 'password', email: 'a@example.com', password: '' }, NONCE), null);
  assert.equal(encargoDelIntento({ ...base, accion: 'password', email: 'a@example.com', password: 123456 }, NONCE), null);
  assert.equal(encargoDelIntento({ ...base, accion: 'password', email: 'a@example.com', password: 'x'.repeat(257) }, NONCE), null);
  // Otro tipo de mensaje (el «listo», el email suelto de antes).
  assert.equal(encargoDelIntento({ tipo: TIPO_PUENTE_LISTO, nonce: NONCE, accion: 'enlace', email: 'a@example.com' }, NONCE), null);
  assert.equal(encargoDelIntento({ tipo: TIPO_EMAIL_DEL_INTENTO, nonce: NONCE, accion: 'enlace', email: 'a@example.com' }, NONCE), null);
  assert.equal(encargoDelIntento(null, NONCE), null);
  assert.equal(encargoDelIntento('tentare-widget-acceso', NONCE), null);
});

test('un encargo de enlace no arrastra una contraseña', () => {
  const r = encargoDelIntento({ tipo: TIPO_ENCARGO_ACCESO, nonce: NONCE, accion: 'enlace', email: 'a@example.com', password: 'colada' }, NONCE);
  assert.deepEqual(r, { accion: 'enlace', email: 'a@example.com' });
});

test('el widget acepta del puente una sesión, un error o «correo enviado», solo de su intento', () => {
  assert.deepEqual(
    resultadoDelPuente({ tipo: TIPO_RESULTADO_ACCESO, ok: true, nonce: NONCE, access_token: 'a.b.c', refresh_token: 'r1' }, NONCE),
    { tipo: 'sesion', access_token: 'a.b.c', refresh_token: 'r1' },
  );
  assert.deepEqual(
    resultadoDelPuente({ tipo: TIPO_RESULTADO_ACCESO, ok: false, nonce: NONCE, error: ' Email o contraseña incorrectos. ' }, NONCE),
    { tipo: 'error', error: 'Email o contraseña incorrectos.' },
  );
  assert.deepEqual(resultadoDelPuente({ tipo: TIPO_ENLACE_ENVIADO, nonce: NONCE }, NONCE), { tipo: 'enlace-enviado' });
  // De otro intento, o sin intento en curso: nada.
  assert.equal(resultadoDelPuente({ tipo: TIPO_RESULTADO_ACCESO, ok: true, nonce: 'otro-intento-cualquiera', access_token: 'a', refresh_token: 'r' }, NONCE), null);
  assert.equal(resultadoDelPuente({ tipo: TIPO_ENLACE_ENVIADO, nonce: NONCE }, null), null);
});

test('el widget descarta resultados incompletos o raros', () => {
  const base = { tipo: TIPO_RESULTADO_ACCESO, nonce: NONCE };
  assert.equal(resultadoDelPuente({ ...base, ok: true, access_token: 'a.b.c' }, NONCE), null);
  assert.equal(resultadoDelPuente({ ...base, ok: true, access_token: '', refresh_token: 'r' }, NONCE), null);
  assert.equal(resultadoDelPuente({ ...base, ok: true, access_token: 1, refresh_token: 'r' }, NONCE), null);
  assert.equal(resultadoDelPuente({ ...base, ok: false }, NONCE), null);
  assert.equal(resultadoDelPuente({ ...base, ok: false, error: '   ' }, NONCE), null);
  assert.equal(resultadoDelPuente({ ...base, ok: 'true', access_token: 'a', refresh_token: 'r' }, NONCE), null);
  assert.equal(resultadoDelPuente({ tipo: TIPO_PUENTE_LISTO, nonce: NONCE }, NONCE), null);
  // Un error largo se recorta: es una frase para la alumna.
  const largo = resultadoDelPuente({ ...base, ok: false, error: 'x'.repeat(5_000) }, NONCE);
  assert.equal(largo?.tipo, 'error');
  assert.equal(largo && 'error' in largo ? largo.error.length : 0, 300);
});

test('la sesión de la contraseña del puente: solo método password y posterior a abrirlo', () => {
  const reciente = jwt({ amr: [{ method: 'password', timestamp: seg(ABIERTO_EN + 2_000) }] });
  assert.equal(sesionPorContrasenaDespuesDe(reciente, ABIERTO_EN), true);
  const vieja = jwt({ amr: [{ method: 'password', timestamp: seg(ABIERTO_EN - 3_600_000) }] });
  assert.equal(sesionPorContrasenaDespuesDe(vieja, ABIERTO_EN), false);
  for (const method of ['otp', 'oauth', 'token_refresh', 'anonymous', 'magiclink']) {
    const token = jwt({ amr: [{ method, timestamp: seg(ABIERTO_EN + 1_000) }] });
    assert.equal(sesionPorContrasenaDespuesDe(token, ABIERTO_EN), false, method);
  }
  assert.equal(sesionPorContrasenaDespuesDe('basura', ABIERTO_EN), false);
  assert.equal(sesionPorContrasenaDespuesDe(reciente, Number.NaN), false);
  // Y la del correo sigue sin aceptar una de contraseña (el filtro de siempre).
  assert.equal(sesionAutenticadaPorEmailDespuesDe(reciente, ABIERTO_EN), false);
});

test('la URL del puente lleva el origen de quien la abre y el nonce, escapados', () => {
  const url = new URL(urlPuente('https://www.tentare.app', 'mi estudio', 'https://estudio.example.com', NONCE));
  assert.equal(url.origin, 'https://www.tentare.app');
  assert.equal(url.pathname, '/widget-auth-retorno');
  assert.equal(url.searchParams.get('slug'), 'mi estudio');
  assert.equal(url.searchParams.get('origenEstudio'), 'https://estudio.example.com');
  assert.equal(url.searchParams.get('nonce'), NONCE);
  // Ni el email ni la contraseña viajan nunca en la URL.
  assert.equal([...url.searchParams.keys()].sort().join(','), 'nonce,origenEstudio,slug');
  assert.equal(urlReservarCompleta('https://www.tentare.app', 'a/b'), 'https://www.tentare.app/reservar/a%2Fb');
});

// ── Un dueño por sesión, y nunca la de una cuenta de equipo ─────────────────

const RAIZ = new URL('../../', import.meta.url).pathname;
const leer = (ruta: string) => readFileSync(`${RAIZ}${ruta}`, 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

test('olvidar la sesión del puente borra SOLO sus claves, nunca la del portal de la alumna', () => {
  const guardado = new Map<string, string>([
    [CLAVE_SESION_PUENTE, 'sesion'], [`${CLAVE_SESION_PUENTE}-code-verifier`, 'v'], ['sb-portal-auth', 'la-de-la-alumna'],
  ]);
  const almacen = { removeItem: (k: string) => { guardado.delete(k); } };
  olvidarSesionDelPuente(almacen);
  assert.deepEqual([...guardado.keys()], ['sb-portal-auth']);
  assert.ok(!CLAVES_SESION_PUENTE.some((k) => k.startsWith('sb-portal-auth')));
});

test('olvidar no rompe con el almacenamiento bloqueado o ausente', () => {
  assert.doesNotThrow(() => olvidarSesionDelPuente(null));
  assert.doesNotThrow(() => olvidarSesionDelPuente({ removeItem: () => { throw new Error('SecurityError'); } }));
});

test('la cuenta: solo un 200 con `equipo: false` explícito deja entregar la sesión', () => {
  assert.equal(veredictoCuenta(200, { equipo: false }), 'alumna');
  assert.equal(veredictoCuenta(200, { equipo: true }), 'equipo');
  for (const [status, cuerpo] of [
    [200, {}], [200, { equipo: 'false' }], [200, { equipo: 0 }], [200, null], [200, 'ok'],
    [401, { equipo: false }], [500, { equipo: false }], [503, null], [0, null],
  ] as const) {
    assert.equal(veredictoCuenta(status, cuerpo), 'sin-respuesta', `${status} ${JSON.stringify(cuerpo)}`);
  }
});

test('el widget distingue el «no» por cuenta de equipo de cualquier otro error', () => {
  const nonce = 'nonce-del-intento-0001';
  assert.deepEqual(
    resultadoDelPuente({ tipo: TIPO_RESULTADO_ACCESO, nonce, ok: false, error: MENSAJE_CUENTA_DE_EQUIPO, motivo: MOTIVO_CUENTA_DE_EQUIPO }, nonce),
    { tipo: 'error', error: MENSAJE_CUENTA_DE_EQUIPO, motivo: MOTIVO_CUENTA_DE_EQUIPO },
  );
  // Un motivo desconocido no se cuela: queda como error a secas.
  assert.deepEqual(
    resultadoDelPuente({ tipo: TIPO_RESULTADO_ACCESO, nonce, ok: false, error: 'x', motivo: 'otro' }, nonce),
    { tipo: 'error', error: 'x' },
  );
  // Y un «ok» con motivo sigue necesitando sus dos tokens.
  assert.equal(resultadoDelPuente({ tipo: TIPO_RESULTADO_ACCESO, nonce, ok: true, motivo: MOTIVO_CUENTA_DE_EQUIPO }, nonce), null);
  assert.notEqual(ERROR_COMPROBAR_CUENTA, MENSAJE_CUENTA_DE_EQUIPO);
});

test('la ventana del puente no importa el cliente del portal, ni la raíz le monta los providers que lo traen', () => {
  for (const f of ['app/widget-auth-retorno/page.tsx', 'app/widget-auth-retorno/cliente.tsx', 'app/widget-auth-retorno/clientes-auth.ts']) {
    assert.doesNotMatch(leer(f), /supabase-portal|supabasePortal/, f);
  }
  // Lo único que importa y podría traerlo: el código del correo, que lo carga al usarlo, no al importarse.
  assert.doesNotMatch(leer('lib/student/codigo-del-correo.ts'), /^import[^;]*supabase-portal/m);
  // La raíz no le monta AuthProvider/StudioProvider (cargan el del portal por debajo).
  assert.match(leer('components/raiz/proveedores-raiz.tsx'), /if \(sinProveedoresDeSesion\(pathname\)\) return/);
  // Y si algo lo trajera, no recoge la vuelta del correo en esta página: la condición exacta.
  assert.match(leer('lib/db/supabase-portal.ts'),
    /detectSessionInUrl:[^,]*&& !\(typeof window !== 'undefined' && window\.location\.pathname === '\/widget-auth-retorno'\)/);
});

test('el cliente del correo del puente guarda con SU clave y no refresca nunca', () => {
  const src = leer('app/widget-auth-retorno/clientes-auth.ts');
  assert.match(src, /storageKey:\s*CLAVE_SESION_PUENTE/);
  assert.doesNotMatch(src, /autoRefreshToken:\s*true/);
  assert.doesNotMatch(src, /sb-portal-auth/);
});

test('la ventana pregunta al servidor antes de entregar, y no cierra con signOut la sesión que SÍ entrega', () => {
  const src = leer('app/widget-auth-retorno/cliente.tsx');
  assert.ok(src.includes('RUTA_CUENTA_DE_EQUIPO'));
  assert.equal(RUTA_CUENTA_DE_EQUIPO, '/api/auth/cuenta-de-equipo');
  // El único `ok: true` hacia el widget va DESPUÉS de comprobar la cuenta.
  const comprobacion = src.indexOf('await comprobarCuenta(');
  const entrega = src.indexOf('ok: true, access_token');
  assert.ok(comprobacion > 0 && entrega > comprobacion, 'la entrega tiene que ir tras comprobarCuenta');
  assert.equal(src.split('ok: true, access_token').length - 1, 1, 'una sola salida de sesión');
  // El único cierre es el del «no»: el token rechazado, y solo esa sesión (`local`).
  const cierres = [...src.matchAll(/\.signOut\(([^)]*)\)/g)].map((m) => m[1]);
  assert.deepEqual(cierres, ["session.access_token, 'local'"]);
  // Y sin haber hablado con el widget de este intento, no se entrega.
  assert.match(src, /!conWidget/);
});
