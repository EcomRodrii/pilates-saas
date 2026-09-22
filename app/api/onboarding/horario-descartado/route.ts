import { NextRequest, NextResponse } from 'next/server';
import { verificarSesionStaff } from '@/lib/auth-server';
import { capturar } from '@/lib/analytics';

// Único propósito: registrar `horario_propuesto_descartado` (lib/analytics-eventos.ts).
// Descartar la propuesta de PropuestaHorario no escribe nada — "Lo monto yo"
// solo cambiaba estado local — así que sin esta ruta el evento, aunque ya
// declarado en el tipo, nunca salía. Sin ella, "no lo creó" y "ni lo vio" se
// confunden en la misma cifra (ver comentario del propio tipo de evento).
export async function POST(req: NextRequest) {
  const sesion = await verificarSesionStaff(req);
  if (!sesion) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  capturar(sesion.studioId, { nombre: 'horario_propuesto_descartado', props: {} });
  return NextResponse.json({ ok: true });
}
