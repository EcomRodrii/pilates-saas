import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  SIF, numeroInstalacionDeEstudio, indicadorMultiplesOT, productorDeEntorno, sistemaInformaticoParaEstudio,
  apartadosDeclaracion, textoDeclaracion, fechaSuscripcionValida, TITULO_DECLARACION,
} from './sif.ts';
import { apartadosDesdeTexto } from './declaracion.ts';
import { validarRegistroAlta, CLAVE_REGIMEN_GENERAL } from './xml.ts';

// ── Identidad del SIF ────────────────────────────────────────────────────────
test('el SIF: id de 2 caracteres, solo VERI*FACTU y multi-OT (Tentare es un SaaS multiestudio)', () => {
  assert.match(SIF.id, /^[A-Za-z0-9]{2}$/);
  assert.equal(SIF.soloVerifactu, true);
  assert.equal(SIF.multiOT, true);
  assert.ok(SIF.version.length > 0 && SIF.version.length <= 50);
});

test('NumeroInstalacion: determinista y estable (misma entrada, misma salida, siempre)', () => {
  const a = numeroInstalacionDeEstudio('studio-f7tq1id0bnbs');
  for (let i = 0; i < 5; i++) assert.equal(numeroInstalacionDeEstudio('studio-f7tq1id0bnbs'), a);
  assert.equal(a, 'studio-f7tq1id0bnbs');
});

test('dos estudios con el MISMO NIF (sedes de una cadena) tienen instalaciones DISTINTAS', () => {
  // El SIF se identifica por NIF + IdSIF + NumeroInstalacion (FAQ AEAT §4): con
  // el mismo NIF, solo el número de instalación separa sus cadenas.
  const sedeA = numeroInstalacionDeEstudio('studio-sedeA0000001');
  const sedeB = numeroInstalacionDeEstudio('studio-sedeB0000002');
  assert.notEqual(sedeA, sedeB);
  const p = { nombre: 'Productor', nif: '00000000T' };
  assert.notEqual(sistemaInformaticoParaEstudio(p, sedeA, 2).numeroInstalacion, sistemaInformaticoParaEstudio(p, sedeB, 2).numeroInstalacion);
});

test('NumeroInstalacion: nunca vacío, nunca más de 100 caracteres (XSD TextMax100)', () => {
  assert.throws(() => numeroInstalacionDeEstudio(''));
  assert.throws(() => numeroInstalacionDeEstudio('x'.repeat(101)));
  assert.throws(() => numeroInstalacionDeEstudio('estudio con espacios'));
});

test('IndicadorMultiplesOT: S solo si el usuario tiene más de una facturación', () => {
  assert.equal(indicadorMultiplesOT(0), false);
  assert.equal(indicadorMultiplesOT(1), false);
  assert.equal(indicadorMultiplesOT(2), true);
  assert.equal(indicadorMultiplesOT(7), true);
});

test('SistemaInformatico: el productor es la PERSONA, no «Tentare»; el nombre del sistema sí es Tentare', () => {
  const s = sistemaInformaticoParaEstudio({ nombre: 'Nombre Apellido Apellido', nif: '00000000T' }, 'studio-x', 1);
  assert.equal(s.nombreRazon, 'Nombre Apellido Apellido');
  assert.equal(s.nif, '00000000T');
  assert.equal(s.nombreSistemaInformatico, 'Tentare');
  assert.equal(s.idSistemaInformatico, SIF.id);
  assert.equal(s.version, SIF.version);
  assert.equal(s.multiOT, true);
  assert.equal(s.indicadorMultiplesOT, false);
  // Y cabe en un registro válido.
  const r = validarRegistroAlta({
    emisor: { nombreRazon: 'Estudio', nif: '99999999R' }, numSerieFactura: 'A-1', fechaExpedicionFactura: '05-09-2026',
    tipoFactura: 'F2', descripcionOperacion: 'x',
    desglose: [{ claveRegimen: CLAVE_REGIMEN_GENERAL, calificacionOperacion: 'S1', tipoImpositivo: 21, baseImponible: 1, cuotaRepercutida: 0.21 }],
    cuotaTotal: 0.21, importeTotal: 1.21, encadenamiento: null, sistemaInformatico: s,
    fechaHoraHusoGenRegistro: '2026-09-05T10:20:30+02:00', huella: 'A'.repeat(64),
  });
  assert.deepEqual(r, []);
});

// ── Productor ────────────────────────────────────────────────────────────────
test('sin datos del productor NO hay productor, y se dice qué falta (nada se inventa)', () => {
  const { productor, falta } = productorDeEntorno({});
  assert.equal(productor, null);
  assert.equal(falta.length, 3);
  assert.ok(falta.some(f => f.includes('VERIFACTU_PRODUCTOR_NOMBRE')));
  assert.ok(falta.some(f => f.includes('VERIFACTU_PRODUCTOR_NIF')));
  assert.ok(falta.some(f => f.includes('VERIFACTU_PRODUCTOR_DIRECCION')));
});

test('con los tres datos hay productor (NIF en mayúsculas)', () => {
  const { productor, falta } = productorDeEntorno({ VERIFACTU_PRODUCTOR_NOMBRE: ' Nombre Apellido ', VERIFACTU_PRODUCTOR_NIF: '00000000t', VERIFACTU_PRODUCTOR_DIRECCION: 'Calle de Ejemplo 1, 00000 Localidad' });
  assert.deepEqual(falta, []);
  assert.deepEqual(productor, { nombre: 'Nombre Apellido', nif: '00000000T', direccion: 'Calle de Ejemplo 1, 00000 Localidad' });
});

// ── Declaración responsable (Orden HAC/1177/2024, art. 15) ───────────────────
const PRODUCTOR = { nombre: 'Nombre de Ejemplo', nif: '00000000T', direccion: 'Calle de Ejemplo 1, 00000 Localidad, España' };
const SUSCRIPCION = { fecha: '30-09-2026', lugar: 'Localidad, España' };

test('declaración: empieza con el título exacto y lleva a)-l) en el orden del art. 15.1', () => {
  assert.equal(TITULO_DECLARACION, 'DECLARACIÓN RESPONSABLE DEL SISTEMA INFORMÁTICO DE FACTURACIÓN');
  const letras = apartadosDeclaracion(PRODUCTOR, SUSCRIPCION).map(a => a.letra);
  assert.deepEqual(letras, ['1.a', '1.b', '1.c', '1.d', '1.e', '1.f', '1.g', '1.h', '1.i', '1.j', '1.k', '1.l', '1.l']);
  const texto = textoDeclaracion(PRODUCTOR, SUSCRIPCION);
  assert.ok(texto.startsWith(`${TITULO_DECLARACION}\n\n1.a) `));
});

test('declaración: cada dato precedido del texto que lo describe, y con los valores del SIF y del productor', () => {
  const a = Object.fromEntries(apartadosDeclaracion(PRODUCTOR, SUSCRIPCION).map((x, i) => [`${x.letra}#${i}`, x]));
  assert.match(a['1.a#0'].etiqueta, /^Nombre del sistema informático/);
  assert.equal(a['1.a#0'].valor, 'Tentare');
  assert.equal(a['1.b#1'].valor, SIF.id);
  assert.equal(a['1.c#2'].valor, SIF.version);
  assert.equal(a['1.e#4'].valor, 'S - Sí');
  assert.equal(a['1.f#5'].valor, 'S - Sí');
  assert.match(a['1.h#7'].etiqueta, /Nombre y apellidos de la persona productora/);
  assert.equal(a['1.h#7'].valor, PRODUCTOR.nombre);
  assert.equal(a['1.i#8'].valor, PRODUCTOR.nif);
  assert.equal(a['1.j#9'].valor, PRODUCTOR.direccion);
  assert.match(a['1.k#10'].etiqueta, /cumple con lo dispuesto en el artículo 29\.2\.j\).*Real Decreto 1007\/2023.*Orden HAC\/1177\/2024/);
  assert.equal(a['1.l#11'].valor, '30-09-2026');
  assert.equal(a['1.l#12'].valor, 'Localidad, España');
});

test('declaración sin productor ni suscripción: los huecos son null, NUNCA un valor inventado', () => {
  const ap = apartadosDeclaracion(null, null);
  for (const letra of ['1.h', '1.i', '1.j']) assert.equal(ap.find(a => a.letra === letra)?.valor, null, letra);
  assert.ok(ap.filter(a => a.letra === '1.l').every(a => a.valor === null));
  // Lo que es del software sí está.
  assert.equal(ap.find(a => a.letra === '1.a')?.valor, 'Tentare');
});

test('el texto guardado se vuelve a leer igual (lo que se enseña es lo suscrito)', () => {
  const texto = textoDeclaracion(PRODUCTOR, SUSCRIPCION);
  assert.deepEqual(apartadosDesdeTexto(texto), apartadosDeclaracion(PRODUCTOR, SUSCRIPCION));
});

test('fecha de suscripción: día, mes y año, y que exista', () => {
  assert.equal(fechaSuscripcionValida('30-09-2026'), true);
  assert.equal(fechaSuscripcionValida('31-02-2026'), false);
  assert.equal(fechaSuscripcionValida('2026-09-30'), false);
});
