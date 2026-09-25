import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, statSync } from 'node:fs';
import { createHmac } from 'node:crypto';
import { join } from 'node:path';
import { RECURSOS_DESCARGABLES, esSlugDescarga, TEXTO_CONSENTIMIENTO_NOVEDADES, EMAIL_VALIDO, buzonCanonico } from './descargas.ts';
import { firmarTokenDescarga, verificarTokenDescarga } from './descargas-token.ts';
import { escrituraLeadDescarga, pedirConfirmacionNovedades, puedeRecibirNovedades, type LeadExistente } from './descargas-lead.ts';
import { correoDescarga, paginaDescargas } from './descargas-correo.ts';
import { ARTICULOS } from './articulos/index.ts';

const RAIZ = join(import.meta.dirname, '..', '..');
const SECRETO = 'secreto-de-prueba';
const AHORA = Date.parse('2026-09-25T12:00:00Z');
const DIA = 24 * 60 * 60 * 1000;

// ── Catálogo ─────────────────────────────────────────────────────────────────

test('cada recurso descargable tiene su archivo en public/ y su guía publicada', () => {
  const guias = new Set(ARTICULOS.map((a) => `/recursos/${a.slug}`));
  for (const [slug, r] of Object.entries(RECURSOS_DESCARGABLES)) {
    const ruta = join(RAIZ, 'public', r.archivo);
    assert.ok(existsSync(ruta), `${slug}: falta ${r.archivo}`);
    assert.ok(statSync(ruta).size > 5_000, `${slug}: el archivo parece vacío`);
    assert.ok(guias.has(r.guia), `${slug}: la guía ${r.guia} no es un artículo publicado`);
    assert.ok(esSlugDescarga(slug));
  }
  assert.equal(esSlugDescarga('toString'), false, 'una propiedad heredada no es un recurso');
  assert.equal(esSlugDescarga('../../etc/passwd'), false);
});

test('la guía de cada recurso lleva su recuadro de descarga', () => {
  for (const [slug, r] of Object.entries(RECURSOS_DESCARGABLES)) {
    const guia = ARTICULOS.find((a) => `/recursos/${a.slug}` === r.guia)!;
    const bloques = guia.secciones.flatMap((s) => s.bloques);
    assert.ok(bloques.some((b) => b.t === 'descarga' && b.recurso === slug), `${slug}: su guía no tiene el recuadro`);
  }
});

// ── Enlaces firmados ─────────────────────────────────────────────────────────

test('un enlace firmado vuelve con sus datos, y solo con el secreto correcto', () => {
  const t = firmarTokenDescarga({ alcance: 'descarga', leadId: 'lead-1', recurso: 'plantilla-politica-cancelacion' }, { ahora: AHORA, secreto: SECRETO });
  assert.deepEqual(verificarTokenDescarga(t, { ahora: AHORA, secreto: SECRETO }), { alcance: 'descarga', leadId: 'lead-1', recurso: 'plantilla-politica-cancelacion' });
  assert.equal(verificarTokenDescarga(t, { ahora: AHORA, secreto: 'otro' }), null);
});

test('un enlace manipulado, caducado o de otro sitio no vale', () => {
  const t = firmarTokenDescarga({ alcance: 'novedades', leadId: 'lead-1', solicitudId: 'sol-1' }, { ahora: AHORA, secreto: SECRETO });
  const [payload, firma] = t.split('.');
  // Cambiar el lead sin poder volver a firmar.
  const otro = Buffer.from(Buffer.from(payload, 'base64url').toString().replace('lead-1', 'lead-2')).toString('base64url');
  assert.equal(verificarTokenDescarga(`${otro}.${firma}`, { ahora: AHORA, secreto: SECRETO }), null);
  // 30 días de vida para confirmar novedades.
  assert.ok(verificarTokenDescarga(t, { ahora: AHORA + 29 * DIA, secreto: SECRETO }));
  assert.equal(verificarTokenDescarga(t, { ahora: AHORA + 31 * DIA, secreto: SECRETO }), null);
  // Basura y formas raras: null, nunca una excepción.
  for (const malo of ['', 'a', 'a.b.c', '.', `${payload}.`, 'x'.repeat(5000)]) {
    assert.equal(verificarTokenDescarga(malo, { ahora: AHORA, secreto: SECRETO }), null);
  }
  // Un token de otro sitio del producto, firmado con el mismo secreto pero sin
  // el prefijo de las descargas, no vale aunque su payload se pareciera.
  const ajeno = Buffer.from(JSON.stringify({ v: 'descargas', a: 'baja', l: 'lead-1', exp: AHORA + DIA })).toString('base64url');
  const firmaAjena = createHmac('sha256', SECRETO).update(ajeno).digest('base64url');
  assert.equal(verificarTokenDescarga(`${ajeno}.${firmaAjena}`, { ahora: AHORA, secreto: SECRETO }), null);
  // Y con el prefijo pero sin la marca `v`, tampoco.
  const sinMarca = Buffer.from(JSON.stringify({ a: 'baja', l: 'lead-1', exp: AHORA + DIA })).toString('base64url');
  const firmaSinMarca = createHmac('sha256', SECRETO).update(`descargas.${sinMarca}`).digest('base64url');
  assert.equal(verificarTokenDescarga(`${sinMarca}.${firmaSinMarca}`, { ahora: AHORA, secreto: SECRETO }), null);
});

test('el enlace de baja sigue funcionando años después', () => {
  const t = firmarTokenDescarga({ alcance: 'baja', leadId: 'lead-1' }, { ahora: AHORA, secreto: SECRETO });
  assert.ok(verificarTokenDescarga(t, { ahora: AHORA + 5 * 365 * DIA, secreto: SECRETO }));
});

test('un enlace de descarga sin recurso, o de novedades sin solicitud, no vale', () => {
  const firmado = (datos: object) => {
    const p = Buffer.from(JSON.stringify({ v: 'descargas', l: 'lead-1', exp: AHORA + DIA, ...datos })).toString('base64url');
    return `${p}.${createHmac('sha256', SECRETO).update(`descargas.${p}`).digest('base64url')}`;
  };
  // Control: bien formados sí valen, así que los null de abajo son por lo que falta.
  assert.ok(verificarTokenDescarga(firmado({ a: 'descarga', r: 'plantilla-politica-cancelacion' }), { ahora: AHORA, secreto: SECRETO }));
  assert.ok(verificarTokenDescarga(firmado({ a: 'novedades', s: 'sol-1' }), { ahora: AHORA, secreto: SECRETO }));
  assert.equal(verificarTokenDescarga(firmado({ a: 'descarga' }), { ahora: AHORA, secreto: SECRETO }), null);
  assert.equal(verificarTokenDescarga(firmado({ a: 'novedades' }), { ahora: AHORA, secreto: SECRETO }), null);
});

test('el enlace de novedades lleva la solicitud que confirma', () => {
  const t = firmarTokenDescarga({ alcance: 'novedades', leadId: 'lead-1', solicitudId: 'sol-9' }, { ahora: AHORA, secreto: SECRETO });
  assert.deepEqual(verificarTokenDescarga(t, { ahora: AHORA, secreto: SECRETO }), { alcance: 'novedades', leadId: 'lead-1', solicitudId: 'sol-9' });
});

// ── Email y buzón ────────────────────────────────────────────────────────────

test('solo emails que no se puedan leer como varias destinatarias', () => {
  for (const bueno of ['ana@example.com', 'ana.perez+pilates@sub.example.es']) assert.ok(EMAIL_VALIDO.test(bueno), bueno);
  for (const malo of ['ana@example.com.', 'a<b>@example.com', 'a,b@example.com', 'ana@ex ample.com', 'ana@example', '"a"@example.com', 'a;b@example.com']) {
    assert.equal(EMAIL_VALIDO.test(malo), false, malo);
  }
});

test('las variantes de un mismo buzón cuentan como una para el tope diario', () => {
  const uno = buzonCanonico('ana@gmail.com');
  for (const v of ['Ana@Gmail.com', 'a.na@gmail.com', 'ana+pilates@gmail.com', 'a.n.a+x@googlemail.com']) assert.equal(buzonCanonico(v), uno, v);
  // Fuera de Gmail, el punto sí distingue buzones.
  assert.notEqual(buzonCanonico('a.na@example.com'), buzonCanonico('ana@example.com'));
  assert.equal(buzonCanonico('ana+x@example.com'), 'ana@example.com');
});

// ── Qué se guarda ────────────────────────────────────────────────────────────

const ahora = '2026-09-25T12:00:00.000Z';
const nuevoId = () => 'lead-nuevo';
const peticion = { email: 'ana@example.com', recurso: 'plantilla-politica-cancelacion', estudio: 'Estudio Ejemplo', novedades: false };
const existente = (extra: Partial<LeadExistente> = {}): LeadExistente => ({
  id: 'lead-7', recurso: null, consentimiento_comercial: false, consentimiento_confirmado_en: null, baja_en: null, ...extra,
});

test('un email nuevo entra como DESCARGA, y sin casilla no lleva permiso', () => {
  const e = escrituraLeadDescarga(null, peticion, ahora, nuevoId);
  assert.equal(e.tipo, 'insertar');
  if (e.tipo !== 'insertar') return;
  assert.match(e.id, /^lead-/, 'el id va aparte: la ruta lo pone a la vista en el upsert');
  assert.equal('id' in e.fila, false);
  assert.equal(e.fila.origen, 'DESCARGA');
  assert.equal(e.fila.recurso, 'plantilla-politica-cancelacion');
  assert.equal(e.fila.consentimiento_comercial, undefined, 'descargar no es consentir');
});

test('con la casilla, el permiso queda PENDIENTE con el texto exacto y la fecha', () => {
  const e = escrituraLeadDescarga(null, { ...peticion, novedades: true }, ahora, nuevoId);
  if (e.tipo !== 'insertar') return assert.fail('debía insertar');
  assert.equal(e.fila.consentimiento_comercial, true);
  assert.equal(e.fila.consentimiento_texto, TEXTO_CONSENTIMIENTO_NOVEDADES);
  assert.equal(e.fila.consentimiento_en, ahora);
  assert.equal('consentimiento_confirmado_en' in e.fila, false, 'sin confirmar desde el correo no vale');
  assert.equal(puedeRecibirNovedades({ consentimiento_comercial: true, consentimiento_confirmado_en: null, baja_en: null }), false);
});

test('un envío no pisa un lead que ya existe: ni origen, ni estudio, ni su fecha de actividad', () => {
  const e = escrituraLeadDescarga(existente(), peticion, ahora, nuevoId);
  if (e.tipo !== 'actualizar') return assert.fail('debía actualizar');
  assert.deepEqual(e.cambios, { recurso: 'plantilla-politica-cancelacion' }, 'solo el recurso, y porque no tenía');
  // Con recurso ya anotado y sin permiso que pedir, no se escribe nada.
  assert.deepEqual(escrituraLeadDescarga(existente({ recurso: 'otro' }), peticion, ahora, nuevoId), { tipo: 'nada', id: 'lead-7' });
});

test('a quien ya confirmó no se le devuelve a pendiente con un envío ajeno', () => {
  const confirmada = existente({ consentimiento_comercial: true, consentimiento_confirmado_en: '2026-09-01T00:00:00Z' });
  const e = escrituraLeadDescarga(confirmada, { ...peticion, novedades: true }, ahora, nuevoId);
  if (e.tipo !== 'actualizar') return assert.fail('debía actualizar');
  assert.equal('consentimiento_confirmado_en' in e.cambios, false);
  assert.equal('consentimiento_texto' in e.cambios, false, 'el texto que confirmó no se pisa');
  assert.equal(pedirConfirmacionNovedades(confirmada, true), false, 'no se le pide confirmar otra vez');
});

test('no marcar la casilla no es darse de baja', () => {
  const confirmada = existente({ consentimiento_comercial: true, consentimiento_confirmado_en: '2026-09-01T00:00:00Z' });
  const e = escrituraLeadDescarga(confirmada, peticion, ahora, nuevoId);
  if (e.tipo !== 'actualizar') return assert.fail('debía actualizar');
  assert.equal('consentimiento_comercial' in e.cambios, false);
  assert.equal('baja_en' in e.cambios, false);
});

test('se le puede escribir solo con el permiso confirmado y sin baja posterior', () => {
  assert.equal(puedeRecibirNovedades({ consentimiento_comercial: true, consentimiento_confirmado_en: null, baja_en: null }), false);
  assert.equal(puedeRecibirNovedades({ consentimiento_comercial: true, consentimiento_confirmado_en: '2026-09-01T00:00:00Z', baja_en: null }), true);
  assert.equal(puedeRecibirNovedades({ consentimiento_comercial: false, consentimiento_confirmado_en: '2026-09-01T00:00:00Z', baja_en: '2026-09-10T00:00:00Z' }), false);
  // Se dio de baja y luego volvió a confirmar.
  assert.equal(puedeRecibirNovedades({ consentimiento_comercial: true, consentimiento_confirmado_en: '2026-09-20T00:00:00Z', baja_en: '2026-09-10T00:00:00Z' }), true);
});

test('quien se dio de baja y vuelve a marcar la casilla queda pendiente, sin borrar nada', () => {
  const baja = existente({ consentimiento_comercial: false, consentimiento_confirmado_en: '2026-09-01T00:00:00Z', baja_en: '2026-09-10T00:00:00Z' });
  const e = escrituraLeadDescarga(baja, { ...peticion, novedades: true }, ahora, nuevoId);
  if (e.tipo !== 'actualizar') return assert.fail('debía actualizar');
  assert.equal(e.cambios.consentimiento_comercial, true);
  assert.equal('consentimiento_confirmado_en' in e.cambios, false, 'la confirmación vieja no vuelve a null');
  assert.equal('baja_en' in e.cambios, false, 'la baja no vuelve a null');
  // Y aun así no se le puede escribir: su confirmación es anterior a la baja.
  assert.equal(puedeRecibirNovedades({ ...baja, ...e.cambios } as never), false);
  assert.equal(pedirConfirmacionNovedades(baja, true), true);
});

// ── El correo y las páginas ──────────────────────────────────────────────────

const ficha = RECURSOS_DESCARGABLES['plantilla-politica-cancelacion'];

test('el correo lleva el enlace de descarga y, solo si se pidió, el de novedades y el de baja', () => {
  const sin = correoDescarga(ficha, { descarga: 'https://x.test/d', guia: 'https://x.test/g' });
  assert.ok(sin.html.includes('https://x.test/d') && sin.texto.includes('https://x.test/d'));
  assert.ok(!sin.html.includes('Sí, quiero recibirlas'));
  assert.ok(!sin.html.includes('Darme de baja'));
  assert.ok(!/undefined|null/.test(sin.html + sin.texto));

  const con = correoDescarga(ficha, { descarga: 'https://x.test/d', novedades: 'https://x.test/n', baja: 'https://x.test/b', guia: 'https://x.test/g' });
  assert.ok(con.html.includes('https://x.test/n') && con.texto.includes('https://x.test/n'));
  assert.ok(con.html.includes('https://x.test/b') && con.texto.includes('https://x.test/b'));
  assert.equal(con.asunto, ficha.asunto);
});

test('las páginas de los enlaces no se indexan y solo llevan botón si hay acción', () => {
  const sin = paginaDescargas({ titulo: 'Te hemos dado de baja', texto: 'Hecho.' });
  assert.ok(sin.includes('noindex'));
  assert.ok(!sin.includes('<form'));
  const con = paginaDescargas({ titulo: '¿Te damos de baja?', texto: 'Seguro.', accion: { url: '/api/public/descargas/abc', etiqueta: 'Sí' } });
  assert.ok(con.includes('<form method="post" action="/api/public/descargas/abc"'), 'actuar exige pulsar el botón: un escáner de correo solo hace GET');
  assert.ok(paginaDescargas({ titulo: '<b>', texto: '"x"' }).includes('&lt;b&gt;'), 'se escapa lo que se pinta');
});
