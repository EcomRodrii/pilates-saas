// Lo que dice la ficha de una clienta con plaza fija al cancelar, pausar o dar de
// baja su cuota, según la política que eligió el estudio en Configuración
// («Cómo reservan mis alumnas» → «Si se queda sin cuota»). Tiene que decir lo que
// hace el código: `reservas_plaza_fija_sin_cuota` (migr 20260915215236) solo
// libera con LIBERAR, y el cron de penalizaciones no cobra con LIBERAR ni con
// MANTENER_SIN_PENALIZAR. En las tres, el motor no le reserva clases nuevas.
//
// Puro: se prueba con `node --test`.

import type { PoliticaPlazaFijaSinCuota } from './types.ts';

/**
 * `cuando`: `'ahora'` = deja de tener cuota hoy (cancelar ahora, pausar);
 * `'al-final'` = la conserva hasta `fechaFin` (baja programada); `'elegir'` = la
 * ventana aún ofrece las dos cosas.
 */
export function textoPlazaFijaSinCuota(
  politica: PoliticaPlazaFijaSinCuota,
  cuando: 'ahora' | 'al-final' | 'elegir',
  fechaFin?: string | null,
): string {
  const despues = fechaFin ? `después del ${fechaFin}` : 'después del final del periodo';
  switch (politica) {
    case 'LIBERAR':
      if (cuando === 'ahora') {
        return 'Su plaza fija se guarda, pero se liberan todas las clases que ya tenía reservadas, también las de estos días, sin penalización.';
      }
      if (cuando === 'al-final') {
        return `Su plaza fija se guarda, pero se liberan las clases que tenía reservadas ${despues}, sin penalización.`;
      }
      return `Su plaza fija se guarda, pero se liberan sus clases reservadas sin penalización: las de ${despues} si le das de baja, o todas desde hoy si la cancelas ahora.`;
    case 'MANTENER_SIN_PENALIZAR':
      return 'Su plaza fija se guarda y conserva las clases ya reservadas; si no viene, no se le cobra penalización. No se le reservan clases nuevas.';
    case 'MANTENER':
      return 'Su plaza fija se guarda y conserva las clases ya reservadas, con tus reglas de siempre. No se le reservan clases nuevas.';
  }
}
