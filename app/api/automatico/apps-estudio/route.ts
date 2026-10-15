import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { secretoValido } from '@/lib/salud/secreto';
import { errorInterno } from '@/lib/errores-servidor';
import { esEstadoApp } from '@/lib/app-nativa/pedir-app';
import { pagaLaApp } from '@/lib/app-nativa/apps-sin-plan';
import { columnasDeCambio, leerCambio } from '@/lib/interno/apps-estudio';
import { avisarEquipoApps } from '@/lib/app-nativa/avisar-equipo';
import type { AppParaTramitar } from '@/lib/nativo/automatico';
import { hoyEnEstudio } from '@/lib/utils';

export const dynamic = 'force-dynamic';

// La tramitación automática de las apps de estudio (workflow «Apps de estudio · automático»,
// scripts/apps-automatico.mjs). GET: qué apps hay que tramitar y cuántos huecos quedan. POST: un
// cambio que ya ha pasado en Apple (nombre puesto, compilación procesada, revisión, publicada…).
//
// Autenticada con `APPS_AUTOMATICO_SECRET` (el mismo en Vercel y en los secretos de GitHub), en
// tiempo constante (`secretoValido`). Sin el secreto, 503: no hay automatización a medias.
//
// Las MISMAS reglas que /interno (`leerCambio`: transiciones reales, Publicada con enlace y activa…):
// la automatización no puede hacer nada que no pudiera hacer una persona. Cada cambio queda en la
// auditoría de /interno, a nombre de «Automático».

const ACTOR = 'Automático (GitHub Actions)';

function autorizado(req: NextRequest): NextResponse | null {
  const secreto = process.env.APPS_AUTOMATICO_SECRET;
  if (!secreto) return NextResponse.json({ error: 'APPS_AUTOMATICO_SECRET no configurado' }, { status: 503 });
  if (!secretoValido(req.headers.get('authorization'), secreto)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  return null;
}

type Fila = {
  studio_id: string; bundle_id: string; nombre_app: string; activa: boolean; estado: string; url_tienda: string | null;
  nota_interna: string | null; studios: { nombre: string | null; slug: string | null; plan: string | null; subscription_status: string | null } | null;
};

export async function GET(req: NextRequest) {
  const no = autorizado(req);
  if (no) return no;
  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: 'Servidor no configurado' }, { status: 503 });
  try {
    const [apps, cupos] = await Promise.all([
      admin.from('apps_estudio').select('studio_id, bundle_id, nombre_app, activa, estado, url_tienda, nota_interna, studios!inner(nombre, slug, plan, subscription_status)'),
      admin.from('apps_estudio_cupos').select('bundle_id, asc_app_id, studio_id'),
    ]);
    if (apps.error) throw apps.error;
    if (cupos.error) throw cupos.error;
    const lote = (cupos.data ?? []) as { bundle_id: string; asc_app_id: string; studio_id: string | null }[];
    const ascDe = new Map(lote.map((c) => [c.bundle_id, c.asc_app_id]));
    const lista: (AppParaTramitar & { estudio: string; notaInterna: string | null })[] = ((apps.data ?? []) as unknown as Fila[])
      .filter((f) => esEstadoApp(f.estado))
      .map((f) => ({
        studioId: f.studio_id,
        estudio: f.studios?.nombre ?? f.studios?.slug ?? f.studio_id,
        slug: f.studios?.slug ?? null,
        bundleId: f.bundle_id,
        ascAppId: ascDe.get(f.bundle_id) ?? null,
        nombreApp: f.nombre_app,
        estado: f.estado as AppParaTramitar['estado'],
        activa: f.activa,
        urlTienda: f.url_tienda,
        pagada: pagaLaApp({ plan: f.studios?.plan ?? null, estado: f.studios?.subscription_status ?? null }),
        notaInterna: f.nota_interna,
      }));
    return NextResponse.json({ apps: lista, cuposLibres: lote.filter((c) => !c.studio_id).length }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (err) {
    return errorInterno('automatico/apps-estudio:GET', err);
  }
}

/** Lo que se le cuenta al equipo por correo de cada cosa que pasa sola (las que piden atención). */
const AVISOS: Record<string, (estudio: string, detalle: string) => { asunto: string; texto: string } | null> = {
  preparada: (e) => ({ asunto: `App de ${e}: en preparación`, texto: 'Nombre puesto en App Store Connect y app activada. Se compila y se sube sola a TestFlight.' }),
  probando: (e) => ({ asunto: `App de ${e}: lista en TestFlight`, texto: 'Apple ha procesado la compilación. Pruébala en TestFlight y, cuando esté bien, envíala a revisión desde App Store Connect (eso no lo hace nadie solo).' }),
  'en-revision': () => null,
  publicada: (e) => ({ asunto: `App de ${e}: PUBLICADA`, texto: 'Apple la ha publicado. El estudio ya ve el enlace y su QR, y sus alumnas el aviso de Safari.' }),
  rechazada: (e, d) => ({ asunto: `App de ${e}: Apple la ha rechazado`, texto: `Vuelve a «En pruebas». Mira el motivo en App Store Connect.${d ? ` ${d}` : ''}` }),
  'nombre-cogido': (e, d) => ({ asunto: `App de ${e}: el nombre ya está cogido`, texto: `Apple no deja ponerle ese nombre. Cámbialo en /interno → Apps de estudio y la automatización lo vuelve a intentar.${d ? ` (${d})` : ''}` }),
  fallo: (e, d) => ({ asunto: `App de ${e}: la automatización ha fallado`, texto: `Se reintenta en la siguiente pasada. ${d}` }),
};

export async function POST(req: NextRequest) {
  const no = autorizado(req);
  if (no) return no;
  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: 'Servidor no configurado' }, { status: 503 });

  const cuerpo = (await req.json().catch(() => null)) as { studioId?: unknown; cambio?: unknown; evento?: unknown; detalle?: unknown } | null;
  const studioId = typeof cuerpo?.studioId === 'string' ? cuerpo.studioId : '';
  const evento = typeof cuerpo?.evento === 'string' && cuerpo.evento in AVISOS ? cuerpo.evento : null;
  const detalle = typeof cuerpo?.detalle === 'string' ? cuerpo.detalle.slice(0, 500) : '';
  if (!studioId) return NextResponse.json({ error: 'Falta el estudio.' }, { status: 400 });

  try {
    const { data: antes, error: errAntes } = await admin.from('apps_estudio')
      .select('studio_id, bundle_id, nombre_app, activa, estado, url_tienda, nota_interna, studios!inner(nombre, slug)').eq('studio_id', studioId).maybeSingle();
    if (errAntes) throw errAntes;
    if (!antes) return NextResponse.json({ error: 'Ese estudio no ha pedido la app.' }, { status: 404 });
    if (!esEstadoApp(antes.estado)) return NextResponse.json({ error: 'La app tiene un estado desconocido.' }, { status: 500 });
    const estudios = (antes as unknown as { studios: { nombre: string | null; slug: string | null } | null }).studios;
    const nombreEstudio = estudios?.nombre ?? estudios?.slug ?? studioId;

    let columnas: Record<string, unknown> = {};
    if (cuerpo?.cambio && typeof cuerpo.cambio === 'object') {
      const v = leerCambio({ ...(cuerpo.cambio as object), studioId }, {
        estado: antes.estado, activa: antes.activa === true, urlTienda: (antes.url_tienda as string | null) ?? null,
      });
      if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 });
      columnas = columnasDeCambio(v.cambio);
    }
    // Lo que no es un cambio de estado se apunta en la nota interna (con fecha), para que se vea en /interno.
    if (evento && evento !== 'preparada' && evento !== 'probando' && evento !== 'en-revision') {
      // El día de Madrid (el mismo que mira el script para no avisar dos veces de lo mismo en un día).
      const linea = `${hoyEnEstudio()} · automático: ${evento}${detalle ? ` — ${detalle}` : ''}`;
      columnas.nota_interna = `${(antes.nota_interna as string | null) ?? ''}\n${linea}`.trim().slice(-2000);
    }
    if (Object.keys(columnas).length > 0) {
      // Compare-and-set sobre el estado leído: si alguien lo cambió desde /interno entretanto, gana él.
      const { data: hecho, error } = await admin.from('apps_estudio').update(columnas)
        .eq('studio_id', studioId).eq('estado', antes.estado).select('studio_id');
      if (error) throw error;
      if (!hecho?.length) return NextResponse.json({ error: 'La app ha cambiado mientras tanto; se reintenta en la siguiente pasada.' }, { status: 409 });
      const { error: errAud } = await admin.from('plataforma_auditoria').insert({
        actor_auth_user_id: null, actor_nombre: ACTOR, accion: 'apps-estudio.automatico',
        objetivo_tipo: 'studio', objetivo_id: studioId,
        resumen: `App ${antes.bundle_id as string}: ${evento ?? Object.keys(columnas).join(', ')}`,
        antes: { estado: antes.estado, activa: antes.activa, urlTienda: antes.url_tienda }, despues: columnas,
        ip: null, user_agent: req.headers.get('user-agent'),
      });
      if (errAud) console.error('[automatico/apps-estudio] auditoría:', errAud.message);
    }

    const aviso = evento ? AVISOS[evento](nombreEstudio, detalle) : null;
    if (aviso) await avisarEquipoApps(aviso.asunto, aviso.texto);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorInterno('automatico/apps-estudio:POST', err);
  }
}
