import test from 'node:test';
import assert from 'node:assert/strict';
import {
  autoMapearProspecto, normalizarInstagram, normalizarWeb, validarFilasProspecto,
  revisarBorrador, tieneAvisoGrave, siguienteLote, resumirProspeccion,
  type CampoProspecto, type DatosProspecto,
} from './prospeccion.ts';

// ─── Mapeo de columnas ───────────────────────────────────────────────────────

test('autoMapearProspecto reconoce cabeceras en español con acentos y espacios', () => {
  const m = autoMapearProspecto(['Nombre estudio', 'Página web', 'Instagram', 'Correo', 'Teléfono', 'Software actual']);
  assert.equal(m.estudio, 0);
  assert.equal(m.web, 1);
  assert.equal(m.instagram, 2);
  assert.equal(m.email, 3);
  assert.equal(m.telefono, 4);
  assert.equal(m.software_actual, 5);
});

test('autoMapearProspecto: -1 en las columnas que no vienen', () => {
  const m = autoMapearProspecto(['email', 'estudio']);
  assert.equal(m.email, 0);
  assert.equal(m.estudio, 1);
  assert.equal(m.instagram, -1);
  assert.equal(m.ciudad, -1);
});

test('autoMapearProspecto prefiere la coincidencia EXACTA sobre la parcial', () => {
  // "email verificado" contiene "email", pero la columna buena es la otra.
  // Sin el orden exacto-primero, se importaría la columna equivocada entera.
  const m = autoMapearProspecto(['Email verificado', 'Estudio', 'Email']);
  assert.equal(m.email, 2);
});

// ─── Normalización ───────────────────────────────────────────────────────────

test('normalizarInstagram deja el mismo handle venga como venga', () => {
  for (const entrada of [
    '@pilatesbcn', 'pilatesbcn', 'instagram.com/pilatesbcn',
    'https://www.instagram.com/pilatesbcn', 'https://instagram.com/pilatesbcn/',
    'www.instagram.com/pilatesbcn?igshid=abc',
  ]) {
    assert.equal(normalizarInstagram(entrada), '@pilatesbcn', `falló con: ${entrada}`);
  }
});

test('normalizarInstagram y normalizarWeb devuelven null con celda vacía', () => {
  assert.equal(normalizarInstagram(''), null);
  assert.equal(normalizarInstagram('   '), null);
  assert.equal(normalizarInstagram(null), null);
  assert.equal(normalizarWeb(undefined), null);
});

test('normalizarWeb quita protocolo y barra final, conserva el resto', () => {
  assert.equal(normalizarWeb('https://pilatesbcn.es/'), 'pilatesbcn.es');
  assert.equal(normalizarWeb('http://www.pilatesbcn.es'), 'www.pilatesbcn.es');
});

// ─── Validación de filas ─────────────────────────────────────────────────────

const MAPA: Record<CampoProspecto, number> = {
  email: 0, estudio: 1, web: 2, instagram: 3, telefono: 4, ciudad: 5, software_actual: 6,
};

test('validarFilasProspecto acepta una fila completa y normaliza el email a minúsculas', () => {
  const r = validarFilasProspecto(
    [['Hola@PilatesBCN.es', 'Pilates BCN', 'https://pilatesbcn.es', '@pilatesbcn', '600111222', 'Barcelona', 'Bsport']],
    MAPA,
  );
  assert.equal(r.length, 1);
  assert.equal(r[0].estado, 'ok');
  assert.equal(r[0].datos.email, 'hola@pilatesbcn.es');
  assert.equal(r[0].datos.web, 'pilatesbcn.es');
  assert.equal(r[0].datos.instagram, '@pilatesbcn');
});

test('validarFilasProspecto numera las filas como las ve Excel (cabecera = 1)', () => {
  const r = validarFilasProspecto([
    ['a@a.es', 'Uno', '', '', '', '', ''],
    ['no-es-email', 'Dos', '', '', '', '', ''],
  ], MAPA);
  assert.equal(r[0].fila, 2);
  assert.equal(r[1].fila, 3);
});

test('validarFilasProspecto rechaza sin email, email inválido y sin estudio', () => {
  const r = validarFilasProspecto([
    ['', 'Sin correo', '', '', '', '', ''],
    ['arroba-suelta@', 'Malo', '', '', '', '', ''],
    ['b@b.es', '', '', '', '', '', ''],
  ], MAPA);
  assert.equal(r[0].estado, 'error');
  assert.match(r[0].motivo!, /Sin email/);
  assert.equal(r[1].estado, 'error');
  assert.match(r[1].motivo!, /inválido/);
  assert.equal(r[2].estado, 'error');
  assert.match(r[2].motivo!, /Sin nombre de estudio/);
});

test('⚠️ validarFilasProspecto marca el duplicado DENTRO del archivo, no solo el de la BD', () => {
  // Sin esto, la segunda fila pisaría a la primera en el upsert y el resumen
  // diría "2 importados" cuando solo hay un estudio.
  const r = validarFilasProspecto([
    ['dup@estudio.es', 'Primero', '', '', '', '', ''],
    ['DUP@estudio.es', 'Segundo', '', '', '', '', ''],
  ], MAPA);
  assert.equal(r[0].estado, 'ok');
  assert.equal(r[1].estado, 'error');
  assert.match(r[1].motivo!, /Repetido en el archivo/);
});

test('validarFilasProspecto tolera columnas ausentes (mapa a -1)', () => {
  const parcial: Record<CampoProspecto, number> = {
    email: 0, estudio: 1, web: -1, instagram: -1, telefono: -1, ciudad: -1, software_actual: -1,
  };
  const r = validarFilasProspecto([['a@a.es', 'Solo lo básico']], parcial);
  assert.equal(r[0].estado, 'ok');
  assert.equal(r[0].datos.web, null);
  assert.equal(r[0].datos.softwareActual, null);
});

// ─── Revisión del borrador ───────────────────────────────────────────────────

const LEAD: DatosProspecto = {
  estudio: 'Pilates BCN', web: 'pilatesbcn.es', instagram: '@pilatesbcn', softwareActual: 'Bsport',
};

const CUERPO_LIMPIO = `Hola,

He visto Pilates BCN y que gestionáis las reservas con Bsport. Os escribo por
una cosa concreta: cubrir una baja de instructora sigue siendo trabajo manual.

Si os interesa, os lo enseño en 15 minutos.

Marcos — Tentare`;

test('revisarBorrador no inventa avisos cuando el correo cuadra con el CSV', () => {
  const avisos = revisarBorrador({ asunto: 'Sobre las sustituciones en Pilates BCN', cuerpo: CUERPO_LIMPIO }, LEAD);
  assert.deepEqual(avisos, []);
  assert.equal(tieneAvisoGrave(avisos), false);
});

test('revisarBorrador caza el placeholder sin rellenar', () => {
  const avisos = revisarBorrador({ asunto: 'Hola [NOMBRE]', cuerpo: CUERPO_LIMPIO }, LEAD);
  assert.equal(avisos.length, 1);
  assert.equal(avisos[0].gravedad, 'alta');
  assert.match(avisos[0].texto, /Hueco sin rellenar/);
});

test('⚠️ revisarBorrador caza el software equivocado — el fallo que delata al bot', () => {
  const avisos = revisarBorrador(
    { asunto: 'Sobre Pilates BCN', cuerpo: CUERPO_LIMPIO.replace('Bsport', 'Momence') },
    LEAD,
  );
  assert.equal(tieneAvisoGrave(avisos), true);
  assert.match(avisos[0].texto, /momence/i);
  assert.match(avisos[0].texto, /consta Bsport/);
});

test('revisarBorrador avisa si menciona un software y no consta ninguno', () => {
  const avisos = revisarBorrador(
    { asunto: 'Sobre Pilates BCN', cuerpo: CUERPO_LIMPIO },
    { ...LEAD, softwareActual: null },
  );
  assert.ok(avisos.some(a => /no consta qué software/.test(a.texto)));
});

test('revisarBorrador avisa de un Instagram que el prospecto no tiene', () => {
  const avisos = revisarBorrador(
    { asunto: 'Sobre Pilates BCN', cuerpo: 'Os sigo en Instagram desde hace meses. Bsport. Pilates BCN.' },
    { ...LEAD, instagram: null },
  );
  assert.ok(avisos.some(a => a.gravedad === 'alta' && /Instagram/.test(a.texto)));
});

test('revisarBorrador NO avisa de Instagram si el prospecto sí lo tiene', () => {
  const avisos = revisarBorrador(
    { asunto: 'Sobre Pilates BCN', cuerpo: 'Os sigo en Instagram. Bsport. Pilates BCN.' },
    LEAD,
  );
  assert.equal(avisos.filter(a => /Instagram/.test(a.texto)).length, 0);
});

test('⚠️ revisarBorrador caza un precio que no está en el catálogo', () => {
  const avisos = revisarBorrador(
    { asunto: 'Sobre Pilates BCN', cuerpo: `${CUERPO_LIMPIO}\n\nDesde 19€/mes.` },
    LEAD,
  );
  assert.ok(avisos.some(a => a.gravedad === 'alta' && /19/.test(a.texto)));
});

test('revisarBorrador acepta los precios REALES de los planes sin quejarse', () => {
  // 29 / 59 / 149 salen de PLAN_INFO: si mañana suben, este test sigue valiendo
  // y es el correo el que tendría que cambiar, no al revés.
  for (const p of ['29€', '59 €', '149 euros']) {
    const avisos = revisarBorrador(
      { asunto: 'Sobre Pilates BCN', cuerpo: `${CUERPO_LIMPIO}\n\nDesde ${p} al mes.` },
      LEAD,
    );
    assert.equal(avisos.filter(a => /Precio/.test(a.texto)).length, 0, `falló con ${p}`);
  }
});

test('revisarBorrador avisa si no nombra al estudio (no está personalizado)', () => {
  const avisos = revisarBorrador(
    { asunto: 'Una propuesta', cuerpo: 'Hola, os escribo sobre vuestro estudio. Bsport.' },
    LEAD,
  );
  assert.ok(avisos.some(a => /No nombra/.test(a.texto)));
});

test('revisarBorrador avisa de un correo con longitud de folleto', () => {
  const largo = `Pilates BCN Bsport ${'palabra '.repeat(230)}`;
  const avisos = revisarBorrador({ asunto: 'Pilates BCN', cuerpo: largo }, LEAD);
  assert.ok(avisos.some(a => /palabras/.test(a.texto)));
});

test('tieneAvisoGrave distingue alta de media', () => {
  assert.equal(tieneAvisoGrave([{ gravedad: 'media', texto: 'x' }]), false);
  assert.equal(tieneAvisoGrave([{ gravedad: 'media', texto: 'x' }, { gravedad: 'alta', texto: 'y' }]), true);
});

// ─── Lotes y resumen ─────────────────────────────────────────────────────────

test('siguienteLote corta por el tamaño y nunca devuelve más de lo que hay', () => {
  const doce = Array.from({ length: 12 }, (_, i) => i);
  assert.equal(siguienteLote(doce).length, 10);
  assert.equal(siguienteLote([1, 2]).length, 2);
  assert.deepEqual(siguienteLote([], 10), []);
});

test('siguienteLote con tamaño negativo devuelve vacío, no lanza', () => {
  assert.deepEqual(siguienteLote([1, 2, 3], -5), []);
});

test('resumirProspeccion cuenta cada estado por separado', () => {
  const r = resumirProspeccion(100, [
    { estado: 'BORRADOR' }, { estado: 'BORRADOR' },
    { estado: 'APROBADO' },
    { estado: 'ENVIADO' }, { estado: 'ENVIADO' }, { estado: 'ENVIADO' },
    { estado: 'FALLIDO' },
    { estado: 'DESCARTADO' },
  ]);
  assert.deepEqual(r, { importados: 100, porRevisar: 2, aprobados: 1, enviados: 3, fallidos: 1 });
});
