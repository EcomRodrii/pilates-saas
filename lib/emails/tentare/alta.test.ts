import { test } from 'node:test';
import assert from 'node:assert/strict';
import { correoCuentaActiva, correoPrimeraClase, correoRecibirReservas, PRIMEROS_PASOS_ALTA, textoPlanAlta } from './alta.ts';
import { TAREAS_ALTA_NUEVA } from '../../guia/primeros-pasos.ts';
import { GRATIS_ALUMNAS, GRATIS_RESERVAS_MES } from '../../landing/founding-gratis.ts';
import { TRIAL_DIAS } from '../../billing/trial.ts';

// «Tu cuenta está activa» (correo 2 del alta nueva): lo que se compromete aquí es
// lo que llega a la bandeja de quien acaba de crear su estudio.

const BASE = {
  estudioNombre: 'Estudio Alba Pilates',
  urlApp: 'https://www.example.com/portal/estudio-alba-pilates',
  urlPrimeraClase: 'https://www.example.com/calendario',
  foundingGratis: true,
};

test('el asunto y la vista previa son los de la maqueta', () => {
  const c = correoCuentaActiva(BASE);
  assert.equal(c.asunto, 'Estudio Alba Pilates ya está en Tentare');
  assert.equal(c.preheader, 'Tu cuenta está activa. Te queda un paso para recibir reservas: tu primera clase.');
  assert.ok(c.html.includes(c.preheader));
});

test('el cuerpo: la APP de sus alumnas (no la página de reservas), un solo botón y los primeros pasos', () => {
  const { html } = correoCuentaActiva(BASE);
  assert.match(html, /Tu cuenta está activa/);
  assert.match(html, /<b>Estudio Alba Pilates<\/b> ya tiene la app de sus alumnas:/);
  assert.match(html, /href="https:\/\/www\.example\.com\/portal\/estudio-alba-pilates"/);
  assert.doesNotMatch(html, /\/reservar\//, 'el enlace por defecto es la app; /reservar es para su web');
  assert.doesNotMatch(html, /página de reservas/);
  assert.match(html, /Todavía está vacía\. En cuanto crees tu primera clase, tus alumnas podrán entrar con su email y reservar desde el móvil, sin descargarse nada\./);
  assert.match(html, /Crear mi primera clase<\/a>/);
  assert.equal((html.match(/mso-padding-alt/g) ?? []).length, 1, 'un correo, una llamada a la acción');
  assert.match(html, /Primeros pasos · 1 de 5/);
  for (const paso of PRIMEROS_PASOS_ALTA) assert.ok(html.includes(paso), paso);
  assert.match(html, /te responde una persona/);
  assert.match(html, /href="https:\/\/wa\.me\/34603556580\?text=/);
  assert.match(html, /Tentare · Software para estudios de Pilates · Hecho en España/);
});

test('el plan sale de las constantes que aplica el producto, y solo dice «gratis» si lo es', () => {
  assert.equal(textoPlanAlta(true),
    `Founding Studio: gratis hasta ${GRATIS_ALUMNAS} alumnas activas y ${GRATIS_RESERVAS_MES} reservas al mes. Sin tarjeta y sin permanencia.`);
  assert.match(correoCuentaActiva(BASE).html, /gratis hasta 150 alumnas activas y 250 reservas al mes/);
  const prueba = textoPlanAlta(false);
  assert.doesNotMatch(prueba, /gratis hasta/);
  assert.match(prueba, new RegExp(`${TRIAL_DIAS} días de prueba`));
  assert.ok(correoCuentaActiva({ ...BASE, foundingGratis: false }).html.includes(prueba));
});

test('el nombre del estudio se escapa: lo escribió una persona', () => {
  const c = correoCuentaActiva({ ...BASE, estudioNombre: 'Pilates <b>&</b> "Co"' });
  assert.doesNotMatch(c.html, /<b>&<\/b>/);
  assert.match(c.html, /Pilates &lt;b&gt;&amp;&lt;\/b&gt; &quot;Co&quot;/);
  // Un enlace que no es http(s) no llega a ser un enlace.
  assert.doesNotMatch(correoCuentaActiva({ ...BASE, urlApp: 'javascript:alert(1)' }).html, /href="javascript/);
});

// «Ya puedes recibir reservas» (correo 4): sale una vez, al publicar la primera
// clase, con el enlace y el QR en PNG.

const PUBLICADA = {
  estudioNombre: 'Estudio Alba Pilates',
  claseNombre: 'Reformer para principiantes',
  cuando: 'lunes 26 a las 18:30, cada semana',
  urlApp: 'https://www.example.com/portal/estudio-alba-pilates',
  urlQr: 'https://www.example.com/api/public/qr-app/estudio-alba-pilates',
};

test('correo 4: asunto, vista previa y cuerpo de la maqueta, con el QR en PNG y un solo botón', () => {
  const c = correoRecibirReservas(PUBLICADA);
  assert.equal(c.asunto, 'Ya puedes recibir reservas en Estudio Alba Pilates');
  assert.equal(c.preheader, 'Tu enlace y tu QR, para tenerlos a mano.');
  const { html } = c;
  assert.ok(html.includes(c.preheader));
  assert.match(html, />Ya puedes recibir reservas</);
  assert.match(html, /Tu clase <b>Reformer para principiantes<\/b> está publicada \(lunes 26 a las 18:30, cada semana\)\. Copia este enlace y mándalo:/);
  assert.match(html, /href="https:\/\/www\.example\.com\/portal\/estudio-alba-pilates"/);
  // El QR es una imagen PNG servida, nunca un SVG (Gmail no lo pinta), y es el de la APP.
  assert.match(html, /<img src="https:\/\/www\.example\.com\/api\/public\/qr-app\/estudio-alba-pilates" width="120" height="120" alt="QR de la app de tus alumnas"/);
  assert.doesNotMatch(html, /<svg/);
  assert.doesNotMatch(html, /\/reservar\/|qr-reservas|página de reservas/, 'la página de reservas es para su web: no se reparte');
  assert.match(html, /<b>Tu QR\.<\/b> Imprímelo y ponlo en recepción: al escanearlo, se abre la app de tus alumnas\./);
  assert.match(html, /Pégalo en tu Instagram o en el grupo de WhatsApp de tus alumnas\. Entran con su email, sin descargarse nada\./);
  assert.match(html, /Si quieres que reserven desde tu propia web, lo preparas en Configuración › Mi app y mi web\./);
  assert.match(html, /Abrir mi app<\/a>/);
  assert.equal((html.match(/mso-padding-alt/g) ?? []).length, 1, 'un correo, una llamada a la acción');
  assert.match(html, /te responde una persona/);
  assert.match(html, /Tentare · Software para estudios de Pilates · Hecho en España/);
});

test('correo 4: lo que escribió una persona se escapa', () => {
  const { html, asunto } = correoRecibirReservas({ ...PUBLICADA, claseNombre: '<script>x</script>', estudioNombre: 'A & B' });
  assert.doesNotMatch(html, /<script>/);
  assert.match(html, /&lt;script&gt;x&lt;\/script&gt;/);
  assert.equal(asunto, 'Ya puedes recibir reservas en A & B', 'el asunto va en texto, no en HTML');
});

// ── Correo 3: «Tu primera clase en Tentare, en 5 minutos» (PR-5) ────────────

const SIN_CLASE = {
  estudioNombre: 'Estudio Alba Pilates',
  nombre: 'Lucía',
  variante: { tipo: 'sin_clase' as const, ejemplo: { clase: 'Reformer', minutos: 55, plazas: 8 } },
  urlBoton: 'https://www.example.com/calendario?primera=1',
};

test('correo 3 sin clase: asunto, vista previa y cuerpo de la maqueta, y un solo botón', () => {
  const c = correoPrimeraClase(SIN_CLASE);
  assert.equal(c.asunto, 'Tu primera clase en Tentare, en 5 minutos');
  assert.equal(c.preheader, 'Es lo único que le falta a Estudio Alba Pilates para recibir reservas.');
  assert.match(c.html, /Te falta un paso, Lucía/);
  assert.match(c.html, /A <b>Estudio Alba Pilates<\/b> le falta una cosa para recibir reservas: tu primera clase\./);
  assert.match(c.html, /Está preparada con valores de ejemplo: Reformer, 55 minutos y 8 plazas\. Tú eliges el día y la hora, pones el precio y la publicas\./);
  assert.match(c.html, /href="https:\/\/www\.example\.com\/calendario\?primera=1"/);
  assert.equal((c.html.match(/Crear mi primera clase<\/a>/g) ?? []).length, 1);
  assert.match(c.html, /¿Te atascas en algo\?/);
  assert.match(c.html, /Es el único recordatorio que te mandamos sobre esto\./);
  assert.match(c.html, /https:\/\/wa\.me\//);
});

test('correo 3 con clase que aún no se puede reservar: no le dice «crea tu primera clase» (D7)', () => {
  const aviso = 'Una alumna nueva todavía no puede reservar desde tu página: pides bono para reservar y, sin Stripe, no puede comprarlo online.';
  const c = correoPrimeraClase({ ...SIN_CLASE, variante: { tipo: 'no_reservable', aviso }, urlBoton: 'https://www.example.com/configuracion?tab=conexiones#integracion-stripe' });
  assert.equal(c.asunto, 'Tus alumnas todavía no pueden reservar en Estudio Alba Pilates');
  assert.match(c.html, /que una alumna nueva pueda reservar tu clase/);
  assert.ok(c.html.includes(aviso));
  assert.doesNotMatch(c.html, /tu primera clase\./);
  assert.doesNotMatch(c.html, /Crear mi primera clase/);
  assert.match(c.html, /Ver qué falta<\/a>/);
});

test('correo 3: sin nombre, sin coma; lo que escribió una persona se escapa', () => {
  assert.match(correoPrimeraClase({ ...SIN_CLASE, nombre: null }).html, /Te falta un paso<\/div>/);
  const { html, preheader } = correoPrimeraClase({ ...SIN_CLASE, estudioNombre: 'Pilates <b>Malo</b>', nombre: '<i>Ana</i>' });
  assert.doesNotMatch(html, /<b>Malo<\/b>|<i>Ana<\/i>/);
  assert.match(html, /&lt;i&gt;Ana&lt;\/i&gt;/);
  assert.equal(preheader, 'Es lo único que le falta a Pilates <b>Malo</b> para recibir reservas.', 'el preheader lo escapa el marco');
});

test('los primeros pasos del correo 2 son las cinco tareas de la lista del panel', () => {
  assert.deepEqual([...PRIMEROS_PASOS_ALTA], TAREAS_ALTA_NUEVA.map(t => t.titulo));
});
