import { NextRequest, NextResponse } from 'next/server';
import * as Sentry from '@sentry/nextjs';
import { verificarInstructoraEnEstudio } from '@/lib/auth-instructora';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { enforceRateLimit } from '@/lib/rate-limit';
import { errorInterno } from '@/lib/errores-servidor';
import { marcarAsistencia } from '@/lib/portal-instructora/lista-servidor';
import { marcarDadaPorLista } from '@/lib/fichaje/clases-impartidas';
import { decidirEscaneo, escanearQr, type AccionAcceso, type Actor, type Marcadores } from '@/lib/acceso/escanear-servidor';

// Escanear el QR de una alumna desde «Pasar lista», en la app del estudio.
//
//   { slug, sesionId, accion: 'escanear', lectura }          → el resultado
//   { slug, sesionId, accion: 'decidir', escaneoId, decision } → tras un 🟠
//
// Mismo núcleo que el panel (`lib/acceso/escanear-servidor.ts`), con lo que es
// de la instructora: solo SU clase (la del body, comprobada contra su ficha),
// nombre corto y ningún dato de dinero, sin foto, sin aprobar reservas y sin
// abrir la puerta del estudio. Marcar la asistencia es el mismo «Asistió» de su
// lista (`marcarAsistencia`, que ya la limita a sus clases y a la ventana de la
// lista) y, como en la lista, da la clase por dada.
//
// La instructora y el estudio salen del token + slug; del body solo la clase,
// lo leído y la decisión.
const DECISIONES: readonly AccionAcceso[] = ['DEJAR_PASAR', 'NO_PERMITIR'];

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null) as
    { slug?: unknown; sesionId?: unknown; accion?: unknown; lectura?: unknown; escaneoId?: unknown; decision?: unknown } | null;
  const slug = typeof body?.slug === 'string' ? body.slug : null;
  if (!slug) return NextResponse.json({ error: 'Falta el estudio' }, { status: 400 });
  const sesionId = typeof body?.sesionId === 'string' && body.sesionId ? body.sesionId : null;
  if (!sesionId) return NextResponse.json({ error: 'Falta la clase' }, { status: 400 });
  if (body?.accion !== 'escanear' && body?.accion !== 'decidir') {
    return NextResponse.json({ error: 'Acción no válida' }, { status: 400 });
  }

  try {
    const sesion = await verificarInstructoraEnEstudio(req, slug);
    if (!sesion) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    const limited = await enforceRateLimit(req, 'portal-instructora-escanear', { max: 60, windowSeconds: 60 }, sesion.userId);
    if (limited) return limited;

    const admin = getSupabaseAdmin();
    if (!admin) return errorInterno('portal/instructora/escanear', new Error('sin service-role'), 'No hemos podido leer el QR.');

    const actor: Actor = {
      uid: sesion.userId, rol: 'INSTRUCTOR', studioId: sesion.studioId, origen: 'APP_INSTRUCTORA',
      instructorId: sesion.instructorId, puedeAprobar: false,
    };
    const clase = { studioId: sesion.studioId, instructorId: sesion.instructorId, sesionId };
    const marcadores: Marcadores = {
      async marcar(reservaId) {
        const r = await marcarAsistencia({ ...clase, reservaId, accion: 'asistio' });
        if (!r.ok) return { ok: false, error: r.error };
        // Como en la lista: pasar lista también dice que la clase se dio. Si
        // falla, la asistencia de la alumna ya está guardada.
        if (r.clase) {
          await marcarDadaPorLista(admin, { ...clase, userId: sesion.userId }, r.clase).catch((err) => {
            Sentry.captureException(err, { tags: { area: 'clases-impartidas', origen: 'escaner-qr' } });
          });
        }
        return { ok: true };
      },
    };

    if (body.accion === 'escanear') {
      const lectura = typeof body.lectura === 'string' ? body.lectura.slice(0, 200) : '';
      if (!lectura) return NextResponse.json({ error: 'Falta el QR' }, { status: 400 });
      const r = await escanearQr(admin, actor, marcadores, { lectura, sesionId });
      if ('error' in r) return NextResponse.json({ error: r.error }, { status: r.status });
      return NextResponse.json(r);
    }

    const escaneoId = typeof body.escaneoId === 'number' && Number.isSafeInteger(body.escaneoId) ? body.escaneoId : null;
    const decision = DECISIONES.find(d => d === body.decision) ?? null;
    if (!escaneoId || !decision) return NextResponse.json({ error: 'Faltan datos' }, { status: 400 });
    const r = await decidirEscaneo(admin, actor, marcadores, { escaneoId, decision });
    if ('error' in r) return NextResponse.json({ error: r.error }, { status: r.status });
    return NextResponse.json(r);
  } catch (err) {
    return errorInterno('portal/instructora/escanear:POST', err, 'No hemos podido leer el QR.');
  }
}
