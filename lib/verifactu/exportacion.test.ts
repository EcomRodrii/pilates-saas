import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  csvRegistros, xmlRegistros, encadenamientos, nombreFichero, CABECERA_CSV,
  type RegistroExportable, type CabeceraExportacion,
} from './exportacion.ts';
import { sha256Texto } from './envio.ts';

const hayXmllint = spawnSync('xmllint', ['--version']).status === 0;

function reg(seq: number, extra: Partial<RegistroExportable> = {}): RegistroExportable {
  return {
    seq, tipo: 'ALTA', idEmisor: '99999999R', numSerie: `A-2026-${String(seq).padStart(4, '0')}`,
    fechaExpedicion: '30-09-2026', tipoFactura: 'F2', cuotaTotal: 2.1, importeTotal: 12.1,
    huellaAnterior: seq === 1 ? '' : `H${seq - 1}`, huella: `H${seq}`,
    fechaHoraHusoGen: '2026-09-30T14:33:46+02:00', estado: 'REGISTRADA', csv: `A-CSV${seq}`,
    codigoError: null, descripcionError: null, ...extra,
  };
}

const CAB: CabeceraExportacion = {
  nombreObligado: 'Estudio & Pilates', nifObligado: '99999999R',
  numeroInstalacion: 'studio-ejemplo', exportadoEn: '2026-09-30T12:00:00.000Z',
};

const lineas = (csv: string) => csv.replace(/^﻿/, '').split('\r\n').filter(Boolean).map(l => l.split(';'));
const col = (nombre: (typeof CABECERA_CSV)[number]) => CABECERA_CSV.indexOf(nombre);

test('encadenamientos: el primero sin anterior, los demás contra la huella del de delante', () => {
  assert.deepEqual(encadenamientos([reg(1), reg(2), reg(3)]), ['SI', 'SI', 'SI']);
  assert.deepEqual(encadenamientos([reg(1, { huellaAnterior: 'X' })]), ['NO']);
  assert.deepEqual(encadenamientos([reg(1), reg(2, { huellaAnterior: 'OTRA' })]), ['SI', 'NO']);
});

test('encadenamientos: un hueco en la posición es NO; un anterior sin huella no se puede saber', () => {
  assert.deepEqual(encadenamientos([reg(1), reg(3)]), ['SI', 'NO']);
  assert.deepEqual(encadenamientos([reg(2)]), ['NO']);
  assert.deepEqual(encadenamientos([reg(1, { huella: null, estado: 'RESERVADO' }), reg(2)]), ['SI', 'SIN_HUELLA']);
});

test('CSV: BOM, punto y coma, una fila por registro en orden de posición aunque lleguen desordenados', () => {
  const csv = [...csvRegistros([reg(2), reg(1)])].join('');
  assert.ok(csv.startsWith('﻿'));
  const [cab, ...filas] = lineas(csv);
  assert.deepEqual(cab, [...CABECERA_CSV]);
  assert.deepEqual(filas.map(f => f[col('Posición')]), ['1', '2']);
  assert.equal(filas[1][col('Encadena con el anterior')], 'Sí');
  assert.equal(filas[0][col('Estado')], 'Registrado en la AEAT');
  assert.equal(filas[0][col('Código seguro de verificación (AEAT)')], 'A-CSV1');
});

test('CSV: importes con coma decimal, y los negativos de una rectificativa siguen siendo números', () => {
  const csv = [...csvRegistros([reg(1, { tipoFactura: 'R5', cuotaTotal: -2.1, importeTotal: -12.1 })])].join('');
  const [, fila] = lineas(csv);
  assert.equal(fila[col('Cuota total')], '-2,10');
  assert.equal(fila[col('Importe total')], '-12,10');
});

test('CSV: un texto que empieza por = no se ejecuta como fórmula y un ; va entre comillas', () => {
  const csv = [...csvRegistros([reg(1, { estado: 'RECHAZADA', codigoError: '1100', descripcionError: '=HIPERVINCULO("x");mal' })])].join('');
  assert.match(csv, /;"'=HIPERVINCULO\(""x""\);mal"\r\n$/);
});

test('CSV: los estados sin enviar y los anteriores a Veri*Factu se dicen como tales', () => {
  const csv = [...csvRegistros([reg(1, { estado: 'HISTORICO', csv: null }), reg(2, { estado: 'PENDIENTE', csv: null })])].join('');
  const [, h, p] = lineas(csv);
  assert.equal(h[col('Estado')], 'No enviado (anterior al envío a la AEAT)');
  assert.equal(p[col('Estado')], 'Sin enviar');
});

test('XML: cada registro congelado se copia byte a byte, con su resumen y su estado', () => {
  const fragmento = '<sf:RegistroAlta><sf:IDVersion>1.0</sf:IDVersion><sf:NombreRazonEmisor>Estudio &amp; Pilates</sf:NombreRazonEmisor></sf:RegistroAlta>';
  const xml = [...xmlRegistros([reg(1, { xmlRegistro: fragmento, xmlSha256: sha256Texto(fragmento) }), reg(2, { estado: 'PENDIENTE', csv: null })], CAB)].join('');
  assert.ok(xml.includes(`>${fragmento}</Registro>`));
  assert.ok(xml.includes(`sha256="${sha256Texto(fragmento)}"`));
  assert.match(xml, /<Registro posicion="2" tipo="ALTA" estado="PENDIENTE"[^>]*encadenaConAnterior="true"\/>/);
  assert.match(xml, /nombreObligado="Estudio &amp; Pilates"/);
  assert.match(xml, /registros="2"/);
});

test('XML: es un documento bien formado aunque los registros no declaren el espacio de nombres', { skip: !hayXmllint && 'xmllint no instalado' }, () => {
  const fragmento = '<sf:RegistroAnulacion><sf:IDVersion>1.0</sf:IDVersion></sf:RegistroAnulacion>';
  const xml = [...xmlRegistros([reg(1, { tipo: 'ANULACION', xmlRegistro: fragmento, xmlSha256: sha256Texto(fragmento), descripcionError: 'a < b & "c"' })], CAB)].join('');
  const r = spawnSync('xmllint', ['--noout', '--nonet', '-'], { input: xml, encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
});

test('nombreFichero: con el día del estudio, no el UTC', () => {
  // 30-sep 23:30 UTC ya es 1-oct en Madrid.
  assert.equal(nombreFichero('csv', new Date('2026-09-30T23:30:00Z')), 'registros-verifactu-2026-10-01.csv');
  assert.equal(nombreFichero('xml', new Date('2026-09-30T10:00:00Z')), 'registros-verifactu-2026-09-30.xml');
});

test('una anterior no remitida por decisión se dice como tal, en el CSV y en el XML', () => {
  const csv = [...csvRegistros([reg(1, { estado: 'PENDIENTE', csv: null, noRemitido: true })])].join('');
  const [, fila] = lineas(csv);
  assert.equal(fila[col('Estado')], 'No remitido: anterior a VERI*FACTU');
  const xml = [...xmlRegistros([reg(1, { estado: 'PENDIENTE', csv: null, noRemitido: true })], CAB)].join('');
  assert.match(xml, /estado="PENDIENTE" remision="NO_REMITIDO_ANTERIOR_A_VERIFACTU"/);
});
