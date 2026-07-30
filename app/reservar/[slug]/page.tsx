'use client';
import { queImparten } from '@/lib/equipo';

import { useState, useMemo, useEffect, useRef, useId } from 'react';
import { useSearchParams, useParams } from 'next/navigation';
import { useStudio, type ResultadoReserva } from '@/lib/studio-context';
import { textoLegalCompleto } from '@/lib/legal-textos';
import { useSociaSession } from '@/lib/use-socia-session';
import { PlanTarifa, type EstadoReserva, type Reserva } from '@/lib/types';
import { tieneEntitlementActivo, hayAlgoQueContratar } from '@/lib/bono-logic';
import {
  contarReservasActivasFuturas, esCancelacionTardia,
  heredaOverride, puedeReservarPorAntelacionMaxima, puedeReservarPorVentanaMinima,
} from '@/lib/booking-logic';
import { ReservaCalendario, type ReservaSlot } from '@/components/reserva/reserva-calendario';
import { CitasPublica } from '@/components/reserva/citas-publica';
import { PublicSheet } from '@/components/ui/public-sheet';
import { MODO_TOKENS } from '@/lib/portal-modo';
import { TurnstileWidget, turnstileConfigurado } from '@/components/auth/turnstile-widget';
import { horarioPublico, precioPorClase } from '@/lib/estudio-publico';
import { serif, sans, cq, radius as R, shadow as SH, eyebrow, containerRoot } from '@/lib/reservar-publico-tokens';
import {
  Users, CheckCircle2, X, Calendar,
  CreditCard, FileText, Download, ExternalLink, Mail,
} from 'lucide-react';

// ─── Helpers ─────────────────────────────────────────────────────────────────

// Fecha fija usada SOLO en los cálculos previos al montaje (el render real
// muestra un esqueleto). Su valor concreto es irrelevante: existe únicamente
// para no llamar a new Date() durante el SSR y evitar mismatches de hidratación.
const FECHA_PLACEHOLDER_SSR = new Date('2026-01-01T12:00:00');

function pad2(n: number) { return String(n).padStart(2, '0'); }
function localDate(d: Date) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}
function fmtTime(iso: string) {
  const d = new Date(iso); return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}
function fmtLong(d: Date) {
  return d.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' });
}

const NIVEL_LABEL: Record<string, string> = {
  PRINCIPIANTE: 'Principiante', MEDIO: 'Intermedio',
  AVANZADO: 'Avanzado', TODOS: 'Todos los niveles',
};
const NIVEL_COLOR: Record<string, { bg: string; text: string }> = {
  PRINCIPIANTE: { bg: '#D1FAE5', text: '#065F46' },
  MEDIO: { bg: '#FEF3C7', text: '#92400E' },
  AVANZADO: { bg: '#FEE2E2', text: '#B91C1C' },
  TODOS: { bg: '#FFF2F7', text: '#3F5A7A' },
};

// ─── Calendar helpers ─────────────────────────────────────────────────────────

function toCalDate(iso: string): string {
  return iso.replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z').slice(0, 15) + 'Z';
}

type SesionRich = {
  id: string; inicio: string; fin: string; aforoMaximo: number; cancelada: boolean;
  tipoClaseId: string; salaId: string | null; instructorId: string | null;
  tipo?: { nombre: string; color: string; duracionMinutos: number; descripcion?: string | null; nivel?: string };
  sala?: { nombre: string };
  instructor?: { nombre: string };
  ocupadas: number;
};

function makeGoogleCalUrl(s: SesionRich, estudioNombre: string, estudioDireccion: string): string {
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: s.tipo?.nombre ?? 'Clase Pilates',
    dates: `${toCalDate(s.inicio)}/${toCalDate(s.fin)}`,
    details: `Instructora: ${s.instructor?.nombre ?? ''} · Sala: ${s.sala?.nombre ?? ''}`,
    location: `${estudioNombre} · ${estudioDireccion}`,
  });
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

function downloadICS(s: SesionRich, estudioNombre: string, estudioDireccion: string) {
  // UID y DTSTAMP son obligatorios en RFC 5545 (sin ellos Outlook puede rechazar
  // el evento). UID estable por sesión para que re-importar actualice, no duplique.
  const dtstamp = toCalDate(new Date().toISOString());
  const slug = estudioNombre.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'estudio';
  const lines = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', `PRODID:-//${estudioNombre}//Reservas//ES`, 'CALSCALE:GREGORIAN',
    'BEGIN:VEVENT',
    `UID:${s.id}@${slug}`,
    `DTSTAMP:${dtstamp}`,
    `DTSTART:${toCalDate(s.inicio)}`,
    `DTEND:${toCalDate(s.fin)}`,
    `SUMMARY:${s.tipo?.nombre ?? 'Clase Pilates'}`,
    `LOCATION:${estudioNombre}\\, ${estudioDireccion}`,
    `DESCRIPTION:Instructora: ${s.instructor?.nombre ?? ''} · Sala: ${s.sala?.nombre ?? ''}`,
    'STATUS:CONFIRMED',
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n');
  const blob = new Blob([lines], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const nombreArchivo = (s.tipo?.nombre ?? 'clase').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
  a.href = url; a.download = `${nombreArchivo || 'clase'}-${s.inicio.slice(0, 10)}.ics`; a.click();
  URL.revokeObjectURL(url);
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function LevelBadge({ nivel }: { nivel?: string }) {
  if (!nivel || nivel === 'TODOS') return (
    <span className="text-[11px] font-bold px-2.5 py-1 rounded-full shrink-0" style={{ backgroundColor: 'rgba(129,140,248,0.2)', color: '#a5b4fc' }}>
      Todos los niveles
    </span>
  );
  const c = NIVEL_COLOR[nivel] ?? { bg: RT.surface2, text: RT.muted2 };
  // Punto de color en vez de emoji (🟢🟡🔴): coherente con el lenguaje visual
  // del resto del producto, que no usa emojis.
  return (
    <span className="inline-flex items-center gap-1.5 text-[11px] font-bold px-2.5 py-1 rounded-full shrink-0" style={{ backgroundColor: c.bg, color: c.text }}>
      <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: c.text }} />
      {NIVEL_LABEL[nivel] ?? nivel}
    </span>
  );
}

// Mapa de sitios (reformers) para que la socia elija el suyo al reservar (I-12).
// Anónimo: los ocupados se muestran deshabilitados, sin revelar quién los tiene.
function SpotPickerPublico({ spots, takenIds, selected, onSelect, primary }: {
  spots: { id: string; nombre: string; fila: number; columna: number }[];
  takenIds: Set<string>;
  selected: string | null;
  onSelect: (id: string | null) => void;
  primary: string;
}) {
  const filas = [...new Set(spots.map(s => s.fila))].sort((a, b) => a - b);
  const columnas = [...new Set(spots.map(s => s.columna))].sort((a, b) => a - b);
  return (
    <div>
      <div className="rounded-lg py-1.5 text-center text-[9px] font-bold uppercase tracking-widest bg-[var(--portal-surface-2)] text-[var(--portal-muted)] mb-2">
        Parte frontal · Instructora
      </div>
      <div className="grid gap-1.5" style={{ gridTemplateColumns: `repeat(${columnas.length}, minmax(0, 1fr))` }}>
        {filas.map(f => columnas.map(c => {
          const spot = spots.find(s => s.fila === f && s.columna === c);
          if (!spot) return <div key={`${f}-${c}`} />;
          const taken = takenIds.has(spot.id);
          const isSel = selected === spot.id;
          return (
            <button key={spot.id} type="button" disabled={taken}
              onClick={() => onSelect(isSel ? null : spot.id)}
              title={taken ? 'Ocupado' : spot.nombre}
              className="aspect-[3/4] rounded-xl border text-[10px] font-bold flex items-center justify-center transition-all disabled:cursor-not-allowed"
              style={taken
                ? { backgroundColor: RT.surface2, borderColor: RT.line, color: RT.micro }
                : isSel
                ? { backgroundColor: primary, borderColor: primary, color: RT.surface }
                : { backgroundColor: RT.surface, borderColor: 'var(--portal-line)', color: RT.ink }}>
              {spot.nombre}
            </button>
          );
        }))}
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

type Tab = 'clases' | 'citas' | 'misreservas' | 'estudio';
// 'pendiente' (Fase 2a, migr 20260730192445): la clase exige aprobación
// manual — la reserva no queda confirmada ni en lista de espera, se avisa a
// la socia por separado cuando la propietaria decida.
type Step = 'login' | 'registro' | 'contrato' | 'confirm' | 'done' | 'espera' | 'pendiente';

// Criterios de estado (mismos que el portal): qué reservas ocupan plaza y cuáles
// cuentan como reserva activa de la propia socia.
const OCUPA_PLAZA: Reserva['estado'][] = ['CONFIRMADA', 'ASISTIDA'];
const RESERVA_ACTIVA: Reserva['estado'][] = ['CONFIRMADA', 'LISTA_ESPERA'];

// Tema del calendario compartido para el widget PÚBLICO: reutiliza el tema claro
// del portal (MODO_TOKENS.dia), que ya casa con el lenguaje visual de /reservar
// (fondo hueso, tarjetas blancas, marca --portal-brand). Fuera del componente
// para no recrearlo en cada render.
const RESERVAR_TOKENS = MODO_TOKENS.dia;
const RT = RESERVAR_TOKENS;

export default function ReservarPage() {
  const {
    sesiones, reservas, socios, tiposClase, salas, instructores, spots,
    planesTarifa, suscripciones, studioConfig, studio,
    addReserva, updateSocio, cancelarReserva, addSocioFromPortal, planMasElegidoId,
    citasServicios, citasDisponibilidad, citas, reservarCitaPublica, cancelarCita,
  } = useStudio();
  const estudioNombre = studio?.nombre ?? 'Tentare';
  const estudioLogo = studio?.logoUrl ?? null;
  const estudioDireccion = [studio?.ciudad, studio?.direccion].filter(Boolean).join(' · ') || 'Málaga · Calle Larios 12';
  const estudioEmail = studio?.email ?? 'hola@tentare.es';
  const estudioTelefono = studio?.telefono ?? '+34 951 000 000';
  const params = useParams();
  const slug = String(params?.slug ?? '');
  const { socia, usuarioEmail, autenticado, enviarEnlace, logout, refrescar } = useSociaSession(slug);
  const searchParams = useSearchParams();
  const refCode = searchParams.get('ref');

  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const [filtroTipo, setFiltroTipo] = useState('');
  const [tab, setTab] = useState<Tab>('clases');

  // Booking flow
  const [bookingSesionId, setBookingSesionId] = useState<string | null>(null);
  // Anti doble-reserva: handleConfirm es async (alta de walk-in `soc-…` + reserva).
  // `confirmando` da el feedback visual (botón deshabilitado/"Confirmando…");
  // `confirmandoRef` es el cerrojo real — sincrónico, así que cierra la ventana
  // que el estado de React (asíncrono/por lotes) deja abierta ante un doble clic
  // muy rápido, donde ambas pulsaciones podrían leer `confirmando` como false
  // antes de que el primer render se confirme.
  const [confirmando, setConfirmando] = useState(false);
  const confirmandoRef = useRef(false);
  const [loginForm, setLoginForm] = useState({ nombre: '', email: '' });
  const [loginStep, setLoginStep] = useState<Step>('login');
  const [enlaceEnviado, setEnlaceEnviado] = useState(false);
  const [loginError, setLoginError] = useState('');
  const [gateError, setGateError] = useState('');
  const [errorCancelar, setErrorCancelar] = useState<string | null>(null);
  const [cancelandoPlaza, setCancelandoPlaza] = useState(false);
  // Sin NEXT_PUBLIC_TURNSTILE_SITE_KEY configurada, el widget no se pinta y
  // esto nunca bloquea el envío — mismo comportamiento que /login.
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);

  // Aceptación del contrato (clickwrap: checkbox + fecha + versión).
  const [terminosAceptados, setTerminosAceptados] = useState(false);

  // Documento legal a mostrar en modal (texto renderizado por React → escapado;
  // sustituye al document.write con HTML sin escapar, que era un vector XSS).
  const [legalDoc, setLegalDoc] = useState<{ label: string; text: string } | null>(null);

  // Sitio (reformer) elegido por la socia al reservar (I-12). null = sin elegir.
  const [selectedSpot, setSelectedSpot] = useState<string | null>(null);

  // Posición estimada en lista de espera al reservar una clase llena (I-11).
  const [esperaPos, setEsperaPos] = useState<number | null>(null);

  // Confirmación de cancelación de plaza (modal estilizado, sustituye al
  // confirm() nativo — que rompía el diseño y no era traducible).
  const [cancelConfirm, setCancelConfirm] = useState<{ reservaId: string; pierdeBono: boolean; ventana: number } | null>(null);

  // Stripe
  const [stripeLoading, setStripeLoading] = useState<string | null>(null);
  const [stripeError, setStripeError] = useState<string | null>(null);

  // Antes de montar se renderiza el esqueleto, así que este valor no llega a
  // pintarse: solo evita usar new Date() en SSR (divergencia de hidratación).
  const now = mounted ? new Date() : FECHA_PLACEHOLDER_SSR;
  // Marca temporal estable durante la vida del componente: new Date() daría una
  // identidad nueva en cada render y recalcularía `slots` sin necesidad.
  const nowMs = useMemo(() => now.getTime(), [mounted]);

  // Deep-link del enlace mágico: si volvemos con ?sesion=<id> y ya estamos
  // autenticadas, abrimos la reserva de ESA clase (una sola vez) en cuanto sus
  // datos estén cargados. Cierra el bucle de conversión que rompía el magic link.
  const deepLinkHecho = useRef(false);
  useEffect(() => {
    if (!mounted || deepLinkHecho.current) return;
    const sesionDeepLink = searchParams.get('sesion');
    if (!sesionDeepLink || !autenticado) return;
    if (!sesiones.some(s => s.id === sesionDeepLink)) return; // esperar a que carguen
    deepLinkHecho.current = true;
    setTab('clases');
    openBooking(sesionDeepLink);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mounted, autenticado, sesiones, searchParams]);

  // P0-30: se agregan las plazas ocupadas por sesión en UNA pasada y se
  // resuelven tipo/sala/instructora por Map — antes era O(sesiones × reservas)
  // en cada visita (tráfico anónimo, la ruta de mayor impacto en conversión).
  const sesionesRich = useMemo(() => {
    const tiposById = new Map(tiposClase.map(t => [t.id, t]));
    const salasById = new Map(salas.map(x => [x.id, x]));
    const instrById = new Map(instructores.map(i => [i.id, i]));
    const ocupadasPorSesion = new Map<string, number>();
    for (const r of reservas) {
      if (r.estado === 'CANCELADA') continue;
      ocupadasPorSesion.set(r.sesionId, (ocupadasPorSesion.get(r.sesionId) ?? 0) + 1);
    }
    return sesiones.map(s => ({
      ...s,
      tipo: tiposById.get(s.tipoClaseId),
      sala: salasById.get(s.salaId),
      instructor: instrById.get(s.instructorId),
      ocupadas: ocupadasPorSesion.get(s.id) ?? 0,
    }));
  }, [sesiones, tiposClase, salas, instructores, reservas]);

  // ── Vista-modelo para el calendario compartido ──────────────────────────────
  // Se proyectan los datos crudos a ReservaSlot[] EXACTAMENTE como en el portal
  // (app/portal/[slug]/clases): índices en una pasada, respetando aforo/plazas,
  // sitios por sala, la reserva propia de la socia autenticada y el precio cuando
  // no hay cobertura de plan. La lógica de reserva sigue viviendo en useStudio().
  const { ocupadasPorSesion, spotsOcupadosPorSesion, miReservaPorSesion } = useMemo(() => {
    const ocupadas = new Map<string, number>();
    const spotsOcup = new Map<string, string[]>();
    const mia = new Map<string, Reserva>();
    const socioId = socia?.socioId ?? null;
    for (const r of reservas) {
      if (OCUPA_PLAZA.includes(r.estado)) {
        ocupadas.set(r.sesionId, (ocupadas.get(r.sesionId) ?? 0) + 1);
        if (r.spotId) {
          const arr = spotsOcup.get(r.sesionId) ?? [];
          arr.push(r.spotId);
          spotsOcup.set(r.sesionId, arr);
        }
      }
      if (socioId && r.socioId === socioId && RESERVA_ACTIVA.includes(r.estado)) {
        mia.set(r.sesionId, r);
      }
    }
    return { ocupadasPorSesion: ocupadas, spotsOcupadosPorSesion: spotsOcup, miReservaPorSesion: mia };
  }, [reservas, socia]);

  const spotsActivosPorSala = useMemo(() => {
    const m = new Map<string, typeof spots>();
    for (const sp of spots) {
      if (!sp.activo) continue;
      const arr = m.get(sp.salaId) ?? [];
      arr.push(sp);
      m.set(sp.salaId, arr);
    }
    return m;
  }, [spots]);

  // Cobertura de plan/bono de la socia autenticada → precio a mostrar en el CTA
  // (informativo; el gate real se aplica en handleConfirm y en el servidor).
  const precioClaseSuelta = planesTarifa.find(p => p.tipo === 'PUNTUAL' && p.activo)?.precio ?? null;
  // Cobertura de la clase que se está mirando: con bonos acotados, "incluida en
  // tu bono" depende del tipo, no solo de que le queden sesiones.
  const tipoClaseAbierta = sesiones.find(x => x.id === bookingSesionId)?.tipoClaseId ?? null;
  const cubierta = socia?.socioId
    ? tieneEntitlementActivo(socia.socioId, suscripciones, planesTarifa, localDate(now), tipoClaseAbierta)
    : false;

  // P2-8: ventana de cancelación por tipo de clase, solo para los que tienen
  // override propio — el resto hereda la del estudio (ver ReservaCalendario).
  const ventanaPorTipo = useMemo(() => {
    const m: Record<string, number> = {};
    for (const tc of tiposClase) if (tc.ventanaCancelacionHoras != null) m[tc.id] = tc.ventanaCancelacionHoras;
    return m;
  }, [tiposClase]);

  // Horario real deducido de las clases (lib/estudio-publico.ts) para la
  // pestaña "El estudio" — nunca un texto fijo que mienta en cuanto cambie el
  // calendario.
  // OJO con la ventana: el cargador público trae TODAS las sesiones del estudio
  // (sin límite de fecha), y el docstring de `horarioPublico` avisa de que una
  // clase suelta de hace un año a las 6:30 ensancharía el horario para siempre.
  // Se mira de hoy en adelante, que es lo que la clienta puede reservar.
  const franjasHorario = useMemo(() => {
    const desde = new Date(); desde.setHours(0, 0, 0, 0);
    const hasta = new Date(desde); hasta.setDate(hasta.getDate() + 8 * 7);
    return horarioPublico(sesiones.filter(s => {
      const t = new Date(s.inicio).getTime();
      return t >= desde.getTime() && t <= hasta.getTime();
    }));
  }, [sesiones]);

  // Bono «EL MÁS ELEGIDO» (pestaña El estudio). Lo calcula el SERVIDOR sobre
  // las suscripciones del estudio entero: aquí `suscripciones` son solo las de
  // la socia identificada (y ninguna si no lo está), así que calcularlo en el
  // navegador le enseñaba su PROPIA compra repetida como prueba social — y a
  // una visitante anónima, que es a quien va dirigido, no le salía nunca.
  const planDestacadoId = planMasElegidoId;

  const slots = useMemo<ReservaSlot[]>(() => {
    return sesionesRich
      .filter(s => !s.cancelada && new Date(s.inicio).getTime() > nowMs)
      .filter(s => !filtroTipo || s.tipoClaseId === filtroTipo)
      .map(s => {
        const mia = miReservaPorSesion.get(s.id) ?? null;
        return {
          id: s.id,
          inicio: s.inicio,
          fin: s.fin,
          tipoClaseId: s.tipoClaseId,
          claseNombre: s.tipo?.nombre ?? 'Clase',
          claseColor: s.tipo?.color ?? 'var(--portal-brand)',
          claseFotoUrl: s.tipo?.fotoUrl ?? null,
          nivel: s.tipo?.nivel ?? 'TODOS',
          descripcion: s.tipo?.descripcion ?? null,
          instructorNombre: s.instructor?.nombre ?? null,
          instructorColor: s.instructor?.color ?? null,
          instructorRol: s.instructor?.rol ?? null,
          instructorFotoUrl: s.instructor?.fotoUrl ?? null,
          salaNombre: s.sala?.nombre ?? null,
          aforoMaximo: s.aforoMaximo,
          ocupadas: ocupadasPorSesion.get(s.id) ?? 0,
          spots: s.salaId ? (spotsActivosPorSala.get(s.salaId) ?? []) : [],
          spotsOcupados: spotsOcupadosPorSesion.get(s.id) ?? [],
          miReservaId: mia?.id ?? null,
          miEstado: mia ? (mia.estado as 'CONFIRMADA' | 'LISTA_ESPERA') : null,
          precio: cubierta ? null : precioClaseSuelta,
        } satisfies ReservaSlot;
      });
  }, [sesionesRich, nowMs, filtroTipo, miReservaPorSesion, ocupadasPorSesion, spotsActivosPorSala, spotsOcupadosPorSesion, cubierta, precioClaseSuelta]);

  const misReservas = useMemo(() => {
    if (!socia?.socioId) return [];
    return reservas
      .filter(r => r.socioId === socia.socioId && r.estado !== 'CANCELADA')
      .map(r => ({ ...r, sesion: sesionesRich.find(s => s.id === r.sesionId) }))
      .filter(r => r.sesion)
      .sort((a, b) => (a.sesion!.inicio ?? '').localeCompare(b.sesion!.inicio ?? ''));
  }, [reservas, socia, sesionesRich]);

  // Citas 1:1 de la socia (para "mis próximas citas" en la pestaña Citas).
  const misCitas = useMemo(() => {
    if (!socia?.socioId) return [];
    const servById = new Map(citasServicios.map(s => [s.id, s]));
    const instrById = new Map(instructores.map(i => [i.id, i]));
    return citas
      .filter(c => c.socioId === socia.socioId)
      .map(c => ({
        id: c.id,
        servicioNombre: (c.servicioId ? servById.get(c.servicioId)?.nombre : null) ?? 'Cita',
        instructorNombre: (c.instructorId ? instrById.get(c.instructorId)?.nombre : null) ?? '',
        inicio: c.inicio, fin: c.fin, estado: c.estado,
      }));
  }, [citas, citasServicios, instructores, socia]);

  // Gate de derechos (C-4): mismo criterio que el servidor, para avisar antes de
  // intentar la reserva. El servidor es la autoridad; esto es solo UX.
  function evaluarGate(socioId?: string, tipoClaseId?: string | null, inicioISO?: string): string | null {
    if (!studio) return null;
    // Fase 1 de reglas por tipo de clase: cada regla puede sobrescribirse en el
    // tipo de clase (NULL = hereda el default del estudio). Mismo criterio que
    // el servidor (crearReservaPublica), aquí solo para avisar antes del click.
    const tipo = tipoClaseId ? tiposClase.find(t => t.id === tipoClaseId) : undefined;
    if (inicioISO) {
      const ventanaMinima = heredaOverride(tipo?.reservaVentanaMinimaMinutos, studio.reservaVentanaMinimaMinutos);
      if (!puedeReservarPorVentanaMinima(inicioISO, now, ventanaMinima)) {
        return 'Ya no se puede reservar esta clase: hace falta reservar con más antelación.';
      }
      const antelacionMaxima = heredaOverride(tipo?.reservaAntelacionMaximaDias, studio.reservaAntelacionMaximaDias);
      if (!puedeReservarPorAntelacionMaxima(inicioISO, now, antelacionMaxima)) {
        return 'Todavía no se puede reservar esta clase.';
      }
    }
    const exigirPlan = heredaOverride(tipo?.reservaExigirPlan, studio.reservaExigirPlan);
    // Mismo criterio que el servidor: exigir plan cuando no hay ninguno a la
    // venta solo bloquea (ver `hayAlgoQueContratar`).
    if (exigirPlan && hayAlgoQueContratar(planesTarifa)) {
      const ok = socioId
        ? tieneEntitlementActivo(socioId, suscripciones, planesTarifa, localDate(now), tipoClaseId)
        : false;
      if (!ok) {
        // Se distingue "no tienes bono" de "tu bono no cubre esta clase": con el
        // mensaje genérico, quien tiene 8 sesiones de Reformer no entendería por
        // qué no puede apuntarse a Mat.
        const tieneAlguno = socioId
          ? tieneEntitlementActivo(socioId, suscripciones, planesTarifa, localDate(now))
          : false;
        return tieneAlguno
          ? 'Tu bono no incluye este tipo de clase. Puedes reservarla pagando la clase suelta.'
          : 'Necesitas un plan o bono activo para reservar. Contrata uno en la pestaña "El estudio".';
      }
    }
    if (studio.reservaMaxSimultaneas != null && socioId) {
      const n = contarReservasActivasFuturas(socioId, reservas, sesiones, now);
      if (n >= studio.reservaMaxSimultaneas) {
        return `Has alcanzado el máximo de ${studio.reservaMaxSimultaneas} reservas activas. Cancela una para reservar otra.`;
      }
    }
    return null;
  }

  function openBooking(sesionId: string) {
    setBookingSesionId(sesionId);
    setTerminosAceptados(false);
    setEnlaceEnviado(false);
    setLoginError('');
    setGateError('');
    setSelectedSpot(null);
    if (!autenticado) {
      setLoginStep('login');
    } else if (socia) {
      const found = socios.find(s => s.id === socia.socioId);
      const needsContract = !found?.aceptacionContrato;
      setLoginStep(needsContract ? 'contrato' : 'confirm');
    } else {
      // Autenticada por magic link pero aún sin ficha (walk-in): pedir nombre.
      setLoginStep('registro');
    }
  }

  function closeBooking() { setBookingSesionId(null); setLoginStep('login'); setTerminosAceptados(false); setEnlaceEnviado(false); }

  // Magic link: envía el enlace de acceso al email (ya no mete dentro con solo
  // nombre+email). La socia entra al pulsar el enlace del correo.
  async function handleEnviarEnlace() {
    if (!loginForm.email.trim()) return;
    setLoginError('');
    // Propaga la clase elegida al enlace mágico (si la hay) para volver directa
    // a su confirmación — evita la fuga de conversión de re-buscar la clase.
    const r = await enviarEnlace(loginForm.email, bookingSesionId || undefined, captchaToken ?? undefined);
    if ('error' in r) { setLoginError(r.error); return; }
    setEnlaceEnviado(true);
  }

  // Walk-in ya autenticado: solo falta el nombre antes de firmar el contrato.
  function handleRegistroNombre() {
    if (!loginForm.nombre.trim()) return;
    setLoginStep('contrato');
  }

  function handleSignContract() {
    if (socia?.socioId) {
      updateSocio(socia.socioId, {
        aceptacionContrato: {
          fecha: new Date().toISOString(),
          firma: socia.nombre,
          // El texto completo que se aceptó, igual que hace el panel. Antes se
          // guardaba 'v1.1' fijo, que no correspondía a ningún versionado real:
          // si el estudio editaba sus textos, no había forma de saber qué había
          // aceptado cada clienta.
          versionTexto: textoLegalCompleto(studioConfig),
          origen: 'PORTAL',
        },
      });
    }
    setLoginStep('confirm');
  }

  async function handleConfirm() {
    // `confirmando` (estado) + `confirmandoRef` (sincrónico): ver comentario
    // en su declaración. Cualquiera de los dos ya en marcha aborta.
    if (!bookingSesionId || confirmando || confirmandoRef.current) return;
    const sesion = sesionesRich.find(s => s.id === bookingSesionId);
    if (!sesion) return;

    // Gate de derechos (C-4) antes de crear nada: si no cumple, avisa y no da de
    // alta a la walk-in ni reserva. El servidor lo revalida igualmente.
    const gate = evaluarGate(socia?.socioId, sesion.tipoClaseId, sesion.inicio);
    if (gate) { setGateError(gate); return; }

    setGateError('');
    confirmandoRef.current = true;
    setConfirmando(true);
    try {
      let socioIdParaReserva = socia?.socioId ?? '';
      if (!socia) {
        // Walk-in: alta de la ficha. El servidor la vincula a su auth_user_id a
        // partir del JWT (magic link) y usa el email del token; el nombre lo puso
        // en el paso "registro". Se AWAITea para que la reserva la encuentre.
        const nuevoId = `soc-${Date.now()}`;
        const referidoValido = refCode && refCode !== nuevoId && socios.some(s => s.id === refCode) ? refCode : null;
        const altaRes = await addSocioFromPortal({
          id: nuevoId,
          nombre: loginForm.nombre.trim(),
          email: usuarioEmail ?? '',
          aceptacionContrato: {
            fecha: new Date().toISOString(),
            firma: loginForm.nombre.trim(),
            versionTexto: textoLegalCompleto(studioConfig),
            origen: 'PORTAL',
          },
          referidoPor: referidoValido,
        });
        // Antes este resultado se descartaba: un rechazo del servidor (tope de
        // plan, red, timeout) se trataba como éxito silencioso y el flujo se
        // quedaba colgado con el botón inerte, sin ficha ni aviso alguno.
        if (!altaRes.ok) { setGateError(altaRes.error); return; }
        await refrescar(); // re-resuelve la socia recién creada (por auth_user_id)
        socioIdParaReserva = nuevoId;
      }

      // El id de la socia lo deriva el servidor del JWT; el que pasamos aquí solo
      // alimenta la actualización optimista de la UI. El estado (confirmada/espera)
      // lo decide addReserva según el aforo del momento. El sitio elegido (I-12)
      // solo se asigna si la reserva queda confirmada (lo valida el servidor).
      const r = await addReserva(bookingSesionId, socioIdParaReserva, selectedSpot);
      // Si el servidor la rechaza (sin bono, clase empezada, tope de reservas…) se
      // dice, y el paso se queda donde estaba. Antes se saltaba a «done» siempre y
      // la clienta se iba convencida de tener plaza.
      if (!r.ok) { setGateError(r.error); return; }
      if (r.estado === 'LISTA_ESPERA') {
        // Posición estimada: nº de personas ya en espera + 1 (I-11).
        const enEspera = reservas.filter(x => x.sesionId === bookingSesionId && x.estado === 'LISTA_ESPERA').length;
        setEsperaPos(enEspera + 1);
      }
      setLoginStep(r.estado === 'LISTA_ESPERA' ? 'espera' : r.estado === 'PENDIENTE_APROBACION' ? 'pendiente' : 'done');
    } finally {
      confirmandoRef.current = false;
      setConfirmando(false);
    }
  }

  // ── Reserva desde el calendario compartido ─────────────────────────────────
  // Requisito CLAVE del widget PÚBLICO: no romper el step-machine de acceso.
  //  · Socia lista (autenticada, con ficha, contrato firmado y gate OK) → reserva
  //    DIRECTA vía addReserva y devuelve el estado, para que la hoja del propio
  //    calendario muestre confirmación / lista de espera in situ.
  //  · Cualquier otro caso (sin login, walk-in sin ficha, contrato pendiente o
  //    gate no cumplido) → abre el modal de pasos EXISTENTE con openBooking()
  //    (login / registro / contrato / confirm), sin tocar su lógica. El sitio
  //    elegido en la hoja se propaga a ese flujo (openBooking lo resetea primero,
  //    por eso se fija después).
  function handleReservarCalendario(slot: ReservaSlot, spotId: string | null): ResultadoReserva | void | Promise<ResultadoReserva | void> {
    if (!autenticado || !socia) {
      openBooking(slot.id);
      if (spotId) setSelectedSpot(spotId);
      return;
    }
    const found = socios.find(s => s.id === socia.socioId);
    const needsContract = !found?.aceptacionContrato;
    const sesionDelSlot = sesiones.find(x => x.id === slot.id);
    if (needsContract || evaluarGate(socia.socioId, sesionDelSlot?.tipoClaseId, sesionDelSlot?.inicio)) {
      openBooking(slot.id);
      if (spotId) setSelectedSpot(spotId);
      return;
    }
    return addReserva(slot.id, socia.socioId, spotId);
  }

  async function handleContratarPlan(plan: PlanTarifa) {
    setStripeError(null);
    setStripeLoading(plan.id);
    try {
      const res = await fetch('/api/stripe/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // El importe/concepto NO se envían: los deriva el servidor del plan en
        // la BD (validando que sea de este estudio y esté activo). Ver
        // app/api/stripe/checkout/route.ts.
        body: JSON.stringify({
          studioId: studio?.id,
          planId: plan.id,
          socioId: socia?.socioId ?? null,
          socioEmail: socia?.email ?? null,
          socioNombre: socia?.nombre ?? 'Socia',
        }),
      });
      const data = await res.json() as { url?: string; error?: string };
      if (data.url) {
        window.location.href = data.url;
      } else {
        setStripeError(data.error ?? 'Error al procesar el pago');
      }
    } catch {
      setStripeError('Error de conexión. Inténtalo de nuevo.');
    } finally {
      setStripeLoading(null);
    }
  }

  // Antes de montar (SSR / primer paint) mostramos un esqueleto de marca en vez
  // de una pantalla en blanco (I-9): el estudio y su nombre ya se conocen del
  // servidor, así que el header se pinta al instante.
  if (!mounted) {
    return (
      <div className="min-h-screen bg-[var(--portal-bg)]">
        <header className="sticky top-0 z-30 bg-white border-b border-[var(--portal-surface-2)]" style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
          <div className="max-w-2xl mx-auto px-4">
            <div className="flex items-center gap-3 py-3">
              <div className="w-9 h-9 rounded-xl bg-[var(--portal-line)] shrink-0" />
              <div className="space-y-1.5">
                <div className="h-3 w-28 rounded bg-[var(--portal-line)]" />
                <div className="h-2.5 w-40 rounded bg-[var(--portal-surface-2)]" />
              </div>
            </div>
          </div>
        </header>
        <div className="max-w-2xl mx-auto px-4 py-16 flex flex-col items-center gap-3 text-center">
          <span className="w-6 h-6 border-2 border-[var(--portal-line)] border-t-[var(--portal-ink)] rounded-full animate-spin" />
          <p className="text-[var(--portal-muted-2)] text-sm">Cargando horario…</p>
        </div>
      </div>
    );
  }

  const bookingSesion = bookingSesionId ? sesionesRich.find(s => s.id === bookingSesionId) : null;

  // Marca del estudio (white-label): inyectada como CSS var por <ThemeStyle>
  // server-side. PRIMARY_FG es el texto sobre la marca, autoderivado por
  // contraste (garantiza legibilidad también con marcas claras).
  const PRIMARY = 'var(--portal-brand)';
  const PRIMARY_FG = 'var(--portal-brand-foreground)';

  const tabs = [['clases', 'Clases'], ['citas', 'Citas'], ['misreservas', 'Mis reservas'], ['estudio', 'El estudio']] as const;

  return (
    <div style={{ ...containerRoot, width: '100%', minHeight: '100vh', background: 'var(--portal-bg)', color: 'var(--portal-ink)', fontFamily: sans, overflow: 'hidden' }}>

      {/* ── HERO ──────────────────────────────────────────────────────────────
          El mockup pinta una fotografía grande de estudio detrás del titular.
          El dato no existe hoy en la carga pública (`studioPublico()` no expone
          `fotoUrl` — solo `logoUrl`), así que en vez de inventar una imagen se
          usa el mismo degradado de fondo que ya usa el portal privado para su
          hero (lib/portal-modo.tsx → MODO_TOKENS.dia.hero), coherente con el
          resto del producto en vez de un valor nuevo sin respaldo. */}
      <div style={{ position: 'relative', overflow: 'hidden', background: RT.hero }}>
        <div style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', rowGap: 14, padding: `${cq(20, 2.4, 30)} ${cq(20, 3.8, 48)}` }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 14, minWidth: 0 }}>
            {estudioLogo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={estudioLogo} alt={estudioNombre} style={{ width: 30, height: 30, borderRadius: 9, objectFit: 'contain', background: '#fff', flexShrink: 0 }} />
            ) : null}
            <span style={{ fontFamily: serif, fontSize: cq(20, 2, 25), lineHeight: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{estudioNombre}</span>
            {studio?.ciudad && (
              <>
                <span style={{ width: 20, height: 1, background: 'rgba(34,38,31,.3)', flexShrink: 0 }} />
                <span style={{ ...eyebrow(9), color: 'var(--portal-accent)', whiteSpace: 'nowrap' }}>{studio.ciudad.toUpperCase()}</span>
              </>
            )}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: cq(14, 2, 26) }}>
            <span style={{ fontSize: 12, color: 'var(--portal-accent)', whiteSpace: 'nowrap' }}>{estudioTelefono}</span>
            {socia ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, height: 46, padding: '0 8px 0 8px', borderRadius: 23, background: 'var(--portal-surface)', border: '1px solid var(--portal-line)' }}>
                <div style={{ width: 24, height: 24, borderRadius: 999, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, flexShrink: 0, background: PRIMARY, color: PRIMARY_FG }}>
                  {socia.nombre[0]}
                </div>
                <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--portal-ink)', whiteSpace: 'nowrap' }}>{socia.nombre.split(' ')[0]}</span>
                <button onClick={logout} aria-label="Cerrar sesión" style={{ color: 'var(--portal-muted)', display: 'flex', marginLeft: 2 }}><X size={12} /></button>
              </div>
            ) : (
              <button
                onClick={() => { setBookingSesionId(''); setLoginStep('login'); openBooking(''); }}
                style={{
                  height: 46, padding: `0 ${cq(18, 2, 26)}`, borderRadius: 23, background: PRIMARY, color: PRIMARY_FG,
                  display: 'flex', alignItems: 'center', fontSize: 13, fontWeight: 500, whiteSpace: 'nowrap',
                  boxShadow: SH.headerBtn, border: 'none', cursor: 'pointer',
                }}>
                Acceder
              </button>
            )}
          </div>
        </div>

        <div style={{ position: 'relative', padding: `${cq(34, 5, 70)} ${cq(20, 3.8, 48)} 0`, textAlign: 'center' }}>
          <div style={eyebrow(9)}>RESERVA TU CLASE</div>
          <h1 style={{ fontFamily: serif, fontSize: cq(38, 6, 76), lineHeight: 1, marginTop: cq(14, 1.8, 22) }}>{estudioNombre}</h1>
          {studio?.descripcion && (
            <p style={{ fontFamily: serif, fontStyle: 'italic', fontSize: cq(16, 1.7, 22), color: 'var(--portal-muted)', marginTop: 16, maxWidth: 620, marginInline: 'auto' }}>
              {studio.descripcion}
            </p>
          )}
        </div>

        {/* ── TABS ─────────────────────────────────────────────────────────── */}
        <div style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: cq(18, 3.4, 42), borderBottom: '1px solid rgba(34,38,31,.12)', marginTop: cq(28, 3.6, 46), overflowX: 'auto', padding: `0 ${cq(20, 3.8, 48)}` }}>
          {tabs.map(([t, label]) => (
            <button key={t} onClick={() => setTab(t)}
              style={{
                flex: '0 0 auto', padding: '0 2px 16px', marginBottom: -1, background: 'none', border: 'none', cursor: 'pointer',
                borderBottom: tab === t ? '1.5px solid var(--portal-ink)' : '1.5px solid transparent',
                fontFamily: serif, fontSize: cq(19, 2.1, 27), color: tab === t ? 'var(--portal-ink)' : 'var(--portal-muted)',
                whiteSpace: 'nowrap', transition: 'color .35s ease',
              }}>
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* ── CONTENT ─────────────────────────────────────────────────────────── */}
      <div style={{ padding: `0 ${cq(20, 3.8, 48)}`, maxWidth: 1280, marginInline: 'auto' }}>

        {/* ── TAB: CLASES ─────────────────────────────────────────────────── */}
        {tab === 'clases' && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: cq(24, 4, 56), alignItems: 'flex-start', padding: `${cq(28, 3.4, 44)} 0 ${cq(50, 7, 90)}` }}>
            <div style={{ flex: '1 1 480px', minWidth: 0 }}>

              {/* Filtros por tipo de clase (se aplican a los slots del calendario) */}
              <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 4 }}>
                {['', ...tiposClase.map(t => t.id)].map(id => {
                  const tipo = tiposClase.find(t => t.id === id);
                  const active = filtroTipo === id;
                  return (
                    <button key={id || 'all'} onClick={() => setFiltroTipo(id)}
                      style={{
                        flex: '0 0 auto', height: 38, padding: '0 18px', borderRadius: R.pill,
                        display: 'flex', alignItems: 'center', gap: 9, fontSize: 12, fontWeight: 500, cursor: 'pointer',
                        whiteSpace: 'nowrap', transition: 'background .3s ease, color .3s ease',
                        border: active ? '1px solid transparent' : '1px solid var(--portal-line)',
                        background: active ? (tipo?.color ?? PRIMARY) : 'rgba(255,255,255,.7)',
                        color: active ? (tipo?.color ? '#fff' : PRIMARY_FG) : 'var(--portal-muted-2)',
                      }}>
                      {tipo && <span style={{ width: 6, height: 6, borderRadius: 999, background: active ? 'rgba(255,255,255,0.8)' : tipo.color }} />}
                      {tipo ? tipo.nombre : 'Todas'}
                    </button>
                  );
                })}
              </div>

              {/* Calendario de reservas — componente compartido (estilo Acuity), el
                  mismo que usa el portal de socias, re-vestido con el lenguaje
                  visual de esta pantalla (ver reserva-calendario.tsx). La reserva
                  se enruta por handleReservarCalendario, que respeta el
                  step-machine de acceso. */}
              <div style={{ marginTop: 24 }}>
                <ReservaCalendario
                  t={RESERVAR_TOKENS}
                  slots={slots}
                  variant="calendario"
                  onReservar={handleReservarCalendario}
                  onCancelar={cancelarReserva}
                  cancelacionVentanaHoras={studio?.cancelacionVentanaHoras}
                  ventanaPorTipo={ventanaPorTipo}
                  vacio={{ titulo: 'Sin clases disponibles', cuerpo: 'Prueba con otra semana o cambia el filtro' }}
                />
              </div>
            </div>

            {/* Columna lateral: explicación del flujo (copy fijo, sin datos que
                puedan quedar desactualizados). */}
            <div style={{ flex: '0 1 320px' }}>
              <div style={{ borderRadius: R.hero, background: 'rgba(255,255,255,.55)', border: '1px solid var(--portal-line)', padding: '26px 28px' }}>
                <div style={eyebrow(9)}>CÓMO FUNCIONA</div>
                {[
                  'Elige el día y la clase.',
                  'Reserva tu plaza en la sala.',
                  studio?.cancelacionVentanaHoras
                    ? `Cancela gratis hasta ${studio.cancelacionVentanaHoras}h antes.`
                    : 'Cancela gratis cuando quieras.',
                ].map((paso, i) => (
                  <div key={i} style={{ display: 'flex', gap: 14, marginTop: i === 0 ? 18 : 12 }}>
                    <span style={{ fontFamily: serif, fontSize: 18, color: 'var(--portal-accent)', lineHeight: 1.2 }}>{i + 1}</span>
                    <span style={{ fontSize: 12, color: 'var(--portal-muted-2)', lineHeight: 1.5 }}>{paso}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ── TAB: CITAS 1:1 ──────────────────────────────────────────────── */}
        {tab === 'citas' && (
          <div style={{ padding: `${cq(28, 3.4, 44)} 0 ${cq(50, 7, 90)}` }}>
            <div style={eyebrow(9)}>UNO A UNO</div>
            <h2 style={{ fontFamily: serif, fontSize: cq(30, 3.6, 44), lineHeight: 1, marginTop: 12 }}>Citas privadas</h2>
            <div style={{ marginTop: 24 }}>
              <CitasPublica
                studioId={studio?.id ?? ''}
                servicios={citasServicios}
                instructores={instructores}
                disponibilidad={citasDisponibilidad}
                misCitas={misCitas}
                autenticada={!!socia}
                onNeedLogin={() => { setBookingSesionId(''); setLoginStep('login'); }}
                onReservar={(servicioId, instructorId, inicioISO) => reservarCitaPublica({ servicioId, instructorId, inicioISO })}
                onCancelar={cancelarCita}
                primary={PRIMARY}
                primaryFg={PRIMARY_FG}
              />
            </div>
          </div>
        )}

        {/* ── TAB: MIS RESERVAS ───────────────────────────────────────────── */}
        {tab === 'misreservas' && (
          <div style={{ padding: `${cq(28, 3.4, 44)} 0 ${cq(50, 7, 90)}` }}>
            <div style={eyebrow(9)}>{socia ? `${misReservas.length} RESERVA${misReservas.length === 1 ? '' : 'S'}` : 'MIS RESERVAS'}</div>
            <h2 style={{ fontFamily: serif, fontSize: cq(30, 3.6, 44), lineHeight: 1, marginTop: 12 }}>Mis reservas</h2>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 26 }}>
              {!socia ? (
                <div style={{ borderRadius: R.card, background: 'var(--portal-surface)', display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '56px 24px', gap: 16, textAlign: 'center', boxShadow: SH.card }}>
                  <div style={{ width: 56, height: 56, borderRadius: 999, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--portal-surface-2)' }}>
                    <Users size={24} style={{ color: PRIMARY }} />
                  </div>
                  <div>
                    <h3 style={{ fontFamily: serif, fontSize: 21, color: 'var(--portal-ink)' }}>Identifícate para ver tus reservas</h3>
                    <p style={{ fontSize: 12.5, color: 'var(--portal-muted-2)', marginTop: 6 }}>Te enviamos un enlace de acceso a tu email. Sin contraseñas.</p>
                  </div>
                  <button onClick={() => { setBookingSesionId(''); setLoginStep('login'); }}
                    style={{ height: 48, padding: '0 26px', borderRadius: R.pillBtnSm, background: PRIMARY, color: PRIMARY_FG, border: 'none', fontSize: 13, fontWeight: 500, cursor: 'pointer' }}>
                    Acceder
                  </button>
                </div>
              ) : misReservas.length === 0 ? (
                <div style={{ borderRadius: R.card, background: 'var(--portal-surface)', display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '56px 24px', gap: 12, textAlign: 'center', boxShadow: SH.card }}>
                  <Calendar size={28} style={{ color: 'var(--portal-micro)' }} />
                  <p style={{ fontSize: 14, fontWeight: 500, color: 'var(--portal-muted-2)' }}>No tienes reservas todavía</p>
                  <button onClick={() => setTab('clases')} style={{ fontSize: 13, fontWeight: 600, color: PRIMARY, background: 'none', border: 'none', cursor: 'pointer' }}>
                    Explorar clases →
                  </button>
                </div>
              ) : (
                misReservas.map(r => {
                  const s = r.sesion!;
                  const isPast = new Date(s.fin) < now;
                  const isFuture = !isPast && r.estado !== 'ASISTIDA';
                  const fechaLarga = new Date(s.inicio).toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' });
                  const estadoBg = r.estado === 'ASISTIDA' ? '#D1FAE5'
                    : r.estado === 'LISTA_ESPERA' ? '#FEF3C7'
                    : isPast ? RT.surface2 : 'rgba(255,255,255,.7)';
                  const estadoColor = r.estado === 'ASISTIDA' ? '#065F46'
                    : r.estado === 'LISTA_ESPERA' ? '#92400E'
                    : isPast ? RT.muted : PRIMARY;
                  return (
                    <div key={r.id} style={{
                      borderRadius: R.card, background: isPast ? 'rgba(255,255,255,.5)' : 'var(--portal-surface)',
                      padding: `${cq(20, 2.2, 26)} ${cq(20, 2.6, 30)}`, display: 'flex', alignItems: 'center', flexWrap: 'wrap',
                      gap: cq(12, 1.8, 24), boxShadow: isPast ? undefined : SH.card, opacity: isPast ? 0.75 : 1,
                    }}>
                      <div style={{ flex: '0 0 auto' }}>
                        <div style={{ ...eyebrow(9), color: isFuture ? 'var(--portal-accent)' : 'var(--portal-muted)' }}>
                          {r.estado === 'ASISTIDA' ? 'ASISTIDA' : r.estado === 'LISTA_ESPERA' ? 'EN ESPERA' : isPast ? 'FINALIZADA' : 'CONFIRMADA'}
                        </div>
                        <div style={{ fontFamily: serif, fontSize: cq(24, 2.4, 30), lineHeight: 1, marginTop: 8 }}>{fmtTime(s.inicio)}</div>
                      </div>
                      <div style={{ flex: '1 1 150px', minWidth: 0 }}>
                        <div style={{ fontFamily: serif, fontSize: cq(21, 2.2, 27), lineHeight: 1.05 }}>{s.tipo?.nombre}</div>
                        <div style={{ fontSize: 11.5, color: 'var(--portal-muted-2)', marginTop: 8 }}>
                          <span style={{ textTransform: 'capitalize' }}>{fechaLarga}</span>
                          {s.sala ? ` · ${s.sala.nombre}` : ''}{s.instructor ? ` · ${s.instructor.nombre}` : ''}
                        </div>
                      </div>
                      <span style={{ flex: '0 0 auto', fontSize: 11, fontWeight: 700, padding: '5px 12px', borderRadius: R.pill, background: estadoBg, color: estadoColor }}>
                        {r.estado === 'ASISTIDA' ? 'Asistida' : r.estado === 'LISTA_ESPERA' ? (r.posicionEspera ? `En espera · nº ${r.posicionEspera}` : 'En espera') : isPast ? 'Finalizada' : 'Confirmada'}
                      </span>
                      {isFuture && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: '0 0 auto' }}>
                          <a href={makeGoogleCalUrl(s, estudioNombre, estudioDireccion)} target="_blank" rel="noopener noreferrer"
                            aria-label="Añadir al calendario"
                            style={{ width: 38, height: 38, borderRadius: 999, border: '1px solid var(--portal-line)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--portal-ink)' }}>
                            <Calendar size={14} />
                          </a>
                          <button onClick={() => downloadICS(s, estudioNombre, estudioDireccion)}
                            aria-label="Descargar .ics"
                            style={{ width: 38, height: 38, borderRadius: 999, border: '1px solid var(--portal-line)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--portal-ink)', background: 'none', cursor: 'pointer' }}>
                            <Download size={14} />
                          </button>
                          <button onClick={() => {
                            // Aviso de cancelación tardía (C-2): si está dentro de la
                            // ventana y el estudio no devuelve bono, el modal lo advierte.
                            const ventana = s.tipo?.ventanaCancelacionHoras ?? studio?.cancelacionVentanaHoras ?? 0;
                            const tardia = r.estado === 'CONFIRMADA' && esCancelacionTardia(s.inicio, now, ventana);
                            const pierdeBono = tardia && !(studio?.cancelacionDevolverBonoTardia ?? false);
                            setCancelConfirm({ reservaId: r.id, pierdeBono, ventana });
                          }}
                            style={{ fontSize: 11.5, color: 'var(--portal-muted)', background: 'none', border: 'none', cursor: 'pointer', whiteSpace: 'nowrap', minHeight: 44, padding: '0 4px' }}>
                            Cancelar
                          </button>
                        </div>
                      )}
                      {s.tipo?.nivel && <LevelBadge nivel={s.tipo.nivel} />}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}

        {/* ── TAB: EL ESTUDIO ─────────────────────────────────────────────── */}
        {tab === 'estudio' && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: cq(24, 4, 56), alignItems: 'flex-start', padding: `${cq(28, 3.4, 44)} 0 ${cq(50, 7, 90)}` }}>
            <div style={{ flex: '1 1 480px', minWidth: 0 }}>
              <div style={eyebrow(9)}>{studio?.ciudad ? studio.ciudad.toUpperCase() : 'EL ESTUDIO'}{studio?.anioFundacion ? ` · DESDE ${studio.anioFundacion}` : ''}</div>
              <h2 style={{ fontFamily: serif, fontSize: cq(30, 3.6, 44), lineHeight: 1, marginTop: 12 }}>El estudio</h2>
              {studio?.descripcion && (
                <p style={{ fontSize: 13, color: 'var(--portal-accent)', marginTop: 16, maxWidth: 520, lineHeight: 1.65 }}>{studio.descripcion}</p>
              )}

              <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 18, marginTop: 22 }}>
                <span style={{ fontSize: 12, color: 'var(--portal-ink)' }}>{estudioDireccion}</span>
                <span style={{ width: 1, height: 12, background: 'var(--portal-line)' }} />
                <span style={{ fontSize: 12, color: 'var(--portal-ink)' }}>{estudioEmail}</span>
                <span style={{ width: 1, height: 12, background: 'var(--portal-line)' }} />
                <span style={{ fontSize: 12, color: 'var(--portal-ink)' }}>{estudioTelefono}</span>
              </div>

              {/* Plans + Stripe */}
              <div style={{ ...eyebrow(9), marginTop: 38 }}>NUESTROS PLANES</div>
              {stripeError && (
                <div className="text-destructive bg-destructive/10 border border-destructive/30" style={{ marginTop: 12, padding: '10px 16px', borderRadius: 14, fontSize: 13 }}>
                  {stripeError}
                </div>
              )}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 16 }}>
                {/* F0 · POR-1: no ofrecer planes a 0€ como contratables en público
                    (cualquiera obtendría clases gratis). El precio > 0 es requisito
                    para el checkout de Stripe igualmente. */}
                {planesTarifa.filter(p => p.activo && p.precio > 0).map(p => {
                  const destacado = p.id === planDestacadoId;
                  const porClase = precioPorClase(p);
                  return (
                    <div key={p.id} style={{
                      borderRadius: R.cardSmall, background: destacado ? PRIMARY : 'var(--portal-surface)',
                      padding: '22px 26px', display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 18,
                      boxShadow: destacado ? SH.ctaOscuroFuerte : SH.planClaro,
                    }}>
                      <div style={{ flex: '1 1 180px' }}>
                        {destacado && <div style={{ ...eyebrow(8.5), color: `color-mix(in srgb, ${PRIMARY_FG} 65%, transparent)` }}>EL MÁS ELEGIDO</div>}
                        <div style={{ fontFamily: serif, fontSize: cq(20, 2, 25), lineHeight: 1, marginTop: destacado ? 9 : 0, color: destacado ? PRIMARY_FG : 'var(--portal-ink)' }}>{p.nombre}</div>
                        <div style={{ fontSize: 11, marginTop: 7, color: destacado ? `color-mix(in srgb, ${PRIMARY_FG} 60%, transparent)` : 'var(--portal-muted-2)' }}>
                          {p.tipo === 'MENSUAL' ? 'Mensual · sin compromiso' : (porClase ?? p.descripcion ?? `Bono ${p.sesiones ?? ''} clases`)}
                        </div>
                      </div>
                      <div style={{ fontFamily: serif, fontSize: cq(20, 2, 25), whiteSpace: 'nowrap', color: destacado ? PRIMARY_FG : 'var(--portal-ink)' }}>
                        {p.precio} €{p.tipo === 'MENSUAL' && <span style={{ fontFamily: sans, fontSize: 12 }}>/mes</span>}
                      </div>
                      <button onClick={() => handleContratarPlan(p)}
                        disabled={stripeLoading === p.id}
                        style={{
                          height: 46, padding: '0 24px', borderRadius: R.pillBtnXs, whiteSpace: 'nowrap', fontSize: 12.5, fontWeight: 500,
                          display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', opacity: stripeLoading === p.id ? 0.6 : 1,
                          border: destacado ? 'none' : '1px solid var(--portal-line)',
                          background: destacado ? 'var(--portal-surface)' : 'transparent',
                          color: destacado ? 'var(--portal-ink)' : 'var(--portal-ink)',
                        }}>
                        {stripeLoading === p.id
                          ? <span style={{ width: 14, height: 14, border: '2px solid rgba(0,0,0,.2)', borderTopColor: 'currentColor', borderRadius: 999, display: 'inline-block' }} className="animate-spin" />
                          : <><CreditCard size={13} />Contratar</>}
                      </button>
                    </div>
                  );
                })}
              </div>
              <p style={{ fontSize: 10.5, color: 'var(--portal-muted)', marginTop: 14 }}>Pago seguro con Stripe · IVA incluido</p>

              {/* Class types */}
              <div style={{ ...eyebrow(9), marginTop: 38 }}>TIPOS DE CLASE</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 12, marginTop: 16 }}>
                {tiposClase.map(t => (
                  <div key={t.id} style={{ borderRadius: R.chipCard, background: 'rgba(255,255,255,.7)', border: `1px solid ${t.color}20`, padding: 22 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                      <span style={{ width: 6, height: 6, borderRadius: 999, background: t.color, flexShrink: 0 }} />
                      <span style={{ fontFamily: serif, fontSize: 21 }}>{t.nombre}</span>
                    </div>
                    {t.descripcion && (
                      <div style={{ fontSize: 11, color: 'var(--portal-muted-2)', marginTop: 10, lineHeight: 1.5 }}>
                        {t.descripcion}
                      </div>
                    )}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8 }}>
                      <span style={{ fontSize: 10, color: 'var(--portal-muted)' }}>{t.duracionMinutos} min</span>
                      <LevelBadge nivel={t.nivel} />
                    </div>
                  </div>
                ))}
              </div>

              {/* Instructors */}
              <div style={{ ...eyebrow(9), marginTop: 38 }}>INSTRUCTORAS</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 12, marginTop: 16 }}>
                {queImparten(instructores).map(i => (
                  <div key={i.id} style={{ borderRadius: R.chipCard, background: 'var(--portal-surface)', padding: '18px 20px', display: 'flex', alignItems: 'center', gap: 14, boxShadow: SH.miniCard }}>
                    {i.fotoUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={i.fotoUrl} alt={i.nombre} style={{ width: 44, height: 44, borderRadius: 999, objectFit: 'cover', flexShrink: 0 }} />
                    ) : (
                      <div style={{ width: 44, height: 44, borderRadius: 999, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 15, color: '#fff', flexShrink: 0, background: i.color ?? PRIMARY }}>
                        {i.nombre.split(' ').map(n => n[0]).join('')}
                      </div>
                    )}
                    <div>
                      <div style={{ fontFamily: serif, fontSize: 21, lineHeight: 1 }}>{i.nombre}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div style={{ flex: '0 1 320px' }}>
              <div style={{ borderRadius: R.hero, background: 'rgba(255,255,255,.55)', border: '1px solid var(--portal-line)', padding: '26px 28px' }}>
                {estudioLogo ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={estudioLogo} alt={estudioNombre} style={{ width: 44, height: 44, borderRadius: 14, objectFit: 'contain', background: '#fff' }} />
                ) : (
                  <div style={{ width: 44, height: 44, borderRadius: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, color: PRIMARY_FG, background: PRIMARY }}>{estudioNombre[0]}</div>
                )}
                <h3 style={{ fontFamily: serif, fontSize: 24, lineHeight: 1.1, marginTop: 14 }}>{estudioNombre}</h3>
                <p style={{ fontSize: 11.5, color: 'var(--portal-muted-2)', marginTop: 10 }}>{estudioDireccion}</p>
              </div>
              {franjasHorario.length > 0 && (
                <div style={{ marginTop: 14, borderRadius: R.hero, background: 'rgba(255,255,255,.55)', border: '1px solid var(--portal-line)', padding: '26px 28px' }}>
                  <div style={eyebrow(9)}>HORARIO</div>
                  {franjasHorario.map((f, i) => (
                    <div key={f.dias} style={{ display: 'flex', justifyContent: 'space-between', marginTop: i === 0 ? 16 : 10, fontSize: 12, color: f.horas === 'Cerrado' ? 'var(--portal-muted)' : 'var(--portal-accent)' }}>
                      <span>{f.dias}</span><span>{f.horas}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Legal links */}
            <div style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 26, paddingTop: 40, fontSize: 11, color: 'var(--portal-muted)' }}>
              {[
                { label: 'Política de privacidad', text: studioConfig.politicaPrivacidad },
                { label: 'Términos de servicio', text: studioConfig.terminosServicio },
              ].map(({ label, text }, i) => (
                <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 26 }}>
                  {i > 0 && <span style={{ width: 1, height: 11, background: 'var(--portal-line)' }} />}
                  <button
                    onClick={() => setLegalDoc({ label, text })}
                    style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', color: 'var(--portal-muted)', cursor: 'pointer', fontSize: 11 }}>
                    <FileText size={12} />{label}
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ── MODAL ───────────────────────────────────────────────────────────── */}
      <PublicSheet
        open={bookingSesionId !== null}
        onClose={closeBooking}
        closeOnBackdropClick={false}
        label={
          loginStep === 'done' ? '¡Reserva confirmada!'
          : loginStep === 'espera' ? '¡En lista de espera!'
          : loginStep === 'pendiente' ? 'Pendiente de aprobación'
          : loginStep === 'login' ? (enlaceEnviado ? 'Revisa tu email' : 'Entra para reservar')
          : loginStep === 'registro' ? '¿Cómo te llamas?'
          : loginStep === 'contrato' ? 'Acepta los términos'
          : 'Confirmar reserva'
        }
        sheetClassName="bg-white w-full max-w-sm rounded-3xl p-6 relative shadow-2xl"
        sheetStyle={{ maxHeight: '90vh', overflowY: 'auto' }}
      >
        {bookingSesionId !== null && (
          <>
            <button onClick={closeBooking} aria-label="Cerrar"
              className="absolute top-4 right-4 text-[var(--portal-muted)] hover:text-[var(--portal-ink)] transition-colors">
              <X size={18} />
            </button>

            {/* ── DONE ── */}
            {loginStep === 'done' && bookingSesion && (
              <div className="flex flex-col items-center text-center gap-4">
                <div className="w-16 h-16 rounded-full flex items-center justify-center" style={{ backgroundColor: '#D1FAE5' }}>
                  <CheckCircle2 size={30} style={{ color: '#2F6B4F' }} />
                </div>
                <div>
                  <p className="text-[var(--portal-ink)] font-extrabold text-xl">¡Reserva confirmada!</p>
                  <p className="text-[var(--portal-muted-2)] text-sm mt-1">
                    {bookingSesion.tipo?.nombre} · {fmtLong(new Date(bookingSesion.inicio))} a las {fmtTime(bookingSesion.inicio)}
                  </p>
                </div>
                <div className="w-full space-y-2.5 mt-1">
                  <p className="text-[var(--portal-muted)] text-xs font-semibold uppercase tracking-wide">Añadir a tu calendario</p>
                  <a href={makeGoogleCalUrl(bookingSesion, estudioNombre, estudioDireccion)} target="_blank" rel="noopener noreferrer"
                    className="flex items-center justify-center gap-2 w-full py-3 rounded-2xl text-sm font-bold text-white transition-all"
                    style={{ backgroundColor: '#4285F4' }}>
                    <ExternalLink size={14} />Google Calendar
                  </a>
                  <button onClick={() => downloadICS(bookingSesion, estudioNombre, estudioDireccion)}
                    className="flex items-center justify-center gap-2 w-full py-3 rounded-2xl text-sm font-bold text-[var(--portal-ink)] bg-[var(--portal-surface-2)] border border-[var(--portal-line)] hover:bg-[var(--portal-surface-2)] transition-all">
                    <Download size={14} />Descargar .ics (Apple / Outlook)
                  </button>
                </div>
                {/* Quien reserva aquí ya es socia, pero nadie se lo dice: tiene
                    portal propio (sus bonos, su historial, sus próximas clases).
                    Se creó por magic link, así que aún no tiene contraseña — por
                    eso el enlace va a /acceso, que se la deja poner, y no a
                    /login, que la rebotaría. */}
                <div className="w-full pt-3 mt-1 border-t border-[var(--portal-line)]">
                  <p className="text-[var(--portal-muted)] text-xs leading-relaxed text-center">
                    Tus clases y tus bonos están en tu portal.{' '}
                    <a href={`/portal/${slug}/acceso`} className="font-bold underline" style={{ color: PRIMARY }}>
                      Crea tu contraseña
                    </a>{' '}
                    y entra cuando quieras.
                  </p>
                </div>
                <button onClick={closeBooking} className="text-[var(--portal-muted)] text-sm hover:text-[var(--portal-ink)] transition-colors mt-1">
                  Cerrar
                </button>
              </div>
            )}

            {/* ── ESPERA ── */}
            {loginStep === 'espera' && (
              <div className="flex flex-col items-center text-center py-4 gap-4">
                <div className="w-16 h-16 rounded-full flex items-center justify-center" style={{ backgroundColor: '#FEF3C7' }}>
                  <CheckCircle2 size={30} style={{ color: '#8F6215' }} />
                </div>
                <div>
                  <p className="text-[var(--portal-ink)] font-extrabold text-xl">¡En lista de espera!</p>
                  {esperaPos && (
                    <p className="text-[var(--portal-muted-2)] text-sm mt-1">Eres la <span className="font-bold text-[var(--portal-ink)]">nº {esperaPos}</span> en la lista.</p>
                  )}
                  <p className="text-[var(--portal-muted-2)] text-sm mt-1">Si se libera una plaza, te avisaremos por email.</p>
                </div>
                <button onClick={closeBooking}
                  className="w-full py-3 rounded-2xl text-sm font-bold text-[var(--portal-ink)] bg-[var(--portal-surface-2)] border border-[var(--portal-line)] hover:bg-[var(--portal-surface-2)] transition-all">
                  Cerrar
                </button>
              </div>
            )}

            {/* ── PENDIENTE DE APROBACIÓN (Fase 2a) ── */}
            {loginStep === 'pendiente' && (
              <div className="flex flex-col items-center text-center py-4 gap-4">
                <div className="w-16 h-16 rounded-full flex items-center justify-center" style={{ backgroundColor: '#FEF3C7' }}>
                  <CheckCircle2 size={30} style={{ color: '#8F6215' }} />
                </div>
                <div>
                  <p className="text-[var(--portal-ink)] font-extrabold text-xl">Solicitud enviada</p>
                  <p className="text-[var(--portal-muted-2)] text-sm mt-1">Tu reserva está pendiente de aprobación. Te avisaremos en cuanto se confirme.</p>
                </div>
                <button onClick={closeBooking}
                  className="w-full py-3 rounded-2xl text-sm font-bold text-[var(--portal-ink)] bg-[var(--portal-surface-2)] border border-[var(--portal-line)] hover:bg-[var(--portal-surface-2)] transition-all">
                  Cerrar
                </button>
              </div>
            )}

            {/* ── LOGIN (magic link) ── */}
            {loginStep === 'login' && (
              <>
                {!enlaceEnviado ? (
                  <>
                    <h2 className="text-[var(--portal-ink)] font-[var(--font-display),Georgia,serif] font-normal text-lg mb-1">Entra para reservar</h2>
                    <p className="text-[var(--portal-muted-2)] text-sm mb-5">Te enviamos un enlace de acceso a tu email. Sin contraseñas.</p>
                    <input type="email"
                      placeholder="Tu email"
                      value={loginForm.email}
                      onChange={e => { setLoginForm(f => ({ ...f, email: e.target.value })); setLoginError(''); }}
                      onKeyDown={e => e.key === 'Enter' && handleEnviarEnlace()}
                      autoFocus
                      className="w-full rounded-xl px-4 py-3 text-sm text-[var(--portal-ink)] placeholder:text-[var(--portal-muted)] outline-none border border-[var(--portal-line)] focus:border-[var(--portal-ink)] transition-colors mb-3"
                      style={{ backgroundColor: RT.surface2 }} />
                    {loginError && <p className="text-destructive text-sm mb-3">{loginError}</p>}
                    <div className="mb-3">
                      <TurnstileWidget onToken={setCaptchaToken} />
                    </div>
                    <button onClick={handleEnviarEnlace} disabled={!loginForm.email || (turnstileConfigurado() && !captchaToken)}
                      className="w-full py-3 rounded-2xl font-bold text-white transition-all disabled:opacity-40"
                      style={{ backgroundColor: PRIMARY }}>
                      Enviar enlace de acceso →
                    </button>
                  </>
                ) : (
                  <div className="flex flex-col items-center text-center py-4 gap-4">
                    <div className="w-16 h-16 rounded-full flex items-center justify-center" style={{ backgroundColor: '#FFF2F7' }}>
                      <Mail size={28} style={{ color: PRIMARY }} />
                    </div>
                    <div>
                      <p className="text-[var(--portal-ink)] font-extrabold text-xl">Revisa tu email</p>
                      <p className="text-[var(--portal-muted-2)] text-sm mt-1">
                        Te enviamos un enlace a <span className="font-semibold text-[var(--portal-ink)]">{loginForm.email}</span>.
                        Ábrelo en este dispositivo para entrar y vuelve a reservar tu clase.
                      </p>
                    </div>
                  </div>
                )}
              </>
            )}

            {/* ── REGISTRO (walk-in ya autenticado: nombre) ── */}
            {loginStep === 'registro' && (
              <>
                <h2 className="text-[var(--portal-ink)] font-[var(--font-display),Georgia,serif] font-normal text-lg mb-1">¿Cómo te llamas?</h2>
                <p className="text-[var(--portal-muted-2)] text-sm mb-5">Completa tu nombre para tu primera reserva.</p>
                <input type="text"
                  placeholder="Tu nombre completo"
                  value={loginForm.nombre}
                  onChange={e => setLoginForm(f => ({ ...f, nombre: e.target.value }))}
                  onKeyDown={e => e.key === 'Enter' && handleRegistroNombre()}
                  autoFocus
                  className="w-full rounded-xl px-4 py-3 text-sm text-[var(--portal-ink)] placeholder:text-[var(--portal-muted)] outline-none border border-[var(--portal-line)] focus:border-[var(--portal-ink)] transition-colors mb-5"
                  style={{ backgroundColor: RT.surface2 }} />
                <button onClick={handleRegistroNombre} disabled={!loginForm.nombre}
                  className="w-full py-3 rounded-2xl font-bold text-white transition-all disabled:opacity-40"
                  style={{ backgroundColor: PRIMARY }}>
                  Continuar →
                </button>
              </>
            )}

            {/* ── CONTRATO (aceptación clickwrap) ── */}
            {loginStep === 'contrato' && (
              <>
                <div className="flex items-center gap-2 mb-1">
                  <FileText size={16} style={{ color: PRIMARY }} className="shrink-0" />
                  <h2 className="text-[var(--portal-ink)] font-[var(--font-display),Georgia,serif] font-normal text-lg">Acepta los términos</h2>
                </div>
                <p className="text-[var(--portal-muted-2)] text-sm mb-4">
                  Antes de tu primera reserva, lee y acepta las condiciones y la política de privacidad.
                </p>
                {/* Se muestran las DOS cosas que dice la casilla. Antes solo salían
                    los términos y la política estaba en un enlace del pie, así que
                    se aceptaba un texto que no se había enseñado. */}
                <div className="rounded-xl p-3 mb-4 text-[11px] text-[var(--portal-muted-2)] leading-relaxed overflow-y-auto bg-[var(--portal-surface-2)] border border-[var(--portal-line)]"
                  style={{ maxHeight: '160px', whiteSpace: 'pre-wrap' }}>
                  {textoLegalCompleto(studioConfig)}
                </div>
                <label className="flex items-start gap-2.5 mb-4 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={terminosAceptados}
                    onChange={e => setTerminosAceptados(e.target.checked)}
                    className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--portal-ink)]"
                  />
                  <span className="text-[var(--portal-ink)] text-xs leading-relaxed">
                    He leído y acepto los términos de servicio y la política de privacidad.
                  </span>
                </label>
                <div className="flex gap-2">
                  <button onClick={() => setLoginStep('login')}
                    className="flex-1 py-3 rounded-2xl text-sm font-semibold text-[var(--portal-ink)] bg-[var(--portal-surface-2)] border border-[var(--portal-line)] hover:bg-[var(--portal-surface-2)] transition-all">
                    Volver
                  </button>
                  <button onClick={handleSignContract} disabled={!terminosAceptados}
                    className="flex-[2] py-3 rounded-2xl text-sm font-bold text-white transition-all disabled:opacity-40"
                    style={{ backgroundColor: PRIMARY }}>
                    Aceptar y continuar →
                  </button>
                </div>
              </>
            )}

            {/* ── CONFIRM ── */}
            {loginStep === 'confirm' && bookingSesion && (
              <>
                <h2 className="text-[var(--portal-ink)] font-[var(--font-display),Georgia,serif] font-normal text-lg mb-4">Confirmar reserva</h2>
                <div className="rounded-2xl p-4 mb-4 bg-[var(--portal-surface-2)] border border-[var(--portal-line)]">
                  <div className="flex items-center gap-2 mb-1.5">
                    <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: bookingSesion.tipo?.color ?? PRIMARY }} />
                    <p className="text-[var(--portal-ink)] font-bold">{bookingSesion.tipo?.nombre}</p>
                  </div>
                  <p className="text-[var(--portal-muted-2)] text-sm">{fmtLong(new Date(bookingSesion.inicio))}</p>
                  <p className="text-[var(--portal-muted-2)] text-sm">{fmtTime(bookingSesion.inicio)} · {bookingSesion.instructor?.nombre}</p>
                  {bookingSesion.ocupadas >= bookingSesion.aforoMaximo && (
                    <p className="text-warning text-xs font-medium mt-2">
                      Clase llena — te apuntaremos en lista de espera
                    </p>
                  )}
                  {(() => {
                    const ventana = bookingSesion.tipo?.ventanaCancelacionHoras ?? studio?.cancelacionVentanaHoras ?? 0;
                    return ventana > 0 && (
                      <p className="text-[var(--portal-muted)] text-xs mt-2">
                        Cancela con al menos {ventana}h de antelación para recuperar tu sesión.
                      </p>
                    );
                  })()}
                </div>

                {/* Selección de sitio (I-12): solo si la sala tiene reformers y la
                    clase no está llena (la lista de espera no ocupa sitio). */}
                {(() => {
                  const spotsSala = spots.filter(s => s.salaId === bookingSesion.salaId && s.activo);
                  const lleno = bookingSesion.ocupadas >= bookingSesion.aforoMaximo;
                  if (spotsSala.length === 0 || lleno) return null;
                  const takenIds = new Set(
                    reservas
                      .filter(r => r.sesionId === bookingSesion.id && (r.estado === 'CONFIRMADA' || r.estado === 'ASISTIDA') && r.spotId)
                      .map(r => r.spotId as string),
                  );
                  return (
                    <div className="mb-4">
                      <p className="text-[var(--portal-ink)] text-xs font-semibold mb-2">
                        Elige tu sitio <span className="text-[var(--portal-muted)] font-normal">(opcional)</span>
                      </p>
                      <SpotPickerPublico
                        spots={spotsSala}
                        takenIds={takenIds}
                        selected={selectedSpot}
                        onSelect={setSelectedSpot}
                        primary={PRIMARY}
                      />
                    </div>
                  );
                })()}

                <div className="flex items-center gap-2.5 mb-5 px-1">
                  <div className="w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0"
                    style={{ backgroundColor: PRIMARY }}>
                    {(socia?.nombre ?? loginForm.nombre ?? '·')[0]}
                  </div>
                  <p className="text-[var(--portal-muted-2)] text-sm">
                    <span className="text-[var(--portal-ink)] font-semibold">{socia?.nombre ?? loginForm.nombre}</span>
                    <span className="mx-1">·</span>{socia?.email ?? usuarioEmail}
                  </p>
                </div>
                {gateError && (
                  <div className="mb-3 px-4 py-3 rounded-xl text-sm text-destructive bg-destructive/10 border border-destructive/30">
                    {gateError}
                  </div>
                )}
                <button onClick={handleConfirm} disabled={confirmando}
                  className="w-full py-3 rounded-2xl font-bold text-white disabled:opacity-60 disabled:cursor-not-allowed"
                  style={{ backgroundColor: PRIMARY }}>
                  {confirmando ? 'Confirmando…' : 'Confirmar reserva'}
                </button>
              </>
            )}
          </>
        )}
      </PublicSheet>

      {/* ── MODAL CANCELAR PLAZA (sustituye al confirm() nativo) ─────────────── */}
      <PublicSheet open={cancelConfirm !== null} onClose={() => { setCancelConfirm(null); setErrorCancelar(null); }} label="Cancelar tu plaza">
        {cancelConfirm && (
          <>
            <h2 className="text-[var(--portal-ink)] font-[var(--font-display),Georgia,serif] font-normal text-lg mb-1">¿Cancelar tu plaza?</h2>
            <p className="text-[var(--portal-muted)] text-sm mb-5">
              {cancelConfirm.pierdeBono
                ? `Estás cancelando con menos de ${cancelConfirm.ventana}h de antelación: no se te devolverá la sesión del bono.`
                : 'Liberarás tu plaza para otra persona.'}
            </p>
            {errorCancelar && (
              <div className="mb-3 px-4 py-3 rounded-xl text-sm text-destructive bg-destructive/10 border border-destructive/30">
                {errorCancelar}
              </div>
            )}
            <div className="flex gap-2">
              <button onClick={() => { setCancelConfirm(null); setErrorCancelar(null); }}
                className="flex-1 py-3 rounded-2xl text-sm font-semibold text-[var(--portal-ink)] bg-[var(--portal-surface-2)] border border-[var(--portal-line)] hover:bg-[var(--portal-surface-2)] transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--portal-ink)]/20">
                Volver
              </button>
              <button onClick={() => {
                const id = cancelConfirm.reservaId;
                setCancelandoPlaza(true);
                void cancelarReserva(id).then(r => {
                  setCancelandoPlaza(false);
                  // El modal solo se cierra si de VERDAD se ha cancelado. Si no,
                  // se queda abierto con el motivo: es la única superficie que
                  // ella está mirando en ese instante.
                  if (r.ok) { setCancelConfirm(null); setErrorCancelar(null); return; }
                  setErrorCancelar(r.error);
                });
              }}
                disabled={cancelandoPlaza}
                className="flex-1 py-3 rounded-2xl text-sm font-bold text-white bg-rose-500 hover:bg-rose-600 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-300">
                Cancelar plaza
              </button>
            </div>
          </>
        )}
      </PublicSheet>

      {/* ── MODAL DOCUMENTO LEGAL ────────────────────────────────────────────── */}
      <PublicSheet
        open={legalDoc !== null}
        onClose={() => setLegalDoc(null)}
        label={legalDoc?.label ?? 'Documento legal'}
        sheetClassName="bg-white w-full max-w-lg rounded-3xl relative shadow-2xl flex flex-col"
        sheetStyle={{ maxHeight: '85vh' }}
      >
        {legalDoc && (
          <>
            <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--portal-surface-2)]">
              <h2 className="text-[var(--portal-ink)] font-bold text-base">{legalDoc.label}</h2>
              <button onClick={() => setLegalDoc(null)} aria-label="Cerrar" className="text-[var(--portal-muted)] hover:text-[var(--portal-ink)] transition-colors">
                <X size={18} />
              </button>
            </div>
            {/* El texto lo edita el dueño del estudio; se renderiza como texto
                (React escapa), nunca como HTML. */}
            <div className="px-6 py-5 overflow-y-auto text-[13px] text-[var(--portal-ink)] leading-relaxed" style={{ whiteSpace: 'pre-wrap' }}>
              {legalDoc.text}
            </div>
          </>
        )}
      </PublicSheet>
    </div>
  );
}
