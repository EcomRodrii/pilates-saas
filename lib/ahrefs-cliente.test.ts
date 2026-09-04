import { test } from 'node:test';
import assert from 'node:assert/strict';
import { debeMedirse } from './ahrefs-cliente.ts';

// ─────────────────────────────────────────────────────────────────────────────
// La puerta de Ahrefs Web Analytics.
//
// No se prueba que el script cargue —eso es una etiqueta y se ve mirando— sino
// DÓNDE se le deja arrancar, que es lo único que puede salir caro: esta app
// sirve la landing, el panel de la propietaria, el portal de las alumnas y el
// widget de reservas desde UN solo root layout. La instalación por defecto de
// Ahrefs (pegar el `<script>` en el `<head>`) los habría medido todos.
// ─────────────────────────────────────────────────────────────────────────────

test('mide la web pública, que es lo que existe para posicionar', () => {
  for (const path of [
    '/',
    '/precios',
    '/funcionalidades',
    '/recursos',
    '/comparativa/tentare-vs-bsport',
    '/soluciones/estudio-de-yoga',
    '/glosario',
    '/ayuda',
    '/network',
  ]) {
    assert.equal(debeMedirse(path, false), true, `${path} debería medirse`);
  }
});

test('no mide el panel: son URLs con id de socia y personal autenticado', () => {
  // El caso que de verdad importa. `/socios/<id>` y `/clientas/<id>` mandarían
  // a un tercero la URL de la ficha de una persona concreta.
  for (const path of [
    '/dashboard', '/clientas', '/clientas/soc-123', '/socios/soc-123',
    '/cobros', '/configuracion', '/calendario', '/mi-perfil', '/informes',
  ]) {
    assert.equal(debeMedirse(path, false), false, `${path} NO debería medirse`);
  }
});

test('no mide el portal de la alumna ni el kiosko', () => {
  // Marca blanca del estudio y datos de una socia: ni es tráfico nuestro ni es
  // contenido que se posicione.
  assert.equal(debeMedirse('/portal/estudio-carmen', false), false);
  assert.equal(debeMedirse('/portal/estudio-carmen/mis-reservas', false), false);
  assert.equal(debeMedirse('/kiosk/estudio-carmen', false), false);
});

test('no mide el backoffice de Tentare ni las pantallas de acceso', () => {
  for (const path of ['/interno', '/interno/kpis', '/login', '/crear-estudio', '/invitacion', '/clave-nueva', '/oauth']) {
    assert.equal(debeMedirse(path, false), false, `${path} NO debería medirse`);
  }
});

test('no mide los enlaces firmados de un solo uso', () => {
  // Llevan token en la URL. Mandarlo a un tercero sería regalar el enlace.
  for (const path of ['/valorar/tok-abc', '/no-puedo/tok-abc', '/confirmar-reserva/tok-abc', '/disponibilidad/tok-abc', '/aceptar-sustitucion/tok-abc']) {
    assert.equal(debeMedirse(path, false), false, `${path} NO debería medirse`);
  }
});

test('/reservar sí, porque se abrió a indexación a propósito', () => {
  // Decisión del fundador (2026-08-17): la página de reservas de cada estudio
  // es indexable. Una herramienta de SEO que no la midiera sería ciega justo
  // en lo que se acaba de abrir a Google.
  assert.equal(debeMedirse('/reservar/estudio-carmen', false), true);
});

test('…pero NO incrustada en la web del estudio', () => {
  // La misma página dentro de un iframe en el sitio de la clienta: ahí sus
  // visitantes no son tráfico de Tentare, y el tracker sería un tercero metido
  // en una propiedad ajena.
  assert.equal(debeMedirse('/reservar/estudio-carmen', true), false);
});

test('estar incrustada manda sobre todo lo demás', () => {
  // Ninguna ruta, por pública que sea, se mide dentro del iframe de otro.
  assert.equal(debeMedirse('/', true), false);
  assert.equal(debeMedirse('/precios', true), false);
});

test('/i sigue fuera: es el mismo contenido que /reservar en otra URL', () => {
  // No es un olvido — está bloqueado en el registro para que las dos URLs no
  // compitan entre sí. Medirlo daría tráfico de una página que no queremos
  // posicionar.
  assert.equal(debeMedirse('/i/ana-lopez', false), false);
});
