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
import { fechaHoraHusoMadrid } from '../lib/verifactu-qr.ts';
import {
  xmlRegistroAlta, xmlRegistroAnulacion, sobreSoapRegFactu, sobreSoapConsulta, periodoDeFecha,
  CLAVE_REGIMEN_GENERAL, RegistroInvalidoError, type EncadenamientoAnterior, type IdFacturaXml,
} from '../lib/verifactu/xml.ts';
import { llamarAeat, huellaCredencial } from '../lib/verifactu/envio.ts';
import { parsearRespuestaAeat, parsearRespuestaConsulta, CODIGO_DUPLICADO } from '../lib/verifactu/respuesta.ts';
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
async function enviar(construir: () => { xml: string; huella: string }, numSerie: string, fecha: string): Promise<{ res: Resultado | null; huella: string }> {
  if (esperaMs > 0) {
    console.log(`  (esperando ${Math.round(esperaMs / 1000)} s: lo pide la AEAT entre envíos)`);
    await dormir(esperaMs);
  }
  const { xml: registroXml, huella } = construir();
  return { res: await enviarXml(registroXml, { numSerie, fecha, huella }), huella };
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
  subsanacion?: boolean;
}

function registroAlta(a: Alta, fecha: string): { xml: string; huella: string } {
  const ts = fechaHoraHusoMadrid(new Date());
  const cuota = Math.round(a.base * 21) / 100;
  const total = Math.round((a.base + cuota) * 100) / 100;
  const huella = calcularHuellaAlta({
    idEmisorFactura: nif, numSerieFactura: a.numSerie, fechaExpedicionFactura: fecha,
    tipoFactura: a.tipo, cuotaTotal: cuota, importeTotal: total, fechaHoraHusoGenRegistro: ts,
  }, punta?.huella ?? '');
  const xml = xmlRegistroAlta({
    emisor: obligado,
    numSerieFactura: a.numSerie,
    fechaExpedicionFactura: fecha,
    ...(a.subsanacion ? marcasSubsanacion({ existeEnAeat: true, subsanacionAnteriorRechazada: false }) : {}),
    tipoFactura: a.tipo,
    ...(a.rectifica ? { tipoRectificativa: 'I', facturasRectificadas: [a.rectifica] } : {}),
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
    e = await enviar(() => registroAlta({ numSerie: f1.numSerieFactura, tipo: 'F1', descripcion: 'Prueba F1 con destinatario (subsanada)', base: 10, conDestinatario: true, subsanacion: true }, fecha), f1.numSerieFactura, fecha);
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
    const cF1 = await consultar(f1.numSerieFactura, fecha);
    const regF1 = cF1?.registros.find(x => x.numSerieFactura === f1.numSerieFactura);
    const f1TieneSubsanacion = regF1?.huella === huellaSubsanacion;
    oks.push(informe(`F1 en la AEAT (se espera la huella de la subsanación: ${f1TieneSubsanacion ? 'coincide' : 'NO coincide'})`,
      regF1 ? { estado: regF1.estado, codigo: null, descripcion: null, duplicado: null } : null, r => r.estado === 'Correcto' && f1TieneSubsanacion));
    const cF2 = await consultar(f2.numSerieFactura, fecha);
    const regF2 = cF2?.registros.find(x => x.numSerieFactura === f2.numSerieFactura);
    oks.push(informe('F2 en la AEAT (se espera Anulado)', regF2 ? { estado: regF2.estado, codigo: null, descripcion: null, duplicado: null } : null, r => r.estado === 'Anulado'));

    console.log(`\n${oks.filter(Boolean).length} de ${oks.length} pasos como se esperaba.`);
  } else {
    salir(`Modo desconocido: ${modo} (alta | consulta | bateria)`);
  }
} catch (e) {
  if (e instanceof RegistroInvalidoError) salir(`Tentare paró el registro en local, antes de enviarlo: ${e.errores.join('; ')}`);
  throw e;
}
