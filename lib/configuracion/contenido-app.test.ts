import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  PANTALLAS_APP, avisoComoMensaje, estadoTarjeta, fechaCorta, llevaA, modoEnlace, moverTarjeta,
  nombrePantalla, webValida, MAX_MENSAJE, type TarjetaEditable,
} from './contenido-app.ts';
import { tarjetasEnLaApp } from '../student/descubre.ts';

const HOY = '2026-10-15';
const FOTO = 'https://cdn.example.com/foto.jpg';
const RAIZ = join(import.meta.dirname, '../..');

function tarjeta(extra: Partial<TarjetaEditable> = {}): TarjetaEditable {
  return {
    id: 't1', imagenUrl: FOTO, titulo: 'Taller', texto: null, linkTipo: 'ninguno', linkValor: '',
    activo: true, ubicacion: ['home'], orden: 0, fechaInicio: null, fechaFin: null, ...extra,
  };
}

test('el estado dice «se ve» solo cuando la app la enseña: misma regla, no otra cuenta', () => {
  const casos: TarjetaEditable[] = [
    tarjeta(),
    tarjeta({ imagenUrl: '' }),
    tarjeta({ imagenUrl: 'javascript:alert(1)' }),
    tarjeta({ activo: false }),
    tarjeta({ ubicacion: ['clases'] }),
    tarjeta({ fechaInicio: '2026-10-16' }),
    tarjeta({ fechaInicio: HOY }),
    tarjeta({ fechaFin: HOY }),
    tarjeta({ fechaFin: '2026-10-14' }),
    tarjeta({ activo: false, imagenUrl: '' }),
  ];
  for (const t of casos) {
    const e = estadoTarjeta(t, HOY);
    assert.equal(e.sale, tarjetasEnLaApp([t], HOY).length === 1, JSON.stringify(t));
    assert.equal(e.tono === 'sale', e.sale, `${e.texto}: el tono y si sale no pueden discrepar`);
  }
});

test('cada estado dice por qué, primero lo que la deja fuera del todo', () => {
  assert.equal(estadoTarjeta(tarjeta({ fechaFin: '2026-10-25' }), HOY).texto, 'Se ve en la app · hasta el 25 oct');
  assert.equal(estadoTarjeta(tarjeta(), HOY).texto, 'Se ve en la app');
  // Sin foto manda sobre oculta: es lo primero que hay que arreglar.
  assert.equal(estadoTarjeta(tarjeta({ activo: false, imagenUrl: '' }), HOY).texto, 'Sin foto: no sale');
  assert.equal(estadoTarjeta(tarjeta({ activo: false }), HOY).texto, 'Oculta');
  assert.equal(estadoTarjeta(tarjeta({ fechaInicio: '2026-11-01' }), HOY).texto, 'Sale desde el 1 nov');
  assert.equal(estadoTarjeta(tarjeta({ fechaFin: '2026-10-14' }), HOY).texto, 'Terminó el 14 oct');
  // Las fechas son inclusivas: el último día todavía se ve.
  assert.equal(estadoTarjeta(tarjeta({ fechaFin: HOY }), HOY).sale, true);
});

test('la fecha lleva el año solo si no es el de hoy', () => {
  assert.equal(fechaCorta('2026-09-03', HOY), '3 sept');
  assert.equal(fechaCorta('2027-01-07', HOY), '7 ene 2027');
});

test('«lleva a» con el nombre de la pantalla, la web sin el https y nada cuando no lleva', () => {
  assert.equal(llevaA({ linkTipo: 'ninguno', linkValor: '' }), 'No lleva a ningún sitio');
  assert.equal(llevaA({ linkTipo: 'interno', linkValor: '/comprar' }), 'Lleva a: Comprar bonos y cuotas');
  // Una ruta de antes que no está en la lista se enseña tal cual: no se inventa un nombre.
  assert.equal(llevaA({ linkTipo: 'interno', linkValor: '/perfil' }), 'Lleva a: /perfil');
  assert.equal(llevaA({ linkTipo: 'externo', linkValor: 'https://instagram.com/estudio/' }), 'Lleva a: instagram.com/estudio');
  assert.equal(llevaA({ linkTipo: 'externo', linkValor: 'https://' }), 'La web no es válida: no lleva a ningún sitio');
});

test('el modo de enlace sale del dato, y un interno vacío es «ningún sitio»', () => {
  assert.equal(modoEnlace({ linkTipo: 'ninguno', linkValor: '' }), 'nada');
  assert.equal(modoEnlace({ linkTipo: 'interno', linkValor: '' }), 'nada');
  assert.equal(modoEnlace({ linkTipo: 'interno', linkValor: '/reservar' }), 'app');
  assert.equal(modoEnlace({ linkTipo: 'externo', linkValor: 'https://a.es' }), 'web');
});

test('una web se guarda solo entera: con https y un dominio de verdad', () => {
  assert.equal(webValida('https://instagram.com/estudio'), true);
  assert.equal(webValida('http://estudio.es'), true);
  assert.equal(webValida('instagram.com/estudio'), false, 'sin https:// la base la rechaza');
  assert.equal(webValida('https://hola'), false, 'sin dominio no lleva a ninguna parte');
  assert.equal(webValida('javascript:alert(1)'), false);
  assert.equal(webValida('/reservar'), false);
});

test('las pantallas de la lista existen en la app de la alumna', () => {
  const rutas = new Set(readdirSync(join(RAIZ, 'app/portal/[slug]'), { withFileTypes: true }).filter(d => d.isDirectory()).map(d => `/${d.name}`));
  for (const p of PANTALLAS_APP) assert.ok(rutas.has(p.ruta), `${p.ruta} no es una pantalla de app/portal/[slug]`);
  assert.equal(nombrePantalla('/bonos'), 'Mi plan');
  assert.equal(nombrePantalla('/no-existe'), null);
});

test('mover renumera la lista entera, también con órdenes repetidos', () => {
  const a = { id: 'a', orden: 0 };
  const b = { id: 'b', orden: 0 };
  const c = { id: 'c', orden: 5 };
  // Con a y b empatados a 0, intercambiar sus números no movería nada.
  // Queda b, a, c → 0, 1, 2; b ya tenía el 0, así que solo se escriben las otras dos.
  assert.deepEqual(moverTarjeta([c, b, a], 'b', -1), [{ id: 'a', orden: 1 }, { id: 'c', orden: 2 }]);
  assert.deepEqual(moverTarjeta([a, b, c], 'a', -1), [], 'la primera no sube');
  assert.deepEqual(moverTarjeta([{ id: 'a', orden: 0 }, { id: 'b', orden: 1 }], 'b', 1), [], 'la última no baja');
  // Ya numeradas: solo se escriben las dos que cambian.
  assert.deepEqual(moverTarjeta([{ id: 'a', orden: 0 }, { id: 'b', orden: 1 }, { id: 'c', orden: 2 }], 'c', -1), [{ id: 'c', orden: 1 }, { id: 'b', orden: 2 }]);
});

test('un aviso pasa a mensaje con su título y su texto, y nunca más largo de lo que cabe', () => {
  assert.equal(avisoComoMensaje({ titulo: 'Cerramos el 1 de noviembre', texto: 'Festivo: no hay clases.' }), 'Cerramos el 1 de noviembre. Festivo: no hay clases.');
  assert.equal(avisoComoMensaje({ titulo: '¡Bienvenida, Ana!', texto: null }), '¡Bienvenida, Ana!');
  assert.equal(avisoComoMensaje({ titulo: 'Horario:', texto: 'de 9 a 21' }), 'Horario: de 9 a 21');
  const largo = avisoComoMensaje({ titulo: 'Aviso', texto: 'x'.repeat(400) });
  assert.equal(largo.length, MAX_MENSAJE);
  assert.ok(largo.endsWith('…'));
});

test('MAX_MENSAJE es el CHECK de la base', () => {
  const sql = readFileSync(join(RAIZ, 'supabase/migrations/20260913010325_m5_check_contenido_publico.sql'), 'utf8');
  assert.match(sql, new RegExp(`length\\(mensaje_destacado\\) <= ${MAX_MENSAJE}`));
});
