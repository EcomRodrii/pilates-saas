import { NextRequest, NextResponse } from 'next/server';
import { verificarInstructoraEnEstudio } from '@/lib/auth-instructora';
import { alumnasDeInstructora, fichaDeAlumna, guardarNotaDeSesion, saludDeAlumna } from '@/lib/portal-instructora/alumnas-servidor';
import { leerNotaDeSesion } from '@/lib/portal-instructora/nota-sesion';
import { enforceRateLimit, rateLimit } from '@/lib/rate-limit';
import { retryAfterSeconds, tooManyRequestsResponse } from '@/lib/rate-limit-core';
import { errorInterno } from '@/lib/errores-servidor';

// «Tus alumnas» desde la app del estudio: la lista de sus alumnas, la ficha
// mínima de una y su salud. Las reglas viven en
// `lib/portal-instructora/alumnas-servidor.ts`.
//
// Una sola escritura: `nota`, la nota de sesión (15-sep-2026). Es dato de salud:
// la misma regla de «su alumna» y consentimiento vigente que `salud`, y la nota
// sale siempre a nombre de la instructora del token.
//
// La instructora y el estudio salen del token + slug. `listar` no recibe ningún
// id; `ficha` y `salud` reciben el de la socia y responden igual (404) si no
// existe que si no es su alumna. `salud` apunta la lectura antes de devolver
// nada y, si no puede, falla.
export async function POST(req: NextRequest) {
  const limited = await enforceRateLimit(req, 'portal-instructora-alumnas', { max: 60, windowSeconds: 60 });
  if (limited) return limited;

  const body = await req.json().catch(() => null) as { slug?: string; accion?: unknown; socioId?: unknown; nota?: unknown } | null;
  if (!body?.slug) return NextResponse.json({ error: 'Falta el estudio' }, { status: 400 });
  const accion = body.accion;
  if (accion !== 'listar' && accion !== 'ficha' && accion !== 'salud' && accion !== 'nota') {
    return NextResponse.json({ error: 'Acción no válida' }, { status: 400 });
  }
  const socioId = typeof body.socioId === 'string' && body.socioId ? body.socioId : null;
  if (accion !== 'listar' && !socioId) return NextResponse.json({ error: 'Falta la alumna' }, { status: 400 });

  try {
    const sesion = await verificarInstructoraEnEstudio(req, body.slug);
    if (!sesion) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    const suya = { studioId: sesion.studioId, instructorId: sesion.instructorId };

    if (accion === 'listar') {
      return NextResponse.json({ alumnas: await alumnasDeInstructora(suya) });
    }

    if (accion === 'nota') {
      const lectura = leerNotaDeSesion(body.nota);
      if (!lectura.ok) return NextResponse.json({ error: lectura.error }, { status: 400 });
      // Tope propio por INSTRUCTORA: una nota por alumna y clase es lo normal.
      const porInstructora = { max: 30, windowSeconds: 600 };
      const limite = await rateLimit(`portal-instructora-nota:${sesion.instructorId}`, porInstructora);
      if (!limite.allowed) return tooManyRequestsResponse(retryAfterSeconds(limite.resetAt, porInstructora.windowSeconds));
      const r = await guardarNotaDeSesion({ ...suya, socioId: socioId as string, nota: lectura.nota });
      if (r === 'NO_ES_SUYA') return NextResponse.json({ error: 'No encontramos a esta alumna.' }, { status: 404 });
      if (r === 'SIN_CONSENTIMIENTO') {
        return NextResponse.json({ error: 'No ha dado su consentimiento para guardar datos de salud, así que no se puede guardar la nota.', code: 'SIN_CONSENTIMIENTO' }, { status: 409 });
      }
      if (r === 'CLASE_NO_VALIDA') {
        return NextResponse.json({ error: 'Esa clase ya no cuenta como una suya contigo. Elige otra o «Sin una clase concreta».', code: 'CLASE_NO_VALIDA' }, { status: 400 });
      }
      return NextResponse.json({ ok: true, nota: r }, { headers: { 'Cache-Control': 'no-store' } });
    }

    if (accion === 'salud') {
      // Cada apertura escribe en el registro de lecturas: tope propio por
      // INSTRUCTORA (no por IP) para que nadie lo llene de ruido.
      const porInstructora = { max: 20, windowSeconds: 60 };
      const limite = await rateLimit(`portal-instructora-salud:${sesion.instructorId}`, porInstructora);
      if (!limite.allowed) return tooManyRequestsResponse(retryAfterSeconds(limite.resetAt, porInstructora.windowSeconds));
      const salud = await saludDeAlumna({
        ...suya, socioId: socioId as string, lector: { userId: sesion.userId, nombre: sesion.nombre },
      });
      if (!salud) return NextResponse.json({ error: 'No encontramos a esta alumna.' }, { status: 404 });
      return NextResponse.json(salud, { headers: { 'Cache-Control': 'no-store' } });
    }

    const ficha = await fichaDeAlumna({ ...suya, socioId: socioId as string });
    if (!ficha) return NextResponse.json({ error: 'No encontramos a esta alumna.' }, { status: 404 });
    return NextResponse.json(ficha);
  } catch (err) {
    if (accion === 'nota') {
      return errorInterno('portal/instructora/alumnas:nota', err, 'No hemos podido guardar la nota. Vuelve a intentarlo.');
    }
    return accion === 'salud'
      ? errorInterno('portal/instructora/alumnas:salud', err, 'No hemos podido abrir sus avisos de salud. Vuelve a intentarlo.')
      : errorInterno('portal/instructora/alumnas:POST', err, 'No hemos podido cargar tus alumnas. Vuelve a intentarlo.');
  }
}
