import { NextRequest, NextResponse } from 'next/server';
import { verificarSesionStaff } from '@/lib/auth-server';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { errorInterno } from '@/lib/errores-servidor';
import { widgetPorId } from '@/lib/widgets/catalogo';
import { MENSAJE_PIEZA_CAMBIADA, nuevoIdPieza, validarPedidoPieza } from '@/lib/widgets/pieza-pedido';
import { uid } from '@/lib/utils';

export const dynamic = 'force-dynamic';

// ─────────────────────────────────────────────────────────────────────────────
// Publicar lo de un widget pegado con su id (lib/widgets/pieza.ts): lo que la
// ruta pública sirve a su web desde ese momento (tarda unos minutos por la caché).
//
// Cambia a la vez todo lo que el estudio tiene pegado con ese id sin volver a
// copiar nada, así que lo decide solo la propietaria, como el estilo de sus
// widgets (/api/estudio/widget-estilo). El estudio sale de la sesión, nunca del
// cuerpo; la config se guarda normalizada (`validarPedidoPieza`).
//
//   · sin `esperado` (no había nada publicado): crea la pieza con un id nuevo.
//     Pasa al abrir «Ponlo en tu web» por primera vez: aún no hay nada pegado
//     con ese id, así que no cambia nada en su web, y por eso no deja constancia;
//   · con `esperado`: la actualiza SOLO si lo publicado sigue siendo lo que
//     tenía en pantalla. Si no, 409: otra pestaña aplicó algo entretanto.
// ─────────────────────────────────────────────────────────────────────────────

const conflicto = () => NextResponse.json({ error: MENSAJE_PIEZA_CAMBIADA }, { status: 409 });

export async function POST(req: NextRequest) {
  const sesion = await verificarSesionStaff(req);
  if (!sesion) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  if (sesion.rol !== 'PROPIETARIO') {
    return NextResponse.json({ error: 'Solo la propietaria puede aplicar cambios en tu web.' }, { status: 403 });
  }

  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: 'Servidor no configurado' }, { status: 503 });

  const validado = validarPedidoPieza(await req.json().catch(() => null));
  if (!validado.ok) return NextResponse.json({ error: validado.error }, { status: 400 });
  const { widget, config, esperado } = validado.pedido;
  const ahora = new Date().toISOString();

  try {
    if (esperado === null) {
      const { data, error } = await admin.from('widget_piezas')
        .insert({ id: nuevoIdPieza(), studio_id: sesion.studioId, widget, config, creado_en: ahora, actualizado_en: ahora })
        .select('id, config, actualizado_en').single();
      // Ya había una (otra pestaña la creó entretanto): lo mismo que un cambio ajeno.
      if (error?.code === '23505') return conflicto();
      if (error) throw error;
      return NextResponse.json({ id: data.id, config: data.config, actualizadoEn: data.actualizado_en });
    }

    const { data, error } = await admin.from('widget_piezas')
      .update({ config, actualizado_en: ahora })
      .eq('studio_id', sesion.studioId).eq('widget', widget).eq('actualizado_en', esperado)
      .select('id, config, actualizado_en').maybeSingle();
    if (error) throw error;
    if (!data) return conflicto();

    // Si falla la constancia no se deshace nada: ya está aplicado.
    const { error: errLog } = await admin.from('actividad_reciente').insert({
      id: uid(), studio_id: sesion.studioId, tipo: 'WIDGET_APLICADO',
      texto: `Aplicó en su web los cambios de «${widgetPorId(widget)?.nombre ?? widget}»`,
      socio_id: null, enlace: '/configuracion?tab=web&abrir=widgets', creado_en: ahora, actor_nombre: sesion.nombre,
    });
    if (errLog) console.error('[estudio:widget-pieza] no se pudo registrar la actividad', errLog.message);

    return NextResponse.json({ id: data.id, config: data.config, actualizadoEn: data.actualizado_en });
  } catch (e) {
    return errorInterno('estudio:widget-pieza', e, 'No se han podido aplicar los cambios. Vuelve a intentarlo.');
  }
}
