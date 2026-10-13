import { NextRequest, NextResponse } from 'next/server';
import { verificarSesionStaff } from '@/lib/auth-server';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { enforceRateLimit } from '@/lib/rate-limit';
import { tarjetaClaseEncendida } from '@/lib/interruptor-por-estudio';
import { errorInterno } from '@/lib/errores-servidor';
import { paraGuardar, tarjetaClaseDe, validarTarjetaClase } from '@/lib/calendario/tarjeta-clienta';

export const dynamic = 'force-dynamic';

// P3.11 — qué se ve de cada alumna en la lista de una clase (diseño 22).
// Guarda `studios.tarjeta_clase`, que el navegador NO puede actualizar (no hay
// GRANT UPDATE de esa columna a authenticated): esta es la única puerta para
// cambiarla. (Solo el alta de un estudio, con el INSERT de tabla, podría traerla
// rellena, y solo en el suyo: se lee con tolerancia y no amplía nada.)
//
// Solo la propietaria, y solo con `TARJETA_CLASE` encendido para su estudio.
// Lo que se guarda solo elige qué pintar de lo que cada rol ya recibe: la
// salud la siguen limitando la RLS (las condiciones solo le llegan a la
// propietaria) y `saludVisible`, que no da «adaptar» sin la ficha clínica.
//
// Corre con service-role: el estudio sale SIEMPRE de la sesión, nunca del body.
// La pantalla manda además el estudio que tiene delante (`?estudio=`): si la
// sesión ya está en otra sede (cambió en otra pestaña), 409 y no se guarda en
// la otra, igual que `interruptoresPara`.

export async function PUT(req: NextRequest) {
  const sesion = await verificarSesionStaff(req);
  if (!sesion) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  if (sesion.rol !== 'PROPIETARIO') return NextResponse.json({ error: 'Solo la propietaria puede cambiar esto' }, { status: 403 });
  if (!tarjetaClaseEncendida(sesion.studioId)) return NextResponse.json({ error: 'No disponible' }, { status: 404 });
  if (req.nextUrl.searchParams.get('estudio') !== sesion.studioId) {
    return NextResponse.json({ error: 'Has cambiado de sede en otra pestaña: recarga la página y vuelve a guardar.' }, { status: 409 });
  }

  const limited = await enforceRateLimit(req, 'estudio-tarjeta-clase', { max: 30, windowSeconds: 60 }, sesion.studioId);
  if (limited) return limited;

  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Formato no válido' }, { status: 400 }); }
  const v = validarTarjetaClase(body);
  if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 });

  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: 'Servidor no configurado' }, { status: 503 });

  const valor = paraGuardar(v.tarjeta);
  const { data, error } = await admin.from('studios').update({ tarjeta_clase: valor }).eq('id', sesion.studioId).select('id');
  if (error) return errorInterno('[estudio/tarjeta-clase] guardar', error);
  if (!data?.length) return NextResponse.json({ error: 'No se ha guardado: no encontramos tu estudio' }, { status: 404 });

  // Lo que queda guardado, ya leído como lo leerá el panel.
  return NextResponse.json({ tarjeta: tarjetaClaseDe(valor) });
}
