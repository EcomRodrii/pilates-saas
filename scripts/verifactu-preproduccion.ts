// Veri*Factu — prueba de humo contra el entorno de PREPRODUCCIÓN de la AEAT.
//
// Lo corre una persona, a mano, con SU certificado de persona física y SU NIF
// como obligado tributario (en preproducción no hace falta ningún poder: uno es
// su propio obligado). No toca la base de datos ni ningún estudio.
//
//   VERIFACTU_ENVIRONMENT=preproduction \
//   CERTIFICATE_PFX="$(base64 -i mi-certificado.p12)" CERTIFICATE_PASSWORD='…' \
//   VERIFACTU_PRODUCTOR_NIF=… VERIFACTU_PRODUCTOR_NOMBRE='Nombre Apellidos' \
//   node --experimental-strip-types scripts/verifactu-preproduccion.ts [alta|consulta NUM FECHA]
//
// Encadenar una segunda alta detrás de la primera:
//   … scripts/verifactu-preproduccion.ts alta --anterior NUM FECHA HUELLA
//
// ⚠️ SE NIEGA A CORRER CONTRA PRODUCCIÓN. En producción las facturas de prueba
// son facturas reales (FAQ de desarrolladores de la AEAT) y habría que anularlas.
// ⚠️ El portal de pruebas de la AEAT prohíbe las «pruebas masivas»: un envío por
// ejecución, a mano.
// ⚠️ Nunca imprime el certificado ni su contraseña.

import { calcularHuellaAlta } from '../lib/verifactu.ts';
import { fechaHoraHusoMadrid } from '../lib/verifactu-qr.ts';
import { xmlRegistroAlta, sobreSoapRegFactu, sobreSoapConsulta, periodoDeFecha, CLAVE_REGIMEN_GENERAL } from '../lib/verifactu/xml.ts';
import { llamarAeat, huellaCredencial } from '../lib/verifactu/envio.ts';
import { parsearRespuestaAeat, parsearRespuestaConsulta } from '../lib/verifactu/respuesta.ts';
import { endpointVerifactu } from '../lib/verifactu/endpoints.ts';
import { certificadoDeEntorno, entornoTransmision } from '../lib/verifactu/config.ts';
import { sistemaInformaticoParaEstudio } from '../lib/verifactu/sif.ts';

function salir(mensaje: string): never {
  console.error(`✖ ${mensaje}`);
  process.exit(1);
}

if (entornoTransmision() !== 'preproduccion') {
  salir('Este script solo corre con VERIFACTU_ENVIRONMENT=preproduction. Nunca contra producción.');
}
const certificado = certificadoDeEntorno() ?? salir('Falta CERTIFICATE_PFX o CERTIFICATE_PASSWORD.');
const nif = (process.env.VERIFACTU_PRODUCTOR_NIF ?? '').trim();
const nombre = (process.env.VERIFACTU_PRODUCTOR_NOMBRE ?? '').trim();
if (nif.length !== 9) salir('VERIFACTU_PRODUCTOR_NIF debe ser tu NIF (9 caracteres): eres el obligado de la prueba.');
if (!nombre) salir('Falta VERIFACTU_PRODUCTOR_NOMBRE (tu nombre y apellidos, como en el censo).');

const destino = { entorno: 'preproduccion' as const, certificado: 'representante' as const };
const [modo = 'alta', ...resto] = process.argv.slice(2);
console.log(`→ ${endpointVerifactu(destino)}`);
console.log(`  credencial (SHA-256 del .pfx): ${huellaCredencial(certificado).slice(0, 16)}…`);

if (modo === 'consulta') {
  const [numSerie, fecha] = resto;
  if (!numSerie || !fecha) salir('Uso: consulta NUM_SERIE dd-mm-aaaa');
  const sobre = sobreSoapConsulta({ obligado: { nombreRazon: nombre, nif }, ...periodoDeFecha(fecha), numSerieFactura: numSerie });
  const r = await llamarAeat(sobre, certificado, destino);
  console.log(`HTTP ${r.status ?? '—'} · fallo=${r.fallo ?? 'ninguno'}`);
  console.log(JSON.stringify(r.fallo ? { error: r.error } : parsearRespuestaConsulta(r.cuerpo), null, 2));
  process.exit(0);
}

if (modo !== 'alta') salir(`Modo desconocido: ${modo}`);

const i = resto.indexOf('--anterior');
const anterior = i >= 0 ? { numSerieFactura: resto[i + 1], fechaExpedicionFactura: resto[i + 2], huella: resto[i + 3] } : null;
if (anterior && (!anterior.numSerieFactura || !anterior.fechaExpedicionFactura || !/^[0-9A-F]{64}$/.test(anterior.huella ?? ''))) {
  salir('Uso: alta --anterior NUM_SERIE dd-mm-aaaa HUELLA(64 hex mayúsculas)');
}

const ahora = new Date();
const ts = fechaHoraHusoMadrid(ahora);
const [y, m, d] = ts.slice(0, 10).split('-');
const fecha = `${d}-${m}-${y}`;
const numSerie = `PRUEBA-TENTARE-${ts.slice(0, 19).replace(/[-:T]/g, '')}`;
const base = 10;
const cuota = 2.1;
const total = 12.1;
const huella = calcularHuellaAlta({
  idEmisorFactura: nif, numSerieFactura: numSerie, fechaExpedicionFactura: fecha,
  tipoFactura: 'F2', cuotaTotal: cuota, importeTotal: total, fechaHoraHusoGenRegistro: ts,
}, anterior?.huella ?? '');

const registro = xmlRegistroAlta({
  emisor: { nombreRazon: nombre, nif },
  numSerieFactura: numSerie,
  fechaExpedicionFactura: fecha,
  tipoFactura: 'F2',
  descripcionOperacion: 'Prueba de integración Veri*Factu (preproducción)',
  desglose: [{ claveRegimen: CLAVE_REGIMEN_GENERAL, calificacionOperacion: 'S1', tipoImpositivo: 21, baseImponible: base, cuotaRepercutida: cuota }],
  cuotaTotal: cuota,
  importeTotal: total,
  encadenamiento: anterior ? { idEmisorFactura: nif, ...anterior } : null,
  // La misma identidad de SIF que en producción; instalación propia de pruebas.
  sistemaInformatico: sistemaInformaticoParaEstudio({ nombre, nif }, 'preproduccion', 1),
  fechaHoraHusoGenRegistro: ts,
  huella,
});
const sobre = sobreSoapRegFactu({ obligado: { nombreRazon: nombre, nif }, registros: [registro] });

console.log(`  factura de prueba: ${numSerie} · ${fecha} · huella ${huella}`);
const r = await llamarAeat(sobre, certificado, destino);
console.log(`HTTP ${r.status ?? '—'} · fallo=${r.fallo ?? 'ninguno'} · ${r.error ?? ''}`);
if (!r.fallo) {
  console.log(JSON.stringify(parsearRespuestaAeat(r.cuerpo), null, 2));
  console.log(`\nPara encadenar la siguiente:  alta --anterior ${numSerie} ${fecha} ${huella}`);
}
