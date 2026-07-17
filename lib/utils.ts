import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// Identificador único para entidades. Combina timestamp + contador monotónico
// (colisión-cero dentro de un proceso, incluso en bucles ajustados como los
// crons — P0-7) + aleatorio (seguridad entre procesos). ÚNICO generador del
// sistema: los crons lo importan en vez de reimplementar Math.random() suelto.
let uidSeq = 0;
export function uid() {
  uidSeq = (uidSeq + 1) % 0xffffffff;
  return `${Date.now().toString(36)}-${uidSeq.toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

// Formatea un importe en euros al estilo español: coma decimal + " €"
// (p.ej. 22 → "22,00 €"). SOLO para mostrar en pantalla. NO usar para valores
// de protocolo/QR (Verifactu, PayPal), que exigen punto decimal a propósito.
export function formatEuro(n: number): string {
  return `${n.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;
}

// Formateadores de fecha/hora en español — estaban reimplementados (copy-paste
// idéntico o casi) en 6+ páginas. Un único sitio para no divergir por accidente.
export function formatFechaLarga(iso: string): string {
  return new Date(iso).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' });
}

export function formatFechaCorta(iso: string): string {
  return new Date(iso).toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short' });
}

export function formatHoraCorta(iso: string): string {
  return new Date(iso).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', hour12: false });
}

export function formatFechaHora(iso: string): string {
  return new Date(iso).toLocaleString('es-ES', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}
