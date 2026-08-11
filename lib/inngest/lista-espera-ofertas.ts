// ─────────────────────────────────────────────────────────────────────────────
// Fase 2b (plazo para aceptar una plaza de lista de espera): ninguna oferta
// puede quedar viva indefinidamente. Igual que en reservas-pendientes.ts (Fase
// 2a), la regla de negocio ya vive DENTRO de la RPC
// aceptar_oferta_lista_espera (nadie puede aceptar tras oferta_expira_en, pase
// lo que pase con este cron) — este cron es solo el aviso proactivo a la
// siguiente en la cola, por eso corre cada 5 min: un desfase de hasta 5 min
// sobre una ventana típica de 15 es tolerable, no es una regla de seguridad.
//
// ⚠️ NO bajar a */10. La auditoría de consumo (2026-08-11, O-1) lo propuso y se
// descartó al mirar el número: la tolerancia razonada arriba es "5 sobre 15",
// un tercio de la ventana; a */10 pasaría a ser dos tercios, y además el retraso
// se ENCADENA — cada persona de la cola que no acepta suma su propio desfase
// antes de que se entere la siguiente. Se bajaron `reservas-pendientes`,
// `penalizaciones` y `checkin-automatico` en su lugar, que no tienen ninguna
// ventana con la que competir.
//
// Sin fan-out por estudio (igual que reservas-pendientes.ts): es una única
// query global de "oferta caducada", no hay nada que decidir por estudio.
// ─────────────────────────────────────────────────────────────────────────────
import { inngest } from './client';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { expirarOfertaListaEspera } from '@/lib/db/supabase-data-admin';
import { fetchAllRows } from '@/lib/supabase-data';

export const listaEsperaOfertasExpirarDispatcher = inngest.createFunction(
  { id: 'lista-espera-ofertas-expirar', triggers: [{ cron: '*/5 * * * *' }] },
  async ({ step }) => {
    return step.run('expirar', async () => {
      const admin = getSupabaseAdmin();
      if (!admin) return { skipped: 'sin service-role' };
      // Paginado: query global (todos los estudios) y PostgREST corta a 1.000
      // filas en silencio. Una oferta que cayera fuera del corte no expiraría
      // nunca y bloquearía la plaza para la siguiente de la cola.
      const { data: ofertas } = await fetchAllRows<{ id: string; studio_id: string; sesion_id: string | null; socio_id: string | null }>(
        '(global)', 'reservas',
        (from, to) => admin
          .from('reservas')
          .select('id, studio_id, sesion_id, socio_id')
          .eq('estado', 'LISTA_ESPERA')
          .not('oferta_expira_en', 'is', null)
          .lte('oferta_expira_en', new Date().toISOString())
          .range(from, to),
      );
      if (!ofertas.length) return { expiradas: 0 };
      for (const o of ofertas) {
        if (!o.socio_id || !o.sesion_id) continue;
        await expirarOfertaListaEspera({
          studioId: o.studio_id,
          reservaId: o.id,
          sesionId: o.sesion_id,
          socioId: o.socio_id,
        });
      }
      return { expiradas: ofertas.length };
    });
  },
);
