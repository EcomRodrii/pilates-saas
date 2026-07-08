// ─────────────────────────────────────────────────────────────────────────────
// Veri*Factu — motor de huella (SHA-256 encadenado) y QR (Orden HAC/1177/2024,
// art. 7 RD 1007/2023). Lógica pura y determinista, verificable contra el
// ejemplo oficial de la AEAT (ver verifactu.test.ts). Se ejecuta en servidor
// (usa node:crypto); NO importar en cliente.
//
// ⚠️ AVISO: esto es el CIMIENTO (registro + huella + QR). NO incluye el envío a
// la AEAT ni la firma XAdES (modalidad No-Veri*Factu). Antes de producción, el
// formato exacto (mayúsculas del hex, decimales del importe, codificación del
// QR) debe validarse contra el entorno de pruebas de la AEAT y con un asesor
// fiscal. No es asesoramiento fiscal.
// ─────────────────────────────────────────────────────────────────────────────

import { createHash } from 'node:crypto';

// Endpoints oficiales del servicio de cotejo (QR) de la AEAT.
export const QR_ENDPOINT_PRODUCCION = 'https://www2.agenciatributaria.es/wlpl/TIKE-CONT/ValidarQR';
export const QR_ENDPOINT_PRUEBAS = 'https://prewww2.aeat.es/wlpl/TIKE-CONT/ValidarQR';

// Importe con punto decimal y 2 decimales (formato de la cadena de huella AEAT).
export function formatImporte(n: number): string {
  return n.toFixed(2);
}

// Fecha de expedición en formato dd-mm-yyyy exigido por la AEAT.
export function formatFechaExpedicion(fecha: Date): string {
  const dd = String(fecha.getDate()).padStart(2, '0');
  const mm = String(fecha.getMonth() + 1).padStart(2, '0');
  const yyyy = fecha.getFullYear();
  return `${dd}-${mm}-${yyyy}`;
}

// ── Registro de ALTA ─────────────────────────────────────────────────────────
export interface RegistroAltaVerifactu {
  idEmisorFactura: string;           // NIF del emisor
  numSerieFactura: string;           // número + serie, p.ej. "12345678/G33"
  fechaExpedicionFactura: string;    // dd-mm-yyyy
  tipoFactura: string;               // catálogo AEAT: F1, F2, R1-R5...
  cuotaTotal: number;                // importe de IVA
  importeTotal: number;              // importe total
  fechaHoraHusoGenRegistro: string;  // ISO-8601 con huso, p.ej. 2024-01-01T19:20:30+01:00
}

// Construye la cadena pre-hash de un registro de ALTA en el orden ESTRICTO de la
// AEAT. `huellaAnterior` es la huella del registro previo de la cadena (cadena
// vacía en el primer registro).
export function construirCadenaAlta(r: RegistroAltaVerifactu, huellaAnterior: string): string {
  return (
    `IDEmisorFactura=${r.idEmisorFactura}` +
    `&NumSerieFactura=${r.numSerieFactura}` +
    `&FechaExpedicionFactura=${r.fechaExpedicionFactura}` +
    `&TipoFactura=${r.tipoFactura}` +
    `&CuotaTotal=${formatImporte(r.cuotaTotal)}` +
    `&ImporteTotal=${formatImporte(r.importeTotal)}` +
    `&Huella=${huellaAnterior}` +
    `&FechaHoraHusoGenRegistro=${r.fechaHoraHusoGenRegistro}`
  );
}

// ── Registro de ANULACIÓN ────────────────────────────────────────────────────
export interface RegistroAnulacionVerifactu {
  idEmisorFacturaAnulada: string;
  numSerieFacturaAnulada: string;
  fechaExpedicionFacturaAnulada: string; // dd-mm-yyyy
  fechaHoraHusoGenRegistro: string;
}

export function construirCadenaAnulacion(r: RegistroAnulacionVerifactu, huellaAnterior: string): string {
  return (
    `IDEmisorFacturaAnulada=${r.idEmisorFacturaAnulada}` +
    `&NumSerieFacturaAnulada=${r.numSerieFacturaAnulada}` +
    `&FechaExpedicionFacturaAnulada=${r.fechaExpedicionFacturaAnulada}` +
    `&Huella=${huellaAnterior}` +
    `&FechaHoraHusoGenRegistro=${r.fechaHoraHusoGenRegistro}`
  );
}

// SHA-256 de la cadena (UTF-8) → hex de 64 caracteres en MAYÚSCULAS (convención
// AEAT para el campo Huella).
export function sha256Hex(cadena: string): string {
  return createHash('sha256').update(cadena, 'utf8').digest('hex').toUpperCase();
}

// Huella de un registro de alta, encadenada con la anterior.
export function calcularHuellaAlta(r: RegistroAltaVerifactu, huellaAnterior: string): string {
  return sha256Hex(construirCadenaAlta(r, huellaAnterior));
}

export function calcularHuellaAnulacion(r: RegistroAnulacionVerifactu, huellaAnterior: string): string {
  return sha256Hex(construirCadenaAnulacion(r, huellaAnterior));
}

// ── Código QR ────────────────────────────────────────────────────────────────
export interface DatosQrVerifactu {
  nif: string;
  numSerie: string;      // número + serie
  fecha: string;         // dd-mm-yyyy
  importeTotal: number;
}

// URL HTTPS del QR de cotejo de la AEAT. La AEAT admite '/' sin codificar en
// numserie (así aparece en su ejemplo oficial); el resto de valores se codifican.
export function urlQrVerifactu(d: DatosQrVerifactu, opciones?: { produccion?: boolean }): string {
  const base = opciones?.produccion === false ? QR_ENDPOINT_PRUEBAS : QR_ENDPOINT_PRODUCCION;
  const enc = (v: string) => encodeURIComponent(v).replace(/%2F/g, '/');
  const qs =
    `nif=${enc(d.nif)}` +
    `&numserie=${enc(d.numSerie)}` +
    `&fecha=${enc(d.fecha)}` +
    `&importe=${formatImporte(d.importeTotal)}`;
  return `${base}?${qs}`;
}
