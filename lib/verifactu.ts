// ─────────────────────────────────────────────────────────────────────────────
// Veri*Factu — motor de huella (SHA-256 encadenado). Lógica pura y determinista,
// verificable contra el ejemplo oficial de la AEAT (ver verifactu.test.ts). Usa
// node:crypto → SOLO servidor. Los formateadores, fechas y el QR (cliente-seguro)
// viven en verifactu-qr.ts y se re-exportan aquí por comodidad.
//
// ⚠️ AVISO: esto es el CIMIENTO (registro + huella + QR). NO incluye el envío a
// la AEAT ni la firma XAdES (modalidad No-Veri*Factu). Antes de producción, el
// formato exacto (mayúsculas del hex, decimales del importe, codificación del
// QR) debe validarse contra el entorno de pruebas de la AEAT y con un asesor
// fiscal. No es asesoramiento fiscal.
// ─────────────────────────────────────────────────────────────────────────────

import { createHash } from 'node:crypto';

// Importe con punto decimal y 2 decimales (formato de la cadena de huella AEAT).
// Se duplica (una línea) para que este módulo no tenga imports relativos y sea
// resoluble tanto por el runner de Node como por el bundler. Los formateadores
// cliente-seguros y el QR viven en verifactu-qr.ts.
function formatImporte(n: number): string {
  return n.toFixed(2);
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
