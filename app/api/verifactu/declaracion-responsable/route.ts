import { NextRequest, NextResponse } from 'next/server';
import { verificarSesionStaff } from '@/lib/auth-server';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { puedeVer } from '@/lib/permisos-reglas';
import { estadoDeclaracion } from '@/lib/verifactu/declaracion';
import { errorInterno } from '@/lib/errores-servidor';

export const dynamic = 'force-dynamic';

// La declaración responsable del sistema de facturación, para quien usa el panel.
//
// Orden HAC/1177/2024, art. 15.3: «deberá encontrarse disponible de manera
// legible e individualizada dentro del propio sistema informático … y ser
// accesible por el usuario de forma rápida, fácil e intuitiva». Por eso la ve
// todo el personal del panel, no solo la propietaria.
//
// Va por API con sesión y no como página servida en HTML: lleva el nombre, el
// NIF y la dirección del productor (una persona física), y no deben quedar en
// una página que cualquiera pueda abrir sin cuenta.
export async function GET(req: NextRequest) {
  const sesion = await verificarSesionStaff(req);
  if (!sesion) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  if (!puedeVer(sesion.rol, '/verifactu/declaracion-responsable')) {
    return NextResponse.json({ error: 'Tu rol no usa el panel de facturación' }, { status: 403 });
  }
  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: 'Servidor sin service-role configurada' }, { status: 503 });
  try {
    return NextResponse.json(await estadoDeclaracion(admin), { headers: { 'Cache-Control': 'no-store' } });
  } catch (err) {
    return errorInterno('verifactu/declaracion-responsable:GET', err, 'No se ha podido leer la declaración responsable.');
  }
}
