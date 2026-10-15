// Aplica el margen de 30 días a las apps de tienda cuyo estudio dejó de pagar Estudio/Cadena
// (`accionSinPlan`, apps-sin-plan.ts). Lo llama el cron horario `notif-trial`: mismo público (la
// propietaria) y misma cadencia, sin un job nuevo.
//
// Cada escritura es un compare-and-set sobre lo que se leyó (`sin_plan_desde` y `estado`): si dos
// pasadas se cruzan, o quien tramita la app la cambia a la vez desde /interno, gana una y la otra no
// hace nada. Los avisos salen solo si la escritura cambió una fila, y llevan su propio dedupKey.

import type { SupabaseClient } from '@supabase/supabase-js';
import { accionSinPlan } from './apps-sin-plan.ts';
import { esEstadoApp } from './pedir-app.ts';
import { emitirAppTiendaPausada, emitirAppTiendaSinPlan } from '@/lib/notifications/emit';

type Fila = {
  studio_id: string; estado: string; sin_plan_desde: string | null; nota_interna: string | null;
  studios: { plan: string | null; subscription_status: string | null } | null;
};

const fechaMadrid = (d: Date) => d.toLocaleDateString('es-ES', { day: 'numeric', month: 'long', timeZone: 'Europe/Madrid' });
const conNota = (nota: string | null, linea: string) => (nota ? `${nota}\n${linea}` : linea).slice(-2000);

export async function revisarAppsSinPlan(admin: SupabaseClient, ahora = new Date()) {
  const { data, error } = await admin.from('apps_estudio')
    .select('studio_id, estado, sin_plan_desde, nota_interna, studios!inner(plan, subscription_status)');
  if (error) throw new Error(`leer las apps de estudio: ${error.message}`);

  const r = { empiezan: 0, vuelven: 0, pausadas: 0 };
  for (const f of (data ?? []) as unknown as Fila[]) {
    if (!esEstadoApp(f.estado)) continue;
    const accion = accionSinPlan(
      { estado: f.estado, sinPlanDesde: f.sin_plan_desde },
      { plan: f.studios?.plan ?? null, estado: f.studios?.subscription_status ?? null },
      ahora,
    );
    const publicada = f.estado === 'PUBLICADA';

    if (accion.tipo === 'empieza') {
      const desde = ahora.toISOString();
      const q = admin.from('apps_estudio').update({ sin_plan_desde: desde }).eq('studio_id', f.studio_id);
      const { data: hecho } = await (f.sin_plan_desde ? q.eq('sin_plan_desde', f.sin_plan_desde) : q.is('sin_plan_desde', null)).select('studio_id');
      if (hecho?.length) {
        r.empiezan++;
        await emitirAppTiendaSinPlan(admin, { studioId: f.studio_id, sinPlanDesde: desde, fecha: fechaMadrid(accion.hasta), publicada });
      }
    } else if (accion.tipo === 'vuelve' && f.sin_plan_desde) {
      const cambios: Record<string, unknown> = { sin_plan_desde: null };
      // Pausada por no pagar y ahora vuelve a pagar: quien tramita la retoma (y la vuelve a publicar).
      if (f.estado === 'PAUSADA') cambios.nota_interna = conNota(f.nota_interna, `${fechaMadrid(ahora)}: vuelve a pagar Estudio/Cadena. Retomarla (y volver a publicarla si se retiró).`);
      const { data: hecho } = await admin.from('apps_estudio').update(cambios)
        .eq('studio_id', f.studio_id).eq('sin_plan_desde', f.sin_plan_desde).select('studio_id');
      if (hecho?.length) r.vuelven++;
    } else if (accion.tipo === 'retirar' && f.sin_plan_desde) {
      // `activa` se queda como está: quien ya la tiene instalada la sigue usando (es la web de su estudio).
      const nota = conNota(f.nota_interna, `${fechaMadrid(ahora)}: en pausa por no pagar Estudio/Cadena desde el ${fechaMadrid(new Date(f.sin_plan_desde))}.${publicada ? ' RETIRAR DE LA VENTA en App Store Connect.' : ''}`);
      const { data: hecho } = await admin.from('apps_estudio').update({ estado: 'PAUSADA', nota_interna: nota })
        .eq('studio_id', f.studio_id).eq('estado', f.estado).eq('sin_plan_desde', f.sin_plan_desde).select('studio_id');
      if (hecho?.length) {
        r.pausadas++;
        await emitirAppTiendaPausada(admin, { studioId: f.studio_id, sinPlanDesde: f.sin_plan_desde, publicada });
      }
    }
  }
  return r;
}
