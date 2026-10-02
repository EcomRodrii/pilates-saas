import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  celda, sociasConSalud, tablaConsentimientos, tablaNotasInternas, tablaNotasProgreso, tablaSalud,
  type SociaExportable,
} from './estudio-salud-notas.ts';

const conConsentimiento: SociaExportable = {
  id: 's1', nombre: 'Ana', apellidos: 'Zamora', email: 'ana@example.com',
  consentimiento_salud_fecha: '2026-09-01T10:00:00Z', consentimiento_salud_revocado_en: null,
};
const revocado: SociaExportable = {
  id: 's2', nombre: 'Bea', apellidos: 'Alonso', email: 'bea@example.com',
  consentimiento_salud_fecha: '2026-09-01T10:00:00Z', consentimiento_salud_revocado_en: '2026-09-20T10:00:00Z',
};
const nunca: SociaExportable = { id: 's3', nombre: 'Carla', apellidos: 'Bravo', email: 'carla@example.com' };
const socias = [conConsentimiento, revocado, nunca];

test('celda: lo que Excel ejecutaría como fórmula sale como texto', () => {
  assert.equal(celda('=HYPERLINK("http://x.invalid")'), `'=HYPERLINK("http://x.invalid")`);
  assert.equal(celda('+34 600'), `'+34 600`);
  assert.equal(celda('-dolor lumbar'), `'-dolor lumbar`);
  assert.equal(celda('@sum'), `'@sum`);
  assert.equal(celda('Rodilla izquierda'), 'Rodilla izquierda');
  assert.equal(celda(null), '');
  assert.equal(celda(['a', 'b']), 'a, b');
});

test('la salud solo sale de quien tiene el consentimiento vigente', () => {
  assert.deepEqual([...sociasConSalud(socias)], ['s1']);
  const t = tablaSalud({
    socias,
    condiciones: [
      { socio_id: 's1', categoria: 'lesion', etiqueta: 'Rodilla', zona: 'izquierda', restricciones: ['saltos'], severidad: 'MEDIA', estado: 'ACTIVA', inicio: '2026-09-02', fin: null, notas: null },
      { socio_id: 's2', categoria: 'lesion', etiqueta: 'Hombro', zona: null, restricciones: [], severidad: 'ALTA', estado: 'ACTIVA', inicio: '2026-09-02', fin: null, notas: null },
      { socio_id: 's3', categoria: 'embarazo', etiqueta: 'Semana 20', zona: null, restricciones: [], severidad: 'BAJA', estado: 'ACTIVA', inicio: '2026-09-02', fin: null, notas: null },
    ],
    cuestionario: [{ socio_id: 's1', pregunta_id: 'p1', respuesta: '=1+1', actualizado_en: '2026-09-03' }],
    preguntas: [{ id: 'p1', pregunta: '¿Tienes alguna lesión?' }],
    valoraciones: [],
    trasClase: [{ socio_id: 's2', respuesta: 'MAL', nota: 'me dolió', creado_en: '2026-09-04' }],
  });
  assert.equal(t.rows.length, 2);
  assert.ok(t.rows.every(r => r[0] === 'ana@example.com'));
  assert.deepEqual(t.socios, ['s1'], 'solo se registra la lectura de quien ha salido');
  assert.ok(t.rows.some(r => r[4] === '¿Tienes alguna lesión?' && r[5] === `'=1+1`));
  assert.ok(t.rows.some(r => r[4] === 'lesion: Rodilla (izquierda)' && /Restricciones: saltos/.test(r[5])));
});

test('las notas de progreso siguen la misma regla, con el nombre de la instructora y nada más suyo', () => {
  const t = tablaNotasProgreso({
    socias,
    notas: [
      { socio_id: 's1', instructor_id: 'i1', progreso: 'Mejor', alertas: null, plan_proxima_sesion: null, ejercicios_casa: null, texto_libre: 'dictado', creada_en: '2026-09-05' },
      { socio_id: 's3', instructor_id: 'i1', progreso: 'X', alertas: null, plan_proxima_sesion: null, ejercicios_casa: null, texto_libre: null, creada_en: '2026-09-05' },
      { socio_id: null, instructor_id: 'i1', progreso: 'huérfana', alertas: null, plan_proxima_sesion: null, ejercicios_casa: null, texto_libre: null, creada_en: '2026-09-05' },
    ],
    instructoras: [{ id: 'i1', nombre: 'Marta' }],
  });
  assert.equal(t.rows.length, 1);
  assert.equal(t.rows[0][3], 'Marta');
  assert.deepEqual(t.socios, ['s1']);
});

test('las notas internas salen todas (también las privadas) y ordenadas por clienta y fecha', () => {
  const t = tablaNotasInternas({
    socias,
    notas: [
      { socio_id: 's1', texto: 'segunda', tipo: null, visibilidad: 'EQUIPO', creado_en: '2026-09-10' },
      { socio_id: 's2', texto: 'de Bea', tipo: null, visibilidad: 'PRIVADA', creado_en: '2026-09-01' },
      { socio_id: 's1', texto: 'primera', tipo: 'llamada', visibilidad: 'PRIVADA', creado_en: '2026-09-02' },
    ],
  });
  // Alonso (Bea) antes que Zamora (Ana); dentro de Ana, por fecha.
  assert.deepEqual(t.rows.map(r => r[5]), ['de Bea', 'primera', 'segunda']);
  assert.deepEqual(t.rows.map(r => r[4]), ['Privada', 'Privada', 'Equipo']);
});

test('consentimientos: salud, condiciones y publicidad, sin IP ni cuenta del personal', () => {
  const t = tablaConsentimientos({
    socias,
    salud: [{ socio_id: 's2', tipo: 'REVOCA', en: '2026-09-20T10:00:00Z', origen: 'portal', texto: null }],
    contrato: [{ socio_id: 's1', en: '2026-09-01T10:00:00Z', origen: 'alta', texto_hash: 'abc' }],
    marketing: [{ socio_id: 's3', accion: 'ACEPTA', en: '2026-09-01T10:00:00Z', origen: 'portal', texto: 'Acepto' }],
  });
  assert.equal(t.rows.length, 3);
  assert.ok(!t.headers.some(h => /ip|cuenta|usuario/i.test(h)));
  assert.ok(t.rows.some(r => r[2] === 'Condiciones del estudio' && r[6] === 'huella abc'));
});

test('la ruta registra la lectura de salud y no entrega si falla', () => {
  // Guardia estática: la descarga masiva de salud no puede quedar sin traza.
  const ruta = readFileSync(join(import.meta.dirname, '..', '..', 'app/api/exportar/mis-datos/route.ts'), 'utf8');
  for (const tabla of ['salud', 'notas_progreso', 'notas_internas', 'consentimientos']) {
    assert.ok(ruta.includes(`'${tabla}'`), `falta ${tabla} en TABLAS`);
  }
  assert.match(ruta, /from\('lecturas_ficha_salud'\)\.insert/);
  assert.match(ruta, /if \(error\) return errorInterno\('exportar\/mis-datos:lectura-salud'/);
});
