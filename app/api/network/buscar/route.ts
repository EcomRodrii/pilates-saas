import { NextRequest, NextResponse } from 'next/server';
import { verificarSesionStaff } from '@/lib/auth-server';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { errorInterno } from '@/lib/errores-servidor';
import { buscarPerfilesPublico, filtroDesdeSearchParams } from '@/lib/network/publico';

// Buscador de profesionales, desde el PANEL de un estudio —
// docs/NETWORK-IMPLEMENTATION-PLAN.md §4/§8.
//
// Service-role + verificarSesionStaff (no verificarUsuarioSupabase): a
// diferencia del perfil propio, esto es una pantalla del panel de un
// estudio (propietaria/manager/recepción buscando quién puede cubrir un
// hueco), así que se le exige el mismo tipo de sesión que al resto de rutas
// del dashboard. Nótese que esto NO es el límite de seguridad de verdad —
// la lógica de columnas públicas en lib/network/publico.ts es la misma que
// usa el marketplace PÚBLICO (app/network/instructoras, sin sesión); este
// guard es solo para que la ruta se comporte igual que sus vecinas del
// panel, no para restringir qué datos son visibles.
export async function GET(req: NextRequest) {
  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: 'Servidor no configurado' }, { status: 503 });

  const sesion = await verificarSesionStaff(req);
  if (!sesion) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const filtro = filtroDesdeSearchParams(req.nextUrl.searchParams);
  const resultado = await buscarPerfilesPublico(admin, filtro);
  if ('error' in resultado) return errorInterno('network:buscar', resultado.error, 'No se han podido cargar los resultados.');

  return NextResponse.json({ perfiles: resultado.perfiles });
}
