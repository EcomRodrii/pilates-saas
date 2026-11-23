import test from 'node:test';
import assert from 'node:assert/strict';
import { correoInactividad } from './inactividad.ts';

const BASE = { estudioNombre: 'Estudio de prueba', dias: 34, urlPanel: 'https://app.example.com/dashboard' };

test('dice los días y el estudio, y deja dos salidas: entrar y escribir', () => {
  const { asunto, preheader, html } = correoInactividad(BASE);
  assert.match(asunto, /Estudio de prueba/);
  assert.match(preheader, /34 días/);
  assert.match(html, /desde hace 34 días/);
  assert.match(html, /href="https:\/\/app\.example\.com\/dashboard"/);
  assert.match(html, /href="mailto:hola@tentare\.app"/);
});

test('⚠️ no amenaza con nada que no esté decidido: ni baja, ni borrado, ni suspensión, ni plazos', () => {
  const { html, asunto } = correoInactividad(BASE);
  const texto = `${asunto} ${html.replace(/<[^>]+>/g, ' ')}`.toLowerCase();
  for (const prohibida of ['borr', 'elimin', 'baja', 'suspend', 'cancelar', 'perder', 'perderás', 'días para', 'plazo']) {
    assert.ok(!texto.includes(prohibida), `el aviso no puede decir «${prohibida}»`);
  }
  // Y sí tranquiliza sobre lo único que es cierto hoy: nada se ha tocado.
  assert.match(texto, /siguen exactamente como los dejaste/);
});

test('el nombre del estudio viene de fuera y se escapa; sin nombre, un genérico', () => {
  const { html } = correoInactividad({ ...BASE, estudioNombre: '<img src=x onerror=alert(1)>' });
  assert.ok(!html.includes('<img src=x'));
  const vacio = correoInactividad({ ...BASE, estudioNombre: '   ' });
  assert.match(vacio.asunto, /^Tu estudio:/);
});
