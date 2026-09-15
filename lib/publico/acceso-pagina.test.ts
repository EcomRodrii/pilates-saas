import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  hashearClave, verificarClave, firmarAcceso, verificarAcceso, veredictoPagina,
  huellaClave, nombreCookieAcceso, CLAVE_MAX, puedeCambiarVisibilidadPagina, estadoPaginaDesdeLectura,
} from './acceso-pagina.ts';

const SECRETO = 'secreto-de-prueba-no-usar-en-serio';
const STUDIO = 'studio-1';
const OTRO = 'studio-2';

test('la clave se guarda hasheada, con sal distinta cada vez', () => {
  const a = hashearClave('abrete sesamo');
  const b = hashearClave('abrete sesamo');
  assert.notEqual(a, b, 'dos hashes de la misma clave no pueden coincidir: sin sal, una tabla de hashes los rompe a la vez');
  assert.ok(a.startsWith('scrypt$'));
  assert.ok(verificarClave('abrete sesamo', a));
  assert.ok(verificarClave('abrete sesamo', b));
});

test('una clave equivocada no entra, y un hash corrupto tampoco abre', () => {
  const guardado = hashearClave('correcta');
  assert.equal(verificarClave('incorrecta', guardado), false);
  assert.equal(verificarClave('', guardado), false);
  // Sin clave configurada NUNCA se abre por comparación: `null` no es «cualquiera vale».
  assert.equal(verificarClave('lo que sea', null), false);
  assert.equal(verificarClave('lo que sea', undefined), false);
  // Formatos rotos (migración a medias, edición manual) se rechazan en vez de lanzar.
  assert.equal(verificarClave('x', 'sin-dolares'), false);
  assert.equal(verificarClave('x', 'bcrypt$sal$hash'), false);
  assert.equal(verificarClave('x', 'scrypt$sal$'), false);
  assert.equal(verificarClave('x', 'scrypt$sal$zzzz'), false);
});

test('una clave más larga que el tope no entra ni se deriva', () => {
  const tope = 'a'.repeat(CLAVE_MAX);
  assert.ok(verificarClave(tope, hashearClave(tope)), 'la del tope justo sigue valiendo');
  assert.equal(verificarClave(`${tope}a`, hashearClave(tope)), false);
  assert.equal(verificarClave('x'.repeat(1_000_000), hashearClave('correcta')), false);
});

test('acentos y formas Unicode distintas de la MISMA clave abren igual', () => {
  // «Ábrete» tecleado en un Mac y en un Windows puede llegar en NFD y NFC. Sin
  // normalizar, la propietaria la fija en un sitio y no le entra en el otro —
  // y no hay forma de que lo entienda mirando la pantalla.
  const nfc = 'Ábrete';
  const nfd = 'Ábrete';
  assert.notEqual(nfc, nfd);
  assert.ok(verificarClave(nfd, hashearClave(nfc)));
});

const HASH = hashearClave('abrete sesamo');
const HUELLA = huellaClave(HASH) as string;

test('la huella sale del hash guardado, no abre nada sola y sin clave es null', () => {
  assert.equal(huellaClave(null), null);
  assert.equal(huellaClave(undefined), null);
  assert.equal(huellaClave(''), null);
  assert.equal(huellaClave(HASH), HUELLA, 'la misma clave guardada da siempre la misma huella');
  // Volver a guardar la MISMA clave lleva sal nueva: cuenta como cambiarla.
  assert.notEqual(huellaClave(hashearClave('abrete sesamo')), HUELLA);
  assert.ok(!HUELLA.includes('abrete'));
  assert.ok(!HASH.includes(HUELLA));
});

test('el pase abre su estudio y solo el suyo', () => {
  const pase = firmarAcceso(STUDIO, HUELLA, Date.now(), SECRETO);
  assert.ok(verificarAcceso(pase, STUDIO, HUELLA, Date.now(), SECRETO));
  assert.equal(verificarAcceso(pase, OTRO, HUELLA, Date.now(), SECRETO), false);
});

test('un pase caducado, manipulado o firmado con otro secreto no abre', () => {
  const ahora = Date.now();
  const pase = firmarAcceso(STUDIO, HUELLA, ahora, SECRETO);
  const treintaYUnDia = ahora + 31 * 24 * 60 * 60 * 1000;
  assert.equal(verificarAcceso(pase, STUDIO, HUELLA, treintaYUnDia, SECRETO), false);
  assert.equal(verificarAcceso(pase, STUDIO, HUELLA, ahora, 'otro-secreto'), false);
  assert.equal(verificarAcceso(`${pase}x`, STUDIO, HUELLA, ahora, SECRETO), false);
  assert.equal(verificarAcceso('sin-punto', STUDIO, HUELLA, ahora, SECRETO), false);
  assert.equal(verificarAcceso(null, STUDIO, HUELLA, ahora, SECRETO), false);
});

test('un token de OTRO tipo firmado con el mismo secreto NO vale como pase', () => {
  // El repo firma la vista previa del Inicio con este mismo secreto. Sin el
  // campo `tipo`, ese token —que cualquier miembro del staff puede obtener—
  // serviría para abrir la página oculta de su estudio saltándose la clave.
  const payload = Buffer.from(JSON.stringify({ studioId: STUDIO, huella: HUELLA, exp: Date.now() + 1000 })).toString('base64url');
  const falso = `${payload}.${createHmac('sha256', SECRETO).update(payload).digest('base64url')}`;
  assert.equal(verificarAcceso(falso, STUDIO, HUELLA, Date.now(), SECRETO), false);
});

test('un pase no se puede reescribir con la huella de la clave nueva sin el secreto', () => {
  const viejo = firmarAcceso(STUDIO, HUELLA, Date.now(), SECRETO);
  const nuevaHuella = huellaClave(hashearClave('otra clave')) as string;
  const [payloadB64, firma] = viejo.split('.');
  const datos = JSON.parse(Buffer.from(payloadB64, 'base64url').toString()) as Record<string, unknown>;
  const cambiado = Buffer.from(JSON.stringify({ ...datos, huella: nuevaHuella })).toString('base64url');
  assert.equal(verificarAcceso(`${cambiado}.${firma}`, STUDIO, nuevaHuella, Date.now(), SECRETO), false);
});

test('veredicto: sin ocultar, siempre abierta', () => {
  const base = { oculta: false, huellaClave: HUELLA, pase: null, studioId: STUDIO, claveFirma: SECRETO };
  assert.equal(veredictoPagina(base), 'abierta');
  assert.equal(veredictoPagina({ ...base, huellaClave: null }), 'abierta');
});

test('veredicto: oculta con clave pide la clave; con el pase de esa clave, abre', () => {
  const base = { oculta: true, huellaClave: HUELLA, studioId: STUDIO, claveFirma: SECRETO };
  assert.equal(veredictoPagina({ ...base, pase: null }), 'pide-clave');
  assert.equal(veredictoPagina({ ...base, pase: 'basura' }), 'pide-clave');
  assert.equal(veredictoPagina({ ...base, pase: firmarAcceso(STUDIO, HUELLA, Date.now(), SECRETO) }), 'abierta');
});

test('veredicto: el pase de OTRO estudio no abre, aunque la huella coincidiera', () => {
  const base = { oculta: true, huellaClave: HUELLA, studioId: STUDIO, claveFirma: SECRETO };
  assert.equal(veredictoPagina({ ...base, pase: firmarAcceso(OTRO, HUELLA, Date.now(), SECRETO) }), 'pide-clave');
});

test('veredicto: oculta SIN clave no enseña formulario, dice que está cerrada', () => {
  // Un campo de clave que no abre con ninguna clave invita a probar y además
  // miente sobre que exista una forma de entrar.
  assert.equal(
    veredictoPagina({ oculta: true, huellaClave: null, pase: null, studioId: STUDIO, claveFirma: SECRETO }),
    'cerrada',
  );
});

// ⚠️ Cambio de comportamiento A PROPÓSITO. Antes, quien ya había entrado
// seguía dentro 30 días aunque la propietaria cambiara o quitara la clave.
// Decisión del equipo: cambiar o quitar la clave cierra también a quien ya
// entró — es la única forma de retirarle el acceso a alguien.
test('si se QUITA la clave, quien ya entró se queda fuera', () => {
  const pase = firmarAcceso(STUDIO, HUELLA, Date.now(), SECRETO);
  assert.equal(
    veredictoPagina({ oculta: true, huellaClave: null, pase, studioId: STUDIO, claveFirma: SECRETO }),
    'cerrada',
  );
  assert.equal(verificarAcceso(pase, STUDIO, null, Date.now(), SECRETO), false);
});

test('si se CAMBIA la clave, el pase de la anterior no abre y se vuelve a pedir', () => {
  const pase = firmarAcceso(STUDIO, HUELLA, Date.now(), SECRETO);
  const nueva = huellaClave(hashearClave('clave nueva')) as string;
  assert.equal(
    veredictoPagina({ oculta: true, huellaClave: nueva, pase, studioId: STUDIO, claveFirma: SECRETO }),
    'pide-clave',
  );
  // Y con la misma clave guardada de siempre, el pase sigue valiendo.
  assert.equal(
    veredictoPagina({ oculta: true, huellaClave: huellaClave(HASH), pase, studioId: STUDIO, claveFirma: SECRETO }),
    'abierta',
  );
});

test('un pase de antes de la huella (sin ese campo) ya no abre', () => {
  // Firmado bien, del tipo y estudio correctos, pero con el formato viejo.
  const payload = Buffer.from(JSON.stringify({ tipo: 'acceso-publico', studioId: STUDIO, exp: Date.now() + 60_000 })).toString('base64url');
  const viejo = `${payload}.${createHmac('sha256', SECRETO).update(payload).digest('base64url')}`;
  assert.equal(verificarAcceso(viejo, STUDIO, HUELLA, Date.now(), SECRETO), false);
  assert.equal(
    veredictoPagina({ oculta: true, huellaClave: HUELLA, pase: viejo, studioId: STUDIO, claveFirma: SECRETO }),
    'pide-clave',
  );
});

test('la cookie va por estudio, no una global', () => {
  assert.notEqual(nombreCookieAcceso(STUDIO), nombreCookieAcceso(OTRO));
});

// ── Quién la configura y qué contesta el GET ────────────────────────────────

test('solo la propietaria configura la visibilidad; gerencia, recepción e instructora no', () => {
  assert.equal(puedeCambiarVisibilidadPagina('PROPIETARIO'), true);
  for (const rol of ['MANAGER', 'RECEPCION', 'INSTRUCTOR', '', null, undefined])
    assert.equal(puedeCambiarVisibilidadPagina(rol), false, `rol ${String(rol)}`);
});

test('GET: si la lectura falla responde 503 y NO dice que la página es visible', () => {
  const r = estadoPaginaDesdeLectura({ data: null, error: { message: 'timeout' } });
  assert.equal(r.status, 503);
  assert.ok('error' in r.body && r.body.error.startsWith('No se ha podido leer'));
  assert.equal('oculta' in r.body, false);
  // Aunque venga algo en `data`, con error no se afirma nada.
  const conAmbos = estadoPaginaDesdeLectura({ data: { pagina_publica_oculta: false }, error: { code: '57014' } });
  assert.equal(conAmbos.status, 503);
});

test('GET: sin fila tampoco se afirma «visible»; con fila, el estado real sin el hash', () => {
  assert.equal(estadoPaginaDesdeLectura({ data: null, error: null }).status, 404);
  const oculta = estadoPaginaDesdeLectura({ data: { pagina_publica_oculta: true, pagina_publica_clave_hash: HASH }, error: null });
  assert.deepEqual(oculta, { status: 200, body: { oculta: true, tieneClave: true } });
  assert.equal(JSON.stringify(oculta).includes(HASH), false);
  const visible = estadoPaginaDesdeLectura({ data: { pagina_publica_oculta: null, pagina_publica_clave_hash: null }, error: null });
  assert.deepEqual(visible, { status: 200, body: { oculta: false, tieneClave: false } });
});

function fuenteSinComentarios(ruta: string): string {
  return readFileSync(join(import.meta.dirname, '../..', ruta), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');
}

test('la ruta de visibilidad pasa GET y PUT por el listón de la propietaria', () => {
  const fuente = fuenteSinComentarios('app/api/pagina-publica/route.ts');
  assert.equal(fuente.match(/puedeCambiarVisibilidadPagina\(sesion\.rol\)/g)?.length, 2);
  assert.equal(fuente.includes("'MANAGER'"), false);
  assert.ok(fuente.includes('estadoPaginaDesdeLectura('));
});

test('probar claves: límite por IP ANTES de leer el body, y el de IP+estudio se mantiene', () => {
  const fuente = fuenteSinComentarios('app/api/public/acceso-pagina/route.ts');
  const porIp = fuente.indexOf("enforceRateLimit(req, 'acceso-pagina-ip'");
  const leeBody = fuente.indexOf('req.json(');
  const porEstudio = fuente.indexOf("enforceRateLimit(req, 'acceso-pagina', INTENTOS_POR_ESTUDIO, body.slug)");
  assert.ok(porIp >= 0, 'falta el límite por IP');
  assert.ok(leeBody > porIp, 'el body se lee antes del límite por IP');
  assert.ok(porEstudio > leeBody, 'falta el límite por IP y estudio');
  // Y el pase que firma lleva la huella de la clave guardada.
  assert.ok(/firmarAcceso\([^)]*huella\)/.test(fuente));
});
