// Veri*Factu — pruebas contra el entorno de PREPRODUCCIÓN de la AEAT.
//
// Lo corre una persona, a mano, con SU certificado de persona física y SU NIF
// como obligado tributario (en preproducción no hace falta ningún poder: uno es
// su propio obligado). No toca la base de datos ni ningún estudio.
//
//   VERIFACTU_ENVIRONMENT=preproduction \
//   CERTIFICATE_PFX="$(base64 -i mi-certificado.p12)" CERTIFICATE_PASSWORD='…' \
//   VERIFACTU_PRODUCTOR_NIF=… VERIFACTU_PRODUCTOR_NOMBRE='APELLIDOS NOMBRE' \
//   node --experimental-strip-types scripts/verifactu-preproduccion.ts MODO
//
// Modos:
//   alta                       una factura simplificada (F2)
//   consulta NUM dd-mm-aaaa    lo que la AEAT tiene de esa factura
//   bateria                    la tanda completa: F1 con destinatario,
//                              rectificativa por diferencias, alta de
//                              subsanación, F2 y su anulación, un duplicado a
//                              propósito y las consultas que lo comprueban
//   bateria2 [--cadena N]      lo que el asesor pidió además: reenvío idéntico
//                              (reintento), rectificativa por sustitución, factura
//                              tras una anulación, rechazo provocado y su
//                              corrección encadenada al rechazado, N facturas
//                              seguidas (20 por defecto) y el QR de cotejo
//   revisar BASE [dd-mm-aaaa]  solo consultas: qué tiene la AEAT de cada factura
//                              de una bateria2 ya enviada (BASE =
//                              PRUEBA-TENTARE-AAAAMMDDhhmmss); no envía nada
//
// La cadena (el último registro admitido) se guarda en
// ~/.tentare/verifactu-preproduccion.json, fuera del repo: cada ejecución
// continúa donde lo dejó la anterior. Para empezar desde un registro concreto:
//   … MODO --anterior NUM dd-mm-aaaa HUELLA
//
// ⚠️ El .p12 que exporta el Llavero de macOS usa cifrado antiguo y Node 26 lo
// rechaza («Unsupported PKCS12 PFX data»). Hay que convertirlo a AES-256 antes
// (docs internos de Veri*Factu); es el mismo formato que necesita Vercel.
// ⚠️ SE NIEGA A CORRER CONTRA PRODUCCIÓN. En producción las facturas de prueba
// son facturas reales (FAQ de desarrolladores de la AEAT) y habría que anularlas.
// ⚠️ La AEAT prohíbe las «pruebas masivas» en su portal de pruebas: la batería
// son seis envíos, respetando el tiempo de espera que devuelve cada respuesta.
// ⚠️ Nunca imprime el certificado ni su contraseña.

import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { calcularHuellaAlta, calcularHuellaAnulacion } from '../lib/verifactu.ts';
import { fechaHoraHusoMadrid, urlQrVerifactu } from '../lib/verifactu-qr.ts';
import {
  xmlRegistroAlta, xmlRegistroAnulacion, sobreSoapRegFactu, sobreSoapConsulta, periodoDeFecha,
  CLAVE_REGIMEN_GENERAL, RegistroInvalidoError, type EncadenamientoAnterior, type IdFacturaXml,
} from '../lib/verifactu/xml.ts';
import { llamarAeat, huellaCredencial } from '../lib/verifactu/envio.ts';
import { parsearRespuestaAeat, parsearRespuestaConsulta, CODIGO_DUPLICADO, type RegistroConsultado } from '../lib/verifactu/respuesta.ts';
import { marcasSubsanacion, marcasAnulacion } from '../lib/verifactu/subsanacion.ts';
import { endpointVerifactu } from '../lib/verifactu/endpoints.ts';
import { certificadoDeEntorno, entornoTransmision } from '../lib/verifactu/config.ts';
import { sistemaInformaticoParaEstudio } from '../lib/verifactu/sif.ts';

function salir(mensaje: string): never {
  console.error(`✖ ${mensaje}`);
  process.exit(1);
}

// `--simular`: construye los mismos registros y los valida contra los XSD
// oficiales (lib/verifactu/xsd) con xmllint, sin certificado ni red, sin
// esperas y SIN tocar el fichero de la cadena. Para cazar errores de formato
// aquí y no en la AEAT.
const simular = process.argv.includes('--simular');
if (!simular && entornoTransmision() !== 'preproduccion') {
  salir('Este script solo corre con VERIFACTU_ENVIRONMENT=preproduction. Nunca contra producción.');
}
const certificado = simular ? null : (certificadoDeEntorno() ?? salir('Falta CERTIFICATE_PFX o CERTIFICATE_PASSWORD.'));
const nif = (process.env.VERIFACTU_PRODUCTOR_NIF ?? (simular ? '99999999R' : '')).trim().toUpperCase();
const nombre = (process.env.VERIFACTU_PRODUCTOR_NOMBRE ?? (simular ? 'PRUEBA EJEMPLO' : '')).trim();
if (nif.length !== 9) salir('VERIFACTU_PRODUCTOR_NIF debe ser tu NIF (9 caracteres): eres el obligado de la prueba.');
if (!nombre) salir('Falta VERIFACTU_PRODUCTOR_NOMBRE (tu nombre y apellidos, como en el censo).');

const destino = { entorno: 'preproduccion' as const, certificado: 'representante' as const };
const obligado = { nombreRazon: nombre, nif };
// La misma identidad de SIF que en producción; instalación propia de pruebas.
const sistema = sistemaInformaticoParaEstudio({ nombre, nif }, 'preproduccion', 1);

// ── La cadena, entre ejecuciones ──────────────────────────────────────────────
interface Punta { nif: string; numSerie: string; fecha: string; huella: string }
const RUTA_ESTADO = join(homedir(), '.tentare', 'verifactu-preproduccion.json');

function leerPunta(): Punta | null {
  try {
    const p = JSON.parse(readFileSync(RUTA_ESTADO, 'utf8')) as Punta;
    return p.nif === nif ? p : null;
  } catch {
    return null;
  }
}
function guardarPunta(p: Punta) {
  if (simular) return; // una simulación nunca mueve la cadena real
  mkdirSync(join(homedir(), '.tentare'), { recursive: true });
  writeFileSync(RUTA_ESTADO, JSON.stringify(p, null, 2) + '\n', { mode: 0o600 });
}

const [modo = 'alta', ...resto] = process.argv.slice(2).filter(a => a !== '--simular');
let punta = leerPunta();
const i = resto.indexOf('--anterior');
if (i >= 0) {
  const [numSerie, fecha, huella] = resto.slice(i + 1, i + 4);
  if (!numSerie || !/^\d{2}-\d{2}-\d{4}$/.test(fecha ?? '') || !/^[0-9A-F]{64}$/.test(huella ?? '')) {
    salir('Uso: --anterior NUM_SERIE dd-mm-aaaa HUELLA(64 hex mayúsculas)');
  }
  punta = { nif, numSerie, fecha: fecha!, huella: huella! };
  guardarPunta(punta);
}

function encadenamiento(): EncadenamientoAnterior | null {
  return punta ? { idEmisorFactura: nif, numSerieFactura: punta.numSerie, fechaExpedicionFactura: punta.fecha, huella: punta.huella } : null;
}

if (certificado) {
  console.log(`→ ${endpointVerifactu(destino)}`);
  console.log(`  credencial (SHA-256 del .pfx): ${huellaCredencial(certificado).slice(0, 16)}…`);
} else {
  console.log('→ SIMULACIÓN: nada sale hacia la AEAT; cada registro se valida contra los XSD oficiales');
}
console.log(`  cadena: ${punta ? `sigue a ${punta.numSerie}` : 'primer registro'}`);

// ── Validación local contra los XSD (solo en --simular) ─────────────────────
const DIR_XSD = join(dirname(fileURLToPath(import.meta.url)), '..', 'lib', 'verifactu', 'xsd');
function validarXsd(sobre: string, raiz: string, esquema: string): { ok: boolean; salida: string } {
  if (spawnSync('xmllint', ['--version']).status !== 0) return { ok: false, salida: 'xmllint no está instalado' };
  const dir = mkdtempSync(join(tmpdir(), 'verifactu-xsd-'));
  try {
    for (const f of readdirSync(DIR_XSD)) copyFileSync(join(DIR_XSD, f), join(dir, f));
    const si = join(dir, 'SuministroInformacion.xsd');
    writeFileSync(si, readFileSync(si, 'utf8').replace(
      'schemaLocation="http://www.w3.org/TR/xmldsig-core/xmldsig-core-schema.xsd"', 'schemaLocation="xmldsig-core-schema.xsd"'));
    const cuerpo = /<soapenv:Body>([\s\S]*)<\/soapenv:Body>/.exec(sobre)?.[1] ?? '';
    const decls = [...sobre.matchAll(/xmlns:(?!soapenv)\w+="[^"]*"/g)].map(m => m[0]).join(' ');
    writeFileSync(join(dir, 'doc.xml'), `<?xml version="1.0" encoding="UTF-8"?>${cuerpo.replace(`<${raiz}`, `<${raiz} ${decls}`)}`);
    const r = spawnSync('xmllint', ['--noout', '--nonet', '--schema', join(dir, esquema), join(dir, 'doc.xml')], { encoding: 'utf8' });
    return { ok: r.status === 0, salida: `${r.stdout}${r.stderr}`.trim() };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

// ── Envío ─────────────────────────────────────────────────────────────────────
let esperaMs = 0;
const dormir = (ms: number) => new Promise(r => setTimeout(r, ms));

interface Resultado { estado: string | null; codigo: string | null; descripcion: string | null; duplicado: unknown }

/**
 * Envía UN registro: primero espera lo que pidió la AEAT, y solo entonces lo
 * construye (su marca de hora y su enlace con la cadena salen del momento real
 * del envío). La cadena avanza solo si la AEAT lo admite.
 */
async function enviar(construir: () => { xml: string; huella: string }, numSerie: string, fecha: string): Promise<{ res: Resultado | null; huella: string; xml: string }> {
  await esperarTurno();
  const { xml: registroXml, huella } = construir();
  return { res: await enviarXml(registroXml, { numSerie, fecha, huella }), huella, xml: registroXml };
}

async function esperarTurno() {
  if (esperaMs > 0) {
    console.log(`  (esperando ${Math.round(esperaMs / 1000)} s: lo pide la AEAT entre envíos)`);
    await dormir(esperaMs);
  }
}

async function enviarXml(registroXml: string, nuevaPunta: Omit<Punta, 'nif'>): Promise<Resultado | null> {
  const sobre = sobreSoapRegFactu({ obligado, registros: [registroXml] });
  if (!certificado) {
    const v = validarXsd(sobre, 'sfLR:RegFactuSistemaFacturacion', 'SuministroLR.xsd');
    if (v.ok) punta = { nif, ...nuevaPunta };
    return { estado: v.ok ? 'XSD_OK' : 'XSD_KO', codigo: null, descripcion: v.ok ? null : v.salida, duplicado: null };
  }
  const r = await llamarAeat(sobre, certificado, destino);
  if (r.fallo) {
    console.log(`  ✖ sin respuesta válida (${r.fallo}): ${r.error ?? ''}`);
    esperaMs = 60_000;
    return null;
  }
  const res = parsearRespuestaAeat(r.cuerpo);
  esperaMs = ((res.tiempoEsperaSegundos ?? 60) + 2) * 1000;
  if (res.fault) {
    console.log(`  ✖ la AEAT rechazó el envío entero: ${res.faultCodigo ?? ''} ${res.faultMensaje ?? ''}`);
    return null;
  }
  const reg = res.registros[0];
  if (res.csv) console.log(`  CSV ${res.csv}`);
  if (reg && (reg.estado === 'Correcto' || reg.estado === 'AceptadoConErrores')) {
    punta = { nif, ...nuevaPunta };
    guardarPunta(punta);
  }
  return reg ? { estado: reg.estado, codigo: reg.codigoError, descripcion: reg.descripcionError, duplicado: reg.duplicado } : null;
}

function informe(paso: string, res: Resultado | null, esperado: (r: Resultado) => boolean) {
  // En simulación solo se sabe si el XSD lo acepta; lo que responda la AEAT no.
  const ok = res !== null && (simular ? res.estado === 'XSD_OK' : esperado(res));
  console.log(`${ok ? '✅' : '❌'} ${paso}: ${res?.estado ?? 'sin respuesta'}${res?.codigo ? ` · ${res.codigo} ${res.descripcion ?? ''}` : ''}`);
  if (res?.duplicado) console.log(`   duplicado: ${JSON.stringify(res.duplicado)}`);
  return ok;
}

interface Alta {
  numSerie: string;
  tipo: 'F1' | 'F2' | 'R1';
  descripcion: string;
  base: number;
  conDestinatario: boolean;
  rectifica?: IdFacturaXml;
  /** Rectificativa por SUSTITUCIÓN: base y cuota de la factura sustituida (ImporteRectificacion). Sin esto, por diferencias. */
  sustituye?: { base: number; cuota: number };
  /** Alta de subsanación: 'existe' si la AEAT tiene el registro (S + N), 'no_existe' si no (S + X). */
  subsanacion?: 'existe' | 'no_existe';
}

/** IVA general sobre la base: la misma cuenta para el registro y para el QR. */
function importesDe(base: number): { cuota: number; total: number } {
  const cuota = Math.round(base * 21) / 100;
  return { cuota, total: Math.round((base + cuota) * 100) / 100 };
}

function registroAlta(a: Alta, fecha: string): { xml: string; huella: string } {
  const ts = fechaHoraHusoMadrid(new Date());
  const { cuota, total } = importesDe(a.base);
  const huella = calcularHuellaAlta({
    idEmisorFactura: nif, numSerieFactura: a.numSerie, fechaExpedicionFactura: fecha,
    tipoFactura: a.tipo, cuotaTotal: cuota, importeTotal: total, fechaHoraHusoGenRegistro: ts,
  }, punta?.huella ?? '');
  const xml = xmlRegistroAlta({
    emisor: obligado,
    numSerieFactura: a.numSerie,
    fechaExpedicionFactura: fecha,
    ...(a.subsanacion ? marcasSubsanacion({ existeEnAeat: a.subsanacion === 'existe', subsanacionAnteriorRechazada: false }) : {}),
    tipoFactura: a.tipo,
    ...(a.rectifica ? {
      tipoRectificativa: a.sustituye ? 'S' : 'I',
      facturasRectificadas: [a.rectifica],
      ...(a.sustituye ? { importeRectificacion: { baseRectificada: a.sustituye.base, cuotaRectificada: a.sustituye.cuota } } : {}),
    } : {}),
    descripcionOperacion: a.descripcion,
    // Destinatario de la prueba: el propio obligado (no hay otro NIF que usar sin datos ajenos).
    ...(a.conDestinatario ? { destinatarios: [obligado] } : {}),
    desglose: [{ claveRegimen: CLAVE_REGIMEN_GENERAL, calificacionOperacion: 'S1', tipoImpositivo: 21, baseImponible: a.base, cuotaRepercutida: cuota }],
    cuotaTotal: cuota,
    importeTotal: total,
    encadenamiento: encadenamiento(),
    sistemaInformatico: sistema,
    fechaHoraHusoGenRegistro: ts,
    huella,
  });
  return { xml, huella };
}

function registroAnulacion(anulada: IdFacturaXml): { xml: string; huella: string } {
  const ts = fechaHoraHusoMadrid(new Date());
  const huella = calcularHuellaAnulacion({
    idEmisorFacturaAnulada: nif, numSerieFacturaAnulada: anulada.numSerieFactura,
    fechaExpedicionFacturaAnulada: anulada.fechaExpedicionFactura, fechaHoraHusoGenRegistro: ts,
  }, punta?.huella ?? '');
  const xml = xmlRegistroAnulacion({
    facturaAnulada: anulada,
    ...marcasAnulacion({ existeEnAeat: true, anulacionAnteriorRechazada: false }),
    encadenamiento: encadenamiento(),
    sistemaInformatico: sistema,
    fechaHoraHusoGenRegistro: ts,
    huella,
  });
  return { xml, huella };
}

async function consultar(numSerie: string, fecha: string) {
  const sobre = sobreSoapConsulta({ obligado, ...periodoDeFecha(fecha), numSerieFactura: numSerie });
  if (!certificado) {
    const v = validarXsd(sobre, 'con:ConsultaFactuSistemaFacturacion', 'ConsultaLR.xsd');
    console.log(`${v.ok ? '✅' : '❌'} consulta de ${numSerie}: ${v.ok ? 'XSD_OK' : v.salida}`);
    return null;
  }
  const r = await llamarAeat(sobre, certificado, destino);
  return r.fallo ? null : parsearRespuestaConsulta(r.cuerpo);
}

/**
 * Lo que la AEAT tiene de UNA factura, y si no lo devuelve, POR QUÉ.
 *
 * En la tanda 2 del 30-sep, 24 consultas seguidas sin pausa dejaron 6 sin
 * respuesta útil (las 20 facturas se habían admitido con justificante) y el
 * script no decía el motivo. Ahora: una pausa entre consultas, un segundo
 * intento, y el motivo siempre (transporte, error de la AEAT o «SinDatos»).
 */
const PAUSA_CONSULTA_MS = 2000;

/** Para `informe`: sin factura, el motivo en lugar de un «sin respuesta» mudo. */
function resultadoDeConsulta(c: { reg: RegistroConsultado | null; motivo: string | null }): Resultado {
  return c.reg
    ? { estado: c.reg.estado, codigo: null, descripcion: null, duplicado: null }
    : { estado: null, codigo: 'no la devuelve:', descripcion: c.motivo, duplicado: null };
}
async function consultarUna(numSerie: string, fecha: string): Promise<{ reg: RegistroConsultado | null; motivo: string | null }> {
  if (!certificado) {
    await consultar(numSerie, fecha);
    return { reg: null, motivo: 'simulación' };
  }
  const sobre = sobreSoapConsulta({ obligado, ...periodoDeFecha(fecha), numSerieFactura: numSerie });
  let motivo: string | null = null;
  for (let intento = 1; intento <= 2; intento++) {
    await dormir(intento === 1 ? PAUSA_CONSULTA_MS : 10_000);
    const r = await llamarAeat(sobre, certificado, destino);
    if (r.fallo) {
      motivo = `sin respuesta (${r.fallo}${r.error ? `: ${r.error}` : ''})`;
      continue;
    }
    const c = parsearRespuestaConsulta(r.cuerpo);
    if (c.fault) {
      motivo = `la AEAT devolvió un error: ${c.faultCodigo ?? ''} ${c.faultMensaje ?? ''}`.trim();
      continue;
    }
    const reg = c.registros.find(x => x.numSerieFactura === numSerie) ?? null;
    if (reg) return { reg, motivo: null };
    motivo = c.resultado === 'SinDatos'
      ? 'la AEAT dice que no tiene esa factura (SinDatos)'
      : `respuesta sin esa factura (resultado ${c.resultado ?? 'ilegible'}, ${c.registros.length} registros)`;
  }
  return { reg: null, motivo };
}

function fechaDeHoy(): string {
  const [y, m, d] = fechaHoraHusoMadrid(new Date()).slice(0, 10).split('-');
  return `${d}-${m}-${y}`;
}
const sello = () => fechaHoraHusoMadrid(new Date()).slice(0, 19).replace(/[-:T]/g, '');

// ── Modos ─────────────────────────────────────────────────────────────────────
try {
  if (modo === 'consulta') {
    const [numSerie, fecha] = resto;
    if (!numSerie || !fecha) salir('Uso: consulta NUM_SERIE dd-mm-aaaa');
    console.log(JSON.stringify(await consultar(numSerie, fecha), null, 2));
  } else if (modo === 'alta') {
    const fecha = fechaDeHoy();
    const numSerie = `PRUEBA-TENTARE-${sello()}`;
    console.log(`  factura de prueba: ${numSerie} · ${fecha}`);
    const { res } = await enviar(() => registroAlta({ numSerie, tipo: 'F2', descripcion: 'Prueba de integración Veri*Factu (preproducción)', base: 10, conDestinatario: false }, fecha), numSerie, fecha);
    informe('Alta F2', res, r => r.estado === 'Correcto');
  } else if (modo === 'bateria') {
    const fecha = fechaDeHoy();
    const base = `PRUEBA-TENTARE-${sello()}`;
    const f1: IdFacturaXml = { idEmisorFactura: nif, numSerieFactura: `${base}-F1`, fechaExpedicionFactura: fecha };
    const r1: IdFacturaXml = { ...f1, numSerieFactura: `${base}-R1` };
    const f2: IdFacturaXml = { ...f1, numSerieFactura: `${base}-F2` };
    const oks: boolean[] = [];

    console.log('\n1) Factura completa F1, con destinatario');
    let e = await enviar(() => registroAlta({ numSerie: f1.numSerieFactura, tipo: 'F1', descripcion: 'Prueba F1 con destinatario', base: 10, conDestinatario: true }, fecha), f1.numSerieFactura, fecha);
    oks.push(informe('F1', e.res, r => r.estado === 'Correcto'));

    console.log('\n2) Rectificativa R1 por diferencias de la F1');
    e = await enviar(() => registroAlta({ numSerie: r1.numSerieFactura, tipo: 'R1', descripcion: 'Prueba R1 por diferencias', base: -2, conDestinatario: true, rectifica: f1 }, fecha), r1.numSerieFactura, fecha);
    oks.push(informe('R1', e.res, r => r.estado === 'Correcto'));

    console.log('\n3) Alta de subsanación de la F1 (Subsanacion=S)');
    e = await enviar(() => registroAlta({ numSerie: f1.numSerieFactura, tipo: 'F1', descripcion: 'Prueba F1 con destinatario (subsanada)', base: 10, conDestinatario: true, subsanacion: 'existe' }, fecha), f1.numSerieFactura, fecha);
    const huellaSubsanacion = e.huella;
    oks.push(informe('Subsanación', e.res, r => r.estado === 'Correcto'));

    console.log('\n4) Factura simplificada F2');
    e = await enviar(() => registroAlta({ numSerie: f2.numSerieFactura, tipo: 'F2', descripcion: 'Prueba F2 que se anulará', base: 5, conDestinatario: false }, fecha), f2.numSerieFactura, fecha);
    oks.push(informe('F2', e.res, r => r.estado === 'Correcto'));

    console.log('\n5) Anulación de la F2');
    e = await enviar(() => registroAnulacion(f2), f2.numSerieFactura, fecha);
    oks.push(informe('Anulación', e.res, r => r.estado === 'Correcto'));

    console.log('\n6) Duplicado a propósito: la F1 otra vez, como alta normal');
    e = await enviar(() => registroAlta({ numSerie: f1.numSerieFactura, tipo: 'F1', descripcion: 'Prueba F1 con destinatario', base: 10, conDestinatario: true }, fecha), f1.numSerieFactura, fecha);
    oks.push(informe(`Duplicado (se espera rechazo ${CODIGO_DUPLICADO})`, e.res, r => r.estado === 'Incorrecto' && r.codigo === CODIGO_DUPLICADO));

    console.log('\n7) Consultas');
    if (simular) {
      await consultar(f1.numSerieFactura, fecha);
      console.log(`\n${oks.filter(Boolean).length} de ${oks.length} registros válidos según el XSD (simulación: no se ha enviado nada).`);
      process.exit(0);
    }
    const cF1 = await consultarUna(f1.numSerieFactura, fecha);
    const f1TieneSubsanacion = cF1.reg?.huella === huellaSubsanacion;
    oks.push(informe(`F1 en la AEAT (se espera la huella de la subsanación: ${f1TieneSubsanacion ? 'coincide' : 'NO coincide'})`,
      resultadoDeConsulta(cF1), r => r.estado === 'Correcto' && f1TieneSubsanacion));
    oks.push(informe('F2 en la AEAT (se espera Anulado)', resultadoDeConsulta(await consultarUna(f2.numSerieFactura, fecha)), r => r.estado === 'Anulado'));

    console.log(`\n${oks.filter(Boolean).length} de ${oks.length} pasos como se esperaba.`);
  } else if (modo === 'bateria2') {
    // Segunda tanda: lo que el asesor pidió probar además de la primera (30-sep).
    const iC = resto.indexOf('--cadena');
    const nCadena = iC >= 0 ? Math.max(1, Math.min(50, Number(resto[iC + 1]) || 20)) : 20;
    const fecha = fechaDeHoy();
    const base = `PRUEBA-TENTARE-${sello()}`;
    const id = (sufijo: string): IdFacturaXml => ({ idEmisorFactura: nif, numSerieFactura: `${base}-${sufijo}`, fechaExpedicionFactura: fecha });
    const f1 = id('F1'), r1s = id('R1S'), f2a = id('F2A'), f2b = id('F2B'), sub = id('SUB');
    const oks: boolean[] = [];
    const cuenta = (r: Resultado | null, esperado: string) => (simular ? r?.estado === 'XSD_OK' : r?.estado === esperado);
    if (!simular) console.log(`  (dura unos ${8 + nCadena} minutos: la AEAT pide un minuto entre envíos)`);

    console.log('\n1) F1 con destinatario');
    let e = await enviar(() => registroAlta({ numSerie: f1.numSerieFactura, tipo: 'F1', descripcion: 'Prueba F1 (tanda 2)', base: 10, conDestinatario: true }, fecha), f1.numSerieFactura, fecha);
    const primeraF1 = e;
    oks.push(informe('F1', e.res, r => r.estado === 'Correcto'));

    console.log('\n2) Reintento: el MISMO registro otra vez, idéntico (lo que haría Tentare tras un corte)');
    await esperarTurno();
    const reenvio = await enviarXml(primeraF1.xml, { numSerie: f1.numSerieFactura, fecha, huella: primeraF1.huella });
    oks.push(informe(`Reenvío idéntico (se espera ${CODIGO_DUPLICADO} con el original «Correcta»: no cuenta dos veces)`, reenvio,
      r => r.estado === 'Incorrecto' && r.codigo === CODIGO_DUPLICADO && (r.duplicado as { estado?: string } | null)?.estado === 'Correcta'));

    console.log('\n3) Rectificativa por sustitución (R1, tipo S) de la F1');
    e = await enviar(() => registroAlta({ numSerie: r1s.numSerieFactura, tipo: 'R1', descripcion: 'Prueba R1 por sustitución', base: 8, conDestinatario: true, rectifica: f1, sustituye: { base: 10, cuota: importesDe(10).cuota } }, fecha), r1s.numSerieFactura, fecha);
    oks.push(informe('R1 por sustitución', e.res, r => r.estado === 'Correcto'));

    console.log('\n4) F2, 5) su anulación y 6) otra F2 después de anular');
    e = await enviar(() => registroAlta({ numSerie: f2a.numSerieFactura, tipo: 'F2', descripcion: 'Prueba F2 que se anulará', base: 5, conDestinatario: false }, fecha), f2a.numSerieFactura, fecha);
    oks.push(informe('F2', e.res, r => r.estado === 'Correcto'));
    e = await enviar(() => registroAnulacion(f2a), f2a.numSerieFactura, fecha);
    oks.push(informe('Anulación', e.res, r => r.estado === 'Correcto'));
    e = await enviar(() => registroAlta({ numSerie: f2b.numSerieFactura, tipo: 'F2', descripcion: 'Prueba F2 después de una anulación', base: 7, conDestinatario: false }, fecha), f2b.numSerieFactura, fecha);
    const huellaF2b = e.huella;
    oks.push(informe('F2 después de la anulación', e.res, r => r.estado === 'Correcto'));

    console.log('\n7) Rechazo provocado: subsanación (S + N) de una factura que la AEAT no tiene');
    e = await enviar(() => registroAlta({ numSerie: sub.numSerieFactura, tipo: 'F2', descripcion: 'Prueba de rechazo', base: 3, conDestinatario: false, subsanacion: 'existe' }, fecha), sub.numSerieFactura, fecha);
    const rechazado = { numSerie: sub.numSerieFactura, fecha, huella: e.huella };
    oks.push(informe('Rechazo (se espera Incorrecto)', e.res, r => r.estado === 'Incorrecto'));

    console.log('\n8) Corrección: alta S + X, encadenada al registro RECHAZADO (como hace Tentare en producción)');
    const puntaAdmitida = punta;
    punta = { nif, ...rechazado };
    e = await enviar(() => registroAlta({ numSerie: sub.numSerieFactura, tipo: 'F2', descripcion: 'Prueba de rechazo (corregida)', base: 3, conDestinatario: false, subsanacion: 'no_existe' }, fecha), sub.numSerieFactura, fecha);
    const corregido = e.res?.estado === 'Correcto' || e.res?.estado === 'AceptadoConErrores' || e.res?.estado === 'XSD_OK';
    if (!corregido) {
      // La AEAT no acepta ese enlace: la cadena sigue desde el último admitido.
      punta = puntaAdmitida;
      if (punta) guardarPunta(punta);
    }
    const huellaCorreccion = e.huella;
    oks.push(informe('Corrección encadenada al rechazado', e.res, r => r.estado === 'Correcto'));

    console.log(`\n9) Cadena de ${nCadena} facturas seguidas`);
    const cadena: { numSerie: string; huella: string }[] = [];
    for (let k = 1; k <= nCadena; k++) {
      const numSerie = `${base}-C${String(k).padStart(2, '0')}`;
      e = await enviar(() => registroAlta({ numSerie, tipo: 'F2', descripcion: `Prueba de cadena ${k}/${nCadena}`, base: 1 + k, conDestinatario: false }, fecha), numSerie, fecha);
      const ok = cuenta(e.res, 'Correcto');
      console.log(`  ${ok ? '✅' : '❌'} ${k}/${nCadena}: ${e.res?.estado ?? 'sin respuesta'}${e.res?.codigo ? ` · ${e.res.codigo} ${e.res.descripcion ?? ''}` : ''}`);
      if (!ok) break;
      cadena.push({ numSerie, huella: e.huella });
    }
    oks.push(cadena.length === nCadena);

    console.log('\n10) Consultas');
    if (simular) {
      await consultar(f1.numSerieFactura, fecha);
      console.log(`\n${oks.filter(Boolean).length} de ${oks.length} pasos válidos según el XSD (simulación: no se ha enviado nada).`);
      process.exit(0);
    }
    oks.push(informe('F1 en la AEAT', resultadoDeConsulta(await consultarUna(f1.numSerieFactura, fecha)), r => r.estado === 'Correcto'));
    oks.push(informe('F2 anulada en la AEAT (se espera Anulado)', resultadoDeConsulta(await consultarUna(f2a.numSerieFactura, fecha)), r => r.estado === 'Anulado'));
    const cF2b = await consultarUna(f2b.numSerieFactura, fecha);
    oks.push(informe('F2 posterior a la anulación, con su huella', resultadoDeConsulta(cF2b), r => r.estado === 'Correcto' && cF2b.reg?.huella === huellaF2b));
    if (corregido) {
      const cSub = await consultarUna(sub.numSerieFactura, fecha);
      oks.push(informe('Corrección en la AEAT, con su huella', resultadoDeConsulta(cSub), r => r.estado === 'Correcto' && cSub.reg?.huella === huellaCorreccion));
    }
    let coinciden = 0;
    for (const c of cadena) {
      const x = await consultarUna(c.numSerie, fecha);
      if (x.reg?.estado === 'Correcto' && x.reg.huella === c.huella) coinciden += 1;
      else console.log(`  ❌ ${c.numSerie}: ${x.reg ? `${x.reg.estado}, huella ${x.reg.huella === c.huella ? 'igual' : 'DISTINTA'}` : x.motivo}`);
    }
    console.log(`  cadena: ${coinciden} de ${cadena.length} con la misma huella en la AEAT`);
    oks.push(cadena.length > 0 && coinciden === cadena.length);

    console.log('\n11) QR: ábrelo en el navegador; la AEAT tiene que decir que la factura está registrada');
    console.log(`  ${urlQrVerifactu({ nif, numSerie: f2b.numSerieFactura, fecha, importeTotal: importesDe(7).total }, { produccion: false })}`);

    console.log(`\n${oks.filter(Boolean).length} de ${oks.length} pasos como se esperaba.`);
  } else if (modo === 'revisar') {
    // Solo consultas: qué tiene la AEAT de cada factura de una tanda 2 ya
    // enviada. No envía nada ni mueve la cadena.
    const base = resto[0];
    if (!base?.startsWith('PRUEBA-TENTARE-')) salir('Uso: revisar PRUEBA-TENTARE-AAAAMMDDhhmmss [dd-mm-aaaa] [--cadena N]');
    const fecha = /^\d{2}-\d{2}-\d{4}$/.test(resto[1] ?? '') ? resto[1] : fechaDeHoy();
    const iC = resto.indexOf('--cadena');
    const n = iC >= 0 ? Math.max(1, Math.min(50, Number(resto[iC + 1]) || 20)) : 20;
    const esperado: Record<string, string> = { F1: 'Correcto', R1S: 'Correcto', F2A: 'Anulado', F2B: 'Correcto', SUB: 'Correcto' };
    const sufijos = [...Object.keys(esperado), ...Array.from({ length: n }, (_, k) => `C${String(k + 1).padStart(2, '0')}`)];
    let bien = 0;
    for (const s of sufijos) {
      const { reg, motivo } = await consultarUna(`${base}-${s}`, fecha);
      const ok = reg?.estado === (esperado[s] ?? 'Correcto');
      if (ok) bien += 1;
      console.log(`${ok ? '✅' : '❌'} ${s}: ${reg ? `${reg.estado} · huella ${reg.huella?.slice(0, 12) ?? '—'}…` : motivo}`);
    }
    console.log(`\n${bien} de ${sufijos.length} como se esperaba.`);
  } else {
    salir(`Modo desconocido: ${modo} (alta | consulta | bateria | bateria2 | revisar)`);
  }
} catch (e) {
  if (e instanceof RegistroInvalidoError) salir(`Tentare paró el registro en local, antes de enviarlo: ${e.errores.join('; ')}`);
  throw e;
}
