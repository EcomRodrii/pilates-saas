import { useCallback, useEffect, useMemo, useState } from 'react';
import { cargarDatosPublicos } from '@/lib/api-client';
import { postPublicoWidget } from '@/lib/reservar/api-publica';
import { construirSlots, type FiltrosSlots } from '@/lib/reservar/construir-slots';
import { useSesionWidget } from '@/lib/widget/usar-sesion-widget';
import type {
  Sesion, TipoClase, Sala, Instructor, Spot, Reserva, Suscripcion, PlanTarifa,
  SustitucionConfirmadaPublica,
} from '@/lib/types';
import type { ReservaSlot } from '@/components/reserva/reserva-calendario';
import type { ResultadoReserva } from '@/lib/studio-context';

// Hook mínimo del bundle embebible (Modo B): trae SOLO lo que
// <ReservaCalendario> necesita para pintar y reservar, sin montar
// StudioProvider entero (gamificación/comunidad/POS/vídeo/etc. que ese
// widget nunca usa — ver el comentario de "liviano" en fetchPublicStudioData).
//
// Reusa `cargarDatosPublicos`/`postPublicoWidget`/`construirSlots`, todo ya
// escrito para este propósito — no hay lógica de negocio nueva aquí, solo el
// cableado de estado de un componente que vive fuera del árbol de contexto.
interface DatosCrudos {
  studioId: string;
  sesiones: Sesion[];
  tiposClase: TipoClase[];
  salas: Sala[];
  instructores: Instructor[];
  spots: Spot[];
  reservas: Reserva[];
  planesTarifa: PlanTarifa[];
  suscripciones: Suscripcion[];
  sustitucionesConfirmadas: SustitucionConfirmadaPublica[];
}

const VACIO: DatosCrudos = {
  studioId: '', sesiones: [], tiposClase: [], salas: [], instructores: [], spots: [],
  reservas: [], planesTarifa: [], suscripciones: [], sustitucionesConfirmadas: [],
};

// `baseUrl`: el bundle corre en el DOM de la web del ESTUDIO — todas las
// rutas relativas de siempre (`/api/public/...`) resolverían contra SU
// origen si no se les da explícitamente el de Tentare. Ver
// app/widget-bundle/main.tsx, que lo resuelve del propio <script src="...">.
export function useDatosWidget(slug: string, baseUrl: string, filtros?: FiltrosSlots) {
  const { socia } = useSesionWidget(slug, baseUrl);
  const [datos, setDatos] = useState<DatosCrudos>(VACIO);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const recargar = useCallback(() => {
    setCargando(true);
    cargarDatosPublicos(slug, { liviano: true, baseUrl }).then(pub => {
      if (!pub || pub.error) { setError('No se ha podido cargar el estudio.'); setCargando(false); return; }
      const aforo: Reserva[] = (pub.aforoReservas ?? []).map(
        (r: { id: string; sesion_id: string; estado: string; spot_id: string | null }) => ({
          id: r.id, studioId: pub.studio?.id ?? '', sesionId: r.sesion_id, socioId: '',
          estado: r.estado as Reserva['estado'], spotId: r.spot_id ?? null, posicionEspera: null, checkInEn: null, creadoEn: '',
        }),
      );
      const miasById = new Map<string, Reserva>((pub.socia?.reservas ?? []).map((r: Reserva) => [r.id, r]));
      setDatos({
        studioId: pub.studio?.id ?? '',
        sesiones: pub.sesiones ?? [],
        tiposClase: pub.tiposClase ?? [],
        salas: pub.salas ?? [],
        instructores: pub.instructores ?? [],
        spots: pub.spots ?? [],
        reservas: aforo.map(r => miasById.get(r.id) ?? r),
        planesTarifa: pub.planesTarifa ?? [],
        suscripciones: pub.socia?.suscripciones ?? [],
        sustitucionesConfirmadas: pub.sustitucionesConfirmadas ?? [],
      });
      setError(null);
      setCargando(false);
    }).catch(() => { setError('No se ha podido cargar el estudio.'); setCargando(false); });
  }, [slug, baseUrl]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- Carga inicial del catálogo público del estudio, sistema externo (fetch).
    recargar();
  }, [recargar]);

  // `Date.now()` es impuro — no puede llamarse dentro del cuerpo de un
  // `useMemo` (regla de pureza de React Compiler) ni siquiera en un
  // inicializador perezoso de `useState` (también se ejecuta durante el
  // render). Mismo patrón que `now`/`FECHA_PLACEHOLDER_SSR` en
  // app/reservar/[slug]/page.tsx: placeholder fijo al render inicial, valor
  // real fijado en un efecto tras montar. A diferencia de esa página no hace
  // falta que se actualice sola (sin reloj en pantalla) — un valor por carga basta.
  const [nowMs, setNowMs] = useState(0);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- Guarda de hidratación: Date.now() no puede llamarse en render. El segundo render es el objetivo.
    setNowMs(Date.now());
  }, []);

  const slots = useMemo<ReservaSlot[]>(() => construirSlots({
    sesiones: datos.sesiones, tiposClase: datos.tiposClase, salas: datos.salas, instructores: datos.instructores,
    reservas: datos.reservas, spots: datos.spots, sustitucionesConfirmadas: datos.sustitucionesConfirmadas,
    suscripciones: datos.suscripciones, planesTarifa: datos.planesTarifa, socia,
    nowMs, filtros,
  }), [datos, socia, filtros, nowMs]);

  const onReservar = useCallback(async (slot: ReservaSlot, spotId: string | null): Promise<ResultadoReserva> => {
    if (!socia?.socioId) return { ok: false, error: 'Inicia sesión para reservar.' };
    const r = await postPublicoWidget(`${baseUrl}/api/public/reserva`, {
      accion: 'crear', studioId: datos.studioId, sesionId: slot.id, socioId: socia.socioId, email: socia.email, spotId,
    }, { studioId: datos.studioId });
    recargar();
    if (!r.ok) return { ok: false, error: r.error };
    const estado = (r.datos as { estado?: string } | null)?.estado;
    return { ok: true, estado: estado === 'LISTA_ESPERA' ? 'LISTA_ESPERA' : 'CONFIRMADA' };
  }, [socia, datos.studioId, recargar, baseUrl]);

  const onCancelar = useCallback(async (reservaId: string) => {
    if (!socia?.socioId) return;
    const r = await postPublicoWidget(`${baseUrl}/api/public/reserva`, {
      accion: 'cancelar', studioId: datos.studioId, reservaId,
    }, { studioId: datos.studioId });
    recargar();
    return r;
  }, [socia, datos.studioId, recargar, baseUrl]);

  return { slots, cargando, error, socia, studioId: datos.studioId || null, onReservar, onCancelar, recargar };
}
