import { NextRequest, NextResponse } from 'next/server';
import { verificarSesionStaff } from '@/lib/auth-server';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { errorInterno } from '@/lib/errores-servidor';
import { rebotesDeEmails } from '@/lib/emails/rebotes-consulta';

// ─────────────────────────────────────────────────────────────────────────────
// Qué correos de ESTE estudio están rotos.
//
// La ficha de la clienta enseñaba su email como un dato más. Si ese buzón
// rebota, el estudio no se entera por ningún sitio: el aviso de hueco lo dice
// solo cuando lo reintentas, y los recordatorios y facturas no lo dicen nunca.
// Pasó de verdad — 9 socias de 2 estudios con una dirección que rebota, y nadie
// podía saberlo mirando el panel (#1868).
//
// ⚠️ **El cliente NO manda las direcciones.** Es lo único importante de esta
// ruta. `email_rebotes` es global por diseño (un buzón roto lo está para todo
// el mundo), así que un endpoint que aceptara una lista sería un oráculo:
// cualquiera con sesión de personal podría preguntar «¿rebota esta dirección?»
// por CUALQUIER correo, incluidos los de otros estudios y los de gente que no
// es clienta de nadie. Las direcciones se resuelven aquí, desde los `socios`
// del estudio de la sesión, y solo se devuelven las que ya estaban ahí.
//
// Se pide desde `cargarFichaClienta` (carga perezosa), nunca en el arranque del
// panel: el abanico de consultas del arranque ya se peleó una vez para bajar de
// 1452 ms a 69 ms y esto no tiene por qué volver a subirlo.
// ─────────────────────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const sesion = await verificarSesionStaff(req);
  if (!sesion) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: 'Servidor no configurado' }, { status: 503 });

  try {
    // Las borradas quedan fuera: su correo está anonimizado
    // (`borrado+<id>@anon.invalid`) y su ficha no se abre.
    const { data: socios } = await admin
      .from('socios')
      .select('email')
      .eq('studio_id', sesion.studioId)
      .is('borrado_en', null);

    const rotos = await rebotesDeEmails(admin, (socios ?? []).map((s) => s.email as string | null));

    // Un objeto plano y no un array de pares: quien lo pinta busca por
    // dirección, y así no tiene que construirse el índice en cada render.
    return NextResponse.json({ rebotes: Object.fromEntries(rotos) });
  } catch (err) {
    return errorInterno('clientas/rebotes', err);
  }
}
