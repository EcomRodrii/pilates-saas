import { NextRequest, NextResponse } from 'next/server';
import { verificarSesionStaff } from '@/lib/auth-server';
import { puedeGestionarSede } from '@/lib/permisos-reglas';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { enforceRateLimit } from '@/lib/rate-limit';
import { hoyEnEstudio } from '@/lib/utils';
import { NOMBRE_ZONA } from '@/lib/festivos/oficiales';
import { guardarFestivos, listaDelEstudio, quitarFestivos, ubicacionDelEstudio, zonaDeUbicacion } from '@/lib/festivos/estudio-servidor';
import { limpiarLocalidad, prepararParaGuardar, zonaDeBusqueda, MAX_POR_GUARDADO } from '@/lib/festivos/modulo';

export const dynamic = 'force-dynamic';

// Módulo Festivos: la lista de festivos del estudio.
//   GET    → los oficiales de su zona (por la dirección, del código) y los que
//            ha guardado, con lo que ya decidió de cada día (cerrado / abres).
//   POST   → guardar en lote lo que la propietaria ha marcado `{ localidad, festivos }`:
//            los locales de la IA, los días propios y los oficiales de la
//            localidad buscada que la dirección no trae (comprobados contra el
//            calendario del código; un día que ya está en la lista se salta).
//   DELETE → quitar de la lista `{ ids }` (solo lo guardado: un oficial de la
//            dirección no se quita).
// Guardar o quitar un festivo NO toca clases ni reservas: cerrar el día es el
// POST /api/cierres de siempre y abrir igualmente, POST /api/festivos.
//
// ⚠️ El estudio sale SIEMPRE de la sesión y el rol se comprueba AQUÍ: todo va
// con service-role (la RLS de `festivos_estudio` no protege nada en esta ruta).
// Mismo permiso que cerrar el centro (`puedeGestionarSede`: PROPIETARIO y MANAGER).

async function puerta(req: NextRequest) {
  const sesion = await verificarSesionStaff(req);
  if (!sesion) return { error: NextResponse.json({ error: 'No autorizado' }, { status: 401 }) };
  if (!puedeGestionarSede(sesion.rol)) return { error: NextResponse.json({ error: 'No tienes permiso para esto' }, { status: 403 }) };
  const admin = getSupabaseAdmin();
  if (!admin) return { error: NextResponse.json({ error: 'Servidor no configurado' }, { status: 503 }) };
  return { sesion, admin };
}

const NO_DISPONIBLE = () => NextResponse.json({ error: 'No disponible' }, { status: 404 });
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(req: NextRequest) {
  const p = await puerta(req);
  if ('error' in p) return p.error;
  const ubicacion = await ubicacionDelEstudio(p.admin, p.sesion.studioId);
  if (ubicacion === 'error') return NextResponse.json({ error: 'No se han podido leer tus festivos' }, { status: 500 });
  const zona = zonaDeUbicacion(ubicacion);
  const hoy = hoyEnEstudio();
  const lista = await listaDelEstudio(p.admin, p.sesion.studioId, zona, hoy);
  if (lista === 'no_disponible') return NO_DISPONIBLE();
  if (lista === 'error') return NextResponse.json({ error: 'No se han podido leer tus festivos' }, { status: 500 });
  return NextResponse.json({
    hoy,
    // Para rellenar «Tu localidad»: la ciudad de la dirección del estudio.
    localidad: ubicacion.ciudad?.trim() || ubicacion.codigoPostal?.trim() || '',
    comunidad: zona ? NOMBRE_ZONA[zona] : null,
    festivos: lista,
  }, { headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(req: NextRequest) {
  const p = await puerta(req);
  if ('error' in p) return p.error;
  const limited = await enforceRateLimit(req, 'festivos-guardar', { max: 20, windowSeconds: 60 }, p.sesion.studioId);
  if (limited) return limited;

  const body = (await req.json().catch(() => null)) as { localidad?: unknown; festivos?: unknown } | null;
  const ubicacion = await ubicacionDelEstudio(p.admin, p.sesion.studioId);
  if (ubicacion === 'error') return NextResponse.json({ error: 'No se han podido guardar. Inténtalo de nuevo.' }, { status: 500 });
  // Las comunidades las decide el servidor: la de la dirección (lo que la lista
  // ya trae) y la de la localidad buscada (contra la que se comprueba un oficial).
  const localidad = limpiarLocalidad(body?.localidad);
  const preparado = prepararParaGuardar(body?.festivos, {
    zonaLista: zonaDeUbicacion(ubicacion),
    zonaBusqueda: localidad ? zonaDeBusqueda(localidad, ubicacion) : null,
    hoy: hoyEnEstudio(),
  });
  if (!preparado.ok) return NextResponse.json({ error: preparado.error }, { status: 400 });
  if (preparado.filas.length === 0) return NextResponse.json({ ok: true, creados: [], yaEstaban: preparado.omitidos });

  const r = await guardarFestivos(p.admin, p.sesion.studioId, p.sesion.userId ?? null, preparado.filas);
  if (r === 'no_disponible') return NO_DISPONIBLE();
  if (r === 'error') return NextResponse.json({ error: 'No se han podido guardar. Inténtalo de nuevo.' }, { status: 500 });
  return NextResponse.json({ ok: true, creados: r.creados, yaEstaban: r.yaEstaban + preparado.omitidos });
}

export async function DELETE(req: NextRequest) {
  const p = await puerta(req);
  if ('error' in p) return p.error;
  const body = (await req.json().catch(() => null)) as { ids?: unknown } | null;
  const crudos = Array.isArray(body?.ids) ? body.ids : [];
  const ids = crudos.filter((x): x is string => typeof x === 'string' && UUID.test(x));
  if (ids.length === 0 || ids.length !== crudos.length || ids.length > MAX_POR_GUARDADO) {
    return NextResponse.json({ error: 'Elige qué festivos quitar' }, { status: 400 });
  }
  const r = await quitarFestivos(p.admin, p.sesion.studioId, ids);
  if (r === 'no_disponible') return NO_DISPONIBLE();
  if (r === 'error') return NextResponse.json({ error: 'No se han podido quitar. Inténtalo de nuevo.' }, { status: 500 });
  return NextResponse.json({ ok: true, quitados: r });
}
