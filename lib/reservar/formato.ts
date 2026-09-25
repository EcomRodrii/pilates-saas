// Formato de fecha/hora/teléfono compartido entre `/reservar/[slug]` y la
// nueva pantalla de reserva (`components/reserva/pantalla-reserva.tsx`) — un
// módulo aparte en vez de exportar desde `page.tsx` para no crear un import
// circular (la pantalla nueva la monta `page.tsx`, no al revés).
import { horaEstudio, fechaLargaEstudio } from '../utils.ts';

// ⚠️ RES-7-f: hora y fecha de una clase en la zona del ESTUDIO, no en la del
// navegador de quien mira. Antes `fmtTime` usaba `getHours()`: un visitante fuera
// de Madrid veía una clase de las 10:00 a otra hora.
export function fmtTime(iso: string): string {
  return horaEstudio(iso);
}

export function fmtLong(d: Date): string {
  return fechaLargaEstudio(d);
}

// Mínimo razonable de dígitos para un teléfono real (España: 9). No se valida
// prefijo — el estudio contacta por WhatsApp/llamada, un formato demasiado
// estricto rechazaría números correctos de otros países sin aportar nada.
export function telefonoValido(telefono: string): boolean {
  return telefono.replace(/[^0-9]/g, '').length >= 9;
}
