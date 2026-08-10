// ─────────────────────────────────────────────────────────────────────────────
// Automatiza el envío del Cierre a la gestoría (hasta ahora un botón manual
// en app/(dashboard)/cierre/page.tsx). Opt-in por estudio
// (studios.gestoria_envio_automatico = 'trimestral'), pensado para el modelo
// 303 de IVA: cierra el día 1 del mes siguiente al trimestre natural
// (abril/julio/octubre/enero).
//
// Cadencia diaria: solo hace algo el día 1 de esos 4 meses, el resto de días
// es un no-op barato (early return antes de tocar Supabase). Sin fan-out por
// estudio — mismo patrón que minimo-asistentes.ts/penalizaciones.ts, `studios`
// no es una tabla grande y se filtra de entrada por el toggle activo.
//
// Idempotencia: gestoria_ultimo_envio_periodo guarda la clave del último
// periodo ya tratado ("2026-T1"). Cubre tanto "el cron corrió dos veces el
// mismo día" como un reintento de Inngest. Un trimestre sin datos (sinDatos)
// también marca el periodo como tratado — si no, se reintentaría cada día 1
// hasta que hubiera facturas, en vez de solo una vez por trimestre real.
import { inngest } from './client';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { generarYEnviarCierreGestoria } from '@/lib/fiscal/cierre-envio-server';

function trimestreQueAcabaDeCerrar(hoy: Date): { anio: number; trimestre: 1 | 2 | 3 | 4 } | null {
  const mes = hoy.getMonth() + 1; // 1-12
  if (hoy.getDate() !== 1) return null;
  if (mes === 1) return { anio: hoy.getFullYear() - 1, trimestre: 4 };
  if (mes === 4) return { anio: hoy.getFullYear(), trimestre: 1 };
  if (mes === 7) return { anio: hoy.getFullYear(), trimestre: 2 };
  if (mes === 10) return { anio: hoy.getFullYear(), trimestre: 3 };
  return null;
}

export const cierreGestoriaAutomaticoDispatcher = inngest.createFunction(
  { id: 'cierre-gestoria-automatico', triggers: [{ cron: '0 6 * * *' }] },
  async ({ step }) => {
    return step.run('enviar', async () => {
      const admin = getSupabaseAdmin();
      if (!admin) return { skipped: 'sin service-role' };

      const periodo = trimestreQueAcabaDeCerrar(new Date());
      if (!periodo) return { skipped: 'no toca hoy' };
      const clavePeriodo = `${periodo.anio}-T${periodo.trimestre}`;

      const { data: studios } = await admin
        .from('studios')
        .select('id, gestoria_email, gestoria_ultimo_envio_periodo')
        .eq('gestoria_envio_automatico', 'trimestral')
        .not('gestoria_email', 'is', null);
      if (!studios?.length) return { revisados: 0, enviados: 0 };

      let enviados = 0;
      for (const s of studios) {
        if (s.gestoria_ultimo_envio_periodo === clavePeriodo) continue;

        const r = await generarYEnviarCierreGestoria({
          studioId: s.id as string,
          anio: periodo.anio,
          trimestre: periodo.trimestre,
          email: s.gestoria_email as string,
        });
        if (r.ok) enviados++;

        if (r.ok || r.sinDatos) {
          await admin.from('studios')
            .update({ gestoria_ultimo_envio_periodo: clavePeriodo })
            .eq('id', s.id as string);
        }
      }
      return { revisados: studios.length, enviados };
    });
  },
);
