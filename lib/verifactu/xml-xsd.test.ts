// Lo que construye `xml.ts`, validado contra los XSD OFICIALES de la AEAT.
//
// Los esquemas de `./xsd/` son copias sin tocar de los publicados en
// prewww2.aeat.es/static_files/common/internet/dep/aplicaciones/es/aeat/tikeV1.0/cont/ws/
// (descargados el 30-sep-2026) más el XMLDSig de la W3C que importan. Para
// validar sin red, la copia temporal apunta ese import al fichero local.
//
// Usa `xmllint` (libxml2). Si no está instalado, el test se salta —se dice en
// la salida— en vez de dar un verde falso: el resto de `xml.test.ts` fija el
// orden a mano, pero solo esto demuestra que el esquema lo acepta.
//
// Por qué existe: hasta sep-2026 la `Cabecera` salía en el espacio de nombres
// equivocado (`sf:` en vez de `sfLR:`) y ningún test lo veía, porque todos
// comprobaban el texto que ya sabíamos escribir. El XSD no se puede engañar así.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, copyFileSync, readFileSync, writeFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  xmlRegistroAlta, xmlRegistroAnulacion, sobreSoapRegFactu, sobreSoapConsulta,
  CLAVE_REGIMEN_GENERAL, type RegistroAltaXml, type SistemaInformatico,
} from './xml.ts';

const DIR_XSD = join(dirname(fileURLToPath(import.meta.url)), 'xsd');
const hayXmllint = spawnSync('xmllint', ['--version']).status === 0;

function carpetaEsquemas(): string {
  const dir = mkdtempSync(join(tmpdir(), 'verifactu-xsd-'));
  for (const f of readdirSync(DIR_XSD)) copyFileSync(join(DIR_XSD, f), join(dir, f));
  const si = join(dir, 'SuministroInformacion.xsd');
  writeFileSync(si, readFileSync(si, 'utf8').replace(
    'schemaLocation="http://www.w3.org/TR/xmldsig-core/xmldsig-core-schema.xsd"',
    'schemaLocation="xmldsig-core-schema.xsd"',
  ));
  return dir;
}

/** El contenido del `soapenv:Body`, con los espacios de nombres del sobre copiados a su raíz. */
function cuerpoComoDocumento(sobre: string, raiz: string): string {
  const cuerpo = /<soapenv:Body>([\s\S]*)<\/soapenv:Body>/.exec(sobre)?.[1];
  assert.ok(cuerpo, 'el sobre no tiene Body');
  const decls = [...sobre.matchAll(/xmlns:(?!soapenv)\w+="[^"]*"/g)].map(m => m[0]).join(' ');
  return `<?xml version="1.0" encoding="UTF-8"?>${cuerpo.replace(`<${raiz}`, `<${raiz} ${decls}`)}`;
}

function validar(documento: string, esquema: string): { ok: boolean; salida: string } {
  const dir = carpetaEsquemas();
  try {
    const fichero = join(dir, 'doc.xml');
    writeFileSync(fichero, documento);
    const r = spawnSync('xmllint', ['--noout', '--nonet', '--schema', join(dir, esquema), fichero], { encoding: 'utf8' });
    return { ok: r.status === 0, salida: `${r.stdout}${r.stderr}` };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const SISTEMA: SistemaInformatico = {
  nombreRazon: 'Productor de Ejemplo', nif: '00000000T',
  nombreSistemaInformatico: 'Tentare', idSistemaInformatico: 'TE',
  version: '1.0.0', numeroInstalacion: 'studio-ejemplo',
  soloVerifactu: true, multiOT: true, indicadorMultiplesOT: false,
};

const F1: RegistroAltaXml = {
  emisor: { nombreRazon: 'Estudio & Pilates', nif: '99999999R' },
  numSerieFactura: 'A-2026-0001',
  fechaExpedicionFactura: '05-09-2026',
  tipoFactura: 'F1',
  descripcionOperacion: 'Bono 8 clases',
  destinatarios: [{ nombreRazon: 'Clienta de Ejemplo', nif: '12345678Z' }],
  desglose: [{ claveRegimen: CLAVE_REGIMEN_GENERAL, calificacionOperacion: 'S1', tipoImpositivo: 21, baseImponible: 52.89, cuotaRepercutida: 11.11 }],
  cuotaTotal: 11.11,
  importeTotal: 64,
  encadenamiento: { idEmisorFactura: '99999999R', numSerieFactura: 'A-2026-0000', fechaExpedicionFactura: '04-09-2026', huella: 'B'.repeat(64) },
  sistemaInformatico: SISTEMA,
  fechaHoraHusoGenRegistro: '2026-09-05T10:20:30+02:00',
  huella: 'A'.repeat(64),
};

const OBLIGADO = { nombreRazon: 'Estudio & Pilates', nif: '99999999R' };

test('alta F1, F2, R1 por sustitución, subsanación y anulación: el sobre valida contra SuministroLR.xsd', { skip: !hayXmllint && 'xmllint no instalado' }, () => {
  const f2 = xmlRegistroAlta({ ...F1, tipoFactura: 'F2', destinatarios: undefined, encadenamiento: null });
  const r1 = xmlRegistroAlta({
    ...F1, numSerieFactura: 'R-2026-0001', tipoFactura: 'R1', tipoRectificativa: 'S',
    facturasRectificadas: [{ idEmisorFactura: '99999999R', numSerieFactura: 'A-2026-0001', fechaExpedicionFactura: '05-09-2026' }],
    importeRectificacion: { baseRectificada: 52.89, cuotaRectificada: 11.11 },
  });
  const r5 = xmlRegistroAlta({ ...F1, numSerieFactura: 'R-2026-0002', tipoFactura: 'R5', tipoRectificativa: 'I', destinatarios: undefined });
  const subsanacion = xmlRegistroAlta({ ...F1, subsanacion: true, rechazoPrevio: 'X' });
  const anulacion = xmlRegistroAnulacion({
    facturaAnulada: { idEmisorFactura: '99999999R', numSerieFactura: 'A-2026-0001', fechaExpedicionFactura: '05-09-2026' },
    sinRegistroPrevio: true,
    encadenamiento: { idEmisorFactura: '99999999R', numSerieFactura: 'A-2026-0001', fechaExpedicionFactura: '05-09-2026', huella: 'A'.repeat(64) },
    sistemaInformatico: SISTEMA,
    fechaHoraHusoGenRegistro: '2026-09-07T10:20:30+02:00',
    huella: 'D'.repeat(64),
  });
  const sobre = sobreSoapRegFactu({ obligado: OBLIGADO, registros: [xmlRegistroAlta(F1), f2, r1, r5, subsanacion, anulacion] });
  const r = validar(cuerpoComoDocumento(sobre, 'sfLR:RegFactuSistemaFacturacion'), 'SuministroLR.xsd');
  assert.ok(r.ok, r.salida);
});

test('la consulta valida contra ConsultaLR.xsd', { skip: !hayXmllint && 'xmllint no instalado' }, () => {
  const sobre = sobreSoapConsulta({ obligado: OBLIGADO, ejercicio: '2026', periodo: '09', numSerieFactura: 'A-2026-0001' });
  const r = validar(cuerpoComoDocumento(sobre, 'con:ConsultaFactuSistemaFacturacion'), 'ConsultaLR.xsd');
  assert.ok(r.ok, r.salida);
});

test('el propio test detecta un sobre inválido: la cabecera en sf: (el error de antes) NO valida', { skip: !hayXmllint && 'xmllint no instalado' }, () => {
  const sobre = sobreSoapRegFactu({ obligado: OBLIGADO, registros: [xmlRegistroAlta(F1)] })
    .replaceAll('sfLR:Cabecera', 'sf:Cabecera');
  const r = validar(cuerpoComoDocumento(sobre, 'sfLR:RegFactuSistemaFacturacion'), 'SuministroLR.xsd');
  assert.equal(r.ok, false, 'un validador que lo acepta todo no vale como guardián');
});
