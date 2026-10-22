import { NextRequest, NextResponse, after } from 'next/server';
import * as Sentry from '@sentry/nextjs';
import { verificarSesionStaff } from '@/lib/auth-server';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { enforceRateLimit } from '@/lib/rate-limit';
import { LEGAL } from '@/lib/legal-info';
import { interruptoresDe } from '@/lib/estudio/interruptores';
import { estudioNacioConAltaNueva } from '@/lib/alta/bienvenida-nueva-servidor';
import {
  claveRecibirReservas, cuandoCorto, decidirCorreoRecibirReservas, errorDePublicar, leerFormPrimeraClase,
  planificarPrimeraClase, primerError,
} from '@/lib/alta/primera-clase';
import { apuntarPaso } from '@/lib/alta/embudo-servidor';
import { puedeReservarEnServidor } from '@/lib/onboarding/puede-reservar-servidor';
import type { ResultadoPuedeReservar } from '@/lib/onboarding/puede-reservar';
import { correoRecibirReservas } from '@/lib/emails/tentare/alta';
import { rutaApp, rutaQrApp, urlAbsoluta } from '@/lib/enlaces-estudio';
import { enviarCorreoAlta } from '@/lib/emails/embudo-alta-server';

// ─────────────────────────────────────────────────────────────────────────────
// «Publicar mi primera clase», el paso 6 del alta nueva (PR-4). Tras
// `ALTA_NUEVA`, o para el estudio que nació de ella, como la bienvenida nueva.
//
//   1. Vuelve a planificar desde el FORMULARIO (`planificarPrimeraClase`): el
//      plan no se acepta hecho del navegador.
//   2. Crea todo o nada con la RPC `alta_primera_clase` (migración
//      20261021134000): tipo, sala, ficha, serie, clases y tarifa activa. Un
//      solape (23P01) o una fecha pasada deshacen todo y se dice qué pasó.
//   3. Pregunta, con el MISMO motor que el gate de la reserva
//      (`puedeReservarEnServidor`), si una alumna nueva ya puede reservar. Solo
//      ese «sí» es el hito 1 del embudo (`clase_reservable`) y solo con él sale,
//      una vez, el correo «Ya puedes recibir reservas» con el enlace y el QR.
//
// Quién y con qué:
//   · Solo la PROPIETARIA. Escribe con service-role, así que esta comprobación
//     es la cerradura de este camino, no un adorno de la pantalla.
//   · El estudio sale SIEMPRE de la sesión, nunca del cuerpo.
//   · «Yo» es la cuenta de la sesión: su nombre sale de `auth.users`
//     (`user_metadata.nombre`, lo guarda «Tu estudio»), nunca del cuerpo.
//   · Idempotente por `intentoId` (lo pone la pantalla, uno por formulario):
//     reintentar la misma petición no crea nada dos veces.
// ─────────────────────────────────────────────────────────────────────────────

const INTENTO = /^[A-Za-z0-9-]{8,64}$/;

export async function POST(req: NextRequest) {
  const sesion = await verificarSesionStaff(req);
  if (!sesion) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  if (sesion.rol !== 'PROPIETARIO') {
    return NextResponse.json({ error: 'Solo la propietaria puede publicar la primera clase desde aquí.' }, { status: 403 });
  }

  const limitado = await enforceRateLimit(req, 'alta-primera-clase', { max: 12, windowSeconds: 600 }, sesion.studioId);
  if (limitado) return limitado;

  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: 'Servidor no configurado' }, { status: 503 });
  const studioId = sesion.studioId;

  // Detrás del interruptor, como la pantalla que la llama.
  const encendida = interruptoresDe(studioId, process.env).altaNueva || await estudioNacioConAltaNueva(admin, studioId);
  if (!encendida) return NextResponse.json({ error: 'No disponible' }, { status: 404 });

  const cuerpo = await req.json().catch(() => null) as { intentoId?: unknown; form?: unknown } | null;
  const intentoId = typeof cuerpo?.intentoId === 'string' && INTENTO.test(cuerpo.intentoId) ? cuerpo.intentoId : null;
  const form = leerFormPrimeraClase(cuerpo?.form);
  if (!intentoId || !form) return NextResponse.json({ error: 'Faltan datos de la clase. Recarga la página y vuelve a intentarlo.' }, { status: 400 });

  const ahora = new Date();
  const planificado = planificarPrimeraClase(form, ahora);
  if (!planificado.ok) {
    const campo = primerError(planificado.errores)!;
    return NextResponse.json({ error: planificado.errores[campo], campo }, { status: 400 });
  }
  const plan = planificado.plan;

  // «Yo»: la cuenta de la sesión. Si ya tiene ficha en el estudio, la RPC usa
  // esa y el nombre ni se mira.
  let instructor: Record<string, unknown> = plan.instructor;
  if (plan.instructor.propia) {
    const { data, error } = await admin.auth.admin.getUserById(sesion.userId);
    if (error) {
      console.error('[alta:primera-clase:cuenta]', error.message);
      return NextResponse.json({ error: 'No hemos podido leer tu cuenta. Vuelve a intentarlo en un momento.' }, { status: 500 });
    }
    const nombre = typeof data.user?.user_metadata?.nombre === 'string' ? data.user.user_metadata.nombre.trim() : '';
    instructor = { propia: true, auth_user_id: sesion.userId, nombre, email: data.user?.email ?? sesion.email ?? null };
  }

  const { data: creada, error } = await admin.rpc('alta_primera_clase', {
    p_studio_id: studioId,
    p_plan: { ...plan, intento: intentoId, instructor },
  });
  if (error) {
    const r = errorDePublicar(error);
    if (r.status >= 500) {
      console.error('[alta:primera-clase:rpc]', error.code, error.message);
      Sentry.captureMessage('[alta] no se pudo publicar la primera clase', { level: 'error', tags: { area: 'alta', codigo: error.code ?? 'sin_codigo' } });
    }
    return NextResponse.json({ error: r.error, ...(r.campo ? { campo: r.campo } : {}) }, { status: r.status });
  }
  const resultado = (creada ?? {}) as { sesiones?: number; repetida?: boolean };

  // ¿Una alumna nueva ya puede reservar? El mismo motor que el gate. Si no se
  // puede ni preguntar, la clase está creada igual: se dice «sin comprobar»,
  // que nunca promete nada.
  const [veredicto, estudio, enviado] = await Promise.all([
    puedeReservarEnServidor(admin, studioId, ahora).catch((e: unknown): ResultadoPuedeReservar | { estado: 'SIN_COMPROBAR' } => {
      console.error('[alta:primera-clase:puede-reservar]', e instanceof Error ? e.message : e);
      return { estado: 'SIN_COMPROBAR' };
    }),
    admin.from('studios').select('nombre, slug, creado_en').eq('id', studioId).maybeSingle(),
    admin.from('embudo_alta').select('paso').eq('studio_id', studioId).eq('paso', 'correo_recibir_reservas').limit(1),
  ]);

  const claseNombre = form.nombre.trim();
  const cuando = cuandoCorto(form);
  const fila = estudio.data;
  const decision = decidirCorreoRecibirReservas({
    veredicto: veredicto.estado,
    // Sin poder leer si ya salió, no se arriesga a mandarlo dos veces.
    yaEnviado: !!enviado.error || (enviado.data ?? []).length > 0,
    creadoEn: (fila?.creado_en as string | null | undefined) ?? null,
    email: sesion.email,
    slug: (fila?.slug as string | null | undefined) ?? null,
    ahora,
  });

  if (veredicto.estado === 'SI') {
    after(async () => {
      // El hito 1 del embudo: un hecho del ESTUDIO, solo con el «sí» del servidor.
      await apuntarPaso(admin, studioId, 'clase_reservable', { creadoEn: (fila?.creado_en as string | null | undefined) ?? undefined });
      if (!decision.enviar) return;
      const base = process.env.NEXT_PUBLIC_APP_URL || LEGAL.url;
      const slug = String(fila!.slug);
      // La APP de sus alumnas y su QR, no la página de reservas (esa es para su web).
      const correo = correoRecibirReservas({
        estudioNombre: String(fila?.nombre ?? ''),
        claseNombre,
        cuando,
        urlApp: urlAbsoluta(base, rutaApp(slug)),
        urlQr: urlAbsoluta(base, rutaQrApp(slug)),
      });
      const res = await enviarCorreoAlta({
        to: sesion.email!, asunto: correo.asunto, html: correo.html, idempotencyKey: claveRecibirReservas(studioId),
      });
      if (res.ok) {
        await apuntarPaso(admin, studioId, 'correo_recibir_reservas', { creadoEn: fila!.creado_en as string });
      } else if (!res.skipped && !res.permanente) {
        Sentry.captureMessage('[alta] no salió «Ya puedes recibir reservas»', { level: 'warning', tags: { area: 'alta', error: res.error } });
      }
    });
  }

  return NextResponse.json({
    ok: true,
    clase: { nombre: claseNombre, cuando },
    sesiones: resultado.sesiones ?? plan.sesiones.length,
    repetida: resultado.repetida === true,
    veredicto,
    correo: decision.enviar,
  });
}
