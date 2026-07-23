'use client';

import { useState, useMemo, useEffect, useRef, useId } from 'react';
import { useSearchParams, useParams } from 'next/navigation';
import { useStudio } from '@/lib/studio-context';
import { useSociaSession } from '@/lib/use-socia-session';
import { PlanTarifa, type EstadoReserva, type Reserva } from '@/lib/types';
import { tieneEntitlementActivo } from '@/lib/bono-logic';
import { contarReservasActivasFuturas, esCancelacionTardia } from '@/lib/booking-logic';
import { ReservaCalendario, type ReservaSlot } from '@/components/reserva/reserva-calendario';
import { CitasPublica } from '@/components/reserva/citas-publica';
import { PublicSheet } from '@/components/ui/public-sheet';
import { MODO_TOKENS } from '@/lib/portal-modo';
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
  TODOS: { bg: '#FFF2F7', text: '#1D4ED8' },
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
  const c = NIVEL_COLOR[nivel] ?? { bg: '#F1F1EC', text: '#8E8E86' };
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
      <div className="rounded-lg py-1.5 text-center text-[9px] font-bold uppercase tracking-widest bg-[#F1F1EC] text-[#767670] mb-2">
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
                ? { backgroundColor: '#F1F1EC', borderColor: '#E7E7E0', color: '#C6C6BE' }
                : isSel
                ? { backgroundColor: primary, borderColor: primary, color: '#fff' }
                : { backgroundColor: '#fff', borderColor: '#E5E5EA', color: '#3A3A34' }}>
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
type Step = 'login' | 'registro' | 'contrato' | 'confirm' | 'done' | 'espera';

// Criterios de estado (mismos que el portal): qué reservas ocupan plaza y cuáles
// cuentan como reserva activa de la propia socia.
const OCUPA_PLAZA: Reserva['estado'][] = ['CONFIRMADA', 'ASISTIDA'];
const RESERVA_ACTIVA: Reserva['estado'][] = ['CONFIRMADA', 'LISTA_ESPERA'];

// Tema del calendario compartido para el widget PÚBLICO: reutiliza el tema claro
// del portal (MODO_TOKENS.dia), que ya casa con el lenguaje visual de /reservar
// (fondo hueso, tarjetas blancas, marca --portal-brand). Fuera del componente
// para no recrearlo en cada render.
const RESERVAR_TOKENS = MODO_TOKENS.dia;

export default function ReservarPage() {
  const {
    sesiones, reservas, socios, tiposClase, salas, instructores, spots,
    planesTarifa, suscripciones, studioConfig, studio,
    addReserva, updateSocio, cancelarReserva, addSocioFromPortal,
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
  const [loginForm, setLoginForm] = useState({ nombre: '', email: '' });
  const [loginStep, setLoginStep] = useState<Step>('login');
  const [enlaceEnviado, setEnlaceEnviado] = useState(false);
  const [loginError, setLoginError] = useState('');
  const [gateError, setGateError] = useState('');

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
  const cubierta = socia?.socioId
    ? tieneEntitlementActivo(socia.socioId, suscripciones, planesTarifa, localDate(now))
    : false;

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
  function evaluarGate(socioId?: string): string | null {
    if (!studio) return null;
    if (studio.reservaExigirPlan) {
      const ok = socioId
        ? tieneEntitlementActivo(socioId, suscripciones, planesTarifa, localDate(now))
        : false;
      if (!ok) return 'Necesitas un plan o bono activo para reservar. Contrata uno en la pestaña "El estudio".';
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
    const r = await enviarEnlace(loginForm.email, bookingSesionId || undefined);
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
          versionTexto: 'v1.1',
        },
      });
    }
    setLoginStep('confirm');
  }

  async function handleConfirm() {
    if (!bookingSesionId) return;
    const sesion = sesionesRich.find(s => s.id === bookingSesionId);
    if (!sesion) return;

    // Gate de derechos (C-4) antes de crear nada: si no cumple, avisa y no da de
    // alta a la walk-in ni reserva. El servidor lo revalida igualmente.
    const gate = evaluarGate(socia?.socioId);
    if (gate) { setGateError(gate); return; }

    if (!socia) {
      // Walk-in: alta de la ficha. El servidor la vincula a su auth_user_id a
      // partir del JWT (magic link) y usa el email del token; el nombre lo puso
      // en el paso "registro". Se AWAITea para que la reserva la encuentre.
      const nuevoId = `soc-${Date.now()}`;
      const referidoValido = refCode && refCode !== nuevoId && socios.some(s => s.id === refCode) ? refCode : null;
      await addSocioFromPortal({
        id: nuevoId,
        nombre: loginForm.nombre.trim(),
        email: usuarioEmail ?? '',
        aceptacionContrato: {
          fecha: new Date().toISOString(),
          firma: loginForm.nombre.trim(),
          versionTexto: 'v1.1',
        },
        referidoPor: referidoValido,
      });
      await refrescar(); // re-resuelve la socia recién creada (por auth_user_id)
    }

    // El id de la socia lo deriva el servidor del JWT; el que pasamos aquí solo
    // alimenta la actualización optimista de la UI. El estado (confirmada/espera)
    // lo decide addReserva según el aforo del momento. El sitio elegido (I-12)
    // solo se asigna si la reserva queda confirmada (lo valida el servidor).
    const estado = addReserva(bookingSesionId, socia?.socioId ?? '', selectedSpot);
    if (estado === 'LISTA_ESPERA') {
      // Posición estimada: nº de personas ya en espera + 1 (I-11).
      const enEspera = reservas.filter(r => r.sesionId === bookingSesionId && r.estado === 'LISTA_ESPERA').length;
      setEsperaPos(enEspera + 1);
    }
    setLoginStep(estado === 'LISTA_ESPERA' ? 'espera' : 'done');
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
  function handleReservarCalendario(slot: ReservaSlot, spotId: string | null): EstadoReserva | void {
    if (!autenticado || !socia) {
      openBooking(slot.id);
      if (spotId) setSelectedSpot(spotId);
      return;
    }
    const found = socios.find(s => s.id === socia.socioId);
    const needsContract = !found?.aceptacionContrato;
    if (needsContract || evaluarGate(socia.socioId)) {
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
      <div className="min-h-screen bg-[#EEEEE8]">
        <header className="sticky top-0 z-30 bg-white border-b border-[#F1F1EC]" style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
          <div className="max-w-2xl mx-auto px-4">
            <div className="flex items-center gap-3 py-3">
              <div className="w-9 h-9 rounded-xl bg-[#E7E7E0] shrink-0" />
              <div className="space-y-1.5">
                <div className="h-3 w-28 rounded bg-[#E7E7E0]" />
                <div className="h-2.5 w-40 rounded bg-[#EFEFEA]" />
              </div>
            </div>
          </div>
        </header>
        <div className="max-w-2xl mx-auto px-4 py-16 flex flex-col items-center gap-3 text-center">
          <span className="w-6 h-6 border-2 border-[#D9D9D2] border-t-[#1A1A1A] rounded-full animate-spin" />
          <p className="text-[#8E8E86] text-sm">Cargando horario…</p>
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

  return (
    <div className="min-h-screen bg-[#EEEEE8]">

      {/* ── HEADER ────────────────────────────────────────────────────────── */}
      <header className="sticky top-0 z-30 bg-white border-b border-[#F1F1EC]" style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
        <div className="max-w-2xl mx-auto px-4">
          {/* Studio identity */}
          <div className="flex items-center justify-between py-3">
            <div className="flex items-center gap-3">
              {estudioLogo ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={estudioLogo} alt={estudioNombre}
                  className="w-9 h-9 rounded-xl object-contain bg-white shrink-0" />
              ) : (
                <div className="w-9 h-9 rounded-xl flex items-center justify-center text-[11px] font-black shrink-0"
                  style={{ backgroundColor: PRIMARY, color: PRIMARY_FG }}>{estudioNombre[0]}</div>
              )}
              <div>
                <p className="font-bold text-[#1A1A1A] text-sm leading-tight">{estudioNombre}</p>
                <p className="text-[#767670] text-[11px]">{estudioDireccion}</p>
              </div>
            </div>
            {socia ? (
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-[#F5F5F1] border border-[#E7E7E0]">
                  <div className="w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold shrink-0"
                    style={{ backgroundColor: PRIMARY, color: PRIMARY_FG }}>
                    {socia.nombre[0]}
                  </div>
                  <span className="text-[#3A3A34] text-sm font-medium">{socia.nombre.split(' ')[0]}</span>
                  <button onClick={logout} aria-label="Cerrar sesión" className="text-[#767670] hover:text-[#3A3A34] ml-0.5"><X size={12} /></button>
                </div>
              </div>
            ) : (
              <button
                onClick={() => { setBookingSesionId(''); setLoginStep('login'); openBooking(''); }}
                className="px-4 py-2 rounded-xl text-sm font-bold transition-colors"
                style={{ backgroundColor: PRIMARY, color: PRIMARY_FG }}>
                Acceder
              </button>
            )}
          </div>

          {/* Tabs */}
          <div className="flex gap-0">
            {([['clases', 'Clases'], ['citas', 'Citas'], ['misreservas', 'Mis reservas'], ['estudio', 'El estudio']] as const).map(([t, label]) => (
              <button key={t} onClick={() => setTab(t)}
                className="px-4 py-2.5 text-sm font-semibold border-b-2 transition-all"
                style={tab === t
                  ? { color: PRIMARY, borderColor: PRIMARY }
                  : { color: '#767670', borderColor: 'transparent' }}>
                {label}
              </button>
            ))}
          </div>
        </div>
      </header>

      {/* ── CONTENT ─────────────────────────────────────────────────────────── */}
      <div className="max-w-2xl mx-auto px-4 py-5">

        {/* ── TAB: CLASES ─────────────────────────────────────────────────── */}
        {tab === 'clases' && (
          <div className="space-y-4">

            {/* Filtros por tipo de clase (se aplican a los slots del calendario) */}
            <div className="flex gap-2 overflow-x-auto pb-1">
              {['', ...tiposClase.map(t => t.id)].map(id => {
                const tipo = tiposClase.find(t => t.id === id);
                const active = filtroTipo === id;
                return (
                  <button key={id || 'all'} onClick={() => setFiltroTipo(id)}
                    className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-all border"
                    style={active
                      ? { backgroundColor: tipo?.color ?? PRIMARY, color: tipo?.color ? '#fff' : PRIMARY_FG, borderColor: tipo?.color ?? PRIMARY }
                      : { backgroundColor: 'white', color: '#8E8E86', borderColor: '#E7E7E0' }}>
                    {tipo && <span className="w-2 h-2 rounded-full" style={{ backgroundColor: active ? 'rgba(255,255,255,0.7)' : tipo.color }} />}
                    {tipo ? tipo.nombre : 'Todas las clases'}
                  </button>
                );
              })}
            </div>

            {/* Calendario de reservas — componente compartido (estilo Acuity), el
                mismo que usa el portal de socias. Se renderiza sobre el fondo de
                la página (no en una tarjeta blanca) para que sus tarjetas de
                horario (surface blanco) contrasten. La reserva se enruta por
                handleReservarCalendario, que respeta el step-machine de acceso. */}
            <ReservaCalendario
              t={RESERVAR_TOKENS}
              slots={slots}
              variant="calendario"
              onReservar={handleReservarCalendario}
              onCancelar={cancelarReserva}
              cancelacionVentanaHoras={studio?.cancelacionVentanaHoras}
              vacio={{ titulo: 'Sin clases disponibles', cuerpo: 'Prueba con otra semana o cambia el filtro' }}
            />
          </div>
        )}

        {/* ── TAB: CITAS 1:1 ──────────────────────────────────────────────── */}
        {tab === 'citas' && (
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
        )}

        {/* ── TAB: MIS RESERVAS ───────────────────────────────────────────── */}
        {tab === 'misreservas' && (
          <div className="space-y-3">
            {!socia ? (
              <div className="bg-white rounded-2xl flex flex-col items-center py-16 gap-4 text-center shadow-sm">
                <div className="w-14 h-14 rounded-full flex items-center justify-center" style={{ backgroundColor: '#FFF2F7' }}>
                  <Users size={24} style={{ color: PRIMARY }} />
                </div>
                <div>
                  <h2 className="text-[#1A1A1A] font-bold text-lg">Identifícate para ver tus reservas</h2>
                  <p className="text-[#8E8E86] text-sm mt-1">Te enviamos un enlace de acceso a tu email. Sin contraseñas.</p>
                </div>
                <button onClick={() => { setBookingSesionId(''); setLoginStep('login'); }}
                  className="px-6 py-3 rounded-xl font-bold text-white text-sm"
                  style={{ backgroundColor: PRIMARY }}>
                  Acceder
                </button>
              </div>
            ) : misReservas.length === 0 ? (
              <div className="bg-white rounded-2xl flex flex-col items-center py-16 gap-3 text-center shadow-sm">
                <Calendar size={28} className="text-[#C6C6BE]" />
                <p className="text-[#8E8E86] font-medium">No tienes reservas todavía</p>
                <button onClick={() => setTab('clases')} className="text-sm font-semibold" style={{ color: PRIMARY }}>
                  Explorar clases →
                </button>
              </div>
            ) : (
              <>
                <div className="flex items-center justify-between px-1 mb-1">
                  <h2 className="text-[#1A1A1A] font-bold text-base">Mis clases</h2>
                  <span className="text-[#767670] text-sm">{misReservas.length} reserva{misReservas.length !== 1 ? 's' : ''}</span>
                </div>
                {misReservas.map(r => {
                  const s = r.sesion!;
                  const isPast = new Date(s.fin) < now;
                  const isFuture = !isPast && r.estado !== 'ASISTIDA';
                  const fechaLarga = new Date(s.inicio).toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' });
                  return (
                    <div key={r.id} className="bg-white rounded-2xl shadow-sm overflow-hidden"
                      style={{ border: isFuture ? `1.5px solid ${s.tipo?.color ?? PRIMARY}40` : '1px solid #F1F3F5', opacity: isPast ? 0.7 : 1 }}>
                      <div className="h-1" style={{ backgroundColor: s.tipo?.color ?? PRIMARY, opacity: isPast ? 0.4 : 1 }} />
                      <div className="p-4">
                        <div className="flex items-start justify-between gap-3 mb-2">
                          <div>
                            <p className="font-bold text-[#1A1A1A] text-base leading-tight">{s.tipo?.nombre}</p>
                            <p className="text-[#8E8E86] text-sm mt-0.5 capitalize">{fechaLarga}</p>
                          </div>
                          <span className="text-[11px] font-bold px-2.5 py-1 rounded-full shrink-0"
                            style={r.estado === 'ASISTIDA'
                              ? { backgroundColor: '#D1FAE5', color: '#065F46' }
                              : r.estado === 'LISTA_ESPERA'
                              ? { backgroundColor: '#FEF3C7', color: '#92400E' }
                              : isPast ? { backgroundColor: '#F1F1EC', color: '#767670' }
                              : { backgroundColor: '#FFF2F7', color: PRIMARY }}>
                            {r.estado === 'ASISTIDA' ? 'Asistida' : r.estado === 'LISTA_ESPERA' ? (r.posicionEspera ? `En espera · nº ${r.posicionEspera}` : 'En espera') : isPast ? 'Finalizada' : 'Confirmada'}
                          </span>
                        </div>
                        <div className="flex flex-wrap items-center gap-3 text-sm text-[#8E8E86]">
                          <span className="font-bold text-[#1A1A1A] text-xl">{fmtTime(s.inicio)}<span className="text-[#767670] text-sm font-normal ml-1">→ {fmtTime(s.fin)}</span></span>
                          {s.instructor && <span>{s.instructor.nombre}</span>}
                          {s.sala && <span>{s.sala.nombre}</span>}
                          <LevelBadge nivel={s.tipo?.nivel} />
                        </div>
                        {isFuture && (
                          <div className="flex items-center gap-2 mt-3 pt-3 border-t border-[#F1F1EC]">
                            <a href={makeGoogleCalUrl(s, estudioNombre, estudioDireccion)} target="_blank" rel="noopener noreferrer"
                              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-[#3A3A34] bg-[#F5F5F1] hover:bg-[#F1F1EC] border border-[#E7E7E0] transition-colors">
                              <Calendar size={12} /> Añadir al calendario
                            </a>
                            <button onClick={() => downloadICS(s, estudioNombre, estudioDireccion)}
                              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-[#3A3A34] bg-[#F5F5F1] hover:bg-[#F1F1EC] border border-[#E7E7E0] transition-colors">
                              <Download size={12} /> .ics
                            </button>
                            <button onClick={() => {
                              // Aviso de cancelación tardía (C-2): si está dentro de la
                              // ventana y el estudio no devuelve bono, el modal lo advierte.
                              const ventana = studio?.cancelacionVentanaHoras ?? 0;
                              const tardia = r.estado === 'CONFIRMADA' && esCancelacionTardia(s.inicio, now, ventana);
                              const pierdeBono = tardia && !(studio?.cancelacionDevolverBonoTardia ?? false);
                              setCancelConfirm({ reservaId: r.id, pierdeBono, ventana });
                            }}
                              className="ml-auto flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-rose-500 bg-rose-50 hover:bg-rose-100 border border-rose-200 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-300">
                              <X size={12} /> Cancelar plaza
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </>
            )}
          </div>
        )}

        {/* ── TAB: EL ESTUDIO ─────────────────────────────────────────────── */}
        {tab === 'estudio' && (
          <div className="space-y-6">
            {/* Studio info */}
            <div className="bg-white rounded-2xl shadow-sm p-6 text-center" style={{ border: '1px solid #F1F3F5' }}>
              <div className="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-4 text-white text-lg font-black"
                style={{ backgroundColor: PRIMARY }}>{estudioNombre[0]}</div>
              <h2 className="text-[#1A1A1A] text-xl font-extrabold">{estudioNombre}</h2>
              <p className="text-[#8E8E86] text-sm mt-1">{estudioDireccion}</p>
              <p className="text-[#8E8E86] text-sm mt-3 max-w-sm mx-auto leading-relaxed">
                Estudio boutique especializado en pilates reformer. Grupos reducidos para atención personalizada.
              </p>
              <div className="flex items-center justify-center gap-3 mt-4 text-sm">
                <span className="font-semibold" style={{ color: PRIMARY }}>{estudioEmail}</span>
                <span className="text-[#C6C6BE]">·</span>
                <span className="text-[#8E8E86]">{estudioTelefono}</span>
              </div>
            </div>

            {/* Plans + Stripe */}
            <div>
              <div className="flex items-center gap-2 mb-3 px-1">
                <CreditCard size={16} style={{ color: PRIMARY }} />
                <h3 className="text-[#1A1A1A] font-bold text-base">Nuestros planes</h3>
              </div>
              {stripeError && (
                <div className="mb-3 px-4 py-3 rounded-xl text-sm text-rose-600 bg-rose-50 border border-rose-200">
                  {stripeError}
                </div>
              )}
              <div className="space-y-3">
                {planesTarifa.filter(p => p.activo).map(p => (
                  <div key={p.id} className="bg-white rounded-2xl p-4 flex items-center justify-between gap-4 shadow-sm"
                    style={{ border: '1px solid #F1F3F5' }}>
                    <div className="min-w-0">
                      <p className="text-[#1A1A1A] font-bold text-sm">{p.nombre}</p>
                      {p.descripcion && <p className="text-[#8E8E86] text-xs mt-0.5">{p.descripcion}</p>}
                      <div className="flex items-center gap-2 mt-1.5">
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full"
                          style={{ backgroundColor: '#FFF2F7', color: PRIMARY }}>
                          {p.tipo === 'MENSUAL' ? 'Mensual' : p.tipo === 'BONO' ? `Bono ${p.sesiones} clases` : 'Clase suelta'}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <div className="text-right">
                        <p className="text-[#1A1A1A] font-extrabold text-xl leading-none">{p.precio}€</p>
                        {p.tipo === 'MENSUAL' && <p className="text-[#767670] text-[10px]">/mes</p>}
                      </div>
                      <button onClick={() => handleContratarPlan(p)}
                        disabled={stripeLoading === p.id}
                        className="px-4 py-2.5 rounded-xl text-sm font-bold text-white transition-all disabled:opacity-50 flex items-center gap-1.5"
                        style={{ backgroundColor: PRIMARY }}>
                        {stripeLoading === p.id
                          ? <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                          : <><CreditCard size={13} />Contratar</>}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
              <p className="text-[#767670] text-xs mt-3 text-center">Pago seguro con Stripe · IVA incluido</p>
            </div>

            {/* Class types */}
            <div>
              <h3 className="text-[#1A1A1A] font-bold text-base mb-3 px-1">Tipos de clase</h3>
              <div className="grid sm:grid-cols-2 gap-3">
                {tiposClase.map(t => (
                  <div key={t.id} className="bg-white rounded-2xl p-4 shadow-sm"
                    style={{ border: `1.5px solid ${t.color}25` }}>
                    <div className="flex items-center gap-2 mb-1.5">
                      <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: t.color }} />
                      <p className="text-[#1A1A1A] font-bold text-sm">{t.nombre}</p>
                    </div>
                    <p className="text-[#8E8E86] text-xs">{t.descripcion}</p>
                    <div className="flex items-center gap-2 mt-2">
                      <span className="text-[10px] text-[#767670]">{t.duracionMinutos} min</span>
                      <LevelBadge nivel={t.nivel} />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Instructors */}
            <div>
              <h3 className="text-[#1A1A1A] font-bold text-base mb-3 px-1">Instructoras</h3>
              <div className="grid sm:grid-cols-2 gap-3">
                {instructores.filter(i => i.activo).map(i => (
                  <div key={i.id} className="bg-white flex items-center gap-3 rounded-2xl p-4 shadow-sm"
                    style={{ border: '1px solid #F1F3F5' }}>
                    <div className="w-11 h-11 rounded-full flex items-center justify-center text-white font-bold text-sm shrink-0"
                      style={{ backgroundColor: i.color ?? PRIMARY }}>
                      {i.nombre.split(' ').map(n => n[0]).join('')}
                    </div>
                    <div>
                      <p className="text-[#1A1A1A] font-semibold text-sm">{i.nombre}</p>
                      {i.email != null && <p className="text-[#767670] text-xs mt-0.5">{i.email}</p>}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Legal links */}
            <div className="flex items-center justify-center gap-6 pt-2 pb-4">
              {[
                { label: 'Política de privacidad', text: studioConfig.politicaPrivacidad },
                { label: 'Términos de servicio', text: studioConfig.terminosServicio },
              ].map(({ label, text }) => (
                <button key={label}
                  onClick={() => setLegalDoc({ label, text })}
                  className="flex items-center gap-1.5 text-xs text-[#767670] hover:text-[#3A3A34] transition-colors">
                  <FileText size={12} />{label}
                </button>
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
              className="absolute top-4 right-4 text-[#767670] hover:text-[#3A3A34] transition-colors">
              <X size={18} />
            </button>

            {/* ── DONE ── */}
            {loginStep === 'done' && bookingSesion && (
              <div className="flex flex-col items-center text-center gap-4">
                <div className="w-16 h-16 rounded-full flex items-center justify-center" style={{ backgroundColor: '#D1FAE5' }}>
                  <CheckCircle2 size={30} style={{ color: '#059669' }} />
                </div>
                <div>
                  <p className="text-[#1A1A1A] font-extrabold text-xl">¡Reserva confirmada!</p>
                  <p className="text-[#8E8E86] text-sm mt-1">
                    {bookingSesion.tipo?.nombre} · {fmtLong(new Date(bookingSesion.inicio))} a las {fmtTime(bookingSesion.inicio)}
                  </p>
                </div>
                <div className="w-full space-y-2.5 mt-1">
                  <p className="text-[#767670] text-xs font-semibold uppercase tracking-wide">Añadir a tu calendario</p>
                  <a href={makeGoogleCalUrl(bookingSesion, estudioNombre, estudioDireccion)} target="_blank" rel="noopener noreferrer"
                    className="flex items-center justify-center gap-2 w-full py-3 rounded-2xl text-sm font-bold text-white transition-all"
                    style={{ backgroundColor: '#4285F4' }}>
                    <ExternalLink size={14} />Google Calendar
                  </a>
                  <button onClick={() => downloadICS(bookingSesion, estudioNombre, estudioDireccion)}
                    className="flex items-center justify-center gap-2 w-full py-3 rounded-2xl text-sm font-bold text-[#3A3A34] bg-[#F5F5F1] border border-[#E7E7E0] hover:bg-[#F1F1EC] transition-all">
                    <Download size={14} />Descargar .ics (Apple / Outlook)
                  </button>
                </div>
                <button onClick={closeBooking} className="text-[#767670] text-sm hover:text-[#3A3A34] transition-colors mt-1">
                  Cerrar
                </button>
              </div>
            )}

            {/* ── ESPERA ── */}
            {loginStep === 'espera' && (
              <div className="flex flex-col items-center text-center py-4 gap-4">
                <div className="w-16 h-16 rounded-full flex items-center justify-center" style={{ backgroundColor: '#FEF3C7' }}>
                  <CheckCircle2 size={30} style={{ color: '#D97706' }} />
                </div>
                <div>
                  <p className="text-[#1A1A1A] font-extrabold text-xl">¡En lista de espera!</p>
                  {esperaPos && (
                    <p className="text-[#8E8E86] text-sm mt-1">Eres la <span className="font-bold text-[#1A1A1A]">nº {esperaPos}</span> en la lista.</p>
                  )}
                  <p className="text-[#8E8E86] text-sm mt-1">Si se libera una plaza, te avisaremos por email.</p>
                </div>
                <button onClick={closeBooking}
                  className="w-full py-3 rounded-2xl text-sm font-bold text-[#3A3A34] bg-[#F5F5F1] border border-[#E7E7E0] hover:bg-[#F1F1EC] transition-all">
                  Cerrar
                </button>
              </div>
            )}

            {/* ── LOGIN (magic link) ── */}
            {loginStep === 'login' && (
              <>
                {!enlaceEnviado ? (
                  <>
                    <h2 className="text-[#1A1A1A] font-bold text-lg mb-1">Entra para reservar</h2>
                    <p className="text-[#8E8E86] text-sm mb-5">Te enviamos un enlace de acceso a tu email. Sin contraseñas.</p>
                    <input type="email"
                      placeholder="Tu email"
                      value={loginForm.email}
                      onChange={e => { setLoginForm(f => ({ ...f, email: e.target.value })); setLoginError(''); }}
                      onKeyDown={e => e.key === 'Enter' && handleEnviarEnlace()}
                      autoFocus
                      className="w-full rounded-xl px-4 py-3 text-sm text-[#1A1A1A] placeholder:text-[#767670] outline-none border border-[#E7E7E0] focus:border-[#1A1A1A] transition-colors mb-3"
                      style={{ backgroundColor: '#F5F5F1' }} />
                    {loginError && <p className="text-rose-600 text-sm mb-3">{loginError}</p>}
                    <button onClick={handleEnviarEnlace} disabled={!loginForm.email}
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
                      <p className="text-[#1A1A1A] font-extrabold text-xl">Revisa tu email</p>
                      <p className="text-[#8E8E86] text-sm mt-1">
                        Te enviamos un enlace a <span className="font-semibold text-[#1A1A1A]">{loginForm.email}</span>.
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
                <h2 className="text-[#1A1A1A] font-bold text-lg mb-1">¿Cómo te llamas?</h2>
                <p className="text-[#8E8E86] text-sm mb-5">Completa tu nombre para tu primera reserva.</p>
                <input type="text"
                  placeholder="Tu nombre completo"
                  value={loginForm.nombre}
                  onChange={e => setLoginForm(f => ({ ...f, nombre: e.target.value }))}
                  onKeyDown={e => e.key === 'Enter' && handleRegistroNombre()}
                  autoFocus
                  className="w-full rounded-xl px-4 py-3 text-sm text-[#1A1A1A] placeholder:text-[#767670] outline-none border border-[#E7E7E0] focus:border-[#1A1A1A] transition-colors mb-5"
                  style={{ backgroundColor: '#F5F5F1' }} />
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
                  <h2 className="text-[#1A1A1A] font-bold text-lg">Acepta los términos</h2>
                </div>
                <p className="text-[#8E8E86] text-sm mb-4">
                  Antes de tu primera reserva, lee y acepta los términos de servicio.
                </p>
                <div className="rounded-xl p-3 mb-4 text-[11px] text-[#8E8E86] leading-relaxed overflow-y-auto bg-[#F5F5F1] border border-[#E7E7E0]"
                  style={{ maxHeight: '160px', whiteSpace: 'pre-wrap' }}>
                  {studioConfig.terminosServicio}
                </div>
                <label className="flex items-start gap-2.5 mb-4 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={terminosAceptados}
                    onChange={e => setTerminosAceptados(e.target.checked)}
                    className="mt-0.5 h-4 w-4 shrink-0 accent-[#1A1A1A]"
                  />
                  <span className="text-[#3A3A34] text-xs leading-relaxed">
                    He leído y acepto los términos de servicio y la política de privacidad.
                  </span>
                </label>
                <div className="flex gap-2">
                  <button onClick={() => setLoginStep('login')}
                    className="flex-1 py-3 rounded-2xl text-sm font-semibold text-[#3A3A34] bg-[#F5F5F1] border border-[#E7E7E0] hover:bg-[#F1F1EC] transition-all">
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
                <h2 className="text-[#1A1A1A] font-bold text-lg mb-4">Confirmar reserva</h2>
                <div className="rounded-2xl p-4 mb-4 bg-[#F5F5F1] border border-[#E7E7E0]">
                  <div className="flex items-center gap-2 mb-1.5">
                    <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: bookingSesion.tipo?.color ?? PRIMARY }} />
                    <p className="text-[#1A1A1A] font-bold">{bookingSesion.tipo?.nombre}</p>
                  </div>
                  <p className="text-[#8E8E86] text-sm">{fmtLong(new Date(bookingSesion.inicio))}</p>
                  <p className="text-[#8E8E86] text-sm">{fmtTime(bookingSesion.inicio)} · {bookingSesion.instructor?.nombre}</p>
                  {bookingSesion.ocupadas >= bookingSesion.aforoMaximo && (
                    <p className="text-amber-600 text-xs font-medium mt-2">
                      Clase llena — te apuntaremos en lista de espera
                    </p>
                  )}
                  {studio && studio.cancelacionVentanaHoras > 0 && (
                    <p className="text-[#767670] text-xs mt-2">
                      Cancela con al menos {studio.cancelacionVentanaHoras}h de antelación para recuperar tu sesión.
                    </p>
                  )}
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
                      <p className="text-[#3A3A34] text-xs font-semibold mb-2">
                        Elige tu sitio <span className="text-[#767670] font-normal">(opcional)</span>
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
                  <p className="text-[#8E8E86] text-sm">
                    <span className="text-[#1A1A1A] font-semibold">{socia?.nombre ?? loginForm.nombre}</span>
                    <span className="mx-1">·</span>{socia?.email ?? usuarioEmail}
                  </p>
                </div>
                {gateError && (
                  <div className="mb-3 px-4 py-3 rounded-xl text-sm text-rose-600 bg-rose-50 border border-rose-200">
                    {gateError}
                  </div>
                )}
                <button onClick={handleConfirm}
                  className="w-full py-3 rounded-2xl font-bold text-white"
                  style={{ backgroundColor: PRIMARY }}>
                  Confirmar reserva
                </button>
              </>
            )}
          </>
        )}
      </PublicSheet>

      {/* ── MODAL CANCELAR PLAZA (sustituye al confirm() nativo) ─────────────── */}
      <PublicSheet open={cancelConfirm !== null} onClose={() => setCancelConfirm(null)} label="Cancelar tu plaza">
        {cancelConfirm && (
          <>
            <h2 className="text-[#1A1A1A] font-bold text-lg mb-1">¿Cancelar tu plaza?</h2>
            <p className="text-[#6E6E66] text-sm mb-5">
              {cancelConfirm.pierdeBono
                ? `Estás cancelando con menos de ${cancelConfirm.ventana}h de antelación: no se te devolverá la sesión del bono.`
                : 'Liberarás tu plaza para otra persona.'}
            </p>
            <div className="flex gap-2">
              <button onClick={() => setCancelConfirm(null)}
                className="flex-1 py-3 rounded-2xl text-sm font-semibold text-[#3A3A34] bg-[#F5F5F1] border border-[#E7E7E0] hover:bg-[#F1F1EC] transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1A1A1A]/20">
                Volver
              </button>
              <button onClick={() => { cancelarReserva(cancelConfirm.reservaId); setCancelConfirm(null); }}
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
            <div className="flex items-center justify-between px-6 py-4 border-b border-[#F1F1EC]">
              <h2 className="text-[#1A1A1A] font-bold text-base">{legalDoc.label}</h2>
              <button onClick={() => setLegalDoc(null)} aria-label="Cerrar" className="text-[#767670] hover:text-[#3A3A34] transition-colors">
                <X size={18} />
              </button>
            </div>
            {/* El texto lo edita el dueño del estudio; se renderiza como texto
                (React escapa), nunca como HTML. */}
            <div className="px-6 py-5 overflow-y-auto text-[13px] text-[#3A3A34] leading-relaxed" style={{ whiteSpace: 'pre-wrap' }}>
              {legalDoc.text}
            </div>
          </>
        )}
      </PublicSheet>
    </div>
  );
}
