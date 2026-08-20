'use client';
import { aFechaCal, eventoIcs, nombreIcs } from '@/lib/calendario-ics';
import { queImparten } from '@/lib/equipo';

import { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import dynamic from 'next/dynamic';
import { useSearchParams, useParams, useRouter } from 'next/navigation';
import { useStudio, type ResultadoReserva } from '@/lib/studio-context';
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
import { claseSirvePara } from '@/lib/reservar/objetivos';
import { cifrasVisibles, mereceBanda } from '@/lib/reservar/cifras';
import { seccionReservarDeSistemaId, CAMPOS_RESERVAR_HORARIO } from '@/lib/portal-home-bloques';
import { resolverConfig } from '@/lib/theme/campos.ts';
import { BloqueReservarRender } from '@/components/reservar/bloque-reservar-render';
import { resolverApariencia, fondoCss, familiaCss, urlFuente, modoTextoDe, luminancia } from '@/lib/reservar/apariencia-widget';
import { resolverConfigWidget } from '@/lib/reservar/config-widget';
import { varsPaletaModo } from '@/lib/portal-paleta';
import { MODO_TOKENS } from '@/lib/portal-modo';
import { semantic } from '@/lib/portal-tokens';
import { useCaptcha, ERROR_CAPTCHA } from '@/components/auth/turnstile-widget';
import { horarioPublico, precioPorClase } from '@/lib/estudio-publico';
import { ahorroPorcentaje } from '@/lib/reservar/ahorro-plan';
import { trackEventoWidget } from '@/lib/reservar/eventos';
import { serif, sans, cq, radius as R, shadow as SH, eyebrow, containerRoot } from '@/lib/reservar-publico-tokens';
import { resolverHrefBloque } from '@/lib/portal-home-bloques';
import { imagenDeEstudio, alFallarImagen, IMAGENES_POR_DEFECTO } from '@/lib/imagenes-por-defecto';
import { CheckoutEmbebido } from '@/components/checkout-widget/checkout-embebido';
import { LogoTentare } from '@/components/marca/logo-tentare';
import { FichaClaseUnica } from '@/components/reserva/ficha-clase-unica';
import {
  Users, CheckCircle2, X, Calendar, Clock, MapPin,
  CreditCard, FileText, Download, ExternalLink, Mail, ChevronLeft,
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
      {/* Celdas compactas de tamaño fijo acotado y centradas (feedback del
          fundador: «los sitios son muy grandes»), mismo criterio que el
          SpotPicker del calendario compartido. */}
      <div className="grid gap-1.5 justify-center" style={{ gridTemplateColumns: `repeat(${columnas.length}, minmax(30px, 48px))` }}>
        {filas.map(f => columnas.map(c => {
          const spot = spots.find(s => s.fila === f && s.columna === c);
          if (!spot) return <div key={`${f}-${c}`} />;
          const taken = takenIds.has(spot.id);
          const isSel = selected === spot.id;
          return (
            <button key={spot.id} type="button" disabled={taken}
              onClick={() => onSelect(isSel ? null : spot.id)}
              title={taken ? 'Ocupado' : spot.nombre}
              className="aspect-square rounded-[10px] border text-[10px] font-bold flex items-center justify-center transition-all disabled:cursor-not-allowed"
              style={taken
                ? { backgroundColor: 'var(--portal-surface-2)', borderColor: 'var(--portal-line)', color: 'var(--portal-micro)' }
                : isSel
                ? { backgroundColor: primary, borderColor: primary, color: 'var(--portal-surface)' }
                : { backgroundColor: 'var(--portal-surface)', borderColor: 'var(--portal-line)', color: 'var(--portal-ink)' }}>
              {spot.nombre}
            </button>
          );
        }))}
      </div>
    </div>
  );
}

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

// Criterios de estado (mismos que el portal): qué reservas ocupan plaza y cuáles
// cuentan como reserva activa de la propia socia.
const OCUPA_PLAZA: Reserva['estado'][] = ['CONFIRMADA', 'ASISTIDA'];
const RESERVA_ACTIVA: Reserva['estado'][] = ['CONFIRMADA', 'LISTA_ESPERA'];

// Tema del calendario compartido para el widget PÚBLICO: reutiliza el tema claro
// del portal (MODO_TOKENS.dia), que ya casa con el lenguaje visual de /reservar
// (fondo hueso, tarjetas blancas, marca --portal-brand). Fuera del componente
// para no recrearlo en cada render.
//
// ⚠️ **Solo queda `RT.hero` aquí, y a propósito.** El resto de tokens de esta
// página se leen por variable CSS (`var(--portal-…)`) y no por este objeto: al
// incrustar el widget sobre una web oscura, la raíz recibe la paleta de NOCHE en
// línea, y un token de JS fijado a `dia` a nivel de módulo NO se entera — las
// tarjetas se quedaban blancas con letra clara encima. El degradado del hero es
// la excepción legítima: solo se pinta fuera del modo incrustado.
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
    planesTarifa, suscripciones, studioConfig, studio, redesSociales, dataLoaded, errorPublico, recargarPublico,
    addReserva, updateSocio, cancelarReserva, aceptarOfertaEspera, addSocioFromPortal, planMasElegidoId, sustitucionesConfirmadas, textosReservar, bloquesReservar,
    aparienciaWidget,
    citasServicios, citasDisponibilidad, citas, reservarCitaPublica, cancelarCita,
  } = useStudio();

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
    () => (embedMode && modoTextoDe(apariencia) === 'noche' ? varsPaletaModo('noche') : null),
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
    () => (embedMode && modoTextoDe(apariencia) === 'noche' ? MODO_TOKENS.noche : RESERVAR_TOKENS),
    [embedMode, apariencia],
  );
  // Widget incrustado sobre una web oscura. Se saca a su propia constante
  // porque lo necesita algo más que los tokens del calendario — ver el aviso de
  // error del checkout, más abajo.
  const esNoche = embedMode && modoTextoDe(apariencia) === 'noche';
  const fuenteWidget = familiaCss(apariencia);
  const cssFuente = urlFuente(apariencia);

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
  const [filtroInstructor] = useState('');
  const [filtroSala] = useState('');
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
  const [loginForm, setLoginForm] = useState({ nombre: '', apellidos: '', email: '', telefono: '' });
  const [loginStep, setLoginStep] = useState<Step>('login');
  // "Pagar y reservar sin login previo" (docs/reserva-sin-login-diseno.md §3/§4).
  const [datosPlan, setDatosPlan] = useState<PlanTarifa | null>(null);
  const [datosClientSecret, setDatosClientSecret] = useState<string | null>(null);
  const [datosError, setDatosError] = useState('');
  const [datosCargando, setDatosCargando] = useState(false);
  // Marca que la pantalla 'done' llegó vía este camino (pago sin login), para
  // mostrar la mención de "hemos creado tu cuenta" en vez del copy genérico.
  const [pagoWebSinLogin, setPagoWebSinLogin] = useState(false);
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
  const overlayEmbebidoAbiertoRef = useRef(false);
  const [fichaCalendarioAbierta, setFichaCalendarioAbierta] = useState(false);
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
      // Solo re-render con un overlay abierto que la use: el host manda un
      // mensaje por frame de scroll y esta página es grande. Mantenerla viva
      // mientras el overlay está abierto es a propósito — si el usuario
      // scrollea el host con el modal abierto, el modal le sigue.
      if (overlayEmbebidoAbiertoRef.current) setFranjaVisible(franja);
    };
    window.addEventListener('message', onMsg);
    return () => window.removeEventListener('message', onMsg);
  }, [embedMode]);
  // Al abrir cualquier overlay embebido: congela la última franja conocida en
  // estado (para posicionarlo ya en este render) y, si no hay franja útil
  // (snippet viejo, o el iframe casi fuera de pantalla), pide al host que
  // traiga el iframe a la vista. Con el snippet nuevo, el scroll que provoca
  // dispara mensajes nuevos y el overlay se recoloca solo.
  const overlayEmbebidoAbierto = embedMode && (fichaCalendarioAbierta || bookingSesionId !== null || legalDoc !== null);
  useEffect(() => {
    overlayEmbebidoAbiertoRef.current = overlayEmbebidoAbierto;
    if (!overlayEmbebidoAbierto || typeof window === 'undefined' || window.parent === window) return;
    // Copia puntual de la última franja recibida (vive en un ref para no
    // re-renderizar la página en cada frame de scroll del host).
    setFranjaVisible(franjaRef.current);
    if (!franjaRef.current || franjaRef.current.height < 320) {
      window.parent.postMessage({ tentareScrollTo: true, tentareSlug: slug }, '*');
    }
  }, [overlayEmbebidoAbierto, slug]);
  // Callback estable para el calendario (su efecto interno lo lleva en deps).
  const alCambiarFicha = useCallback((abierta: boolean) => setFichaCalendarioAbierta(abierta), []);
  // Posicionamiento que se pasa a los PublicSheet en modo embebido. `top`/
  // `height` + `bottom: auto` pisan el `inset-0` de la clase; `alignItems`
  // pisa `items-end sm:items-center` (ese `sm:` mide el ancho del IFRAME, no
  // de la pantalla real — con un iframe estrecho anclaba SIEMPRE al fondo).
  const overlayEmbed = embedMode
    ? (franjaVisible
      ? { top: franjaVisible.top, height: franjaVisible.height, bottom: 'auto', alignItems: 'center' } as const
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
  // Fase 4 del rediseño (docs/widget-reservas-fase4-brief-diseno.md, formato
  // 05 "Reserva esta clase"): un enlace directo a `?sesion=` ya no salta
  // recto a la hoja de reserva — aterriza primero en una ficha-resumen de ESA
  // clase (fecha/hora/instructora/plazas + precio), sin selector para
  // cambiarla (respuesta 4 del brief). "Reservar mi plaza" es lo que abre la
  // hoja de siempre.
  const [fichaSesionId, setFichaSesionId] = useState<string | null>(null);
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
    return planes.find(p => p.activo && p.tipo === 'PUNTUAL'
      && (!p.tiposClaseIds || p.tiposClaseIds.length === 0 || (!!tipoClaseId && p.tiposClaseIds.includes(tipoClaseId)))) ?? null;
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
    if (!loginForm.nombre.trim() || !loginForm.apellidos.trim() || !loginForm.email.trim() || !telefonoValido(loginForm.telefono)) return;
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
          socioNombre: `${loginForm.nombre.trim()} ${loginForm.apellidos.trim()}`.trim(),
          // Antes se validaba y se TIRABA: la ficha que crea el webhook
          // quedaba sin teléfono aunque la persona lo acabara de escribir.
          socioTelefono: loginForm.telefono.trim(),
          origenLead: searchParams.get('ref') ?? null,
          codigoDescuento: codigoDescuento.trim() || undefined,
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
    setLoginStep('done');
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
    if (bookingSesionId) {
      setLoginStep('confirm');
      trackEventoWidget(studio?.id, 'class_detail_viewed', { sesionClaseId: bookingSesionId });
    } else {
      closeBooking();
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
    <div style={{
      ...containerRoot, width: '100%', minHeight: '100vh',
      // `transparent` deja ver el fondo de la web anfitriona. Era el problema
      // gordo: un `#F6F7F9` opaco es una losa casi blanca sobre una web oscura.
      background: fondoCss(apariencia) ?? 'var(--portal-bg)',
      color: 'var(--portal-ink)',
      fontFamily: fuenteWidget ?? sans,
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
            Lo que desaparece con `soloPestana` son los botones de dentro. */}
        <div id="horario" style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: cq(18, 3.4, 42), borderBottom: '1px solid rgba(34,38,31,.12)', marginTop: embedMode ? cq(16, 1.6, 20) : cq(28, 3.6, 46), overflowX: 'auto', padding: `0 ${cq(20, 3.8, 48)}` }}>
          {/* Un widget embebido es 1 propósito, no un portal en miniatura:
              en `embedMode` se enseña SIEMPRE únicamente la pestaña que pidió
              `?tab=`, sin barra — quien incrusta «Horario y reserva de
              clases» no espera que su visitante se vaya a «El estudio»
              dentro de un recuadro de su propia web. `solo-pestana=1` en la
              URL sigue aceptándose (snippets ya pegados no cambian) pero ya
              no hace falta: fuera de `embedMode` (la página completa
              /reservar/[slug]) la barra se ve entera como siempre. */}
          {((embedMode || apariencia.soloPestana) ? tabs.filter(([t]) => t === tab) : tabs).map(([t, label]) => (
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
          <div style={{ maxWidth: 760, marginInline: 'auto', width: '100%', padding: `${cq(28, 3.4, 44)} 0 ${cq(50, 7, 90)}` }}>

            {/* Título + mes — formato 01 del handoff
                (design_handoff_widget_reservas/Tentare Widget.dc.html). */}
            <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 10 }}>
              <h2 style={{ fontFamily: serif, fontSize: cq(30, 7, 38), lineHeight: 1 }}>Clases</h2>
              <span style={{ fontSize: 12, color: 'var(--portal-muted)', paddingBottom: 4 }}>
                {/* Primera letra a mano, no `textTransform:capitalize`:
                    ese pone mayúscula en CADA palabra ("Agosto De 2026"),
                    y en español solo el mes va en mayúscula al empezar
                    frase — "de" se queda en minúscula. */}
                {(() => {
                  const s = now.toLocaleDateString('es-ES', { month: 'long', year: 'numeric' });
                  return s.charAt(0).toUpperCase() + s.slice(1);
                })()}
              </span>
            </div>

            {/* Chips de filtro por tipo de clase, en línea — mismo patrón que
                el handoff: `PRIMARY`/`transparent`, nunca `--portal-surface`
                como relleno del no-seleccionado (ese token es blanco en modo
                día, y un fondo claro fijo pintado sobre una web oscura es
                justo lo que reservar-acoplar-widget.spec.ts vigila). */}
            {tiposClaseVisibles.length > 0 && (
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 18 }} role="group" aria-label="Filtrar por tipo de clase">
                <button type="button" onClick={() => setFiltroTipo('')} aria-pressed={filtroTipo === ''} style={{
                  padding: '8px 14px', borderRadius: 999, fontSize: 12.5, fontWeight: 700, cursor: 'pointer', border: '1px solid transparent',
                  background: filtroTipo === '' ? PRIMARY : 'transparent',
                  color: filtroTipo === '' ? PRIMARY_FG : 'var(--portal-muted)',
                  borderColor: filtroTipo === '' ? 'transparent' : 'var(--portal-line)',
                }}>
                  Todas
                </button>
                {tiposClaseVisibles.map(t => (
                  <button key={t.id} type="button" onClick={() => setFiltroTipo(t.id)} aria-pressed={filtroTipo === t.id} style={{
                    padding: '8px 14px', borderRadius: 999, fontSize: 12.5, fontWeight: 700, cursor: 'pointer', border: '1px solid transparent',
                    background: filtroTipo === t.id ? PRIMARY : 'transparent',
                    color: filtroTipo === t.id ? PRIMARY_FG : 'var(--portal-muted)',
                    borderColor: filtroTipo === t.id ? 'transparent' : 'var(--portal-line)',
                  }}>
                    {t.nombre}
                  </button>
                ))}
              </div>
            )}

            {/* Calendario de reservas — componente compartido (estilo Acuity), el
                mismo que usa el portal de socias, re-vestido con el lenguaje
                visual de esta pantalla (ver reserva-calendario.tsx). La reserva
                se enruta por handleReservarCalendario, que respeta el
                step-machine de acceso.
                ⚠️ Único caller de Modo A que activa `estiloDias='dias'` (tira de
                10 días con scroll) — el portal privado sigue en 'semana'. */}
            <div style={{ marginTop: 20 }}>
              <ReservaCalendario
                t={tokensCalendario}
                slots={slots}
                variant="calendario"
                // `?diseno=ligero` (snippet, solo llega con embed=1) cambia a
                // la rejilla compacta del bundle; el default sigue siendo la
                // tira de 10 días.
                estiloDias={configWidget?.diseno === 'ligero' ? 'grid' : 'dias'}
                vistaInicial={configWidget?.vistaInicial ?? 'todo'}
                ocultarPrecio={configWidget?.ocultarPrecio ?? false}
                ocultarNivel={configWidget?.ocultarNivel ?? false}
                ocultarSustituta={configWidget?.ocultarSustituta ?? false}
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
              />
            </div>

            {/* Restaurado tras romper e2e/reservar-ventana-por-tipo.spec.ts: no
                es copy decorativa, es el aviso honesto de cancelación/antelación
                por TIPO DE CLASE (frasePlazoCancelacion y compañía,
                lib/reservar/promesas.ts) — quitarlo del todo habría reabierto un
                bug ya cerrado. El handoff (design_handoff_widget_reservas) no
                trae esta caja porque ese plazo lo enseña en la hoja de detalle
                de cada clase (SlotRow → BookingSheet) — pero el tope de
                ANTELACIÓN MÁXIMA solo se anuncia aquí, así que se queda, ahora
                en columna única bajo la lista en vez de en un rail lateral. */}
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
          </div>
        )}

        {/* ── TAB: CITAS 1:1 ──────────────────────────────────────────────── */}
        {/* Sin cabecera propia aquí: CitasPublica ya pinta "Citas" + el
            subtítulo (calcando design_handoff_widget_reservas) tanto con
            servicios configurados como en su estado vacío — una cabecera
            aparte aquí quedaba duplicada en el primer caso y con el título
            equivocado ("Citas privadas") en el segundo. */}
        {tab === 'citas' && (
          <div style={{ padding: `${cq(28, 3.4, 44)} 0 ${cq(50, 7, 90)}` }}>
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
        )}

        {/* ── TAB: MIS RESERVAS ───────────────────────────────────────────── */}
        {tab === 'misreservas' && (
          <div style={{ padding: `${cq(28, 3.4, 44)} 0 ${cq(50, 7, 90)}` }}>
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
                  <button onClick={() => { setBookingSesionId(''); setLoginStep('login'); }}
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
                    <button onClick={() => setTab('clases')} style={{
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
          </div>
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
                        <img src={i.fotoUrl} alt={i.nombre} style={{ width: 46, height: 46, borderRadius: 999, objectFit: 'cover', marginInline: 'auto' }} />
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
                <button onClick={() => { setBookingSesionId(''); setLoginStep('login'); }}
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
            de marca conviviendo a un clic de distancia. */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7, padding: `${cq(2, 0.6, 8)} 0 16px`, color: 'var(--portal-muted)', fontSize: 11 }}>
          Reservas seguras con
          <LogoTentare formato="horizontal" tinta={esNoche ? 'blanco' : 'tinta'} alto={16} decorativo />
        </div>
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
      {seccionVisible('bonos') && planesContratables.length > 0 && (
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
      {seccionVisible('sobre') && textosReservar.sobreTexto && (
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

      {seccionVisible('cifras') && mereceBanda(cifras) && (
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
      {!apariencia.ocultarPie && seccionVisible('contacto') && (
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
          loginStep === 'done' ? (pagoWebSinLogin ? '¡Pago recibido!' : (textosReservar.confirmacion || '¡Reserva confirmada!'))
          : loginStep === 'espera' ? '¡En lista de espera!'
          : loginStep === 'pendiente' ? 'Pendiente de aprobación'
          : loginStep === 'login' ? (enlaceEnviado ? 'Revisa tu email' : 'Entra para reservar')
          : loginStep === 'datos' ? 'Tus datos'
          : loginStep === 'pago' ? 'Pagar y reservar'
          : loginStep === 'registro' ? '¿Cómo te llamas?'
          : loginStep === 'contrato' ? 'Acepta los términos'
          : 'Confirmar reserva'
        }
        // "Datos"/"pago" calcan el asistente de 2 pasos del prototipo real
        // (Claude Design, no la copia local desfasada del handoff) — ese
        // asistente es más ancho que el resto de pasos de este modal (login,
        // confirmar, etc.), así que la hoja crece solo para esos dos.
        sheetClassName={`bg-white w-full ${loginStep === 'datos' || loginStep === 'pago' ? 'max-w-lg' : 'max-w-sm'} rounded-3xl p-6 relative shadow-2xl`}
        // P0-3: en el iframe embebido, `90vh` es el 90% del IFRAME entero (que
        // mide lo que su contenido) — el modal se anclaba junto al pie de la
        // web del estudio, a ~1000px de la vista del usuario (medido). Con
        // franja, el modal vive DENTRO de ella (maxHeight al 100% de la franja,
        // menos el p-4 del backdrop); sin franja, tope fijo razonable.
        sheetStyle={{
          maxHeight: embedMode ? (franjaVisible ? '100%' : 'min(90vh, 640px)') : '90vh',
          overflowY: 'auto',
        }}
        overlayStyle={overlayEmbed}
      >
        {bookingSesionId !== null && (
          <>
            {/* "Datos"/"pago" llevan su propio "‹ atrás" arriba del contenido
                (mismo patrón que el prototipo: "‹ Clases" / "‹ Datos"), así
                que ahí no hace falta la X flotante — evita dos controles de
                cierre a la vez. */}
            {loginStep !== 'datos' && loginStep !== 'pago' && (
              <button onClick={closeBooking} aria-label="Cerrar"
                className="absolute top-4 right-4 text-[var(--portal-muted)] hover:text-[var(--portal-ink)] transition-colors">
                <X size={18} />
              </button>
            )}

            {/* ── DONE ── */}
            {loginStep === 'done' && bookingSesion && (
              <div className="flex flex-col items-center text-center gap-4 contenido-anim">
                <div className="w-16 h-16 rounded-full flex items-center justify-center" style={{ backgroundColor: '#D1FAE5' }}>
                  <CheckCircle2 size={30} style={{ color: '#2F6B4F' }} />
                </div>
                <div>
                  <p className="text-[var(--portal-ink)] font-extrabold text-xl">
                    {pagoWebSinLogin ? '¡Pago recibido!' : (textosReservar.confirmacion || '¡Reserva confirmada!')}
                  </p>
                  <p className="text-[var(--portal-muted-2)] text-sm mt-1">
                    {bookingSesion.tipo?.nombre} · {fmtLong(new Date(bookingSesion.inicio))} a las {fmtTime(bookingSesion.inicio)}
                  </p>
                </div>
                {pagoWebSinLogin && (
                  <div className="w-full rounded-2xl p-3.5 text-left bg-[var(--portal-surface-2)] border border-[var(--portal-line)]">
                    {/* Copy honesto (P0): la reserva y la cuenta las crea el
                        WEBHOOK después del pago — aquí solo consta el cobro.
                        No se da la plaza por hecha ni la cuenta por creada:
                        se dice lo único cierto, que estamos en ello. */}
                    <p className="text-[var(--portal-ink)] text-sm">
                      Estamos confirmando tu plaza. En un momento te llegará a{' '}
                      <span className="font-semibold">{loginForm.email}</span> el email de
                      confirmación con el acceso a tu cuenta.
                    </p>
                  </div>
                )}
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
                  <p className="text-[var(--portal-muted-2)] text-sm mt-1">{textosReservar.listaEspera || 'Si se libera una plaza, te avisaremos por email.'}</p>
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
                      Escribe tu contraseña si ya la tienes, o solo tu email y te enviamos un enlace de acceso.
                    </p>
                    <input type="email"
                      placeholder="Tu email"
                      value={loginForm.email}
                      onChange={e => { setLoginForm(f => ({ ...f, email: e.target.value })); setLoginError(''); }}
                      onKeyDown={e => e.key === 'Enter' && handleContinuarAcceso()}
                      autoFocus
                      className="w-full rounded-xl px-4 py-3 text-sm text-[var(--portal-ink)] placeholder:text-[var(--portal-muted)] outline-none border border-[var(--portal-line)] focus:border-[var(--portal-ink)] transition-colors mb-3"
                      style={{ backgroundColor: 'var(--portal-surface-2)' }} />
                    <input type="password"
                      placeholder="Tu contraseña (si la tienes)"
                      value={loginPassword}
                      onChange={e => { setLoginPassword(e.target.value); setLoginError(''); }}
                      onKeyDown={e => e.key === 'Enter' && handleContinuarAcceso()}
                      autoComplete="current-password"
                      className="w-full rounded-xl px-4 py-3 text-sm text-[var(--portal-ink)] placeholder:text-[var(--portal-muted)] outline-none border border-[var(--portal-line)] focus:border-[var(--portal-ink)] transition-colors mb-3"
                      style={{ backgroundColor: 'var(--portal-surface-2)' }} />
                    {loginError && <p className="text-destructive text-sm mb-3">{loginError}</p>}
                    {/* Sin margen propio: mide 0 px salvo que Cloudflare pida
                        resolver algo a mano. */}
                    {captcha}
                    <button onClick={handleContinuarAcceso} disabled={!loginForm.email || enviandoEnlace || enviandoLoginPassword}
                      className="w-full py-3 rounded-2xl font-bold text-white transition-all disabled:opacity-40"
                      style={{ backgroundColor: PRIMARY }}>
                      {enviandoLoginPassword ? 'Entrando…' : enviandoEnlace ? 'Enviando…' : loginPassword.trim() ? 'Iniciar sesión →' : 'Continuar →'}
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

            {/* ── DATOS (pagar y reservar sin login previo) ──
                Fase 2 del rediseño (docs/widget-reservas-theme-builder-diseno.md,
                pantalla 03): resumen con precio a la derecha + eyebrow de paso.
                Nuestro flujo son 2 pasos (datos → pago), no los 3 del handoff
                (que incluye login/registro separado) — se rotula honesto a lo
                que este camino realmente tiene. */}
            {loginStep === 'datos' && bookingSesion && datosPlan && (
              <div className="contenido-anim">
                <div className="flex items-center justify-between mb-3">
                  <button type="button" onClick={closeBooking}
                    className="inline-flex items-center gap-1 text-[13px] font-semibold text-[var(--portal-muted)] hover:text-[var(--portal-ink)] transition-colors">
                    <ChevronLeft size={13} strokeWidth={2.5} />Clases
                  </button>
                  <p className="text-[10.5px] font-bold tracking-[0.14em] text-[var(--portal-muted)] uppercase">Paso 1 de 2</p>
                </div>
                {/* Rediseño del popup (referencia Momence móvil, orden pedido
                    por el fundador): foto de la clase, título, fecha + hora +
                    duración, ubicación, descripción completa — y debajo los
                    datos y el pago. */}
                {bookingSesion.tipo?.fotoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element -- foto subida por el estudio, no un asset conocido en build
                  <img src={bookingSesion.tipo.fotoUrl} alt="" loading="lazy" decoding="async"
                    className="w-full h-36 object-cover rounded-2xl mb-4" />
                ) : (
                  <div aria-hidden="true" className="w-full h-24 rounded-2xl mb-4 flex items-center justify-center"
                    style={{ background: `linear-gradient(135deg, color-mix(in srgb, ${bookingSesion.tipo?.color ?? PRIMARY} 55%, #fff) 0%, ${bookingSesion.tipo?.color ?? PRIMARY} 100%)` }}>
                    <span className="font-[var(--font-display),Georgia,serif] text-4xl" style={{ color: 'rgba(255,255,255,0.92)' }}>
                      {(bookingSesion.tipo?.nombre ?? 'C').charAt(0).toUpperCase()}
                    </span>
                  </div>
                )}
                <div className="flex items-start justify-between gap-3 mb-3">
                  <h2 className="text-[var(--portal-ink)] font-[var(--font-display),Georgia,serif] font-normal text-2xl leading-tight">
                    {bookingSesion.tipo?.nombre}
                  </h2>
                  <div className="text-right shrink-0">
                    <p className="text-[var(--portal-ink)] font-[var(--font-display),Georgia,serif] text-xl leading-none">{datosPlan.precio} €</p>
                    <p className="text-[11px] text-[var(--portal-muted)] mt-1">1 clase</p>
                  </div>
                </div>
                <div className="space-y-1.5 mb-3">
                  <p className="flex items-center gap-2 text-[var(--portal-muted-2)] text-sm">
                    <Calendar size={14} className="shrink-0 text-[var(--portal-muted)]" />
                    {fmtLong(new Date(bookingSesion.inicio))}
                  </p>
                  <p className="flex items-center gap-2 text-[var(--portal-muted-2)] text-sm">
                    <Clock size={14} className="shrink-0 text-[var(--portal-muted)]" />
                    {fmtTime(bookingSesion.inicio)} - {fmtTime(bookingSesion.fin)}
                    {bookingSesion.tipo?.duracionMinutos ? ` · ${bookingSesion.tipo.duracionMinutos} min` : ''}
                    {bookingSesion.instructor?.nombre ? ` · ${bookingSesion.instructor.nombre}` : ''}
                  </p>
                  {bookingSesion.sala?.nombre && (
                    <p className="flex items-center gap-2 text-[var(--portal-muted-2)] text-sm">
                      <MapPin size={14} className="shrink-0 text-[var(--portal-muted)]" />
                      {bookingSesion.sala.nombre} · {estudioNombre}
                    </p>
                  )}
                </div>
                {bookingSesion.tipo?.descripcion && (
                  <p className="text-[var(--portal-muted-2)] text-[13px] leading-relaxed mb-4">
                    {bookingSesion.tipo.descripcion}
                  </p>
                )}
                <h2 className="text-[var(--portal-ink)] font-[var(--font-display),Georgia,serif] font-normal text-2xl mb-1">Tus datos</h2>
                <p className="text-[var(--portal-muted-2)] text-sm mb-4">
                  No necesitas crear una cuenta. Al completar tu reserva crearemos automáticamente tu acceso para que puedas gestionar tus próximas clases.
                </p>
                <div className="grid grid-cols-2 gap-2 mb-2">
                  <input type="text" placeholder="Nombre"
                    value={loginForm.nombre}
                    onChange={e => setLoginForm(f => ({ ...f, nombre: e.target.value }))}
                    autoFocus
                    className="w-full rounded-xl px-4 py-3 text-sm text-[var(--portal-ink)] placeholder:text-[var(--portal-muted)] outline-none border border-[var(--portal-line)] focus:border-[var(--portal-ink)] transition-colors"
                    style={{ backgroundColor: 'var(--portal-surface-2)' }} />
                  <input type="text" placeholder="Apellidos"
                    value={loginForm.apellidos}
                    onChange={e => setLoginForm(f => ({ ...f, apellidos: e.target.value }))}
                    className="w-full rounded-xl px-4 py-3 text-sm text-[var(--portal-ink)] placeholder:text-[var(--portal-muted)] outline-none border border-[var(--portal-line)] focus:border-[var(--portal-ink)] transition-colors"
                    style={{ backgroundColor: 'var(--portal-surface-2)' }} />
                </div>
                <input type="email" placeholder="Tu email"
                  value={loginForm.email}
                  onChange={e => { setLoginForm(f => ({ ...f, email: e.target.value })); setDatosError(''); }}
                  className="w-full rounded-xl px-4 py-3 text-sm text-[var(--portal-ink)] placeholder:text-[var(--portal-muted)] outline-none border border-[var(--portal-line)] focus:border-[var(--portal-ink)] transition-colors mb-2"
                  style={{ backgroundColor: 'var(--portal-surface-2)' }} />
                <input type="tel" placeholder="Tu teléfono (+34 600 000 000)"
                  value={loginForm.telefono}
                  onChange={e => setLoginForm(f => ({ ...f, telefono: e.target.value }))}
                  onKeyDown={e => e.key === 'Enter' && handleDatosContinuar()}
                  className="w-full rounded-xl px-4 py-3 text-sm text-[var(--portal-ink)] placeholder:text-[var(--portal-muted)] outline-none border border-[var(--portal-line)] focus:border-[var(--portal-ink)] transition-colors mb-1"
                  style={{ backgroundColor: 'var(--portal-surface-2)' }} />
                {datosError && <p className="text-destructive text-sm mb-3">{datosError}</p>}
                <p className="text-[11px] text-[var(--portal-muted)] mb-3">
                  ¿Ya tienes cuenta? <button type="button" onClick={() => setLoginStep('login')} className="underline font-semibold">Entra aquí</button>.
                </p>
                {/* Casilla explícita de privacidad (rediseño del popup). El
                    enlace abre el texto completo en el visor legal existente. */}
                <label className="flex items-start gap-2.5 mb-4 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={privacidadAceptada}
                    onChange={e => setPrivacidadAceptada(e.target.checked)}
                    className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--portal-ink)]"
                  />
                  <span className="text-[var(--portal-ink)] text-xs leading-relaxed">
                    Al inscribirme, acepto la{' '}
                    <button type="button"
                      onClick={e => { e.preventDefault(); setLegalDoc({ label: 'Política de privacidad', text: studioConfig.politicaPrivacidad }); }}
                      className="underline font-semibold">
                      política de privacidad
                    </button>.
                  </span>
                </label>
                <button onClick={handleDatosContinuar}
                  disabled={!loginForm.nombre.trim() || !loginForm.apellidos.trim() || !loginForm.email.trim() || !telefonoValido(loginForm.telefono) || !privacidadAceptada || datosCargando}
                  className="w-full py-3 rounded-2xl font-bold text-white transition-all disabled:opacity-40"
                  style={{ backgroundColor: PRIMARY }}>
                  {datosCargando ? 'Un momento…' : 'Continuar al pago →'}
                </button>
              </div>
            )}

            {/* ── PAGO (checkout embebido, "pagar y reservar sin login previo") ── */}
            {loginStep === 'pago' && bookingSesion && datosPlan && datosClientSecret && studio?.stripeAccountId && STRIPE_PUBLISHABLE_KEY && (
              <div className="contenido-anim">
                <div className="flex items-center justify-between mb-3">
                  <button type="button" onClick={() => setLoginStep('datos')}
                    className="inline-flex items-center gap-1 text-[13px] font-semibold text-[var(--portal-muted)] hover:text-[var(--portal-ink)] transition-colors">
                    <ChevronLeft size={13} strokeWidth={2.5} />Datos
                  </button>
                  <p className="text-[10.5px] font-bold tracking-[0.14em] text-[var(--portal-muted)] uppercase">Paso 2 de 2</p>
                </div>
                <CheckoutEmbebido
                  t={tokensCalendario}
                  plan={datosPlan}
                  clientSecret={datosClientSecret}
                  publishableKey={STRIPE_PUBLISHABLE_KEY}
                  stripeAccountId={studio.stripeAccountId}
                  resumenClase={{
                    nombre: bookingSesion.tipo?.nombre ?? '',
                    fecha: fmtLong(new Date(bookingSesion.inicio)),
                    hora: fmtTime(bookingSesion.inicio),
                    instructor: bookingSesion.instructor?.nombre ?? null,
                  }}
                  // Misma cifra honesta que ya usa el paso 'confirm' (línea de
                  // arriba) — no la fija del estudio a secas, la de SU tipo de
                  // clase si tiene override.
                  ventanaCancelacionHoras={bookingSesion.tipo?.ventanaCancelacionHoras ?? studio?.cancelacionVentanaHoras ?? 0}
                  // El importe nunca detrás de la flecha: "→ 1 €" se leía
                  // como "-1 €" (queja literal del fundador).
                  textoBoton={`Pagar ${datosPlan.precio} € y reservar`}
                  // Prefija en el Payment Element lo que se acaba de escribir
                  // en el paso 1 — Link volvía a pedir email y teléfono.
                  datosPago={{
                    nombre: `${loginForm.nombre.trim()} ${loginForm.apellidos.trim()}`.trim(),
                    email: loginForm.email.trim(),
                    telefono: loginForm.telefono.trim(),
                  }}
                  // La fuente REAL del widget para dentro del iframe de Stripe
                  // (appearance no resuelve var(--font-ui)); sin fuente
                  // personalizada, el componente cae a Instrument Sans.
                  fuentePago={apariencia.fuente && cssFuente ? { familia: apariencia.fuente, cssSrc: cssFuente } : undefined}
                  onExito={handlePagoExitoso}
                  onCerrar={() => setLoginStep('datos')}
                />
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
                  style={{ backgroundColor: 'var(--portal-surface-2)' }} />
                <input type="tel"
                  placeholder="Tu teléfono (+34 600 000 000)"
                  value={loginForm.telefono}
                  onChange={e => setLoginForm(f => ({ ...f, telefono: e.target.value }))}
                  onKeyDown={e => e.key === 'Enter' && handleRegistroNombre()}
                  className="w-full rounded-xl px-4 py-3 text-sm text-[var(--portal-ink)] placeholder:text-[var(--portal-muted)] outline-none border border-[var(--portal-line)] focus:border-[var(--portal-ink)] transition-colors mb-1"
                  style={{ backgroundColor: 'var(--portal-surface-2)' }} />
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
        sheetClassName="bg-white w-full max-w-lg rounded-3xl relative shadow-2xl flex flex-col"
        // P0-3: mismo criterio que el modal de reserva de arriba.
        sheetStyle={{ maxHeight: embedMode ? (franjaVisible ? '100%' : 'min(85vh, 640px)') : '85vh' }}
        overlayStyle={overlayEmbed}
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
