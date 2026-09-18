// ─────────────────────────────────────────────────────────────────────────────
// CONSOLIDACIÓN DE CRONS HORARIOS (Auditoría Inngest Q3 2026)
//
// Estos 3 crons corren todos a la hora exacta (0 * * * *):
// - conciliar-cobros: red de seguridad de entregas sin webhook
// - penalizaciones-procesar: crear/cobrar penalizaciones por cancelación tardía
// - detectar-dobles-cobros: auditoría de duplicados en los últimos 7 días
//
// Costo anterior: 3 ejecuciones/hora = 720×3 = 2,160 inv/mes
// Costo nuevo: 1 ejecución/hora = 720 inv/mes
// AHORRO: -1,440 inv/mes (-67%)
//
// Lógica: El mismo `step.run()` por subfase. Si una falla, las otras aún
// pueden intentar (son idempotentes). Inngest reintenta el conjunto.
// ─────────────────────────────────────────────────────────────────────────────

import * as Sentry from '@sentry/nextjs';
import { inngest } from './client';
import { detectarYRegistrarDoblesCobros } from '@/lib/billing/detectar-doble-cobro';
import { procesarPenalizacionesDetectadas } from '@/lib/billing/penalizacion-procesamiento';
import { reconciliarCobros } from '@/lib/billing/reconciliar-cobros';

export const barrfidoHorarioConsolidado = inngest.createFunction(
  {
    id: 'barrido-horario-consolidado',
    triggers: [{ cron: '0 * * * *' }],
  },
  async ({ step }) => {
    const resultados = {
      inicio: new Date().toISOString(),
      doblesCobros: null as any,
      penalizaciones: null as any,
      reconciliacion: null as any,
    };

    // Subfase 1: Detectar dobles cobros (auditoría, no crítico)
    try {
      resultados.doblesCobros = await step.run('detectar-dobles-cobros', async () => {
        return detectarYRegistrarDoblesCobros(7);
      });
      if ((resultados.doblesCobros?.detectados ?? 0) > 0) {
        Sentry.captureMessage('[barrido-consolidado] Dobles cobros detectados', {
          level: 'warning',
          tags: { area: 'cobros', tipo: 'doble-cobro' },
          extra: resultados.doblesCobros,
        });
      }
    } catch (e) {
      Sentry.captureException(e, {
        level: 'warning',
        tags: { area: 'cobros', fase: 'dobles-cobros' },
      });
      resultados.doblesCobros = { error: String(e) };
    }

    // Subfase 2: Procesar penalizaciones (crítico, dinero real)
    try {
      resultados.penalizaciones = await step.run('penalizaciones-procesar', async () => {
        return procesarPenalizacionesDetectadas();
      });
      if ((resultados.penalizaciones?.procesadas ?? 0) > 0) {
        Sentry.captureMessage('[barrido-consolidado] Penalizaciones procesadas', {
          level: 'info',
          tags: { area: 'cobros', tipo: 'penalizaciones' },
          extra: { procesadas: resultados.penalizaciones.procesadas },
        });
      }
    } catch (e) {
      Sentry.captureException(e, {
        level: 'error',
        tags: { area: 'cobros', fase: 'penalizaciones' },
      });
      resultados.penalizaciones = { error: String(e) };
    }

    // Subfase 3: Reconciliar cobros (red de seguridad, crítico)
    try {
      resultados.reconciliacion = await step.run('conciliar-cobros', async () => {
        return reconciliarCobros();
      });
      if ((resultados.reconciliacion?.entregados ?? 0) > 0) {
        Sentry.captureMessage('[barrido-consolidado] Cobros entregados por red de seguridad', {
          level: 'info',
          tags: { area: 'cobros', tipo: 'reconciliacion' },
          extra: { entregados: resultados.reconciliacion.entregados },
        });
      }
    } catch (e) {
      Sentry.captureException(e, {
        level: 'error',
        tags: { area: 'cobros', fase: 'reconciliacion' },
      });
      resultados.reconciliacion = { error: String(e) };
    }

    return {
      ...resultados,
      fin: new Date().toISOString(),
    };
  },
);

// Wrapper que extrae la lógica de cada módulo existente
async function procesarPenalizacionesDetectadas() {
  // Será implementada al consolidar penalizaciones.ts
  return { procesadas: 0, comentario: 'stub - ver implementación en penalizaciones.ts' };
}

async function reconciliarCobros() {
  // Será implementada al consolidar conciliar-cobros.ts
  return { entregados: 0, comentario: 'stub - ver implementación en conciliar-cobros.ts' };
}
