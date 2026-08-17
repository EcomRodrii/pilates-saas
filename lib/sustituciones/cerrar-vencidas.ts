// Cierre de sustituciones vencidas — barrido periódico sin estado por ítem ni
// espera durable (bucket A de la arquitectura híbrida, ver
// app/api/cron/sustituciones-cerrar-vencidas/route.ts y la migración pg_cron).
//
// El escalado (lib/inngest/sustituciones.ts) nunca cierra una sustitución sin
// cubrir: si la clase pasa mientras una instancia todavía calcula sus
// ventanas, `calcularVentanas` devuelve `correr: false` ('clase_pasada') y la
// función termina sin tocar la fila; y en modo asistido, tras alertar una vez
// a la dueña ("X no responde"), el motor se apaga del todo y deja la
// sustitución en 'contactando' esperando una decisión humana que puede no
// llegar nunca. Sin este barrido, una clase que se quedó sin cubrir sigue
// apareciendo como "activa" en el panel indefinidamente, aunque ya haya
// pasado (ver app/(dashboard)/sustituciones/page.tsx, que además filtra esto
// en el cliente como defensa en profundidad mientras este barrido no corre).
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { fetchAllRows } from '@/lib/supabase-data';
import { ESTADOS_EN_JUEGO } from '@/lib/sustituciones/contacto';

export async function cerrarSustitucionesVencidas(): Promise<{ cerradas: number }> {
  const admin = getSupabaseAdmin();
  if (!admin) return { cerradas: 0 };
  const nowISO = new Date().toISOString();

  // Pre-filtro amplio en dos consultas (mismo patrón que confirmacion-riesgo/
  // lista-espera): primero las sustituciones en juego, luego sus sesiones, y
  // la decisión real ("¿ya pasó?") en JS sobre `inicio`.
  // Paginado: query global (todos los estudios) y PostgREST corta a 1.000
  // filas en silencio.
  const { data: enJuego } = await fetchAllRows<{ id: string; sesion_id: string }>(
    '(global)', 'sustituciones',
    (from, to) => admin.from('sustituciones').select('id, sesion_id')
      .in('estado', ESTADOS_EN_JUEGO).range(from, to),
  );
  if (enJuego.length === 0) return { cerradas: 0 };

  const sesionIds = Array.from(new Set(enJuego.map(s => s.sesion_id)));
  const { data: sesiones } = await fetchAllRows<{ id: string; inicio: string }>(
    '(global)', 'sesiones',
    (from, to) => admin.from('sesiones').select('id, inicio').in('id', sesionIds).range(from, to),
  );
  const inicioPorSesion = new Map(sesiones.map(s => [s.id, s.inicio]));

  const vencidasIds = enJuego
    .filter(s => {
      const inicio = inicioPorSesion.get(s.sesion_id);
      return !!inicio && new Date(inicio).getTime() <= new Date(nowISO).getTime();
    })
    .map(s => s.id);
  if (vencidasIds.length === 0) return { cerradas: 0 };

  // Compare-and-set: solo cierra las que SIGAN en juego en este instante (si
  // alguien confirmó/canceló entre el listado y aquí, esa fila ya habrá
  // salido de ESTADOS_EN_JUEGO y el `.in('estado', ...)` la deja fuera).
  const { data: actualizadas, error } = await admin
    .from('sustituciones')
    .update({ estado: 'sin_sustituta', resuelto_en: nowISO })
    .in('id', vencidasIds).in('estado', ESTADOS_EN_JUEGO).select('id');
  if (error) throw new Error(error.message);
  return { cerradas: actualizadas?.length ?? 0 };
}
