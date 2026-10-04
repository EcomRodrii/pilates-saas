// ─────────────────────────────────────────────────────────────────────────────
// Interruptor del estudio «Redactar con IA» (contrato de encargo, 2-oct-2026).
//
// Hasta ahora el estudio no podía apagar la IA que corre SOLA, sin pulsar un
// botón: la redacción de las sugerencias del Centro de Control
// (lib/decision/redaccion.ts), la del mensaje a la alumna al aprobar una
// (lib/decision/personalizacion.ts) y la de las automatizaciones
// (lib/inngest/automatizaciones.ts). Solo cada alumna podía oponerse al
// análisis (`socios.excluir_de_perfilado`). Las funciones que se lanzan desde un
// botón (nota dictada, resumen de salud…) ya son una decisión de quien lo pulsa.
//
// Apagado = se usa el texto que ya calcula el motor, que es válido por sí mismo
// (todas esas funciones son falla-suave). Ningún dato de una alumna sale hacia
// la IA.
//
// Vive en `decision_feature_flags` como un flag más: ausente o `true` = activo
// (como hoy), `false` = apagado. Puro, para probarlo con node --test.
// ─────────────────────────────────────────────────────────────────────────────

export const FLAG_REDACCION_IA = 'REDACCION_IA' as const;

/** Opt-out: solo un `false` explícito lo apaga. Las filas de otros flags no cuentan. */
export function redaccionIaActiva(filas: readonly { flag: string; activo: boolean }[]): boolean {
  return !filas.some(f => f.flag === FLAG_REDACCION_IA && f.activo === false);
}
