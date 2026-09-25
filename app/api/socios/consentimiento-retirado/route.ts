import { NextRequest, NextResponse } from 'next/server';
import { verificarSesionStaff } from '@/lib/auth-server';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { puedeGestionarClientas } from '@/lib/permisos-reglas';
import { retiroVigente, type EventoConsentimiento } from '@/lib/socios/consentimiento-retirado';

// AU-4: ¿esta socia retiró su consentimiento de marketing? El historial
// (`consentimientos_marketing_eventos`) solo lo lee la propietaria por RLS; quien
// registra un consentimiento en mostrador es cualquiera que gestione clientas y
// tiene que saberlo ANTES de confirmar. Se devuelve solo fecha y origen, nunca
// el texto, la IP ni el agente. Acotado al estudio de la sesión.
export async function GET(req: NextRequest) {
  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: 'Servidor no configurado' }, { status: 503 });
  const sesion = await verificarSesionStaff(req);
  if (!sesion) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  if (!puedeGestionarClientas(sesion.rol)) {
    return NextResponse.json({ error: 'Tu rol no puede consultar esto.' }, { status: 403 });
  }
  const socioId = req.nextUrl.searchParams.get('socioId');
  if (!socioId) return NextResponse.json({ error: 'Falta socioId' }, { status: 400 });

  const { data, error } = await admin
    .from('consentimientos_marketing_eventos')
    .select('en, accion, origen')
    .eq('studio_id', sesion.studioId).eq('socio_id', socioId)
    .order('en', { ascending: false }).limit(20);
  if (error) return NextResponse.json({ error: 'No se pudo leer' }, { status: 500 });
  return NextResponse.json({ retiro: retiroVigente((data ?? []) as EventoConsentimiento[]) });
}
