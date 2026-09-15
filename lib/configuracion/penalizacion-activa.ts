// ¿Puede este estudio cobrar hoy una penalización por cancelación tardía o
// no-show?
//
// Lo usa Legal para avisar ANTES de cambiar los textos: el cron de
// penalizaciones (lib/inngest/penalizaciones.ts) solo cobra si el texto legal
// que aceptó la socia es IDÉNTICO al vigente, así que tocar una coma deja a
// todas sin consentimiento vigente hasta que vuelvan a aceptar. Con la regla
// apagada ese aviso sería mentira, y no se enseña.
//
// Misma resolución que la SQL que detecta la penalización
// (`coalesce(tc.penalizacion_importe_eur, st.penalizacion_importe_eur)`): el
// tipo de clase manda si tiene valor, y si no hereda el del estudio. Un
// override a 0 apaga la regla para ese tipo aunque el estudio la tenga puesta.

type ConImporte = { penalizacionImporteEur: number | null };

const positivo = (v: number | null | undefined): boolean => typeof v === 'number' && v > 0;

export function hayPenalizacionConfigurada(
  studio: ConImporte | null | undefined,
  tiposClase: readonly ConImporte[],
): boolean {
  const delEstudio = studio?.penalizacionImporteEur ?? null;
  // Sin tipos de clase todavía, el primero que se cree heredará la del estudio.
  if (tiposClase.length === 0) return positivo(delEstudio);
  return tiposClase.some(t => positivo(t.penalizacionImporteEur ?? delEstudio));
}
