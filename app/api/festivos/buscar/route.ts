import { NextRequest, NextResponse } from 'next/server';
import * as Sentry from '@sentry/nextjs';
import { verificarSesionStaff } from '@/lib/auth-server';
import { puedeGestionarSede } from '@/lib/permisos-reglas';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { enforceRateLimit, topeEstricto } from '@/lib/rate-limit';
import { panelNuevoEncendido } from '@/lib/interruptor-por-estudio';
import { hoyEnEstudio } from '@/lib/utils';
import { festivosEntre, NOMBRE_ZONA } from '@/lib/festivos/oficiales';
import { festivosGuardadosEntre, ubicacionDelEstudio, zonaDeUbicacion } from '@/lib/festivos/estudio-servidor';
import { buscarFestivosConIA } from '@/lib/festivos/buscar-ia';
import {
  aniosConCalendario, limpiarPropuestosIA, rangoDeBusqueda, zonaDeLocalidad,
  TOPE_BUSQUEDAS_CUENTA_DIA, TOPE_BUSQUEDAS_ESTUDIO_DIA, TOPE_BUSQUEDAS_TOTAL_DIA,
} from '@/lib/festivos/modulo';

export const dynamic = 'force-dynamic';
// La IA tiene 80 s en total (lib/festivos/buscar-ia.ts): la ruta, de sobra para contestar siempre.
export const maxDuration = 120;

// Módulo Festivos (panel nuevo) — `POST /api/festivos/buscar { localidad }`:
// las fiestas que la IA encuentra para esa localidad, desde hoy hasta final del
// año que viene, para REVISARLAS. No guarda nada.
//   · Los oficiales NO salen de aquí: están ya en la lista del estudio, por la
//     dirección (lib/festivos/oficiales.ts). Aquí solo se dice cuántos hay.
//   · propuestos: lo que encuentra la IA, con su fuente. En los años con
//     calendario oficial, solo fiestas LOCALES; en los demás, también las
//     nacionales y autonómicas. La pantalla los enseña DESMARCADOS: los guarda
//     la propietaria si quiere, después de verlos.
// Si la IA no está, se agota el tope o falla, se contesta igual con un aviso.
//
// Puertas, en orden: sesión de staff → rol (propietaria y gerencia, las que
// pueden cerrar) → panel nuevo → ráfaga → localidad válida → TOPE DIARIO de
// búsquedas con IA por cuenta, por estudio y total, CERRADO si el contador falla
// (es gasto de IA) → el modelo. No gasta consultas del asistente (mismo criterio
// que «Leer el horario»).

// Letras (con tildes, ç, ñ, l·l), números, espacios y la puntuación de un nombre de municipio.
const LOCALIDAD = /^[\p{L}\p{M}0-9 '’.,·()/-]{2,60}$/u;

const SIN_IA = (motivo: 'tope_cuenta' | 'tope_estudio' | 'tope_total' | 'error' | 'tiempo' | 'sin_clave'): string => {
  switch (motivo) {
    case 'tope_cuenta': return `Hoy ya has buscado ${TOPE_BUSQUEDAS_CUENTA_DIA} veces. Vuelve mañana, o añade tus fiestas locales a mano.`;
    case 'tope_estudio': return `Hoy ya se han buscado ${TOPE_BUSQUEDAS_ESTUDIO_DIA} veces las fiestas de tu estudio. Vuelve mañana, o añádelas a mano.`;
    case 'tope_total': return 'Ahora mismo no podemos buscar más fiestas locales. Inténtalo mañana, o añádelas a mano.';
    case 'tiempo': return 'La búsqueda ha tardado demasiado. Inténtalo otra vez en un rato, o añade tus fiestas locales a mano.';
    case 'sin_clave': return 'La búsqueda de fiestas locales no está disponible ahora. Añádelas a mano.';
    default: return 'No hemos podido buscar las fiestas locales ahora. Inténtalo en un rato, o añádelas a mano.';
  }
};

export async function POST(req: NextRequest) {
  const sesion = await verificarSesionStaff(req);
  if (!sesion) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  if (!puedeGestionarSede(sesion.rol)) return NextResponse.json({ error: 'No tienes permiso para esto' }, { status: 403 });
  const studioId = sesion.studioId;
  if (!panelNuevoEncendido(studioId)) return NextResponse.json({ error: 'No disponible' }, { status: 404 });

  const limited = await enforceRateLimit(req, 'festivos-buscar', { max: 6, windowSeconds: 60 }, studioId);
  if (limited) return limited;

  const body = (await req.json().catch(() => null)) as { localidad?: unknown } | null;
  const localidad = typeof body?.localidad === 'string' ? body.localidad.replace(/\s+/g, ' ').trim() : '';
  if (!LOCALIDAD.test(localidad)) {
    return NextResponse.json({ error: 'Escribe el nombre de tu localidad (por ejemplo, Madrid o Sabadell) o su código postal.' }, { status: 400 });
  }

  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: 'Servidor no configurado' }, { status: 503 });

  const hoy = hoyEnEstudio();
  const { desde, hasta, anios } = rangoDeBusqueda(hoy);
  // Los oficiales, por la DIRECCIÓN del estudio (la misma regla que la bandeja y
  // Repetir). Lo escrito solo dice dónde buscar las locales; si su comunidad no
  // es la de la dirección, se avisa.
  const ubicacion = await ubicacionDelEstudio(admin, studioId);
  if (ubicacion === 'error') return NextResponse.json({ error: 'No se han podido buscar los festivos. Inténtalo de nuevo.' }, { status: 500 });
  const zona = zonaDeUbicacion(ubicacion);
  const zonaEscrita = zonaDeLocalidad(localidad);
  const conCalendario = aniosConCalendario(zona, anios);
  const oficiales = zona ? festivosEntre(zona, desde, hasta) : [];

  const guardados = await festivosGuardadosEntre(admin, studioId, desde, hasta);
  if (guardados === 'error') return NextResponse.json({ error: 'No se han podido buscar los festivos. Inténtalo de nuevo.' }, { status: 500 });

  const base = {
    localidad,
    comunidad: zona ? NOMBRE_ZONA[zona] : null,
    // Lo escrito es de otra comunidad que la dirección: los oficiales de la lista son los de la dirección.
    otraComunidad: zonaEscrita && zonaEscrita !== zona ? NOMBRE_ZONA[zonaEscrita] : null,
    oficiales: oficiales.length,
    sinCalendario: anios.filter((a) => !conCalendario.has(a)),
    yaGuardados: guardados.map((g) => g.fecha),
  };
  const sinIA = (motivo: Parameters<typeof SIN_IA>[0]) => NextResponse.json(
    { ...base, propuestos: [], ia: motivo.startsWith('tope') ? 'tope' : 'error', avisos: [SIN_IA(motivo)] },
    { headers: { 'Cache-Control': 'no-store' } },
  );

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

  const propuestos = limpiarPropuestosIA(r.festivos, {
    desde, hasta, fechasOficiales: new Set(oficiales.map((o) => o.fecha)), aniosConCalendario: conCalendario, fuentesVistas: r.fuentesVistas,
  });
  Sentry.addBreadcrumb({
    category: 'festivos-ia', message: 'buscado',
    data: { propuestos: propuestos.length, descartados: r.festivos.length - propuestos.length, fuentes: r.fuentesVistas.size, ...r.tokens },
  });
  return NextResponse.json({ ...base, propuestos, ia: 'ok', avisos: r.avisos }, { headers: { 'Cache-Control': 'no-store' } });
}
