import { test } from 'node:test';
import assert from 'node:assert/strict';
import { htmlDeclaracion, type DeclaracionImprimible } from './declaracion-pdf.ts';

const base: DeclaracionImprimible = {
  titulo: 'DECLARACIÓN RESPONSABLE DEL SISTEMA INFORMÁTICO DE FACTURACIÓN',
  version: '1.0.0',
  apartados: [
    { letra: '1.a', etiqueta: 'Nombre del sistema', valor: 'Tentare' },
    { letra: '1.j', etiqueta: 'Dirección postal', valor: 'Calle Ejemplo 1, 08001 Barcelona' },
    { letra: '1.k', etiqueta: 'La persona productora hace constar que cumple', valor: '' },
  ],
  suscrita: { fecha: '30-09-2026', lugar: 'Barcelona, España', suscritaEn: '2026-09-30T10:00:00Z', sha256: 'a'.repeat(64) },
};

test('el documento lleva versión, cada apartado, fecha y lugar de suscripción y la huella del texto', () => {
  const h = htmlDeclaracion(base);
  assert.ok(h.includes('Versión del sistema 1.0.0'));
  assert.ok(h.includes('1.a) Nombre del sistema:') && h.includes('Tentare'));
  assert.ok(h.includes('Suscrita el 30-09-2026 en Barcelona, España'));
  assert.ok(h.includes('a'.repeat(64)));
});

test('un apartado sin valor (1.k) se imprime como frase, sin dos puntos ni hueco', () => {
  const h = htmlDeclaracion(base);
  assert.ok(h.includes('1.k) La persona productora hace constar que cumple</p>'));
});

test('todo lo que viene de fuera se escapa: nada se ejecuta en la ventana de la app', () => {
  const h = htmlDeclaracion({
    ...base,
    apartados: [{ letra: '1.h', etiqueta: 'Nombre', valor: '<img src=x onerror=alert(1)>' }],
    suscrita: { ...base.suscrita, lugar: '"><script>alert(2)</script>' },
  });
  assert.ok(!h.includes('<img src=x'));
  assert.ok(!h.includes('<script>alert(2)'));
  assert.ok(h.includes('&lt;img src=x onerror=alert(1)&gt;'));
});
