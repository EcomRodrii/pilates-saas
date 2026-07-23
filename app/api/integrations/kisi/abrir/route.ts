import { NextRequest, NextResponse } from 'next/server';
import { verificarSesionStaff } from '@/lib/auth-server';
import { dbGetIntegracionConfig } from '@/lib/supabase-data';
import { enforceRateLimit } from '@/lib/rate-limit';
import { abrirPuertaKisi, listarCerradurasKisi } from '@/lib/kisi';

// Abre la puerta del estudio vía Kisi al hacer CHECK-IN desde el panel.
// abrirPuertaKisi existía desde el día uno pero ningún flujo la llamaba — la
// integración se podía conectar y probar, pero jamás abría nada. La llama el
// check-in de recepción (studio-context.checkin, fire-and-forget) con la clave
// del propio estudio.
//
// Cerradura: si el estudio configuró un lockId se usa ese; si no, se resuelve
// contra la API — con una sola cerradura en la cuenta se abre esa, con varias
// se pide configurar cuál (abrir "la primera" de varias puertas sería abrir
// una puerta cualquiera).
export async function POST(req: NextRequest) {
  const limited = await enforceRateLimit(req, 'kisi-abrir', { max: 30, windowSeconds: 60 });
  if (limited) return limited;

  const sesion = await verificarSesionStaff(req);
  if (!sesion) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const intg = await dbGetIntegracionConfig(sesion.studioId, 'KISI');
  const apiKey = intg?.config.apiKey?.trim();
  if (!apiKey) return NextResponse.json({ ok: false, error: 'Kisi no está configurado' }, { status: 400 });

  let lockId = intg?.config.lockId?.trim();
  if (!lockId) {
    const r = await listarCerradurasKisi({ apiKey });
    if (!r.ok) return NextResponse.json(r, { status: 502 });
    if (r.locks.length === 0) {
      return NextResponse.json({ ok: false, error: 'Tu cuenta de Kisi no tiene ninguna cerradura' }, { status: 400 });
    }
    if (r.locks.length > 1) {
      return NextResponse.json(
        { ok: false, error: 'Tienes varias cerraduras en Kisi: indica el ID de la puerta del estudio en Configuración → Integraciones → Kisi' },
        { status: 400 },
      );
    }
    lockId = String(r.locks[0].id);
  }

  const r = await abrirPuertaKisi({ apiKey }, lockId);
  return NextResponse.json(r, { status: r.ok ? 200 : 502 });
}
