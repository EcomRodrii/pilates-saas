import { NextRequest, NextResponse } from 'next/server';
import { verificarSesionStaff } from '@/lib/auth-server';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { errorInterno } from '@/lib/errores-servidor';
import { ConflictoTheme, aplicarEstiloWebTheme, type ResultadoEstiloWebTheme } from '@/lib/theme-data';
import { MENSAJE_ESTILO_WEB_CAMBIADO, validarPedidoEstiloWeb } from '@/lib/widgets/estilo-web-pedido';
import { uid } from '@/lib/utils';

export const dynamic = 'force-dynamic';

// ─────────────────────────────────────────────────────────────────────────────
// El estilo de los widgets en su web (Configuración → Tu web → Widgets, paso
// «Cómo se ve»): «Aplicar en mi web» y su Deshacer.
//
// Cambia a la vez todo lo que el estudio tiene pegado DENTRO de su web sin
// volver a copiar ningún código, así que lo decide solo la propietaria. Va por
// su propia ruta y no por /api/theme/publish porque aquella lleva el candado
// del plan con marca y los widgets no tienen candado de plan.
//
// Qué se escribe lo decide `decidirEstiloWeb` (lib/widgets/estilo-web-aplicar.ts)
// sobre la MISMA lectura que se sobrescribe (lib/theme-data.ts):
//   · 409 si lo publicado ya no es lo que la dueña tenía en pantalla;
//   · 422 si no se lee, con el mismo aviso que el panel;
//   · 200 con lo aplicado y lo que había antes, que es lo que usa Deshacer.
// Y queda constancia en Actividad, sin datos personales: solo nombres del
// catálogo de estilos.
// ─────────────────────────────────────────────────────────────────────────────

function responder(resultado: Exclude<ResultadoEstiloWebTheme, { tipo: 'aplicado' }>): NextResponse {
  return resultado.tipo === 'cambiado'
    ? NextResponse.json({ error: MENSAJE_ESTILO_WEB_CAMBIADO }, { status: 409 })
    : NextResponse.json({ error: 'Contraste insuficiente', errores: resultado.errores }, { status: 422 });
}

export async function POST(req: NextRequest) {
  const sesion = await verificarSesionStaff(req);
  if (!sesion) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  if (sesion.rol !== 'PROPIETARIO') {
    return NextResponse.json({ error: 'Solo la propietaria puede cambiar el estilo de tus widgets.' }, { status: 403 });
  }

  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: 'Servidor no configurado' }, { status: 503 });

  const validado = validarPedidoEstiloWeb(await req.json().catch(() => null));
  if (!validado.ok) return NextResponse.json({ error: validado.error }, { status: 400 });

  // El estudio de la sesión, nunca del body.
  let resultado: ResultadoEstiloWebTheme;
  try {
    resultado = await aplicarEstiloWebTheme(sesion.studioId, validado.pedido);
  } catch (e) {
    if (e instanceof ConflictoTheme) return responder({ tipo: 'cambiado' });
    return errorInterno('estudio:widget-estilo', e, 'No se ha podido aplicar el estilo. Vuelve a intentarlo.');
  }
  if (resultado.tipo !== 'aplicado') return responder(resultado);

  if (resultado.texto) {
    // Si falla la constancia no se deshace el cambio: ya está aplicado.
    const { error: errLog } = await admin.from('actividad_reciente').insert({
      id: uid(), studio_id: sesion.studioId, tipo: 'WIDGETS_ESTILO_CAMBIADO', texto: resultado.texto,
      socio_id: null, enlace: '/configuracion?tab=web&abrir=widgets', creado_en: new Date().toISOString(), actor_nombre: sesion.nombre,
    });
    if (errLog) console.error('[estudio:widget-estilo] no se pudo registrar la actividad', errLog.message);
  }

  return NextResponse.json({ aplicado: resultado.aplicado, anterior: resultado.anterior });
}
