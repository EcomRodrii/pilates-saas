import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { cargarDatosPublicos } from '@/lib/api-client';
import { postPublicoWidget } from '@/lib/reservar/api-publica';
import { construirSlots, type FiltrosSlots } from '@/lib/reservar/construir-slots';
import { useSesionWidget } from '@/lib/widget/usar-sesion-widget';
import { supabasePortal } from '@/lib/db/supabase-portal';
import type {
  Sesion, TipoClase, Sala, Instructor, Spot, Reserva, Suscripcion, PlanTarifa, Socio,
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
  // Para el texto legal del formulario de registro (Fase 2) — mismo criterio
  // que textoLegalCompleto() en lib/legal-textos.ts: NUNCA un contrato
  // "simplificado" distinto del que ve la socia en Modo A/portal, o la
  // comparación de consentimiento vigente (penalizaciones) se rompería.
  politicaPrivacidad: string;
  terminosServicio: string;
  // Fase 4 (Booking Engine — Mi Cuenta): TODAS las reservas de la socia (no
  // solo las que aforan un slot visible) y su ficha completa. Vienen del
  // MISMO payload que ya se pedía en cada carga (`pub.socia.*`, sin gatear
  // por `liviano`) — antes se tiraban a la basura, ver docs/account-widget-diseno.md §0.
  misReservas: Reserva[];
  socio: Socio | null;
  // Fase 3 (Booking Engine — checkout embebido): necesaria en el CLIENTE para
  // `loadStripe(pk, {stripeAccount})` — ver comentario de `studioPublico()`
  // en lib/db/supabase-data-admin.ts.
  stripeAccountId: string | null;
}

const VACIO: DatosCrudos = {
  studioId: '', sesiones: [], tiposClase: [], salas: [], instructores: [], spots: [],
  reservas: [], planesTarifa: [], suscripciones: [], sustitucionesConfirmadas: [],
  politicaPrivacidad: '', terminosServicio: '', misReservas: [], socio: null, stripeAccountId: null,
};

// `baseUrl`: el bundle corre en el DOM de la web del ESTUDIO — todas las
// rutas relativas de siempre (`/api/public/...`) resolverían contra SU
// origen si no se les da explícitamente el de Tentare. Ver
// app/widget-bundle/main.tsx, que lo resuelve del propio <script src="...">.
export function useDatosWidget(slug: string, baseUrl: string, filtros?: FiltrosSlots) {
  const { socia, usuarioEmail, autenticado, isLoading: sesionCargando, refrescar: refrescarSesion } = useSesionWidget(slug, baseUrl);
  const [datos, setDatos] = useState<DatosCrudos>(VACIO);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // `silencioso`: el tic de refresco periódico (más abajo) no debe tapar el
  // calendario con el estado de carga en cada pasada — eso convertiría "una
  // clase nueva aparece sola" en "el widget parpadea cada minuto". Los
  // callers de siempre (montaje, tras reservar/cancelar/etc.) siguen
  // pidiendo el loading visible, que sí tiene sentido ahí.
  const recargar = useCallback((opts?: { silencioso?: boolean }) => {
    if (!opts?.silencioso) setCargando(true);
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
        politicaPrivacidad: pub.studio?.politicaPrivacidad ?? '',
        terminosServicio: pub.studio?.terminosServicio ?? '',
        misReservas: pub.socia?.reservas ?? [],
        socio: pub.socia?.socio ?? null,
        stripeAccountId: pub.studio?.stripeAccountId ?? null,
      });
      setError(null);
      setCargando(false);
    }).catch(() => { setError('No se ha podido cargar el estudio.'); setCargando(false); });
  }, [slug, baseUrl]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- Carga inicial del catálogo público del estudio, sistema externo (fetch).
    recargar();
  }, [recargar]);

  // BUG del calendario que no se enteraba de una clase nueva: Modo B (este
  // hook) solo cargaba una vez al montar y tras acciones de la propia
  // socia — sin listener de `visibilitychange`/foco como Modo A (ese vive en
  // studio-context.tsx, que este bundle no usa a propósito, ver el
  // comentario "liviano" arriba). Sin ningún tic, un widget embebido que
  // alguien deja mirando en la web del estudio nunca ve una clase nueva.
  // Silencioso (no toca `cargando`) y se salta el tic con la pestaña oculta.
  const recargarRef = useRef(recargar);
  useEffect(() => { recargarRef.current = recargar; });
  useEffect(() => {
    const id = setInterval(() => {
      if (document.hidden) return;
      recargarRef.current({ silencioso: true });
    }, 60_000);
    return () => clearInterval(id);
  }, []);

  // `Date.now()` es impuro — no puede llamarse dentro del cuerpo de un
  // `useMemo` (regla de pureza de React Compiler) ni siquiera en un
  // inicializador perezoso de `useState` (también se ejecuta durante el
  // render). Mismo patrón que `now`/`FECHA_PLACEHOLDER_SSR` en
  // app/reservar/[slug]/page.tsx: placeholder fijo al render inicial, valor
  // real fijado en un efecto tras montar.
  const [nowMs, setNowMs] = useState(0);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- Guarda de hidratación: Date.now() no puede llamarse en render. El segundo render es el objetivo.
    setNowMs(Date.now());
    // Y con reloj de un minuto, igual que el Modo A. Aquí ponía que "un valor
    // por carga basta, no hay reloj en pantalla", y era falso por el motivo
    // equivocado: de `nowMs` sale `slots`, que filtra
    // `inicio > nowMs` (lib/reservar/construir-slots.ts). Justo encima, este
    // mismo hook recarga los datos cada 60 s — o sea que un widget embebido en
    // la web de un estudio y dejado abierto traía clases frescas y las medía
    // contra la hora del montaje, ofreciendo clases ya empezadas que el
    // servidor luego rechaza (MENSAJE_CLASE_YA_EMPEZADA). Es el bug que el
    // Modo A arregló y que a este lado no llegó.
    const id = setInterval(() => setNowMs(Date.now()), 60_000);
    return () => clearInterval(id);
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
    // `{silencioso:true}` NO es cosmético: sin él, `recargar()` pone `cargando`
    // a true y app/widget-bundle/main.tsx sustituye el árbol entero por el
    // esqueleto, DESMONTANDO <ReservaCalendario> en el mismo lote de estado en
    // que la hoja iba a pintar «¡Reserva confirmada!» o el motivo del rechazo.
    // Resultado: la socia pulsaba Reservar, veía un parpadeo y el calendario
    // volvía sin ficha, sin confirmación y sin error — un «no» del servidor
    // (sin bono, tope semanal, clase ya empezada) se perdía en silencio.
    // `cargando` es SOLO para la carga inicial. Aplica a las CUATRO acciones,
    // incluida la de perfil: mi-perfil.tsx pinta «Guardado.» tras el await.
    recargar({ silencioso: true });
    if (!r.ok) return { ok: false, error: r.error };
    const estado = (r.datos as { estado?: string } | null)?.estado;
    return { ok: true, estado: estado === 'LISTA_ESPERA' ? 'LISTA_ESPERA' : 'CONFIRMADA' };
  }, [socia, datos.studioId, recargar, baseUrl]);

  const onCancelar = useCallback(async (reservaId: string) => {
    if (!socia?.socioId) return;
    const r = await postPublicoWidget(`${baseUrl}/api/public/reserva`, {
      accion: 'cancelar', studioId: datos.studioId, reservaId,
    }, { studioId: datos.studioId });
    recargar({ silencioso: true }); // mismo motivo que en onReservar
    return r;
  }, [socia, datos.studioId, recargar, baseUrl]);

  // Fase 5 (Booking Engine): acepta una plaza liberada de lista de espera.
  const onAceptarOferta = useCallback(async (reservaId: string) => {
    if (!socia?.socioId) return;
    const r = await postPublicoWidget(`${baseUrl}/api/public/aceptar-oferta-espera`, {
      studioId: datos.studioId, reservaId,
    }, { studioId: datos.studioId });
    recargar({ silencioso: true }); // mismo motivo que en onReservar
    return r;
  }, [socia, datos.studioId, recargar, baseUrl]);

  // Fase 4 (Booking Engine — Mi Cuenta): edita los campos de la lista blanca
  // de actualizarSociaPublica (teléfono/NIF/fecha de nacimiento/dirección/
  // avatar/nombre/apellidos) — nunca email, el único excluido a propósito
  // ahí (identidad de sesión pública). El formulario de este widget
  // (mi-perfil.tsx) solo llega a mandar teléfono/dirección, pero esta
  // función reenvía tal cual lo que le pase cualquier llamador.
  const onActualizarPerfil = useCallback(async (cambios: Record<string, unknown>) => {
    if (!socia?.socioId) return { ok: false as const, error: 'No autenticada.' };
    const r = await postPublicoWidget(`${baseUrl}/api/public/socio`, {
      accion: 'actualizar', studioId: datos.studioId, cambios,
    }, { studioId: datos.studioId });
    recargar({ silencioso: true }); // mismo motivo que en onReservar
    return r;
  }, [socia, datos.studioId, recargar, baseUrl]);

  const logout = useCallback(async () => {
    await supabasePortal.auth.signOut();
    refrescarSesion();
  }, [refrescarSesion]);

  // Fase 3 (Booking Engine — checkout embebido): crea el PaymentIntent que
  // <CheckoutEmbebido> confirma dentro del Shadow Root. Requiere sesión —
  // igual que EXIGIR_REGISTRO ya exige en el servidor, el botón de compra en
  // <ListaPlanes> se gatea con `socia` antes de llegar aquí.
  const crearCheckoutEmbebido = useCallback(async (plan: PlanTarifa) => {
    if (!socia?.socioId) return { ok: false as const, error: 'Inicia sesión para comprar.' };
    return postPublicoWidget(`${baseUrl}/api/public/checkout-embebido`, {
      studioId: datos.studioId, planId: plan.id, socioId: socia.socioId, socioEmail: socia.email,
    }, { studioId: datos.studioId });
  }, [socia, datos.studioId, baseUrl]);

  // Bizum: fuera del Payment Element a propósito (§4 del diseño, redirect
  // avisado) — reutiliza /api/stripe/checkout tal cual, ahora CORS-aware.
  const comprarConBizum = useCallback(async (plan: PlanTarifa) => {
    if (!socia?.socioId) return;
    const r = await postPublicoWidget(`${baseUrl}/api/stripe/checkout`, {
      studioId: datos.studioId, planId: plan.id, socioId: socia.socioId, socioEmail: socia.email, bizum: true,
    }, { studioId: datos.studioId });
    const url = (r.datos as { url?: string } | null)?.url;
    if (r.ok && url) {
      // Igual que Modo A: escapa de cualquier contenedor hacia la ventana de
      // nivel superior real (aquí normalmente ya es `window`, Modo B no suele
      // vivir en un iframe, pero el criterio es el mismo por si acaso).
      (window.top ?? window).location.href = url;
    }
    return r;
  }, [socia, datos.studioId, baseUrl]);

  return {
    slots, cargando, error, socia, usuarioEmail, autenticado, sesionCargando, refrescarSesion,
    studioId: datos.studioId || null,
    politicaPrivacidad: datos.politicaPrivacidad, terminosServicio: datos.terminosServicio,
    sesiones: datos.sesiones, tiposClase: datos.tiposClase, salas: datos.salas, instructores: datos.instructores,
    misReservas: datos.misReservas, suscripciones: datos.suscripciones, planesTarifa: datos.planesTarifa, socio: datos.socio,
    stripeAccountId: datos.stripeAccountId,
    onReservar, onCancelar, onAceptarOferta, onActualizarPerfil, logout, recargar,
    crearCheckoutEmbebido, comprarConBizum,
  };
}
