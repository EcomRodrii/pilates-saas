// Plazas apartadas para ClassPass que se acaban de liberar (X horas antes de la
// clase, migr 20261007164222): la regla ya se cumple sola al leer —desde ese
// momento cualquiera puede reservarlas—, pero la lista de espera no se entera
// sola. Este barrido le da esas plazas a la cola, como cuando alguien cancela.
//
// Va en el mismo job de pg_cron que las ofertas caducadas
// (`lista-espera-ofertas-expirar`, cada 5 min), y su predicado pide lo mismo que
// esto: `sesiones_con_plazas_liberadas(interval '15 minutes')`. La ventana cubre
// tres pasadas por si una falla; una sesión ya resuelta no vuelve a salir porque
// se queda sin huecos o sin cola.
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { promocionarEsperaDeSesion } from '@/lib/db/supabase-data-admin';
import { exigirLectura } from '@/lib/exigir-lectura';
import { capturarMensaje } from '@/lib/sentry-cliente';

/** La misma ventana que el predicado del job (migración): cambiar una es cambiar la otra. */
export const VENTANA_PLAZAS_LIBERADAS = '15 minutes';

export async function barrerColasConPlazaLiberada(): Promise<{ promovidas: number; fallos: number }> {
  const admin = getSupabaseAdmin();
  if (!admin) return { promovidas: 0, fallos: 0 };
  const { data, error } = await admin.rpc('sesiones_con_plazas_liberadas', { p_ventana: VENTANA_PLAZAS_LIBERADAS });
  exigirLectura(error, 'leyendo las clases con plazas apartadas recién liberadas');
  let promovidas = 0;
  let fallos = 0;
  for (const s of (data ?? []) as { studio_id: string; sesion_id: string; huecos: number }[]) {
    for (let i = 0; i < Math.max(0, s.huecos); i++) {
      try {
        // Sin nadie más que pueda subir (cola vacía o todas con impedimento), se para.
        if (!(await promocionarEsperaDeSesion(admin, { studioId: s.studio_id, sesionId: s.sesion_id }))) break;
        promovidas += 1;
      } catch {
        fallos += 1;
        break;
      }
    }
  }
  if (fallos > 0) {
    capturarMensaje('[lista-espera] plazas liberadas de ClassPass que no se pudieron dar a la cola', 'error', { extra: { fallos } });
  }
  return { promovidas, fallos };
}
