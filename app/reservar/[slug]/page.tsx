'use client';
import { queImparten } from '@/lib/equipo';

import { useState, useMemo, useEffect, useRef } from 'react';
import dynamic from 'next/dynamic';
import { useSearchParams, useParams, useRouter } from 'next/navigation';
import { useStudio, type ResultadoReserva } from '@/lib/studio-context';
import { textoLegalCompleto } from '@/lib/legal-textos';
import { useSociaSession } from '@/lib/use-socia-session';
import { PlanTarifa, type Reserva } from '@/lib/types';
import { tieneEntitlementActivo, hayAlgoQueContratar } from '@/lib/bono-logic';
import {
  contarReservasActivasFuturas, esCancelacionTardia,
  heredaOverride, puedeReservarPorAntelacionMaxima, puedeReservarPorVentanaMinima,
} from '@/lib/booking-logic';
import type { ReservaSlot } from '@/components/reserva/reserva-calendario';
import { DiscoveryQuiz } from '@/components/reserva/discovery-quiz';
import { PublicSheet } from '@/components/ui/public-sheet';
import { RejillaSemana } from '@/components/reserva/rejilla-semana';
import { RailFiltros } from '@/components/reserva/rail-filtros';
import { cuantosFiltros } from '@/lib/reservar/filtros-clases';
import { claseSirvePara } from '@/lib/reservar/objetivos';
import { cifrasVisibles, mereceBanda } from '@/lib/reservar/cifras';
import { seccionVisible, ordenarSecciones } from '@/lib/reservar/secciones';
import { frasePlazoCancelacion, fraseAntelacionMinima } from '@/lib/reservar/promesas';
import { MODO_TOKENS } from '@/lib/portal-modo';
import { useCaptcha, ERROR_CAPTCHA } from '@/components/auth/turnstile-widget';
import { horarioPublico, precioPorClase } from '@/lib/estudio-publico';
import { ahorroPorcentaje } from '@/lib/reservar/ahorro-plan';
import { serif, sans, cq, radius as R, shadow as SH, eyebrow, containerRoot } from '@/lib/reservar-publico-tokens';
import { resolverHrefBloque } from '@/lib/portal-home-bloques';
import {
  Users, CheckCircle2, X, Calendar,
  CreditCard, FileText, Download, ExternalLink, Mail,
} from 'lucide-react';

// Code-splitting (audit de rendimiento de los widgets embebibles): cada tab
// de este widget (clases / citas 1:1 / mis reservas / planes) es
// autoexcluyente — solo una está montada a la vez — pero antes las cuatro se
// importaban de forma estática, así que un iframe embebido en la web del
// estudio para SOLO citas 1:1 cargaba también el bundle entero del calendario
// de clases (y viceversa) sin usarlo nunca. `ssr: false` es seguro aquí: todo
// el widget ya es 'use client' y ambos componentes leen `window`/interacción
// de usuario.
const ReservaCalendario = dynamic(
  () => import('@/components/reserva/reserva-calendario').then((m) => m.ReservaCalendario),
  { ssr: false, loading: () => <div style={{ padding: '48px 0', textAlign: 'center', color: 'var(--portal-muted-2)' }}>Cargando calendario…</div> },
);
const CitasPublica = dynamic(
  () => import('@/components/reserva/citas-publica').then((m) => m.CitasPublica),
  { ssr: false, loading: () => <div style={{ padding: '48px 0', textAlign: 'center', color: 'var(--portal-muted-2)' }}>Cargando citas…</div> },
);

// Redes sociales del pie de página (Fase 3 del Theme Builder, lib/theme-schema.ts
// → RedSocialId) — orden y etiqueta de cada icono del pie.
const REDES_SOCIALES: { id: 'instagram' | 'facebook' | 'whatsapp'; label: string }[] = [
  { id: 'instagram', label: 'Instagram' },
  { id: 'facebook', label: 'Facebook' },
  { id: 'whatsapp', label: 'WhatsApp' },
];

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
// Franja horaria del discovery quiz — misma hora local sin timezone fija
// que ya usa `fmtTime` para mostrar la hora de la sesión al visitante.
function horarioDeSesion(iso: string): 'manana' | 'mediodia' | 'tarde' {
  const h = new Date(iso).getHours();
  if (h < 12) return 'manana';
  if (h < 17) return 'mediodia';
  return 'tarde';
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
// Cada pestaña es también un widget embebible por separado (Configuración >
// Estudio > Enlaces genera un <iframe ?embed=1&tab=…> distinto por cada una)
// — de ahí que valga la pena validar el ?tab= de la URL contra esta lista en
// vez de leerlo a ciegas.
const TAB_IDS: readonly Tab[] = ['clases', 'citas', 'misreservas', 'estudio'];
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

// Mínimo razonable de dígitos para un teléfono real (España: 9). No se valida
// prefijo — el estudio contacta por WhatsApp/llamada, un formato demasiado
// estricto rechazaría números correctos de otros países sin aportar nada.
function telefonoValido(telefono: string): boolean {
  return telefono.replace(/[^0-9]/g, '').length >= 9;
}

export default function ReservarPage() {
  const {
    sesiones, reservas, socios, tiposClase, salas, instructores, spots,
    planesTarifa, suscripciones, studioConfig, studio, redesSociales,
    addReserva, updateSocio, cancelarReserva, addSocioFromPortal, planMasElegidoId, sustitucionesConfirmadas, textosReservar, ordenReservar,
    citasServicios, citasDisponibilidad, citas, reservarCitaPublica, cancelarCita,
  } = useStudio();
  const estudioNombre = studio?.nombre ?? 'Tentare';
  const estudioLogo = studio?.logoUrl ?? null;
  const estudioDireccion = [studio?.ciudad, studio?.direccion].filter(Boolean).join(' · ') || 'Málaga · Calle Larios 12';
  const estudioEmail = studio?.email ?? 'hola@tentare.es';
  const estudioTelefono = studio?.telefono ?? '+34 951 000 000';
  // La foto de portada. `fotoUrl` es la del estudio y `imagenBienvenidaUrl` la
  // que ya se usa en la bienvenida del portal — se prefiere la primera y se cae
  // a la segunda para no pedirle al estudio que suba dos veces lo mismo.
  // Sin ninguna de las dos, el hero se queda a una columna (ver el grid).
  const heroFoto = studio?.fotoUrl || studio?.imagenBienvenidaUrl || null;
  const params = useParams();
  const slug = String(params?.slug ?? '');
  const { socia, usuarioEmail, autenticado, enviarEnlace, loginConPassword, logout, refrescar } = useSociaSession(slug);
  const searchParams = useSearchParams();
  const router = useRouter();
  const refCode = searchParams.get('ref');
  // Modo embebido (widget en la web del estudio, vía <iframe>): oculta la
  // cabecera y el hero grandes — ya viven en la web anfitriona — y deja
  // solo pestañas + contenido. Nunca cambia lógica de negocio, solo layout.
  const embedMode = searchParams.get('embed') === '1';

  const [mounted, setMounted] = useState(false);
  // `now` en estado, con reloj de un minuto. Antes era
  // `useMemo(() => now.getTime(), [mounted])`, o sea que quedaba CONGELADO en
  // el instante del montaje — y de él sale `slots`, que filtra `inicio > nowMs`
  // para decidir qué clases se pueden reservar. Una pestaña abierta un rato
  // seguía ofreciendo clases que ya habían empezado, y la reserva fallaba
  // después contra el servidor. Es exactamente la trampa que documenta
  // dashboard/page.tsx al descartar `useMemo([mounted])`.
  const [now, setNow] = useState(FECHA_PLACEHOLDER_SSR);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- Guarda de hidratación: el SSR pinta una fecha fija y el cliente pasa a la real tras montar. El segundo render es el OBJETIVO; derivarlo en render rompería la hidratación.
    setMounted(true);
    setNow(new Date());
    const t = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(t);
  }, []);

  const [filtroTipo, setFiltroTipo] = useState('');
  // Filtros del discovery quiz (ver components/reserva/discovery-quiz.tsx) —
  // se aplican en el mismo useMemo de `slots` que ya filtraba por
  // `filtroTipo`, sin fetch nuevo: son comparaciones directas sobre campos
  // que sesionesRich ya trae (nivel de tipo, hora/día de `inicio`).
  const [filtroNivel, setFiltroNivel] = useState('');
  const [filtroHorario, setFiltroHorario] = useState<'' | 'manana' | 'mediodia' | 'tarde'>('');
  const [filtroDias, setFiltroDias] = useState<number[]>([]);
  // Filtrar por instructora faltaba, y es de las tres formas en que se elige
  // cuando ya conoces el estudio (con quién, qué día, a qué hora).
  const [filtroInstructor, setFiltroInstructor] = useState('');
  // Objetivo del asistente. No está en el rail a propósito: el rail filtra por
  // hechos de la clase (tipo, quién, nivel, hora); el objetivo es una pregunta
  // sobre la clienta, y solo tiene sentido dentro del asistente que la hace.
  const [filtroObjetivo, setFiltroObjetivo] = useState('');
  // `null` hasta que el efecto de sessionStorage decida (evita el flash de
  // "mostrar banner → ocultarlo" en cada carga si ya se descartó antes).
  const [bannerQuizVisible, setBannerQuizVisible] = useState<boolean | null>(null);
  const [quizAbierto, setQuizAbierto] = useState(false);
  const [quizCompletado, setQuizCompletado] = useState(false);
  const [quizPaso, setQuizPaso] = useState(0);
  // Descartar el banner ("No, gracias") lo oculta solo para esta VISITA —
  // sessionStorage, no localStorage: no hay razón para esconder algo útil
  // para siempre en visitas futuras.
  const bannerQuizKey = `tentare-discovery-oculto-${slug}`;
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- Lee sessionStorage (no disponible en SSR) tras montar; el segundo render es el objetivo.
    setBannerQuizVisible(sessionStorage.getItem(bannerQuizKey) !== '1');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  function descartarQuizBanner() {
    sessionStorage.setItem(bannerQuizKey, '1');
    setBannerQuizVisible(false);
  }
  // Solo los niveles que ESTE estudio ofrece de verdad — nunca mostrar
  // "Avanzado" en el quiz si ninguna de sus clases lo es.
  const nivelesDisponibles = useMemo(
    () => [...new Set(tiposClase.map(t => t.nivel).filter(n => !!n && n !== 'TODOS'))],
    [tiposClase],
  );
  // Especialidades de cada instructora (P1 auditoría Momence-vs-Tentare) —
  // NO es un campo nuevo, se deriva de qué tipos de clase imparte de verdad
  // con los datos que esta página ya carga (sesiones/tiposClase), igual que
  // ya se hizo con nivelesDisponibles arriba: nunca inventar una categoría.
  const especialidadesPorInstructor = useMemo(() => {
    const tiposById = new Map(tiposClase.map(t => [t.id, t.nombre]));
    const porInstructor = new Map<string, Set<string>>();
    for (const s of sesiones) {
      if (!s.instructorId) continue;
      const nombreTipo = tiposById.get(s.tipoClaseId);
      if (!nombreTipo) continue;
      const set = porInstructor.get(s.instructorId) ?? new Set<string>();
      set.add(nombreTipo);
      porInstructor.set(s.instructorId, set);
    }
    return porInstructor;
  }, [sesiones, tiposClase]);
  const hayFiltrosQuizActivos = filtroNivel !== '' || filtroHorario !== '' || filtroDias.length > 0 || filtroInstructor !== '' || filtroObjetivo !== '';
  function reiniciarFiltrosQuiz() {
    setFiltroTipo(''); setFiltroNivel(''); setFiltroHorario(''); setFiltroDias([]);
    setQuizCompletado(false);
  }
  const tabInicial = searchParams.get('tab');
  // Lista / Semana / Día, como en el diseño. Las tres pintan LOS MISMOS slots
  // ya cargados y filtrados: no hay una carga por vista, solo una forma
  // distinta de leer lo mismo.
  const [vistaClases, setVistaClases] = useState<'lista' | 'semana' | 'dia'>('dia');
  const [tab, setTab] = useState<Tab>(
    TAB_IDS.includes(tabInicial as Tab) ? (tabInicial as Tab) : 'clases',
  );

  // Auto-resize del <iframe> embebido (audit de rendimiento de los widgets):
  // el código que se copia en tab-api.tsx fija un `height` en px por widget —
  // un contenido más corto o más largo que ese valor deja hueco muerto o
  // recorta contenido y obliga a hacer scroll DENTRO del iframe. Se avisa a
  // la ventana padre con la altura real del documento cada vez que cambia
  // (cambio de tab, expandir un desplegable, cargar más clases…); el snippet
  // que se copia junto al iframe (tab-api.tsx) escucha este mensaje y ajusta
  // el alto. Sin efecto si el widget no está embebido en un iframe ajeno.
  useEffect(() => {
    if (!embedMode || typeof window === 'undefined' || window.parent === window) return;
    const enviarAltura = () => {
      window.parent.postMessage({ tentareEmbedAltura: document.documentElement.scrollHeight, tentareSlug: slug }, '*');
    };
    enviarAltura();
    const obs = new ResizeObserver(enviarAltura);
    obs.observe(document.documentElement);
    return () => obs.disconnect();
  }, [embedMode, slug, tab]);

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
  const [loginForm, setLoginForm] = useState({ nombre: '', email: '', telefono: '' });
  const [loginStep, setLoginStep] = useState<Step>('login');
  const [enlaceEnviado, setEnlaceEnviado] = useState(false);
  // Login con contraseña (día a día, sin depender del viaje de email — ver
  // lib/use-socia-session.ts): alternativa al enlace mágico dentro del mismo
  // paso 'login', para quien ya se creó una contraseña una vez. Un widget
  // embebido en un <iframe> de tercero no puede fiarse de que el navegador
  // comparta sesión entre pestañas (Safari/Chrome recortan ese acceso cada
  // vez más), así que esto es lo que hace viable volver sin salir del widget.
  const [mostrarPasswordLogin, setMostrarPasswordLogin] = useState(false);
  const [loginPassword, setLoginPassword] = useState('');
  const [enviandoLoginPassword, setEnviandoLoginPassword] = useState(false);
  // Si ya tiene contraseña propia (entró con loginConPassword, o la fijó
  // alguna vez desde /acceso), la pantalla de confirmación no debe seguir
  // ofreciendo "crea tu contraseña" — ya no es cierto. El paso 'registro' YA
  // NO pide contraseña (P0 "reservar sin cuenta": el enlace mágico ya
  // verifica el email, pedir además una contraseña aquí era un paso de más
  // que Momence, el competidor auditado, ni siquiera exige) — este flag solo
  // puede llegar a `true` por loginConPassword. No se resetea en
  // openBooking()/closeBooking(): sigue siendo verdad para el resto de la
  // visita aunque se abra otra reserva.
  const [tienePasswordPropia, setTienePasswordPropia] = useState(false);
  const [enviandoEnlace, setEnviandoEnlace] = useState(false);
  const [loginError, setLoginError] = useState('');
  const [gateError, setGateError] = useState('');
  const [errorCancelar, setErrorCancelar] = useState<string | null>(null);
  const [cancelandoPlaza, setCancelandoPlaza] = useState(false);
  // Sin NEXT_PUBLIC_TURNSTILE_SITE_KEY configurada, el widget no se pinta y
  // esto nunca bloquea el envío — mismo comportamiento que /login.
  const { widget: captcha, pedirToken } = useCaptcha();

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

  // `now` es estable entre ticks del reloj (viene de estado), así que esto no
  // necesita memo: solo cambia de identidad cuando cambia de verdad la hora.
  const nowMs = now.getTime();

  // Deep-link a una sesión concreta: si volvemos con ?sesion=<id> abrimos su
  // reserva (una sola vez) en cuanto los datos estén cargados. Dos orígenes:
  // el enlace mágico (la socia ya está autenticada) Y el widget "Reserva
  // esta clase" (tab-api.tsx) — este último llega a visitantes ANÓNIMAS
  // (un post, una story, un newsletter), así que YA NO se exige
  // `autenticado` para esta rama: `openBooking()` sabe manejar el caso sin
  // sesión (abre el paso 'login' guardando `bookingSesionId`, y el efecto de
  // más abajo retoma la reserva en cuanto se autentica). Antes exigir
  // `autenticado` aquí dejaba el widget nuevo mostrando el calendario
  // genérico en vez de la clase concreta a la primera visita, que es
  // exactamente el caso de uso que lo motivó.
  //
  // Sin ?sesion (acceso genérico, ver enviarEnlace en use-socia-session.ts) el
  // enlace lleva ?acceso=1: mismo mecanismo, pero reabre el modal en el paso
  // que toque (registro/contrato) sin necesitar una clase concreta — antes no
  // pasaba nada al volver del correo y había que pulsar "Acceder" otra vez.
  // Esta rama SÍ depende del magic link, así que sigue exigiendo `autenticado`.
  const deepLinkHecho = useRef(false);
  useEffect(() => {
    if (!mounted || deepLinkHecho.current) return;
    const sesionDeepLink = searchParams.get('sesion');
    if (sesionDeepLink) {
      if (!sesiones.some(s => s.id === sesionDeepLink)) return; // esperar a que carguen
      deepLinkHecho.current = true;
      // eslint-disable-next-line react-hooks/set-state-in-effect -- Deep link: lee searchParams para abrir una reserva concreta. Depende de la URL, no de props ni estado.
      setTab('clases');
      openBooking(sesionDeepLink);
    } else if (autenticado && searchParams.get('acceso') === '1') {
      deepLinkHecho.current = true;
      openBooking('');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mounted, autenticado, sesiones, searchParams]);

  // Login con contraseña (loginConPassword, sin viaje de email): a diferencia
  // del magic link, no navega la página ni añade ?sesion=/?acceso=1 a la URL,
  // así que el useEffect de deep-link de arriba nunca se dispara para él. Sin
  // esto, tras un login con contraseña correcto el modal se quedaba clavado
  // en el paso 'login' (autenticado/socia se actualizan, pero nada vuelve a
  // llamar a openBooking() para decidir el siguiente paso).
  useEffect(() => {
    if (bookingSesionId === null || loginStep !== 'login' || !autenticado) return;
    openBooking(bookingSesionId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autenticado, socia]);

  // Retorno de Stripe tras comprar un plan (ver lib/billing/origen-pago.ts,
  // urlsDeRetorno: `${appUrl}/reservar/${slug}?compra=ok|cancelada`). Antes
  // este parámetro no se leía en ningún sitio — la socia volvía a la MISMA
  // pantalla de siempre sin ninguna confirmación de que su pago funcionó,
  // incluso en el camino feliz normal. El mensaje de éxito es
  // deliberadamente "en unos segundos", no "ya está": la entrega real del
  // plan ocurre en el webhook (async), no en este redirect — sigue siendo
  // honesto también en el caso raro de que el plan se borrara justo entre
  // medias (el cobro ya se hizo; el equipo recibe la alerta de Sentry para
  // resolverlo a mano, ver lib/billing/entregar-plan-comprado.ts).
  const [pagoAviso, setPagoAviso] = useState<'ok' | 'cancelada' | null>(null);
  useEffect(() => {
    const compra = searchParams.get('compra');
    if (compra !== 'ok' && compra !== 'cancelada') return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- Lee el parámetro de retorno de Stripe una sola vez y limpia la URL a continuación; depende de la URL, no de props ni estado.
    setPagoAviso(compra);
    const limpio = new URLSearchParams(searchParams.toString());
    limpio.delete('compra');
    router.replace(`/reservar/${slug}${limpio.toString() ? `?${limpio.toString()}` : ''}`, { scroll: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
    // P1 auditoría Momence: qué instructora daba originalmente cada sesión,
    // solo para las que tienen una sustitución YA confirmada.
    const originalPorSesion = new Map(
      sustitucionesConfirmadas.map(s => [s.sesionId, s.instructorOriginalId]),
    );
    return sesiones.map(s => ({
      ...s,
      tipo: tiposById.get(s.tipoClaseId),
      sala: salasById.get(s.salaId),
      instructor: instrById.get(s.instructorId),
      instructorOriginalNombre: instrById.get(originalPorSesion.get(s.id) ?? '')?.nombre ?? null,
      ocupadas: ocupadasPorSesion.get(s.id) ?? 0,
    }));
  }, [sesiones, tiposClase, salas, instructores, reservas, sustitucionesConfirmadas]);

  // ⚠️ Las opciones del rail salen de las clases SIN filtrar. Contándolas sobre
  // las ya filtradas, elegir «Laura» dejaría su desplegable con una sola opción
  // —ella— y no habría forma de volver a ver el resto: el filtro se cerraría
  // sobre sí mismo.
  const slotsParaFiltros = useMemo(() => sesionesRich
    .filter(s => new Date(s.inicio).getTime() > nowMs && !s.cancelada)
    .map(s => ({
      tipoClaseId: s.tipoClaseId,
      nivel: s.tipo?.nivel ?? 'TODOS',
      instructorNombre: s.instructor?.nombre ?? null,
      horario: horarioDeSesion(s.inicio),
    })), [sesionesRich, nowMs]);

  // La banda de cifras. Solo se cuentan datos que YA viajan en la carga
  // pública — nada se escribe a mano, y lo que no se puede contar no se pinta
  // (ver lib/reservar/cifras.ts).
  //
  // ⚠️ Faltan «alumnas» y «sedes» del diseño, y no es un olvido: `socios` no
  // viaja para una visitante anónima —ni debe—, y las sedes de una cadena
  // tampoco están en este payload. Enseñar cualquiera de las dos exige una
  // decisión de qué se publica, no una línea más aquí.
  const cifras = useMemo(() => {
    const semana = nowMs + 7 * 24 * 60 * 60 * 1000;
    const futuras = sesionesRich.filter(s => {
      const t = new Date(s.inicio).getTime();
      return t > nowMs && t <= semana && !s.cancelada;
    });
    return cifrasVisibles({
      clasesSemana: futuras.length,
      // Instructoras que DAN CLASE, no las dadas de alta: es la cifra que la
      // clienta puede comprobar mirando el horario.
      instructoras: new Set(futuras.map(s => s.instructor?.id).filter(Boolean)).size,
    });
  }, [sesionesRich, nowMs]);

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
      .filter(s => !filtroNivel || (s.tipo?.nivel ?? 'TODOS') === filtroNivel)
      .filter(s => !filtroInstructor || s.instructor?.nombre === filtroInstructor)
      .filter(s => claseSirvePara({ objetivos: s.tipo?.objetivos ?? null }, filtroObjetivo))
      .filter(s => !filtroHorario || horarioDeSesion(s.inicio) === filtroHorario)
      .filter(s => filtroDias.length === 0 || filtroDias.includes(new Date(s.inicio).getDay()))
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
          instructorOriginalNombre: s.instructorOriginalNombre,
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
  }, [sesionesRich, nowMs, filtroTipo, filtroNivel, filtroHorario, filtroDias, filtroInstructor, filtroObjetivo, miReservaPorSesion, ocupadasPorSesion, spotsActivosPorSala, spotsOcupadosPorSesion, cubierta, precioClaseSuelta]);

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
          // ⚠️ Antes decía «en la pestaña "El estudio"». Los bonos ya no viven
          // ahí, y un aviso que manda a un sitio donde no está lo que promete
          // es peor que uno genérico — es el mismo tipo de error que un enlace
          // roto, pero sin que nadie lo note.
          : 'Necesitas un plan o bono activo para reservar. Los tienes más abajo, en «Bonos y membresías».';
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

  // Alta de la ficha de una walk-in (autenticada por magic link, sin ficha
  // todavía). Extraído para reutilizar entre handleConfirm (reservando una
  // clase) y handleSignContract (acceso genérico sin clase que reservar) —
  // antes solo vivía dentro de handleConfirm, así que el acceso genérico
  // (botón "Acceder" de la cabecera, sesionId='') nunca llegaba a crear la
  // ficha: se quedaba esperando un paso "confirmar" que no tenía sesión que
  // mostrar y no se pintaba nunca.
  async function crearAltaWalkIn(id: string) {
    const referidoValido = refCode && refCode !== id && socios.some(s => s.id === refCode) ? refCode : null;
    return addSocioFromPortal({
      id,
      nombre: loginForm.nombre.trim(),
      telefono: loginForm.telefono.trim(),
      email: usuarioEmail ?? '',
      aceptacionContrato: {
        fecha: new Date().toISOString(),
        firma: loginForm.nombre.trim(),
        versionTexto: textoLegalCompleto(studioConfig),
        origen: 'PORTAL',
      },
      referidoPor: referidoValido,
      // P1 auditoría Momence: valor CRUDO de `?ref=`, no `referidoValido` —
      // uno es la cadena de atribución a guardar, el otro solo la lógica de
      // recompensa entre socias.
      origenLead: refCode ?? null,
    });
  }

  function openBooking(sesionId: string) {
    setBookingSesionId(sesionId);
    setTerminosAceptados(false);
    setEnlaceEnviado(false);
    setLoginError('');
    setGateError('');
    setSelectedSpot(null);
    setMostrarPasswordLogin(false);
    setLoginPassword('');
    if (!autenticado) {
      setLoginStep('login');
    } else if (socia) {
      const found = socios.find(s => s.id === socia.socioId);
      const needsContract = !found?.aceptacionContrato;
      if (needsContract) {
        setLoginStep('contrato');
      } else if (sesionId) {
        setLoginStep('confirm');
      } else {
        // Acceso genérico (botón "Acceder" de la cabecera, sin clase elegida):
        // ya está todo hecho — autenticada, con ficha, contrato firmado — y no
        // hay ninguna sesión que confirmar. Sin este caso se abría el modal en
        // el paso 'confirm' con bookingSesion=null: pantalla en blanco, solo la
        // X para cerrar (encontrado en producción). Se cierra directo.
        closeBooking();
      }
    } else {
      // Autenticada por magic link pero aún sin ficha (walk-in): pedir nombre.
      setLoginStep('registro');
    }
  }

  function closeBooking() {
    setBookingSesionId(null); setLoginStep('login'); setTerminosAceptados(false); setEnlaceEnviado(false);
    setMostrarPasswordLogin(false); setLoginPassword('');
  }

  // Magic link: envía el enlace de acceso al email (ya no mete dentro con solo
  // nombre+email). La socia entra al pulsar el enlace del correo.
  async function handleEnviarEnlace() {
    if (!loginForm.email.trim() || enviandoEnlace) return;
    setLoginError('');
    // El estado de carga se enciende ANTES de pedir el token, no después:
    // el captcha tarda ~3,5 s en resolverse por dentro, y sin esto el botón
    // se quedaba mudo todo ese rato y admitía un segundo clic.
    setEnviandoEnlace(true);
    try {
      // Propaga la clase elegida al enlace mágico (si la hay) para volver directa
      // a su confirmación — evita la fuga de conversión de re-buscar la clase.
      const token = await pedirToken();
      if (token === null) { setLoginError(ERROR_CAPTCHA); return; }
      const r = await enviarEnlace(loginForm.email, bookingSesionId || undefined, token || undefined);
      if ('error' in r) { setLoginError(r.error); return; }
      setEnlaceEnviado(true);
    } finally {
      setEnviandoEnlace(false);
    }
  }

  // Login del día a día para quien ya se creó una contraseña (ver paso
  // 'registro' más abajo) — evita el viaje de email cada vez que vuelve.
  async function handleLoginConPassword() {
    if (!loginForm.email.trim() || !loginPassword || enviandoLoginPassword) return;
    setLoginError('');
    setEnviandoLoginPassword(true);
    try {
      const token = await pedirToken();
      if (token === null) { setLoginError(ERROR_CAPTCHA); return; }
      const r = await loginConPassword(loginForm.email, loginPassword, token || undefined);
      if ('error' in r) { setLoginError(r.error); return; }
      setTienePasswordPropia(true);
      // La sesión de Supabase ya está activa (onAuthStateChange en
      // use-socia-session.ts la resuelve); un useEffect propio (ver más abajo,
      // junto al deep-link del magic link) reevalúa el paso del modal en
      // cuanto `autenticado`/`socia` se actualicen.
    } finally {
      setEnviandoLoginPassword(false);
    }
  }

  // Walk-in ya autenticada por enlace mágico: solo pide nombre + teléfono.
  // P0 "reservar sin cuenta" (auditoría Momence vs Tentare): antes este paso
  // exigía además fijar contraseña — el enlace mágico YA verifica el email,
  // así que era un paso de más que ni el competidor auditado exige. Quien
  // quiera volver sin depender del email cada vez puede fijarla más tarde
  // desde /acceso (ver el enlace "Crea tu contraseña" en el paso 'done').
  async function handleRegistroNombre() {
    if (!loginForm.nombre.trim() || !telefonoValido(loginForm.telefono)) return;
    setLoginError('');
    setLoginStep('contrato');
  }

  async function handleSignContract() {
    if (socia?.socioId) {
      const res = await updateSocio(socia.socioId, {
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
      // Sin consentimiento guardado no se sigue: avanzar dejaría al estudio
      // creyendo que lo tiene.
      if (!res.ok) { setGateError(res.error); return; }
    } else if (!bookingSesionId) {
      // Walk-in en acceso genérico (sin clase elegida): no hay un paso
      // "confirmar" al que enganchar la alta — con clase (bookingSesionId
      // truthy) se pospone a handleConfirm a propósito, para no crear la
      // ficha si el gate de derechos o el aforo la rechazan después; aquí no
      // hay nada más que pueda rechazarla, así que se crea ya.
      const nuevoId = `soc-${Date.now()}`;
      const altaRes = await crearAltaWalkIn(nuevoId);
      if (!altaRes.ok) { setGateError(altaRes.error); return; }
      await refrescar();
      closeBooking();
      return;
    }
    // Con clase pendiente hay algo que confirmar; en acceso genérico ya
    // está todo hecho (ficha existente + contrato recién firmado arriba).
    if (bookingSesionId) { setLoginStep('confirm'); } else { closeBooking(); }
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
        // Walk-in: alta de la ficha (crearAltaWalkIn, compartida con el acceso
        // genérico de handleSignContract). El servidor la vincula a su
        // auth_user_id a partir del JWT (magic link) y usa el email del token;
        // el nombre/teléfono los puso en el paso "registro". Se AWAITea para
        // que la reserva la encuentre.
        const nuevoId = `soc-${Date.now()}`;
        const altaRes = await crearAltaWalkIn(nuevoId);
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
          // P1 auditoría Momence: lead-id del widget, viaja en la metadata de
          // Stripe hasta entregarPlanComprado (ver origenLead ahí). Se lee
          // `searchParams.get('ref')` directo, no la variable `refCode` de
          // arriba: referenciarla aquí disparaba 3 falsos positivos del
          // linter de React Compiler en funciones sin relación (hoisting de
          // `openBooking`, `Date.now` en `handleSignContract`, mutación de
          // `window.top`) — mismo valor, sin ese efecto colateral.
          origenLead: searchParams.get('ref') ?? null,
        }),
      });
      const data = await res.json() as { url?: string; error?: string };
      if (data.url) {
        // Escapa del <iframe> del widget embebido: navegar la propia ventana
        // (window.location) mandaría el checkout de Stripe DENTRO del iframe
        // de la web del estudio, algo para lo que Stripe no está pensado
        // (en el mejor caso se ve mal, en el peor el navegador lo bloquea).
        // `window.top` es la ventana de nivel superior real tanto si el
        // widget está embebido como si no (entonces top === window, mismo
        // efecto de siempre en /reservar/[slug] visitado directo).
        (window.top ?? window).location.href = data.url;
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
      <div className="min-h-dvh bg-[var(--portal-bg)]">
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

  // F0 · POR-1: no ofrecer planes a 0 € como contratables en público
  // (cualquiera obtendría clases gratis). El precio > 0 es requisito del
  // checkout de Stripe igualmente.
  //
  // Sale del JSX a una constante porque ahora se pregunta DOS veces: para
  // pintar las tarjetas y para decidir si la sección existe siquiera.
  const planesContratables = planesTarifa.filter(p => p.activo && p.precio > 0);

  // Lo que la página promete antes de reservar. Puro y probado aparte: el paso
  // de «hasta 12 h» a «hasta 24 h, según la clase» depende de una tabla de
  // casos (heredan / no heredan / coinciden / ninguna tiene plazo) que no se
  // puede comprobar a ojo mirando una sola pantalla.
  const reglasEstudio = {
    cancelacionVentanaHoras: studio?.cancelacionVentanaHoras ?? 0,
    reservaVentanaMinimaMinutos: studio?.reservaVentanaMinimaMinutos ?? 0,
  };
  const plazoCancelacion = frasePlazoCancelacion(reglasEstudio, tiposClase);
  const antelacionMinima = fraseAntelacionMinima(reglasEstudio, tiposClase);

  const tabs = [['clases', 'Clases'], ['citas', 'Citas'], ['misreservas', 'Mis reservas'], ['estudio', 'El estudio']] as const;

  // ── Orden y visibilidad de las secciones ───────────────────────────────────
  // Lo decide el estudio desde el editor de Apariencia. La resolución sale de
  // `ordenarSecciones`, la MISMA función que pinta el rail del editor: aquí no
  // se vuelve a decidir nada, así que el rail no puede prometer un orden que
  // esta página no cumpla.
  //
  // ⚠️ Se reordena con `order` de CSS sobre un contenedor flex, **sin mover el
  // DOM** — la misma técnica que ya usa `portal-home-view.tsx`. La alternativa
  // era extraer las ~500 líneas de contenido de pestañas a una variable para
  // poder emitirlas en orden: medio fichero movido por algo que el navegador
  // hace solo.
  //
  // El precio, que es real y conviene tener escrito: el orden de tabulación y
  // el de un lector de pantalla siguen el DOM, no lo que se ve. Solo afecta a
  // quien reordene de verdad — sin tocar nada, los dos órdenes coinciden.
  const posicionSeccion = new Map(ordenarSecciones(ordenReservar).map((s, i) => [s.id, i]));
  const orden = (id: string) => posicionSeccion.get(id) ?? 0;

  return (
    <div style={{ ...containerRoot, width: '100%', minHeight: '100vh', background: 'var(--portal-bg)', color: 'var(--portal-ink)', fontFamily: sans, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>

      {/* ── HERO ──────────────────────────────────────────────────────────────
          ⚠️ Aquí ponía que la foto del estudio «no existe hoy en la carga
          pública (`studioPublico()` no expone `fotoUrl` — solo `logoUrl`)».
          **Eso dejó de ser verdad y el comentario lo mantuvo enterrado**:
          `studioPublico()` expone `fotoUrl` E `imagenBienvenidaUrl` desde que
          se arregló la lista blanca para el hero del portal. O sea que la
          fotografía del mockup se podía pintar desde hace tiempo y nadie la
          pintaba porque este párrafo decía que no se podía.
          Es el mismo fallo que ya costó un hero desplegado y muerto: un dato
          que sí viaja, y una nota que asegura que no. */}
      {/* ⚠️ UNA sola caja para barra + portada + pestañas, y no tres.
          `RT.hero` es un `linear-gradient(175deg, …)`, y un degradado se pinta
          por CAJA: partirlo lo reinicia en cada trozo y deja dos costuras
          horizontales en la página de todos los estudios. Se probó partido —
          para poder mover la portada por separado— y las capturas antes/después
          lo enseñaron sin lugar a dudas. Por eso la portada va ANCLADA al
          horario (`SECCIONES_ANCLADAS`): se puede ocultar, no mover. */}
      <div style={{ order: orden('horario'), position: 'relative', overflow: 'hidden', background: embedMode ? 'var(--portal-bg)' : RT.hero }}>
        {!embedMode && (
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
        )}

        {/* ── PORTADA ───────────────────────────────────────────────────────
            Se OCULTA (lo que pide quien incrusta esto bajo la cabecera que ya
            tiene su web), pero no se mueve — ver la nota del degradado arriba. */}
        {!embedMode && seccionVisible('portada', ordenReservar) && (
        <div
          style={{
            position: 'relative',
            padding: `${cq(28, 4, 56)} ${cq(20, 3.8, 48)} ${cq(24, 3, 44)}`,
            display: 'grid',
            // Una sola columna cuando NO hay foto. Reservar la mitad del hero
            // para un hueco gris sería peor que el diseño de hoy: el mockup
            // funciona porque la foto está, no porque haya dos columnas.
            gridTemplateColumns: heroFoto ? 'repeat(auto-fit, minmax(min(100%, 320px), 1fr))' : '1fr',
            gap: cq(24, 3.4, 44),
            alignItems: 'center',
          }}
        >
          <div style={{ textAlign: heroFoto ? 'left' : 'center', minWidth: 0 }}>
            <div style={eyebrow(9)}>{studio?.ciudad ? studio.ciudad.toUpperCase() : 'RESERVA TU CLASE'}</div>
            {/* El NOMBRE del estudio deja de ser el titular y sube a la barra,
                que es donde vive una marca. El titular pasa a decir para qué
                sirve la página — es lo que separa una portada de un rótulo. */}
            {/* ⚠️ Estos tres textos eran CONSTANTES del código: el mismo
                titular servido idéntico a TODOS los estudios, en la página que
                cada uno incrusta en su propia web. Ahora los escribe cada
                estudio; vacío deja el de siempre, así que nadie cambia salvo
                que quiera. */}
            <h1 style={{ fontFamily: serif, fontSize: cq(34, 5.4, 68), lineHeight: 1.02, marginTop: cq(12, 1.6, 20) }}>
              {textosReservar.titular || <>Encuentra tu<br />próxima clase</>}
            </h1>
            {/* El subtítulo propio gana a la descripción del estudio: se ha
                escrito para ESTA página, no para la ficha. */}
            {(textosReservar.subtitulo || studio?.descripcion) && (
              <p style={{ fontSize: cq(14, 1.4, 17), lineHeight: 1.5, color: 'var(--portal-muted)', marginTop: 14, maxWidth: 460, marginInline: heroFoto ? undefined : 'auto' }}>
                {textosReservar.subtitulo || studio?.descripcion}
              </p>
            )}
            {/* Lleva al horario, que ya está en esta misma página: un botón de
                portada que no promete nada que no exista. */}
            <button
              onClick={() => { setTab('clases'); document.getElementById('horario')?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }}
              style={{
                marginTop: cq(20, 2.4, 30), height: 48, padding: `0 ${cq(22, 2.4, 30)}`, borderRadius: 24,
                background: PRIMARY, color: PRIMARY_FG, border: 'none', cursor: 'pointer',
                fontSize: 13, fontWeight: 600, letterSpacing: '.06em', textTransform: 'uppercase',
                boxShadow: SH.headerBtn,
              }}
            >
              {textosReservar.cta || 'Ver el horario'}
            </button>
          </div>

          {heroFoto && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={heroFoto}
              alt=""
              style={{
                width: '100%', aspectRatio: '4 / 3', objectFit: 'cover',
                borderRadius: R.card, display: 'block',
              }}
            />
          )}
        </div>
        )}

        {/* ── TABS ─────────────────────────────────────────────────────────── */}
        <div id="horario" style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: cq(18, 3.4, 42), borderBottom: '1px solid rgba(34,38,31,.12)', marginTop: embedMode ? cq(16, 1.6, 20) : cq(28, 3.6, 46), overflowX: 'auto', padding: `0 ${cq(20, 3.8, 48)}` }}>
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

      {/* ── AVISO DE PAGO (retorno de Stripe) ─────────────────────────────────
          Mismo `order` que el horario, a propósito: «Horario y reservas» no es
          un solo nodo del DOM sino tres hermanos (la barra de pestañas, este
          aviso y el contenido). Con el mismo valor, el navegador respeta entre
          ellos el orden del DOM, así que se mueven en bloque y sin cambiar de
          orden relativo. */}
      {pagoAviso && (
        <div style={{ order: orden('horario'), padding: `12px ${cq(20, 3.8, 48)} 0`, maxWidth: 1280, marginInline: 'auto' }}>
          <div
            className={pagoAviso === 'ok' ? 'text-success bg-success/10 border-success/30' : 'text-muted-foreground bg-muted/50 border-[var(--portal-line)]'}
            style={{ border: '1px solid', borderRadius: 14, padding: '10px 16px', fontSize: 13, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}
          >
            <span>
              {pagoAviso === 'ok'
                ? '¡Pago recibido! En unos segundos verás tu plan activo.'
                : 'Pago cancelado — puedes intentarlo de nuevo cuando quieras.'}
            </span>
            <button onClick={() => setPagoAviso(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'inherit', fontSize: 16, lineHeight: 1 }} aria-label="Cerrar aviso">×</button>
          </div>
        </div>
      )}

      {/* ── CONTENT ───────────────────────────────────────────────────────────
          El tercero de los hermanos de «Horario y reservas» — ver el comentario
          del aviso de pago. */}
      <div style={{ order: orden('horario'), padding: `0 ${cq(20, 3.8, 48)}`, maxWidth: 1280, marginInline: 'auto', width: '100%' }}>

        {/* ── TAB: CLASES ─────────────────────────────────────────────────── */}
        {tab === 'clases' && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: cq(24, 4, 56), alignItems: 'flex-start', padding: `${cq(28, 3.4, 44)} 0 ${cq(50, 7, 90)}` }}>
            <div style={{ flex: '1 1 480px', minWidth: 0 }}>

              {/* Discovery quiz — ver components/reserva/discovery-quiz.tsx. Un
                  filtro más sobre los mismos slots ya cargados (nivel/tipo/
                  horario/día), no un motor de recomendación nuevo. */}
              {quizAbierto ? (
                <div style={{ marginBottom: 20 }}>
                  <DiscoveryQuiz
                    nivelesDisponibles={nivelesDisponibles}
                    nivelLabel={NIVEL_LABEL}
                    paso={quizPaso}
                    setPaso={setQuizPaso}
                    filtroObjetivo={filtroObjetivo}
                    setFiltroObjetivo={setFiltroObjetivo}
                    nResultados={slots.length}
                    filtroNivel={filtroNivel}
                    setFiltroNivel={setFiltroNivel}
                    filtroHorario={filtroHorario}
                    setFiltroHorario={setFiltroHorario}
                    filtroDias={filtroDias}
                    setFiltroDias={setFiltroDias}
                    onCompletar={() => { setQuizAbierto(false); setQuizCompletado(true); }}
                    onCerrar={() => setQuizAbierto(false)}
                  />
                </div>
              ) : quizCompletado || hayFiltrosQuizActivos ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14, fontSize: 12, color: 'var(--portal-muted-2)' }}>
                  Filtrado según tus preferencias
                  <button type="button" onClick={() => { setQuizPaso(0); setQuizAbierto(true); }}
                    style={{ color: PRIMARY_FG, background: 'none', border: 'none', cursor: 'pointer', fontWeight: 500, padding: 0 }}>
                    Cambiar
                  </button>
                  <button type="button" onClick={reiniciarFiltrosQuiz}
                    style={{ color: 'var(--portal-muted-2)', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline', padding: 0 }}>
                    Ver todas
                  </button>
                </div>
              ) : bannerQuizVisible ? (
                <div style={{
                  display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 12, justifyContent: 'space-between',
                  borderRadius: R.chipCard, background: 'rgba(255,255,255,.55)', border: '1px solid var(--portal-line)',
                  padding: '14px 18px', marginBottom: 18,
                }}>
                  <span style={{ fontSize: 12.5, color: 'var(--portal-ink)' }}>¿Primera vez en el estudio? Te ayudamos a encontrar tu clase.</span>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button type="button" onClick={() => { setQuizPaso(0); setQuizAbierto(true); }}
                      style={{ height: 34, padding: '0 16px', borderRadius: R.pill, background: PRIMARY, color: PRIMARY_FG, border: 'none', fontSize: 12, fontWeight: 500, cursor: 'pointer', whiteSpace: 'nowrap' }}>
                      Sí, ayúdame
                    </button>
                    <button type="button" onClick={descartarQuizBanner}
                      style={{ height: 34, padding: '0 16px', borderRadius: R.pill, background: 'transparent', color: 'var(--portal-muted-2)', border: '1px solid var(--portal-line)', fontSize: 12, cursor: 'pointer', whiteSpace: 'nowrap' }}>
                      No, gracias
                    </button>
                  </div>
                </div>
              ) : null}

              {/* Los filtros ya no viven aquí: están en el rail de la columna
                  lateral (RailFiltros). La fila de chips solo filtraba por
                  TIPO y se salía de la pantalla en cuanto un estudio tenía
                  cinco tipos de clase — y tener el mismo filtro en dos sitios
                  es lo que hace dudar de cuál manda. */}

              {/* Calendario de reservas — componente compartido (estilo Acuity), el
                  mismo que usa el portal de socias, re-vestido con el lenguaje
                  visual de esta pantalla (ver reserva-calendario.tsx). La reserva
                  se enruta por handleReservarCalendario, que respeta el
                  step-machine de acceso. */}
              {/* Lista · Semana · Día.
                  ⚠️ El día sigue siendo la vista de llegada. Poner Semana por
                  defecto cambiaba el camino de entrada de TODA visitante —y lo
                  cazó CI, con los tests de reserva entrando por las pestañas de
                  día—. Cambiar por dónde se reserva es una decisión de producto
                  aparte, no un efecto colateral de añadir una vista. */}
              <div style={{ display: 'flex', gap: 4, marginTop: 20, padding: 3, borderRadius: R.pill, background: 'rgba(255,255,255,.55)', border: '1px solid var(--portal-line)', width: 'fit-content' }} role="group" aria-label="Cómo ver el horario">
                {([['lista', 'Lista'], ['semana', 'Semana'], ['dia', 'Día']] as const).map(([id, label]) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setVistaClases(id)}
                    aria-pressed={vistaClases === id}
                    style={{
                      padding: '7px 16px', borderRadius: R.pill, border: 'none', cursor: 'pointer',
                      fontSize: 12.5, fontWeight: 600,
                      background: vistaClases === id ? PRIMARY : 'transparent',
                      color: vistaClases === id ? PRIMARY_FG : 'var(--portal-muted)',
                    }}
                  >
                    {label}
                  </button>
                ))}
              </div>

              <div style={{ marginTop: 24 }}>
                {vistaClases === 'semana' ? (
                  <RejillaSemana
                    slots={slots}
                    permiteListaEspera={studio?.permiteListaEspera}
                    // ⚠️ `openBooking`, NUNCA `handleReservarCalendario`. Esa
                    // función, para una socia ya identificada y sin gate,
                    // llama a `addReserva` DIRECTAMENTE: un clic en la rejilla
                    // reservaba al instante, sin confirmar y con `spotId: null`
                    // —o sea, sin elegir reformer—. Un clic accidental te
                    // apuntaba a una clase. La rejilla decide qué se ve; quien
                    // decide si se reserva es la hoja.
                    onElegir={(slot) => openBooking(slot.id)}
                    fontFamily={sans}
                  />
                ) : (
                <ReservaCalendario
                  t={RESERVAR_TOKENS}
                  slots={slots}
                  variant={vistaClases === 'lista' ? 'lista' : 'calendario'}
                  onReservar={handleReservarCalendario}
                  onCancelar={cancelarReserva}
                  cancelacionVentanaHoras={studio?.cancelacionVentanaHoras}
                  ventanaPorTipo={ventanaPorTipo}
                  vacio={hayFiltrosQuizActivos
                    ? { titulo: 'No encontramos clases con estos filtros', cuerpo: 'Prueba a ampliarlos, o usa "Ver todas" arriba.' }
                    : { titulo: 'Sin clases disponibles', cuerpo: 'Prueba con otra semana o cambia el filtro' }}
                />
                )}
              </div>
            </div>

            {/* Columna lateral: explicación del flujo (copy fijo, sin datos que
                puedan quedar desactualizados). */}
            <div style={{ flex: '0 1 320px', display: 'flex', flexDirection: 'column', gap: 16 }}>
              {/* El rail de filtros, encima del «cómo funciona»: lo primero de
                  esta columna tiene que ser lo que se USA, no lo que se lee una
                  vez. Se pinta solo si algún filtro tiene de verdad más de una
                  opción (ver RailFiltros). */}
              <div style={{ borderRadius: R.hero, background: 'rgba(255,255,255,.55)', border: '1px solid var(--portal-line)', padding: '20px 22px' }}>
                <RailFiltros
                  clases={slotsParaFiltros}
                  estado={{ tipo: filtroTipo, instructor: filtroInstructor, nivel: filtroNivel, horario: filtroHorario }}
                  onCambiar={(campo, valor) => {
                    if (campo === 'tipo') setFiltroTipo(valor);
                    else if (campo === 'instructor') setFiltroInstructor(valor);
                    else if (campo === 'nivel') setFiltroNivel(valor);
                    else setFiltroHorario(valor as '' | 'manana' | 'mediodia' | 'tarde');
                  }}
                  onLimpiar={() => {
                    setFiltroTipo(''); setFiltroInstructor(''); setFiltroNivel(''); setFiltroObjetivo('');
                    setFiltroHorario(''); setFiltroDias([]);
                  }}
                  nCuantos={cuantosFiltros({ tipo: filtroTipo, nivel: filtroNivel, horario: filtroHorario, instructor: filtroInstructor, dias: filtroDias })}
                  nResultados={slots.length}
                  etiquetaTipo={(id) => tiposClase.find(t => t.id === id)?.nombre ?? id}
                  etiquetaNivel={(n) => NIVEL_LABEL[n] ?? n}
                  horarioDe={(c) => (c as { horario?: string | null }).horario ?? null}
                  fontFamily={sans}
                />
              </div>

              <div style={{ borderRadius: R.hero, background: 'rgba(255,255,255,.55)', border: '1px solid var(--portal-line)', padding: '26px 28px' }}>
                <div style={eyebrow(9)}>CÓMO FUNCIONA</div>
                {/* ⚠️ Estas frases salen de `lib/reservar/promesas.ts`, no de
                    `studio.cancelacionVentanaHoras` a secas. Aquí se leía el
                    valor del ESTUDIO mientras la hoja de reserva ya resolvía el
                    plazo por TIPO DE CLASE: en un estudio con el Reformer a
                    24 h, esta caja prometía 12 y alguien cancelaba tarde
                    creyendo que llegaba. Y la antelación mínima solo aparecía
                    como error DESPUÉS de intentar reservar — decirlo entonces
                    no es informar, es corregir. */}
                {[
                  'Elige el día y la clase.',
                  ...(antelacionMinima ? [antelacionMinima] : ['Reserva tu plaza en la sala.']),
                  plazoCancelacion,
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


              {/* Class types.
                  ⚠️ El rótulo solo sale si hay algo debajo. Ya era así de
                  frágil antes, pero los planes tapaban el hueco; al sacarlos,
                  un estudio recién dado de alta se encontraba dos encabezados
                  seguidos sobre nada. */}
              {tiposClase.length > 0 && (<>
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
              </>)}

              {/* Instructors — mismo criterio que arriba. `queImparten` ya filtra
                  a las que de verdad dan clase, así que se pregunta por ESA lista
                  y no por `instructores` entera. */}
              {queImparten(instructores).length > 0 && (<>
              <div style={{ ...eyebrow(9), marginTop: 38 }}>INSTRUCTORAS</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 12, marginTop: 16 }}>
                {queImparten(instructores).map(i => {
                  const especialidades = [...(especialidadesPorInstructor.get(i.id) ?? [])];
                  return (
                    <div key={i.id} style={{ borderRadius: R.chipCard, background: 'var(--portal-surface)', padding: '18px 20px', display: 'flex', alignItems: 'flex-start', gap: 14, boxShadow: SH.miniCard }}>
                      {i.fotoUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={i.fotoUrl} alt={i.nombre} style={{ width: 44, height: 44, borderRadius: 999, objectFit: 'cover', flexShrink: 0 }} />
                      ) : (
                        <div style={{ width: 44, height: 44, borderRadius: 999, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 15, color: '#fff', flexShrink: 0, background: i.color ?? PRIMARY }}>
                          {i.nombre.split(' ').map(n => n[0]).join('')}
                        </div>
                      )}
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontFamily: serif, fontSize: 21, lineHeight: 1 }}>{i.nombre}</div>
                        {especialidades.length > 0 && (
                          <div style={{ fontSize: 10.5, color: 'var(--portal-muted-2)', marginTop: 6 }}>
                            {especialidades.join(' · ')}
                          </div>
                        )}
                        {i.bio && (
                          <p style={{
                            fontSize: 11.5, color: 'var(--portal-muted-2)', lineHeight: 1.5, marginTop: 8,
                            display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden',
                          }}>
                            {i.bio}
                          </p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
              </>)}
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
          </div>
        )}
      </div>

      {/* ── FOOTER ──────────────────────────────────────────────────────────────
          Fase 3 del Theme Builder: antes los enlaces legales solo vivían dentro
          de la pestaña "El estudio" — quien reservaba desde "Clases" nunca los
          veía. Ahora es un pie de página de verdad, visible en las cuatro
          pestañas, con redes sociales (si el estudio las configuró en "Marca y
          colores") y los mismos enlaces legales de siempre. */}
      {/* ── BONOS Y MEMBRESÍAS ─────────────────────────────────────────────
          Vivía DENTRO de la pestaña «El estudio», entre los tipos de clase y
          las instructoras — o sea, escondida detrás de un clic, en la pestaña
          que menos se abre, y por debajo de la descripción del local. Lo que
          más cuesta vender era lo que peor se veía.

          Ahora es una sección de la página: se ve al bajar, sin clicar nada, y
          el estudio puede subirla, bajarla o quitarla como cualquier otra.

          ⚠️ No se pinta si no hay ningún plan CONTRATABLE. El filtro es el
          mismo de siempre (activo y precio > 0, que además es requisito del
          checkout de Stripe): una banda «Bonos y membresías» vacía en la
          página pública es peor que no tenerla. */}
      {seccionVisible('bonos', ordenReservar) && planesContratables.length > 0 && (
        <div style={{ order: orden('bonos'), borderTop: '1px solid var(--portal-surface-2)', padding: `${cq(30, 3.6, 50)} ${cq(20, 3.8, 48)}` }}>
          <div style={{ maxWidth: 1280, marginInline: 'auto' }}>
            <h2 style={{ fontFamily: serif, fontSize: cq(22, 2.6, 34), lineHeight: 1.15, textAlign: 'center', marginBottom: 6 }}>Bonos y membresías</h2>
            {stripeError && (
              <div className="text-destructive bg-destructive/10 border border-destructive/30" style={{ marginTop: 12, padding: '10px 16px', borderRadius: 14, fontSize: 13 }}>
                {stripeError}
              </div>
            )}
            {/* Rejilla de tres, no una pila a lo ancho: los planes se COMPARAN,
                y apilados obligaban a recordar el precio anterior al bajar. */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 220px), 1fr))', gap: 12, marginTop: 16, alignItems: 'stretch' }}>
              {planesContratables.map(p => {
                const destacado = p.id === planDestacadoId;
                const porClase = precioPorClase(p);
                // Solo sale si significa algo: sin precio de clase suelta con
                // el que comparar, no hay ahorro que enseñar (ver ahorro-plan.ts).
                const ahorro = ahorroPorcentaje(p, precioClaseSuelta);
                return (
                  <div key={p.id} style={{
                    borderRadius: R.cardSmall, background: destacado ? PRIMARY : 'var(--portal-surface)',
                    padding: '22px 24px', display: 'flex', flexDirection: 'column', gap: 12,
                    boxShadow: destacado ? SH.ctaOscuroFuerte : SH.planClaro,
                  }}>
                    <div style={{ flex: '1 1 auto' }}>
                      {destacado && <div style={{ ...eyebrow(8.5), color: `color-mix(in srgb, ${PRIMARY_FG} 65%, transparent)` }}>EL MÁS ELEGIDO</div>}
                      <div style={{ fontFamily: serif, fontSize: cq(20, 2, 25), lineHeight: 1, marginTop: destacado ? 9 : 0, color: destacado ? PRIMARY_FG : 'var(--portal-ink)' }}>{p.nombre}</div>
                      <div style={{ fontSize: 11, marginTop: 7, color: destacado ? `color-mix(in srgb, ${PRIMARY_FG} 60%, transparent)` : 'var(--portal-muted-2)' }}>
                        {p.tipo === 'MENSUAL' ? 'Mensual · sin compromiso' : (porClase ?? p.descripcion ?? `Bono ${p.sesiones ?? ''} clases`)}
                      </div>
                      {ahorro !== null && (
                        <div style={{ fontSize: 11, fontWeight: 600, marginTop: 6, color: destacado ? `color-mix(in srgb, ${PRIMARY_FG} 80%, transparent)` : 'var(--portal-accent)' }}>
                          Ahorras un {ahorro} % frente a clases sueltas
                        </div>
                      )}
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
            <p style={{ fontSize: 10.5, color: 'var(--portal-muted)', marginTop: 14, textAlign: 'center' }}>Pago seguro con Stripe · IVA incluido</p>
          </div>
        </div>
      )}
      {/* ── SOBRE NOSOTROS ────────────────────────────────────────────────────
          La única sección cuyo contenido entero escribe el estudio. Las demás
          pintan datos que ya existen (clases, cifras, teléfono); esta no existe
          hasta que hay algo que contar.

          ⚠️ Sin texto NO se pinta, y no hay texto por defecto. Es lo contrario
          del titular de la portada, donde vacío sí cae en uno de fábrica: un
          titular genérico se lee como una página sin terminar, pero un «Sobre
          nosotros» genérico se lee como una mentira sobre el estudio. Mismo
          criterio que la bio de instructora (#946).

          El título solo no basta: un encabezado sobre nada es peor que nada. */}
      {seccionVisible('sobre', ordenReservar) && textosReservar.sobreTexto && (
        <div style={{ order: orden('sobre'), borderTop: '1px solid var(--portal-surface-2)', padding: `${cq(30, 3.6, 50)} ${cq(20, 3.8, 48)}` }}>
          <div style={{ maxWidth: 720, marginInline: 'auto', textAlign: 'center' }}>
            {textosReservar.sobreTitulo && (
              <h2 style={{ fontFamily: serif, fontSize: cq(22, 2.6, 34), lineHeight: 1.15, marginBottom: 14 }}>
                {textosReservar.sobreTitulo}
              </h2>
            )}
            {/* `whiteSpace: 'pre-line'` y no un parseo de Markdown: así los
                saltos de línea que escribe la propietaria en el textarea se
                respetan tal cual, sin abrir la puerta a inyectar HTML — el
                mismo cuidado que ya se documentó con `<Markdown>` en los
                correos, que NO sanea. */}
            <p style={{ fontSize: cq(14, 1.4, 17), lineHeight: 1.6, color: 'var(--portal-muted)', whiteSpace: 'pre-line' }}>
              {textosReservar.sobreTexto}
            </p>
          </div>
        </div>
      )}

      {seccionVisible('cifras', ordenReservar) && mereceBanda(cifras) && (
        <div style={{ order: orden('cifras'), borderTop: '1px solid var(--portal-surface-2)', padding: `${cq(26, 3, 38)} ${cq(20, 3.8, 48)} 0` }}>
          <div style={{ maxWidth: 1280, marginInline: 'auto', display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: cq(28, 4, 60) }}>
            {cifras.map(c => (
              <div key={c.id} style={{ textAlign: 'center' }}>
                <div style={{ fontFamily: serif, fontSize: cq(26, 3, 38), lineHeight: 1 }}>{c.valor}</div>
                <div style={{ fontSize: 11.5, color: 'var(--portal-muted)', marginTop: 6 }}>{c.etiqueta}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {seccionVisible('contacto', ordenReservar) && (
      <footer style={{ order: orden('contacto'), borderTop: '1px solid var(--portal-surface-2)', marginTop: 40, padding: `${cq(28, 3, 40)} ${cq(20, 3.8, 48)}` }}>
        <div style={{ maxWidth: 1280, marginInline: 'auto', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 18, textAlign: 'center' }}>
          {/* ¿Dudas? — teléfono y email del estudio. Cada uno se pinta SOLO si
              existe: una fila de contacto con huecos vacíos, o peor, con un
              teléfono de ejemplo, es un desvío a ninguna parte justo cuando
              alguien ya se ha decidido a preguntar. El WhatsApp sale de sus
              redes sociales, que ya se resuelven más abajo. */}
          {(studio?.telefono || studio?.email) && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', flexWrap: 'wrap', gap: 16, fontSize: 12.5 }}>
              <span style={{ color: 'var(--portal-muted)' }}>¿Dudas? Estamos aquí para ayudarte:</span>
              {studio?.telefono && (
                <a href={`tel:${studio.telefono.replace(/\s+/g, '')}`} style={{ color: 'var(--portal-ink)', fontWeight: 600, textDecoration: 'none' }}>
                  {studio.telefono}
                </a>
              )}
              {studio?.email && (
                <a href={`mailto:${studio.email}`} style={{ color: 'var(--portal-ink)', fontWeight: 600, textDecoration: 'none' }}>
                  {studio.email}
                </a>
              )}
            </div>
          )}

          <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 12, color: 'var(--portal-muted-2)' }}>
            {estudioLogo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={estudioLogo} alt={estudioNombre} style={{ width: 22, height: 22, borderRadius: 7, objectFit: 'contain', background: '#fff', flexShrink: 0 }} />
            ) : null}
            <span style={{ fontFamily: serif, fontSize: 14 }}>{estudioNombre}</span>
            <span aria-hidden>·</span>
            <span>{estudioDireccion}</span>
          </div>

          {REDES_SOCIALES.some(({ id }) => resolverHrefBloque(redesSociales[id])) && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
              {REDES_SOCIALES.map(({ id, label }) => {
                const resuelto = resolverHrefBloque(redesSociales[id]);
                if (!resuelto) return null;
                return (
                  <a
                    key={id}
                    href={resuelto.valor}
                    target={resuelto.interno ? undefined : '_blank'}
                    rel={resuelto.interno ? undefined : 'noopener noreferrer'}
                    style={{ display: 'flex', alignItems: 'center', gap: 5, color: 'var(--portal-muted)', textDecoration: 'none', fontSize: 12 }}
                  >
                    <ExternalLink size={12} />{label}
                  </a>
                );
              })}
            </div>
          )}

          <div style={{ display: 'flex', alignItems: 'center', gap: 26, fontSize: 11, color: 'var(--portal-muted)' }}>
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
      </footer>
      )}

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
              <div className="flex flex-col items-center text-center gap-4 contenido-anim">
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
                    Si ya fijó contraseña en 'registro' (o entró con
                    loginConPassword), el enlace va directo a /login — mandarla
                    a /acceso otra vez le pediría elegir una contraseña que ya
                    tiene. Si no (p. ej. socia ya existente que solo firmó el
                    contrato, sin pasar por 'registro'), sigue sin tenerla y el
                    enlace va a /acceso, que se la deja poner. */}
                <div className="w-full pt-3 mt-1 border-t border-[var(--portal-line)]">
                  <p className="text-[var(--portal-muted)] text-xs leading-relaxed text-center">
                    Tus clases y tus bonos están en tu portal.{' '}
                    {tienePasswordPropia ? (
                      <a href={`/portal/${slug}/login`} className="font-bold underline" style={{ color: PRIMARY }}>
                        Entra con tu contraseña
                      </a>
                    ) : (
                      <a href={`/portal/${slug}/acceso`} className="font-bold underline" style={{ color: PRIMARY }}>
                        Crea tu contraseña
                      </a>
                    )}{' '}
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
              <div className="flex flex-col items-center text-center py-4 gap-4 contenido-anim">
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
              <div className="flex flex-col items-center text-center py-4 gap-4 contenido-anim">
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
              <div className="contenido-anim">
                {!enlaceEnviado ? (
                  <>
                    <h2 className="text-[var(--portal-ink)] font-[var(--font-display),Georgia,serif] font-normal text-lg mb-1">Entra para reservar</h2>
                    <p className="text-[var(--portal-muted-2)] text-sm mb-5">
                      {mostrarPasswordLogin ? 'Entra con tu email y contraseña.' : 'Te enviamos un enlace de acceso a tu email. Sin contraseñas.'}
                    </p>
                    <input type="email"
                      placeholder="Tu email"
                      value={loginForm.email}
                      onChange={e => { setLoginForm(f => ({ ...f, email: e.target.value })); setLoginError(''); }}
                      onKeyDown={e => e.key === 'Enter' && (mostrarPasswordLogin ? handleLoginConPassword() : handleEnviarEnlace())}
                      autoFocus
                      className="w-full rounded-xl px-4 py-3 text-sm text-[var(--portal-ink)] placeholder:text-[var(--portal-muted)] outline-none border border-[var(--portal-line)] focus:border-[var(--portal-ink)] transition-colors mb-3"
                      style={{ backgroundColor: RT.surface2 }} />
                    {mostrarPasswordLogin && (
                      <input type="password"
                        placeholder="Tu contraseña"
                        value={loginPassword}
                        onChange={e => { setLoginPassword(e.target.value); setLoginError(''); }}
                        onKeyDown={e => e.key === 'Enter' && handleLoginConPassword()}
                        autoComplete="current-password"
                        className="w-full rounded-xl px-4 py-3 text-sm text-[var(--portal-ink)] placeholder:text-[var(--portal-muted)] outline-none border border-[var(--portal-line)] focus:border-[var(--portal-ink)] transition-colors mb-3"
                        style={{ backgroundColor: RT.surface2 }} />
                    )}
                    {loginError && <p className="text-destructive text-sm mb-3">{loginError}</p>}
                    {/* Sin margen propio: mide 0 px salvo que Cloudflare pida
                        resolver algo a mano. */}
                    {captcha}
                    {mostrarPasswordLogin ? (
                      <button onClick={handleLoginConPassword} disabled={!loginForm.email || !loginPassword || enviandoLoginPassword}
                        className="w-full py-3 rounded-2xl font-bold text-white transition-all disabled:opacity-40"
                        style={{ backgroundColor: PRIMARY }}>
                        {enviandoLoginPassword ? 'Entrando…' : 'Iniciar sesión →'}
                      </button>
                    ) : (
                      <button onClick={handleEnviarEnlace} disabled={!loginForm.email || enviandoEnlace}
                        className="w-full py-3 rounded-2xl font-bold text-white transition-all disabled:opacity-40"
                        style={{ backgroundColor: PRIMARY }}>
                        {enviandoEnlace ? 'Enviando…' : 'Enviar enlace de acceso →'}
                      </button>
                    )}
                    <button
                      onClick={() => { setMostrarPasswordLogin(m => !m); setLoginError(''); }}
                      className="w-full text-center text-[12px] text-[var(--portal-muted-2)] underline mt-3"
                    >
                      {mostrarPasswordLogin ? 'Prefiero el enlace por email' : '¿Ya tienes contraseña? Inicia sesión'}
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
              </div>
            )}

            {/* ── REGISTRO (walk-in ya autenticado: nombre) ── */}
            {loginStep === 'registro' && (
              <div className="contenido-anim">
                <h2 className="text-[var(--portal-ink)] font-[var(--font-display),Georgia,serif] font-normal text-lg mb-1">¿Cómo te llamas?</h2>
                <p className="text-[var(--portal-muted-2)] text-sm mb-5">Completa tus datos para tu primera reserva — el estudio los usará para avisarte de cualquier cambio en tus clases.</p>
                <input type="text"
                  placeholder="Tu nombre completo"
                  value={loginForm.nombre}
                  onChange={e => setLoginForm(f => ({ ...f, nombre: e.target.value }))}
                  autoFocus
                  className="w-full rounded-xl px-4 py-3 text-sm text-[var(--portal-ink)] placeholder:text-[var(--portal-muted)] outline-none border border-[var(--portal-line)] focus:border-[var(--portal-ink)] transition-colors mb-3"
                  style={{ backgroundColor: RT.surface2 }} />
                <input type="tel"
                  placeholder="Tu teléfono (+34 600 000 000)"
                  value={loginForm.telefono}
                  onChange={e => setLoginForm(f => ({ ...f, telefono: e.target.value }))}
                  onKeyDown={e => e.key === 'Enter' && handleRegistroNombre()}
                  className="w-full rounded-xl px-4 py-3 text-sm text-[var(--portal-ink)] placeholder:text-[var(--portal-muted)] outline-none border border-[var(--portal-line)] focus:border-[var(--portal-ink)] transition-colors mb-1"
                  style={{ backgroundColor: RT.surface2 }} />
                {loginError && <p className="text-destructive text-sm mb-3">{loginError}</p>}
                <p className="text-[11px] text-[var(--portal-muted)] mb-5">El teléfono solo lo usa {estudioNombre} para avisos de tus clases.</p>
                <button onClick={handleRegistroNombre} disabled={!loginForm.nombre.trim() || !telefonoValido(loginForm.telefono)}
                  className="w-full py-3 rounded-2xl font-bold text-white transition-all disabled:opacity-40"
                  style={{ backgroundColor: PRIMARY }}>
                  Continuar →
                </button>
              </div>
            )}

            {/* ── CONTRATO (aceptación clickwrap) ── */}
            {loginStep === 'contrato' && (
              <div className="contenido-anim">
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
              </div>
            )}

            {/* ── CONFIRM ── */}
            {loginStep === 'confirm' && bookingSesion && (
              <div className="contenido-anim">
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
              </div>
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
