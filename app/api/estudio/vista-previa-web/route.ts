import { NextRequest, NextResponse } from 'next/server';
import { verificarSesionStaff } from '@/lib/auth-server';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { errorInterno } from '@/lib/errores-servidor';
import { topeEstricto } from '@/lib/rate-limit';
import { CacheWebReal, resolverWebReal } from '@/lib/widgets/web-real/servicio';
import { firmarPermisoWebReal } from '@/lib/widgets/web-real/token';

export const dynamic = 'force-dynamic';

// ─────────────────────────────────────────────────────────────────────────────
// «¿Se puede enseñar mi web en la vista previa?» («Tu web» v2, paso «Cómo se ve»).
//
// Detrás del widget dibujado, la vista previa puede enseñar la web REAL del
// estudio, pero solo si esa web deja que otra la enmarque. Para saberlo, este
// servidor le pide las cabeceras (lib/widgets/web-real/consulta.ts): la consulta
// la hace Tentare, así que lleva las cerraduras de un webhook (https, IP pública
// comprobada al conectar, tiempo total, redirecciones solo dentro del mismo
// sitio, sin leer el cuerpo).
//
//  · Solo la PROPIETARIA, igual que /api/estudio/widget-dominios, donde se
//    guardan las webs autorizadas.
//  · La web sale de lo GUARDADO para el estudio de la sesión (la primera
//    autorizada que se puede consultar). Del navegador solo se lee `forzar`
//    («Probar de nuevo»): ninguna dirección, ningún id.
//  · Sin web autorizada no se hace ninguna petición.
//  · Cada consulta cuenta contra un tope por estudio y hora (compartido entre
//    procesos); `forzar` salta la caché, no el tope. Lo que se averigua se guarda
//    una hora por estudio y dirección.
//  · Si se puede enseñar, se entrega un permiso firmado y de vida corta para
//    /vista-previa-web, que es quien enmarca la web (y quien lleva su
//    `frame-src`). No se descarga, ni se reescribe, ni se inyecta nada en su web.
// ─────────────────────────────────────────────────────────────────────────────

/** Consultas de verdad por estudio y hora (la caché y el permiso no cuentan). */
const TOPE_CONSULTAS_POR_HORA = 10;

// Un ahorro por proceso, no una garantía (ver servicio.ts): el tope es el que acota.
const CACHE = new CacheWebReal();

export async function POST(req: NextRequest) {
  const sesion = await verificarSesionStaff(req);
  if (!sesion) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  if (sesion.rol !== 'PROPIETARIO') {
    return NextResponse.json({ error: 'Solo la propietaria puede ver su web en la vista previa.' }, { status: 403 });
  }

  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: 'Servidor no configurado' }, { status: 503 });

  // Lo único que se lee del cuerpo: `forzar === true`.
  const cuerpo = await req.json().catch(() => null) as { forzar?: unknown } | null;
  const forzar = cuerpo?.forzar === true;

  // El estudio de la sesión, nunca del body.
  const { data: studio, error } = await admin
    .from('studios').select('id, widget_dominios_autorizados')
    .eq('id', sesion.studioId).maybeSingle();
  if (error || !studio) {
    return errorInterno('estudio:vista-previa-web:leer', error ?? new Error('sin estudio'),
      'No se ha podido leer tu estudio. Inténtalo de nuevo en unos segundos.');
  }
  const dominios = Array.isArray(studio.widget_dominios_autorizados)
    ? (studio.widget_dominios_autorizados as unknown[]).filter((d): d is string => typeof d === 'string')
    : [];

  const estado = await resolverWebReal(
    { studioId: studio.id as string, dominios, forzar, nuestroOrigen: req.nextUrl.origin },
    {
      cache: CACHE,
      tope: async () => (await topeEstricto(`estudio-vista-previa-web:${studio.id}`, { max: TOPE_CONSULTAS_POR_HORA, windowSeconds: 3600 })).allowed,
    },
  );

  // Nunca un motivo técnico hacia la pantalla: solo en qué estado quedó.
  if (estado.estado === 'se-deja') {
    return NextResponse.json({ estado: 'se-deja', permiso: firmarPermisoWebReal({ studioId: studio.id as string, origen: estado.origen }) });
  }
  return NextResponse.json({ estado: estado.estado });
}
