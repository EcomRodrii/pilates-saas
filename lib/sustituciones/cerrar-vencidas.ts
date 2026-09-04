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
import { ESTADOS_EN_JUEGO, alertarPropietaria } from '@/lib/sustituciones/contacto';

export async function cerrarSustitucionesVencidas(): Promise<{ cerradas: number }> {
  const admin = getSupabaseAdmin();
  if (!admin) return { cerradas: 0 };
  const nowISO = new Date().toISOString();

  // Pre-filtro amplio en dos consultas (mismo patrón que confirmacion-riesgo/
  // lista-espera): primero las sustituciones en juego, luego sus sesiones, y
  // la decisión real ("¿ya pasó?") en JS sobre `inicio`.
  // Paginado: query global (todos los estudios) y PostgREST corta a 1.000
  // filas en silencio.
  // `studio_id` se trae aquí (no solo al cerrar) porque hace falta para
  // avisar a la propietaria — auditoría de producto P0-2: este barrido
  // cerraba la sustitución sin avisar a nadie, a diferencia del cierre por
  // `agotada` (ranking agotado durante escalado activo), que sí alerta. Una
  // clase podía quedarse sin cubrir y la propietaria enterarse por curiosidad
  // al abrir el panel, potencialmente después de que la clase ya hubiera
  // pasado — que es justo cuándo dispara este barrido.
  const { data: enJuego } = await fetchAllRows<{ id: string; sesion_id: string; studio_id: string }>(
    '(global)', 'sustituciones',
    (from, to) => admin.from('sustituciones').select('id, sesion_id, studio_id')
      .in('estado', ESTADOS_EN_JUEGO).range(from, to),
  );
  if (enJuego.length === 0) return { cerradas: 0 };

  const sesionIds = Array.from(new Set(enJuego.map(s => s.sesion_id)));
  const { data: sesiones } = await fetchAllRows<{ id: string; inicio: string; tipo_clase_id: string | null }>(
    '(global)', 'sesiones',
    (from, to) => admin.from('sesiones').select('id, inicio, tipo_clase_id').in('id', sesionIds).range(from, to),
  );
  const sesionPorId = new Map(sesiones.map(s => [s.id, s]));

  const vencidas = enJuego.filter(s => {
    const sesion = sesionPorId.get(s.sesion_id);
    return !!sesion?.inicio && new Date(sesion.inicio).getTime() <= new Date(nowISO).getTime();
  });
  if (vencidas.length === 0) return { cerradas: 0 };
  const vencidasIds = vencidas.map(s => s.id);

  // Compare-and-set: solo cierra las que SIGAN en juego en este instante (si
  // alguien confirmó/canceló entre el listado y aquí, esa fila ya habrá
  // salido de ESTADOS_EN_JUEGO y el `.in('estado', ...)` la deja fuera).
  const { data: actualizadas, error } = await admin
    .from('sustituciones')
    .update({ estado: 'sin_sustituta', resuelto_en: nowISO })
    .in('id', vencidasIds).in('estado', ESTADOS_EN_JUEGO).select('id');
  if (error) throw new Error(error.message);

  // Avisar SOLO a las que de verdad se cerraron aquí (el compare-and-set de
  // arriba puede haber dejado fuera alguna que otro proceso resolvió justo
  // antes) — evita un aviso "se quedó sin cubrir" para una clase que en
  // realidad sí se cubrió a tiempo por otra vía.
  const cerradasIds = new Set((actualizadas ?? []).map(r => r.id));
  const aAlertar = vencidas.filter(s => cerradasIds.has(s.id));
  await Promise.all(aAlertar.map(s => {
    const sesion = sesionPorId.get(s.sesion_id);
    return alertarPropietaria(admin, {
      studioId: s.studio_id,
      sesion: sesion ? { inicio: sesion.inicio, tipo_clase_id: sesion.tipo_clase_id } : null,
      tipo: 'sin_sustituta',
    }).catch(() => {});
  }));

  return { cerradas: actualizadas?.length ?? 0 };
}
