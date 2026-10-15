import { NextRequest, NextResponse } from 'next/server';
import { verificarSesionStaff } from '@/lib/auth-server';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { dbGetIntegracionConfig, dbGuardarIntegracion } from '@/lib/db/supabase-data-admin';
import { uscAvisosIntegradorEncendido } from '@/lib/interruptor-por-estudio';
import { credencialesUsc, ubicacionesUsc } from '@/lib/plataformas/usc/cliente';
import { vistaDeAvisos, type FilaAvisoVista } from '@/lib/plataformas/usc/avisos-vista';

export const dynamic = 'force-dynamic';

// Los avisos de integrador de USC que tiene esta propietaria (Conexiones ›
// Urban Sports Club). Ver lib/plataformas/usc/avisos-servidor.ts.
//
// Orden obligatorio: sesión → rol → interruptor → aviso → credenciales → USC →
// reclamo → guardar la configuración. `studioId` SIEMPRE de la sesión, y la
// consulta ya filtra por él: nadie ve el aviso de otro. Apagado y «no hay
// nada» contestan IGUAL (404): no se distingue que la función existe.
const COLUMNAS = 'id, tipo, provider_id, provider_nombre, estado, modificado_usc, fin, recibido_en';

async function cargar(studioId: string) {
  const admin = getSupabaseAdmin();
  if (!admin) return null;
  const { data, error } = await admin.from('usc_avisos_integrador').select(COLUMNAS)
    .eq('estudio_candidato_id', studioId).order('recibido_en', { ascending: false }).limit(50);
  if (error) return null;
  const intg = await dbGetIntegracionConfig(studioId, 'URBAN_SPORTS_CLUB');
  return { admin, filas: (data ?? []) as (FilaAvisoVista & { id: string })[], intg };
}

async function sesionPropietaria(req: NextRequest) {
  const sesion = await verificarSesionStaff(req);
  if (!sesion) return { error: NextResponse.json({ error: 'No autorizado' }, { status: 401 }) };
  if (sesion.rol !== 'PROPIETARIO') return { error: NextResponse.json({ error: 'Solo la propietaria puede cambiar las integraciones' }, { status: 403 }) };
  if (!uscAvisosIntegradorEncendido(sesion.studioId)) return { error: NextResponse.json({ error: 'No encontrado' }, { status: 404 }) };
  return { studioId: sesion.studioId, usuario: sesion.userId };
}

export async function GET(req: NextRequest) {
  const s = await sesionPropietaria(req);
  if ('error' in s) return s.error;
  const c = await cargar(s.studioId);
  if (!c) return NextResponse.json({ error: 'server' }, { status: 500 });
  const vista = vistaDeAvisos(c.filas, {
    providerId: c.intg?.config.providerId ?? null, integracionActiva: c.intg?.activo === true,
  });
  if (!vista) return NextResponse.json({ error: 'No encontrado' }, { status: 404 });
  return NextResponse.json({ aviso: vista });
}

// Confirmar, «no es mío» o deshacer ese «no es mío». Nada que venga del
// navegador decide el proveedor: el servidor elige el aviso pendiente de ESTA
// propietaria y la ubicación sale de la lista que USC devuelve en esta misma
// petición.
export async function POST(req: NextRequest) {
  const s = await sesionPropietaria(req);
  if ('error' in s) return s.error;
  const cuerpo = await req.json().catch(() => null) as { accion?: unknown } | null;
  const accion = cuerpo?.accion;
  if (accion !== 'confirmar' && accion !== 'rechazar' && accion !== 'reabrir') {
    return NextResponse.json({ error: 'Acción no válida' }, { status: 400 });
  }
  const c = await cargar(s.studioId);
  if (!c) return NextResponse.json({ error: 'No se ha podido leer el aviso. Inténtalo de nuevo.' }, { status: 500 });
  const vista = vistaDeAvisos(c.filas, {
    providerId: c.intg?.config.providerId ?? null, integracionActiva: c.intg?.activo === true,
  });
  const alta = c.filas.filter(f => f.tipo === 'IntegratorAssociated')[0];
  if (!vista || !alta) return NextResponse.json({ error: 'No encontrado' }, { status: 404 });

  if (accion === 'rechazar' || accion === 'reabrir') {
    const de = accion === 'rechazar' ? 'PENDIENTE' : 'RECHAZADO';
    if (vista.situacion !== (accion === 'rechazar' ? 'pendiente' : 'rechazado')) {
      return NextResponse.json({ error: 'Este aviso ya no admite ese cambio.' }, { status: 409 });
    }
    const { data, error } = await c.admin.from('usc_avisos_integrador')
      .update({ estado: accion === 'rechazar' ? 'RECHAZADO' : 'PENDIENTE', resuelto_por: s.usuario, resuelto_en: new Date().toISOString() })
      .eq('id', alta.id).eq('estado', de).select('id');
    if (error || !data?.length) return NextResponse.json({ error: 'No se ha podido guardar. Inténtalo de nuevo.' }, { status: 409 });
    return NextResponse.json({ ok: true });
  }

  // Confirmar.
  if (vista.situacion !== 'pendiente') return NextResponse.json({ error: 'Este aviso ya no está pendiente.' }, { status: 409 });
  const creds = credencialesUsc();
  if (!creds) {
    return NextResponse.json({ error: 'Todavía no podemos comprobarlo con Urban Sports Club. No hemos cambiado nada.' }, { status: 409 });
  }
  const proveedor = alta.provider_id;
  const r = await ubicacionesUsc(creds, proveedor);
  if (!r.ok) {
    console.error('[usc/avisos] comprobación con USC fallida:', r.error);
    return NextResponse.json({ error: 'No hemos podido comprobarlo con Urban Sports Club. No hemos cambiado nada. Inténtalo más tarde.' }, { status: 502 });
  }
  const activas = r.valor.filter(u => u.estado === 'Active');
  if (activas.length !== 1) {
    const sinUbicacion = activas.length === 0;
    return NextResponse.json({
      error: sinUbicacion
        ? 'Urban Sports Club todavía no ha publicado tu ubicación. No hemos cambiado nada: te lo diremos aquí cuando aparezca.'
        : 'Urban Sports Club te ha dado de alta más de una ubicación. No hemos cambiado nada: pega aquí abajo los dos IDs de la que quieras usar.',
      motivo: sinUbicacion ? 'sin-ubicacion' : 'varias-ubicaciones',
    }, { status: 409 });
  }

  // Reclamo: el índice único parcial deja UN solo estudio confirmado por proveedor.
  const { data: reclamado, error: errReclamo } = await c.admin.from('usc_avisos_integrador')
    .update({ estado: 'CONFIRMADO', resuelto_por: s.usuario, resuelto_en: new Date().toISOString() })
    .eq('id', alta.id).eq('estado', 'PENDIENTE').select('id');
  if (errReclamo?.code === '23505') return NextResponse.json({ error: 'Este centro ya está conectado a otro estudio. No hemos cambiado nada.' }, { status: 409 });
  if (errReclamo || !reclamado?.length) return NextResponse.json({ error: 'No se ha podido guardar. Inténtalo de nuevo.' }, { status: 409 });

  const revertir = () => c.admin.from('usc_avisos_integrador')
    .update({ estado: 'PENDIENTE', resuelto_por: null, resuelto_en: null })
    .eq('id', alta.id).eq('estado', 'CONFIRMADO').eq('resuelto_por', s.usuario);

  // Otro estudio con ese proveedor pegado a mano: no se pisa.
  const { data: otros, error: errOtros } = await c.admin.from('integraciones').select('studio_id')
    .eq('tipo', 'URBAN_SPORTS_CLUB').eq('config->>providerId', proveedor).neq('studio_id', s.studioId).limit(1);
  if (errOtros || otros?.length) {
    await revertir();
    return NextResponse.json({ error: otros?.length ? 'Este centro ya está conectado a otro estudio. No hemos cambiado nada.' : 'No se ha podido guardar. Inténtalo de nuevo.' }, { status: otros?.length ? 409 : 500 });
  }

  const guardada = await dbGuardarIntegracion(s.studioId, {
    tipo: 'URBAN_SPORTS_CLUB', activo: true, reiniciarSalud: true,
    config: { ...(c.intg?.config ?? {}), modo: 'api', providerId: proveedor, locationId: activas[0].id },
  });
  if (!guardada.ok) {
    await revertir();
    return NextResponse.json({ error: 'No se ha podido guardar la conexión. No hemos cambiado nada. Inténtalo de nuevo.' }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
