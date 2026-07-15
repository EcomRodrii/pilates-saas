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
