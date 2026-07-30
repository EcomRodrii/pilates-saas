// ─────────────────────────────────────────────────────────────────────────────
// Fase 2b (plazo para aceptar una plaza de lista de espera): ninguna oferta
// puede quedar viva indefinidamente. A diferencia de reservas-pendientes.ts
// (Fase 2a, cada minuto porque "clase ya empezada" es una regla de seguridad
// con coste de desfase alto), aquí la regla de negocio ya vive DENTRO de la
// RPC aceptar_oferta_lista_espera (nadie puede aceptar tras oferta_expira_en,
// pase lo que pase con este cron) — este cron es solo el aviso proactivo a la
// siguiente en la cola, por eso corre cada 5 min: un desfase de hasta 5 min
// sobre una ventana típica de 15 es tolerable, no es una regla de seguridad.
//
// Sin fan-out por estudio (igual que reservas-pendientes.ts): es una única
// query global de "oferta caducada", no hay nada que decidir por estudio.
// ─────────────────────────────────────────────────────────────────────────────
import { inngest } from './client';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { expirarOfertaListaEspera } from '@/lib/db/supabase-data-admin';

export const listaEsperaOfertasExpirarDispatcher = inngest.createFunction(
  { id: 'lista-espera-ofertas-expirar', triggers: [{ cron: '*/5 * * * *' }] },
  async ({ step }) => {
    return step.run('expirar', async () => {
      const admin = getSupabaseAdmin();
      if (!admin) return { skipped: 'sin service-role' };
      const { data: ofertas } = await admin
        .from('reservas')
        .select('id, studio_id, sesion_id, socio_id')
        .eq('estado', 'LISTA_ESPERA')
        .not('oferta_expira_en', 'is', null)
        .lte('oferta_expira_en', new Date().toISOString());
      if (!ofertas?.length) return { expiradas: 0 };
      for (const o of ofertas) {
        if (!o.socio_id || !o.sesion_id) continue;
        await expirarOfertaListaEspera({
          studioId: o.studio_id as string,
          reservaId: o.id as string,
          sesionId: o.sesion_id as string,
          socioId: o.socio_id as string,
        });
      }
      return { expiradas: ofertas.length };
    });
  },
);
