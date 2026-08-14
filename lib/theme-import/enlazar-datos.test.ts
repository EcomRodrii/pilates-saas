import test from 'node:test';
import assert from 'node:assert/strict';
import { enlazarPropsDeclarados, enlazarFotosDeSlots } from './enlazar-datos.ts';

test('enlazarPropsDeclarados: sustituye el default de studioName/brand, deja el resto igual', () => {
  const props = JSON.stringify({
    studioName: { editor: 'text', default: 'Nombre de mentira' },
    brand: { editor: 'color', default: '#000000' },
    tagline: { editor: 'text', default: 'Frase que no tocamos' },
  }).replace(/"/g, '&quot;');
  const html = `<script type="text/x-dc" data-dc-script data-props="${props}">class C{}</script>`;

  const salida = enlazarPropsDeclarados(html, { studioName: 'Estudio Real', brand: '#D9C29E' });

  assert.match(salida, /Estudio Real/);
  assert.match(salida, /#D9C29E/);
  assert.match(salida, /Frase que no tocamos/);
  assert.doesNotMatch(salida, /Nombre de mentira/);
  // El resto del script (el cuerpo de la clase) sigue intacto.
  assert.match(salida, /class C\{\}/);
});

test('enlazarPropsDeclarados: sin data-props, o con JSON roto, devuelve el HTML sin tocar', () => {
  const sinProps = '<div>hola</div>';
  assert.equal(enlazarPropsDeclarados(sinProps, { studioName: 'X' }), sinProps);

  const conJsonRoto = '<script data-dc-script data-props="{esto no es json">x</script>';
  assert.equal(enlazarPropsDeclarados(conJsonRoto, { studioName: 'X' }), conJsonRoto);
});

test('enlazarPropsDeclarados: un nombre de prop no reconocido no se toca ni se adivina', () => {
  const props = JSON.stringify({
    heroTitle: { editor: 'text', default: 'Título del propio tema' },
  }).replace(/"/g, '&quot;');
  const html = `<script data-dc-script data-props="${props}">x</script>`;

  const salida = enlazarPropsDeclarados(html, { studioName: 'Estudio Real' });
  assert.equal(salida, html);
});

test('enlazarPropsDeclarados: sin dato real para la prop reconocida, no la vacía', () => {
  const props = JSON.stringify({
    studioName: { editor: 'text', default: 'Nombre del tema' },
  }).replace(/"/g, '&quot;');
  const html = `<script data-dc-script data-props="${props}">x</script>`;

  const salida = enlazarPropsDeclarados(html, {});
  assert.match(salida, /Nombre del tema/);
});

test('enlazarFotosDeSlots: pone src en los ids reconocidos, respeta los demás', () => {
  const html = [
    '<image-slot id="welcome-hero"></image-slot>',
    '<image-slot id="home-hero" src="placeholder.png"></image-slot>',
    '<image-slot id="otro-slot-del-tema" src="lo-que-sea.png"></image-slot>',
  ].join('\n');

  const salida = enlazarFotosDeSlots(html, {
    welcomeHero: 'https://cdn.tentare.example/bienvenida.jpg',
    homeHero: 'https://cdn.tentare.example/home.jpg',
  });

  assert.match(salida, /<image-slot src="https:\/\/cdn\.tentare\.example\/bienvenida\.jpg" id="welcome-hero">/);
  assert.match(salida, /id="home-hero" src="https:\/\/cdn\.tentare\.example\/home\.jpg"/);
  // Un id que no reconocemos se deja EXACTAMENTE como vino.
  assert.match(salida, /id="otro-slot-del-tema" src="lo-que-sea\.png"/);
});

test('enlazarFotosDeSlots: un id plantillado ({{ }}) no se toca — lo resuelve el runtime', () => {
  const html = '<image-slot id="clase-{{ detId }}"></image-slot>';
  const salida = enlazarFotosDeSlots(html, { welcomeHero: 'https://x/foto.jpg' });
  assert.equal(salida, html);
});

test('enlazarFotosDeSlots: sin dato para ese slot, se deja tal cual (nunca un placeholder inventado)', () => {
  const html = '<image-slot id="centro-fachada"></image-slot>';
  const salida = enlazarFotosDeSlots(html, { welcomeHero: 'https://x/foto.jpg' });
  assert.equal(salida, html);
});
