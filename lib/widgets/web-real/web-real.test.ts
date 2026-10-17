import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import assert from 'node:assert/strict';
import { DestinoNoPermitido } from '../../api-publica/webhooks/destino.ts';
import { decidirEnmarcable, mismoSitio, variantesDeHost, type Cabeceras } from './decision.ts';
import {
  MAX_REDIRECCIONES, consultarEnmarcable, peticionSegura, type PeticionDeCabeceras, type RespuestaDeCabeceras,
} from './consulta.ts';
import {
  CacheWebReal, TTL_DEFINITIVO_MS, TTL_SIN_SABER_MS, elegirOrigen, resolverWebReal,
} from './servicio.ts';
import { firmarPermisoWebReal, verificarPermisoWebReal } from './token.ts';
import { firmarSinRomper, leerPermisoSinRomper } from './permiso-seguro.ts';
import { SANDBOX_DE_SU_WEB, cabecerasDelMarco, htmlDelMarco, origenesDelMarco, politicaDelMarco } from './marco-html.ts';

const NUESTRO = 'https://www.tentare.app';
const decide = (estadoHttp: number, cabeceras: Cabeceras = {}) => decidirEnmarcable({ estadoHttp, cabeceras, nuestroOrigen: NUESTRO });

// ── La decisión: cabeceras → se deja o no ────────────────────────────────────

test('sin cabeceras de marco, se deja; con `X-Frame-Options`, no (DENY, SAMEORIGIN, ALLOW-FROM, o un valor raro)', () => {
  assert.deepEqual(decide(200), { ok: true });
  for (const v of ['DENY', 'deny', 'SAMEORIGIN', 'ALLOW-FROM https://www.tentare.app', 'ALLOWALL', 'DENY, SAMEORIGIN']) {
    assert.deepEqual(decide(200, { 'x-frame-options': v }), { ok: false, motivo: 'x-frame-options' }, v);
  }
  assert.deepEqual(decide(200, { 'x-frame-options': ['SAMEORIGIN', 'DENY'] }), { ok: false, motivo: 'x-frame-options' });
});

test('`frame-ancestors`: \'none\' y \'self\' no; una lista, solo si nombra NUESTRO origen (o `*`)', () => {
  const csp = (v: string) => decide(200, { 'content-security-policy': v });
  assert.deepEqual(csp("frame-ancestors 'none'"), { ok: false, motivo: 'frame-ancestors' });
  assert.deepEqual(csp("frame-ancestors 'self'"), { ok: false, motivo: 'frame-ancestors' });
  assert.deepEqual(csp('frame-ancestors https://otraweb.com'), { ok: false, motivo: 'frame-ancestors' });
  assert.deepEqual(csp('frame-ancestors'), { ok: false, motivo: 'frame-ancestors' });
  assert.deepEqual(csp("frame-ancestors 'self' https://www.tentare.app"), { ok: true });
  assert.deepEqual(csp('frame-ancestors https://*.tentare.app'), { ok: true });
  assert.deepEqual(csp('frame-ancestors *'), { ok: true });
  assert.deepEqual(csp('frame-ancestors https:'), { ok: true });
  // Un `*.` no casa con el dominio pelado, y un puerto distinto tampoco.
  assert.deepEqual(decidirEnmarcable({ estadoHttp: 200, cabeceras: { 'content-security-policy': 'frame-ancestors https://*.tentare.app' }, nuestroOrigen: 'https://tentare.app' }), { ok: false, motivo: 'frame-ancestors' });
  assert.deepEqual(csp('frame-ancestors https://www.tentare.app:8443'), { ok: false, motivo: 'frame-ancestors' });
  // Sin `frame-ancestors` la política no dice nada de marcos: se deja.
  assert.deepEqual(csp("default-src 'self'; img-src *"), { ok: true });
  // Con otras directivas delante o detrás, se lee igual.
  assert.deepEqual(csp("default-src 'self'; frame-ancestors 'none'; img-src *"), { ok: false, motivo: 'frame-ancestors' });
});

test('varias políticas: mandan TODAS; y `X-Frame-Options` y CSP a la vez, las dos', () => {
  assert.deepEqual(decide(200, { 'content-security-policy': "frame-ancestors *, frame-ancestors 'none'" }), { ok: false, motivo: 'frame-ancestors' });
  assert.deepEqual(decide(200, { 'content-security-policy': ['frame-ancestors *', "frame-ancestors 'self'"] }), { ok: false, motivo: 'frame-ancestors' });
  assert.deepEqual(decide(200, { 'content-security-policy': ['frame-ancestors *', 'frame-ancestors https://www.tentare.app'] }), { ok: true });
  assert.deepEqual(decide(200, { 'content-security-policy': 'frame-ancestors *', 'x-frame-options': 'DENY' }), { ok: false, motivo: 'x-frame-options' });
  // `Report-Only` no impide nada: no se mira.
  assert.deepEqual(decide(200, { 'content-security-policy-report-only': "frame-ancestors 'none'" }), { ok: true });
});

test('una respuesta que no es 2xx no es un permiso (es «no se sabe»)', () => {
  for (const s of [0, 199, 301, 403, 404, 500]) assert.deepEqual(decide(s), { ok: false, motivo: 'respuesta' }, String(s));
  assert.deepEqual(decidirEnmarcable({ estadoHttp: 200, cabeceras: {}, nuestroOrigen: 'no es una url' }), { ok: false, motivo: 'respuesta' });
});

test('`x.com` y `www.x.com` son el mismo sitio, y ninguno más', () => {
  assert.deepEqual(variantesDeHost('Pilates.com'), ['pilates.com', 'www.pilates.com']);
  assert.deepEqual(variantesDeHost('www.pilates.com'), ['www.pilates.com', 'pilates.com']);
  assert.equal(mismoSitio('pilates.com', 'www.pilates.com'), true);
  assert.equal(mismoSitio('www.pilates.com', 'pilates.com.'), true);
  assert.equal(mismoSitio('pilates.com', 'otra.pilates.com'), false);
  assert.equal(mismoSitio('pilates.com', 'pilates.com.evil.example'), false);
  assert.equal(mismoSitio('pilates.com', 'evilpilates.com'), false);
});

// ── La consulta: HEAD/GET, redirecciones y IP ────────────────────────────────

type Paso = RespuestaDeCabeceras | Error;
/** Una «red» de mentira: responde lo que se le diga, por orden, y apunta qué se pidió. */
function red(pasos: Paso[]) {
  const pedidas: { url: string; metodo: string }[] = [];
  const peticion: PeticionDeCabeceras = async ({ url, metodo }) => {
    pedidas.push({ url: url.href, metodo });
    const p = pasos.shift();
    if (!p) throw new Error('se pidió más de lo previsto');
    if (p instanceof Error) throw p;
    return p;
  };
  return { peticion, pedidas };
}
const ok = (cabeceras: Cabeceras = {}): RespuestaDeCabeceras => ({ estadoHttp: 200, cabeceras });
const salto = (location: string, estadoHttp = 301): RespuestaDeCabeceras => ({ estadoHttp, cabeceras: { location } });
const consulta = (origen: string, pasos: Paso[], extra: { totalMs?: number; ahora?: () => number } = {}) => {
  const r = red(pasos);
  return consultarEnmarcable(origen, NUESTRO, { peticion: r.peticion, ...extra }).then(res => ({ res, pedidas: r.pedidas }));
};

test('se deja: un HEAD a `https://host/` con 200 y sin cabeceras de marco', async () => {
  const { res, pedidas } = await consulta('https://www.pilatescentro.com', [ok()]);
  assert.deepEqual(res, { tipo: 'enmarcable' });
  assert.deepEqual(pedidas, [{ url: 'https://www.pilatescentro.com/', metodo: 'HEAD' }]);
});

test('no se deja: `X-Frame-Options` o `frame-ancestors` (con control: sin ellas, sí)', async () => {
  assert.deepEqual((await consulta('https://x.com', [ok({ 'x-frame-options': 'SAMEORIGIN' })])).res, { tipo: 'no-enmarcable', motivo: 'x-frame-options' });
  assert.deepEqual((await consulta('https://x.com', [ok({ 'content-security-policy': "frame-ancestors 'none'" })])).res, { tipo: 'no-enmarcable', motivo: 'frame-ancestors' });
  assert.deepEqual((await consulta('https://x.com', [ok({ 'content-security-policy': "default-src 'self'" })])).res, { tipo: 'enmarcable' });
});

test('si el HEAD no vale (405, 403…), se pide un GET con las mismas reglas; si vale, no hay GET', async () => {
  const conGet = await consulta('https://x.com', [{ estadoHttp: 405, cabeceras: {} }, ok({ 'x-frame-options': 'DENY' })]);
  assert.deepEqual(conGet.res, { tipo: 'no-enmarcable', motivo: 'x-frame-options' });
  assert.deepEqual(conGet.pedidas.map(p => p.metodo), ['HEAD', 'GET']);
  const sinGet = await consulta('https://x.com', [ok()]);
  assert.deepEqual(sinGet.pedidas.map(p => p.metodo), ['HEAD']);
  // Si ni el GET contesta bien, no se sabe.
  assert.deepEqual((await consulta('https://x.com', [{ estadoHttp: 503, cabeceras: {} }, { estadoHttp: 503, cabeceras: {} }])).res, { tipo: 'sin-saber', motivo: 'respuesta' });
});

test('redirecciones DENTRO del mismo sitio (con y sin www, a otra ruta) se siguen, y se decide con la última', async () => {
  const { res, pedidas } = await consulta('https://pilatescentro.com', [
    salto('https://www.pilatescentro.com/'), salto('/es/', 302), ok(),
  ]);
  assert.deepEqual(res, { tipo: 'enmarcable' });
  assert.deepEqual(pedidas.map(p => p.url), ['https://pilatescentro.com/', 'https://www.pilatescentro.com/', 'https://www.pilatescentro.com/es/']);
  // Y la decisión es la de la ÚLTIMA página.
  const prohibida = await consulta('https://pilatescentro.com', [salto('https://www.pilatescentro.com/'), ok({ 'x-frame-options': 'DENY' })]);
  assert.deepEqual(prohibida.res, { tipo: 'no-enmarcable', motivo: 'x-frame-options' });
});

test('⚠️ un salto a OTRO sitio no se sigue: «no se puede enmarcar», sin pedirle nada (ni a un subdominio, ni a una IP)', async () => {
  for (const destino of ['https://otraweb.com/', 'https://blog.pilatescentro.com/', 'https://pilatescentro.com.evil.example/', 'https://10.0.0.5/', 'https://169.254.169.254/latest/meta-data']) {
    const { res, pedidas } = await consulta('https://pilatescentro.com', [salto(destino), ok()]);
    assert.deepEqual(res, { tipo: 'no-enmarcable', motivo: 'otro-sitio' }, destino);
    assert.equal(pedidas.length, 1, `se siguió el salto a ${destino}`);
  }
  // Ni bajando a http, ni con otro puerto, ni con credenciales.
  for (const destino of ['http://pilatescentro.com/', 'https://pilatescentro.com:8443/', 'https://u:p@pilatescentro.com/']) {
    const { res, pedidas } = await consulta('https://pilatescentro.com', [salto(destino), ok()]);
    assert.deepEqual(res, { tipo: 'no-enmarcable', motivo: 'otro-sitio' }, destino);
    assert.equal(pedidas.length, 1, destino);
  }
});

test('el tope de redirecciones: tres se siguen; a la cuarta, no se sabe', async () => {
  assert.equal(MAX_REDIRECCIONES, 3);
  const ida = (n: number) => Array.from({ length: n }, (_, i) => salto(`https://www.x.com/${i + 1}`));
  assert.deepEqual((await consulta('https://x.com', [...ida(3), ok()])).res, { tipo: 'enmarcable' });
  const cuatro = await consulta('https://x.com', [...ida(4), ok()]);
  assert.deepEqual(cuatro.res, { tipo: 'sin-saber', motivo: 'respuesta' });
  assert.equal(cuatro.pedidas.length, 4);
  // Una redirección sin destino, o con un destino roto, tampoco se sabe.
  assert.deepEqual((await consulta('https://x.com', [{ estadoHttp: 301, cabeceras: {} }])).res, { tipo: 'sin-saber', motivo: 'respuesta' });
  assert.deepEqual((await consulta('https://x.com', [salto('http://[roto')])).res, { tipo: 'sin-saber', motivo: 'respuesta' });
});

test('⚠️ la IP se comprueba EN CADA SALTO: una IP privada en el segundo salto corta la consulta', async () => {
  // El primer salto es del mismo sitio, pero el segundo resuelve a una dirección interna (DNS rebinding):
  // la petición de verdad lo rechaza al conectar y la consulta termina en «no se sabe».
  const { res, pedidas } = await consulta('https://pilatescentro.com', [salto('https://www.pilatescentro.com/'), new DestinoNoPermitido(), ok()]);
  assert.deepEqual(res, { tipo: 'sin-saber', motivo: 'privada' });
  assert.equal(pedidas.length, 2);
  // Y en la primera, igual.
  assert.deepEqual((await consulta('https://pilatescentro.com', [new DestinoNoPermitido()])).res, { tipo: 'sin-saber', motivo: 'privada' });
});

test('sin respuesta, sin red, sin tiempo o sin https: no se sabe, y se dice por qué en categorías', async () => {
  const tiempo = Object.assign(new Error('x'), { code: 'TIEMPO' });
  assert.deepEqual((await consulta('https://x.com', [tiempo])).res, { tipo: 'sin-saber', motivo: 'tiempo' });
  assert.deepEqual((await consulta('https://x.com', [Object.assign(new Error('x'), { code: 'ENOTFOUND' })])).res, { tipo: 'sin-saber', motivo: 'red' });
  for (const origen of ['http://x.com', 'https://x.com:8443', 'https://u:p@x.com', 'no es una url', 'ftp://x.com']) {
    const { res, pedidas } = await consulta(origen, [ok()]);
    assert.deepEqual(res, { tipo: 'sin-saber', motivo: 'protocolo' }, origen);
    assert.equal(pedidas.length, 0, `se pidió algo a ${origen}`);
  }
});

test('el tiempo máximo es de TODA la consulta, no de cada petición', async () => {
  let t = 1_000;
  const pasos: Paso[] = [salto('https://www.x.com/'), salto('https://x.com/'), ok()];
  const vistos: number[] = [];
  const peticion: PeticionDeCabeceras = async ({ timeoutMs }) => {
    vistos.push(timeoutMs);
    t += 3_000;
    const p = pasos.shift()!;
    if (p instanceof Error) throw p;
    return p;
  };
  const r = await consultarEnmarcable('https://x.com', NUESTRO, { peticion, ahora: () => t, totalMs: 8_000 });
  // 8 s, luego 5, luego 2: lo que queda; a la tercera aún quedaban 2 s y respondió.
  assert.deepEqual(vistos, [8_000, 5_000, 2_000]);
  assert.deepEqual(r, { tipo: 'enmarcable' });
  // Sin tiempo para otra, se corta.
  const cortada = await consultarEnmarcable('https://x.com', NUESTRO, { peticion: async () => { t += 9_000; return salto('https://www.x.com/'); }, ahora: () => t, totalMs: 8_000 });
  assert.deepEqual(cortada, { tipo: 'sin-saber', motivo: 'tiempo' });
});

test('la petición de verdad rechaza lo privado SIN tocar la red (IP literal y nombres locales)', async () => {
  const pide = (u: string) => peticionSegura({ url: new URL(u), metodo: 'HEAD', timeoutMs: 2_000 });
  for (const u of ['https://127.0.0.1/', 'https://10.0.0.5/', 'https://169.254.169.254/', 'https://[::1]/', 'http://example.com/']) {
    await assert.rejects(pide(u), DestinoNoPermitido, u);
  }
  // `localhost` resuelve a 127.0.0.1: el `lookup` seguro lo rechaza al conectar.
  await assert.rejects(pide('https://localhost/'), DestinoNoPermitido);
});

// ── El servicio: sin web no se hace nada; caché y tope ───────────────────────

function entorno(consultas: ResultadoConsultaFalsa[] = [{ tipo: 'enmarcable' }]) {
  let t = 5_000_000;
  const cache = new CacheWebReal(() => t);
  const hechas: string[] = [];
  let topes = 0;
  let hayTope = true;
  const cola = [...consultas];
  return {
    cache, hechas,
    avanzar: (ms: number) => { t += ms; },
    topes: () => topes,
    sinTope: () => { hayTope = false; },
    resolver: (x: { dominios: string[]; forzar?: boolean; studioId?: string }) => resolverWebReal(
      { studioId: x.studioId ?? 'est-1', dominios: x.dominios, forzar: !!x.forzar, nuestroOrigen: NUESTRO },
      {
        cache,
        tope: async () => { topes += 1; return hayTope; },
        consultar: async (origen) => { hechas.push(origen); return cola.shift() ?? { tipo: 'enmarcable' }; },
      },
    ),
  };
}
type ResultadoConsultaFalsa = Awaited<ReturnType<typeof consultarEnmarcable>>;

test('⚠️ sin web autorizada no se hace NADA: ni consulta, ni tope, ni caché (y con una que no se puede consultar, tampoco)', async () => {
  const e = entorno();
  assert.deepEqual(await e.resolver({ dominios: [] }), { estado: 'sin-dominio' });
  assert.deepEqual(await e.resolver({ dominios: ['http://localhost'] }), { estado: 'sin-saber' });
  assert.deepEqual(await e.resolver({ dominios: ['https://x.com:8443'] }), { estado: 'sin-saber' });
  assert.deepEqual(e.hechas, []);
  assert.equal(e.topes(), 0);
  assert.equal(e.cache.tamano, 0);
});

test('la web que se mira es la PRIMERA autorizada que se puede consultar, tal como está guardada', () => {
  assert.equal(elegirOrigen(['https://www.pilatescentro.com', 'https://otra.com']), 'https://www.pilatescentro.com');
  assert.equal(elegirOrigen(['http://localhost', 'https://x.com:8443', 'https://buena.com']), 'https://buena.com');
  assert.equal(elegirOrigen(['http://localhost']), null);
  assert.equal(elegirOrigen([]), null);
  assert.equal(elegirOrigen(['no es un origen', 'https://*.x.com']), null);
});

test('caché: la misma web, una hora; sin repetir consulta ni gastar tope; otra web o un estudio distinto, consulta nueva', async () => {
  const e = entorno([{ tipo: 'enmarcable' }, { tipo: 'no-enmarcable', motivo: 'x-frame-options' }, { tipo: 'enmarcable' }]);
  assert.deepEqual(await e.resolver({ dominios: ['https://x.com'] }), { estado: 'se-deja', origen: 'https://x.com' });
  assert.deepEqual(await e.resolver({ dominios: ['https://x.com'] }), { estado: 'se-deja', origen: 'https://x.com' });
  assert.equal(e.hechas.length, 1);
  assert.equal(e.topes(), 1);
  // Otra dirección del mismo estudio: no es lo que hay en caché.
  assert.deepEqual(await e.resolver({ dominios: ['https://otra.com'] }), { estado: 'no-se-deja' });
  // Otro estudio con la misma web: tampoco (la caché es por estudio y dirección).
  assert.deepEqual(await e.resolver({ dominios: ['https://x.com'], studioId: 'est-2' }), { estado: 'se-deja', origen: 'https://x.com' });
  assert.equal(e.hechas.length, 3);
  // Pasada la hora, se vuelve a preguntar.
  e.avanzar(TTL_DEFINITIVO_MS + 1);
  await e.resolver({ dominios: ['https://x.com'] });
  assert.equal(e.hechas.length, 4);
});

test('«no sabemos» solo se guarda 5 minutos: puede ser pasajero y no se machaca', async () => {
  const e = entorno([{ tipo: 'sin-saber', motivo: 'tiempo' }, { tipo: 'enmarcable' }]);
  assert.deepEqual(await e.resolver({ dominios: ['https://x.com'] }), { estado: 'sin-saber' });
  assert.deepEqual(await e.resolver({ dominios: ['https://x.com'] }), { estado: 'sin-saber' });
  assert.equal(e.hechas.length, 1, 'dentro de los 5 minutos no se vuelve a consultar');
  e.avanzar(TTL_SIN_SABER_MS + 1);
  assert.deepEqual(await e.resolver({ dominios: ['https://x.com'] }), { estado: 'se-deja', origen: 'https://x.com' });
  assert.equal(e.hechas.length, 2);
});

test('⚠️ «Probar de nuevo» se salta la caché pero NO el tope: sin tope, no hay consulta', async () => {
  const e = entorno([{ tipo: 'sin-saber', motivo: 'red' }, { tipo: 'enmarcable' }]);
  await e.resolver({ dominios: ['https://x.com'] });
  assert.equal(e.topes(), 1);
  // Reintentar consulta de nuevo (aunque haya caché) y gasta tope…
  assert.deepEqual(await e.resolver({ dominios: ['https://x.com'], forzar: true }), { estado: 'se-deja', origen: 'https://x.com' });
  assert.equal(e.hechas.length, 2);
  assert.equal(e.topes(), 2);
  // …y con el tope agotado no sale ninguna petición, ni con caché ni sin ella.
  e.sinTope();
  assert.deepEqual(await e.resolver({ dominios: ['https://x.com'], forzar: true }), { estado: 'tope' });
  assert.equal(e.hechas.length, 2, 'con el tope agotado se hizo otra consulta');
  const otro = entorno();
  otro.sinTope();
  assert.deepEqual(await otro.resolver({ dominios: ['https://x.com'] }), { estado: 'tope' });
  assert.equal(otro.hechas.length, 0);
  // La caché de antes sigue valiendo sin forzar: no gasta tope.
  assert.deepEqual(await e.resolver({ dominios: ['https://x.com'] }), { estado: 'se-deja', origen: 'https://x.com' });
});

test('la caché tiene tope de tamaño: no crece sin límite', async () => {
  const e = entorno();
  for (let i = 0; i < 520; i++) await e.resolver({ dominios: ['https://x.com'], studioId: `est-${i}` });
  assert.ok(e.cache.tamano <= 500);
});

// ── El permiso firmado ───────────────────────────────────────────────────────

test('el permiso firmado: lleva estudio y origen, caduca, y cualquier retoque lo invalida', () => {
  process.env.HOME_PREVIEW_TOKEN_SECRET = 'secreto-de-prueba';
  const t = firmarPermisoWebReal({ studioId: 'est-1', origen: 'https://x.com' }, 1_000);
  assert.deepEqual(verificarPermisoWebReal(t, 2_000), { studioId: 'est-1', origen: 'https://x.com' });
  assert.equal(verificarPermisoWebReal(t, 1_000 + 10 * 60 * 1000 + 1), null, 'caducado');
  const [carga, firma] = t.split('.');
  const otra = Buffer.from(JSON.stringify({ s: 'est-1', o: 'https://otra.com', exp: 9e15 })).toString('base64url');
  assert.equal(verificarPermisoWebReal(`${otra}.${firma}`, 2_000), null, 'otro origen con la firma de antes');
  assert.equal(verificarPermisoWebReal(`${carga}.${firma.slice(0, -2)}xx`, 2_000), null);
  for (const raro of [null, undefined, '', 'sinpunto', '.', 'a.b', 'x'.repeat(3000)]) assert.equal(verificarPermisoWebReal(raro, 2_000), null, String(raro));
  // El de las vistas previas del Inicio no vale aquí (otro uso de la misma clave).
  assert.equal(verificarPermisoWebReal(`${Buffer.from(JSON.stringify({ studioId: 'est-1', exp: 9e15 })).toString('base64url')}.${firma}`, 2_000), null);
});

// ── El marco: la política y el documento ─────────────────────────────────────

test('⚠️ la política del marco, fijada: `frame-src` SOLO la web del estudio (con y sin www) y `frame-ancestors \'self\'`, nada más', () => {
  assert.deepEqual(origenesDelMarco('https://pilatescentro.com'), ['https://pilatescentro.com', 'https://www.pilatescentro.com']);
  assert.deepEqual(origenesDelMarco('https://www.pilatescentro.com'), ['https://www.pilatescentro.com', 'https://pilatescentro.com']);
  assert.equal(politicaDelMarco('https://pilatescentro.com'), "frame-src https://pilatescentro.com https://www.pilatescentro.com; frame-ancestors 'self'");
  // Solo esas dos directivas: sin `default-src` no restringe nada más, y no se añade más de lo necesario.
  const directivas = politicaDelMarco('https://x.com').split(';').map(d => d.trim().split(/\s+/)[0]);
  assert.deepEqual(directivas, ['frame-src', 'frame-ancestors']);
  // Ni comodines, ni `*`, ni `data:`/`blob:`, ni otros orígenes (Stripe, captcha…): este documento no enmarca nada más.
  assert.doesNotMatch(politicaDelMarco('https://x.com'), /\*|data:|blob:|stripe|turnstile|cloudflare|hcaptcha|'unsafe/i);
  const c = cabecerasDelMarco('https://x.com');
  assert.equal(c['Content-Security-Policy'], politicaDelMarco('https://x.com'));
  assert.equal(c['X-Frame-Options'], 'SAMEORIGIN');
  assert.equal(c['Referrer-Policy'], 'no-referrer');
  assert.match(c['Cache-Control'], /no-store/);
});

test('⚠️ el iframe de su web: `sandbox="allow-scripts"` SIN allow-same-origin ni navegación ni formularios, sin referrer, perezoso y con título', () => {
  assert.equal(SANDBOX_DE_SU_WEB, 'allow-scripts');
  const html = htmlDelMarco('https://www.pilatescentro.com');
  assert.equal([...html.matchAll(/<iframe /g)].length, 1, 'un solo iframe: el de su web');
  assert.match(html, /<iframe src="https:\/\/www\.pilatescentro\.com\/" /);
  assert.match(html, /sandbox="allow-scripts"/);
  for (const nunca of ['allow-same-origin', 'allow-top-navigation', 'allow-forms', 'allow-popups', 'allow-modals', 'allow-downloads']) {
    assert.doesNotMatch(html, new RegExp(nunca), nunca);
  }
  assert.match(html, /referrerpolicy="no-referrer"/);
  assert.match(html, /loading="lazy"/);
  assert.match(html, /<iframe[^>]* title="Tu web, tal como se ve ahora \(orientativo\)"/);
  // Y no mete ni un script nuestro.
  assert.doesNotMatch(html, /<script/i);
  // Lo que viene de fuera nunca rompe el atributo.
  assert.doesNotMatch(htmlDelMarco('https://x.com'), /javascript:/i);
});

// ── Sin secreto de firma: no se rompe, no se enseña nada ─────────────────────

test('⚠️ sin secreto de firma: ni se firma ni se verifica, pero NADA lanza hacia la ruta (y el fallo viaja para Sentry)', () => {
  const guardado = { a: process.env.HOME_PREVIEW_TOKEN_SECRET, b: process.env.OAUTH_STATE_SECRET };
  try {
    process.env.HOME_PREVIEW_TOKEN_SECRET = 'secreto-de-prueba';
    // CONTROL: con secreto, firma y verifica de verdad (si no, el resto no probaría nada).
    const firma = firmarSinRomper({ studioId: 'est-1', origen: 'https://x.com' });
    assert.equal(firma.ok, true);
    const token = firma.ok ? firma.permiso : '';
    assert.deepEqual(leerPermisoSinRomper(token), { permiso: { studioId: 'est-1', origen: 'https://x.com' } });
    assert.deepEqual(leerPermisoSinRomper('malo.malo'), { permiso: null }, 'un permiso malo no es un fallo');

    // Sin secreto: lo de abajo lanza (token.ts), y los envoltorios lo convierten en un resultado.
    delete process.env.HOME_PREVIEW_TOKEN_SECRET;
    delete process.env.OAUTH_STATE_SECRET;
    assert.throws(() => firmarPermisoWebReal({ studioId: 'est-1', origen: 'https://x.com' }), /Falta HOME_PREVIEW_TOKEN_SECRET/);
    assert.throws(() => verificarPermisoWebReal(token), /Falta HOME_PREVIEW_TOKEN_SECRET/);
    const sinFirma = firmarSinRomper({ studioId: 'est-1', origen: 'https://x.com' });
    assert.equal(sinFirma.ok, false);
    assert.ok(!sinFirma.ok && sinFirma.fallo instanceof Error, 'trae el fallo para Sentry');
    const lectura = leerPermisoSinRomper(token);
    assert.equal(lectura.permiso, null, 'sin secreto no hay permiso, ni siquiera con un token que fue válido');
    assert.ok(lectura.fallo instanceof Error);
  } finally {
    if (guardado.a === undefined) delete process.env.HOME_PREVIEW_TOKEN_SECRET; else process.env.HOME_PREVIEW_TOKEN_SECRET = guardado.a;
    if (guardado.b === undefined) delete process.env.OAUTH_STATE_SECRET; else process.env.OAUTH_STATE_SECRET = guardado.b;
  }
});

// ── Un dominio de Tentare no es «su web» ─────────────────────────────────────

test('⚠️ un dominio de Tentare autorizado como web: «no se deja», sin red, sin tope y sin caché (y CONTROL: otro dominio sí se consulta)', async () => {
  for (const d of ['https://tentare.app', 'https://www.tentare.app', 'https://app.tentare.app', 'https://TENTARE.APP']) {
    const e = entorno();
    assert.deepEqual(await e.resolver({ dominios: [d] }), { estado: 'no-se-deja' }, d);
    assert.deepEqual(e.hechas, [], `${d}: ni una consulta`);
    assert.equal(e.topes(), 0, `${d}: ni tope`);
    assert.equal(e.cache.tamano, 0, `${d}: ni caché`);
  }
  // CONTROL: un dominio parecido (otro sitio) sí se consulta, con su tope.
  const e = entorno();
  assert.deepEqual(await e.resolver({ dominios: ['https://tentare.app.otra-web.com'] }), { estado: 'se-deja', origen: 'https://tentare.app.otra-web.com' });
  assert.deepEqual(await e.resolver({ dominios: ['https://notentare.app'] }), { estado: 'se-deja', origen: 'https://notentare.app' });
  assert.equal(e.hechas.length, 2);
  assert.equal(e.topes(), 2);
});

test('defensa en profundidad: la consulta nunca pide nada a un dominio de Tentare, ni aunque llegue directa', async () => {
  const pedidas: string[] = [];
  const peticion: PeticionDeCabeceras = async ({ url }) => { pedidas.push(url.href); return { estadoHttp: 200, cabeceras: {} }; };
  for (const o of ['https://tentare.app', 'https://sub.tentare.app']) {
    assert.deepEqual(await consultarEnmarcable(o, NUESTRO, { peticion }), { tipo: 'no-enmarcable', motivo: 'otro-sitio' }, o);
  }
  assert.deepEqual(pedidas, []);
  // CONTROL: otro dominio sí pide.
  assert.deepEqual(await consultarEnmarcable('https://estudio-ejemplo.com', NUESTRO, { peticion }), { tipo: 'enmarcable' });
  assert.deepEqual(pedidas, ['https://estudio-ejemplo.com/']);
});

test('las dos rutas pasan SIEMPRE por los envoltorios (nunca `token.ts` a pelo): sin secreto contestan con su cara de siempre, no con un 500 vacío', () => {
  const raiz = join(import.meta.dirname, '..', '..', '..');
  const get = readFileSync(join(raiz, 'app/vista-previa-web/route.ts'), 'utf8');
  const post = readFileSync(join(raiz, 'app/api/estudio/vista-previa-web/route.ts'), 'utf8');
  for (const [nombre, t] of [['GET', get], ['POST', post]] as const) {
    assert.doesNotMatch(t, /web-real\/token'/, `${nombre}: no importa token.ts directamente`);
    assert.match(t, /errorInterno\(/, `${nombre}: el fallo va a Sentry`);
  }
  assert.match(get, /leerPermisoSinRomper/);
  assert.match(get, /if \(!permiso\) return prohibido\(\)/, 'GET: sin permiso, la página que solo enmarca el panel');
  assert.match(get, /frame-ancestors 'self'/);
  assert.match(post, /firmarSinRomper/);
  assert.match(post, /return NextResponse\.json\(\{ estado: 'sin-saber' \}\)/, 'POST: sin secreto, «sin saber»');
});
