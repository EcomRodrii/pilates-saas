import { NextRequest, NextResponse } from 'next/server';
import { verificarSesionStaff } from '@/lib/auth-server';
import { puedeGestionarClientas } from '@/lib/permisos-reglas';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { enforceRateLimit } from '@/lib/rate-limit';
import { errorInterno } from '@/lib/errores-servidor';
import { normalizarFirma } from '@/lib/datos-salud/consentimiento';
import {
  registrarAceptacionContrato, textoContratoVigente, evidenciaDePeticion,
} from '@/lib/db/aceptacion-contrato-admin';

// Sella EN SERVIDOR la aceptación del contrato recogida en mostrador (plan RGPD
// 3.17). El alta de clienta del panel escribe la ficha con la sesión del
// navegador; justo después llama aquí y el servidor fija la fecha (`now()`), el
// texto (compuesto con los datos del estudio de la base), quién la introdujo
// (de la sesión), y apunta el evento con huella de IP y user-agent.
//
// Del cliente solo vienen la firma tecleada y el texto que tenía en pantalla,
// que NO se guarda: solo se anota si coincidía con el del servidor.
//
// Permiso: el mismo que crear clientas (`puedeGestionarClientas`), en servidor.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const sesion = await verificarSesionStaff(req);
  if (!sesion) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  if (!puedeGestionarClientas(sesion.rol)) {
    return NextResponse.json({ error: 'No tienes permiso para registrar el contrato de una clienta.' }, { status: 403 });
  }
  const limited = await enforceRateLimit(req, 'socios-aceptacion-contrato', { max: 30, windowSeconds: 60 }, sesion.studioId);
  if (limited) return limited;

  const { id: socioId } = await params;
  const body = (await req.json().catch(() => null)) as { firma?: unknown; versionTexto?: unknown } | null;
  const firma = normalizarFirma(body?.firma);
  if (!firma) return NextResponse.json({ error: 'Escribe el nombre completo de quien firma.' }, { status: 400 });

  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: 'Servidor no configurado' }, { status: 500 });

  try {
    const texto = await textoContratoVigente(admin, sesion.studioId);
    if (!texto) return NextResponse.json({ error: 'No se han podido cargar las condiciones del estudio.' }, { status: 500 });

    const r = await registrarAceptacionContrato(admin, {
      studioId: sesion.studioId,
      socioId,
      origen: 'MOSTRADOR',
      firma,
      texto,
      textoCliente: body?.versionTexto,
      // Mismo criterio que `actorNombre` del panel: la propietaria no tiene
      // nombre propio en la sesión (`sesion.nombre` es el del estudio).
      introducidaPor: sesion.rol === 'PROPIETARIO' ? 'Propietaria' : (sesion.nombre || 'el estudio'),
      actorUid: sesion.userId,
      actorRol: sesion.rol,
      evidencia: evidenciaDePeticion(req),
    });
    if (!r.ok) {
      if (r.causa) return errorInterno('socios/aceptacion-contrato:POST', r.causa, r.error);
      return NextResponse.json({ error: r.error }, { status: r.status });
    }
    return NextResponse.json({ ok: true, cambiado: r.cambiado });
  } catch (e) {
    return errorInterno('socios/aceptacion-contrato:POST', e, 'No hemos podido registrar la aceptación de las condiciones.');
  }
}
