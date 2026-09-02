import { NextRequest, NextResponse, after } from 'next/server';
import { verificarSesionStaff } from '@/lib/auth-server';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { resolverDestinatariasCampana } from '@/lib/marketing/segmentos';
import { emitirPostComunidadNuevo } from '@/lib/notifications/emit';
import { mapPostComunidad } from '@/lib/supabase-data';
import { uuidV4 } from '@/lib/utils';
import type { DestinatariosCampana, Socio, Suscripcion, Recibo } from '@/lib/types';
import type { RowPostsComunidad } from '@/lib/db-types';

// Server-authoritative: el estudio y el autor salen del JWT, nunca del body
// (mismo criterio que app/api/comunidad/comentarios/route.ts). Es la única
// vía de creación que sabe disparar el fan-out de notificación — el insert
// directo de dbInsertPostComunidad se queda para lo que ya la usaba, pero
// useContentStore.addPost ahora pasa por aquí (dbCrearPostComunidad).
//
// El fan-out YA NO pasa por Inngest (lib/inngest/comunidad.ts, eliminado):
// vivía como UN evento por post en una cola que factura por invocación sin
// aportar nada aquí — no hay reintento entre pasos que valga la pena, la
// resolución de audiencia es una query acotada por studio_id de milisegundos.
// `after()` (mismo patrón ya en producción en app/api/stripe/webhook/route.ts
// y lib/analytics.ts) corre el mismo trabajo DESPUÉS de que la respuesta al
// staff ya salió, sin bloquear el POST ni gastar cuota de Inngest. Precio
// explícito del cambio (igual que en el webhook de Stripe): sin reintento —
// si `after()` lanza, se captura y se registra, pero el aviso PUSH se pierde
// esa vez. Aceptable: es un aviso, no dinero ni un dato que el estudio no
// pueda volver a ver (el post en sí ya quedó guardado antes de este bloque).
const DESTINATARIOS_VALIDOS: DestinatariosCampana[] = [
  'TODAS', 'ACTIVAS', 'INACTIVAS', 'SIN_PLAN', 'BONO', 'VIP',
  'BONO_CADUCA_PRONTO', 'PAGO_FALLIDO', 'CUMPLE_ESTE_MES',
];

export async function POST(req: NextRequest) {
  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: 'Servidor no configurado' }, { status: 503 });

  const sesion = await verificarSesionStaff(req);
  if (!sesion) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const body = (await req.json().catch(() => null)) as {
    texto?: unknown; audiencia?: unknown; imagenUrl?: unknown;
    tipo?: unknown; eventoFecha?: unknown; eventoAforo?: unknown; eventoLugar?: unknown;
  } | null;
  const texto = typeof body?.texto === 'string' ? body.texto.trim() : '';
  if (!texto) return NextResponse.json({ error: 'Falta el texto del post' }, { status: 400 });

  const audiencia: DestinatariosCampana =
    typeof body?.audiencia === 'string' && DESTINATARIOS_VALIDOS.includes(body.audiencia as DestinatariosCampana)
      ? (body.audiencia as DestinatariosCampana)
      : 'TODAS';
  // Nunca se confía en un `imagenUrl` fuera de nuestro propio bucket — evita
  // que el post embeba (y el feed cargue) un origen arbitrario.
  //
  // La comprobación tiene que anclar en el PREFIJO completo del Storage de
  // este proyecto: un `includes('/comunidad-media/')` deja pasar
  // `https://rastreo.ajeno.example/comunidad-media/x.png`, y esa URL acaba en
  // un `<img src>` que cargan todas las socias del estudio (IP, User-Agent y
  // hora de lectura al tercero). El prefijo es exactamente el que produce
  // `getPublicUrl` en lib/portal-storage.ts:93.
  const imagenUrlRaw = typeof body?.imagenUrl === 'string' ? body.imagenUrl : null;
  const baseStorage = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').replace(/\/+$/, '');
  const prefijoComunidadMedia = baseStorage
    ? `${baseStorage}/storage/v1/object/public/comunidad-media/`
    : null;
  const imagenUrl = imagenUrlRaw && prefijoComunidadMedia && imagenUrlRaw.startsWith(prefijoComunidadMedia)
    ? imagenUrlRaw
    : null;

  // Eventos como entidad propia dentro del Feed (P2). Mismo camino de
  // creación/notificación que un post de texto — un evento nuevo no dispara
  // ningún fan-out distinto, solo lleva metadata extra.
  const tipo: 'TEXTO' | 'EVENTO' = body?.tipo === 'EVENTO' ? 'EVENTO' : 'TEXTO';
  const eventoFecha = typeof body?.eventoFecha === 'string' && body.eventoFecha ? body.eventoFecha : null;
  // La BD tiene un CHECK que exige `evento_fecha` cuando `tipo='EVENTO'` —
  // se valida aquí ANTES del insert para devolver un 400 legible en vez del
  // 500 crudo que daría el CHECK de Postgres.
  if (tipo === 'EVENTO' && !eventoFecha) {
    return NextResponse.json({ error: 'Falta la fecha del evento' }, { status: 400 });
  }
  const eventoAforo = typeof body?.eventoAforo === 'number' && Number.isFinite(body.eventoAforo) && body.eventoAforo > 0
    ? Math.floor(body.eventoAforo)
    : null;
  const eventoLugar = typeof body?.eventoLugar === 'string' && body.eventoLugar.trim() ? body.eventoLugar.trim() : null;

  const inicial = sesion.nombre.trim().split(/\s+/).slice(0, 2).map(w => w[0] ?? '').join('').toUpperCase() || 'EQ';
  // F-19 (auditoría 20ª pasada): `posts_comunidad.id` es PRIMARY KEY GLOBAL,
  // no compuesta con studio_id. Aceptar el id que manda el cliente convertía
  // el 23505 de una colisión en un oráculo de existencia CROSS-TENANT (500 =
  // "ese id ya existe en algún estudio", 200 = "no existía") — y encima el id
  // del cliente (`uid()`, timestamp+contador+azar débil) es adivinable. El
  // servidor genera SIEMPRE el suyo, con entropía real (crypto.randomUUID),
  // así que la respuesta ya no dice nada sobre lo que había antes.
  const fila = {
    id: `post-${uuidV4()}`,
    studio_id: sesion.studioId,
    autor_id: sesion.userId,
    autor_nombre: sesion.nombre,
    autor_inicial: inicial,
    texto,
    audiencia,
    imagen_url: imagenUrl,
    tipo,
    evento_fecha: eventoFecha,
    evento_aforo: eventoAforo,
    evento_lugar: eventoLugar,
    likes: 0,
    comentarios_count: 0,
    fijado: false,
    creado_en: new Date().toISOString(),
  };
  const { error } = await admin.from('posts_comunidad').insert(fila);
  if (error) return NextResponse.json({ error: 'No se pudo guardar el post' }, { status: 500 });

  // Fan-out de notificación best-effort, fuera del hilo del request: nunca
  // revierte ni bloquea la creación del post si algo falla aquí (misma
  // filosofía que el resto del Notification Engine — un aviso jamás rompe el
  // negocio). Reutiliza `resolverDestinatariasCampana`/`emitirPostComunidadNuevo`
  // TAL CUAL — mismo criterio de segmento que ya resuelve una campaña de
  // marketing, sin motor de audiencias paralelo para Comunidad. Queries
  // acotadas por studio_id (nunca fetchAllStudioData), mismo criterio que
  // tenía el worker de Inngest que sustituye.
  const studioId = sesion.studioId;
  const postId = fila.id;
  after(async () => {
    try {
      const adminAfter = getSupabaseAdmin();
      if (!adminAfter) return;
      const [{ data: sociosRaw }, { data: susRaw }, { data: recRaw }, { data: studioRaw }] = await Promise.all([
        adminAfter.from('socios').select('id, activo, tags, fecha_nacimiento').eq('studio_id', studioId),
        adminAfter.from('suscripciones').select('socio_id, estado, sesiones_restantes, fecha_fin').eq('studio_id', studioId).eq('estado', 'ACTIVA'),
        adminAfter.from('recibos').select('socio_id, estado').eq('studio_id', studioId).eq('estado', 'FALLIDO'),
        adminAfter.from('studios').select('slug').eq('id', studioId).maybeSingle(),
      ]);
      const socios = (sociosRaw ?? []).map(r => ({
        id: r.id, activo: r.activo, tags: r.tags ?? undefined, fechaNacimiento: r.fecha_nacimiento ?? undefined,
      })) as unknown as Socio[];
      const suscripciones = (susRaw ?? []).map(r => ({
        socioId: r.socio_id, estado: r.estado, sesionesRestantes: r.sesiones_restantes, fechaFin: r.fecha_fin,
      })) as unknown as Suscripcion[];
      const recibos = (recRaw ?? []).map(r => ({ socioId: r.socio_id, estado: r.estado })) as unknown as Recibo[];

      const destinatarias = resolverDestinatariasCampana(audiencia, { socios, suscripciones, recibos }, new Date());
      if (destinatarias.length === 0) return;
      await emitirPostComunidadNuevo(adminAfter, {
        studioId, postId, autorNombre: sesion.nombre,
        previsualizacion: texto ? texto.slice(0, 80) : null,
        socioIds: destinatarias.map(s => s.id),
        slug: (studioRaw as { slug: string | null } | null)?.slug ?? null,
      });
    } catch (e) {
      console.error('[comunidad/posts:POST] fan-out tras respuesta falló', e instanceof Error ? e.message : e);
    }
  });

  return NextResponse.json({ post: mapPostComunidad(fila as RowPostsComunidad) });
}
