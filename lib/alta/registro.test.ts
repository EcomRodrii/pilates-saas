import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { VERSION_TEXTOS_LEGALES } from '../legal-info.ts';
import {
  borradorDesdeTexto,
  contrasenaFacil,
  distancia,
  errorDeCampo,
  iniciales,
  mensajeDeErrorAlta,
  metadataDelAlta,
  primerCampoConError,
  reglasContrasena,
  slugPrevisto,
  sugerirEmail,
  versionDelAlta,
  type DatosRegistro,
} from './registro.ts';

const BIEN: DatosRegistro = { nombre: 'Estudio Alba Pilates', email: 'prueba-tentare@example.com', contrasena: 'mi perro come peras' };

// ── El interruptor ───────────────────────────────────────────────────────────

test('ALTA_NUEVA_REGISTRO=on: todo el mundo ve el alta nueva, con o sin parámetro', () => {
  assert.equal(versionDelAlta('on', undefined), 'v2');
  assert.equal(versionDelAlta(' on ', 'nueva'), 'v2');
  assert.equal(versionDelAlta('on', 'otra'), 'v2');
});

test('ALTA_NUEVA_REGISTRO=prueba: solo con ?alta=nueva, y marcada como prueba', () => {
  assert.equal(versionDelAlta('prueba', 'nueva'), 'v2_prueba');
  assert.equal(versionDelAlta('prueba', ['nueva', 'x']), 'v2_prueba');
  // Sin el parámetro (o con otro valor), el alta de siempre, idéntica.
  assert.equal(versionDelAlta('prueba', undefined), null);
  assert.equal(versionDelAlta('prueba', ''), null);
  assert.equal(versionDelAlta('prueba', 'NUEVA'), null);
});

test('apagado (o cualquier otra cosa): el alta de siempre, también con ?alta=nueva', () => {
  for (const valor of [undefined, '', 'off', 'ON', 'true', '1', 'estudios:st-1', 'prueba,on']) {
    assert.equal(versionDelAlta(valor, 'nueva'), null, String(valor));
  }
});

// ── Validación campo a campo ────────────────────────────────────────────────

test('con los tres campos bien no hay nada que decir', () => {
  for (const c of ['nombre', 'email', 'contrasena'] as const) assert.equal(errorDeCampo(c, BIEN), '', c);
  assert.equal(primerCampoConError(BIEN), null);
});

test('el nombre: al menos 2 letras, y no más de lo que cabe', () => {
  assert.equal(errorDeCampo('nombre', { ...BIEN, nombre: '' }), 'Escribe el nombre de tu estudio: al menos 2 letras.');
  assert.equal(errorDeCampo('nombre', { ...BIEN, nombre: '  A  ' }), 'Escribe el nombre de tu estudio: al menos 2 letras.');
  assert.match(errorDeCampo('nombre', { ...BIEN, nombre: 'x'.repeat(121) }), /demasiado largo/);
  assert.equal(errorDeCampo('nombre', { ...BIEN, nombre: 'Om' }), '');
});

test('el email: vacío y mal escrito se dicen distinto', () => {
  assert.equal(errorDeCampo('email', { ...BIEN, email: '' }), 'Escribe tu email: ahí te llega el código.');
  const falta = 'A este email le falta algo. Revisa la @ y el final, como en nombre@example.com.';
  for (const e of ['lucia', 'prueba-tentare@', 'prueba-tentare@gmail', 'prueba-tentare@gmail.c', 'prueba tentare@gmail.com']) {
    assert.equal(errorDeCampo('email', { ...BIEN, email: e }), falta, e);
  }
  assert.equal(errorDeCampo('email', { ...BIEN, email: '  prueba-tentare@example.com ' }), '');
});

test('la contraseña: corta primero, fácil después', () => {
  assert.equal(errorDeCampo('contrasena', { ...BIEN, contrasena: '1234' }), 'Usa 8 caracteres o más.');
  assert.equal(errorDeCampo('contrasena', { ...BIEN, contrasena: '12345678' }),
    'Es fácil de adivinar. Prueba con una frase corta que recuerdes.');
  assert.equal(primerCampoConError({ ...BIEN, email: 'x', contrasena: '1' }), 'email');
});

// ── Contraseña fácil ────────────────────────────────────────────────────────

test('fácil: las de siempre, un carácter repetido y las escaleras de cifras', () => {
  for (const c of ['12345678', 'Password', 'contraseña', 'qwerty123', 'aaaaaaaa', '00000000', '23456789', '98765432', 'Pilates123']) {
    assert.equal(contrasenaFacil(c, 'Estudio Norte'), true, c);
  }
});

test('fácil: el nombre del estudio con números o signos, o un trozo de él', () => {
  const nombre = 'Estudio Alba Pilates';
  for (const c of ['EstudioAlba2026', 'estudio-alba!', 'albapilates', 'Pilates!!!!', 'ESTUDIOALBAPILATES2026', 'estudíoalba1']) {
    assert.equal(contrasenaFacil(c, nombre), true, c);
  }
});

test('no es fácil una frase cualquiera, ni una palabra que solo contiene un nombre corto', () => {
  assert.equal(contrasenaFacil('mi perro come peras', 'Estudio Alba Pilates'), false);
  assert.equal(contrasenaFacil('estudiante2024!', 'Estudio Alba Pilates'), false);
  // «alba» está dentro de «albaricoque»: eso no es poner el nombre del estudio.
  assert.equal(contrasenaFacil('albaricoque99', 'Alba'), false);
  assert.equal(contrasenaFacil('alba2026', 'Alba'), true);
  // Un nombre de menos de 4 letras no cuenta (cualquier palabra lo contendría).
  assert.equal(contrasenaFacil('omnipresente', 'Om'), false);
});

test('las dos casillas se marcan con lo mismo que decide el error', () => {
  assert.deepEqual(reglasContrasena('', 'Alba'), { largo: false, dificil: false });
  assert.deepEqual(reglasContrasena('12345678', 'Alba'), { largo: true, dificil: false });
  assert.deepEqual(reglasContrasena('mi perro come peras', 'Alba'), { largo: true, dificil: true });
});

// ── «¿Querías decir…?» ──────────────────────────────────────────────────────

test('sugiere el dominio bueno para las erratas de siempre, sin tocar lo de delante', () => {
  assert.equal(sugerirEmail('prueba-tentare.alba@gmial.com'), 'prueba-tentare.alba@gmail.com');
  assert.equal(sugerirEmail('Prueba-Tentare@Hotmail.con'), 'Prueba-Tentare@hotmail.com');
  assert.equal(sugerirEmail('prueba-tentare@gmailcom'), 'prueba-tentare@gmail.com');
  assert.equal(sugerirEmail('prueba-tentare@gmail.co'), 'prueba-tentare@gmail.com');
  assert.equal(sugerirEmail('prueba-tentare@outlok.es'), 'prueba-tentare@outlook.es');
  assert.equal(sugerirEmail('prueba-tentare@icloud.cmo'), 'prueba-tentare@icloud.com');
  assert.equal(sugerirEmail('prueba-tentare@yaho.es'), 'prueba-tentare@yahoo.es');
  assert.equal(sugerirEmail('  prueba-tentare@gmal.com  '), 'prueba-tentare@gmail.com');
});

test('no sugiere nada para un dominio bueno, uno de ejemplo o uno que no se parece', () => {
  for (const e of [
    'prueba-tentare@gmail.com', 'prueba-tentare@hotmail.es', 'prueba-tentare@me.com',
    // Reales y parecidos a uno de la lista: no son erratas.
    'prueba-tentare@mac.com', 'prueba-tentare@yahoo.fr', 'prueba-tentare@gmx.es', 'prueba-tentare@hotmail.fr',
    'prueba-tentare@example.com', 'prueba-tentare@sub.example.org', 'prueba-tentare@prueba.invalid',
    'prueba-tentare@estudioalba.es', 'prueba-tentare@pilatesnorte.com',
    'lucia', 'prueba-tentare@', '', '@gmial.com',
  ]) {
    assert.equal(sugerirEmail(e), null, e);
  }
});

test('con un dominio corto solo se sugiere a una letra: dos ya convierten cualquier cosa en otra', () => {
  assert.equal(sugerirEmail('prueba-tentare@me.co'), 'prueba-tentare@me.com');
  assert.equal(sugerirEmail('prueba-tentare@mo.cm'), null);
});

test('la distancia de edición', () => {
  assert.equal(distancia('gmail.com', 'gmail.com'), 0);
  assert.equal(distancia('gmial.com', 'gmail.com'), 2);
  assert.equal(distancia('gmailcom', 'gmail.com'), 1);
  assert.equal(distancia('', 'abc'), 3);
});

// ── Lo que dice gotrue ──────────────────────────────────────────────────────

test('un error crudo del servidor se dice en castellano; lo que ya lo está, se deja', () => {
  assert.match(mensajeDeErrorAlta('{}'), /No hemos podido crear tu cuenta/);
  assert.match(mensajeDeErrorAlta(''), /No hemos podido crear tu cuenta/);
  assert.match(mensajeDeErrorAlta('Error sending confirmation email'), /No hemos podido mandarte el código/);
  const bueno = 'Ya hay una cuenta con ese email. Inicia sesión, o usa «he olvidado mi contraseña».';
  assert.equal(mensajeDeErrorAlta(bueno), bueno);
});

// ── Su página, mientras escribe ─────────────────────────────────────────────

test('la dirección base sale del mismo slugify que el alta, y sin nombre es un ejemplo', () => {
  assert.equal(slugPrevisto('Estudio Alba Pilates'), 'estudio-alba-pilates');
  assert.equal(slugPrevisto('Pilates Málaga'), 'pilates-malaga');
  assert.equal(slugPrevisto('   '), 'tu-estudio');
  assert.equal(slugPrevisto('!!!'), 'estudio');
});

test('las iniciales de la vista previa no cuentan «de», «la»…', () => {
  assert.equal(iniciales('Estudio Alba Pilates'), 'EA');
  assert.equal(iniciales('La Casa del Pilates'), 'CP');
  assert.equal(iniciales('Om'), 'O');
  assert.equal(iniciales(''), 'TE');
});

// ── Lo que viaja en el signUp ───────────────────────────────────────────────

test('la metadata: alta_nueva PLANA, el estudio en pending_studio y nada de la persona', () => {
  const m = metadataDelAlta({ nombre: '  Estudio Alba  ', version: 'v2_prueba', llegada: ' Precio ', condicionesVersion: '2026-10-06' });
  assert.deepEqual(m, {
    alta_nueva: true,
    pending_studio: { nombre: 'Estudio Alba', plan: 'BASE', version: 'v2_prueba', llegada: 'precio', condiciones_version: '2026-10-06' },
  });
  // La plantilla del correo lee `.Data.alta_nueva`: tiene que estar arriba, no dentro.
  assert.equal((m as unknown as Record<string, unknown>).alta_nueva, true);
  // Ni nombre de persona ni ciudad: pasan al paso 3.
  assert.equal('nombre' in m, false);
  assert.equal('ciudad' in m.pending_studio, false);
});

test('una llegada que la base no aceptaría no viaja', () => {
  for (const llegada of [null, undefined, '', 'Hola mundo!', 'x'.repeat(81), 42]) {
    const m = metadataDelAlta({ nombre: 'Estudio', version: 'v2', llegada, condicionesVersion: '2026-10-06' });
    assert.equal('llegada' in m.pending_studio, false, String(llegada));
  }
});

// ── El borrador ─────────────────────────────────────────────────────────────

test('el borrador se lee campo a campo, caduca a los 7 días y nunca trae contraseña', () => {
  const ahora = Date.parse('2026-10-21T10:00:00Z');
  const guardado = (x: Record<string, unknown>) => JSON.stringify({ guardadoEn: ahora - 1000, ...x });
  assert.deepEqual(borradorDesdeTexto(guardado({ nombre: 'Alba', email: 'a@example.com', contrasena: 'secreta' }), ahora),
    { nombre: 'Alba', email: 'a@example.com' });
  assert.equal(borradorDesdeTexto(JSON.stringify({ nombre: 'Alba', guardadoEn: ahora - 8 * 86_400_000 }), ahora), null);
  assert.equal(borradorDesdeTexto('{roto', ahora), null);
  assert.equal(borradorDesdeTexto(guardado({ nombre: 5, email: { a: 1 } }), ahora), null);
  assert.equal(borradorDesdeTexto(guardado({ nombre: 'x'.repeat(500) }), ahora)?.nombre.length, 120);
});

// ── La migración de las condiciones dice lo mismo que este fichero ───────────

const MIGRACION = readFileSync(new URL('../../supabase/migrations/20261021102626_altas_estudio_condiciones.sql', import.meta.url), 'utf8');

test('la versión de los textos que manda el alta es la que acepta la base', () => {
  // El mismo patrón en el CHECK y en el trigger, y la versión de hoy lo cumple.
  const patrones = [...MIGRACION.matchAll(/'\^(20\[0-9\][^']+)'/g)].map((m) => m[1]);
  assert.ok(patrones.length >= 2, 'el CHECK y el trigger validan el formato');
  assert.equal(new Set(patrones).size, 1, 'el CHECK y el trigger usan el mismo patrón');
  const re = new RegExp(`^${patrones[0]}`);
  assert.match(VERSION_TEXTOS_LEGALES, re);
  for (const malo of ['6 de octubre de 2026', '2026-13-01', '2026-10-32', '1999-01-01']) assert.doesNotMatch(malo, re, malo);
  assert.equal(metadataDelAlta({ nombre: 'x', version: 'v2', llegada: null, condicionesVersion: VERSION_TEXTOS_LEGALES })
    .pending_studio.condiciones_version, VERSION_TEXTOS_LEGALES);
});

test('⚠️ el trigger de auth.users conserva su EXCEPTION, la normalización y el on conflict', () => {
  const ini = MIGRACION.indexOf('function public.altas_estudio_registrar_cuenta');
  const cuerpo = MIGRACION.slice(ini, MIGRACION.indexOf('$$;', ini));
  assert.match(cuerpo, /exception when others then/i);
  assert.match(cuerpo, /return new;/);
  assert.match(cuerpo, /if v_version not in \('v1', 'v2', 'v2_prueba'\) then\s+v_version := 'v1';/);
  assert.match(cuerpo, /v_llegada !~ '\^\[a-z0-9\/_\.-\]\{1,80\}\$'/);
  assert.match(cuerpo, /on conflict \(auth_user_id\) do nothing;/);
  // La fecha solo con versión, y sin un cast que pueda lanzar.
  assert.match(cuerpo, /case when v_condiciones is not null then coalesce\(new\.created_at, now\(\)\) end/);
  assert.doesNotMatch(cuerpo, /::date/);
});

test('la función sigue siendo solo de service_role, con los tres pasos y su comprobación', () => {
  assert.match(MIGRACION, /revoke execute on function public\.altas_estudio_registrar_cuenta\(\) from public, anon, authenticated;/);
  assert.match(MIGRACION, /grant execute on function public\.altas_estudio_registrar_cuenta\(\) to service_role;/);
  assert.match(MIGRACION, /has_function_privilege\(r, t, 'EXECUTE'\)/);
  assert.match(MIGRACION, /has_function_privilege\('service_role', t, 'EXECUTE'\)/);
  assert.doesNotMatch(MIGRACION, /create policy/i);
});
