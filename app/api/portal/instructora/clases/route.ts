import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { verificarInstructoraEnEstudio } from '@/lib/auth-instructora';
import {
  cambiarFinClase, confirmarClases, empezarClase, estadoClasesInstructora, MAX_CONFIRMAR, type ItemConfirmar,
} from '@/lib/fichaje/clases-impartidas';
import { crearClasePropia, opcionesNuevaClase } from '@/lib/portal-instructora/crear-clase-servidor';
import { enforceRateLimit, rateLimit } from '@/lib/rate-limit';
import { retryAfterSeconds, tooManyRequestsResponse } from '@/lib/rate-limit-core';
import { errorInterno } from '@/lib/errores-servidor';

// Clases impartidas desde la app del estudio: su clase de ahora y las olvidadas
// (estado), empezar una clase, «terminé antes» y confirmar las olvidadas. Y
// «Nueva clase»: las opciones (tipos y salas, si el estudio le deja crear) y
// crearla — sus reglas viven en `lib/portal-instructora/crear-clase-servidor.ts`,
// que repite a mano lo que exige la RLS porque esta ruta va con service-role.
//
// La instructora y el estudio salen del token + slug; del body solo la clase y la
// acción. Una clase ajena responde igual que una que no existe.
//
// ⚠️ `ACCIONES` es el contrato con `lib/student/datos-instructora.ts`: quitar un
// valor de aquí no rompe el build, rompe una pantalla en producción en silencio.
// Pasó con 'opciones'/'crear' (#2183 las borró sin tocar el cliente, y el e2e
// seguía en verde porque mockea la ruta). `lib/portal-instructora-acciones.test.ts`
// cruza las dos listas para que no vuelva a pasar.
const LIMITE = { max: 40, windowSeconds: 60 };
// ⚠️ SIN `export`: un `route.ts` de App Router solo puede exportar métodos HTTP
// y la config de segmento. Next genera un fichero de guarda de tipos por ruta y
// cualquier otro export falla el BUILD («is not assignable to type never»), pero
// NO el `tsc --noEmit` de este repo, porque `.next/types` solo existe tras
// construir. El test que cruza esta lista con el cliente la lee del fichero, no
// la importa.
const ACCIONES = ['estado', 'empezar', 'terminar', 'confirmar', 'opciones', 'crear'] as const;

export async function POST(req: NextRequest) {
  const porIp = await enforceRateLimit(req, 'portal-instructora-clases-ip', { max: 80, windowSeconds: 60 });
  if (porIp) return porIp;

  const body = await req.json().catch(() => null) as
    {
      slug?: string; accion?: unknown; sesionId?: unknown; fin?: unknown; items?: unknown;
      tipoClaseId?: unknown; salaId?: unknown; fecha?: unknown; hora?: unknown;
    } | null;
  if (!body?.slug) return NextResponse.json({ error: 'Falta el estudio' }, { status: 400 });
  const accion = ACCIONES.find((a) => a === body.accion);
  if (!accion) return NextResponse.json({ error: 'Acción no válida' }, { status: 400 });
  const sesionId = typeof body.sesionId === 'string' ? body.sesionId : null;
  if ((accion === 'empezar' || accion === 'terminar') && !sesionId) {
    return NextResponse.json({ error: 'Falta la clase' }, { status: 400 });
  }

  const texto = (v: unknown) => (typeof v === 'string' && v ? v : null);
  const datosClase = {
    tipoClaseId: texto(body.tipoClaseId), salaId: texto(body.salaId),
    fecha: texto(body.fecha), hora: texto(body.hora),
  };
  if (accion === 'crear'
    && (!datosClase.tipoClaseId || !datosClase.salaId || !datosClase.fecha || !datosClase.hora)) {
    return NextResponse.json({ error: 'Faltan datos de la clase' }, { status: 400 });
  }

  try {
    const sesion = await verificarInstructoraEnEstudio(req, body.slug);
    if (!sesion) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    const limite = await rateLimit(`portal-instructora-clases:${sesion.instructorId}`, LIMITE);
    if (!limite.allowed) return tooManyRequestsResponse(retryAfterSeconds(limite.resetAt, LIMITE.windowSeconds));
    if (accion === 'opciones') {
      return NextResponse.json(await opcionesNuevaClase({ studioId: sesion.studioId }));
    }
    if (accion === 'crear') {
      // Crear es lo que escribe: límite propio y más bajo, DESPUÉS de
      // autenticar. Antes este cubo (10/60 por IP) se aplicaba sobre el body sin
      // sesión, así que un anónimo podía agotarlo para una IP compartida —el
      // wifi del estudio— y dejar sin crear clases a todas sus instructoras.
      const limitadoCrearIp = await enforceRateLimit(req, 'portal-instructora-clases-crear', { max: 10, windowSeconds: 60 });
      if (limitadoCrearIp) return limitadoCrearIp;
      // Y por INSTRUCTORA, no por IP (`enforceRateLimit` mete la IP en la clave):
      // con datos móviles y wifi el límite de arriba se multiplica. Un tope por
      // hora que ninguna planificación real alcanza.
      const porInstructora = { max: 30, windowSeconds: 3600 };
      const limiteCrear = await rateLimit(`portal-instructora-clases-crear:${sesion.instructorId}`, porInstructora);
      if (!limiteCrear.allowed) return tooManyRequestsResponse(retryAfterSeconds(limiteCrear.resetAt, porInstructora.windowSeconds));
      const r = await crearClasePropia({
        studioId: sesion.studioId,
        instructorId: sesion.instructorId,
        tipoClaseId: datosClase.tipoClaseId as string,
        salaId: datosClase.salaId as string,
        fecha: datosClase.fecha as string,
        hora: datosClase.hora as string,
      });
      if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status });
      return NextResponse.json({ ok: true, sesionId: r.sesionId, inicio: r.inicio });
    }

    const admin = getSupabaseAdmin();
    if (!admin) return NextResponse.json({ error: 'Servidor no configurado' }, { status: 503 });
    const ctx = { studioId: sesion.studioId, instructorId: sesion.instructorId, userId: sesion.userId };

    if (accion === 'empezar') {
      const r = await empezarClase(admin, ctx, sesionId!);
      if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status });
      return NextResponse.json({ ok: true, yaEmpezada: r.yaEmpezada, jornadaAbierta: r.jornadaAbierta, estado: await estadoClasesInstructora(admin, ctx) });
    }
    if (accion === 'terminar') {
      const fin = typeof body.fin === 'string' ? new Date(body.fin) : new Date(NaN);
      const r = await cambiarFinClase(admin, ctx, sesionId!, fin);
      if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status });
      return NextResponse.json({ ok: true, estado: await estadoClasesInstructora(admin, ctx) });
    }
    if (accion === 'confirmar') {
      if (!Array.isArray(body.items) || body.items.length === 0 || body.items.length > MAX_CONFIRMAR) {
        return NextResponse.json({ error: 'Petición no válida' }, { status: 400 });
      }
      const items: ItemConfirmar[] = [];
      for (const raw of body.items as unknown[]) {
        const it = raw as { sesionId?: unknown; modo?: unknown; inicio?: unknown; fin?: unknown };
        if (typeof it?.sesionId !== 'string' || (it.modo !== 'A_SU_HORA' && it.modo !== 'OTRO_HORARIO' && it.modo !== 'NO_DADA')) {
          return NextResponse.json({ error: 'Petición no válida' }, { status: 400 });
        }
        items.push({
          sesionId: it.sesionId, modo: it.modo,
          inicio: typeof it.inicio === 'string' ? new Date(it.inicio) : undefined,
          fin: typeof it.fin === 'string' ? new Date(it.fin) : undefined,
        });
      }
      const r = await confirmarClases(admin, ctx, items);
      if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status });
      return NextResponse.json({ ok: true, confirmadas: r.confirmadas, errores: r.errores, estado: await estadoClasesInstructora(admin, ctx) });
    }
    return NextResponse.json({ estado: await estadoClasesInstructora(admin, ctx) });
  } catch (err) {
    return errorInterno(
      `portal/instructora/clases:${accion}`, err,
      accion === 'crear' ? 'No hemos podido crear la clase. Vuelve a intentarlo.'
        : accion === 'opciones' ? 'No hemos podido cargar los tipos de clase y las salas.'
          : 'No hemos podido guardarlo. Inténtalo de nuevo.',
    );
  }
}
