/**
 * PAY-5: Cron para detectar dobles cobros
 *
 * Corre cada hora (0 * * * *) buscando recibos con múltiples cobros exitosos
 * en los últimos 7 días. Los registra en dobles_cobros_detectados como
 * PENDIENTE_REVISION para que la propietaria los revise.
 *
 * No es un cron de Vercel (esos agotan cuota de deploy rápido), sino del
 * Inngest free (máx 84 pasos/mes incluidos). Cadencia: ver crons-cadencia.test.ts
 *
 * Best-effort: un fallo aquí no rompe nada — solo significa que ese ciclo
 * no se detectaron dobles cobros (si los hay, el siguiente barrido los pilla).
 */

import { inngest } from '@/lib/inngest/client';
import { detectarYRegistrarDoblesCobros } from '@/lib/billing/detectar-doble-cobro';
import * as Sentry from '@sentry/nextjs';

export const detectarDoblesCobrosJob = inngest.createFunction(
  {
    id: 'detectar-dobles-cobros',
    retryPolicy: {
      maxRetries: 1,
      multiplier: 2,
    },
  },
  { cron: '10 * * * *' }, // cada hora, minuto 10 (espaciado)
  async ({ step }) => {
    const resultado = await step.run('detectar-dobles-cobros', async () => {
      return detectarYRegistrarDoblesCobros(7);
    });

    // Log de resultado para auditoría
    if (resultado.detectados > 0 || resultado.errores.length > 0) {
      Sentry.captureMessage('[detectar-dobles-cobros] Ciclo completado', {
        level: 'info',
        tags: { area: 'cobros', tipo: 'doble-cobro' },
        extra: {
          detectados: resultado.detectados,
          registrados: resultado.registrados,
          errores: resultado.errores,
        },
      });
    }

    return resultado;
  }
);
