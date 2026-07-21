import { NextRequest, NextResponse } from 'next/server';
import { verificarSesionStaff } from '@/lib/auth-server';
import { dbGetIntegracionConfig } from '@/lib/supabase-data';
import { probarKisi } from '@/lib/kisi';

// Botón "Probar conexión" de Kisi en Configuración → Integraciones: prueba la
// clave API que ESE ESTUDIO pegó y guardó — no hay secreto de plataforma.
export async function POST(req: NextRequest) {
  const sesion = await verificarSesionStaff(req);
  if (!sesion) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const intg = await dbGetIntegracionConfig(sesion.studioId, 'KISI');
  const apiKey = intg?.config.apiKey?.trim();
  if (!apiKey) return NextResponse.json({ ok: false, error: 'Falta la clave API de Kisi' }, { status: 400 });

  const r = await probarKisi({ apiKey });
  return NextResponse.json(r, { status: r.ok ? 200 : 400 });
}
