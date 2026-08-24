// Formato de fecha/hora/teléfono compartido entre `/reservar/[slug]` y la
// nueva pantalla de reserva (`components/reserva/pantalla-reserva.tsx`) — un
// módulo aparte en vez de exportar desde `page.tsx` para no crear un import
// circular (la pantalla nueva la monta `page.tsx`, no al revés).
function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

export function fmtTime(iso: string): string {
  const d = new Date(iso);
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

export function fmtLong(d: Date): string {
  return d.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' });
}

// Mínimo razonable de dígitos para un teléfono real (España: 9). No se valida
// prefijo — el estudio contacta por WhatsApp/llamada, un formato demasiado
// estricto rechazaría números correctos de otros países sin aportar nada.
export function telefonoValido(telefono: string): boolean {
  return telefono.replace(/[^0-9]/g, '').length >= 9;
}
