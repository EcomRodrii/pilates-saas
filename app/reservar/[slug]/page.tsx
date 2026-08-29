'use client';
import { aFechaCal, eventoIcs, nombreIcs } from '@/lib/calendario-ics';
import { queImparten } from '@/lib/equipo';

import { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import dynamic from 'next/dynamic';
import { useSearchParams, useParams, useRouter } from 'next/navigation';
import { useStudio, type ResultadoReserva } from '@/lib/studio-context';
import { portalAuthHeader } from '@/lib/api-client';
import { textoLegalCompleto } from '@/lib/legal-textos';
import { useSociaSession } from '@/lib/use-socia-session';
import { PlanTarifa, type Reserva } from '@/lib/types';
import { tieneEntitlementActivo, hayAlgoQueContratar } from '@/lib/bono-logic';
import { resolutorCobertura, precioDeCobertura, textoCobertura } from '@/lib/reservar/cobertura';
import {
  contarReservasActivasFuturas, esCancelacionTardia,
  heredaOverride, puedeReservarPorAntelacionMaxima, puedeReservarPorVentanaMinima,
} from '@/lib/booking-logic';
import type { ReservaSlot } from '@/components/reserva/reserva-calendario';
import { localDayKey } from '@/lib/reserva-calendario-logic';
import { frasePlazoCancelacion, fraseAntelacionMinima, fraseAntelacionMaxima } from '@/lib/reservar/promesas';
import { PublicSheet } from '@/components/ui/public-sheet';
import { IndicadorPasos } from '@/components/reserva/indicador-pasos';
import { recorridoDe } from '@/lib/reservar/pasos-flujo';
import { BOTON_PRIMARIO, BOTON_SECUNDARIO, BOTON_TERCIARIO } from '@/lib/reservar/botones';
import { claseSirvePara } from '@/lib/reservar/objetivos';
import { cifrasVisibles, mereceBanda } from '@/lib/reservar/cifras';
import { seccionReservarDeSistemaId, CAMPOS_RESERVAR_HORARIO } from '@/lib/portal-home-bloques';
import { resolverConfig } from '@/lib/theme/campos.ts';
import { BloqueReservarRender } from '@/components/reservar/bloque-reservar-render';
import { resolverApariencia, fondoCss, familiaCss, urlFuente, familiaDisplayCss, urlFuenteDisplay, modoTextoDe, luminancia, radiosDe, escalaDensidad } from '@/lib/reservar/apariencia-widget';
import { resolverConfigWidget } from '@/lib/reservar/config-widget';
import { semantic } from '@/lib/portal-tokens';
import { useCaptcha, ERROR_CAPTCHA } from '@/components/auth/turnstile-widget';
import { horarioPublico, precioPorClase } from '@/lib/estudio-publico';
import { ahorroPorcentaje } from '@/lib/reservar/ahorro-plan';
import { trackEventoWidget } from '@/lib/reservar/eventos';
import { serif, sans, cq, radius as R, shadow as SH, eyebrow, containerRoot, RESERVAR_PALETA, varsReservarModo } from '@/lib/reservar-publico-tokens';
import { canalesDelEstudio } from '@/lib/canales-estudio';
import { imagenDeEstudio, alFallarImagen, IMAGENES_POR_DEFECTO } from '@/lib/imagenes-por-defecto';
import { fmtTime, fmtLong, telefonoValido } from '@/lib/reservar/formato';
import { PantallaReserva } from '@/components/reserva/pantalla-reserva';
import { SpotPickerPublico } from '@/components/reserva/spot-picker-publico';
import { piDeClientSecret, RETARDOS_POLL_MS, type RespuestaEstadoPago } from '@/lib/billing/estado-pago-publico';
import { LogoTentare } from '@/components/marca/logo-tentare';
import { FichaClaseUnica } from '@/components/reserva/ficha-clase-unica';
import {
  Users, CheckCircle2, X, Calendar, ChevronLeft,
  CreditCard, FileText, Download, ExternalLink, Mail,
  Loader2, AlertTriangle, Hourglass, Menu,
} from 'lucide-react';

// "Pagar y reservar sin login previo" (docs/reserva-sin-login-diseno.md §4.1):
// mismo patrón que app/widget-bundle/main.tsx — Modo A (esta página) nunca
// había necesitado la clave publicable de Stripe en el cliente hasta ahora
// (la compra de plan existente redirige a Checkout Session, todo en servidor).
const STRIPE_PUBLISHABLE_KEY = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;

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
const MiCuenta = dynamic(
  () => import('@/components/cuenta-widget/mi-cuenta').then((m) => m.MiCuenta),
  { ssr: false, loading: () => <div style={{ padding: '48px 0', textAlign: 'center', color: 'var(--portal-muted-2)' }}>Cargando…</div> },
);
const CitasPublica = dynamic(
  () => import('@/components/reserva/citas-publica').then((m) => m.CitasPublica),
  { ssr: false, loading: () => <div style={{ padding: '48px 0', textAlign: 'center', color: 'var(--portal-muted-2)' }}>Cargando citas…</div> },
);


// ─── Helpers ─────────────────────────────────────────────────────────────────

// Fecha fija usada SOLO en los cálculos previos al montaje (el render real
// muestra un esqueleto). Su valor concreto es irrelevante: existe únicamente
// para no llamar a new Date() durante el SSR y evitar mismatches de hidratación.
const FECHA_PLACEHOLDER_SSR = new Date('2026-01-01T12:00:00');

// "Cumpleaños · dd/mm/aaaa" (diseño "Tentare Portal Reservas", campo de texto
// libre, no un `<input type="date">`) → ISO `yyyy-mm-dd` para
// `fecha_nacimiento` (columna `date`). `null` si no cuadra el patrón o el mes/
// día no son válidos — el llamador simplemente omite el campo, nunca bloquea.
function fechaNacimientoISO(texto: string): string | null {
  const m = texto.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return null;
  const [, d, mo, y] = m;
  const dia = Number(d), mes = Number(mo), anio = Number(y);
  if (mes < 1 || mes > 12 || dia < 1 || dia > 31) return null;
  return `${anio}-${pad2(mes)}-${pad2(dia)}`;
}

function pad2(n: number) { return String(n).padStart(2, '0'); }
function localDate(d: Date) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}
// fmtTime/fmtLong/telefonoValido: extraídas a lib/reservar/formato.ts para
// que pantalla-reserva.tsx las use sin crear un import circular con esta
// página.
// Franja horaria del discovery quiz — misma hora local sin timezone fija
// que ya usa `fmtTime` para mostrar la hora de la sesión al visitante.
function horarioDeSesion(iso: string): 'manana' | 'mediodia' | 'tarde' {
  const h = new Date(iso).getHours();
  if (h < 12) return 'manana';
  if (h < 17) return 'mediodia';
  return 'tarde';
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
    dates: `${aFechaCal(s.inicio)}/${aFechaCal(s.fin)}`,
    details: `Instructora: ${s.instructor?.nombre ?? ''} · Sala: ${s.sala?.nombre ?? ''}`,
    location: `${estudioNombre} · ${estudioDireccion}`,
  });
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

function downloadICS(s: SesionRich, estudioNombre: string, estudioDireccion: string) {
  // El fichero lo construye `lib/calendario-ics.ts`, compartido con el portal
  // de la alumna. Aquí solo queda la parte de navegador (blob + descarga), que
  // es lo único que no se puede probar con `node --test`.
  //
  // ⚠️ Al extraerlo salió un fallo que estaba aquí: se escapaba la coma que
  // SEPARA nombre y dirección, pero no las de dentro («Carrer de la Pau, 12»),
  // así que iCalendar partía LOCATION en dos valores y el evento entraba con
  // la dirección a medias. El helper escapa el campo entero.
  const ics = eventoIcs({
    id: s.id,
    inicio: s.inicio,
    fin: s.fin,
    titulo: s.tipo?.nombre ?? 'Clase Pilates',
    instructora: s.instructor?.nombre,
    sala: s.sala?.nombre,
    estudioNombre,
    estudioDireccion,
  }, new Date());
  const blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nombreIcs(s.tipo?.nombre ?? 'clase', s.inicio);
  a.click();
  URL.revokeObjectURL(url);
}


// ─── Sub-components ───────────────────────────────────────────────────────────

function LevelBadge({ nivel }: { nivel?: string }) {
  if (!nivel || nivel === 'TODOS') return (
    <span className="text-[11px] font-bold px-2.5 py-1 rounded-full shrink-0" style={{ backgroundColor: 'rgba(129,140,248,0.2)', color: '#a5b4fc' }}>
      Todos los niveles
    </span>
  );
  const c = NIVEL_COLOR[nivel] ?? { bg: 'var(--portal-surface-2)', text: 'var(--portal-muted-2)' };
  // Punto de color en vez de emoji (🟢🟡🔴): coherente con el lenguaje visual
  // del resto del producto, que no usa emojis.
  return (
    <span className="inline-flex items-center gap-1.5 text-[11px] font-bold px-2.5 py-1 rounded-full shrink-0" style={{ backgroundColor: c.bg, color: c.text }}>
      <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: c.text }} />
      {NIVEL_LABEL[nivel] ?? nivel}
    </span>
  );
}

// Diseño "Tentare Portal Reservas": sin barra de pestañas, "Citas"/"El
// estudio"/"Mi cuenta" no tienen sitio en el .dc.html — quedan en este menú
// desplegable desde la cabecera (decisión de producto explícita, el diseño
// no lo especifica). Un botón de icono + un `<div>` posicionado en vez de un
// `<select>`: necesita pintar cada opción con su propia tipografía/estado
// activo, que un `<select>` nativo no permite.
function MenuSecciones({ tabs, tabActual, onIr }: {
  tabs: readonly (readonly [Tab, string])[];
  tabActual: string;
  onIr: (t: Tab) => void;
}) {
  const [abierto, setAbierto] = useState(false);
  // Posición en viewport del botón — el menú se porta a `document.body`
  // (fixed, calculado desde aquí) en vez de `position: absolute` dentro de
  // este `<div>`: el ancestro que pinta la barra+portada como una sola caja
  // de degradado (comentario junto a `orden('horario')`, unas líneas más
  // arriba) lleva `overflow: hidden` a propósito para esa costura, y
  // cualquier hijo `absolute` de ahí dentro se recorta en el borde de la
  // caja pase lo que pase con el z-index — encontrado en producción: el
  // menú se veía cortado nada más abrirlo.
  const [rect, setRect] = useState<{ top: number; right: number } | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!abierto) return;
    function fuera(e: MouseEvent) {
      const t = e.target as Node;
      if (btnRef.current?.contains(t)) return;
      if (menuRef.current && !menuRef.current.contains(t)) setAbierto(false);
    }
    document.addEventListener('mousedown', fuera);
    return () => document.removeEventListener('mousedown', fuera);
  }, [abierto]);
  const otras = tabs.filter(([t]) => t !== 'clases' && t !== 'misreservas');
  return (
    <div style={{ position: 'relative' }}>
      <button
        ref={btnRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={abierto}
        aria-label="Más secciones"
        onClick={() => {
          if (!abierto && btnRef.current) {
            const r = btnRef.current.getBoundingClientRect();
            setRect({ top: r.bottom + 8, right: window.innerWidth - r.right });
          }
          setAbierto(v => !v);
        }}
        style={{
          width: 46, height: 46, borderRadius: 23, border: '1px solid var(--portal-line)',
          background: 'var(--portal-surface)', color: 'var(--portal-ink)', cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}
      >
        <Menu size={17} />
      </button>
      {abierto && rect && typeof document !== 'undefined' && createPortal(
        <div ref={menuRef} role="menu" style={{
          position: 'fixed', top: rect.top, right: rect.right, zIndex: 100, minWidth: 160,
          background: 'var(--portal-surface)', border: '1px solid var(--portal-line)', borderRadius: 14,
          boxShadow: '0 14px 34px -12px rgba(15,15,15,.28)', padding: 6, display: 'flex', flexDirection: 'column', gap: 2,
        }}>
          {otras.map(([t, label]) => (
            <button
              key={t}
              type="button"
              role="menuitem"
              onClick={() => { onIr(t); setAbierto(false); }}
              style={{
                textAlign: 'left', padding: '9px 12px', borderRadius: 9, border: 'none', cursor: 'pointer',
                background: tabActual === t ? 'var(--portal-velo)' : 'transparent',
                color: 'var(--portal-ink)', fontFamily: sans, fontSize: 13, fontWeight: 600,
              }}
            >
              {label}
            </button>
          ))}
        </div>,
        document.body,
      )}
    </div>
  );
}

// Mapa de sitios (reformers) para que la socia elija el suyo al reservar (I-12).
// Anónimo: los ocupados se muestran deshabilitados, sin revelar quién los tiene.
// ─── Page ─────────────────────────────────────────────────────────────────────

type Tab = 'clases' | 'citas' | 'misreservas' | 'estudio' | 'cuenta';
// Cada pestaña es también un widget embebible por separado (Configuración >
// Estudio > Enlaces genera un <iframe ?embed=1&tab=…> distinto por cada una)
// — de ahí que valga la pena validar el ?tab= de la URL contra esta lista en
// vez de leerlo a ciegas.
//
// 'cuenta' (Fase 4 Booking Engine): NO repurpone 'misreservas' — ya hay
// enlaces ?tab= en producción apuntando a ese id, y "Mis reservas" y "Mi
// cuenta" (bonos+perfil) son conceptualmente distintos incluso en el portal
// instalable (rutas separadas). Ver docs/account-widget-diseno.md §4.
const TAB_IDS: readonly Tab[] = ['clases', 'citas', 'misreservas', 'estudio', 'cuenta'];
// 'pendiente' (Fase 2a, migr 20260730192445): la clase exige aprobación
// manual — la reserva no queda confirmada ni en lista de espera, se avisa a
// la socia por separado cuando la propietaria decida.
// 'datos'/'pago' ("pagar y reservar sin login previo",
// docs/reserva-sin-login-diseno.md §3): alternativa a 'login' cuando la clase
// exige plan y hay un plan PUNTUAL que la cubre — el pago sustituye al login,
// nunca lo precede. Solo Ruta A (comprar el plan que cubre la clase); una
// clase que no exige plan sigue yendo por 'login' como siempre (Fase 2,
// deferred — ver nota en la implementación).
type Step = 'login' | 'datos' | 'pago' | 'registro' | 'contrato' | 'confirm' | 'done' | 'espera' | 'pendiente';

// Botón Atrás real (docs/rediseno-widget-sin-popup-diseno.md): la ficha de una
// clase y el flujo de login/datos/pago son dos NIVELES de profundidad sobre el
// listado, no una lista plana de pasos — `nivelDeVista` es la única fuente de
// verdad de esa jerarquía, la usan tanto el efecto que empuja historial como
// el que lo restaura al hacer Atrás/Adelante, para no desincronizarse entre
// sí. 0 = listado, 1 = ficha de una clase, 2 = cualquier paso del flujo
// (login/registro/contrato/confirm/datos/pago/espera/pendiente/done) — el
// flujo entero cuenta como UN nivel: cambiar de paso reemplaza la entrada de
// historial en vez de apilar una por paso (nueve pasos posibles harían que
// completar una reserva dejara nueve pulsaciones de Atrás para volver al
// listado). Un único Atrás desde cualquier paso del flujo vuelve a la ficha
// (o al listado si se entró sin pasar por ella, p. ej. "Acceder" en la
// cabecera); un Atrás más desde la ficha vuelve al listado.
type VistaPaso = 'ficha' | Step;
function nivelDeVista(paso: VistaPaso | null): 0 | 1 | 2 {
  if (paso === null) return 0;
  if (paso === 'ficha') return 1;
  return 2;
}
/** Clave de comparación barata para «¿ha cambiado de verdad el paso/clase?». */
function claveDeVista(paso: VistaPaso | null, claseId: string): string {
  return paso ? `${paso}:${claseId}` : '';
}

// Criterios de estado (mismos que el portal): qué reservas ocupan plaza y cuáles
// cuentan como reserva activa de la propia socia.
const OCUPA_PLAZA: Reserva['estado'][] = ['CONFIRMADA', 'ASISTIDA'];
const RESERVA_ACTIVA: Reserva['estado'][] = ['CONFIRMADA', 'LISTA_ESPERA'];

// Tema del calendario PÚBLICO: la paleta propia del rediseño de /reservar
// (RESERVAR_PALETA, lib/reservar-publico-tokens.ts) — YA NO `MODO_TOKENS.dia`
// (esa es la del portal privado de la clienta, un contexto de marca distinto
// a propósito, ver .claude/tentare-os.md "Arquitectura de marca"). Fuera del
// componente para no recrearlo en cada render.
//
// ⚠️ **Solo queda `RT.hero` aquí, y a propósito.** El resto de tokens de esta
// página se leen por variable CSS (`var(--portal-…)`) y no por este objeto: al
// incrustar el widget sobre una web oscura, la raíz recibe la paleta de NOCHE en
// línea, y un token de JS fijado a `dia` a nivel de módulo NO se entera — las
// tarjetas se quedaban blancas con letra clara encima. El degradado del hero es
// la excepción legítima: solo se pinta fuera del modo incrustado.
const RESERVAR_TOKENS = RESERVAR_PALETA.dia;
const RT = RESERVAR_TOKENS;

// Mínimo razonable de dígitos para un teléfono real (España: 9). No se valida
// prefijo — el estudio contacta por WhatsApp/llamada, un formato demasiado
// estricto rechazaría números correctos de otros países sin aportar nada.

export default function ReservarPage() {
  const {
    sesiones, reservas, socios, tiposClase, salas, instructores, spots,
    planesTarifa, suscripciones, studioConfig, studio, redesSociales, dataLoaded, errorPublico, recargarPublico,
    addReserva, updateSocio, cancelarReserva, aceptarOfertaEspera, addSocioFromPortal, planMasElegidoId, sustitucionesConfirmadas, textosReservar, bloquesReservar,
    aparienciaWidget,
    citasServicios, citasDisponibilidad, citas, reservarCitaPublica, cancelarCita,
  } = useStudio();

  // BUG del calendario que no se enteraba de una clase nueva: el único
  // refresco que ya existía en studio-context.tsx (visibilitychange/focus,
  // studio-context.tsx:1096) solo se dispara al CAMBIAR de pestaña — una
  // visitante mirando el widget incrustado sin moverse de ahí nunca lo
  // disparaba, por mucho que el estudio creara la clase mientras tanto. Un
  // tic mucho más espaciado que `REFRESCO_ACTIVO_MS` (ese es para aforo, 5s,
  // demasiado caro para el catálogo entero): aquí lo que cambia es "existe
  // una clase nueva", que no necesita el mismo tiempo real que "¿queda
  // plaza?". `recargarPublico` (=`cargarPublico`) trae el catálogo completo,
  // así que el intervalo va deliberadamente largo. Se salta el tic con la
  // pestaña oculta (nadie mira) — al volver a primer plano ya resincroniza el
  // listener de foco de studio-context.tsx.
  const recargarPublicoRef = useRef(recargarPublico);
  useEffect(() => { recargarPublicoRef.current = recargarPublico; });
  useEffect(() => {
    const id = setInterval(() => {
      if (document.hidden) return;
      recargarPublicoRef.current();
    }, 60_000);
    return () => clearInterval(id);
  }, []);

  // Fase 7 "Widget Experience Builder": qué pestañas y si se ofrece el
  // Discovery Quiz, configurable por estudio en el bloque `reservarHorario`
  // del mismo Theme Builder que ya decide orden/visibilidad de secciones
  // (más abajo, `posicionSeccion`/`seccionVisible`). `resolverConfig` rellena
  // con `porDefecto: true` un estudio que nunca tocó este ajuste — cero
  // cambio para nadie que no lo use. "Clases" no tiene checkbox: es la
  // pestaña de caída y no puede desactivarse.
  const bloqueHorario = bloquesReservar.find((b) => b.kind === 'sistema' && b.sistemaId === 'reservarHorario');
  const configHorario = resolverConfig(CAMPOS_RESERVAR_HORARIO, bloqueHorario && bloqueHorario.kind === 'sistema' ? bloqueHorario.config : undefined);
  const tabHabilitada = (t: Tab) => t === 'clases'
    || (t === 'citas' && configHorario.mostrarCitas !== false)
    || (t === 'misreservas' && configHorario.mostrarMisReservas !== false)
    || (t === 'estudio' && configHorario.mostrarEstudio !== false)
    || (t === 'cuenta' && configHorario.mostrarCuenta !== false);
  // ⚠️ Sin identidad inventada. Estos cuatro valores caían a los de Tentare y a
  // una dirección de ejemplo ('Tentare', 'hola@tentare.es', '+34 951 000 000',
  // 'Málaga · Calle Larios 12'). Se ven cuando `studio` es null — es decir,
  // cuando los datos del estudio NO han cargado. Medido en el navegador con la
  // API devolviendo 500: la página de reservas de un estudio se pintaba entera,
  // con aspecto normal, anunciando el nombre y el teléfono de OTRA empresa a las
  // clientas de ese estudio, y sin decir en ningún sitio que algo había fallado.
  //
  // Un hueco vacío es recuperable; una identidad equivocada en una página
  // pública, no. Y el caso real de fallo ya no llega aquí: se corta antes con
  // el estado de error de abajo.
  const estudioNombre = studio?.nombre ?? '';
  const estudioLogo = studio?.logoUrl ?? null;
  const estudioDireccion = [studio?.ciudad, studio?.direccion].filter(Boolean).join(' · ');
  // Web + redes, ya resueltas a enlaces seguros y en el orden del catálogo.
  const canalesEstudio = canalesDelEstudio({ sitioWeb: studio?.sitioWeb, redesSociales });
  const estudioEmail = studio?.email ?? '';
  const estudioTelefono = studio?.telefono ?? '';
  // La foto de portada. `fotoUrl` es la del estudio y `imagenBienvenidaUrl` la
  // que ya se usa en la bienvenida del portal — se prefiere la primera y se cae
  // a la segunda para no pedirle al estudio que suba dos veces lo mismo.
  // Sin ninguna de las dos entra la de por defecto: antes el hero se quedaba a
  // una columna, que es como se veía esta página el primer día de todo estudio.
  const heroFoto = imagenDeEstudio('portada', [studio?.fotoUrl, studio?.imagenBienvenidaUrl]);
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

  // Cómo se ve DENTRO de la web del estudio. Solo en modo incrustado: la página
  // suelta `/reservar/<slug>` es de Tentare y sigue con su decorado.
  //
  // Los ajustes que la propietaria guardó en Apariencia, con los `?params=` del
  // iframe pisándolos. Fuera del modo incrustado no se aplica ninguno de los
  // dos: `/reservar/<slug>` es la página de Tentare.
  const apariencia = useMemo(
    () => resolverApariencia(embedMode ? aparienciaWidget : null, embedMode ? searchParams : null),
    [embedMode, aparienciaWidget, searchParams],
  );
  // El resto del snippet (filtros/vista/toggles/diseño/marca), también SOLO
  // incrustado — la página suelta /reservar/<slug> es de Tentare y no cambia.
  // `fondo`/`tinta` los sigue resolviendo `resolverApariencia` de arriba
  // (mismos nombres de param de siempre); de aquí solo se consume lo nuevo.
  const configWidget = useMemo(
    () => (embedMode ? resolverConfigWidget(searchParams) : null),
    [embedMode, searchParams],
  );
  // `marca=` pisa `--portal-brand` en el subárbol del widget. El foreground se
  // deriva por luminancia — dejar el crema del tema sobre una marca clara
  // dejaría el texto de los botones ilegible.
  const varsMarca = useMemo(() => {
    const marca = configWidget?.colorPrimario;
    if (!marca) return null;
    const l = luminancia(marca.slice(0, 7));
    return {
      '--portal-brand': marca,
      '--portal-brand-foreground': l != null && l < 0.45 ? '#FFFFFF' : '#22261F',
    };
  }, [configWidget]);
  // ⚠️ Solo se pisan las variables cuando hace falta. Emitirlas SIEMPRE dejaría
  // el widget con la paleta en línea aunque nadie la haya tocado, y a partir de
  // ahí un cambio del tema del portal ya no llegaría aquí.
  const varsTexto = useMemo(
    () => (embedMode && modoTextoDe(apariencia) === 'noche' ? varsReservarModo('noche') : null),
    [embedMode, apariencia],
  );
  // ⚠️ El calendario NO se pinta por variables CSS: recibe los tokens por prop
  // (`t=`) y los reparte a mano por todos sus subcomponentes. Es un tercer canal
  // de color además de las variables y de `RT`, y por eso se le escapaba al
  // modo: con `RESERVAR_TOKENS` fijo, la tira de días, las tarjetas de clase, la
  // hoja de reserva y el estado vacío se quedaban claros sobre una web oscura
  // aunque el resto de la página ya hubiera cambiado. Medido en producción, no
  // supuesto: un icono de 44 px seguía en `#E7E4DB` (el `surface2` del día).
  //
  // Fuera del modo incrustado es el MISMO objeto de siempre, así que ningún
  // estudio ve un cambio.
  const tokensCalendario = useMemo(
    () => (embedMode && modoTextoDe(apariencia) === 'noche' ? RESERVAR_PALETA.noche : RESERVAR_TOKENS),
    [embedMode, apariencia],
  );
  // Widget incrustado sobre una web oscura. Se saca a su propia constante
  // porque lo necesita algo más que los tokens del calendario — ver el aviso de
  // error del checkout, más abajo.
  const esNoche = embedMode && modoTextoDe(apariencia) === 'noche';
  const fuenteWidget = familiaCss(apariencia);
  const cssFuente = urlFuente(apariencia);
  // Titulares/horas/precios (widgetFuenteDisplay). Contrato de AparienciaWidget:
  // `fuenteDisplay` a null hereda de `fuente` — el mismo fallback que ya
  // resuelve `resolverTokensReservar` (lib/reservar-publico-tokens.ts:101).
  // Se aplica poniendo `--portal-heading-font` en el subárbol del widget: es la
  // PRIMERA parada de la pila `serif` (lib/portal-design.ts) que ya usan los
  // ~30 titulares de esta pantalla — cero cambios por titular, y el mismo
  // canal que ya usa el tema "Geométrico" del portal.
  const fuenteDisplayWidget = familiaDisplayCss(apariencia) ?? fuenteWidget;
  const cssFuenteDisplay = urlFuenteDisplay(apariencia);

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

  // Fase 2 "Growth Widget": primer evento del funnel. `studio?.id` llega tras
  // resolver el catálogo público — sin ref, cada refresco del catálogo
  // (recargarPublico) dispararía el evento otra vez.
  const widgetLoadedRef = useRef(false);
  useEffect(() => {
    if (widgetLoadedRef.current || !studio?.id) return;
    widgetLoadedRef.current = true;
    trackEventoWidget(studio.id, 'widget_loaded', { origen: searchParams.get('ref') });
    // Fase 8 (CRO): en Modo A "cargado" y "visto" son el mismo instante
    // (página completa, visible al pintar) — Modo B ya dispara los dos
    // juntos (main.tsx), aquí faltaba este.
    trackEventoWidget(studio.id, 'widget_viewed', { origen: searchParams.get('ref') });
  }, [studio?.id, searchParams]);

  const [filtroTipo, setFiltroTipo] = useState('');
  // Con `?tipos=` en el snippet, los chips solo enseñan ese subconjunto: un
  // chip de un tipo que el snippet excluye daría siempre cero resultados.
  const tiposClaseVisibles = useMemo(
    () => (configWidget?.tipos.length ? tiposClase.filter(t => configWidget.tipos.includes(t.id)) : tiposClase),
    [tiposClase, configWidget],
  );
  // Filtros de nivel/horario/día/instructora/sala — sin UI propia hoy (vivían
  // en el rail lateral y el quiz de descubrimiento, quitados al adoptar el
  // handoff design_handoff_widget_reservas), pero `slots` sigue filtrando por
  // ellos si algún día se reconecta un control.
  const [filtroNivel] = useState('');
  const [filtroHorario] = useState<'' | 'manana' | 'mediodia' | 'tarde'>('');
  const [filtroDias] = useState<number[]>([]);
  const [filtroInstructor, setFiltroInstructor] = useState('');
  const [filtroSala] = useState('');
  // Chips de instructora — mismo criterio que "El equipo" (`queImparten`):
  // solo quien de verdad da clases (quita recepción/gerencia y bajas), para
  // no ofrecer un filtro que siempre da cero resultados.
  const instructoresVisibles = useMemo(() => queImparten(instructores), [instructores]);
  // Chips combinados tipo+instructora del bloque sticky (diseño "Tentare
  // Portal Reservas"): "Todas" + un chip por tipo + un chip por instructora,
  // en una sola fila — dos filtros independientes (`filtroTipo`/
  // `filtroInstructor`) que conviven porque `slots` ya los aplica los dos a
  // la vez (líneas 1114/1123 y 1340/1347).
  const filtrosChipsClases = useMemo(() => {
    const chips: { id: string; label: string; activo: boolean; onClick: () => void }[] = [
      { id: '__todas', label: 'Todas', activo: filtroTipo === '' && filtroInstructor === '', onClick: () => { setFiltroTipo(''); setFiltroInstructor(''); } },
    ];
    for (const t of tiposClaseVisibles) {
      chips.push({ id: `tipo:${t.id}`, label: t.nombre, activo: filtroTipo === t.id, onClick: () => setFiltroTipo(filtroTipo === t.id ? '' : t.id) });
    }
    for (const i of instructoresVisibles) {
      chips.push({ id: `instructor:${i.id}`, label: i.nombre, activo: filtroInstructor === i.nombre, onClick: () => setFiltroInstructor(filtroInstructor === i.nombre ? '' : i.nombre) });
    }
    return chips;
  }, [tiposClaseVisibles, instructoresVisibles, filtroTipo, filtroInstructor]);
  // Buscar por texto libre — nombre de clase o de instructora, sobre los
  // mismos slots ya cargados. Sin UI propia hoy (el handoff
  // design_handoff_widget_reservas no trae buscador), pero `slots` sigue
  // filtrando por él si algún día se reconecta una entrada de texto.
  const [busqueda] = useState('');
  // Objetivo de la clase — sin UI propia hoy (era del quiz de descubrimiento,
  // quitado al adoptar el handoff design_handoff_widget_reservas), pero
  // `slots` sigue filtrando por él si algún día se reconecta un selector.
  const [filtroObjetivo] = useState('');
  // Especialidades de cada instructora (P1 auditoría Momence-vs-Tentare) —
  // NO es un campo nuevo, se deriva de qué tipos de clase imparte de verdad
  // con los datos que esta página ya carga (sesiones/tiposClase) — nunca
  // inventar una categoría.
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
  const tabInicial = searchParams.get('tab');
  const [tab, setTab] = useState<Tab>(
    TAB_IDS.includes(tabInicial as Tab) && tabHabilitada(tabInicial as Tab) ? (tabInicial as Tab) : 'clases',
  );

  // Fase 8 (CRO): "vio el listado de clases" — una vez por sesión, mismo
  // patrón guardia que widgetLoadedRef arriba. 'clases' es la pestaña por
  // defecto, así que la mayoría de visitas lo disparan de inmediato.
  const classListViewedRef = useRef(false);
  useEffect(() => {
    if (classListViewedRef.current || tab !== 'clases' || !studio?.id) return;
    classListViewedRef.current = true;
    trackEventoWidget(studio.id, 'class_list_viewed', {});
  }, [tab, studio?.id]);

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
  // Mismo cerrojo doble que `confirmando`/`confirmandoRef`, para
  // `handleSignContract`: sin él, dos pulsaciones rápidas de "Aceptar y
  // continuar" en el paso 'contrato' de una walk-in en acceso genérico
  // corrían dos veces `crearAltaWalkIn` con dos `soc-${Date.now()}`
  // distintos, y `socios` no tiene ningún UNIQUE que lo impida a nivel de
  // servidor — dos fichas de socia reales para la misma persona (17ª
  // auditoría, P-6).
  const [firmando, setFirmando] = useState(false);
  const firmandoRef = useRef(false);
  const [loginForm, setLoginForm] = useState({ nombre: '', apellidos: '', email: '', telefono: '' });
  const [loginStep, setLoginStep] = useState<Step>('login');
  // "Pagar y reservar sin login previo" (docs/reserva-sin-login-diseno.md §3/§4).
  const [datosPlan, setDatosPlan] = useState<PlanTarifa | null>(null);
  const [datosClientSecret, setDatosClientSecret] = useState<string | null>(null);
  const [datosError, setDatosError] = useState('');
  const [datosCargando, setDatosCargando] = useState(false);
  // "Información adicional" (diseño "Tentare Portal Reservas"): datos de perfil
  // opcionales del checkout sin login — conflicto aprobado ("con migración",
  // aunque al final no hizo falta: campos_extra/fecha_nacimiento ya existían
  // en el esquema). Van a checkout-embebido → metadata → entregarPlanComprado,
  // y solo se escriben si la compra crea una ficha NUEVA.
  const [datosInfoAdicional, setDatosInfoAdicional] = useState({ genero: '', comoConociste: '', codigoPostal: '', fechaNacimiento: '' });
  // Marca que la pantalla 'done' llegó vía este camino (pago sin login), para
  // mostrar la mención de "hemos creado tu cuenta" en vez del copy genérico.
  const [pagoWebSinLogin, setPagoWebSinLogin] = useState(false);
  // P1-3: estado REAL de la reserva tras el pago (la crea el WEBHOOK, no esta
  // página). 'confirmando' mientras se pregunta a /api/public/estado-pago;
  // 'tardando' cuando se agota el techo del polling sin respuesta — la
  // pantalla nunca dice «confirmada» sin que el servidor lo haya dicho antes.
  const [confirmacionPago, setConfirmacionPago] = useState<
    'confirmando' | 'confirmada' | 'lista_espera' | 'pendiente_aprobacion' | 'tardando' | 'fallida'
  >('confirmando');
  const [claseConfirmada, setClaseConfirmada] = useState<{ nombre: string; inicio: string } | null>(null);
  const [enlaceEnviado, setEnlaceEnviado] = useState(false);
  // Login con contraseña (día a día, sin depender del viaje de email — ver
  // lib/use-socia-session.ts): alternativa al enlace mágico dentro del mismo
  // paso 'login', para quien ya se creó una contraseña una vez. Un widget
  // embebido en un <iframe> de tercero no puede fiarse de que el navegador
  // comparta sesión entre pestañas (Safari/Chrome recortan ese acceso cada
  // vez más), así que esto es lo que hace viable volver sin salir del widget.
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
  // Fase 4 del rediseño (docs/widget-reservas-fase4-brief-diseno.md, formato
  // 03): tabs Próximas/Pasadas sobre la MISMA lista ya cargada — sin fetch
  // aparte, `misReservas` ya trae ambas.
  const [misReservasTab, setMisReservasTab] = useState<'proximas' | 'pasadas'>('proximas');
  // Diseño "Tentare Portal Reservas": "Mis reservas" es un SHEET que se
  // desliza desde abajo sobre la lista de clases, no una pestaña de página
  // completa — el estado que antes vivía en `tab === 'misreservas'` sigue
  // igual (mismo contenido, mismos estados reales), solo cambia el
  // contenedor que lo pinta.
  const [misReservasAbierta, setMisReservasAbierta] = useState(false);
  // Sin NEXT_PUBLIC_TURNSTILE_SITE_KEY configurada, el widget no se pinta y
  // esto nunca bloquea el envío — mismo comportamiento que /login.
  const { widget: captcha, pedirToken } = useCaptcha();

  // Aceptación del contrato (clickwrap: checkbox + fecha + versión).
  const [terminosAceptados, setTerminosAceptados] = useState(false);
  // Casilla explícita del popup «pagar y reservar sin cuenta» (rediseño
  // Momence): «Al inscribirme, acepto la política de privacidad». Solo abre la
  // puerta al pago — la aceptación del contrato completo sigue registrándose
  // por el mecanismo de siempre (el portal la pide en la primera visita, ver
  // nota CREAR_FICHA en app/api/public/checkout-embebido/route.ts).
  const [privacidadAceptada, setPrivacidadAceptada] = useState(false);

  // Documento legal a mostrar en modal (texto renderizado por React → escapado;
  // sustituye al document.write con HTML sin escapar, que era un vector XSS).
  const [legalDoc, setLegalDoc] = useState<{ label: string; text: string } | null>(null);

  // ── P0-3 (mobile UX embebido): overlays anclados a lo que el usuario VE ──
  // El iframe de Modo A se auto-dimensiona a TODO el contenido (2000px o más),
  // así que un overlay con `inset: 0` se ancla al iframe entero: medido en
  // producción, el modal «Tus datos» apareció a ~1000px por debajo del borde de
  // la pantalla del usuario. El snippet NUEVO (tab-api.tsx) informa por
  // postMessage (`tentareHostViewport`) de qué franja del iframe está visible
  // de verdad; los overlays se posicionan dentro de ella. Con el snippet VIEJO
  // (ya pegado en webs que no se actualizan solas) no llega ningún mensaje:
  // los overlays caen al anclaje al TOP del iframe (siempre mejor que el
  // fondo — el usuario acaba de tocar algo que está en su pantalla) y se envía
  // `tentareScrollTo`, que el snippet nuevo atiende con scrollIntoView y el
  // viejo ignora sin romperse.
  //
  // El origen del mensaje no se puede validar contra una lista aquí (el host
  // es la web de cada estudio, cualquiera): se valida ESTRUCTURA estricta y
  // solo se usa para posicionar overlays — nunca toca datos ni navegación.
  const [franjaVisible, setFranjaVisible] = useState<{ top: number; height: number } | null>(null);
  const franjaRef = useRef<{ top: number; height: number } | null>(null);
  // Nodo raíz del widget: el seguimiento de scroll escribe aquí las custom
  // properties `--tentare-overlay-top`/`-height` DIRECTAMENTE por DOM en cada
  // fotograma, sin pasar por setState. Cascadean por herencia CSS a cualquier
  // descendiente que las lea con `var(...)` — que es como quedan expresados
  // `overlayEmbed` y `overlayPos` (BookingSheet) más abajo. Ver el bloque de
  // `onMsg` para el porqué: un `setState` por frame de scroll re-renderiza
  // esta página entera (~3200 líneas, sin memoización por sección), y eso es
  // justo el trabajo de hilo principal que compite con el scroll nativo y se
  // siente como trompicones — medido/reportado en vídeo real, invisible en
  // capturas fotograma a fotograma porque cada una pinta bien; lo que falla
  // es el tiempo ENTRE fotogramas.
  const rootRef = useRef<HTMLDivElement>(null);
  // La hoja de confirmar cita vive dentro de <CitasPublica>; nos avisa por
  // `onOverlayAbierto` para poder anclarla igual que las demás.
  const [citaConfirmandoAbierta, setCitaConfirmandoAbierta] = useState(false);
  // Fase 4 del rediseño (docs/widget-reservas-fase4-brief-diseno.md, formato
  // 05 "Reserva esta clase"): un enlace directo a `?sesion=` ya no salta
  // recto a la hoja de reserva — aterriza primero en una ficha-resumen de ESA
  // clase (fecha/hora/instructora/plazas + precio), sin selector para
  // cambiarla (respuesta 4 del brief). "Reservar mi plaza" es lo que abre la
  // hoja de siempre. Declarado aquí (antes de `overlayEmbebidoAbierto`/
  // `enVistaReserva`, que lo usan) para no depender del orden de ejecución.
  const [fichaSesionId, setFichaSesionId] = useState<string | null>(null);
  const overlayEmbebidoAbiertoRef = useRef(false);
  // Botón Atrás real: qué slot tiene abierta su ficha, no solo si "hay una
  // ficha abierta" — el id hace falta para reflejarlo en la URL (`?clase=`) y
  // para poder reabrirla al restaurar desde el historial o desde un refresh.
  const [fichaAbiertaSlotId, setFichaAbiertaSlotId] = useState<string | null>(null);
  const fichaCalendarioAbierta = fichaAbiertaSlotId !== null;
  useEffect(() => {
    if (!embedMode || typeof window === 'undefined' || window.parent === window) return;
    const onMsg = (e: MessageEvent) => {
      const v = (e.data as { tentareHostViewport?: { top?: unknown; height?: unknown } } | null)?.tentareHostViewport;
      if (!v || typeof v !== 'object') return;
      const top = Number(v.top);
      const height = Number(v.height);
      if (!Number.isFinite(top) || !Number.isFinite(height) || top < 0 || height <= 0) return;
      const franja = { top: Math.round(top), height: Math.min(Math.round(height), 4000) };
      franjaRef.current = franja;
      // El host manda un mensaje por frame de scroll y esta página es grande:
      // un `setState` aquí re-renderiza el árbol entero en cada uno (medido
      // como la causa del scroll a trompicones reportado en vídeo real). Con
      // un overlay abierto, el seguimiento sigue vivo pero por DOM directo
      // (las custom properties del root), NUNCA por React — `setFranjaVisible`
      // solo se llama una vez al ABRIR (ver el efecto de abajo), para que el
      // primer render ya salga en el sitio correcto antes de que llegue el
      // primer mensaje.
      if (overlayEmbebidoAbiertoRef.current && rootRef.current) {
        rootRef.current.style.setProperty('--tentare-overlay-top', `${franja.top}px`);
        rootRef.current.style.setProperty('--tentare-overlay-height', `${franja.height}px`);
      }
    };
    window.addEventListener('message', onMsg);
    return () => window.removeEventListener('message', onMsg);
  }, [embedMode]);
  // Al abrir cualquier overlay embebido: congela la última franja conocida en
  // estado (para posicionarlo ya en este render) y, si no hay franja útil
  // (snippet viejo, o el iframe casi fuera de pantalla), pide al host que
  // traiga el iframe a la vista. Con el snippet nuevo, el scroll que provoca
  // dispara mensajes nuevos y el overlay se recoloca solo.
  // ⚠️ Toda hoja nueva del flujo tiene que sumarse a esta expresión o pierde
  // el seguimiento del scroll EN SILENCIO: se pinta una vez con la franja
  // congelada y luego se despega. Le pasaba a la de «Citas», que ni
  // siquiera exponía su estado hacia fuera.
  const overlayEmbebidoAbierto = embedMode && (fichaCalendarioAbierta || bookingSesionId !== null || fichaSesionId !== null || legalDoc !== null || citaConfirmandoAbierta);
  // Rediseño "sin popup": el listado (título "Clases", filtros, calendario,
  // caja "cómo funciona") se oculta mientras se ve la ficha de una clase O
  // el flujo de login/datos/pago que viene después — las DOS mitades de la
  // misma "vista de reserva". Solo con la ficha (`fichaCalendarioAbierta`) no
  // basta: en cuanto se pulsa "Reservar" dentro de ella, `cerrarHoja()` la
  // cierra sola (se delega al flujo, ver el docblock de `onReservar` en
  // `ReservaCalendario`) y `fichaCalendarioAbierta` vuelve a `false` — sin
  // este OR, el listado reaparecía DEBAJO del flujo en el mismo instante en
  // que se pulsaba el botón (encontrado con la propia captura de
  // verificación de esta fase, no antes de escribirlo).
  //
  // ⚠️ Mismo aviso que el de `overlayEmbebidoAbierto` unas líneas más arriba:
  // toda hoja/ficha nueva que tape el listado tiene que sumarse AQUÍ o se
  // pinta encima/debajo del listado genérico en vez de sola. Le pasó a
  // `fichaSesionId` (la ficha-resumen del deep-link `?sesion=`, Fase 4 CRO):
  // se añadió sin sumarla a este `||`, y una visitante que llegaba por ese
  // enlace veía la ficha Y los tabs/filtros/bonos/pie alrededor (17ª
  // auditoría, P-6).
  const enVistaReserva = fichaCalendarioAbierta || bookingSesionId !== null || fichaSesionId !== null;
  useEffect(() => {
    overlayEmbebidoAbiertoRef.current = overlayEmbebidoAbierto;
    if (!overlayEmbebidoAbierto || typeof window === 'undefined' || window.parent === window) return;
    // Copia puntual de la última franja recibida (vive en un ref para no
    // re-renderizar la página en cada frame de scroll del host).
    setFranjaVisible(franjaRef.current);
    // Sincroniza las custom properties AL ABRIR: si un overlay anterior dejó
    // un valor de scroll distinto escrito ahí, `var(--x, fallback)` preferiría
    // ese resto sobre el fallback nuevo de React y la hoja nacería en el sitio
    // equivocado hasta el siguiente frame de scroll.
    if (rootRef.current) {
      if (franjaRef.current) {
        rootRef.current.style.setProperty('--tentare-overlay-top', `${franjaRef.current.top}px`);
        rootRef.current.style.setProperty('--tentare-overlay-height', `${franjaRef.current.height}px`);
      } else {
        rootRef.current.style.removeProperty('--tentare-overlay-top');
        rootRef.current.style.removeProperty('--tentare-overlay-height');
      }
    }
    if (!franjaRef.current || franjaRef.current.height < 320) {
      window.parent.postMessage({ tentareScrollTo: true, tentareSlug: slug }, '*');
    }
  }, [overlayEmbebidoAbierto, slug]);
  // Callback estable para el calendario (su efecto interno lo lleva en deps).
  const alCambiarFicha = useCallback(
    (abierta: boolean, slotId: string | null) => setFichaAbiertaSlotId(abierta ? slotId : null),
    [],
  );
  // Orden puntual para abrir (o cerrar) una ficha concreta desde FUERA del
  // calendario — mismo patrón que `irADia` en `ReservaCalendarioProps`: el
  // día/la ficha abierta los sigue llevando el estado INTERNO del componente,
  // esto es una orden de una sola vez, no un control continuo. Hace falta
  // para restaurar la ficha al volver con el Atrás del navegador o al
  // refrescar sobre una URL con `?paso=ficha&clase=...`.
  const [abrirFichaExterna, setAbrirFichaExterna] = useState<{ slotId: string | null; nonce: number }>({ slotId: null, nonce: 0 });

  // ── Botón Atrás real (docs/rediseno-widget-sin-popup-diseno.md) ───────────
  // ⚠️ `router.push`/`router.replace` (`next/navigation`) NO llegan a
  // comprometerse en esta ruta para una navegación que SOLO cambia la query
  // string: se llama, el fetch RSC de verdad sale y responde 200, pero
  // `useSearchParams()`/`window.location` nunca se actualizan — medido en
  // build de producción, reproducido incluso con un `onClick` plano sin
  // ningún efecto de por medio, así que no es un problema de esta lógica.
  // El History API crudo (`pushState`/`replaceState`/`go`) SÍ confirma
  // cambiar `window.location` de verdad, así que el mecanismo entero vive
  // sobre él en vez de sobre el router — un caso real de "decide la
  // arquitectura más segura", no un capricho.
  //
  // Dos efectos que se turnan sin pisarse: uno refleja el estado (ficha/flujo
  // abiertos) en la URL, el otro hace lo inverso al recibir un cambio de URL
  // (Atrás/Adelante del navegador, o una carga directa/refresh sobre una URL
  // con `?paso=`). `claveVistaRef` es el único punto de verdad de "qué cree
  // cada uno que ya está aplicado" — el efecto que causa un cambio lo escribe
  // ahí ANTES de tocar la URL/estado, así que cuando el cambio se refleja de
  // vuelta el otro lo ve ya sincronizado y no hace nada. Sin este cerrojo,
  // cada Atrás real desencadenaría un push nuevo que a su vez... — el bucle
  // exacto que pide evitar el rediseño.
  const claveVistaRef = useRef('');
  // Cuántas entradas de historial hemos empujado NOSOTROS desde el listado.
  // Sin este contador, un cierre programático (botón "Volver"/"Cerrar", NO
  // el Atrás físico) no sabría cuántas veces retroceder con `history.go()` —
  // y adivinarlo con un solo paso deja colgada una entrada extra si se saltó
  // del flujo directo a cerrar sin pasar por la ficha.
  const entradasPropiasRef = useRef(0);
  // La PRIMERA vez que el efecto de "URL → estado" corre, puede ser porque la
  // página se cargó (o refrescó) ya con `?paso=...` en la URL — un enlace
  // compartido, no algo que hayamos empujado nosotros. Esa entrada no cuenta
  // para `entradasPropiasRef` (no la puede deshacer un `history.go()` propio,
  // no sabemos si hay nada detrás en el historial de esta pestaña).
  const primerPasoUrlRef = useRef(true);

  // Posicionamiento que se pasa a los PublicSheet en modo embebido. `top`/
  // `height` + `bottom: auto` pisan el `inset-0` de la clase; `alignItems`
  // pisa `items-end sm:items-center` (ese `sm:` mide el ancho del IFRAME, no
  // de la pantalla real — con un iframe estrecho anclaba SIEMPRE al fondo).
  // `top`/`height` van como `var(--tentare-overlay-*, fallback)`: el fallback
  // es el valor de React (correcto al abrir), pero el valor VIVO durante el
  // scroll lo escribe `onMsg` directo en el DOM (ver `rootRef` arriba) — así
  // esta hoja sigue el scroll del host sin que ninguno de esos frames pase
  // por un re-render de la página.
  const overlayEmbed = embedMode
    ? (franjaVisible
      ? { top: `var(--tentare-overlay-top, ${franjaVisible.top}px)`, height: `var(--tentare-overlay-height, ${franjaVisible.height}px)`, bottom: 'auto', alignItems: 'center' } as const
      : { alignItems: 'flex-start' } as const)
    : undefined;

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
  // Auditoría vs Momence (#canje-codigos-descuento-checkout): plegado por
  // defecto — la mayoría de visitas no traen código, no hace falta ruido
  // visual permanente por un campo que casi nadie usa. El servidor valida y
  // aplica el descuento al crear el checkout; aquí solo viaja el texto.
  const [mostrarCodigo, setMostrarCodigo] = useState(false);
  const [codigoDescuento, setCodigoDescuento] = useState('');

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
  const leadCompletedRef = useRef(false);
  useEffect(() => {
    // Fase 8 (CRO): volver aquí con `wsid` en la URL Y ya autenticada es
    // justo el momento que lead_started no podía medir por sí solo — se
    // pidió el enlace en una sesión/pestaña, se abrió (y autenticó) en
    // otra. `wsid` viaja siempre junto a `sesion`/`acceso=1`
    // (use-socia-session.ts), así que basta comprobarlo aquí, sin tocar el
    // resto del deep-link. Ver docs/cro-analytics-widget-diseno.md §1.1.
    if (!leadCompletedRef.current && autenticado && studio?.id && searchParams.get('wsid')) {
      leadCompletedRef.current = true;
      trackEventoWidget(studio.id, 'lead_completed', {});
    }
    if (!mounted || deepLinkHecho.current) return;
    const sesionDeepLink = searchParams.get('sesion');
    if (sesionDeepLink) {
      if (!sesiones.some(s => s.id === sesionDeepLink)) return; // esperar a que carguen
      deepLinkHecho.current = true;
      // eslint-disable-next-line react-hooks/set-state-in-effect -- Deep link: lee searchParams para abrir una reserva concreta. Depende de la URL, no de props ni estado.
      setTab('clases');
      setFichaSesionId(sesionDeepLink);
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
    // Fase 8 (CRO): el propio Stripe diciendo "canceló" — más fiable que
    // cualquier heurístico de tiempo. Ver docs/cro-analytics-widget-diseno.md §5.1.
    if (compra === 'cancelada') {
      trackEventoWidget(studio?.id, 'booking_abandoned', { socioId: socia?.socioId ?? null });
    }
    const limpio = new URLSearchParams(searchParams.toString());
    limpio.delete('compra');
    router.replace(`/reservar/${slug}${limpio.toString() ? `?${limpio.toString()}` : ''}`, { scroll: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Retorno de Stripe tras un 3DS que SÍ exige salir de la página (banco sin
  // soporte para el modal embebido — poco común, ver el comentario de `pagar()`
  // en checkout-embebido.tsx). Antes SOLO lo leía app/widget-bundle/main.tsx
  // (Modo A, embebido en la web de terceros) — quien pagaba directamente en
  // esta página (Modo B, /reservar/[slug]) volvía de la redirección a esta
  // MISMA pantalla con `?tentare_pago=retorno` en la URL y nadie lo leía: sin
  // aviso de ningún tipo, con el estado de React perdido por la navegación
  // completa (datosClientSecret/loginForm ya no existen). El mensaje es
  // deliberadamente neutro, igual que en Modo A — no se intenta resumir el
  // flujo de confirmación con estado que ya no está, solo se dice la verdad:
  // si el banco confirmó, la reserva llega por email en cuanto el webhook (o
  // el conciliador) la procese.
  const [avisoPagoRetorno, setAvisoPagoRetorno] = useState(false);
  useEffect(() => {
    if (searchParams.get('tentare_pago') !== 'retorno') return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- Lee el parámetro de retorno una sola vez y limpia la URL a continuación; depende de la URL, no de props ni estado.
    setAvisoPagoRetorno(true);
    const limpio = new URLSearchParams(searchParams.toString());
    limpio.delete('tentare_pago');
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

  // Cobertura de plan/bono de la socia autenticada → precio y frase de "qué te
  // cuesta" del CTA (informativo; el gate real se aplica en handleConfirm y en
  // el servidor).
  const precioClaseSuelta = planesTarifa.find(p => p.tipo === 'PUNTUAL' && p.activo)?.precio ?? null;
  // §3 — POR CLASE, no una vez para todo el listado. Antes esto se resolvía con
  // el tipo de la clase cuya hoja estuviera abierta y se aplicaba a todos los
  // slots: con un Reformer cubierto abierto, las filas de Mat perdían su precio
  // aunque hubiera que pagarlas; y sin hoja abierta la respuesta era "por el
  // plan", así que un bono solo de Reformer tampoco enseñaba precio en Mat. El
  // gate usaba el tipo correcto, así que nunca se cobró mal — pero se llegaba a
  // pulsar "Reservar" creyendo que estaba incluida. Cacheado por tipo.
  const cobertura = useMemo(() => resolutorCobertura({
    socioId: socia?.socioId, suscripciones, planesTarifa,
    hoyISO: localDate(now), precioClaseSuelta,
  }), [socia?.socioId, suscripciones, planesTarifa, now, precioClaseSuelta]);

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
  const { franjas: franjasHorario, confiable: horarioConfiable } = useMemo(() => {
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
      // Filtros CONGELADOS en el snippet del iframe (config-widget.ts):
      // ?tipos=/?instructoras=/?salas= por id, listas = multi-selección.
      // Se aplican ADEMÁS de los chips: el snippet acota el catálogo y la
      // visitante elige dentro de él.
      .filter(s => !configWidget?.tipos.length || configWidget.tipos.includes(s.tipoClaseId))
      .filter(s => !configWidget?.instructoras.length || configWidget.instructoras.includes(s.instructorId))
      .filter(s => !configWidget?.salas.length || configWidget.salas.includes(s.salaId))
      .filter(s => !filtroNivel || (s.tipo?.nivel ?? 'TODOS') === filtroNivel)
      .filter(s => !filtroInstructor || s.instructor?.nombre === filtroInstructor)
      .filter(s => !filtroSala || s.sala?.nombre === filtroSala)
      .filter(s => {
        if (!busqueda) return true;
        const q = busqueda.toLowerCase();
        return (s.tipo?.nombre ?? '').toLowerCase().includes(q) || (s.instructor?.nombre ?? '').toLowerCase().includes(q);
      })
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
          miOfertaExpiraEn: mia?.ofertaExpiraEn ?? null,
          precio: precioDeCobertura(cobertura(s.tipoClaseId)),
          coberturaTexto: textoCobertura(cobertura(s.tipoClaseId)),
        } satisfies ReservaSlot;
      });
  }, [sesionesRich, nowMs, configWidget, filtroTipo, filtroNivel, filtroHorario, filtroDias, filtroInstructor, filtroSala, busqueda, filtroObjetivo, miReservaPorSesion, ocupadasPorSesion, spotsActivosPorSala, spotsOcupadosPorSesion, cobertura]);

  // Efecto A — URL → estado. Cubre tres disparadores con el mismo código:
  // carga inicial/refresh con `?paso=` en la URL, y Atrás/Adelante del
  // navegador. Lee `searchParams` (Next) directamente en vez de un
  // `popstate` propio: `pushState`/`replaceState` (usados más abajo para
  // TODAS las escrituras de este flujo) SÍ integran con el router de
  // Next y resincronizan `useSearchParams()` — está documentado
  // (`node_modules/next/dist/docs/01-app/01-getting-started/
  // 04-linking-and-navigating.md`, "Native History API") y se confirmó en
  // vivo con un `pushState` de prueba. Un listener manual solo duplicaba lo
  // que Next ya hace.
  useEffect(() => {
    if (!mounted) return;
    const esPrimeraAplicacion = primerPasoUrlRef.current;

    const paso = searchParams.get('paso') as VistaPaso | null;
    const claseId = searchParams.get('clase') ?? '';
    const clave = claveDeVista(paso, claseId);
    if (clave === claveVistaRef.current) {
      // Ya sincronizado — incluye la carga inicial sin `?paso=` en la URL
      // (clave `''` contra el `''` inicial de `claveVistaRef`), que por eso
      // SÍ tiene que limpiar `primerPasoUrlRef` aquí y no solo más abajo.
      primerPasoUrlRef.current = false;
      return;
    }

    // Datos aún cargando: reintenta cuando `sesiones` (en las deps de abajo)
    // llegue, sin tocar `claveVistaRef`/`primerPasoUrlRef` — este intento no
    // cuenta como aplicado.
    if (paso === 'ficha' && claseId && !sesiones.length) return;
    if (paso && paso !== 'ficha' && !sesiones.length) return; // Ruta A (`openBooking`) necesita el catálogo para decidir si exige plan

    if (!esPrimeraAplicacion) {
      const nivelPrevio = nivelDeVista(claveVistaRef.current ? (claveVistaRef.current.split(':')[0] as VistaPaso) : null);
      const nivelNuevo = nivelDeVista(paso);
      // Un cambio que llega por aquí (no por el efecto de abajo, que ya deja
      // `claveVistaRef` sincronizado antes de tocar la URL) solo puede venir
      // de UNA pulsación física de Atrás/Adelante — exactamente UNA entrada
      // de historial, sea cual sea el salto de NIVEL que represente (un
      // `pushState` puede saltar 0→2 de una vez, ver el efecto de abajo).
      // Contar por nivel en vez de por entrada desincroniza
      // `entradasPropiasRef` del historial real.
      entradasPropiasRef.current = Math.max(0, entradasPropiasRef.current + (nivelNuevo > nivelPrevio ? 1 : nivelNuevo < nivelPrevio ? -1 : 0));
    }
    primerPasoUrlRef.current = false;
    claveVistaRef.current = clave;

    if (paso === 'ficha') {
      const existe = !!claseId && slots.some(s => s.id === claseId);
      // eslint-disable-next-line react-hooks/set-state-in-effect -- Sincroniza con la URL (sistema externo): abre la ficha que pide `?paso=ficha&clase=...` al volver con Atrás/Adelante o al refrescar. No es estado derivable de props/estado local.
      setAbrirFichaExterna(v => ({ slotId: existe ? claseId : null, nonce: v.nonce + 1 }));
      // Un Atrás desde el flujo (login/datos/pago/...) aterriza aquí — hay
      // que cerrar el flujo TAMBIÉN, no solo abrir la ficha: sin esto,
      // `bookingSesionId` seguía sin `null` y el flujo se quedaba pintado
      // por encima de la ficha recién reabierta.
      if (bookingSesionId !== null) closeBooking();
    } else if (paso) {
      // ⚠️ El guardia es `fichaAbiertaSlotId !== null` (la verdad real de si
      // HAY una ficha abierta ahora mismo, reflejada desde ReservaCalendario
      // vía `alCambiarFicha`) — NO `v.slotId` (`abrirFichaExterna` es un
      // canal de ÓRDENES de salida, nunca lo actualiza un clic normal del
      // usuario: comparar contra su propio valor anterior lo dejaría en
      // no-op para la ficha abierta por el camino de siempre).
      if (fichaAbiertaSlotId !== null) setAbrirFichaExterna(v => ({ slotId: null, nonce: v.nonce + 1 }));
      // Reabre vía `openBooking()`, NUNCA restaurando `loginStep` a ciegas:
      // decide el paso correcto según el estado de auth ACTUAL. `datos`/`pago`
      // dependen de un `datosClientSecret` (PaymentIntent) que no sobrevive a
      // un refresh — intentar restaurarlos tal cual dejaría una pantalla de
      // pago rota. `openBooking` nunca resuelve en 'pago' por sí sola, así
      // que ese caso cae a 'datos' (si sigue aplicando la Ruta A) o 'login' —
      // "conserva el estado cuando es posible, si no cae al camino seguro",
      // que es justo lo pedido.
      openBooking(claseId);
    } else {
      // Mismo motivo que arriba: comparar contra el estado REAL de la ficha,
      // no contra la última orden que le mandamos.
      if (fichaAbiertaSlotId !== null) setAbrirFichaExterna(v => ({ slotId: null, nonce: v.nonce + 1 }));
      if (bookingSesionId !== null) closeBooking();
    }
    // `slots` en las deps a propósito, además de `sesiones`: es la lista
    // FILTRADA que `ReservaCalendario` de verdad pinta (pasadas/ocultas por
    // filtro o por restricción de embed quedan fuera de `slots` aunque
    // sigan en `sesiones`), y hace falta su valor FRESCO del mismo render en
    // que se evalúa `existe` — una `ref` sincronizada por un efecto aparte
    // se queda un render por detrás justo cuando `sesiones`/`slots` cambian
    // juntos (p. ej. al recargar con `?paso=ficha` en la URL), y `existe`
    // salía `false` para una clase que sí existía. Que reaccione también a
    // cambios de filtro no es problema: si `clave` sigue igual a
    // `claveVistaRef.current`, el efecto ya corta arriba sin hacer nada.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- openBooking/closeBooking se redeclaran cada render (cierran sobre mucho estado); esto solo debe reaccionar a la URL y a los datos cargando.
  }, [mounted, searchParams, sesiones, slots]);

  // Efecto B — estado → URL. La cara complementaria: cuando la ficha o el
  // flujo cambian por una acción normal (clic en una clase, "Reservar",
  // "Volver"), refleja ese cambio en la URL/historial con el History API
  // crudo (ver el porqué al principio de este bloque).
  useEffect(() => {
    if (!mounted) return;
    const paso: VistaPaso | null = bookingSesionId !== null ? loginStep : (fichaAbiertaSlotId ? 'ficha' : null);
    const claseId = bookingSesionId !== null ? bookingSesionId : (fichaAbiertaSlotId ?? '');
    const clave = claveDeVista(paso, claseId);
    if (clave === claveVistaRef.current) return; // esto ya lo reflejaba la URL (venía de Atrás/Adelante)

    const nivelPrevio = nivelDeVista(claveVistaRef.current ? (claveVistaRef.current.split(':')[0] as VistaPaso) : null);
    const nivelNuevo = nivelDeVista(paso);
    // Se fija ANTES de tocar la URL: si esto dispara de vuelta el efecto de
    // arriba (que solo reacciona a `popstate`, no a esto), lo vería ya
    // sincronizado — aunque en la práctica ni siquiera llega a intentarlo,
    // `pushState`/`replaceState` no emiten `popstate` por sí mismos.
    claveVistaRef.current = clave;

    const params = new URLSearchParams(window.location.search);
    if (paso) {
      params.set('paso', paso);
      if (claseId) params.set('clase', claseId); else params.delete('clase');
      // ⚠️ El `tab` ACTUAL, no forzado a 'clases': el flujo también se abre
      // desde Citas (`CitasPublica.onNeedLogin`) y desde el botón "Acceder"
      // de la cabecera (visible en cualquier pestaña). Forzar 'clases' aquí
      // hacía que un refresh a mitad del flujo devolviera a la visitante a
      // la pestaña equivocada, perdiendo dónde estaba. Explícito y no
      // implícito: sin esto, restaurar `?paso=...` desde un refresh
      // dependería de que 'clases' siga siendo la pestaña por defecto.
      if (params.get('tab') !== tab) params.set('tab', tab);
    } else {
      params.delete('paso');
      params.delete('clase');
    }
    const url = `/reservar/${slug}${params.toString() ? `?${params.toString()}` : ''}`;

    if (nivelNuevo > nivelPrevio) {
      // Listado → ficha, listado → flujo directo, o ficha → flujo: UNA
      // entrada nueva — es lo que hace que Atrás vuelva un nivel en vez de
      // sacar de la página entera. Una sola entrada aunque el salto sea de
      // más de un nivel (listado → flujo directo, sin pasar por la ficha):
      // `pushState` crea UNA entrada de historial, sea cual sea el nivel que
      // represente — contar niveles en vez de entradas desincronizaría el
      // contador del historial real (ver el cierre, más abajo).
      entradasPropiasRef.current += 1;
      window.history.pushState(null, '', url);
    } else if (nivelNuevo === nivelPrevio) {
      // Paso a paso DENTRO del mismo nivel (login→registro→confirm→..., o la
      // reapertura de la ficha tras cambiar de sitio): reemplaza la entrada
      // actual, no apila una por paso — nueve pasos posibles no deben ser
      // nueve pulsaciones de Atrás para salir del flujo.
      window.history.replaceState(null, '', url);
    } else {
      // Cierre PROGRAMÁTICO (botón "Volver"/"Cerrar"/X, nunca el Atrás físico
      // — ese lo captura el efecto de arriba y nunca llega aquí porque ya
      // deja `claveVistaRef` sincronizado). SIEMPRE cierra al listado
      // (nivel 0: ningún botón de este flujo deja a medias, solo entra por
      // pasos): deshacer TODAS las entradas que empujamos nosotros con un
      // único `history.go()` deja el historial limpio (un Adelante después
      // no reabriría nada fantasma). Si no empujamos ninguna (se entró ya
      // con `?paso=...` en la URL — un enlace compartido, sin nada nuestro
      // que deshacer), limpiar la URL con `replaceState` es el camino
      // seguro: no hay overlay ni back-stack propio que deshacer.
      if (entradasPropiasRef.current > 0) {
        const saltos = entradasPropiasRef.current;
        entradasPropiasRef.current = 0;
        window.history.go(-saltos);
      } else {
        window.history.replaceState(null, '', url);
      }
    }
  }, [mounted, fichaAbiertaSlotId, bookingSesionId, loginStep, slug, tab]);

  // Fase 4 del rediseño (docs/widget-reservas-fase4-brief-diseno.md, formato
  // 01): las clases de HOY que ya empezaron/terminaron se ven en gris con
  // "FINALIZADA" — `slots` de arriba las excluye a propósito (filtra
  // `inicio > nowMs`, y de ahí beben Mes/Semana/RailFiltros: no se toca esa
  // regla). Esta es una lista aparte, solo para el día de hoy, solo para
  // pintar — sin `miReservaId`/aforo/precio, porque no se puede actuar sobre
  // ellas.
  const slotsFinalizadosHoy = useMemo(() => {
    const hoyKey = localDayKey(now);
    return sesionesRich
      .filter(s => !s.cancelada && new Date(s.fin).getTime() <= nowMs && localDayKey(new Date(s.inicio)) === hoyKey)
      .filter(s => !filtroTipo || s.tipoClaseId === filtroTipo)
      // Mismos filtros del snippet que `slots` — una FINALIZADA de un tipo
      // excluido tampoco debe verse.
      .filter(s => !configWidget?.tipos.length || configWidget.tipos.includes(s.tipoClaseId))
      .filter(s => !configWidget?.instructoras.length || configWidget.instructoras.includes(s.instructorId))
      .filter(s => !configWidget?.salas.length || configWidget.salas.includes(s.salaId))
      .filter(s => !filtroNivel || (s.tipo?.nivel ?? 'TODOS') === filtroNivel)
      .filter(s => !filtroInstructor || s.instructor?.nombre === filtroInstructor)
      .filter(s => !filtroSala || s.sala?.nombre === filtroSala)
      .sort((a, b) => a.inicio.localeCompare(b.inicio))
      .map(s => ({
        id: s.id, inicio: s.inicio, fin: s.fin,
        claseNombre: s.tipo?.nombre ?? 'Clase',
        instructorNombre: s.instructor?.nombre ?? null,
        instructorColor: s.instructor?.color ?? null,
        instructorFotoUrl: s.instructor?.fotoUrl ?? null,
      }));
  }, [sesionesRich, now, nowMs, configWidget, filtroTipo, filtroNivel, filtroInstructor, filtroSala]);

  const misReservas = useMemo(() => {
    if (!socia?.socioId) return [];
    return reservas
      .filter(r => r.socioId === socia.socioId && r.estado !== 'CANCELADA')
      .map(r => ({ ...r, sesion: sesionesRich.find(s => s.id === r.sesionId) }))
      .filter(r => r.sesion)
      .sort((a, b) => (a.sesion!.inicio ?? '').localeCompare(b.sesion!.inicio ?? ''));
  }, [reservas, socia, sesionesRich]);

  // Fase 4 del rediseño: la misma lista partida por Próximas/Pasadas — la
  // sesión ya pasó (`fin < ahora`) o ya se marcó ASISTIDA. Pasadas en orden
  // descendente (la más reciente primero); Próximas se queda como ya venía
  // (ascendente, la más próxima primero).
  const misReservasVista = useMemo(() => {
    const partida = misReservas.filter(r => {
      const pasada = new Date(r.sesion!.fin) < now || r.estado === 'ASISTIDA';
      return misReservasTab === 'pasadas' ? pasada : !pasada;
    });
    return misReservasTab === 'pasadas' ? [...partida].reverse() : partida;
  }, [misReservas, misReservasTab, now]);

  // Badge del botón "Mis reservas" de la cabecera — diseño "Tentare Portal
  // Reservas" (`{{ nReservas }}`): cuenta las PRÓXIMAS, no el total con
  // pasadas — es lo que de verdad importa antes de abrir el sheet.
  const misReservasCount = useMemo(
    () => misReservas.filter(r => new Date(r.sesion!.fin) >= now && r.estado !== 'ASISTIDA').length,
    [misReservas, now],
  );

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

  // "Pagar y reservar sin login previo" (docs/reserva-sin-login-diseno.md §2):
  // el plan PUNTUAL (una sola sesión) que cubre esta clase, si existe. Mismo
  // criterio de cobertura que el resto del repo (tiposClaseIds vacío/ausente
  // = cubre todos los tipos, ver hidratarTiposDePlanes/tieneEntitlementActivo).
  function planClaseSueltaPara(tipoClaseId: string | null | undefined, planes: PlanTarifa[]): PlanTarifa | null {
    return planesClaseSueltaPara(tipoClaseId, planes)[0] ?? null;
  }

  // "Bonos y mensualidades del estudio" (checkout sin login, diseño "Tentare
  // Portal Reservas"): TODOS los planes PUNTUAL que cubren esta clase, no solo
  // el primero — conflicto aprobado explícitamente por el fundador ("solo
  // planes PUNTUAL", no bonos multi-sesión/mensualidades: esos no se pueden
  // pagar-y-usar en el mismo movimiento sin cuenta todavía creada). Mismo
  // criterio de cobertura que la versión singular de arriba.
  function planesClaseSueltaPara(tipoClaseId: string | null | undefined, planes: PlanTarifa[]): PlanTarifa[] {
    return planes.filter(p => p.activo && p.tipo === 'PUNTUAL'
      && (!p.tiposClaseIds || p.tiposClaseIds.length === 0 || (!!tipoClaseId && p.tiposClaseIds.includes(tipoClaseId))));
  }

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
    // sesionId vacío = acceso genérico (botón "Acceder" de la cabecera), no
    // la selección de una clase concreta.
    if (sesionId) trackEventoWidget(studio?.id, 'class_selected', { sesionClaseId: sesionId });
    setBookingSesionId(sesionId);
    setTerminosAceptados(false);
    setPrivacidadAceptada(false);
    setEnlaceEnviado(false);
    setLoginError('');
    setGateError('');
    setSelectedSpot(null);
    setLoginPassword('');
    setDatosPlan(null);
    setDatosClientSecret(null);
    setDatosError('');
    setDatosInfoAdicional({ genero: '', comoConociste: '', codigoPostal: '', fechaNacimiento: '' });
    setPagoWebSinLogin(false);
    if (!autenticado) {
      // "Pagar y reservar sin login previo" (docs/reserva-sin-login-diseno.md
      // §2/§3): si esta clase exige plan y hay un plan de una sola sesión que
      // la cubre, el pago sustituye al login — nunca lo precede. Una clase sin
      // esa regla (o sin ese plan a la venta) sigue yendo por 'login' como
      // siempre: es la Ruta A únicamente, no el camino "reservar gratis sin
      // cuenta" (deferred a propósito, ver nota junto a handleDatosContinuar).
      const sesionDelGate = sesionId ? sesiones.find(s => s.id === sesionId) : undefined;
      const tipoDelGate = sesionDelGate?.tipoClaseId ? tiposClase.find(t => t.id === sesionDelGate.tipoClaseId) : undefined;
      const exigePlan = studio && tipoDelGate ? heredaOverride(tipoDelGate.reservaExigirPlan, studio.reservaExigirPlan) : false;
      const planDisponible = sesionId && exigePlan ? planClaseSueltaPara(sesionDelGate?.tipoClaseId, planesTarifa) : null;
      if (sesionId && exigePlan && planDisponible && studio?.stripeAccountId && STRIPE_PUBLISHABLE_KEY) {
        setDatosPlan(planDisponible);
        setLoginStep('datos');
      } else {
        setLoginStep('login');
      }
    } else if (socia) {
      const found = socios.find(s => s.id === socia.socioId);
      const needsContract = !found?.aceptacionContrato;
      if (needsContract) {
        setLoginStep('contrato');
      } else if (sesionId) {
        setLoginStep('confirm');
        trackEventoWidget(studio?.id, 'class_detail_viewed', { sesionClaseId: sesionId });
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
    // Fase 8 (CRO): abandono conocido — ya se disparó booking_started
    // (pasos 'confirm'/'espera'/'pendiente' en adelante) o ya iba camino de
    // reservar (registro/contrato) y se cierra sin terminar. Cerrar desde
    // 'login' no cuenta: ahí ni siquiera se ha intentado nada todavía.
    if (['confirm', 'espera', 'pendiente', 'registro', 'contrato'].includes(loginStep) && bookingSesionId) {
      trackEventoWidget(studio?.id, 'booking_abandoned', { sesionClaseId: bookingSesionId, socioId: socia?.socioId ?? null });
    }
    setBookingSesionId(null); setLoginStep('login'); setTerminosAceptados(false); setEnlaceEnviado(false);
    setLoginPassword('');
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
      // lead_completed queda para cuando de verdad entra por el enlace (fuera
      // de esta pestaña/sesión, no se puede medir aquí) — este evento solo
      // marca que se pidió, que es exactamente el hueco que no se medía antes.
      trackEventoWidget(studio?.id, 'lead_started', { sesionClaseId: bookingSesionId || null });
    } finally {
      setEnviandoEnlace(false);
    }
  }

  // Un solo formulario, no dos pantallas: email y contraseña van SIEMPRE
  // juntos (la contraseña es opcional). Un único botón decide el camino —
  // sin contraseña escrita, pide el enlace; con contraseña, entra directa.
  // Antes `mostrarPasswordLogin` alternaba entre dos vistas con un enlace
  // ("¿Ya tienes contraseña?"/"Prefiero el enlace"), lo que se leía como
  // dos pantallas de acceso en vez de una.
  async function handleContinuarAcceso() {
    if (loginPassword.trim()) {
      await handleLoginConPassword();
    } else {
      await handleEnviarEnlace();
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

  // "Pagar y reservar sin login previo" (docs/reserva-sin-login-diseno.md §4.1):
  // crea el PaymentIntent para la clase elegida — precio SIEMPRE resuelto en
  // servidor a partir de datosPlan.id (checkout-embebido/route.ts relee
  // plan.precio, nunca confía en el body). Solo Ruta A (comprar el plan
  // PUNTUAL que cubre la clase); no existe todavía un camino "reservar gratis
  // sin cuenta" para clases que no exigen plan — deferred a propósito, fuera
  // del alcance de esta pieza.
  async function handleDatosContinuar() {
    if (!bookingSesionId || !datosPlan || !studio?.id || datosCargando) return;
    // Diseño "Tentare Portal Reservas": UN solo campo "Nombre y apellido", no
    // Nombre/Apellidos por separado — `loginForm.apellidos` ya no se usa en
    // este flujo (se queda en el tipo/estado compartido, vacío, sin romper el
    // resto de pasos que sí lo declaran).
    if (!loginForm.nombre.trim() || !loginForm.email.trim() || !telefonoValido(loginForm.telefono)) return;
    // La casilla de privacidad es obligatoria (rediseño del popup): sin ella
    // no se inicia ningún pago. El botón ya va deshabilitado, esto es el
    // cinturón por si se llega por Enter.
    if (!privacidadAceptada) return;
    setDatosError('');
    setDatosCargando(true);
    try {
      const res = await fetch('/api/public/checkout-embebido', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          studioId: studio.id,
          planId: datosPlan.id,
          sesionId: bookingSesionId,
          socioEmail: loginForm.email.trim(),
          socioNombre: loginForm.nombre.trim(),
          // Antes se validaba y se TIRABA: la ficha que crea el webhook
          // quedaba sin teléfono aunque la persona lo acabara de escribir.
          socioTelefono: loginForm.telefono.trim(),
          origenLead: searchParams.get('ref') ?? null,
          codigoDescuento: codigoDescuento.trim() || undefined,
          spotId: selectedSpot || undefined,
          genero: datosInfoAdicional.genero || undefined,
          comoConociste: datosInfoAdicional.comoConociste || undefined,
          codigoPostal: datosInfoAdicional.codigoPostal.trim() || undefined,
          // El campo del diseño es texto libre "dd/mm/aaaa" (no un
          // `<input type="date">`) — se convierte a ISO aquí antes de mandarlo,
          // que es el formato que espera `fecha_nacimiento` (columna `date`).
          // Dato opcional y no bloqueante: si no cuadra el patrón, simplemente
          // no viaja, en vez de frenar una reserva ya pagada por un typo.
          fechaNacimiento: fechaNacimientoISO(datosInfoAdicional.fechaNacimiento) ?? undefined,
        }),
      });
      const data = await res.json() as { clientSecret?: string; error?: string };
      if (!data.clientSecret) { setDatosError(data.error ?? 'No se ha podido iniciar el pago.'); return; }
      setDatosClientSecret(data.clientSecret);
      trackEventoWidget(studio.id, 'checkout_started', { origen: searchParams.get('ref'), socioId: null });
      setLoginStep('pago');
    } catch {
      setDatosError('Error de conexión. Inténtalo de nuevo.');
    } finally {
      setDatosCargando(false);
    }
  }

  // Tras un pago confirmado en el propio Shadow Root/iframe (sin salir de la
  // página): la reserva y la ficha las crea el webhook de Stripe
  // (reservarPlazaTrasPagoPublico, server-side, idempotente por PaymentIntent)
  // — aquí solo se activa el acceso passwordless con el email que se acaba de
  // usar para pagar, mismo mecanismo que el resto de esta página
  // (enviarEnlace → signInWithOtp). Misma respuesta exista ya cuenta con ese
  // email o no (portal-puerta-unica-acceso): nunca se revela cuál de las dos.
  async function handlePagoExitoso() {
    trackEventoWidget(studio?.id, 'booking_completed', { sesionClaseId: bookingSesionId ?? undefined, socioId: null });
    const token = await pedirToken();
    await enviarEnlace(loginForm.email, bookingSesionId || undefined, token || undefined);
    setPagoWebSinLogin(true);
    // Auditoría 22-ago: se ponía 'confirmando' a ciegas. El efecto de polling
    // de abajo sale sin hacer nada si falta el PaymentIntent, el email o el
    // estudio, y el techo de ~35s vive DENTRO de `preguntar` — así que en ese
    // caso la pantalla se quedaba en «Estamos confirmando tu plaza» con el
    // spinner girando para siempre, con el cargo ya hecho. Sin nada a lo que
    // preguntar, el estado honesto es 'tardando': pago recibido, confirmación
    // por email.
    const puedePreguntar = !!piDeClientSecret(datosClientSecret) && !!loginForm.email.trim() && !!studio?.id;
    setConfirmacionPago(puedePreguntar ? 'confirmando' : 'tardando');
    setClaseConfirmada(null);
    setLoginStep('done');
  }

  // P1-3: polling del estado REAL tras el pago. El webhook de Stripe crea la
  // reserva DESPUÉS de que esta pantalla llegue a 'done' — hasta ahora el
  // copy honesto («estamos confirmando») era todo lo que había; esto pregunta
  // a /api/public/estado-pago con backoff creciente (~35s de techo) y solo
  // anuncia la plaza cuando el servidor dice que existe. Agotado el techo, el
  // copy de «tardando» sigue siendo honesto: pago recibido, confirmación por
  // email, y el estudio como recurso. NUNCA se inventa una confirmación.
  useEffect(() => {
    if (!pagoWebSinLogin || loginStep !== 'done') return;
    const pi = piDeClientSecret(datosClientSecret);
    const email = loginForm.email.trim();
    const studioId = studio?.id;
    if (!pi || !email || !studioId) return;

    let vivo = true;
    let timer: ReturnType<typeof setTimeout> | undefined;

    async function preguntar(intento: number) {
      let resuelto: RespuestaEstadoPago | null = null;
      try {
        const res = await fetch(
          `/api/public/estado-pago?pi=${encodeURIComponent(pi as string)}&email=${encodeURIComponent(email)}&studioId=${encodeURIComponent(studioId as string)}`,
        );
        if (res.ok) resuelto = await res.json() as RespuestaEstadoPago;
      } catch { /* red caída en un poll: se reintenta con el siguiente */ }
      if (!vivo) return;
      if (resuelto && resuelto.estado !== 'en_proceso') {
        setConfirmacionPago(resuelto.estado);
        if (resuelto.clase) setClaseConfirmada(resuelto.clase);
        return;
      }
      if (intento + 1 >= RETARDOS_POLL_MS.length) {
        setConfirmacionPago('tardando');
        return;
      }
      timer = setTimeout(() => preguntar(intento + 1), RETARDOS_POLL_MS[intento + 1]);
    }

    timer = setTimeout(() => preguntar(0), RETARDOS_POLL_MS[0]);
    return () => { vivo = false; if (timer) clearTimeout(timer); };
    // loginForm.email no cambia una vez en 'done'; el efecto arranca al entrar.
  }, [pagoWebSinLogin, loginStep, datosClientSecret, loginForm.email, studio?.id]);

  // Título de la pantalla 'done' del pago sin login, según lo que el servidor
  // haya dicho de verdad — «plaza confirmada» solo cuando LO ESTÁ.
  const tituloPagoWeb =
    confirmacionPago === 'confirmada' ? '¡Plaza confirmada!'
    : confirmacionPago === 'lista_espera' ? '¡En lista de espera!'
    : confirmacionPago === 'pendiente_aprobacion' ? 'Pendiente de aprobación'
    : '¡Pago recibido!';

  // El estado de la RESERVA, dicho con todas las letras y separado del estado
  // del pago: son dos cosas distintas y pueden no coincidir (pago recibido +
  // plaza en lista de espera es el caso que más confunde). Nunca «confirmada»
  // sin que el servidor lo haya confirmado.
  const etiquetaEstadoReserva =
    confirmacionPago === 'confirmada' ? 'Confirmada'
    : confirmacionPago === 'lista_espera' ? 'En lista de espera'
    : confirmacionPago === 'pendiente_aprobacion' ? 'Pendiente de aprobación'
    : confirmacionPago === 'fallida' ? 'Sin plaza — el estudio te contactará'
    : confirmacionPago === 'tardando' ? 'Confirmando'
    : 'Confirmando…';

  // La referencia del pago: el id del PaymentIntent, que es lo que el estudio
  // puede buscar en Stripe. Se enseña acortado —el id completo es largo e
  // ilegible— pero es el mismo que consta en el recibo.
  const referenciaPago = piDeClientSecret(datosClientSecret ?? '');

  async function handleSignContract() {
    // Mismo cerrojo doble que `handleConfirm` (ver comentario en la
    // declaración de `firmando`/`firmandoRef`): sin él, dos pulsaciones
    // rápidas de "Aceptar y continuar" daban de alta dos fichas de socia.
    if (firmando || firmandoRef.current) return;
    firmandoRef.current = true;
    setFirmando(true);
    try {
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
      if (bookingSesionId) {
        setLoginStep('confirm');
        trackEventoWidget(studio?.id, 'class_detail_viewed', { sesionClaseId: bookingSesionId });
      } else {
        closeBooking();
      }
    } finally {
      firmandoRef.current = false;
      setFirmando(false);
    }
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

    trackEventoWidget(studio?.id, 'booking_started', { sesionClaseId: bookingSesionId, socioId: socia?.socioId ?? null });
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
      trackEventoWidget(studio?.id, 'booking_completed', { sesionClaseId: bookingSesionId, socioId: socia?.socioId ?? null });
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
    trackEventoWidget(studio?.id, 'booking_started', { sesionClaseId: slot.id, socioId: socia?.socioId ?? null });
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
    // Camino rápido (ya autenticada, con ficha y gate OK): no pasa por
    // handleConfirm, así que booking_completed se dispara aquí — sin alterar
    // lo que se devuelve a quien llama (la hoja del calendario lo necesita
    // para pintar confirmación/lista de espera in situ).
    const resultado = addReserva(slot.id, socia.socioId, spotId);
    void resultado.then(r => {
      if (r.ok) trackEventoWidget(studio?.id, 'booking_completed', { sesionClaseId: slot.id, socioId: socia?.socioId ?? null });
    }).catch(() => {});
    return resultado;
  }

  async function handleContratarPlan(plan: PlanTarifa) {
    setStripeError(null);
    setStripeLoading(plan.id);
    try {
      // Con `socioId` el servidor exige el JWT del portal (auditoría 21-ago,
      // C-1): si `socia` está resuelta es porque /api/public/studio-data ya
      // validó su token, así que la sesión existe. Sin esta cabecera, toda
      // socia logueada comprando un plan desde este widget recibía 401.
      const authHeader = await portalAuthHeader();
      const res = await fetch('/api/stripe/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeader },
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
          codigoDescuento: codigoDescuento.trim() || undefined,
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
        // Antes de navegar fuera: booking_completed se mide en Stripe (importe
        // real), esto solo marca que la visitante LLEGÓ a intentar pagar.
        trackEventoWidget(studio?.id, 'checkout_started', { origen: searchParams.get('ref'), socioId: socia?.socioId ?? null });
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

  // "datos"/"pago" se pintan con <PantallaReserva> (Fase 2 del rediseño,
  // docs/rediseno-pantalla-reserva-diseno.md), que lleva su PROPIO "‹ Volver"
  // — el resto de pasos usan el genérico de más abajo. Con el rediseño
  // "sin popup" (docs/rediseno-widget-sin-popup-diseno.md) ambos grupos son
  // igual de "vista inline", ya no hay una diferencia visual de "pantalla
  // completa vs. hoja pequeña"; lo único que sigue distinguiendo es quién
  // pinta el botón de volver.
  const esPantallaReserva = loginStep === 'datos' || loginStep === 'pago';

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
  // ⚠️ NO quitar: es el aviso honesto de cancelación/antelación por TIPO DE
  // CLASE, no del estudio a secas — sin esto, un estudio con el Reformer a
  // 24h pero el estudio a 12h prometía 12 y alguien cancelaba tarde creyendo
  // que llegaba (e2e/reservar-ventana-por-tipo.spec.ts lo vigila).
  const reglasEstudio = {
    cancelacionVentanaHoras: studio?.cancelacionVentanaHoras ?? 0,
    reservaVentanaMinimaMinutos: studio?.reservaVentanaMinimaMinutos ?? 0,
    reservaAntelacionMaximaDias: studio?.reservaAntelacionMaximaDias ?? null,
  };
  const plazoCancelacion = frasePlazoCancelacion(reglasEstudio, tiposClase);
  const antelacionMinima = fraseAntelacionMinima(reglasEstudio, tiposClase);
  const antelacionMaxima = fraseAntelacionMaxima(reglasEstudio, tiposClase);

  const tabsTodas = [['clases', 'Clases'], ['citas', 'Citas'], ['misreservas', 'Mis reservas'], ['estudio', 'El estudio'], ['cuenta', 'Mi cuenta']] as const;
  const tabs = tabsTodas.filter(([t]) => tabHabilitada(t));
  // Diseño "Tentare Portal Reservas": sin barra de pestañas en la pantalla
  // de Clases — vacía del todo, no una sola píldora "Clases" (a diferencia
  // de `embedMode`/`soloPestana`, que sí dejan la píldora del único
  // propósito visible). Un intento anterior de esto rompió la navegación
  // real a "El estudio"/"Mi cuenta"/"Citas" — esta vez esas tres secciones
  // tienen una salida real: `MenuSecciones` en la cabecera. Fuera de Clases
  // la barra se sigue pintando completa.
  const tabsVisibles = tab === 'clases' && !embedMode && !apariencia.soloPestana
    ? []
    : (embedMode || apariencia.soloPestana) ? tabs.filter(([t]) => t === tab) : tabs;

  // ── Orden y visibilidad de las secciones ───────────────────────────────────
  // Lo decide el estudio desde el editor de Apariencia (Theme Builder
  // unificado, components/theme/portal-bloques-editor.tsx con
  // pantalla="reservar" — Fase 2 de la generalización de /reservar al motor
  // de bloques, mismo constructor que ya usan Inicio, Clases y Bonos):
  // `bloquesReservar` llega YA resuelto y publicado (fetchPublicStudioData,
  // igual que homeBloques/bloquesClases/bloquesBonos) — esta página no
  // vuelve a decidir nada, así que el rail no puede prometer un orden que
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
  const posicionSeccion = new Map(
    bloquesReservar.map((b, i) => [b.kind === 'sistema' ? seccionReservarDeSistemaId(b.sistemaId) : b.id, i]),
  );
  const orden = (id: string) => posicionSeccion.get(id) ?? 0;
  const seccionesVisibles = new Set(
    bloquesReservar.filter((b) => !b.oculto).map((b) => (b.kind === 'sistema' ? seccionReservarDeSistemaId(b.sistemaId) : '')),
  );
  const seccionVisible = (id: string) => seccionesVisibles.has(id);
  // Los bloques del CATÁLOGO (banner/texto/cta/faq/galería/vídeo/testimonios/
  // contenedor) que el estudio haya añadido — las 6 secciones de siempre son
  // `sistema` y ya se pintan por su cuenta, JSX fijo, más abajo; estos son
  // contenido nuevo, del mismo tipo que ya se puede añadir en Inicio/Clases/
  // Bonos. Se intercalan con la MISMA técnica de `order` que las de siempre.
  const bloquesCatalogo = bloquesReservar.filter(
    (b): b is Exclude<typeof b, { kind: 'sistema' }> => b.kind !== 'sistema' && !b.oculto,
  );

  // Los datos del estudio no cargaron. `dataLoaded` se pone a true también en
  // el `catch` de `cargarPublico` (studio-context), así que "terminé de
  // intentarlo y sigo sin estudio" es exactamente esta condición.
  //
  // Antes esto no se comprobaba y la página seguía adelante: se pintaba entera
  // con los valores por defecto —el nombre y el teléfono de Tentare— y sin un
  // solo aviso. Una clienta veía la página de reservas de su estudio con la
  // marca de otra empresa y un horario vacío, y lo único que podía concluir es
  // que su estudio ya no tiene clases.
  //
  // Se dice lo que pasa y se ofrece la salida. `location.reload()` y no un
  // reintento fino a propósito: el fallo puede haber dejado a medias cualquiera
  // de las cargas de esta pantalla, y volver a empezar es lo único que se puede
  // prometer de verdad.
  if (dataLoaded && !studio) {
    return (
      <>
        {/* ⚠️ Los MISMOS tres canales de color que el render normal, y por el
            mismo motivo (ver el bloque largo más abajo). Una pantalla de error
            que se los salte es una losa casi blanca sobre la web oscura de un
            estudio — justo el fallo que ya costó tres arreglos seguidos aquí:
              1. el `<style>` de html/body, porque el `<body>` del iframe pinta
                 su fondo opaco POR DEBAJO aunque este div sea transparente;
              2. `fondoCss(apariencia)`, para que «transparente» lo sea;
              3. los tokens por PROP (`tokensCalendario`) y no
                 `var(--portal-ink)`, porque el color del texto de esta página
                 no viaja por variables CSS. */}
        {embedMode && (
          <style>{`html,body{background:${fondoCss(apariencia) ?? 'var(--portal-bg)'} !important;}`}</style>
        )}
        <div style={{
          minHeight: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: 24, background: fondoCss(apariencia) ?? 'var(--portal-bg)',
          fontFamily: fuenteWidget ?? sans,
        }}>
          <div style={{ maxWidth: 380, textAlign: 'center' }}>
            {/* Serif y tamaño fijo, no `heading()`: ese usa `cq()`, que necesita
                un ancestro con `container-type`, y esta pantalla es autónoma. */}
            <h1 style={{ fontFamily: serif, fontSize: 26, lineHeight: 1.1, color: tokensCalendario.ink, marginBottom: 10 }}>
              No hemos podido cargar el horario
            </h1>
            <p style={{ fontSize: 14, lineHeight: 1.5, color: tokensCalendario.muted, marginBottom: 22 }}>
              Ha sido un problema nuestro, no del enlace. Vuelve a intentarlo en un momento.
            </p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              style={{
                height: 48, padding: '0 26px', borderRadius: R.pillBtnSm, border: 'none',
                background: 'var(--portal-brand)', color: 'var(--portal-brand-foreground)',
                fontSize: 14, fontWeight: 700, cursor: 'pointer',
              }}
            >
              Reintentar
            </button>
          </div>
        </div>
      </>
    );
  }

  // Contenido de "Mis reservas" — mismo bloque real (Próximas/Pasadas, login
  // gate, estado vacío, lista con cancelar inline), extraído a una constante
  // para poder pintarlo en DOS sitios sin duplicar ~150 líneas: la pestaña de
  // página completa (`embedMode`/`soloPestana`: un widget de un solo
  // propósito puede pedir `?tab=misreservas`) y el sheet nuevo de la
  // cabecera (diseño "Tentare Portal Reservas": aquí es un `PublicSheet` que
  // se desliza sobre el listado, no una página).
  const misReservasBody = (
    <>
      <h2 style={{ fontFamily: serif, fontSize: cq(28, 6.5, 34), lineHeight: 1 }}>Mis reservas</h2>

      {socia && (
        <div style={{ display: 'flex', gap: 4, marginTop: 20, padding: 3, borderRadius: R.pill, background: 'var(--portal-velo)', border: '1px solid var(--portal-line)', width: 'fit-content' }} role="group" aria-label="Próximas o pasadas">
          {([['proximas', 'Próximas'], ['pasadas', 'Pasadas']] as const).map(([id, label]) => (
            <button key={id} type="button" onClick={() => setMisReservasTab(id)} aria-pressed={misReservasTab === id}
              style={{
                padding: '8px 18px', borderRadius: R.pill, border: 'none', cursor: 'pointer',
                fontFamily: sans, fontSize: 13, fontWeight: 600,
                background: misReservasTab === id ? 'var(--portal-ink)' : 'transparent',
                color: misReservasTab === id ? 'var(--portal-bg)' : 'var(--portal-muted)',
              }}>
              {label}
            </button>
          ))}
        </div>
      )}

      <div style={{ marginTop: 18 }}>
        {!socia ? (
          <div style={{ borderRadius: R.card, background: 'var(--portal-surface)', display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '56px 24px', gap: 16, textAlign: 'center', boxShadow: SH.card }}>
            <div style={{ width: 56, height: 56, borderRadius: 999, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--portal-surface-2)' }}>
              <Users size={24} style={{ color: PRIMARY }} />
            </div>
            <div>
              <h3 style={{ fontFamily: serif, fontSize: 21, color: 'var(--portal-ink)' }}>Identifícate para ver tus reservas</h3>
              <p style={{ fontSize: 12.5, color: 'var(--portal-muted-2)', marginTop: 6 }}>Te enviamos un enlace de acceso a tu email. Sin contraseñas.</p>
            </div>
            <button onClick={() => openBooking('')}
              style={{ height: 48, padding: '0 26px', borderRadius: R.pillBtnSm, background: PRIMARY, color: PRIMARY_FG, border: 'none', fontSize: 13, fontWeight: 500, cursor: 'pointer' }}>
              Acceder
            </button>
          </div>
        ) : misReservasVista.length === 0 ? (
          <div style={{ borderRadius: R.card, background: 'var(--portal-surface)', border: '1px solid var(--portal-line)', display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '52px 24px 56px', gap: 4, textAlign: 'center' }}>
            <div style={{ width: 52, height: 52, borderRadius: 999, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--portal-velo)', color: 'var(--portal-muted)' }}>
              <Calendar size={22} />
            </div>
            <p style={{ fontFamily: serif, fontSize: 21, marginTop: 14, color: 'var(--portal-ink)' }}>
              {misReservasTab === 'proximas' ? 'No tienes reservas próximas' : 'Aún no tienes reservas pasadas'}
            </p>
            {/* Fuera de `embedMode` esto es la página completa (barra de
                pestañas visible) y saltar a «Clases» tiene sentido. En
                el widget embebido «Mis reservas» no existe una pestaña
                «Clases» a la que saltar — es un widget de un solo
                propósito, no el portal entero. */}
            {misReservasTab === 'proximas' && !embedMode && (
              <button onClick={() => { setMisReservasAbierta(false); setTab('clases'); }} style={{
                marginTop: 16, height: 42, padding: '0 20px', borderRadius: 999, border: 'none', cursor: 'pointer',
                background: PRIMARY, color: PRIMARY_FG, fontFamily: sans, fontWeight: 700, fontSize: 13,
              }}>
                Ver horario y reservar
              </button>
            )}
          </div>
        ) : (
          <div style={{ borderRadius: R.card, background: 'var(--portal-surface)', border: '1px solid var(--portal-line)', overflow: 'hidden' }}>
            {misReservasVista.map((r, i) => {
              const s = r.sesion!;
              const isPast = new Date(s.fin) < now;
              const isFuture = !isPast && r.estado !== 'ASISTIDA';
              const fechaLarga = new Date(s.inicio).toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' });
              const badge = r.estado === 'ASISTIDA'
                ? { texto: 'Asistida', bg: 'var(--portal-surface-2)', color: 'var(--portal-muted)' }
                : r.estado === 'LISTA_ESPERA'
                ? { texto: r.posicionEspera ? `Lista de espera · ${r.posicionEspera}ª` : 'Lista de espera', bg: 'color-mix(in oklab, var(--portal-accent) 10%, var(--portal-surface))', color: 'var(--portal-accent)' }
                : isPast
                ? { texto: 'Cancelada', bg: 'var(--portal-surface-2)', color: 'var(--portal-muted)' }
                : { texto: 'Confirmada', bg: 'color-mix(in oklab, var(--success) 14%, var(--portal-surface))', color: 'var(--success)' };
              const abriendoCancel = cancelConfirm?.reservaId === r.id;
              return (
                <div key={r.id} style={{ borderTop: i === 0 ? 'none' : '1px solid var(--portal-line)', opacity: isPast ? 0.8 : 1 }}>
                  <div style={{ padding: '16px 20px', display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
                    <div style={{ flex: '1 1 200px', minWidth: 0 }}>
                      <div style={{ fontFamily: serif, fontSize: 18.5, lineHeight: 1.15, color: 'var(--portal-ink)' }}>{s.tipo?.nombre}</div>
                      <div style={{ fontSize: 12.5, color: 'var(--portal-muted)', marginTop: 4, textTransform: 'capitalize' }}>
                        {fechaLarga} · {fmtTime(s.inicio)}
                      </div>
                      {s.instructor && <div style={{ fontSize: 12.5, color: 'var(--portal-muted)', marginTop: 2 }}>{s.instructor.nombre}</div>}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginLeft: 'auto', flexWrap: 'wrap' }}>
                      <span style={{ fontSize: 11.5, fontWeight: 700, padding: '6px 11px', borderRadius: R.pill, whiteSpace: 'nowrap', background: badge.bg, color: badge.color }}>
                        {badge.texto}
                      </span>
                      {isFuture && !abriendoCancel && (
                        <button onClick={() => {
                          const ventana = s.tipo?.ventanaCancelacionHoras ?? studio?.cancelacionVentanaHoras ?? 0;
                          const tardia = r.estado === 'CONFIRMADA' && esCancelacionTardia(s.inicio, now, ventana);
                          const pierdeBono = tardia && !(studio?.cancelacionDevolverBonoTardia ?? false);
                          setErrorCancelar(null);
                          setCancelConfirm({ reservaId: r.id, pierdeBono, ventana });
                        }}
                          style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--portal-muted)', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline', textUnderlineOffset: 3, whiteSpace: 'nowrap' }}>
                          {r.estado === 'LISTA_ESPERA' ? 'Salir de la lista' : 'Cancelar reserva'}
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Confirmación inline (no modal) — Fase 4 del rediseño. */}
                  {abriendoCancel && (
                    <div style={{ margin: '0 20px 16px', padding: '12px 14px', borderRadius: R.spot, background: errorCancelar ? 'color-mix(in oklab, var(--destructive) 8%, var(--portal-surface))' : 'var(--portal-velo)', border: `1px solid ${errorCancelar ? 'color-mix(in oklab, var(--destructive) 25%, transparent)' : 'var(--portal-line)'}` }}>
                      {errorCancelar ? (
                        <p style={{ fontSize: 12.5, color: 'var(--portal-ink)', display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                          <span aria-hidden style={{ color: 'var(--destructive)', fontWeight: 800 }}>!</span>
                          {errorCancelar}
                        </p>
                      ) : (
                        <p style={{ fontSize: 12.5, color: 'var(--portal-ink)' }}>
                          {r.estado === 'LISTA_ESPERA'
                            ? '¿Quieres salir de la lista de espera de esta clase?'
                            : cancelConfirm?.pierdeBono
                            ? `¿Quieres cancelar esta reserva? Con menos de ${cancelConfirm.ventana}h de antelación no se te devolverá la sesión del bono.`
                            : `¿Quieres cancelar esta reserva? Es gratis hasta ${cancelConfirm?.ventana ?? 0}h antes.`}
                        </p>
                      )}
                      <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                        <button onClick={() => {
                          if (cancelandoPlaza) return;
                          setCancelandoPlaza(true);
                          void cancelarReserva(r.id).then(res => {
                            setCancelandoPlaza(false);
                            if (res.ok) { setCancelConfirm(null); setErrorCancelar(null); return; }
                            setErrorCancelar(res.error);
                          });
                        }} disabled={cancelandoPlaza}
                          style={{ height: 38, padding: '0 16px', borderRadius: R.pillBtnXs, border: 'none', background: 'var(--destructive)', color: '#fff', fontFamily: sans, fontWeight: 700, fontSize: 12.5, cursor: cancelandoPlaza ? 'default' : 'pointer', opacity: cancelandoPlaza ? 0.6 : 1 }}>
                          {cancelandoPlaza ? 'Cancelando…' : r.estado === 'LISTA_ESPERA' ? 'Sí, salir' : 'Sí, cancelar'}
                        </button>
                        <button onClick={() => { setCancelConfirm(null); setErrorCancelar(null); }} disabled={cancelandoPlaza}
                          style={{ height: 38, padding: '0 16px', borderRadius: R.pillBtnXs, border: '1px solid var(--portal-line)', background: 'transparent', color: 'var(--portal-ink)', fontFamily: sans, fontWeight: 700, fontSize: 12.5, cursor: 'pointer' }}>
                          No, mantener
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </>
  );

  return (
    <>
    {/* ⚠️ **Sin esto, «transparente» NO es transparente.** El `background` del
        div de abajo se queda en transparente, sí — y debajo el `<body>` del
        iframe sigue pintando su `bg-background` opaco (`#F6F7F9` medido en
        producción). O sea, exactamente la losa casi blanca sobre la web oscura
        que este ajuste existe para quitar: el div deja pasar la luz y el body
        la corta un nivel más abajo.
        `!important` porque `bg-background` es un selector de clase y gana a
        `html,body` por especificidad.

        Va aquí y no en el layout porque un layout de Next NO recibe
        `searchParams`: el servidor no puede saber qué pidió el iframe.

        El valor es seguro aunque venga de la URL de una página pública:
        `fondoCss` solo devuelve `transparent`, `null`, o un color que ya pasó
        el `COLOR_VALIDO` de `resolverApariencia` — nunca la cadena cruda. */}
    {embedMode && (
      <style>{`html,body{background:${fondoCss(apariencia) ?? 'var(--portal-bg)'} !important;}`}</style>
    )}
    <div ref={rootRef} style={{
      // `dvh` y no `vh`: con la barra de Safari visible, `100vh` sobra y deja un
      // scroll fantasma — y como esta es justo la altura que se le anuncia al
      // anfitrión por `tentareEmbedAltura`, ese sobrante se convertía en un
      // hueco real dentro de la web del estudio. La pantalla de error de esta
      // misma página ya usaba `dvh`; eran dos unidades distintas para lo mismo.
      ...containerRoot, width: '100%', minHeight: '100dvh',
      // `transparent` deja ver el fondo de la web anfitriona. Era el problema
      // gordo: un `#F6F7F9` opaco es una losa casi blanca sobre una web oscura.
      background: fondoCss(apariencia) ?? 'var(--portal-bg)',
      color: 'var(--portal-ink)',
      fontFamily: fuenteWidget ?? sans,
      // ⚠️ `fontFamily` a secas SOLO alcanza al texto que hereda, y en esta
      // pantalla casi nada hereda: el calendario, los botones, el checkout y
      // los modales declaran su propia familia leyendo `var(--font-ui)` /
      // `var(--font-display)`. Dentro del iframe esas variables EXISTEN —las
      // define el layout de Next— así que resolvían a Instrument Sans y la
      // fuente elegida no llegaba a ninguno de ellos: se aplicaba al hueco
      // entre componentes y a poco más. Modo B ya las fijaba (main.tsx), o sea
      // que los dos modos pintaban distinto con el mismo snippet.
      ...(fuenteWidget ? { '--font-ui': fuenteWidget } : {}),
      ...(fuenteDisplayWidget ? { '--font-display': fuenteDisplayWidget } : {}),
      // Solo se pisa la variable cuando hay fuente de titulares que aplicar —
      // emitirla siempre rompería el fallback a `--font-display` (la pila
      // `serif` de siempre) para quien no tocó nada.
      ...(fuenteDisplayWidget ? { '--portal-heading-font': fuenteDisplayWidget } : {}),
      overflow: 'hidden', display: 'flex', flexDirection: 'column',
      // Custom properties en línea: cascadean a todo el subárbol, así que con
      // esto el widget entero pasa a letra clara sin tocar un solo componente.
      ...(varsTexto ?? {}),
      // `?marca=` (snippet): pisa el primario en el mismo canal — solo existe
      // con embed=1 (configWidget es null fuera), la página suelta no cambia.
      ...(varsMarca ?? {}),
    } as React.CSSProperties}>
      {/* React 19 sube un `<link rel="stylesheet">` al `<head>` desde donde se
          declare, así que la fuente se pide sin tocar el layout ni meter un
          efecto. El nombre ya viene filtrado a letras, números y espacios —
          ver `urlFuente`, que lo vuelve a comprobar antes de construir la URL. */}
      {cssFuente && <link rel="stylesheet" href={cssFuente} />}
      {/* La de titulares, si es OTRA familia — con la misma no hay nada más
          que cargar (React 19 dedupe por href igual, pero no hace falta ni
          llegar ahí). */}
      {cssFuenteDisplay && cssFuenteDisplay !== cssFuente && <link rel="stylesheet" href={cssFuenteDisplay} />}

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
            {/* Diseño "Tentare Portal Reservas": sin barra de pestañas — la
                cabecera solo lleva "Mis reservas"/"Acceder". "Citas"/"El
                estudio"/"Mi cuenta" no tienen sitio en el diseño (no existen
                en el .dc.html), así que quedan aquí, en un menú que el
                diseño no especifica — decisión de producto explícita del
                fundador tras plantear el conflicto, no una invención propia. */}
            {!enVistaReserva && tabs.filter(([t]) => t !== 'clases' && t !== 'misreservas').length > 0 && (
              <MenuSecciones tabs={tabs} tabActual={tab} onIr={setTab} />
            )}
            {!enVistaReserva && (
            <button
              type="button"
              onClick={() => setMisReservasAbierta(true)}
              style={{
                height: 46, padding: `0 ${cq(16, 1.8, 22)}`, borderRadius: 23, background: 'var(--portal-surface)',
                border: '1px solid var(--portal-line)', color: 'var(--portal-ink)', fontSize: 12, fontWeight: 800,
                cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6, position: 'relative',
              }}
            >
              Mis reservas
              {misReservasCount > 0 && (
                <span aria-hidden="true" style={{
                  minWidth: 17, height: 17, borderRadius: 99, background: 'var(--portal-brand)', color: 'var(--portal-brand-foreground)',
                  fontSize: 9.5, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 3px',
                }}>
                  {misReservasCount}
                </span>
              )}
            </button>
            )}
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
                onClick={() => openBooking('')}
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

        {/* ── CABECERA COMPACTA (embebido) ─────────────────────────────────
            Fase 4 del rediseño (docs/widget-reservas-fase4-brief-diseno.md):
            en iframe (`embedMode`) la barra de arriba se OCULTA entera (la
            web anfitriona ya tiene la suya) y no queda ningún rastro de qué
            estudio es este — el handoff sí pinta una identidad mínima:
            avatar+nombre+ciudad a la izquierda, "reserva sin registro" (o el
            email si ya hay sesión) a la derecha. */}
        {embedMode && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', padding: `${cq(18, 2, 24)} ${cq(20, 3.8, 48)} 0` }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 11, minWidth: 0 }}>
              {estudioLogo ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={estudioLogo} alt={estudioNombre} style={{ width: 36, height: 36, borderRadius: 999, objectFit: 'cover', flexShrink: 0 }} />
              ) : (
                <div style={{ width: 36, height: 36, borderRadius: 999, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontFamily: serif, fontSize: 17, background: 'var(--portal-brand)', color: 'var(--portal-brand-foreground)' }}>
                  {estudioNombre[0]}
                </div>
              )}
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 13.5, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{estudioNombre}</div>
                {studio?.ciudad && (
                  <div style={{ fontSize: 11.5, color: 'var(--portal-muted)', marginTop: 1 }}>
                    {/* `estudioDireccion` ya es "ciudad · dirección" — usarlo
                        aquí habría repetido la ciudad dos veces. */}
                    {studio.ciudad}{studio.direccion ? ` · ${studio.direccion}` : ''}
                  </div>
                )}
              </div>
            </div>
            {/* El prototipo no lleva esta píldora en la cabecera de "El estudio". */}
            {tab !== 'estudio' && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 11.5, color: 'var(--portal-muted)', whiteSpace: 'nowrap' }}>
                <span style={{ width: 6, height: 6, borderRadius: 999, background: 'var(--success)' }} />
                {socia ? socia.email : 'Reserva sin registro'}
              </div>
            )}
          </div>
        )}

        {/* ── PORTADA ───────────────────────────────────────────────────────
            Se OCULTA (lo que pide quien incrusta esto bajo la cabecera que ya
            tiene su web), pero no se mueve — ver la nota del degradado arriba. */}
        {!embedMode && seccionVisible('portada') && (
        <div
          className="reserva-hero-portada"
          style={{
            position: 'relative',
            padding: `${cq(28, 4, 56)} ${cq(20, 3.8, 48)} ${cq(24, 3, 44)}`,
            display: 'grid',
            // Dos columnas siempre: `heroFoto` ya nunca viene vacío. La rama de
            // una sola columna existía porque reservar la mitad del hero para un
            // hueco gris era peor que el diseño de hoy — con foto por defecto
            // ese hueco no llega a existir.
            gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 320px), 1fr))',
            gap: cq(24, 3.4, 44),
            alignItems: 'center',
          }}
        >
          <div style={{ textAlign: 'left', minWidth: 0 }}>
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
              <p style={{ fontSize: cq(14, 1.4, 17), lineHeight: 1.5, color: 'var(--portal-muted)', marginTop: 14, maxWidth: 460 }}>
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

          {
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={heroFoto}
              alt=""
              onError={alFallarImagen(IMAGENES_POR_DEFECTO.portada[0])}
              className="reserva-hero-foto"
              style={{
                width: '100%', aspectRatio: '4 / 3', objectFit: 'cover',
                borderRadius: R.card, display: 'block',
              }}
            />
          }
        </div>
        )}

        {/* ── TABS ───────────────────────────────────────────────────────────
            ⚠️ El `div#horario` se pinta SIEMPRE, con pestañas o sin ellas: es el
            ancla a la que salta el botón de la portada y el que usan los tests.
            Lo que desaparece con `soloPestana` son los botones de dentro.
            ⚠️ Con `tabsVisibles` vacío (Clases, página suelta) no queda NINGÚN
            hijo dentro — sin `minHeight` el div mide 0×0 y Playwright lo trata
            como oculto (`toBeVisible`/`waitFor` fallan), rompiendo el ancla de
            arriba. `minHeight: 1` lo mantiene con tamaño real sin pintar nada. */}
        <div id="horario" className={`reserva-tabs-scroll ${embedMode ? '' : 'reserva-tabs'}`} style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: cq(18, 3.4, 42), borderBottom: tabsVisibles.length > 0 ? '1px solid rgba(34,38,31,.12)' : 'none', marginTop: embedMode ? cq(16, 1.6, 20) : (tabsVisibles.length > 0 ? cq(28, 3.6, 46) : 0), overflowX: 'auto', padding: tabsVisibles.length > 0 ? `0 ${cq(20, 3.8, 48)}` : 0, minHeight: tabsVisibles.length === 0 ? 1 : undefined }}>
          {/* Un widget embebido es 1 propósito, no un portal en miniatura:
              en `embedMode` se enseña SIEMPRE únicamente la pestaña que pidió
              `?tab=`, sin barra — quien incrusta «Horario y reserva de
              clases» no espera que su visitante se vaya a «El estudio»
              dentro de un recuadro de su propia web. `solo-pestana=1` en la
              URL sigue aceptándose (snippets ya pegados no cambian) pero ya
              no hace falta: fuera de `embedMode` (la página completa
              /reservar/[slug]) la barra se ve entera como siempre. */}
          {/* Rediseño "sin popup": con la vista de reserva activa, ni rastro
              de las demás pestañas — "sensación de app de reservas", no de
              página con pestañas debajo. El `div#horario` en sí NO se oculta
              (comentario de arriba: es el ancla de scroll/tests), solo sus
              botones. */}
          {/* Diseño "Tentare Portal Reservas": la pantalla de Clases es la
              pantalla de reservas, sin cabecera de navegación por encima —
              "Mis reservas"/"El estudio"/"Mi cuenta" quedan accesibles desde
              el propio header (botones "Mis reservas"/"Acceder"), no de una
              barra de pestañas aquí. Se ocultan igual que en `embedMode`:
              mismo mecanismo (`tabsVisibles`), sin duplicar lógica. */}
          {!enVistaReserva && tabsVisibles.map(([t, label]) => (
            <button key={t} onClick={() => setTab(t)}
              style={{
                flex: '0 0 auto', padding: '0 2px 16px', marginBottom: -1, background: 'none', border: 'none', cursor: 'pointer',
                // La barra scrollea en horizontal: mismo motivo que arriba.
                WebkitUserSelect: 'none', userSelect: 'none', touchAction: 'manipulation',
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

      {/* Vuelta de un 3DS que exigió salir de la página (Modo B, poco común
          pero antes nadie la leía aquí — ver el comentario de `avisoPagoRetorno`
          más arriba). Mismo lugar/orden que el aviso de arriba, deliberadamente
          neutro: no hay estado de React que resumir tras la navegación. */}
      {avisoPagoRetorno && (
        <div style={{ order: orden('horario'), padding: `12px ${cq(20, 3.8, 48)} 0`, maxWidth: 1280, marginInline: 'auto' }}>
          <div
            className="text-muted-foreground bg-muted/50 border-[var(--portal-line)]"
            style={{ border: '1px solid', borderRadius: 14, padding: '10px 16px', fontSize: 13, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}
          >
            <span>Si has confirmado el pago con tu banco, en unos segundos verás tu reserva por email.</span>
            <button onClick={() => setAvisoPagoRetorno(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'inherit', fontSize: 16, lineHeight: 1 }} aria-label="Cerrar aviso">×</button>
          </div>
        </div>
      )}

      {/* ── CONTENT ───────────────────────────────────────────────────────────
          El tercero de los hermanos de «Horario y reservas» — ver el comentario
          del aviso de pago. */}
      <div style={{ order: orden('horario'), padding: `0 ${cq(20, 3.8, 48)}`, maxWidth: 1280, marginInline: 'auto', width: '100%' }}>

        {/* ── TAB: CLASES ─────────────────────────────────────────────────── */}
        {tab === 'clases' && fichaSesionId && (() => {
          const s = sesionesRich.find(x => x.id === fichaSesionId);
          if (!s) return null;
          const yaPasoOCancelada = s.cancelada || new Date(s.fin) < now;
          const plan = planClaseSueltaPara(s.tipoClaseId, planesTarifa);
          return (
            <FichaClaseUnica
              claseNombre={s.tipo?.nombre ?? 'Clase'}
              inicio={s.inicio}
              fin={s.fin}
              duracionMinutos={s.tipo?.duracionMinutos ?? null}
              instructorNombre={s.instructor?.nombre ?? null}
              plazasLibres={yaPasoOCancelada ? null : Math.max(0, s.aforoMaximo - s.ocupadas)}
              precio={plan?.precio ?? null}
              yaReservada={!!miReservaPorSesion.get(s.id)}
              onReservar={() => { setFichaSesionId(null); openBooking(s.id); }}
              onVerMisReservas={embedMode ? undefined : () => { setFichaSesionId(null); setTab('misreservas'); }}
              onVerHorario={() => setFichaSesionId(null)}
            />
          );
        })()}

        {tab === 'clases' && !fichaSesionId && (
          // Petición explícita del fundador: la columna de clases usaba
          // `max-width: 760px` desde #1240 (columna de lectura centrada,
          // como Momence) — en desktop dejaba un pasillo enorme de fondo
          // vacío a los lados. Ahora ocupa el mismo ancho que la cabecera/
          // portada (el contenedor de 1280px de siempre), sin tocar nada del
          // propio ReservaCalendario.
          <div style={{ width: '100%', padding: `${cq(28, 3.4, 44)} 0 ${cq(50, 7, 90)}` }}>

            {/* Calendario de reservas — componente compartido (estilo Acuity), el
                mismo que usa el portal de socias, re-vestido con el lenguaje
                visual de esta pantalla (ver reserva-calendario.tsx). La reserva
                se enruta por handleReservarCalendario, que respeta el
                step-machine de acceso.
                ⚠️ Único caller de Modo A que activa `estiloDias='dias'` (tira de
                10 días con scroll) — el portal privado sigue en 'semana'.
                `estiloFicha="vista"`: rediseño "sin popup" (Modo A únicamente —
                Modo B, `app/widget-bundle/main.tsx`, no pasa esta prop y sigue
                con su hoja modal de siempre).
                ⚠️ `bookingSesionId === null`, no `!enVistaReserva`: mientras se
                ve LA FICHA (antes del login/pago), `bookingSesionId` sigue
                siendo `null` y este componente debe seguir montado — es quien
                pinta la ficha (`soloFicha` interno, activado por su propio
                `openSlot`). Lo que hay que evitar es que se quede montado
                DESPUÉS, en el flujo de login/datos/pago: ahí su ficha ya se
                cerró sola (`cerrarHoja()`, mismo tick que `openBooking()`) y
                sin este guardia volvía a pintar su calendario de siempre por
                debajo del flujo — encontrado con la propia captura de
                verificación de esta fase. */}
            {bookingSesionId === null && (
            <div style={{ marginTop: fichaCalendarioAbierta ? 0 : 20 }}>
              <ReservaCalendario
                t={tokensCalendario}
                slots={slots}
                variant="calendario"
                estiloFicha="vista"
                // Fase 3 del rediseño: `?densidad=`/`?forma=` (solo
                // `embed=1`, como el resto de `apariencia` — la página
                // SUELTA no honra parámetros del snippet).
                densidadEsc={escalaDensidad(apariencia)}
                radiosEsc={radiosDe(apariencia, { tarjeta: R.card, boton: R.pill, input: R.spot })}
                // `?diseno=ligero` (snippet, solo llega con embed=1) cambia a
                // la rejilla compacta del bundle; el default sigue siendo la
                // tira de 10 días.
                estiloDias={configWidget?.diseno === 'ligero' ? 'grid' : 'dias'}
                filtrosChips={filtrosChipsClases}
                vistaInicial={configWidget?.vistaInicial ?? 'todo'}
                ocultarPrecio={configWidget?.ocultarPrecio ?? false}
                ocultarNivel={configWidget?.ocultarNivel ?? false}
                ocultarSustituta={configWidget?.ocultarSustituta ?? false}
                // ⚠️ Bug real de producción (2026-08-29): "elegir el sitio se
                // repite" — sin sesión, `handleReservarCalendario` SIEMPRE
                // deriva a un segundo paso que vuelve a preguntar el sitio
                // ('datos' del checkout sin login, o 'confirm' tras iniciar
                // sesión) — nunca reserva directo desde esta ficha. Pedirlo
                // aquí TAMBIÉN es redundante; con sesión, en cambio, esta
                // ficha SÍ es el único paso.
                ocultarSelectorSitio={!autenticado}
                loading={!dataLoaded}
                onReservar={handleReservarCalendario}
                onCancelar={cancelarReserva}
                onAceptarOferta={aceptarOfertaEspera}
                cancelacionVentanaHoras={studio?.cancelacionVentanaHoras}
                ventanaPorTipo={ventanaPorTipo}
                vacio={{
                  titulo: textosReservar.vacioTitulo || 'Sin clases disponibles',
                  cuerpo: textosReservar.vacioTexto || 'Prueba con otra semana o cambia el filtro',
                }}
                // Fase 4 del rediseño (docs/widget-reservas-fase4-brief-diseno.md,
                // captura 21): la carga pública falló de verdad, no es que no
                // haya clases — antes ambos casos eran indistinguibles.
                error={dataLoaded && errorPublico ? { onReintentar: recargarPublico } : undefined}
                finalizadasHoy={slotsFinalizadosHoy}
                // P0-3: dentro del iframe, la hoja de ficha se ancla a la
                // franja visible (o al top como fallback), nunca al fondo del
                // iframe entero. Ver el bloque de `franjaVisible` arriba.
                enIframe={embedMode}
                franjaVisible={franjaVisible}
                alCambiarFicha={alCambiarFicha}
                abrirSlotExterno={abrirFichaExterna}
              />
            </div>
            )}

            {/* Restaurado tras romper e2e/reservar-ventana-por-tipo.spec.ts: no
                es copy decorativa, es el aviso honesto de cancelación/antelación
                por TIPO DE CLASE (frasePlazoCancelacion y compañía,
                lib/reservar/promesas.ts) — quitarlo del todo habría reabierto un
                bug ya cerrado. El handoff (design_handoff_widget_reservas) no
                trae esta caja porque ese plazo lo enseña en la hoja de detalle
                de cada clase (SlotRow → BookingSheet) — pero el tope de
                ANTELACIÓN MÁXIMA solo se anuncia aquí, así que se queda, ahora
                en columna única bajo la lista en vez de en un rail lateral.
                Oculto con la ficha abierta (rediseño "sin popup"): es un
                "cómo funciona" general del listado, fuera de lugar debajo de
                UNA clase concreta. */}
            {!enVistaReserva && (
            <div style={{ marginTop: 20, borderRadius: R.hero, background: 'var(--portal-velo)', border: '1px solid var(--portal-line)', padding: '22px 24px' }}>
              <div style={eyebrow(9)}>{textosReservar.comoFunciona || 'CÓMO FUNCIONA'}</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px 28px', marginTop: 16 }}>
                {[
                  'Elige el día y la clase.',
                  ...(antelacionMinima ? [antelacionMinima] : ['Reserva tu plaza en la sala.']),
                  plazoCancelacion,
                ].map((paso, i) => (
                  <div key={i} style={{ display: 'flex', gap: 10, flex: '1 1 200px', minWidth: 0 }}>
                    <span style={{ fontFamily: serif, fontSize: 16, color: 'var(--portal-accent)', lineHeight: 1.3, flexShrink: 0 }}>{i + 1}</span>
                    <span style={{ fontSize: 12, color: 'var(--portal-muted-2)', lineHeight: 1.5 }}>{paso}</span>
                  </div>
                ))}
              </div>
              {antelacionMaxima && (
                <p style={{ fontSize: 11.5, color: 'var(--portal-muted)', lineHeight: 1.5, marginTop: 14, paddingTop: 12, borderTop: '1px solid var(--portal-line)' }}>
                  {antelacionMaxima}
                </p>
              )}
            </div>
            )}
          </div>
        )}

        {/* ── TAB: CITAS 1:1 ──────────────────────────────────────────────── */}
        {/* Sin cabecera propia aquí: CitasPublica ya pinta "Citas" + el
            subtítulo (calcando design_handoff_widget_reservas) tanto con
            servicios configurados como en su estado vacío — una cabecera
            aparte aquí quedaba duplicada en el primer caso y con el título
            equivocado ("Citas privadas") en el segundo. */}
        {tab === 'citas' && !enVistaReserva && (
          <div style={{ padding: `${cq(28, 3.4, 44)} 0 ${cq(50, 7, 90)}` }}>
            <CitasPublica
              overlayStyle={overlayEmbed}
              onOverlayAbierto={setCitaConfirmandoAbierta}
              studioId={studio?.id ?? ''}
              servicios={citasServicios}
              instructores={instructores}
              disponibilidad={citasDisponibilidad}
              misCitas={misCitas}
              autenticada={!!socia}
              onNeedLogin={() => openBooking('')}
              onReservar={(servicioId, instructorId, inicioISO) => reservarCitaPublica({ servicioId, instructorId, inicioISO })}
              onCancelar={cancelarCita}
              primary={PRIMARY}
              primaryFg={PRIMARY_FG}
            />
          </div>
        )}

        {/* ── TAB: MIS RESERVAS (embed/soloPestana: widget de un solo
            propósito, sigue siendo página completa) ────────────────────── */}
        {tab === 'misreservas' && (
          <div style={{ padding: `${cq(28, 3.4, 44)} 0 ${cq(50, 7, 90)}` }}>
            {misReservasBody}
          </div>
        )}

        {/* ── SHEET: MIS RESERVAS ──────────────────────────────────────────
            Diseño "Tentare Portal Reservas": se desliza desde abajo sobre
            el listado de clases, disparado desde el botón de la cabecera —
            no una pestaña de página completa. `inline={false}` (el
            comportamiento por defecto de `PublicSheet`) es exactamente el
            backdrop + hoja anclada abajo que el diseño pide. */}
        {!embedMode && (
          <PublicSheet
            open={misReservasAbierta}
            onClose={() => setMisReservasAbierta(false)}
            label="Mis reservas"
            sheetClassName="w-full max-w-sm rounded-t-3xl sm:rounded-3xl p-6 shadow-2xl"
            sheetStyle={{ background: 'var(--portal-bg)' }}
          >
            {misReservasBody}
          </PublicSheet>
        )}

        {/* ── TAB: EL ESTUDIO ─────────────────────────────────────────────────
            Fase 4 del rediseño (docs/widget-reservas-fase4-brief-diseno.md,
            formato 04): una sola columna — antes era contenido principal +
            sidebar con la MISMA info del estudio repetida dos veces (nombre y
            dirección en el hero de arriba Y en la tarjeta lateral). */}
        {tab === 'estudio' && (
          <div style={{ padding: `${cq(28, 3.4, 44)} 0 ${cq(50, 7, 90)}` }}>
            <h2 style={{ fontFamily: serif, fontSize: cq(28, 6.5, 34), lineHeight: 1 }}>El estudio</h2>
            {studio?.descripcion && (
              <p style={{ fontSize: 13.5, color: 'var(--portal-muted)', marginTop: 14, maxWidth: 520, lineHeight: 1.65 }}>{studio.descripcion}</p>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))', gap: 14, marginTop: 24 }}>
              {franjasHorario.length > 0 && (
                <div style={{ borderRadius: R.card, background: 'var(--portal-surface)', border: '1px solid var(--portal-line)', padding: '20px 22px' }}>
                  <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '.12em', color: 'var(--portal-muted)' }}>HORARIO DE APERTURA</div>
                  {franjasHorario.map((f, i) => (
                    <div key={f.dias} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, marginTop: i === 0 ? 14 : 7, fontSize: 13 }}>
                      <span style={{ color: 'var(--portal-muted)' }}>{f.dias}</span>
                      <span style={{ fontWeight: 600, color: 'var(--portal-ink)', fontVariantNumeric: 'tabular-nums' }}>{f.horas}</span>
                    </div>
                  ))}
                  {/* Pocos días con clase todavía: se enseñan los que hay sin
                      dar por cerrado el resto — un calendario a medio cargar
                      no es lo mismo que un horario reducido de verdad. */}
                  {!horarioConfiable && (
                    <p style={{ fontSize: 11.5, color: 'var(--portal-muted)', marginTop: 12, lineHeight: 1.5 }}>
                      Puede haber más clases por confirmar — consulta el horario completo con el estudio.
                    </p>
                  )}
                </div>
              )}
              <div style={{ borderRadius: R.card, background: 'var(--portal-surface)', border: '1px solid var(--portal-line)', padding: '20px 22px' }}>
                <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '.12em', color: 'var(--portal-muted)' }}>DÓNDE ESTAMOS</div>
                <p style={{ fontSize: 13, color: 'var(--portal-ink)', marginTop: 14 }}>{estudioDireccion}</p>
                <p style={{ fontSize: 12.5, color: 'var(--portal-muted)', marginTop: 6 }}>{estudioEmail}</p>
                <p style={{ fontSize: 12.5, color: 'var(--portal-muted)', marginTop: 2 }}>{estudioTelefono}</p>
              </div>
            </div>

            {/* ⚠️ El rótulo solo sale si hay algo debajo — un estudio recién
                dado de alta no se encuentra un encabezado sobre nada. */}
            {tiposClase.length > 0 && (<>
              <div style={{ ...eyebrow(9), marginTop: 38 }}>TIPOS DE CLASE</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 12, marginTop: 16 }}>
                {tiposClase.map(t => (
                  <div key={t.id} style={{ borderRadius: R.chipCard, background: 'var(--portal-velo-fuerte)', border: `1px solid ${t.color}20`, padding: 22 }}>
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

            {/* El equipo — mismo criterio de arriba: `queImparten` ya filtra a
                quien de verdad da clase. Fase 4: sin bio (respuesta 5 del brief
                de diseño) — solo avatar, nombre, especialidad; una tarjeta
                pensada para escanear el equipo de un vistazo, no para leerlo. */}
            {queImparten(instructores).length > 0 && (<>
              <div style={{ ...eyebrow(9), marginTop: 38 }}>EL EQUIPO</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 14, marginTop: 16 }}>
                {queImparten(instructores).map(i => {
                  const especialidades = [...(especialidadesPorInstructor.get(i.id) ?? [])];
                  return (
                    <div key={i.id} style={{ borderRadius: R.chipCard, background: 'var(--portal-surface)', border: '1px solid var(--portal-line)', padding: '18px 14px', textAlign: 'center' }}>
                      {i.fotoUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={i.fotoUrl} alt={i.nombre} loading="lazy" decoding="async" style={{ width: 46, height: 46, borderRadius: 999, objectFit: 'cover', marginInline: 'auto' }} />
                      ) : (
                        <div style={{ width: 46, height: 46, borderRadius: 999, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 12, color: 'var(--portal-muted)', background: 'var(--portal-surface-2)', border: '1px solid var(--portal-line)', marginInline: 'auto' }}>
                          {i.nombre.split(' ').map(n => n[0]).join('')}
                        </div>
                      )}
                      <div style={{ fontFamily: serif, fontSize: 16.5, lineHeight: 1.2, marginTop: 10 }}>{i.nombre}</div>
                      {especialidades.length > 0 && (
                        <div style={{ fontSize: 11.5, color: 'var(--portal-muted)', marginTop: 4 }}>
                          {especialidades.join(' · ')}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </>)}

            {/* Igual que en «Mis reservas»: fuera de `embedMode` saltar a
                «Clases» tiene sentido (misma página, otra pestaña). El widget
                embebido «El estudio» es solo la ficha pública — no lleva a
                otro widget. */}
            {!embedMode && (
              <button type="button" onClick={() => setTab('clases')} style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center', width: '100%', maxWidth: 320,
                height: 50, marginTop: 38, borderRadius: R.pillBtnMd, border: 'none',
                background: PRIMARY, color: PRIMARY_FG, fontFamily: sans, fontWeight: 700, fontSize: 14, cursor: 'pointer',
              }}>
                Ver horario y reservar
              </button>
            )}
          </div>
        )}

        {/* ── TAB: MI CUENTA (Fase 4 Booking Engine) ──────────────────────────
            Solo Bonos y Perfil: "Mis reservas" ya tiene su propia pestaña más
            completa arriba (calendario, .ics, aviso de cancelación tardía) —
            ver docs/account-widget-diseno.md §4. */}
        {tab === 'cuenta' && (
          <div style={{ padding: `${cq(28, 3.4, 44)} 0 ${cq(50, 7, 90)}`, maxWidth: 520 }}>
            {!socia ? (
              <div style={{ borderRadius: R.card, background: 'var(--portal-surface)', display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '56px 24px', gap: 16, textAlign: 'center', boxShadow: SH.card }}>
                <div style={{ width: 56, height: 56, borderRadius: 999, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--portal-surface-2)' }}>
                  <Users size={24} style={{ color: PRIMARY }} />
                </div>
                <div>
                  <h3 style={{ fontFamily: serif, fontSize: 21, color: 'var(--portal-ink)' }}>Identifícate para ver tu cuenta</h3>
                  <p style={{ fontSize: 12.5, color: 'var(--portal-muted-2)', marginTop: 6 }}>Te enviamos un enlace de acceso a tu email. Sin contraseñas.</p>
                </div>
                <button onClick={() => openBooking('')}
                  style={{ height: 48, padding: '0 26px', borderRadius: R.pillBtnSm, background: PRIMARY, color: PRIMARY_FG, border: 'none', fontSize: 13, fontWeight: 500, cursor: 'pointer' }}>
                  Acceder
                </button>
              </div>
            ) : (
              (() => {
                const socioCompleto = socios.find(s => s.id === socia.socioId);
                if (!socioCompleto) return null;
                return (
                  <MiCuenta
                    t={tokensCalendario} secciones={['bonos', 'perfil']} socio={socioCompleto}
                    reservas={reservas} sesiones={sesiones} tiposClase={tiposClase} salas={salas} instructores={instructores}
                    suscripciones={suscripciones} planesTarifa={planesTarifa}
                    onCancelar={cancelarReserva} onAceptarOferta={aceptarOfertaEspera}
                    onActualizarPerfil={(cambios) => updateSocio(socia.socioId, cambios)}
                    onLogout={logout}
                  />
                );
              })()
            )}
          </div>
        )}

        {/* Fase 4 del rediseño (docs/widget-reservas-fase4-brief-diseno.md):
            insignia de confianza al pie de CADA formato — captación 01-05.
            El logo se pinta con el componente en línea de siempre
            (components/marca/logo-tentare.tsx), nunca con un asset raster
            aparte, tal y como fija docs/marca/: un solo dibujo, no dos kits
            de marca conviviendo a un clic de distancia.
            ⚠️ Bug real de producción (2026-08-29): a esta insignia le faltaba
            el guardia `!enVistaReserva` que ya llevan todos sus vecinos
            (bonos/cifras/sobre-nosotros/footer, unas líneas más abajo) — se
            colaba DENTRO del checkout, entre la cabecera y la ficha de pago,
            partiendo la pantalla en dos con un hueco vacío y rompiendo el
            scroll (el `order` del flex la dejaba fuera de la caja con
            `overflow:hidden` de la cabecera/portada, así que ni siquiera se
            comportaba como "pie de página" ahí). */}
        {!enVistaReserva && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7, padding: `${cq(2, 0.6, 8)} 0 16px`, color: 'var(--portal-muted)', fontSize: 11 }}>
          Reservas seguras con
          <LogoTentare formato="horizontal" tinta={esNoche ? 'blanco' : 'tinta'} alto={16} decorativo />
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
      {!enVistaReserva && seccionVisible('bonos') && planesContratables.length > 0 && (
        <div style={{ order: orden('bonos'), borderTop: '1px solid var(--portal-surface-2)', padding: `${cq(30, 3.6, 50)} ${cq(20, 3.8, 48)}` }}>
          <div style={{ maxWidth: 1280, marginInline: 'auto' }}>
            <h2 style={{ fontFamily: serif, fontSize: cq(22, 2.6, 34), lineHeight: 1.15, textAlign: 'center', marginBottom: 6 }}>Bonos y membresías</h2>
            {/* ⚠️ Sin las clases `text-destructive`/`bg-destructive` del PANEL.
                Esas no participan del modo del widget: medido, el aviso salía
                EXACTAMENTE igual en claro y en oscuro —rojo teja #A8442A sobre
                un fondo al 10 %—, que sobre una web oscura da ~2,8:1 y no llega
                a AA con texto de 13 px. Justo el error que la alumna más
                necesita poder leer: el que le dice que su pago no ha arrancado.
                `semantic.danger` sí tiene variante de noche. */}
            {stripeError && (
              <div
                role="alert"
                style={{
                  marginTop: 12, padding: '10px 16px', borderRadius: 14, fontSize: 13,
                  color: esNoche ? semantic.danger.textNoche : semantic.danger.text,
                  background: semantic.danger.soft,
                  border: `1px solid ${esNoche ? semantic.danger.textNoche : semantic.danger.text}33`,
                }}
              >
                {stripeError}
              </div>
            )}
            {/* Auditoría vs Momence: código de descuento, plegado por defecto.
                El precio final que se cobra siempre lo decide el servidor al
                crear el checkout — esto solo manda el texto. */}
            <div style={{ textAlign: 'center', marginTop: 10 }}>
              {!mostrarCodigo ? (
                <button
                  onClick={() => setMostrarCodigo(true)}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, color: 'var(--portal-muted-2)', textDecoration: 'underline' }}
                >
                  ¿Tienes un código de descuento?
                </button>
              ) : (
                <div style={{ display: 'inline-flex', gap: 8, alignItems: 'center' }}>
                  <input
                    type="text"
                    value={codigoDescuento}
                    onChange={e => setCodigoDescuento(e.target.value)}
                    placeholder="Código de descuento"
                    style={{
                      height: 36, padding: '0 12px', borderRadius: R.pillBtnXs, fontSize: 12.5,
                      border: '1px solid var(--portal-line)', background: 'var(--portal-surface)', color: 'var(--portal-ink)',
                    }}
                  />
                </div>
              )}
            </div>
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
                        : <><CreditCard size={14} />Contratar</>}
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
      {!enVistaReserva && seccionVisible('sobre') && textosReservar.sobreTexto && (
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

      {!enVistaReserva && seccionVisible('cifras') && mereceBanda(cifras) && (
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

      {/* Bloques del catálogo añadidos desde el editor — cada uno en su propia
          posición de `order`, entre las 6 secciones de siempre. */}
      {bloquesCatalogo.map((b) => (
        <div key={b.id} style={{ order: orden(b.id) }}>
          <BloqueReservarRender bloque={b} slug={slug} />
        </div>
      ))}

      {/* `ocultarPie` solo puede venir en modo incrustado (ver `apariencia`),
          así que la página suelta conserva su pie con los legales pase lo que
          pase. Ahí es el único sitio donde vive esa información. */}
      {!enVistaReserva && !apariencia.ocultarPie && seccionVisible('contacto') && (
      <footer style={{ order: orden('contacto'), borderTop: '1px solid var(--portal-surface-2)', marginTop: 40, padding: `${cq(28, 3, 40)} ${cq(20, 3.8, 48)}` }}>
        <div style={{ maxWidth: 1280, marginInline: 'auto', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 18, textAlign: 'center' }}>
          {/* ¿Dudas? — teléfono y email del estudio. Cada uno se pinta SOLO si
              existe: una fila de contacto con huecos vacíos, o peor, con un
              teléfono de ejemplo, es un desvío a ninguna parte justo cuando
              alguien ya se ha decidido a preguntar. El WhatsApp sale de sus
              redes sociales, que ya se resuelven más abajo. */}
          {(studio?.telefono || studio?.email) && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', flexWrap: 'wrap', gap: 16, fontSize: 12.5 }}>
              <span style={{ color: 'var(--portal-muted)' }}>{textosReservar.ayuda || '¿Dudas? Estamos aquí para ayudarte:'}</span>
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

          {/* Los CANALES del estudio: su web (columna `studios.sitio_web`) y sus
              redes (tema publicado). El pie no tiene que saber que viven en dos
              sitios — `canalesDelEstudio()` los reúne y devuelve solo los que
              de verdad resuelven a un enlace. */}
          {canalesEstudio.length > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 18, flexWrap: 'wrap' }}>
              {canalesEstudio.map(({ id, label, href }) => (
                <a
                  key={id}
                  href={href}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ display: 'flex', alignItems: 'center', gap: 5, color: 'var(--portal-muted)', textDecoration: 'none', fontSize: 12 }}
                >
                  <ExternalLink size={12} />{label}
                </a>
              ))}
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
        inline
        label={
          loginStep === 'done' ? (pagoWebSinLogin ? tituloPagoWeb : (textosReservar.confirmacion || '¡Reserva confirmada!'))
          : loginStep === 'espera' ? '¡En lista de espera!'
          : loginStep === 'pendiente' ? 'Pendiente de aprobación'
          : loginStep === 'login' ? (enlaceEnviado ? 'Revisa tu email' : 'Entra para reservar')
          : loginStep === 'datos' ? 'Tus datos'
          : loginStep === 'pago' ? 'Pagar y reservar'
          : loginStep === 'registro' ? '¿Cómo te llamas?'
          : loginStep === 'contrato' ? 'Acepta los términos'
          : 'Confirmar reserva'
        }
        // Rediseño "sin popup" (pedido explícito: eliminar el modal de
        // reserva, sustituirlo por una vista dentro del propio widget). Ya no
        // hay backdrop ni tope de altura que simular: el iframe se
        // redimensiona solo al alto real del documento (postMessage
        // `tentareEmbedAltura` más arriba en este mismo fichero), así que
        // esta pantalla es un bloque más de la página, tan alta como su
        // contenido — el `min-h-` solo evita un salto al pasar de una fila
        // corta de "Mis reservas" a un formulario largo.
        sheetClassName="w-full min-h-[50vh] px-6 pt-6"
        // Sin `footer` (done/espera/pendiente/confirm/contrato), nada más
        // le pone aire por debajo — mismo `paddingBottom` con safe-area que
        // ya llevaba esta hoja antes del rediseño (#1365: el botón "Añadir a
        // tu calendario" quedaba a ras de la barra de gestos del iPhone).
        // Con `footer` esa hoja YA lleva su propio padding con safe-area
        // (public-sheet.tsx), así que aquí se omite para no duplicarlo.
        sheetStyle={((loginStep === 'login' && !enlaceEnviado) || loginStep === 'registro')
          ? undefined
          : { paddingBottom: 'calc(1.5rem + env(safe-area-inset-bottom, 0px))' }}
        // El CTA de 'login'/'registro' sigue con `footer`: separa la acción
        // del contenido con una línea de pelo, aunque ya no vaya "pegado
        // abajo" (no hay altura acotada que fijarlo) — sigue siendo lo
        // siguiente que se lee tras el último campo, alcanzable con scroll
        // normal. 'datos'/'pago' ya NO pasan por aquí — <PantallaReserva>
        // lleva su propio CTA dentro de la tarjeta de pago.
        footer={
          loginStep === 'login' && !enlaceEnviado ? (
            <button onClick={handleContinuarAcceso} disabled={!loginForm.email || enviandoEnlace || enviandoLoginPassword}
              className={BOTON_PRIMARIO}
              style={{ backgroundColor: PRIMARY }}>
              {enviandoLoginPassword ? 'Entrando…' : enviandoEnlace ? 'Enviando…' : loginPassword.trim() ? 'Iniciar sesión →' : 'Continuar →'}
            </button>
          ) : loginStep === 'registro' ? (
            <button onClick={handleRegistroNombre} disabled={!loginForm.nombre.trim() || !telefonoValido(loginForm.telefono)}
              className={BOTON_PRIMARIO}
              style={{ backgroundColor: PRIMARY }}>
              Continuar →
            </button>
          ) : undefined
        }
      >
        {bookingSesionId !== null && (
          <>
            {/* Un único "‹ Volver a las clases" arriba de todo — nunca la X
                flotante de antes. 'datos'/'pago' llevan el SUYO PROPIO dentro
                de <PantallaReserva> ("‹ Volver a la clase"/"Editar mis
                datos"), así que aquí no se repite: dos controles de "atrás" a
                la vez confundían más de lo que ayudaban. */}
            {!esPantallaReserva && (
              <div className="flex items-center justify-between mb-4">
                <button type="button" onClick={closeBooking}
                  className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-[var(--portal-muted)] hover:text-[var(--portal-ink)] transition-colors">
                  <ChevronLeft size={16} strokeWidth={2.5} />
                  Volver a las clases
                </button>
              </div>
            )}

            {/* ── DONE ── */}
            {loginStep === 'done' && bookingSesion && (
              <div className="flex flex-col items-center text-center gap-4 paso-anim">
                {/* P1-3: el icono dice la verdad del momento — spinner mientras
                    se confirma, verde solo con confirmación REAL del servidor,
                    ámbar para espera/pendiente/tardando/fallida. */}
                {!pagoWebSinLogin || confirmacionPago === 'confirmada' ? (
                  // Icono de éxito con el tratamiento del diseño "Tentare
                  // Portal Reservas": anillo que se expande y se disuelve
                  // detrás de un check con rebote, más 4 confettis — SOLO
                  // para el éxito real, nunca para confirmando/espera/fallo
                  // (esos mantienen su propio icono honesto, sin animación
                  // de celebración, porque no hay nada que celebrar todavía).
                  <div className="relative" style={{ width: 62, height: 62 }} aria-hidden="true">
                    <span className="reserva-confeti-a absolute rounded-sm" style={{ left: '32%', top: '36%', width: 7, height: 10, background: 'var(--portal-brand)' }} />
                    <span className="reserva-confeti-b1 absolute rounded-full" style={{ left: '48%', top: '33%', width: 7, height: 7, background: 'var(--warning)' }} />
                    <span className="reserva-confeti-c absolute rounded-sm" style={{ left: '62%', top: '36%', width: 7, height: 10, background: 'var(--destructive)' }} />
                    <span className="reserva-confeti-b2 absolute rounded-full" style={{ left: '40%', top: '38%', width: 6, height: 6, background: 'var(--portal-ink)' }} />
                    <span className="reserva-check-ring absolute inset-0 rounded-full" style={{ border: '2.5px solid var(--success)' }} />
                    <span className="reserva-check-pop absolute inset-0 rounded-full flex items-center justify-center"
                      style={{ backgroundColor: 'color-mix(in oklab, var(--success) 14%, var(--portal-surface))' }}>
                      <CheckCircle2 size={30} style={{ color: 'var(--success)' }} />
                    </span>
                  </div>
                ) : confirmacionPago === 'confirmando' ? (
                  <div className="w-16 h-16 rounded-full flex items-center justify-center bg-[var(--portal-surface-2)] border border-[var(--portal-line)]">
                    <Loader2 size={30} className="animate-spin text-[var(--portal-muted)]" aria-label="Confirmando tu plaza" />
                  </div>
                ) : confirmacionPago === 'lista_espera' || confirmacionPago === 'pendiente_aprobacion' ? (
                  <div className="w-16 h-16 rounded-full flex items-center justify-center" style={{ backgroundColor: 'color-mix(in oklab, var(--warning) 18%, var(--portal-surface))' }}>
                    <Hourglass size={30} style={{ color: 'var(--warning)' }} />
                  </div>
                ) : (
                  <div className="w-16 h-16 rounded-full flex items-center justify-center" style={{ backgroundColor: 'color-mix(in oklab, var(--warning) 18%, var(--portal-surface))' }}>
                    <AlertTriangle size={30} style={{ color: 'var(--warning)' }} />
                  </div>
                )}
                <div>
                  <p className="text-[var(--portal-ink)] font-extrabold text-xl">
                    {pagoWebSinLogin ? tituloPagoWeb : (textosReservar.confirmacion || '¡Reserva confirmada!')}
                  </p>
                  {/* Sin pago de por medio no hay resguardo debajo, así que
                      aquí sigue haciendo falta la línea de clase/fecha/hora.
                      Con pago, la repetiría: el resguardo la dice mejor. */}
                  {!pagoWebSinLogin && (
                    <p className="text-[var(--portal-muted-2)] mt-1" style={{ fontSize: 13, lineHeight: 1.55 }}>
                      {bookingSesion.tipo?.nombre} · {fmtLong(new Date(bookingSesion.inicio))} a las {fmtTime(bookingSesion.inicio)}
                    </p>
                  )}
                </div>
                {/* El resguardo de la reserva.
                    Antes esto era una sola línea con el plan y el precio, y la
                    clase/fecha/hora vivían sueltas bajo el título. Faltaba lo
                    que de verdad se busca en una pantalla de confirmación:
                    DÓNDE es, en qué estado está la reserva, en qué estado está
                    el pago, y una referencia que poder citar si algo falla.
                    Los dos estados van SEPARADOS a propósito: son cosas
                    distintas y pueden no coincidir — el pago puede estar
                    recibido y la plaza en lista de espera, que es justo el caso
                    que más confunde. */}
                {pagoWebSinLogin && (
                  <dl className="w-full rounded-2xl divide-y divide-[var(--portal-line)] bg-[var(--portal-surface-2)] border border-[var(--portal-line)] text-left">
                    {[
                      ['Clase', claseConfirmada?.nombre ?? bookingSesion.tipo?.nombre ?? '—'],
                      ['Fecha', fmtLong(new Date(claseConfirmada?.inicio ?? bookingSesion.inicio))],
                      ['Hora', fmtTime(claseConfirmada?.inicio ?? bookingSesion.inicio)],
                      ['Estudio', [estudioNombre, estudioDireccion].filter(Boolean).join(' · ')],
                    ].map(([k, v]) => (
                      <div key={k} className="flex items-baseline justify-between gap-3 px-3.5 py-2.5">
                        <dt className="text-[var(--portal-muted-2)] text-xs font-semibold shrink-0">{k}</dt>
                        <dd className="text-[var(--portal-ink)] text-[13px] font-semibold text-right">{v}</dd>
                      </div>
                    ))}
                    <div className="flex items-baseline justify-between gap-3 px-3.5 py-2.5">
                      <dt className="text-[var(--portal-muted-2)] text-xs font-semibold shrink-0">Reserva</dt>
                      <dd className="text-[13px] font-bold text-right">{etiquetaEstadoReserva}</dd>
                    </div>
                    <div className="flex items-baseline justify-between gap-3 px-3.5 py-2.5">
                      <dt className="text-[var(--portal-muted-2)] text-xs font-semibold shrink-0">Pago</dt>
                      <dd className="text-[var(--portal-ink)] text-[13px] font-semibold text-right">
                        Recibido{datosPlan ? ` · ${datosPlan.precio} €` : ''}
                      </dd>
                    </div>
                    {/* La referencia sirve para una sola cosa, y es la que
                        importa: poder decirle al estudio EXACTAMENTE qué pago
                        es si hay que buscarlo. Va en monoespaciada y
                        seleccionable; el id completo es largo e ilegible, así
                        que se enseñan los últimos tramos, que es lo que
                        distingue un pago de otro. */}
                    {referenciaPago && (
                      <div className="flex items-baseline justify-between gap-3 px-3.5 py-2.5">
                        <dt className="text-[var(--portal-muted-2)] text-xs font-semibold shrink-0">Referencia</dt>
                        <dd className="text-[var(--portal-muted-2)] text-[12px] font-mono select-all text-right break-all">{referenciaPago}</dd>
                      </div>
                    )}
                  </dl>
                )}
                {pagoWebSinLogin && (
                  <div className="w-full rounded-2xl p-3.5 text-left bg-[var(--portal-surface-2)] border border-[var(--portal-line)]">
                    {/* Copy honesto (P0 → P1-3): la reserva y la cuenta las
                        crea el WEBHOOK después del pago. Antes esta caja decía
                        «estamos confirmando» para siempre; ahora el polling a
                        /api/public/estado-pago trae la respuesta real y cada
                        estado dice EXACTAMENTE lo que consta — nunca una
                        confirmación inventada. */}
                    <p className="text-[var(--portal-ink)] text-sm">
                      {confirmacionPago === 'confirmando' && (
                        <>Estamos confirmando tu plaza. En un momento te llegará a{' '}
                        <span className="font-semibold">{loginForm.email}</span> el email de
                        confirmación con el acceso a tu cuenta.</>
                      )}
                      {confirmacionPago === 'confirmada' && (
                        <>Tu plaza está confirmada. Te llegará a{' '}
                        <span className="font-semibold">{loginForm.email}</span> el email de
                        confirmación con el acceso a tu cuenta.</>
                      )}
                      {confirmacionPago === 'lista_espera' && (
                        <>El pago está recibido y tu bono queda en tu cuenta, pero la clase
                        se ha llenado justo antes de confirmar tu plaza: estás en la lista
                        de espera y te avisaremos a{' '}
                        <span className="font-semibold">{loginForm.email}</span> si se libera un sitio.</>
                      )}
                      {confirmacionPago === 'pendiente_aprobacion' && (
                        <>El pago está recibido. Este estudio revisa cada reserva antes de
                        confirmarla: te llegará a{' '}
                        <span className="font-semibold">{loginForm.email}</span> la
                        confirmación en cuanto la aprueben.</>
                      )}
                      {confirmacionPago === 'tardando' && (
                        <>El pago está recibido, pero la confirmación de tu plaza está
                        tardando más de lo normal. Te llegará por email a{' '}
                        <span className="font-semibold">{loginForm.email}</span>; si no
                        llega en unos minutos, escribe al estudio y te lo resuelven.</>
                      )}
                      {confirmacionPago === 'fallida' && (
                        <>El pago está recibido, pero no hemos podido asignarte la plaza en
                        esta clase. El estudio ya está avisado y se pondrá en contacto
                        contigo para darte una solución.</>
                      )}
                    </p>
                  </div>
                )}
                {(!pagoWebSinLogin || confirmacionPago === 'confirmada') && (
                <div className="w-full space-y-2.5 mt-1">
                  <p className="text-[var(--portal-muted)] text-xs font-semibold uppercase tracking-wide">Añadir a tu calendario</p>
                  {/* ⚠️ Estos dos botones tenían jerarquía invertida y fuera de
                      marca: el de Google iba en `#4285F4` —azul de Google, un
                      hex fijo que no es de este estudio ni de ningún otro— y
                      pesaba más que la propia confirmación, mientras el de
                      .ics parecía secundario sin serlo. Son la MISMA acción con
                      dos destinos, así que ahora comparten tratamiento: el
                      principal en el color del estudio, el alternativo en
                      superficie. Cero hex de terceros en una pantalla que
                      lleva la marca de un estudio. */}
                  <a href={makeGoogleCalUrl(bookingSesion, estudioNombre, estudioDireccion)} target="_blank" rel="noopener noreferrer"
                    className={`${BOTON_PRIMARIO} flex items-center justify-center gap-2`}
                    style={{ backgroundColor: PRIMARY }}>
                    <ExternalLink size={14} />Google Calendar
                  </a>
                  <button onClick={() => downloadICS(bookingSesion, estudioNombre, estudioDireccion)}
                    className={`${BOTON_SECUNDARIO} flex items-center justify-center gap-2`}>
                    <Download size={14} />Apple / Outlook (.ics)
                  </button>
                </div>
                )}
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
                    {/* ⚠️ En el widget, ABRIR EN OTRA PESTAÑA no es un detalle:
                        es lo que impide que el widget deje de ser un widget.
                        Sin `target`, este enlace navegaba el propio iframe a
                        `/portal/<slug>/acceso`, que es una pantalla de portal a
                        pantalla completa (`minHeight: 100dvh`, portada de
                        260px y `justify-content: space-between`). Metida en el
                        marco del widget, ese `space-between` reparte el
                        contenido entre el borde de arriba y el de abajo: de ahí
                        el hueco enorme entre el texto y los botones, y la
                        sensación de popup larguísimo. Y en Modo B (el bundle
                        corre en el DOM del estudio) era peor todavía: se
                        llevaba por delante la página entera de su web.
                        Fuera del embebido se queda como estaba — ahí navegar
                        es lo correcto. */}
                    {tienePasswordPropia ? (
                      <a href={`/portal/${slug}/login`} className="font-bold underline" style={{ color: PRIMARY }}
                        {...(embedMode ? { target: '_blank', rel: 'noopener noreferrer' } : {})}>
                        Entra con tu contraseña
                      </a>
                    ) : (
                      <a href={`/portal/${slug}/acceso`} className="font-bold underline" style={{ color: PRIMARY }}
                        {...(embedMode ? { target: '_blank', rel: 'noopener noreferrer' } : {})}>
                        Crea tu contraseña
                      </a>
                    )}{' '}
                    y entra cuando quieras.
                  </p>
                </div>
                <button onClick={closeBooking} className={`${BOTON_TERCIARIO} mt-1`}>
                  Cerrar
                </button>
              </div>
            )}

            {/* ── ESPERA ── */}
            {loginStep === 'espera' && (
              <div className="flex flex-col items-center text-center py-4 gap-4 paso-anim">
                <div className="w-16 h-16 rounded-full flex items-center justify-center" style={{ backgroundColor: 'color-mix(in oklab, var(--warning) 18%, var(--portal-surface))' }}>
                  <CheckCircle2 size={30} style={{ color: 'var(--warning)' }} />
                </div>
                <div>
                  <p className="text-[var(--portal-ink)] font-extrabold text-xl">¡En lista de espera!</p>
                  {esperaPos && (
                    <p className="text-[var(--portal-muted-2)] text-sm mt-1">Eres la <span className="font-bold text-[var(--portal-ink)]">nº {esperaPos}</span> en la lista.</p>
                  )}
                  <p className="text-[var(--portal-muted-2)] text-sm mt-1">{textosReservar.listaEspera || 'Si se libera una plaza, te avisaremos por email.'}</p>
                </div>
                <button onClick={closeBooking}
                  className={BOTON_SECUNDARIO}>
                  Cerrar
                </button>
              </div>
            )}

            {/* ── PENDIENTE DE APROBACIÓN (Fase 2a) ── */}
            {loginStep === 'pendiente' && (
              <div className="flex flex-col items-center text-center py-4 gap-4 paso-anim">
                <div className="w-16 h-16 rounded-full flex items-center justify-center" style={{ backgroundColor: 'color-mix(in oklab, var(--warning) 18%, var(--portal-surface))' }}>
                  <CheckCircle2 size={30} style={{ color: 'var(--warning)' }} />
                </div>
                <div>
                  <p className="text-[var(--portal-ink)] font-extrabold text-xl">Solicitud enviada</p>
                  <p className="text-[var(--portal-muted-2)] text-sm mt-1">Tu reserva está pendiente de aprobación. Te avisaremos en cuanto se confirme.</p>
                </div>
                <button onClick={closeBooking}
                  className={BOTON_SECUNDARIO}>
                  Cerrar
                </button>
              </div>
            )}

            {/* ── LOGIN (magic link) ── */}
            {loginStep === 'login' && (
              <div className="paso-anim">
                {!enlaceEnviado ? (
                  <>
                    <h2 className="text-[var(--portal-ink)] font-[var(--font-display),Georgia,serif] font-normal text-lg mb-1">Entra para reservar</h2>
                    <p className="text-[var(--portal-muted-2)] text-sm mb-5">
                      Escribe tu contraseña si ya la tienes, o solo tu email y te enviamos un enlace de acceso.
                    </p>
                    <input type="email"
                      placeholder="Tu email"
                      value={loginForm.email}
                      onChange={e => { setLoginForm(f => ({ ...f, email: e.target.value })); setLoginError(''); }}
                      onKeyDown={e => e.key === 'Enter' && handleContinuarAcceso()}
                      autoFocus
                      className="w-full rounded-xl px-4 py-3 text-base text-[var(--portal-ink)] placeholder:text-[var(--portal-muted)] outline-none border border-[var(--portal-line)] focus:border-[var(--portal-ink)] transition-colors mb-3"
                      style={{ backgroundColor: 'var(--portal-surface-2)' }} />
                    <input type="password"
                      placeholder="Tu contraseña (si la tienes)"
                      value={loginPassword}
                      onChange={e => { setLoginPassword(e.target.value); setLoginError(''); }}
                      onKeyDown={e => e.key === 'Enter' && handleContinuarAcceso()}
                      autoComplete="current-password"
                      className="w-full rounded-xl px-4 py-3 text-base text-[var(--portal-ink)] placeholder:text-[var(--portal-muted)] outline-none border border-[var(--portal-line)] focus:border-[var(--portal-ink)] transition-colors mb-3"
                      style={{ backgroundColor: 'var(--portal-surface-2)' }} />
                    {loginError && <p className="text-destructive text-sm mb-3">{loginError}</p>}
                    {/* Sin margen propio: mide 0 px salvo que Cloudflare pida
                        resolver algo a mano. El CTA vive en el `footer` de
                        `PublicSheet`, anclado abajo del sheet. */}
                    {captcha}
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

            {/* ── PANTALLA DE RESERVA (Fase 2 del rediseño) ──
                "Datos"+"pago" del flujo "pagar y reservar sin login previo"
                fusionados en una sola pantalla continua (docs/rediseno-
                pantalla-reserva-diseno.md) — sin el "‹ Datos"/"‹ Pago" de
                antes, sin sensación de wizard. Toda la lógica (validación,
                POST a checkout-embebido, Stripe) es la MISMA de siempre; lo
                único que cambia es la presentación. */}
            {esPantallaReserva && bookingSesion && datosPlan && (
              <PantallaReserva
                t={tokensCalendario}
                onVolver={closeBooking}
                estudioNombre={estudioNombre}
                estudioDireccion={estudioDireccion}
                studioId={studio?.id ?? ''}
                clase={{
                  nombre: bookingSesion.tipo?.nombre ?? '',
                  color: bookingSesion.tipo?.color ?? PRIMARY,
                  fotoUrl: bookingSesion.tipo?.fotoUrl ?? null,
                  descripcion: bookingSesion.tipo?.descripcion ?? null,
                  inicio: bookingSesion.inicio,
                  fin: bookingSesion.fin,
                  duracionMinutos: bookingSesion.tipo?.duracionMinutos ?? null,
                  instructorNombre: bookingSesion.instructor?.nombre ?? null,
                  salaNombre: bookingSesion.sala?.nombre ?? null,
                  nivel: bookingSesion.tipo?.nivel ? NIVEL_LABEL[bookingSesion.tipo.nivel] : null,
                  plazasLibres: Math.max(0, bookingSesion.aforoMaximo - bookingSesion.ocupadas),
                }}
                precio={datosPlan.precio}
                fase={loginStep === 'pago' ? 'pago' : 'datos'}
                loginForm={loginForm}
                onChangeLoginForm={patch => { setLoginForm(f => ({ ...f, ...patch })); if (patch.email !== undefined) setDatosError(''); }}
                datosError={datosError}
                datosCargando={datosCargando}
                privacidadAceptada={privacidadAceptada}
                onTogglePrivacidad={setPrivacidadAceptada}
                onAbrirPrivacidad={() => setLegalDoc({ label: 'Política de privacidad', text: studioConfig.politicaPrivacidad })}
                mostrarCodigo={mostrarCodigo}
                onMostrarCodigo={() => setMostrarCodigo(true)}
                codigoDescuento={codigoDescuento}
                onChangeCodigo={setCodigoDescuento}
                onContinuar={handleDatosContinuar}
                // "Bonos y mensualidades del estudio" — diseño "Tentare Portal
                // Reservas": SIEMPRE visible cuando hay al menos un plan PUNTUAL
                // que cubre la clase (aunque sea uno solo, "Clase suelta" a su
                // propio precio) — confirma explícitamente qué se está pagando,
                // igual que el mockup de referencia.
                planesOpciones={(() => {
                  const opciones = planesClaseSueltaPara(bookingSesion.tipoClaseId, planesTarifa);
                  return opciones.length > 0 ? opciones : undefined;
                })()}
                planSeleccionadoId={datosPlan.id}
                onCambiarPlan={setDatosPlan}
                // "Elige tu plaza" — mismo criterio que la pantalla 'confirm' de
                // socia autenticada: solo si la sala tiene mapa de sitios y la
                // clase no está llena (lista de espera no ocupa sitio).
                spotPicker={(() => {
                  const spotsSala = spots.filter(s => s.salaId === bookingSesion.salaId && s.activo);
                  const lleno = bookingSesion.ocupadas >= bookingSesion.aforoMaximo;
                  if (spotsSala.length === 0 || lleno) return undefined;
                  const takenIds = new Set(
                    reservas
                      .filter(r => r.sesionId === bookingSesion.id && (r.estado === 'CONFIRMADA' || r.estado === 'ASISTIDA') && r.spotId)
                      .map(r => r.spotId as string),
                  );
                  return { spots: spotsSala, takenIds, selected: selectedSpot, onSelect: setSelectedSpot, primary: PRIMARY };
                })()}
                infoAdicional={datosInfoAdicional}
                onChangeInfoAdicional={patch => setDatosInfoAdicional(f => ({ ...f, ...patch }))}
                pago={loginStep === 'pago' && datosClientSecret && studio?.stripeAccountId && STRIPE_PUBLISHABLE_KEY ? {
                  plan: datosPlan,
                  clientSecret: datosClientSecret,
                  publishableKey: STRIPE_PUBLISHABLE_KEY,
                  stripeAccountId: studio.stripeAccountId,
                  // Misma cifra honesta que ya usa el paso 'confirm' — no la
                  // fija del estudio a secas, la de SU tipo de clase si tiene
                  // override.
                  ventanaCancelacionHoras: bookingSesion.tipo?.ventanaCancelacionHoras ?? studio?.cancelacionVentanaHoras ?? 0,
                  // El importe nunca detrás de la flecha: "→ 1 €" se leía
                  // como "-1 €" (queja literal del fundador).
                  textoBoton: `Pagar ${datosPlan.precio} € y reservar`,
                  // La fuente REAL del widget para dentro del iframe de Stripe
                  // (appearance no resuelve var(--font-ui)); sin fuente
                  // personalizada, el componente cae a Instrument Sans.
                  fuentePago: apariencia.fuente && cssFuente ? { familia: apariencia.fuente, cssSrc: cssFuente } : undefined,
                  // El radio de input del Widget Builder, para que los campos
                  // de la tarjeta (iframe de Stripe) redondeen igual que los
                  // inputs del paso 'datos'. Mismos defaults que
                  // `resolverTokensReservar`.
                  radioInput: radiosDe(apariencia, { tarjeta: R.card, boton: R.pill, input: R.spot }).input,
                  onExito: handlePagoExitoso,
                  onVolverADatos: () => setLoginStep('datos'),
                } : undefined}
              />
            )}

            {/* ── REGISTRO (walk-in ya autenticado: nombre) ── */}
            {loginStep === 'registro' && (
              <div className="paso-anim">
                <div className="mb-3"><IndicadorPasos recorrido={recorridoDe('registro')!} /></div>
                <h2 className="text-[var(--portal-ink)] font-[var(--font-display),Georgia,serif] font-normal text-lg mb-1">¿Cómo te llamas?</h2>
                <p className="text-[var(--portal-muted-2)] text-sm mb-5">Completa tus datos para tu primera reserva — el estudio los usará para avisarte de cualquier cambio en tus clases.</p>
                <input type="text"
                  placeholder="Tu nombre completo"
                  value={loginForm.nombre}
                  onChange={e => setLoginForm(f => ({ ...f, nombre: e.target.value }))}
                  autoFocus
                  className="w-full rounded-xl px-4 py-3 text-base text-[var(--portal-ink)] placeholder:text-[var(--portal-muted)] outline-none border border-[var(--portal-line)] focus:border-[var(--portal-ink)] transition-colors mb-3"
                  style={{ backgroundColor: 'var(--portal-surface-2)' }} />
                <input type="tel"
                  placeholder="Tu teléfono (+34 600 000 000)"
                  value={loginForm.telefono}
                  onChange={e => setLoginForm(f => ({ ...f, telefono: e.target.value }))}
                  onKeyDown={e => e.key === 'Enter' && handleRegistroNombre()}
                  className="w-full rounded-xl px-4 py-3 text-base text-[var(--portal-ink)] placeholder:text-[var(--portal-muted)] outline-none border border-[var(--portal-line)] focus:border-[var(--portal-ink)] transition-colors mb-1"
                  style={{ backgroundColor: 'var(--portal-surface-2)' }} />
                {loginError && <p className="text-destructive text-sm mb-3">{loginError}</p>}
                <p className="text-[11px] text-[var(--portal-muted)]">El teléfono solo lo usa {estudioNombre} para avisos de tus clases.</p>
                {/* El CTA vive en el `footer` de `PublicSheet`, anclado abajo. */}
              </div>
            )}

            {/* ── CONTRATO (aceptación clickwrap) ── */}
            {loginStep === 'contrato' && (
              <div className="paso-anim">
                <div className="mb-3"><IndicadorPasos recorrido={recorridoDe('contrato')!} /></div>
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
                    className={`${BOTON_SECUNDARIO} flex-1`}>
                    Volver
                  </button>
                  <button onClick={handleSignContract} disabled={!terminosAceptados || firmando}
                    className={`${BOTON_PRIMARIO} flex-[2]`}
                    style={{ backgroundColor: PRIMARY }}>
                    {firmando ? 'Guardando…' : 'Aceptar y continuar →'}
                  </button>
                </div>
              </div>
            )}

            {/* ── CONFIRM ── */}
            {loginStep === 'confirm' && bookingSesion && (
              <div className="paso-anim">
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
                  className={BOTON_PRIMARIO}
                  style={{ backgroundColor: PRIMARY }}>
                  {confirmando
                    ? 'Un momento…'
                    // Fase 8 (CRO): el botón dice lo que de verdad va a pasar —
                    // "nunca automático" también significa que el texto no
                    // puede prometer una plaza confirmada cuando en realidad
                    // apunta a lista de espera. Ver docs/cro-analytics-widget-diseno.md §5.3.
                    : bookingSesion.ocupadas >= bookingSesion.aforoMaximo
                      ? 'Avísame si se libera un hueco'
                      : 'Confirmar reserva'}
                </button>
              </div>
            )}
          </>
        )}
      </PublicSheet>

      {/* La confirmación de cancelar una plaza ya no es un modal aparte — Fase
          4 del rediseño la puso inline, bajo la fila, dentro de la tab "Mis
          reservas" (docs/widget-reservas-fase4-brief-diseno.md). */}

      {/* ── MODAL DOCUMENTO LEGAL ────────────────────────────────────────────── */}
      <PublicSheet
        open={legalDoc !== null}
        onClose={() => setLegalDoc(null)}
        label={legalDoc?.label ?? 'Documento legal'}
        sheetClassName="bg-white w-full max-w-lg rounded-t-3xl sm:rounded-3xl relative shadow-2xl flex flex-col"
        // P0-3: mismo criterio que el modal de reserva de arriba.
        sheetStyle={{ maxHeight: embedMode ? (franjaVisible ? '100%' : 'min(85vh, 640px)') : '85vh' }}
        overlayStyle={overlayEmbed}
        overlayClassName="reserva-modal-edge"
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
    </>
  );
}
