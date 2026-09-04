// Lógica pura de integridad de la cadena Veri*Factu (auditoría 22ª pasada,
// 3-sep-2026, P-3) — sin BD ni dependencias, para poder testearla bajo
// `node --test` sin arrastrar `lib/supabase-data.ts` (god file con sus
// propios imports `@/lib` sin probar nunca por `node --test`; arreglarlos no
// es tarea de esta pasada). La usa `lib/inngest/conciliar-cobros.ts`, que sí
// habla con la BD y con Sentry.
//
// `reservar_numero_factura` reserva numero_completo/verifactu_seq/
// verifactu_prev_hash bajo un advisory lock POR ESTUDIO
// (lib/billing/sellar-factura-server.ts), así que la secuencia y su cadena de
// huellas son por studio_id, no globales — de ahí comparar solo dentro de
// cada estudio, nunca entre estudios distintos.
export type FilaCadenaVerifactu = {
  studio_id: string; verifactu_seq: number; numero_completo: string;
  verifactu_hash: string; verifactu_prev_hash: string;
};

export type RoturaCadenaVerifactu = {
  studioId: string; seqRota: number; numeroCompleto: string;
  seqAnterior: number; numeroCompletoAnterior: string;
};

// Recibe las filas YA ordenadas por studio_id/verifactu_seq y devuelve dónde
// se rompe la cadena (verifactu_prev_hash de una fila no casa con el
// verifactu_hash de la fila anterior DEL MISMO ESTUDIO).
export function detectarCadenaRotaVerifactu(filas: FilaCadenaVerifactu[]): RoturaCadenaVerifactu[] {
  const roturas: RoturaCadenaVerifactu[] = [];
  let anterior: FilaCadenaVerifactu | null = null;
  for (const actual of filas) {
    // Cambio de estudio: no hay "anterior" con quien comparar todavía.
    if (!anterior || anterior.studio_id !== actual.studio_id) { anterior = actual; continue; }
    if (actual.verifactu_prev_hash !== anterior.verifactu_hash) {
      roturas.push({
        studioId: actual.studio_id,
        seqRota: actual.verifactu_seq,
        numeroCompleto: actual.numero_completo,
        seqAnterior: anterior.verifactu_seq,
        numeroCompletoAnterior: anterior.numero_completo,
      });
    }
    anterior = actual;
  }
  return roturas;
}
