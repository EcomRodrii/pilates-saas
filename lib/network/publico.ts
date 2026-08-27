// Capa de datos pública de Tentare Network — server-only, service_role.
//
// docs/NETWORK-AUDIT-2.md §11: nada en el repo consulta red_perfiles
// directamente desde el navegador (siempre vía API routes con
// getSupabaseAdmin(), que ya bypasea RLS). Abrir RLS a `anon` sería
// redundante Y arriesgado — RLS es por FILA, no por columna, y un SELECT *
// como anon vería email_contacto/telefono_contacto de perfiles publicados.
// En su lugar, estas funciones son la ÚNICA fuente de columnas públicas
// (nunca seleccionan contacto/auth_user_id) y las usan tanto:
//   - las páginas públicas nuevas (app/network/instructoras/*, Server
//     Components, sin sesión — el marketplace indexable en Google), como
//   - las rutas de API ya existentes del panel de la propietaria
//     (app/api/network/buscar, app/api/network/perfil/[id]), que solo
//     añaden el guard de sesión de staff por encima.
import type { SupabaseClient } from '@supabase/supabase-js';
// Relativo y con `.ts` explícita: este módulo tiene test unitario y el runner
// de `node --test` no resuelve ni el alias `@/` ni las rutas sin extensión.
import { escaparLike } from '../escapar-like.ts';
import {
  mapFilaAPerfilPublico, mapFilaAExperienciaPublica,
  type FilaRedPerfilPublica, type FilaRedExperiencia,
} from './mapeo.ts';
import { ordenarResultadosNetwork } from './ranking.ts';
import {
  emailVerificado, experienciaVerificada, referenciaProfesional, identidadVerificada, activaRecientemente,
} from './badges.ts';
import {
  esEspecialidadValida, esHorarioValido, esTipoTrabajoValido, esDisponibilidadEstadoValido, esTarifaRangoValida,
} from './catalogo.ts';
import { esOrdenarPorValido } from './tipos.ts';
import type {
  FiltroBusquedaNetwork, PerfilNetworkPublico, ExperienciaNetworkPublica, BadgesNetwork,
  ResumenResenas, ResenaNetwork, MediaNetwork, EstudioActualNetwork,
} from './tipos.ts';
import { mapFilaAMedia, type FilaRedPerfilMedia } from './mapeo.ts';

// Portfolio de fotos (F1) — mismo bucket privado y mismo criterio de "toda
// lectura pasa por URL firmada" que app/api/network/portfolio/route.ts (ver
// lib/network/portfolio-storage.ts para el porqué no es el bucket público
// `avatars`). 10 minutos aquí, más corto que en la vista propia (1h): una
// visita al marketplace es un vistazo de un momento, no una sesión de
// edición larga — y una página pública indexable no debería llevar cosida
// una URL firmada de vida larga en el HTML servido.
const BUCKET_PORTFOLIO = 'red-documentos-identidad';
const CADUCIDAD_URL_PORTFOLIO_SEGUNDOS = 600;

/** Media a 1 decimal; `null` sin reseñas — nunca 0 estrellas fabricadas. */
function resumenDesdePuntuaciones(puntuaciones: number[]): ResumenResenas {
  if (puntuaciones.length === 0) return { promedio: null, total: 0 };
  const suma = puntuaciones.reduce((acc, p) => acc + p, 0);
  return { promedio: Math.round((suma / puntuaciones.length) * 10) / 10, total: puntuaciones.length };
}

const SELECT_COLUMNAS_PUBLICAS = `
  id, slug, nombre, foto_url, ciudad, zona, radio_km, descripcion,
  especialidades, anios_experiencia, tarifa_rango, disponibilidad_estado,
  disponibilidad_horarios, tipo_trabajo, estado, destacado, identidad_verificada_en,
  creado_en, actualizado_en, ultimo_acceso_en, idiomas, instagram, linkedin, web,
  mostrar_estudios_actuales, lat, lng
`;

// Tope sin paginar: mismo criterio pragmático que otros listados de este
// repo (memoria "conciliador-es-el-camino-principal"). Paginar de verdad es
// prematuro antes de tener volumen que lo justifique.
const LIMITE_RESULTADOS = 200;

export function filtroDesdeSearchParams(sp: URLSearchParams): FiltroBusquedaNetwork {
  const listaParam = (clave: string): string[] => {
    const valor = sp.get(clave);
    return valor ? valor.split(',').map(v => v.trim()).filter(Boolean) : [];
  };
  const experienciaMinimaRaw = sp.get('experienciaMinima');
  const valoracionMinimaRaw = sp.get('valoracionMinima');
  const ordenarPorRaw = sp.get('ordenarPor');
  return {
    ciudad: sp.get('ciudad')?.trim() || null,
    especialidades: listaParam('especialidades').filter(esEspecialidadValida) as FiltroBusquedaNetwork['especialidades'],
    disponibilidad: listaParam('disponibilidad').filter(esDisponibilidadEstadoValido) as FiltroBusquedaNetwork['disponibilidad'],
    horarios: listaParam('horarios').filter(esHorarioValido) as FiltroBusquedaNetwork['horarios'],
    tipoTrabajo: listaParam('tipoTrabajo').filter(esTipoTrabajoValido) as FiltroBusquedaNetwork['tipoTrabajo'],
    experienciaMinima: experienciaMinimaRaw && Number.isFinite(Number(experienciaMinimaRaw)) ? Number(experienciaMinimaRaw) : null,
    tarifaRango: listaParam('tarifaRango').filter(esTarifaRangoValida) as FiltroBusquedaNetwork['tarifaRango'],
    soloIdentidadVerificada: sp.get('identidadVerificada') === '1',
    soloExperienciaVerificada: sp.get('experienciaVerificada') === '1',
    soloCertificacionVerificada: sp.get('certificacionVerificada') === '1',
    valoracionMinima: valoracionMinimaRaw && Number.isFinite(Number(valoracionMinimaRaw)) ? Number(valoracionMinimaRaw) : null,
    idioma: sp.get('idioma')?.trim() || null,
    ordenarPor: esOrdenarPorValido(ordenarPorRaw) ? ordenarPorRaw : undefined,
  };
}

/**
 * Semilla E2E (2026-08-14, incidente de despliegue): esta consulta corre en
 * el SERVIDOR, así que `page.route` (nivel navegador) no la intercepta — y
 * con el env dummy de CI (`https://example.supabase.co`, ver ci.yml) la
 * consulta real siempre falla y `buscarPerfilesPublico` devuelve `[]`.
 *
 * Eso no era solo un hueco de cobertura: **dejó pasar un build de producción
 * roto tres veces seguidas.** `TarjetaInstructora` pasaba un `onMouseEnter`
 * de servidor a un `<Link>` de cliente — error de export que revienta el
 * prerender de `/network` — y como `destacadas` siempre estaba vacío en CI,
 * ese `.map()` nunca llegaba a ejecutarse ahí. Pasaba el build, fallaba en
 * Vercel con datos reales. Mismo patrón que `getStudioSeo`
 * (`lib/studio-seo.ts`): con `E2E_TEST=1` se siembran perfiles de verdad EN
 * VEZ de consultar Supabase, nunca en producción (la env no existe allí).
 *
 * ⚠️ Y como `E2E_TEST=1` está declarado a nivel de WORKFLOW en `ci.yml`, no
 * solo en el job de e2e, esto también siembra el job "Build de producción":
 * el `npm run build` de CI ejercita ahora el mismo `.map()` que rompió tres
 * despliegues, con datos reales — así que la próxima vez que algo similar
 * pase, el build de CI se cae ANTES de mergear, no después.
 *
 * Dos perfiles a propósito, no uno: cubren las ramas que `TarjetaInstructora`
 * pinta distinto — verificada/sin verificar, con reseñas/sin ninguna, tarifa
 * fija/"a consultar" — que con un único perfil sintético quedarían sin tocar.
 */
// Exportada solo para el test unitario de `perfilCoincideFiltro` — nada del
// código de producción la importa desde fuera de este fichero.
export const PERFILES_SEED_E2E: readonly PerfilNetworkPublico[] = [
  {
    id: 'perfil-e2e-1', slug: 'marta-gomez-e2e', nombre: 'Marta Gómez',
    fotoUrl: null, ciudad: 'Madrid', zona: 'Salamanca', radioKm: 10,
    descripcion: 'Instructora de reformer con más de 8 años de experiencia.',
    especialidades: ['reformer', 'mat'], aniosExperiencia: 8, tarifaRango: '25-30',
    disponibilidadEstado: 'disponible', disponibilidadHorarios: ['mananas', 'tardes'],
    tipoTrabajo: ['freelance', 'sustituciones'],
    estado: 'published', destacado: true, identidadVerificadaEn: '2026-01-15T10:00:00.000Z',
    creadoEn: '2026-01-01T00:00:00.000Z', actualizadoEn: '2026-08-01T00:00:00.000Z', ultimoAccesoEn: null,
    idiomas: ['es', 'en'], instagram: null, linkedin: null, web: null,
    experienciaVerificada: true, certificacionVerificada: true, referenciaProfesional: true,
    resumenResenas: { promedio: 4.8, total: 12 },
    // Geocodificada (Madrid centro) a propósito: la otra semilla se deja
    // sin lat/lng para que el e2e/manual también vea el caso "cobertura
    // parcial" del mapa, no solo "todo geocodificado".
    lat: 40.4168, lng: -3.7038,
  },
  {
    id: 'perfil-e2e-2', slug: 'sofia-ruiz-e2e', nombre: 'Sofía Ruiz',
    fotoUrl: null, ciudad: 'Barcelona', zona: null, radioKm: null,
    descripcion: 'Profesora de yoga y HIIT, disponible para clases puntuales.',
    especialidades: ['yoga', 'hiit'], aniosExperiencia: 3, tarifaRango: null,
    disponibilidadEstado: 'buscando_trabajo', disponibilidadHorarios: ['noches', 'fines_semana'],
    tipoTrabajo: ['clases_puntuales'],
    estado: 'published', destacado: false, identidadVerificadaEn: null,
    creadoEn: '2026-03-01T00:00:00.000Z', actualizadoEn: '2026-07-15T00:00:00.000Z', ultimoAccesoEn: null,
    idiomas: ['es'], instagram: null, linkedin: null, web: null,
    experienciaVerificada: false, certificacionVerificada: false, referenciaProfesional: false,
    resumenResenas: { promedio: null, total: 0 },
    lat: null, lng: null,
  },
];

/**
 * Los mismos filtros que el `query` de abajo aplica en Postgres
 * (`.eq`/`.overlaps`/`.in`/`.gte`), pero en memoria: la semilla no pasa por
 * Supabase, así que nada los aplicaba y el filtro de especialidad de la URL
 * no hacía nada — `ordenarResultadosNetwork` solo ORDENA, no filtra. Lo cazó
 * el propio e2e (`network-marketplace-publico.spec.ts`) al comprobar que
 * filtrar por Reformer deja fuera a quien no lo tiene.
 */
export function perfilCoincideFiltro(p: PerfilNetworkPublico, filtro: FiltroBusquedaNetwork): boolean {
  if (filtro.ciudad && !(p.ciudad ?? '').toLowerCase().includes(filtro.ciudad.toLowerCase())) return false;
  if (filtro.especialidades.length && !p.especialidades.some(e => filtro.especialidades.includes(e))) return false;
  if (filtro.disponibilidad.length && !filtro.disponibilidad.includes(p.disponibilidadEstado)) return false;
  if (filtro.horarios.length && !p.disponibilidadHorarios.some(h => filtro.horarios.includes(h))) return false;
  if (filtro.tipoTrabajo.length && !p.tipoTrabajo.some(t => filtro.tipoTrabajo.includes(t))) return false;
  if (filtro.experienciaMinima != null && (p.aniosExperiencia == null || p.aniosExperiencia < filtro.experienciaMinima)) return false;
  if (filtro.tarifaRango.length && (p.tarifaRango == null || !filtro.tarifaRango.includes(p.tarifaRango))) return false;
  if (filtro.soloIdentidadVerificada && !p.identidadVerificadaEn) return false;
  if (filtro.soloExperienciaVerificada && !p.experienciaVerificada) return false;
  if (filtro.soloCertificacionVerificada && !p.certificacionVerificada) return false;
  if (filtro.valoracionMinima != null && (p.resumenResenas.promedio == null || p.resumenResenas.promedio < filtro.valoracionMinima)) return false;
  if (filtro.idioma && !p.idiomas.some(i => i.toLowerCase().includes(filtro.idioma!.toLowerCase()))) return false;
  return true;
}

export async function buscarPerfilesPublico(
  admin: SupabaseClient, filtro: FiltroBusquedaNetwork,
): Promise<{ perfiles: PerfilNetworkPublico[] } | { error: unknown }> {
  if (process.env.E2E_TEST === '1') {
    const filtrados = PERFILES_SEED_E2E.filter(p => perfilCoincideFiltro(p, filtro));
    return { perfiles: ordenarResultadosNetwork(filtrados, filtro) };
  }

  // order() antes de limit(): sin un orden explícito el recorte a
  // LIMITE_RESULTADOS no es determinista (Postgres no garantiza el orden de
  // un SELECT sin ORDER BY).
  let query = admin
    .from('red_perfiles')
    .select(SELECT_COLUMNAS_PUBLICAS)
    .eq('estado', 'published')
    .order('actualizado_en', { ascending: false })
    .limit(LIMITE_RESULTADOS);

  if (filtro.ciudad) query = query.ilike('ciudad', `%${escaparLike(filtro.ciudad)}%`);
  if (filtro.especialidades.length > 0) query = query.overlaps('especialidades', filtro.especialidades);
  if (filtro.disponibilidad.length > 0) query = query.in('disponibilidad_estado', filtro.disponibilidad);
  if (filtro.horarios.length > 0) query = query.overlaps('disponibilidad_horarios', filtro.horarios);
  if (filtro.tipoTrabajo.length > 0) query = query.overlaps('tipo_trabajo', filtro.tipoTrabajo);
  if (filtro.experienciaMinima != null) query = query.gte('anios_experiencia', filtro.experienciaMinima);
  if (filtro.tarifaRango.length > 0) query = query.in('tarifa_rango', filtro.tarifaRango);
  if (filtro.soloIdentidadVerificada) query = query.not('identidad_verificada_en', 'is', null);

  const { data, error } = await query;
  if (error) return { error };

  const filas = (data ?? []) as unknown as FilaRedPerfilPublica[];

  // Badge "Experiencia verificada" en LOTE: una única query con
  // `.in(perfil_id)` para los N perfiles del resultado, nunca una consulta
  // por tarjeta — el resto de badges exige un lookup de Auth por persona y
  // se queda solo en el detalle de un perfil (obtenerPerfilPublico).
  const ids = filas.map(f => f.id);
  const { data: experienciasConfirmadas } = ids.length
    ? await admin.from('red_experiencias').select('perfil_id').in('perfil_id', ids).eq('estado_verificacion', 'confirmada')
    : { data: [] as { perfil_id: string }[] };
  const perfilesConExperienciaVerificada = new Set((experienciasConfirmadas ?? []).map(e => e.perfil_id as string));

  // "Formación verificada" en LOTE, mismo criterio: una consulta con
  // `.in(perfil_id)` para todo el listado, nunca por tarjeta.
  const { data: certificacionesVerificadas } = ids.length
    ? await admin.from('red_certificaciones').select('perfil_id').in('perfil_id', ids).eq('estado', 'verificado')
    : { data: [] as { perfil_id: string }[] };
  const perfilesConCertificacionVerificada = new Set((certificacionesVerificadas ?? []).map(c => c.perfil_id as string));

  // "Referencia profesional" en LOTE, mismo criterio que arriba: una query
  // con `.in(perfil_id)` para todo el listado — antes solo se calculaba con
  // un `count` por perfil individual dentro de `detallePerfilDesdeFila`
  // (ver más abajo), que no escala a un listado de hasta LIMITE_RESULTADOS
  // perfiles.
  const { data: referenciasConfirmadasLote } = ids.length
    ? await admin.from('red_referencias').select('perfil_id').in('perfil_id', ids).eq('estado', 'confirmada')
    : { data: [] as { perfil_id: string }[] };
  const perfilesConReferenciaProfesional = new Set((referenciasConfirmadasLote ?? []).map(r => r.perfil_id as string));

  // Reseñas en LOTE, mismo criterio que arriba: una query con `.in(perfil_id)`
  // para todo el listado, agregada en JS (Supabase-js no hace GROUP BY).
  const { data: resenasData } = ids.length
    ? await admin.from('red_resenas').select('perfil_id, puntuacion').in('perfil_id', ids).eq('estado', 'publicada')
    : { data: [] as { perfil_id: string; puntuacion: number }[] };
  const puntuacionesPorPerfil = new Map<string, number[]>();
  for (const r of resenasData ?? []) {
    const lista = puntuacionesPorPerfil.get(r.perfil_id as string) ?? [];
    lista.push(r.puntuacion as number);
    puntuacionesPorPerfil.set(r.perfil_id as string, lista);
  }

  let perfiles = filas.map(f => mapFilaAPerfilPublico(
    f, perfilesConExperienciaVerificada.has(f.id), resumenDesdePuntuaciones(puntuacionesPorPerfil.get(f.id) ?? []),
    perfilesConCertificacionVerificada.has(f.id), perfilesConReferenciaProfesional.has(f.id),
  ));

  // Post-filtro, no SQL: los datos ya se calcularon en lote arriba para
  // pintar el badge/la reseña de cada tarjeta — filtrar por ellos aquí no
  // añade ninguna consulta nueva, solo reusa lo ya traído.
  if (filtro.soloExperienciaVerificada) perfiles = perfiles.filter(p => p.experienciaVerificada);
  if (filtro.soloCertificacionVerificada) perfiles = perfiles.filter(p => p.certificacionVerificada);
  if (filtro.valoracionMinima != null) {
    const minimo = filtro.valoracionMinima;
    perfiles = perfiles.filter(p => p.resumenResenas.promedio != null && p.resumenResenas.promedio >= minimo);
  }
  // `idiomas` es un array de texto libre (sin catálogo fijo) — coincidencia
  // parcial en JS, no `.ilike` de SQL (eso solo sirve sobre una columna de
  // texto simple como `ciudad`).
  if (filtro.idioma) {
    const idioma = filtro.idioma.toLowerCase();
    perfiles = perfiles.filter(p => p.idiomas.some(i => i.toLowerCase().includes(idioma)));
  }

  return { perfiles: ordenarResultadosNetwork(perfiles, filtro) };
}

// Subconjunto público de CertificacionNetwork — nunca `documentoPath` (ruta
// del bucket privado) ni `motivoRechazo` (solo le importa a la propia
// dueña, ver /network/crear-perfil). Solo se listan las 'verificado': una
// certificación no se enseña como logro solo por haberla subido (README).
export interface CertificacionNetworkPublica {
  nombre: string;
  institucion: string;
  anio: number | null;
}

export interface DetallePerfilPublico {
  perfil: PerfilNetworkPublico;
  experiencias: ExperienciaNetworkPublica[];
  certificaciones: CertificacionNetworkPublica[];
  badges: BadgesNetwork;
  resenas: ResenaNetwork[];
  mediaFotos: MediaNetwork[];
  // F1 "Actualmente en Tentare" — vacío si el opt-in está apagado
  // (mostrar_estudios_actuales=false) o si no trabaja hoy en ninguna sede.
  estudiosActuales: EstudioActualNetwork[];
}

async function detallePerfilDesdeFila(
  admin: SupabaseClient, data: Record<string, unknown>,
): Promise<DetallePerfilPublico | { error: unknown }> {
  const id = data.id as string;

  // Las 5 queries son independientes entre sí (ninguna depende del
  // resultado de otra, todas solo necesitan `id`) — antes `red_experiencias`
  // iba en un `await` suelto ANTES del `Promise.all` de las otras 4, una
  // ida-y-vuelta de red completa evitable (auditoría de performance,
  // 2026-08-18). `auth_user_id` se pide APARTE (nunca en
  // SELECT_COLUMNAS_PUBLICAS) solo para resolver si el email de la cuenta
  // está confirmado — un único perfil, un único lookup, no el N+1 que sería
  // hacerlo en un listado.
  const [
    { data: experienciasData, error: errExp },
    { data: filaAuth },
    { count: referenciasConfirmadas },
    { data: resenasData },
    { data: certificacionesData },
    { data: mediaData },
  ] = await Promise.all([
    admin.from('red_experiencias')
      .select('id, studio_id, nombre_estudio, fecha_inicio, fecha_fin, especialidades, descripcion, estado_verificacion, creado_en')
      .eq('perfil_id', id)
      .order('fecha_inicio', { ascending: false }),
    admin.from('red_perfiles').select('auth_user_id').eq('id', id).maybeSingle(),
    admin.from('red_referencias').select('id', { count: 'exact', head: true }).eq('perfil_id', id).eq('estado', 'confirmada'),
    admin.from('red_resenas').select('id, puntuacion, comentario, creado_en, studios ( nombre )')
      .eq('perfil_id', id).eq('estado', 'publicada').order('creado_en', { ascending: false }),
    admin.from('red_certificaciones').select('nombre, institucion, anio')
      .eq('perfil_id', id).eq('estado', 'verificado').order('anio', { ascending: false }),
    admin.from('red_perfil_media').select('id, perfil_id, path, orden, creado_en')
      .eq('perfil_id', id).order('orden', { ascending: true }).order('creado_en', { ascending: true }),
  ]);
  if (errExp) return { error: errExp };

  const filasMedia = (mediaData ?? []) as unknown as FilaRedPerfilMedia[];
  let mediaFotos: MediaNetwork[] = [];
  if (filasMedia.length > 0) {
    const { data: firmadas } = await admin.storage
      .from(BUCKET_PORTFOLIO)
      .createSignedUrls(filasMedia.map(f => f.path), CADUCIDAD_URL_PORTFOLIO_SEGUNDOS);
    if (firmadas) {
      mediaFotos = filasMedia
        .map((f, i) => (firmadas[i]?.signedUrl ? mapFilaAMedia(f, firmadas[i].signedUrl) : null))
        .filter((m): m is MediaNetwork => m !== null);
    }
  }

  const experiencias = ((experienciasData ?? []) as unknown as Omit<FilaRedExperiencia, 'perfil_id'>[]).map(mapFilaAExperienciaPublica);
  const certificaciones: CertificacionNetworkPublica[] = (certificacionesData ?? []) as CertificacionNetworkPublica[];
  const { data: userData } = filaAuth?.auth_user_id
    ? await admin.auth.admin.getUserById(filaAuth.auth_user_id as string)
    : { data: { user: null } };

  type FilaResena = { id: string; puntuacion: number; comentario: string | null; creado_en: string; studios: { nombre: string | null } | null };
  const resenas: ResenaNetwork[] = ((resenasData ?? []) as unknown as FilaResena[]).map(r => ({
    id: r.id,
    puntuacion: r.puntuacion,
    comentario: r.comentario,
    estudioNombre: r.studios?.nombre ?? 'Un estudio',
    creadoEn: r.creado_en,
  }));

  const filaPublica = data as unknown as FilaRedPerfilPublica;
  const tieneExperienciaVerificada = experienciaVerificada(experiencias.map(e => e.estadoVerificacion));
  const tieneReferenciaProfesional = referenciaProfesional(referenciasConfirmadas ?? 0);
  const badges: BadgesNetwork = {
    emailVerificado: emailVerificado(userData.user?.email_confirmed_at ?? null),
    experienciaVerificada: tieneExperienciaVerificada,
    referenciaProfesional: tieneReferenciaProfesional,
    identidadVerificada: identidadVerificada(filaPublica.identidad_verificada_en),
    activaRecientemente: activaRecientemente(filaPublica.ultimo_acceso_en, new Date()),
  };

  // F1 "Actualmente en Tentare" — solo si la dueña activó el opt-in
  // (apagado por defecto). JOIN directo instructores↔studios por
  // auth_user_id: mis_estudios() exige auth.uid() real y este endpoint
  // corre con service_role (sin sesión de la instructora). Columnas
  // explícitas — nunca rol/tarifa/cualquier otro dato interno de gestión.
  let estudiosActuales: EstudioActualNetwork[] = [];
  if (filaPublica.mostrar_estudios_actuales && filaAuth?.auth_user_id) {
    const { data: sedesData } = await admin
      .from('instructores')
      .select('studios ( nombre, ciudad )')
      .eq('auth_user_id', filaAuth.auth_user_id as string)
      .eq('activo', true);
    type FilaSedeActual = { studios: { nombre: string; ciudad: string | null } | null };
    estudiosActuales = ((sedesData ?? []) as unknown as FilaSedeActual[])
      .filter((s): s is { studios: { nombre: string; ciudad: string | null } } => s.studios !== null)
      .map(s => ({ nombre: s.studios.nombre, ciudad: s.studios.ciudad }));
  }

  return {
    perfil: mapFilaAPerfilPublico(
      filaPublica, tieneExperienciaVerificada, resumenDesdePuntuaciones(resenas.map(r => r.puntuacion)),
      certificaciones.length > 0, tieneReferenciaProfesional,
    ),
    experiencias,
    certificaciones,
    badges,
    resenas,
    mediaFotos,
    estudiosActuales,
  };
}

export async function obtenerPerfilPublicoPorId(
  admin: SupabaseClient, id: string,
): Promise<DetallePerfilPublico | { error: unknown } | null> {
  const { data, error } = await admin
    .from('red_perfiles').select(SELECT_COLUMNAS_PUBLICAS).eq('id', id).eq('estado', 'published').maybeSingle();
  if (error) return { error };
  if (!data) return null;
  return detallePerfilDesdeFila(admin, data as Record<string, unknown>);
}

// Perfil no encontrado O no publicado → 404, nunca un 403 que confirmaría
// que existe (mismo criterio que obtenerPerfilPublicoPorId).
export async function obtenerPerfilPublicoPorSlug(
  admin: SupabaseClient, slug: string,
): Promise<DetallePerfilPublico | { error: unknown } | null> {
  const { data, error } = await admin
    .from('red_perfiles').select(SELECT_COLUMNAS_PUBLICAS).eq('slug', slug).eq('estado', 'published').maybeSingle();
  if (error) return { error };
  if (!data) return null;
  return detallePerfilDesdeFila(admin, data as Record<string, unknown>);
}

// Slug de URL para /network/instructoras/ciudad/[ciudad] — a propósito NO
// quita tildes (a diferencia de normalizarSlug de lib/network/slug.ts, hecho
// para slugs de perfil): `ciudadDesdeParam` (la página que lo decodifica)
// no las reconstruye si se pierden, y el filtro de búsqueda (`ilike`) es
// sensible a acentos — "Alcala" no encontraría a nadie en "Alcalá de
// Henares". Los caracteres no-ASCII van bien en una URL (el navegador los
// percent-encoda); solo hay que encodeURIComponent() donde se interpole en
// un href/loc.
export function slugCiudadUrl(ciudad: string): string {
  return ciudad.trim().toLowerCase().replace(/\s+/g, '-');
}

// Ciudades con AL MENOS un perfil publicado — nunca la lista fija de
// ciudades-coords.ts (esa es para geolocalización "cerca de mí", no para
// generar páginas: usarla crearía páginas SEO vacías de ciudades sin
// ninguna instructora, justo lo que ya evita el comentario de
// app/sitemap.ts sobre "nunca miles de páginas vacías generadas a priori").
export async function ciudadesConPerfilesPublicados(admin: SupabaseClient): Promise<string[]> {
  const { data } = await admin
    .from('red_perfiles')
    .select('ciudad')
    .eq('estado', 'published')
    .not('ciudad', 'is', null);
  const ciudades = new Set((data ?? []).map(f => (f.ciudad as string).trim()).filter(Boolean));
  return [...ciudades].sort((a, b) => a.localeCompare(b, 'es'));
}
