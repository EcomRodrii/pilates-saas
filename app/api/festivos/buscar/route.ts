import { NextRequest, NextResponse } from 'next/server';
import * as Sentry from '@sentry/nextjs';
import { verificarSesionStaff } from '@/lib/auth-server';
import { puedeGestionarSede } from '@/lib/permisos-reglas';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { enforceRateLimit, topeEstricto } from '@/lib/rate-limit';
import { hoyEnEstudio } from '@/lib/utils';
import { festivosEntre, NOMBRE_ZONA } from '@/lib/festivos/oficiales';
import { festivosGuardadosEntre, ubicacionDelEstudio, zonaDeUbicacion } from '@/lib/festivos/estudio-servidor';
import { buscarFestivosConIA } from '@/lib/festivos/buscar-ia';
import {
  aniosConCalendario, limpiarLocalidad, limpiarPropuestosIA, oficialesDeBusqueda, rangoDeBusqueda, zonaDeBusqueda,
  TOPE_BUSQUEDAS_CUENTA_DIA, TOPE_BUSQUEDAS_ESTUDIO_DIA, TOPE_BUSQUEDAS_TOTAL_DIA, type FestivoPropuesto,
} from '@/lib/festivos/modulo';

export const dynamic = 'force-dynamic';
// La IA tiene 80 s en total (lib/festivos/buscar-ia.ts): la ruta, de sobra para contestar siempre.
export const maxDuration = 120;

// Módulo Festivos — `POST /api/festivos/buscar { localidad }`: TODOS los
// festivos de esa localidad desde hoy hasta final del año que viene, en una sola
// lista y en orden, para revisarlos y añadirlos de una vez. No guarda nada.
//   · Los oficiales (Año Nuevo, Reyes, Navidad, los de la comunidad…) salen del
//     calendario copiado del boletín (lib/festivos/oficiales.ts) para la
//     comunidad de lo escrito; si no la reconocemos, los nacionales comunes.
//     Nunca de la IA.
//   · Lo que encuentra la IA: las fiestas LOCALES (y, en un año sin calendario
//     cargado, también lo demás), con su fuente si la búsqueda la vio.
//   · `yaEnLista`: ese día ya está en la lista del estudio (un oficial de la
//     comunidad de su dirección o algo guardado): se enseña, no se vuelve a añadir.
// Si la IA no está, se agota el tope o falla, se contesta igual con los
// oficiales y un aviso.
//
// Puertas, en orden: sesión de staff → rol (propietaria y gerencia, las que
// pueden cerrar) → ráfaga → localidad válida → TOPE DIARIO de
// búsquedas con IA por cuenta, por estudio y total, CERRADO si el contador falla
// (es gasto de IA) → el modelo. No gasta consultas del asistente (mismo criterio
// que «Leer el horario»).

const SIN_IA = (motivo: 'tope_cuenta' | 'tope_estudio' | 'tope_total' | 'error' | 'tiempo' | 'sin_clave'): string => {
  switch (motivo) {
    case 'tope_cuenta': return `Hoy ya has buscado ${TOPE_BUSQUEDAS_CUENTA_DIA} veces las fiestas locales. Vuelve mañana, o añádelas a mano.`;
    case 'tope_estudio': return `Hoy ya se han buscado ${TOPE_BUSQUEDAS_ESTUDIO_DIA} veces las fiestas locales de tu estudio. Vuelve mañana, o añádelas a mano.`;
    case 'tope_total': return 'Ahora mismo no podemos buscar las fiestas locales. Inténtalo mañana, o añádelas a mano.';
    case 'tiempo': return 'La búsqueda de las fiestas locales ha tardado demasiado. Inténtalo otra vez en un rato, o añádelas a mano.';
    case 'sin_clave': return 'La búsqueda de fiestas locales no está disponible ahora. Añádelas a mano.';
    default: return 'No hemos podido buscar las fiestas locales ahora. Inténtalo en un rato, o añádelas a mano.';
  }
};

export async function POST(req: NextRequest) {
  const sesion = await verificarSesionStaff(req);
  if (!sesion) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  if (!puedeGestionarSede(sesion.rol)) return NextResponse.json({ error: 'No tienes permiso para esto' }, { status: 403 });
  const studioId = sesion.studioId;

  const limited = await enforceRateLimit(req, 'festivos-buscar', { max: 6, windowSeconds: 60 }, studioId);
  if (limited) return limited;

  const body = (await req.json().catch(() => null)) as { localidad?: unknown } | null;
  const localidad = limpiarLocalidad(body?.localidad);
  if (!localidad) {
    return NextResponse.json({ error: 'Escribe el nombre de tu localidad (por ejemplo, Madrid o Sabadell) o su código postal.' }, { status: 400 });
  }

  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: 'Servidor no configurado' }, { status: 503 });

  const hoy = hoyEnEstudio();
  const { desde, hasta, anios } = rangoDeBusqueda(hoy);
  const ubicacion = await ubicacionDelEstudio(admin, studioId);
  if (ubicacion === 'error') return NextResponse.json({ error: 'No se han podido buscar los festivos. Inténtalo de nuevo.' }, { status: 500 });
  // La lista del estudio trae sola los oficiales de su DIRECCIÓN; la búsqueda,
  // los de lo escrito (o, si es su misma ciudad, los de la dirección).
  const zonaLista = zonaDeUbicacion(ubicacion);
  const zona = zonaDeBusqueda(localidad, ubicacion);
  const conCalendario = aniosConCalendario(zona, anios);
  const oficiales = oficialesDeBusqueda(zona, desde, hasta);

  const guardados = await festivosGuardadosEntre(admin, studioId, desde, hasta);
  if (guardados === 'error') return NextResponse.json({ error: 'No se han podido buscar los festivos. Inténtalo de nuevo.' }, { status: 500 });
  const enLista = new Set([
    ...(zonaLista ? festivosEntre(zonaLista, desde, hasta).map((f) => f.fecha) : []),
    ...guardados.map((g) => g.fecha),
  ]);
  const deOficiales: FestivoPropuesto[] = oficiales.map((f) => ({
    fecha: f.fecha, nombre: f.nombre, ambito: f.ambito, origen: 'oficial', fuente: f.fuente, fuenteUrl: f.fuenteUrl, yaEnLista: enLista.has(f.fecha),
  }));

  const base = {
    localidad,
    comunidad: zona ? NOMBRE_ZONA[zona] : null,
    // Lo escrito es de otra comunidad que la dirección del estudio: se avisa.
    otraComunidad: zona && zonaLista && zona !== zonaLista ? NOMBRE_ZONA[zonaLista] : null,
    sinCalendario: anios.filter((a) => !conCalendario.has(a)),
  };
  const responder = (ia: FestivoPropuesto[], extra: { ia: 'ok' | 'tope' | 'error'; avisos: string[] }) => NextResponse.json(
    { ...base, propuestos: [...deOficiales, ...ia].sort((a, b) => a.fecha.localeCompare(b.fecha)), ...extra },
    { headers: { 'Cache-Control': 'no-store' } },
  );
  const sinIA = (motivo: Parameters<typeof SIN_IA>[0]) => responder([], { ia: motivo.startsWith('tope') ? 'tope' : 'error', avisos: [SIN_IA(motivo)] });

  // Tope diario (día de Madrid), por cuenta, por estudio y total. Cerrado si el contador falla.
  const porCuenta = await topeEstricto(`festivos-ia-cuenta:${sesion.userId}:${hoy}`, { max: TOPE_BUSQUEDAS_CUENTA_DIA, windowSeconds: 36 * 3600 });
  if (!porCuenta.allowed) return sinIA('tope_cuenta');
  const porEstudio = await topeEstricto(`festivos-ia-dia:${studioId}:${hoy}`, { max: TOPE_BUSQUEDAS_ESTUDIO_DIA, windowSeconds: 36 * 3600 });
  if (!porEstudio.allowed) return sinIA('tope_estudio');
  const total = await topeEstricto(`festivos-ia-total:${hoy}`, { max: TOPE_BUSQUEDAS_TOTAL_DIA, windowSeconds: 36 * 3600 });
  if (!total.allowed) {
    Sentry.captureMessage('[festivos/buscar] tope total del día alcanzado', { level: 'warning', tags: { area: 'festivos-ia' } });
    return sinIA('tope_total');
  }

  const r = await buscarFestivosConIA({ localidad, comunidad: zona ? NOMBRE_ZONA[zona] : null, desde, hasta, aniosConCalendario: [...conCalendario] });
  if (!r.ok) {
    if (r.motivo !== 'sin_clave') Sentry.captureMessage('[festivos/buscar] la IA no ha podido buscar', { level: 'warning', tags: { area: 'festivos-ia', motivo: r.motivo } });
    return sinIA(r.motivo === 'tiempo' || r.motivo === 'sin_clave' ? r.motivo : 'error');
  }

  const deIA = limpiarPropuestosIA(r.festivos, {
    desde, hasta, fechasOficiales: new Set(oficiales.map((o) => o.fecha)), aniosConCalendario: conCalendario, fuentesVistas: r.fuentesVistas,
  }).map((f) => ({ ...f, yaEnLista: enLista.has(f.fecha) }));
  Sentry.addBreadcrumb({
    category: 'festivos-ia', message: 'buscado',
    data: { propuestos: deIA.length, descartados: r.festivos.length - deIA.length, fuentes: r.fuentesVistas.size, ...r.tokens },
  });
  return responder(deIA, { ia: 'ok', avisos: r.avisos });
}
