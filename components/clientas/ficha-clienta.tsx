'use client';

import { useState, useEffect, useRef, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useCampoAsociado } from '@/components/ui/use-campo-asociado';
import Link from 'next/link';
import { useStudio } from '@/lib/studio-context';
import { useAuth } from '@/lib/auth-context';
import { useSemaforoRecepcion } from '@/lib/hooks/use-semaforo-recepcion';
import { useSpeechToText } from '@/lib/hooks/use-speech-to-text';
import { enPilotoVoz } from '@/lib/piloto-ficha-viva';
import { estructurarNotaIA } from '@/lib/ai/instructor-note-client';
import { resumenSocio } from '@/lib/socio-resumen';
import { saldoSesionesBono, nombrePeriodo } from '@/lib/bono-logic';
import { ETIQUETA_GENERO, GENEROS, etiquetaFija, generoDe, mayuscula, trato, type Genero } from '@/lib/genero';
import { textoRetiro } from '@/lib/socios/consentimiento-retirado';
import { borrarContacto, consultarRetiroMarketing, enviarEmailBienvenida, enviarEmailCampana, obtenerComunicacionesSocio, obtenerPagosHistoricosSocio, reactivarBuzonRoto, type ComunicacionFicha } from '@/lib/api-client';
import { useRol, puedeVerFichaClinica, puedeVerSemaforo, puedeMoverDinero, puedeVerFinanzas, puedeGestionarClientas, puedeVerDatosPrivadosSocia, puedeVerAuditoriaFinanciera, puedeGestionarCalendario, puedeBorrarDatosClienta, puedeVerNotasInternas } from '@/lib/permisos';
import { DialogoBorrarDatos, DialogoDarDeBaja } from '@/components/socios/dar-de-baja';
import { AccesosDeLaClienta } from '@/components/acceso/accesos-de-la-clienta';
import { HistorialDinero } from '@/components/auditoria/historial-dinero';
import { asignarVentaAClienta, esError, ventasPorAsignarDePlan, type VentaPorAsignar } from '@/lib/pos/cliente';
import { cambiosSociaPermitidos } from '@/lib/socios/datos-privados';
import { FichaSalud } from '@/components/socios/ficha-salud';
import { FichaPlazaFija } from '@/components/socios/ficha-plaza-fija';
import { DialogoPlazaFija, textoPlazaGuardada } from '@/components/plazas-fijas/dialogo-plaza-fija';
import { FichaRecuperaciones } from '@/components/socios/ficha-recuperaciones';
import { FichaClasesAutorizadas } from '@/components/socios/ficha-clases-autorizadas';
import { FichaExcepciones } from '@/components/socios/ficha-excepciones';
import { FichaMandatoSepa } from '@/components/socios/ficha-mandato-sepa';
import { FichaDocumentos } from '@/components/socios/ficha-documentos';
import { DerechosRgpdFicha } from '@/components/socios/derechos-rgpd-ficha';
import { BotonBajaRecuperacion } from '@/components/socios/boton-baja-recuperacion';
import { BotonDevolverRecibo } from '@/components/socios/boton-devolver-recibo';
import { BotonCobrarConMetodo } from '@/components/cobros/dialogo-metodo-cobro';
import { CasillaRenovacion } from '@/components/cobros/casilla-renovacion';
import { MENSAJE_YA_ESTABA, textoLoteCobrado } from '@/lib/cobros/marcar-cobrado';
import { BotonRectificarFactura } from '@/components/socios/boton-rectificar-factura';
import { estadoReembolso } from '@/lib/billing/estado-reembolso';
import { CamposExtraFields } from '@/components/socios/campos-extra-fields';
import { semaforo, SEMAFORO_META } from '@/lib/ficha-clinica';
import { ERROR_GENERICO } from '@/lib/errores';
import { calcularEstadoSuscripcion, textoCaducidad } from '@/lib/suscripcion-estado';
import { aCentimos, importeAdeudado } from '@/lib/billing/situacion-recibo';
import { puedeProgramarBaja } from '@/lib/billing/baja-al-vencer';
import { textoCobrosAlCancelar, type ReciboPendienteDeLaCuota } from '@/lib/billing/texto-cancelar-cuota';
import { dbRecibosPendientesDeCuota } from '@/lib/supabase-data';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { textoConsentimientoMarketing } from '@/lib/legal-textos';
import { normalizarEmail, motivoLegible } from '@/lib/emails/rebotes';
import {
  ArrowLeft, Phone, Mail, CreditCard, Calendar, Pencil, Trash2,
  AlertTriangle, Plus, Tag, Pause, Play, X, Clock, Megaphone,
  Send, CheckCircle2, Filter, ShieldCheck, FileSignature,
  Bot, Loader2, Mic, RefreshCw, XCircle, CalendarClock, UserCheck, UserX,
  CircleDollarSign, CalendarCheck, CalendarPlus, HeartPulse, Gift, Smartphone, Image as ImageIcon,
  MessageCircle, ChevronRight, UserRound, Users, Sparkles, Coins, ListChecks, MessagesSquare, Check, Pin, Bell, type LucideIcon,
} from 'lucide-react';
import { cn, formatEuro, hoyEnEstudio } from '@/lib/utils';
import { enlaceWhatsApp } from '@/lib/decision/mensajes-socia';
import { cumpleMesDia } from '@/lib/socios/datos-privados';
import { useEstadosClientas } from '@/lib/clientas/use-estados-clientas';
import { useAvisosClientas } from '@/lib/clientas/use-avisos-clientas';
import { cuandoClase, diasEntre, fechaCorta, haceCuanto, proximoCumple, telefonoLegible, textoDesde } from '@/lib/clientas/textos';
import { compactarHistoria, historiaDeClienta, type GrupoHistoria } from '@/lib/clientas/historia';
import { clasesEstaSemana, constancia } from '@/lib/clientas/constancia';
import { contactoTrasElAviso, ETIQUETA_CANAL, ETIQUETA_RESULTADO, type CanalContacto, type ContactoApuntado, type ResultadoContacto } from '@/lib/clientas/contactos';
import { DialogoApuntarContacto, PreguntaTrasContacto } from '@/components/clientas/ficha/apuntar-contacto';
import { NotasDelEquipo } from '@/components/clientas/ficha/notas-equipo';
import { DialogoRecordar, TarjetaSeguimiento } from '@/components/clientas/ficha/seguimiento';
import { useSeguimientosDe } from '@/lib/clientas/use-seguimientos';
import { useBajasDe } from '@/lib/clientas/use-bajas';
import { ETIQUETA_MOTIVO_BAJA, esMotivoBaja } from '@/lib/socios/baja';
import { tituloPropuesto } from '@/lib/clientas/seguimientos';
import { nombreAutora, notaVisiblePara } from '@/lib/clientas/notas';
import { PastillaAviso, PastillaEstado, TarjetaFicha, BotonTarjeta } from '@/components/clientas/piezas';
import {
  AccionGrande, BarrasConstancia, CabeceraFicha, LineaHistoria, PorQueTeAviso,
  type AlertaCabecera, type CeldaCabecera,
} from '@/components/clientas/ficha/piezas-ficha';
import type { AccionMenu } from '@/components/ui/menu-acciones';
import { ReservarClase } from '@/components/clientas/ficha/reservar-clase';
import { ProfileAvatar, AvatarPicker } from '@/components/ui/profile-avatar';
import { Toast } from '@/components/ui/toast';
import { ReanimarAlCambiar } from '@/components/ui/reanimar-al-cambiar';
import { FichaValoracion, FichaValoracionSalud } from '@/components/socios/valoracion-inicial-ficha';
import { repartirHistorial } from '@/lib/valoracion-inicial';
import { textoPlazaFijaSinCuota } from '@/lib/plazas-fijas-sin-cuota';

// ─── Constants ────────────────────────────────────────────────────────────────

const TAGS_OPTIONS = [
  { label: 'VIP', bg: '#FFF2F7', text: 'var(--brand)' },
  { label: 'Prueba', bg: 'color-mix(in srgb, var(--warning) 12%, var(--card))', text: 'var(--warning)' },
  { label: 'Lesión', bg: 'color-mix(in srgb, var(--destructive) 12%, var(--card))', text: 'var(--destructive)' },
  { label: 'Embarazo', bg: 'color-mix(in srgb, var(--success) 12%, var(--card))', text: 'var(--success)' },
  { label: 'Baja temp.', bg: 'var(--muted)', text: 'var(--muted-foreground)' },
  { label: 'Online', bg: '#E0F2FE', text: '#3F5A7A' },
  { label: 'Profesora', bg: '#FEF9C3', text: '#713F12' },
];

const BADGE_RECIBO: Record<string, string> = {
  COBRADO: 'bg-success/10 text-success',
  PENDIENTE: 'bg-warning/10 text-warning',
  DEVUELTO: 'bg-destructive/10 text-destructive',
  EN_CURSO: 'bg-info/10 text-info',
  FALLIDO: 'bg-destructive/10 text-destructive',
};
const LABEL_RECIBO: Record<string, string> = {
  COBRADO: 'Cobrado', PENDIENTE: 'Pendiente', DEVUELTO: 'Devuelto', EN_CURSO: 'En curso', FALLIDO: 'Fallido',
};

const BADGE_RESERVA: Record<string, { bg: string; text: string; label: string }> = {
  CONFIRMADA:   { bg: 'color-mix(in srgb, var(--info) 12%, var(--card))', text: 'var(--info)', label: 'Confirmada' },
  ASISTIDA:     { bg: 'color-mix(in srgb, var(--success) 12%, var(--card))', text: 'var(--success)', label: 'Asistida' },
  LISTA_ESPERA: { bg: 'color-mix(in srgb, var(--warning) 12%, var(--card))', text: 'var(--warning)', label: 'En espera' },
  CANCELADA:    { bg: 'var(--muted)', text: 'var(--muted-foreground)', label: 'Cancelada' },
  NO_ASISTIO:   { bg: '#FFF1F2', text: 'var(--destructive)', label: 'No asistió' },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────


function localDate(d: Date | string): string {
  const dt = typeof d === 'string' ? new Date(d) : d;
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
}

// Construidos una vez: un `toLocale…String` con opciones construye uno en cada
// llamada, y la ficha los usa por cada reserva y cada recibo en cada render.
// Mismas opciones y misma zona (la del navegador) que antes.
const FORMATO_FECHA = new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'short', year: 'numeric' });
const FORMATO_HORA = new Intl.DateTimeFormat('es-ES', { hour: '2-digit', minute: '2-digit' });
const FORMATO_FECHA_RESERVA = new Intl.DateTimeFormat('es-ES', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });

function fecha(iso: string) {
  return FORMATO_FECHA.format(new Date(iso));
}

function formatHora(iso: string) {
  return FORMATO_HORA.format(new Date(iso));
}

// ─── Sub-components ───────────────────────────────────────────────────────────

// Las notas de sesión son dato de salud: la RLS de `notas_progreso` y la ruta de
// IA exigen el consentimiento de salud vigente de la socia.
const SIN_CONSENTIMIENTO_SALUD = 'Registra primero el consentimiento de salud de esta clienta.';

const inputCls = "w-full rounded-xl border border-border bg-card px-3.5 py-2.5 text-sm font-medium text-foreground focus:outline-none focus:border-foreground transition-colors";

function FF({ label, children }: { label: string; children: React.ReactNode }) {
  const { htmlFor, control } = useCampoAsociado(children);
  return (
    <div className="space-y-1.5">
      <label htmlFor={htmlFor} className="text-xs font-bold text-foreground uppercase tracking-wider">{label}</label>
      {control}
    </div>
  );
}

function Card({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn('bg-card border border-border rounded-xl p-5', className)}>
      {children}
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-4">{children}</h3>
  );
}

// ─── Pestañas ─────────────────────────────────────────────────────────────────

type Tab = 'resumen' | 'historia' | 'reservas' | 'pagos' | 'salud' | 'documentos' | 'datos';
const PESTANAS_VALIDAS: readonly Tab[] = ['resumen', 'historia', 'reservas', 'pagos', 'salud', 'documentos', 'datos'];

// Un dato de «Sobre ella»: icono, qué es, y su valor.
function DatoSobreElla({ icono: Icono, etiqueta, valor }: { icono: LucideIcon; etiqueta: string; valor: string }) {
  return (
    <div className="flex gap-2.5">
      <Icono size={15} className="mt-0.5 shrink-0 text-muted-foreground" aria-hidden />
      <div className="min-w-0">
        <dt className="text-[11.5px] text-muted-foreground">{etiqueta}</dt>
        <dd className="break-words text-[13px] text-foreground">{valor}</dd>
      </div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

/**
 * La ficha de una clienta. La misma pieza se ve como página (/clientas/[id]) y
 * al lado de la lista en pantallas anchas (`modo="panel"`): una sola ficha, no
 * dos que diverjan.
 */
export function FichaClienta({ id, modo = 'pagina' }: {
  id: string;
  modo?: 'pagina' | 'panel';
}) {
  const rol = useRol();
  // Sin esto, una instructora veía «Cobrar» y «Cancelar suscripción»: botones que
  // desde la 0112 la base de datos rechaza. Enseñar un botón que no funciona es
  // peor que no enseñarlo.
  const puedeCobrar = puedeMoverDinero(rol);
  // Alta, edición y baja de clientas: mostrador y manager. La instructora tenía
  // los tres botones a la vista y los tres terminaban en el rechazo de la RLS.
  const gestionaClientas = puedeGestionarClientas(rol);
  // NIF, firma y demás datos privados (M1 RGPD): a un MANAGER o una INSTRUCTORA
  // le llegan `null` y aquí ni se pintan ni se mandan al guardar.
  const veDatosPrivados = puedeVerDatosPrivadosSocia(rol);
  // Antes era `rol !== 'INSTRUCTOR'`, escrito a mano. Con un rol nuevo esa forma
  // se equivoca sola: el manager habría heredado la vista de facturación sin que
  // nadie lo decidiera. Ahora lo dice una regla con nombre.
  const verFinanzas = puedeVerFinanzas(rol);
  const verFichaClinica = puedeVerFichaClinica(rol);
  // El semáforo (solo el color) sí lo ve RECEPCIÓN — el detalle (pestaña
  // Salud) no. Antes el badge entero estaba detrás de `verFichaClinica`, así
  // que RECEPCIÓN no veía ni el aviso de riesgo.
  const verSemaforo = puedeVerSemaforo(rol);
  const { user } = useAuth();

  const {
    studio,
    socios, suscripciones, planesTarifa, recibos, reservas, sesiones, plazasFijas,
    tiposClase, salas, instructores, notasInternas, valoracionesSocias,
    cargarFichaClienta,
    updateSocio, deleteSocio, volverADarDeAlta, assignPlan, marcarCobrado, addRecibo, cobrarTodosPendientes,
    addTagSocio, removeTagSocio, pausarSuscripcion, reanudarSuscripcion, reactivarSuscripcion, cancelarSuscripcion,
    programarBajaSuscripcion,
    notasProgreso, addNotaProgreso,
    condicionesSalud, camposPersonalizados,
    facturas,
    emailsRebotados,
    refrescarTrasVentaPOS,
    memberCredits,
  } = useStudio();
  // Las notas internas y las respuestas de sesión no vienen en el arranque
  // (#1375 las sacó y nadie escribió la carga posterior). Se piden aquí.
  useEffect(() => { cargarFichaClienta(); }, [cargarFichaClienta]);

  // La valoración de ESTA alumna, repartida en «cómo llegó» y «qué dice hoy».
  //
  // El reparto lo hace `repartirHistorial`, la MISMA función pura que usa su
  // app: si el panel decidiera aquí cuál es la inicial con su propio criterio,
  // las dos pantallas podrían acabar contando historias distintas del mismo
  // dato. Se calcula en render (es un filtro sobre un array ya cargado), no en
  // un efecto con estado.
  const historialValoracion = useMemo(
    () => repartirHistorial(valoracionesSocias.filter((v) => v.socioId === id)),
    [valoracionesSocias, id],
  );


  // Ficha de instructora del usuario logueado — la nota de progreso debe
  // quedar a nombre de quien la escribe de verdad, no de `instructores[0]`
  // (que colaba a la primera del equipo, dada de baja o no, como autora).
  const yo = instructores.find(i => i.authUserId === user?.id) ?? null;

  const semaforoLocal = useMemo(
    () => semaforo(condicionesSalud.filter(c => c.socioId === id)),
    [condicionesSalud, id],
  );
  // RECEPCIÓN sí ve el semáforo, pero la RLS de condiciones_salud no le deja
  // leer las filas — `condicionesSalud` le llega SIEMPRE vacío, así que el
  // cálculo local de arriba nunca produce nada para ese rol.
  // useSemaforoRecepcion trae el nivel de TODO el estudio en una sola
  // llamada; navegar a otra socia solo reindexa el mismo Map por otra
  // clave (sin re-fetch y sin arrastrar el nivel de la socia anterior).
  const semaforoRecepcion = useSemaforoRecepcion(rol);
  const semaforoSocio = rol === 'RECEPCION' ? (semaforoRecepcion.get(id) ?? 'VERDE') : semaforoLocal;

  // ── Hydration fix ──────────────────────────────────────────────────────────
  const [mounted, setMounted] = useState(false);
  // eslint-disable-next-line react-hooks/set-state-in-effect -- Guarda de hidratación: el SSR pinta una fecha fija y el cliente pasa a la real tras montar. El segundo render es el OBJETIVO, no un efecto colateral; quitar el efecto reintroduce el mismatch de hidratación.
  useEffect(() => setMounted(true), []);
  // Estable entre renders (solo cambia al montar): así el useMemo del resumen no
  // se invalida en cada tecleo por un `new Date()` nuevo.
  const now = useMemo(() => mounted ? new Date() : new Date('2026-06-29'), [mounted]);

  // ── UI state ───────────────────────────────────────────────────────────────
  const [activeTab, setActiveTab] = useState<Tab>('resumen');
  const [showEdit, setShowEdit] = useState(false);
  const [showChangePlan, setShowChangePlan] = useState(false);
  const [showAddRecibo, setShowAddRecibo] = useState(false);
  const [showConfirmDelete, setShowConfirmDelete] = useState(false);
  const [showBaja, setShowBaja] = useState(false);
  const [dandoDeAlta, setDandoDeAlta] = useState(false);
  const [errorBorrar, setErrorBorrar] = useState<string | null>(null);
  const [confirmarConsentimientoMkt, setConfirmarConsentimientoMkt] = useState(false);
  const [confirmarRetiroMkt, setConfirmarRetiroMkt] = useState(false);
  const [retirandoMkt, setRetirandoMkt] = useState(false);
  const [guardandoConsentimientoMkt, setGuardandoConsentimientoMkt] = useState(false);
  const [borrando, setBorrando] = useState(false);
  // Cerrojo síncrono anti-doble-baja: el estado `borrando` no frena un doble
  // clic en el mismo tick (se lee antes de re-renderizar); el ref sí.
  const borrandoRef = useRef(false);
  const [showAddTag, setShowAddTag] = useState(false);
  const [showSendMessage, setShowSendMessage] = useState(false);
  const [reservaFilter, setReservaFilter] = useState<'todas' | 'confirmadas' | 'asistidas' | 'canceladas'>('todas');
  const [reservasPage, setReservasPage] = useState(20);
  const [toast, setToast] = useState<string | null>(null);
  const [cambiandoPlan, setCambiandoPlan] = useState(false);
  // El plan que se iba a dar de alta y las ventas del TPV que ya lo cobraron sin
  // clienta. `null` = no hay nada que avisar.
  const [ventaPorAsignar, setVentaPorAsignar] = useState<{ planId: string; nombrePlan: string; ventas: VentaPorAsignar[] } | null>(null);
  // Tras asignar una cuota: el nombre del plan mientras se pregunta si le da
  // plaza fija, y el diálogo de plaza fija si dice que sí.
  const [ofrecerPlazaFija, setOfrecerPlazaFija] = useState<string | null>(null);
  // El nombre del plan se guarda aparte: al cerrar, `ofrecerPlazaFija` pasa a null
  // antes de que acabe la animación y la ventana decía ««» ya está asignado» un
  // instante (visto en producción).
  const [planOfrecido, setPlanOfrecido] = useState('');
  const [dialogoPlazaFija, setDialogoPlazaFija] = useState(false);
  const [asignandoVenta, setAsignandoVenta] = useState(false);
  const [reactivando, setReactivando] = useState(false);
  const [reactivandoBuzon, setReactivandoBuzon] = useState(false);
  // I-8: `emailsRebotados` vive en el contexto y se carga UNA vez por sesión
  // (`cargarUnaVez`, studio-context.tsx) — no hay una vía barata de forzar un
  // refresco solo de esto sin tocar ese caché compartido por todo el panel.
  // Optimista y local a esta ficha: en cuanto Resend confirma la reactivación,
  // se oculta el aviso aquí mismo sin esperar a la próxima carga completa.
  const [buzonesReactivados, setBuzonesReactivados] = useState<Set<string>>(new Set());
  // Qué pregunta el diálogo se decide AL ABRIRLO: si se recalculara al pintar,
  // al cancelar la suscripción cambiaría de texto y de botones mientras se
  // cierra (visto en producción: «Cancelar ahora» enseñaba un instante una
  // segunda confirmación que ya no hacía nada).
  const [confirmarCancelarSus, setConfirmarCancelarSus] = useState<'elegir' | 'confirmar' | null>(null);
  // Los recibos pendientes de esa cuota, leídos al abrir la ventana (ver `abrirCancelarSus`).
  const [pendientesCuota, setPendientesCuota] = useState<ReciboPendienteDeLaCuota[]>([]);
  const [showAvatarPicker, setShowAvatarPicker] = useState(false);

  // ── AI instructor notes ────────────────────────────────────────────────────
  const [aiNoteText, setAiNoteText] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const [aiResult, setAiResult] = useState<{
    progreso: string | null;
    alertas: string | null;
    planProximaSesion: string | null;
    ejerciciosCasa: string | null;
  } | null>(null);
  // Piloto de validación de captura por voz (ver lib/piloto-ficha-viva.ts) —
  // dicta directo sobre el textarea existente, en vez del teclado del móvil.
  const speech = useSpeechToText();
  const aiNoteBaseRef = useRef('');
  useEffect(() => {
    // Sin comprobar `speech.grabando`: al parar, `detener()` lo pone a
    // false de forma síncrona, pero el volcado final de la transcripción
    // llega después (async, vía onend) — con esa comprobación, esas
    // últimas palabras dictadas justo antes de parar se perdían en
    // silencio. `speech.transcripcion` solo cambia durante una sesión de
    // dictado real, nunca por escritura manual, así que no hace falta el
    // guardia para no pisar el texto del teclado.
    setAiNoteText(aiNoteBaseRef.current + (aiNoteBaseRef.current && speech.transcripcion ? ' ' : '') + speech.transcripcion);
  }, [speech.transcripcion]);
  function handleMicToggle() {
    if (speech.grabando) { speech.detener(); return; }
    aiNoteBaseRef.current = aiNoteText;
    speech.iniciar();
  }
  const [msgForm, setMsgForm] = useState({ asunto: '', cuerpo: '' });
  const [enviandoMsg, setEnviandoMsg] = useState(false);
  const [editForm, setEditForm] = useState<{
    nombre: string; apellidos: string; email: string; telefono: string; nif: string; genero: Genero | '';
    camposExtra: Record<string, string | number | boolean | null>;
  }>({ nombre: '', apellidos: '', email: '', telefono: '', nif: '', genero: '', camposExtra: {} });
  // `esRenovacion` sin marcar por defecto: un cobro suelto es una venta, no una renovación del plan.
  const [reciboForm, setReciboForm] = useState({ concepto: '', importe: '', fechaVencimiento: localDate(new Date()), esRenovacion: false });

  // ── Historial real de comunicaciones (comunicaciones_socio) ─────────────────
  // Antes esto era un useState en memoria que nunca se persistía — se perdía
  // al navegar fuera de la ficha o recargar la página. Se carga aparte del
  // resto de datos de la clienta (no viene en el snapshot global de
  // studio-context): potencialmente mucha fila por estudio con actividad de
  // campañas, así que solo se pide al entrar en esta ficha.
  const [comunicaciones, setComunicaciones] = useState<ComunicacionFicha[]>([]);
  // Si de verdad se ha leído (para poder decir «nadie le ha escrito» sin mentir).
  const [comunicacionesCargadas, setComunicacionesCargadas] = useState(false);

  useEffect(() => {
    if (!id) return;
    // Se limpia YA, síncrono: cambiar de ficha no debe seguir enseñando el
    // historial de la clienta anterior mientras carga la nueva.
    // eslint-disable-next-line react-hooks/set-state-in-effect -- Carga asíncrona del historial con bandera 'ignorar' para que una respuesta tardía no pinte datos de otra clienta. El estado viene de la red.
    setComunicaciones([]);
    setComunicacionesCargadas(false);
    let ignorar = false;
    // A partir de aquí, null (fallo de red/permiso) no pisa lo que ya había
    // en pantalla — solo un resultado real reemplaza el historial. `ignorar`
    // evita que la respuesta de ESTA MISMA ficha llegue tarde (tras cambiar
    // otra vez de clienta) y pinte datos de otra persona.
    obtenerComunicacionesSocio(id).then(data => { if (!ignorar && data) { setComunicaciones(data); setComunicacionesCargadas(true); } });
    return () => { ignorar = true; };
  }, [id]);

  // Tras apuntar o borrar un contacto: lo que diga el servidor, no una suposición.
  async function recargarComunicaciones() {
    const data = await obtenerComunicacionesSocio(id);
    if (data) { setComunicaciones(data); setComunicacionesCargadas(true); }
  }

  // ── Pagos históricos importados (migración asistida) ─────────────────────
  // Mismo criterio que comunicaciones justo arriba: fuera del snapshot global,
  // solo lectura, gate `puedeVerFinanzas` (mismo que la pestaña "Pagos"). Solo
  // se pide si el rol puede verlos — no tiene sentido pedirlo para nada.
  const [pagosHistoricos, setPagosHistoricos] = useState<Array<{
    id: string; fecha: string; concepto: string | null; importe: number; medioPago: string | null;
  }>>([]);

  useEffect(() => {
    if (!id || !verFinanzas) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- Carga asíncrona con bandera 'ignorar', mismo patrón que comunicaciones. El estado viene de la red.
    setPagosHistoricos([]);
    let ignorar = false;
    obtenerPagosHistoricosSocio(id).then(data => { if (!ignorar && data) setPagosHistoricos(data); });
    return () => { ignorar = true; };
  }, [id, verFinanzas]);

  const socio = socios.find(s => s.id === id);

  // AU-4: si se dio de baja del marketing, se dice antes de registrarle otro consentimiento.
  const [retiroMktLeido, setRetiroMkt] = useState<{ retiradoEn: string; origen: string } | null>(null);
  const sinConsentimientoMkt = !socio?.consentimientoMarketing;
  // Solo cuenta mientras siga sin consentimiento y quien mira gestione clientas.
  const retiroMkt = gestionaClientas && sinConsentimientoMkt ? retiroMktLeido : null;
  useEffect(() => {
    if (!gestionaClientas || !sinConsentimientoMkt) return;
    let vivo = true;
    void consultarRetiroMarketing(id).then(r => { if (vivo) setRetiroMkt(r); });
    return () => { vivo = false; };
  }, [id, gestionaClientas, sinConsentimientoMkt]);
  // Las palabras que hablan de ESTA persona («clienta»/«cliente», «esta»/«este»…).
  // Sin género indicado se escribe en femenino, como siempre.
  const t = trato(socio?.genero);
  // Si el buzón de esta clienta rechaza el correo, hay que decirlo AQUÍ. Antes
  // solo se veía al reintentar un aviso de hueco: los recordatorios, las
  // facturas y los accesos se daban por enviados igual (#1868). Se normaliza
  // porque la tabla va en minúsculas y una ficha puede tener «Maria@Gmail.com».
  const emailNormalizadoSocio = socio?.email ? normalizarEmail(socio.email) : null;
  const reboteCorreo = emailNormalizadoSocio && !buzonesReactivados.has(emailNormalizadoSocio)
    ? emailsRebotados[emailNormalizadoSocio]
    : undefined;

  // I-8 (auditoría 58ª pasada): la única salida manual para "no le está
  // llegando el correo" — ver lib/emails/reactivar-buzon.ts. Quita la
  // supresión en Resend y, solo si Resend lo confirma, la fila de
  // email_rebotes deja de existir.
  const reactivarBuzon = async () => {
    if (!emailNormalizadoSocio || reactivandoBuzon) return;
    setReactivandoBuzon(true);
    try {
      const r = await reactivarBuzonRoto(emailNormalizadoSocio);
      if (!r.ok) { setToast(r.error); return; }
      setBuzonesReactivados(prev => new Set(prev).add(emailNormalizadoSocio));
      setToast('Buzón reactivado — volverá a recibir correos');
    } finally {
      setReactivandoBuzon(false);
    }
  };

  // P0-34: las derivaciones que escanean arrays estudio-wide se memoizan (y van
  // ANTES del early return, por las reglas de hooks). Antes se recalculaban en
  // CADA render —cada tecla en cualquier campo de la página—, incluido un sort
  // con sesiones.find() en el comparador (O(reservas·log·sesiones)).
  const sesionById = useMemo(() => new Map(sesiones.map(s => [s.id, s])), [sesiones]);
  const misReservas = useMemo(() =>
    reservas.filter(r => r.socioId === id).sort((a, b) => {
      const sa = sesionById.get(a.sesionId);
      const sb = sesionById.get(b.sesionId);
      return (sb?.inicio ?? '').localeCompare(sa?.inicio ?? '');
    }),
    [reservas, sesionById, id]);
  // Devoluciones enviadas EN ESTA PANTALLA, para que la fila cambie al pulsar
  // sin esperar a recargar. El dato de verdad vive en el recibo
  // (`reembolsoSolicitadoEn`), así que esto solo tapa ese hueco de segundos.
  const [enviadas, setEnviadas] = useState<Set<string>>(new Set());
  // Un reloj que avanza: sin él, una devolución que se queda sin confirmar
  // seguiría diciendo "Devolviendo…" para siempre, porque nada volvería a
  // pintar la fila. Cada 30 s basta para un umbral de 5 minutos.
  const [ahoraDev, setAhoraDev] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setAhoraDev(new Date()), 30_000);
    return () => clearInterval(t);
  }, []);

  // La política de devoluciones del estudio, tal cual la evalúa el servidor.
  // Se arma aquí una vez y no por fila: son tres campos del mismo estudio.
  const politicaReembolso = useMemo(() => ({
    activos: studio?.reembolsosActivos ?? false,
    plazoDias: studio?.reembolsoPlazoDias ?? 14,
    soloSinUsar: studio?.reembolsoSoloSinUsar ?? true,
  }), [studio?.reembolsosActivos, studio?.reembolsoPlazoDias, studio?.reembolsoSoloSinUsar]);

  const misRecibos = useMemo(() =>
    recibos.filter(r => r.socioId === id).sort((a, b) => b.fechaVencimiento.localeCompare(a.fechaVencimiento)),
    [recibos, id]);
  const misNotas = useMemo(() =>
    notasInternas.filter(n => n.socioId === id).sort((a, b) => b.creadoEn.localeCompare(a.creadoEn)),
    [notasInternas, id]);

  // I10: todo el resumen derivado (próximas reservas, asistencias, gasto, días sin
  // venir, sparkline…) memoizado en un único selector puro. El useMemo va ANTES del
  // guard `if (!socio)` (reglas de hooks); `resumenSocio` tolera socio undefined.
  const resumen = useMemo(
    () => resumenSocio({ socio, id, misReservas, misRecibos, sesionById, suscripciones, planesTarifa, now }),
    [socio, id, misReservas, misRecibos, sesionById, suscripciones, planesTarifa, now],
  );

  // Otras suscripciones ACTIVA del mismo socio, aparte de la que ya se
  // enseña en la tarjeta "Plan" — el staff es quien decide si hace falta
  // activar algo a mano, así que necesita verlo tanto o más que la propia
  // socia (mismo aviso que el portal, `lib/bonos-portal.ts`). Depende de
  // `resumen.suscripcion` (ya calculado arriba) en vez del `suscripcion`
  // desestructurado más abajo: este hook tiene que ir ANTES del guard
  // `if (!socio)`, igual que `resumen`.
  const otrosBonosActivos = useMemo(() => {
    if (!resumen.suscripcion) return [];
    return suscripciones
      .filter(s => s.socioId === id && s.estado === 'ACTIVA' && s.id !== resumen.suscripcion!.id)
      .map(s => {
        const p = planesTarifa.find(pt => pt.id === s.planId);
        if (!p) return null;
        const tipos = p.tiposClaseIds ?? [];
        const nombreTipo = tipos.length === 1 ? tiposClase.find(tc => tc.id === tipos[0])?.nombre ?? null : null;
        return { nombre: nombreTipo ? `${p.nombre} · ${nombreTipo}` : p.nombre, restantes: s.sesionesRestantes ?? null };
      })
      .filter((x): x is { nombre: string; restantes: number | null } => x !== null);
  }, [suscripciones, planesTarifa, tiposClase, id, resumen.suscripcion]);

  // ── Estado, aviso, pestaña con URL, historia ─────────────────────────────────
  const router = useRouter();
  const estadosTodas = useEstadosClientas();
  const hoyISO = estadosTodas.ahora ? hoyEnEstudio(estadosTodas.ahora) : null;
  const { avisoDe } = useAvisosClientas(hoyISO);
  const [filtroHistoria, setFiltroHistoria] = useState<'TODO' | GrupoHistoria>('TODO');
  const [historiaVisibles, setHistoriaVisibles] = useState(30);
  const [showReservar, setShowReservar] = useState(false);
  const [enviandoAcceso, setEnviandoAcceso] = useState(false);
  // «Apuntar un contacto»: abierto con un canal ya marcado (o ninguno).
  const [apuntando, setApuntando] = useState<{ canal: CanalContacto | null } | null>(null);
  // Se ha pulsado WhatsApp o Llamar: al volver, «¿has hablado con ella?».
  const [contactoEnCurso, setContactoEnCurso] = useState<CanalContacto | null>(null);
  const [borrandoContacto, setBorrandoContacto] = useState<string | null>(null);
  const [contactoABorrar, setContactoABorrar] = useState<string | null>(null);
  // «Recuérdamelo»: abierto con un título propuesto (y el aviso del que nace, si nace de uno).
  const [recordando, setRecordando] = useState<{ titulo: string; recomendacionId: string | null } | null>(null);
  const { seguimientos, error: errorSeguimientos, recargar: recargarSeguimientos } = useSeguimientosDe(id, puedeGestionarClientas(rol));
  // Sus bajas, con el motivo; se vuelven a leer al darla de baja o de alta.
  const bajasSuyas = useBajasDe(id, puedeGestionarClientas(rol), socios.find(x => x.id === id)?.activo);

  // En la página, la pestaña vive en la URL (?pestana=pagos): un enlace puede
  // abrir la ficha ya en Pagos, y recargar no la devuelve al Resumen. En el panel
  // junto a la lista no se toca la URL (es la de la lista).
  useEffect(() => {
    if (modo !== 'pagina') return;
    const p = new URLSearchParams(window.location.search).get('pestana');
    // eslint-disable-next-line react-hooks/set-state-in-effect -- Guarda de hidratación: la URL solo existe en el navegador.
    if (p && (PESTANAS_VALIDAS as readonly string[]).includes(p)) setActiveTab(p as Tab);
  }, [modo]);
  useEffect(() => {
    if (modo !== 'pagina') return;
    const url = new URL(window.location.href);
    if (activeTab === 'resumen') url.searchParams.delete('pestana');
    else url.searchParams.set('pestana', activeTab);
    const destino = url.pathname + url.search;
    if (destino !== window.location.pathname + window.location.search) window.history.replaceState(window.history.state, '', destino);
  }, [activeTab, modo]);

  if (!socio) {
    return (
      <div className="text-center py-20">
        <p className="font-medium text-muted-foreground">Clienta no encontrada.</p>
        <Link href="/clientas" className="text-sm mt-3 inline-block font-semibold text-brand-secondary">
          ← Volver a clientas
        </Link>
      </div>
    );
  }

  // ── Derived data (memoizado en lib/socio-resumen, I10) ──────────────────────
  const {
    suscripcion, plan, tags, proximasReservas, asistidas, estesMes,
    totalGastado, pendientes,
    cumpleanos, pagosFallidos,
  } = resumen;

  // Filtered reservas for "Reservas" tab
  const filteredReservas = misReservas.filter(r => {
    if (reservaFilter === 'todas') return true;
    if (reservaFilter === 'confirmadas') return r.estado === 'CONFIRMADA';
    if (reservaFilter === 'asistidas') return r.estado === 'ASISTIDA';
    if (reservaFilter === 'canceladas') return r.estado === 'CANCELADA' || r.estado === 'NO_ASISTIO';
    return true;
  });

  // ── Helpers ────────────────────────────────────────────────────────────────
  const tagsDisponibles = TAGS_OPTIONS.filter(t => !tags.includes(t.label));

  function getReservaInfo(r: typeof misReservas[0]) {
    const ses = sesionById.get(r.sesionId);
    if (!ses) return { label: 'Clase eliminada', color: 'color-mix(in srgb, var(--info) 12%, var(--card))', date: '', time: '', sala: '', instructor: '' };
    const tipo = tiposClase.find(t => t.id === ses.tipoClaseId);
    const sala = salas.find(x => x.id === ses.salaId);
    const instructor = instructores.find(x => x.id === ses.instructorId);
    return {
      label: tipo?.nombre ?? 'Clase',
      color: tipo?.color ?? 'color-mix(in srgb, var(--info) 12%, var(--card))',
      date: FORMATO_FECHA_RESERVA.format(new Date(ses.inicio)),
      time: formatHora(ses.inicio),
      sala: sala?.nombre ?? '',
      instructor: instructor?.nombre ?? '',
    };
  }

  function openEdit() {
    setEditForm({
      nombre: socio!.nombre,
      apellidos: socio!.apellidos,
      email: socio!.email,
      telefono: socio!.telefono ?? '',
      nif: socio!.nif ?? '',
      genero: generoDe(socio!.genero) ?? '',
      camposExtra: socio!.camposExtra ?? {},
    });
    setShowEdit(true);
  }

  async function saveEdit() {
    // Sin permiso el NIF no se manda (el campo está oculto y valdría '', o sea
    // borrarlo); con permiso, solo si cambió respecto a lo cargado.
    const res = await updateSocio(id, cambiosSociaPermitidos({
      nombre: editForm.nombre.trim(),
      apellidos: editForm.apellidos.trim(),
      email: editForm.email.trim(),
      telefono: editForm.telefono || null,
      nif: editForm.nif || null,
      genero: editForm.genero || null,
      camposExtra: editForm.camposExtra,
    }, { puedeVerPrivados: veDatosPrivados, original: socio }));
    // El diálogo solo se cierra si de verdad se guardó: cerrarlo con el error
    // detrás deja a la propietaria creyendo que cambió el email de una clienta.
    if (!res.ok) { setToast(res.error); return; }
    setShowEdit(false);
    // Con el género que se acaba de guardar, no con el de antes de abrir el diálogo.
    const nuevo = trato(editForm.genero || null);
    setToast(`${mayuscula(nuevo.clienta)} actualizad${nuevo.fin}`);
  }

  async function handleDelete() {
    // Un doble clic disparaba DOS bajas (dos llamadas a /api/socios/eliminar).
    // El cerrojo síncrono lo corta antes de que React deshabilite el botón.
    if (borrandoRef.current) return;
    borrandoRef.current = true;
    setBorrando(true);
    setErrorBorrar(null);
    try {
      // Espera a que la baja (endpoint /api/socios/eliminar) COMPLETE antes de
      // navegar: window.location.href cancela peticiones en vuelo, así que sin el
      // await la clienta no llegaba a anonimizarse (parecía borrada pero seguía).
      await deleteSocio(id);
      // La recarga dura desmonta la ficha; en el camino feliz no se suelta el
      // cerrojo a propósito (no debe volver a poder pulsarse).
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- recarga dura a propósito (ver arriba): desmonta la ficha de una clienta que ya no existe.
      window.location.href = '/clientas';
    } catch (e) {
      borrandoRef.current = false;
      setBorrando(false);
      setErrorBorrar(e instanceof Error && e.message ? e.message : 'No se han podido borrar sus datos. Vuelve a intentarlo.');
    }
  }

  // Deshacer la baja. Lo que la baja dejó sin renovar sigue así, y se dice.
  async function handleVolverADarDeAlta() {
    if (dandoDeAlta) return;
    setDandoDeAlta(true);
    try {
      const r = await volverADarDeAlta(id);
      if (!r.ok) { setToast(r.error); return; }
      setToast(r.cuotasSinRenovar > 0
        ? `${socio?.nombre ?? 'La clienta'} vuelve a estar de alta. Su cuota sigue sin renovarse: si quieres que siga, quita la baja programada en su plan.`
        : `${socio?.nombre ?? 'La clienta'} vuelve a estar de alta.`);
    } finally {
      setDandoDeAlta(false);
    }
  }

  // La plaza fija va con la cuota (con bono se reserva clase a clase), así que el
  // momento de darla es justo al asignar la cuota: es cuando se sabe a qué clase
  // viene. Solo se pregunta; con un bono, o si ya tiene plaza fija, nada.
  function ofrecerPlazaFijaSiCuota(planId: string, nombrePlan: string) {
    const esCuota = planesTarifa.find(p => p.id === planId)?.tipo === 'MENSUAL';
    const yaTiene = plazasFijas.some(p => p.socioId === id && p.estado !== 'BAJA');
    if (esCuota && !yaTiene) {
      setPlanOfrecido(nombrePlan);
      setOfrecerPlazaFija(nombrePlan);
    }
  }

  // Cambiar el plan es cobrar. El toast «Plan "X" asignado» saltaba antes de que
  // el servidor hubiera contestado —y saltaba igual cuando contestaba que no—,
  // así que una instructora sin permiso veía el mismo mensaje de éxito que la
  // dueña y el plan reaparecía al recargar. Ahora el aviso dice lo que ha pasado.
  // Solo ASIGNA. Quitar el plan ya no pasa por aquí: `assignPlan(id, null)`
  // protege a propósito los bonos con saldo, así que como «cancelar» mentía.
  // El tipo (sin `| null`) es lo que impide que vuelva a colarse.
  async function cambiarPlan(planId: string, nombrePlan: string, opciones: { aunqueEsteCobradoEnTPV?: boolean } = {}) {
    if (cambiandoPlan) return;
    setCambiandoPlan(true);
    try {
      // ⚠️ Antes de cobrar el plan: ¿está ya cobrado en el TPV sin clienta? El
      // 10-sep se vendió una cuota así y, un minuto después, se dio de alta el
      // mismo plan aquí: dos recibos por un solo pago. Si la consulta falla se
      // sigue como siempre — el aviso ayuda, no bloquea el alta.
      if (!opciones.aunqueEsteCobradoEnTPV) {
        const r = await ventasPorAsignarDePlan(planId);
        // `Array.isArray`: una respuesta con otra forma no puede tumbar el alta.
        if (!esError(r) && Array.isArray(r.ventas) && r.ventas.length > 0) {
          setShowChangePlan(false);
          setVentaPorAsignar({ planId, nombrePlan, ventas: r.ventas });
          return;
        }
      }
      await assignPlan(id, planId);
      setShowChangePlan(false);
      setVentaPorAsignar(null);
      setToast(`Plan "${nombrePlan}" asignado`);
      ofrecerPlazaFijaSiCuota(planId, nombrePlan);
    } catch (e) {
      setToast(e instanceof Error ? e.message : ERROR_GENERICO);
    } finally {
      setCambiandoPlan(false);
    }
  }

  // Asigna a esta clienta una venta del TPV cobrada sin ella: el servidor
  // entrega el plan (`entregarVentaPOS`) sin volver a cobrarlo.
  async function asignarVentaDelTPV(venta: VentaPorAsignar) {
    if (asignandoVenta || !puedeCobrar) return;
    setAsignandoVenta(true);
    try {
      const r = await asignarVentaAClienta(venta.id, id);
      if (esError(r)) { setToast(r.error); return; }
      const entregado = ventaPorAsignar;
      setVentaPorAsignar(null);
      setToast(`Venta nº ${venta.numero} asignada: plan entregado sin cobrarlo otra vez`);
      await refrescarTrasVentaPOS();
      if (entregado) ofrecerPlazaFijaSiCuota(entregado.planId, entregado.nombrePlan);
    } finally {
      setAsignandoVenta(false);
    }
  }

  // ⚠️ Este botón llamaba a `assignPlan(id, null)` («quítale el plan»), que no
  // es lo mismo que cancelar la suscripción que se está mirando: con un bono
  // con sesiones sin gastar no hacía NADA y aun así decía «Plan retirado»
  // (7 de las 27 socias con tarjeta, medido en producción). Ver
  // `cancelarSuscripcion` en studio-context.
  function abrirCancelarSus() {
    if (!suscripcion) return;
    // Sus recibos pendientes, leídos al abrir: la ventana dice qué pasará con
    // ellos según la política del estudio (`textoCobrosAlCancelar`).
    setPendientesCuota([]);
    void dbRecibosPendientesDeCuota(suscripcion.id).then(setPendientesCuota);
    setConfirmarCancelarSus(
      puedeProgramarBaja(suscripcion, plan, localDate(now)) && !suscripcion.bajaAlVencer ? 'elegir' : 'confirmar',
    );
  }

  async function handleCancelarSuscripcion() {
    if (!suscripcion || cambiandoPlan) return;
    setCambiandoPlan(true);
    try {
      const res = await cancelarSuscripcion(suscripcion.id);
      setToast(res.ok ? 'Suscripción cancelada' : res.error);
      if (res.ok) setConfirmarCancelarSus(null);
    } finally {
      setCambiandoPlan(false);
    }
  }

  // Baja a fin de periodo (evaluación del 13-sep): sigue activa hasta la fecha
  // de renovación y no se le vuelve a cobrar. `programar = false` la quita.
  async function handleProgramarBaja(programar: boolean) {
    if (!suscripcion || cambiandoPlan) return;
    setCambiandoPlan(true);
    try {
      const res = await programarBajaSuscripcion(suscripcion.id, programar);
      if (!res.ok) { setToast(res.error); return; }
      setToast(programar
        ? `Se dará de baja el ${suscripcion.fechaFin ? fecha(suscripcion.fechaFin) : 'final del periodo'}`
        : 'Baja programada quitada: seguirá renovando');
      setConfirmarCancelarSus(null);
    } finally {
      setCambiandoPlan(false);
    }
  }

  async function handleAddRecibo() {
    const res = await addRecibo({
      socioId: id,
      suscripcionId: suscripcion?.id ?? null,
      concepto: reciboForm.concepto.trim(),
      importe: parseFloat(reciboForm.importe),
      fechaVencimiento: reciboForm.fechaVencimiento,
      // Al cobrarlo, el servidor solo entrega el plan si el recibo viene marcado como renovación.
      esRenovacion: !!suscripcion && reciboForm.esRenovacion,
    });
    if (!res.ok) { setToast(res.error); return; }
    setReciboForm({ concepto: '', importe: '', fechaVencimiento: localDate(new Date()), esRenovacion: false });
    setShowAddRecibo(false);
    setToast('Cobro creado');
  }

  async function handleAiNote() {
    if (!aiNoteText.trim()) return;
    // Mismo gate que la RLS de `notas_progreso` y que la ruta de IA: sin
    // consentimiento de salud vigente el servidor dirá que no, así que se
    // explica antes en vez de dejar que el guardado falle con un «sin permiso».
    if (!socio?.consentimientoSalud) { setToast(SIN_CONSENTIMIENTO_SALUD); return; }
    setAiLoading(true);
    setAiResult(null);
    try {
      const resultado = await estructurarNotaIA({
        texto: aiNoteText,
        socioId: id,
        instructorId: yo?.id ?? null,
      });
      setAiResult(resultado);
    } catch (err) {
      setToast(err instanceof Error && err.message ? err.message : 'Error al procesar con IA');
    } finally {
      setAiLoading(false);
    }
  }

  async function handleSaveAiNote() {
    if (!aiResult) return;
    if (!socio?.consentimientoSalud) { setToast(SIN_CONSENTIMIENTO_SALUD); return; }
    const res = await addNotaProgreso({
      socioId: id,
      instructorId: yo?.id ?? null,
      sesionId: null,
      textoLibre: aiNoteText,
      progreso: aiResult.progreso,
      alertas: aiResult.alertas,
      planProximaSesion: aiResult.planProximaSesion,
      ejerciciosCasa: aiResult.ejerciciosCasa,
    });
    if (!res.ok) { setToast('No se ha podido guardar la nota. Inténtalo de nuevo.'); return; }
    setAiNoteText('');
    setAiResult(null);
    setToast('Nota guardada');
  }

  async function handleSendMessage() {
    if (!socio) return;
    if (!msgForm.asunto.trim() || !msgForm.cuerpo.trim()) return;
    if (!socio.email) { setToast(`${mayuscula(t.la)} ${t.clienta} no tiene email registrado`); return; }
    // Antes solo actualizaba estado local y decía "Email enviado" sin enviar nada.
    // Ahora manda el email de verdad por Resend (/api/emails/send).
    setEnviandoMsg(true);
    const ok = await enviarEmailCampana({ to: socio.email, toName: socio.nombre, asunto: msgForm.asunto.trim(), contenido: msgForm.cuerpo.trim(), socioId: socio.id });
    setEnviandoMsg(false);
    if (!ok) { setToast('No se pudo enviar el email'); return; }
    // El registro real lo crea el servidor (/api/emails/send); se recarga el
    // historial en vez de simularlo aquí para reflejar el estado que la BD
    // acaba de guardar, no una suposición optimista.
    obtenerComunicacionesSocio(socio.id).then(data => { if (data) setComunicaciones(data); });
    setMsgForm({ asunto: '', cuerpo: '' });
    setShowSendMessage(false);
    setToast('Email enviado');
  }

  // ── Sessions progress ──────────────────────────────────────────────────────
  //
  // El saldo de TODOS sus bonos vigentes, no el de la suscripción que haya
  // caído en esta tarjeta. `resumenSocio` la elige con un `.find()` sobre un
  // array que llega SIN `order by`, así que el número que salía aquí lo
  // decidía Postgres — y, peor, no se movía al comprarle otro bono: la fila
  // nueva se añadía detrás y la tarjeta seguía enseñando la vieja. Los bonos
  // sueltos siguen listados debajo, en `otrosBonosActivos`.
  //
  // Solo cuando la tarjeta ya está enseñando un plan de sesiones: si la que
  // salió es una MENSUAL ilimitada, pintarle debajo una fracción de bonos
  // sería mezclar dos cosas distintas bajo el mismo título.
  const tarjetaCuentaSesiones = suscripcion?.sesionesRestantes != null;
  const saldoBonos = tarjetaCuentaSesiones
    ? saldoSesionesBono(id, suscripciones, planesTarifa, localDate(now))
    : null;
  const sesionesRestantes = saldoBonos ? saldoBonos.restantes : (suscripcion?.sesionesRestantes ?? null);
  const sesionesTotales = saldoBonos ? saldoBonos.total : (plan?.sesiones ?? null);
  // "Caduca en N días"/"Próxima renovación en N días" — mismo cálculo puro
  // reutilizado por la tabla de Clientas y por el portal de la socia.
  const estadoSus = calcularEstadoSuscripcion(suscripcion ?? null, plan ?? null);
  const textoCaducidadSus = textoCaducidad(estadoSus);
  const colorCaducidadSus =
    estadoSus.kind === 'bono' ? (estadoSus.caducado ? 'var(--destructive)' : estadoSus.urgente ? 'var(--warning)' : 'var(--muted-foreground)') :
    estadoSus.kind === 'recurrente' ? (estadoSus.urgente ? 'var(--warning)' : 'var(--muted-foreground)') :
    'var(--muted-foreground)';
  const sesionesColor =
    sesionesRestantes === 0 ? 'var(--destructive)' :
    sesionesRestantes !== null && sesionesRestantes <= 2 ? 'var(--warning)' :
    'var(--success)';

  // ─────────────────────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────────────────────

  // ── Lo que enseña la cabecera, en palabras ───────────────────────────────────
  const nombreCompleto = `${socio.nombre} ${socio.apellidos ?? ''}`.trim();
  const estadoEsta = estadosTodas.porSocio.get(id) ?? null;
  const aviso = avisoDe(id);
  const hoyTxt = hoyISO ?? localDate(now);

  // Los contactos apuntados a mano (tipo 'contacto'), del más reciente al más antiguo.
  const contactosSuyos: ContactoApuntado[] = comunicaciones
    .filter(c => c.tipo === 'contacto' && !!c.canal)
    .map(c => ({
      id: c.id, canal: c.canal as CanalContacto, resultado: (c.resultado ?? null) as ResultadoContacto | null,
      nota: c.nota ?? null, en: c.creadoEn, autorUid: c.creadoPor ?? null, autorNombre: c.creadoPorNombre,
    }))
    .sort((a, b) => b.en.localeCompare(a.en));
  // El aviso está atendido si se habló con ella después de que saltara (los de
  // dinero no: siguen hasta que se cobra).
  const avisoAtendido = !!aviso && !aviso.dinero && contactoTrasElAviso(contactosSuyos, aviso.desde, now);
  const ultimoContactoSuyo = contactosSuyos[0] ?? null;
  const textoContacto = (c: ContactoApuntado) => {
    const dia = hoyEnEstudio(new Date(c.en));
    const cuando = dia === hoyTxt ? 'hoy' : `el ${fechaCorta(dia, hoyTxt)}`;
    const quien = c.autorNombre ? `${c.autorNombre} ` : '';
    // Cada canal en su verbo: «le escribió por WhatsApp», «habló con ella»…
    const como = c.canal === 'WHATSAPP' ? `le escribió ${cuando} por WhatsApp`
      : c.canal === 'EMAIL' ? `le escribió un correo ${cuando}`
        : c.canal === 'EN_PERSONA' ? `habló con ${t.ella} ${cuando} en el estudio`
          : `habló con ${t.ella} ${cuando} por teléfono`;
    return `${quien}${como}${c.resultado ? `: ${ETIQUETA_RESULTADO[c.resultado].toLowerCase()}` : ''}.`;
  };
  const puedeBorrarContacto = (c: { autorUid: string | null }) => rol === 'PROPIETARIO' || (!!c.autorUid && c.autorUid === user?.id);

  // Quién escribió cada nota: «Tú», «Ana · recepción»…
  const autoras = {
    uid: user?.id ?? null,
    ownerUid: studio?.ownerAuthUserId ?? null,
    equipo: instructores.map(i => ({ authUserId: i.authUserId ?? null, nombre: i.nombre, rol: i.rol })),
  };
  // A quién se le puede pasar un seguimiento: quien gestiona clientas en el equipo.
  const equipoSeguimientos = [
    ...instructores
      .filter(i => i.activo !== false && !!i.authUserId && (i.rol === 'PROPIETARIO' || i.rol === 'MANAGER' || i.rol === 'RECEPCION'))
      .map(i => ({ uid: i.authUserId as string, nombre: i.nombre })),
    ...(studio?.ownerAuthUserId && !instructores.some(i => i.authUserId === studio.ownerAuthUserId)
      ? [{ uid: studio.ownerAuthUserId, nombre: 'La propietaria' }] : []),
  ];
  // Lo fijado sube a la cabecera: es lo primero que se lee antes de atenderla.
  const notasFijadas = puedeVerNotasInternas(rol)
    ? misNotas.filter(n => n.fijada && notaVisiblePara(n, rol, user?.id ?? null))
    : [];
  const estrecha = modo === 'panel';
  const telefonoLimpio = socio.telefono ? socio.telefono.replace(/[^0-9+]/g, '') : '';
  const waHref = enlaceWhatsApp(socio.telefono, `¡Hola ${socio.nombre}!`);
  const plazaFijaViva = plazasFijas.some(p => p.socioId === id && p.estado !== 'BAJA');
  const reservaPermitida = puedeGestionarCalendario(rol);

  // «Recomendada por Laura Martín» / «Llegó por: instagram».
  const recomendadaPor = socio.referidoPor ? socios.find(s => s.id === socio.referidoPor) : null;
  const comoLlego = recomendadaPor
    ? `Recomendada por ${recomendadaPor.nombre} ${recomendadaPor.apellidos ?? ''}`.trim()
    : socio.origenLead ? `Llegó por: ${socio.origenLead}` : null;

  // Su clase de prueba, si la tuvo: cuándo, y si compró después.
  const pruebaSuya = suscripciones
    .filter(s => s.socioId === id && planesTarifa.find(p => p.id === s.planId)?.esPrueba)
    .sort((a, b) => a.fechaInicio.localeCompare(b.fechaInicio))[0] ?? null;
  const compraTrasPrueba = pruebaSuya
    ? suscripciones
      .filter(s => s.socioId === id && !planesTarifa.find(p => p.id === s.planId)?.esPrueba && s.fechaInicio >= pruebaSuya.fechaInicio)
      .sort((a, b) => a.fechaInicio.localeCompare(b.fechaInicio))[0] ?? null
    : null;
  const creditos = memberCredits.find(m => m.socioId === id) ?? null;

  const proximaClase = proximasReservas.find(r => r.estado === 'CONFIRMADA') ?? proximasReservas[0] ?? null;
  const ultimaAsistida = misReservas.find(r => r.estado === 'ASISTIDA' && (sesionById.get(r.sesionId)?.inicio ?? '') <= now.toISOString()) ?? null;
  const infoUltima = ultimaAsistida ? getReservaInfo(ultimaAsistida) : null;
  const inicioUltima = ultimaAsistida ? sesionById.get(ultimaAsistida.sesionId)?.inicio ?? null : null;

  const valoracionHecha = !!(historialValoracion.actual && historialValoracion.inicial);

  // Debajo del nombre del plan: desde cuándo, y qué le toca después (renovación o
  // caducidad, salvo que esté en rojo: eso va aparte y con color).
  const lineaPlan = (() => {
    if (!plan || !suscripcion) return null;
    const partes = [`Desde ${fechaCorta(suscripcion.fechaInicio.slice(0, 10), hoyTxt)}`];
    const urgente = estadoSus.kind === 'bono' ? estadoSus.caducado || estadoSus.urgente : estadoSus.kind === 'recurrente' && estadoSus.urgente;
    if (suscripcion.estado === 'ACTIVA' && !suscripcion.bajaAlVencer && textoCaducidadSus && !urgente) partes.push(textoCaducidadSus.toLowerCase());
    return partes.join(' · ');
  })();
  // Un plan de «N por semana»: cuántas lleva esta (hechas y reservadas).
  const usoSemana = plan?.limiteSemanal && suscripcion?.estado === 'ACTIVA'
    ? {
        tope: plan.limiteSemanal,
        n: clasesEstaSemana(
          misReservas
            .filter(r => r.estado === 'CONFIRMADA' || r.estado === 'ASISTIDA' || r.estado === 'NO_ASISTIO')
            .map(r => sesionById.get(r.sesionId)?.inicio)
            .filter((x): x is string => !!x),
          now,
        ),
      }
    : null;

  // El plan en dos líneas: su nombre, y debajo lo que le queda y hasta cuándo.
  const celdaPlan = ((): { valor: string; detalle: string | null } => {
    if (!plan || !suscripcion) return { valor: 'Sin plan', detalle: estadoEsta?.estado === 'SIN_RENOVAR' ? 'se le acabó y no ha renovado' : null };
    if (suscripcion.estado === 'PAUSADA') return { valor: plan.nombre, detalle: 'pausado' };
    if (suscripcion.estado === 'CANCELADA') return { valor: plan.nombre, detalle: 'cancelado' };
    const partes: string[] = [];
    if (sesionesRestantes !== null) partes.push(`quedan ${sesionesRestantes}`);
    if (suscripcion.bajaAlVencer && suscripcion.fechaFin) partes.push(`se da de baja el ${fechaCorta(suscripcion.fechaFin.slice(0, 10), hoyTxt)}`);
    else if (textoCaducidadSus) partes.push(textoCaducidadSus.toLowerCase());
    // Otros bonos vivos además de este: el equipo decide si hay que activar algo.
    if (otrosBonosActivos.length > 0) partes.push(`+${otrosBonosActivos.length} ${otrosBonosActivos.length === 1 ? 'bono' : 'bonos'} más`);
    return { valor: plan.nombre, detalle: partes.join(' · ') || null };
  })();

  const adeudado = aCentimos(misRecibos.reduce((acc, r) => acc + importeAdeudado(r), 0));
  const celdas: CeldaCabecera[] = [
    { icono: CircleDollarSign, etiqueta: 'Plan', valor: celdaPlan.valor, detalle: celdaPlan.detalle, tono: !plan ? 'aviso' : undefined },
    // Cuándo arriba (es lo que se busca de un vistazo) y qué clase debajo.
    {
      icono: CalendarCheck, etiqueta: 'Próxima clase',
      valor: proximaClase ? mayuscula(cuandoClase(sesionById.get(proximaClase.sesionId)?.inicio ?? now.toISOString(), hoyTxt)) : 'Ninguna reservada',
      detalle: proximaClase ? `${getReservaInfo(proximaClase).label}${proximaClase.estado === 'LISTA_ESPERA' ? ' · en lista de espera' : ''}` : null,
      onClick: () => setActiveTab('reservas'),
    },
    {
      icono: Clock, etiqueta: 'Última clase',
      valor: infoUltima && inicioUltima ? mayuscula(haceCuanto(hoyEnEstudio(new Date(inicioUltima)), hoyTxt)) : 'Nunca ha venido',
      detalle: infoUltima && inicioUltima ? infoUltima.label : null,
    },
    verFinanzas
      ? {
          icono: CreditCard, etiqueta: 'Pendiente de cobro',
          // Lo que debe, como «Pendiente cobro» de Cobros (docs/cifras-financieras.md):
          // por cobrar + impagado. Con solo lo pendiente, una clienta con un cobro
          // fallido salía con «Nada» justo encima de «Tiene un pago fallido».
          valor: adeudado > 0 ? formatEuro(adeudado) : 'Nada',
          detalle: pagosFallidos.length > 0 ? (pagosFallidos.length === 1 ? '1 pago fallido' : `${pagosFallidos.length} pagos fallidos`) : null,
          tono: pagosFallidos.length > 0 ? 'problema' : adeudado > 0 ? 'aviso' : undefined,
          onClick: () => setActiveTab('pagos'),
        }
      : { icono: CalendarClock, etiqueta: 'Este mes', valor: `${estesMes} ${estesMes === 1 ? 'clase' : 'clases'}` },
  ];

  const alertas: AlertaCabecera[] = [];
  for (const n of notasFijadas.slice(0, 2)) {
    const autora = nombreAutora(n.autorUid, autoras);
    alertas.push({
      icono: Pin,
      tono: 'neutro',
      texto: <><strong className="font-semibold">{n.texto.length > 140 ? `${n.texto.slice(0, 140)}…` : n.texto}</strong>{autora ? <span className="text-muted-foreground"> · {autora}</span> : null}</>,
    });
  }
  if (verSemaforo && semaforoSocio !== 'VERDE') {
    alertas.push({
      icono: HeartPulse, tono: semaforoSocio === 'ROJO' ? 'problema' : 'aviso',
      texto: <>Salud: <strong className="font-semibold">{SEMAFORO_META[semaforoSocio].label}</strong>{verFichaClinica ? ' · ver su ficha' : ''}</>,
      onClick: verFichaClinica ? () => setActiveTab('salud') : undefined,
    });
  }
  if (!socio.aceptacionContrato) {
    alertas.push({ icono: FileSignature, tono: 'aviso', texto: 'Falta que acepte el contrato: se le pide al reservar', onClick: gestionaClientas ? () => setActiveTab('datos') : undefined });
  }
  if (verFinanzas && pagosFallidos.length > 0) {
    alertas.push({ icono: AlertTriangle, tono: 'problema', texto: pagosFallidos.length === 1 ? 'Tiene un pago fallido' : `Tiene ${pagosFallidos.length} pagos fallidos`, onClick: () => setActiveTab('pagos') });
  }
  const cumpleCerca = hoyISO ? proximoCumple(cumpleMesDia(socio), hoyISO) : null;
  if (cumpleCerca) alertas.push({ icono: Gift, texto: `Cumple años ${cumpleCerca}` });

  const menu: AccionMenu[] = [
    ...(gestionaClientas ? [{ texto: 'Apuntar un contacto', icono: MessagesSquare, onClick: () => setApuntando({ canal: null }) }] : []),
    ...(gestionaClientas ? [{ texto: `Recordar algo de ${t.ella}`, icono: Bell, onClick: () => setRecordando({ titulo: tituloPropuesto(socio.nombre, null), recomendacionId: null }) }] : []),
    ...(gestionaClientas ? [{ texto: 'Editar sus datos', icono: Pencil, onClick: openEdit }] : []),
    ...(gestionaClientas && socio.email ? [{ texto: 'Escribirle un correo', icono: Mail, onClick: () => setShowSendMessage(true) }] : []),
    ...(gestionaClientas && socio.email ? [{ texto: enviandoAcceso ? 'Enviando el acceso…' : 'Enviarle el acceso a la app', icono: Smartphone, onClick: () => void enviarAccesoApp() }] : []),
    ...(puedeCobrar ? [{ texto: plan ? 'Cambiar su plan' : 'Asignarle un plan', icono: CircleDollarSign, onClick: () => setShowChangePlan(true) }] : []),
    ...(puedeCobrar ? [{ texto: 'Anotar un cobro', icono: Plus, onClick: () => setShowAddRecibo(true) }] : []),
    { texto: 'Cambiar su foto', icono: ImageIcon, onClick: () => setShowAvatarPicker(v => !v) },
    ...(gestionaClientas
      ? [socio.activo === false
        ? { texto: dandoDeAlta ? 'Dando de alta…' : `Volver a dar${t.lo} de alta`, icono: UserCheck, onClick: () => void handleVolverADarDeAlta(), separar: true }
        : { texto: 'Dar de baja', icono: UserX, onClick: () => setShowBaja(true), separar: true }]
      : []),
    ...(puedeBorrarDatosClienta(rol) ? [{ texto: 'Borrar sus datos', icono: Trash2, onClick: () => setShowConfirmDelete(true), peligro: true }] : []),
  ];

  const pestanas: { id: Tab; nombre: string }[] = [
    { id: 'resumen', nombre: 'Resumen' },
    { id: 'historia', nombre: 'Historia' },
    { id: 'reservas', nombre: 'Reservas' },
    ...(verFinanzas ? [{ id: 'pagos' as Tab, nombre: 'Pagos' }] : []),
    ...(verFichaClinica ? [{ id: 'salud' as Tab, nombre: 'Salud' }] : []),
    // Mismo rol que puede subir/borrar (puedeGestionarClientas, espejo de la
    // RLS de `documentos_socio`) — sin esto la pestaña se enseñaría a quien
    // luego recibiría un 403 al abrirla.
    ...(gestionaClientas ? [{ id: 'documentos' as Tab, nombre: 'Documentos' }] : []),
    ...(gestionaClientas ? [{ id: 'datos' as Tab, nombre: 'Datos y permisos' }] : []),
  ];


  // El último correo que le mandó alguien del equipo (los automáticos no cuentan).
  const ultimoCorreoDelEquipo = [...comunicaciones]
    .filter(c => c.tipo !== 'contacto' && !!c.creadoPorNombre)
    .sort((a, b) => b.creadoEn.localeCompare(a.creadoEn))[0] ?? null;

  const constanciaSuya = constancia(
    misReservas.filter(r => r.estado === 'ASISTIDA').map(r => sesionById.get(r.sesionId)?.inicio).filter((x): x is string => !!x),
    now,
  );

  const eventosHistoria = historiaDeClienta({
    fechaAlta: socio.fechaAlta,
    reservas: misReservas.map(r => {
      const ses = sesionById.get(r.sesionId);
      return {
        id: r.id, estado: r.estado, inicio: ses?.inicio ?? null,
        claseCancelada: ses?.cancelada ?? false,
        tipoClase: ses ? tiposClase.find(tc => tc.id === ses.tipoClaseId)?.nombre ?? null : null,
        instructora: ses ? instructores.find(x => x.id === ses.instructorId)?.nombre ?? null : null,
      };
    }),
    recibos: misRecibos.map(r => ({
      id: r.id, concepto: r.concepto, importe: r.importe, estado: r.estado,
      fechaVencimiento: r.fechaVencimiento, fechaCobro: r.fechaCobro, fechaDevolucion: r.fechaDevolucion,
    })),
    comunicaciones: comunicaciones.filter(c => c.tipo !== 'contacto'),
    contactos: contactosSuyos.map(c => ({ id: c.id, canal: c.canal, resultado: c.resultado, nota: c.nota, creadoEn: c.en, autor: c.autorNombre })),
    bajas: bajasSuyas.map(b => ({ id: b.id, motivo: esMotivoBaja(b.motivo) ? ETIQUETA_MOTIVO_BAJA[b.motivo] : null, bajaEn: b.bajaEn, altaEn: b.altaEn })),
    seguimientos: (seguimientos ?? [])
      .filter(sg => sg.estado === 'HECHA' && !!sg.completadoEn)
      .map(sg => ({ id: sg.id, titulo: sg.titulo, completadoEn: sg.completadoEn as string, quien: nombreAutora(sg.hechaPor, autoras) })),
    notas: misNotas
      .filter(n => notaVisiblePara(n, rol, user?.id ?? null))
      .map(n => ({ id: n.id, texto: n.texto, tipo: n.tipo, creadoEn: n.creadoEn, autor: n.tipo === 'SISTEMA' ? null : nombreAutora(n.autorUid, autoras) })),
    planes: suscripciones
      .filter(x => x.socioId === id)
      .map(x => ({ id: x.id, plan: planesTarifa.find(p => p.id === x.planId)?.nombre ?? 'un plan', fechaInicio: x.fechaInicio })),
  }, { verDinero: verFinanzas, verNotas: puedeVerNotasInternas(rol), ahora: now, genero: generoDe(socio.genero) });

  const historiaFiltrada = filtroHistoria === 'TODO' ? eventosHistoria : eventosHistoria.filter(e => e.grupo === filtroHistoria);
  // En «Todo», las clases de una misma semana van juntas; en «Clases», una a una.
  const itemsHistoria = compactarHistoria(historiaFiltrada, { agruparClases: filtroHistoria === 'TODO', meses: true, hoyISO: hoyTxt });
  const quedanEnHistoria = itemsHistoria.slice(historiaVisibles).filter(i => i.tipo === 'EVENTO').length;
  const loUltimo = compactarHistoria(eventosHistoria, { agruparClases: true, meses: false, hoyISO: hoyTxt }).slice(0, 5);
  const gruposHistoria: { id: 'TODO' | GrupoHistoria; nombre: string }[] = [
    { id: 'TODO', nombre: 'Todo' },
    { id: 'CONTACTOS', nombre: 'Contactos' },
    { id: 'CLASES', nombre: 'Clases' },
    ...(verFinanzas ? [{ id: 'PAGOS' as const, nombre: 'Pagos' }] : []),
    { id: 'AVISOS', nombre: 'Avisos automáticos' },
    ...(puedeVerNotasInternas(rol) ? [{ id: 'NOTAS' as const, nombre: 'Notas' }] : []),
  ];

  // Reenviar el acceso a su app: el correo de bienvenida con su enlace. Solo se
  // dice «enviado» si el servidor lo ha aceptado.
  async function enviarAccesoApp() {
    if (enviandoAcceso || !socio?.email) return;
    setEnviandoAcceso(true);
    const ok = await enviarEmailBienvenida({ to: socio.email, toName: nombreCompleto, socioId: socio.id });
    setEnviandoAcceso(false);
    setToast(ok ? `Le hemos mandado a ${socio.nombre} el enlace para entrar en su app` : 'No se ha podido mandar el acceso. Vuelve a intentarlo.');
  }

  // Borrar un contacto apuntado por error: solo quien lo apuntó o la propietaria
  // (lo vuelve a comprobar el servidor). Se pregunta antes: no se puede deshacer.
  async function quitarContacto(contactoId: string) {
    if (borrandoContacto) return;
    setBorrandoContacto(contactoId);
    const r = await borrarContacto(id, contactoId);
    setBorrandoContacto(null);
    setContactoABorrar(null);
    if (!r.ok) { setToast(r.error); return; }
    await recargarComunicaciones();
    setToast('Contacto borrado');
  }

  // Volver a la lista donde estaba: si se vino de ella, atrás (la lista guarda
  // sus filtros en la URL); si no, a la lista sin más.
  function volverALista(e: React.MouseEvent) {
    if (typeof document !== 'undefined' && document.referrer.includes('/clientas') && window.history.length > 1) {
      e.preventDefault();
      router.back();
    }
  }

  return (
    <div className={cn(modo === 'pagina' && 'min-h-dvh pb-24')} style={modo === 'pagina' ? { backgroundColor: 'var(--background)' } : undefined}>
      <div className={cn('space-y-4', modo === 'pagina' && 'mx-auto max-w-6xl')}>
        {modo === 'pagina' && (
          <Link href="/clientas" onClick={volverALista} className="inline-flex min-h-10 items-center gap-1.5 rounded-lg pr-2 text-[13.5px] font-semibold text-muted-foreground hover:text-foreground">
            <ArrowLeft size={16} aria-hidden />
            Clientas
          </Link>
        )}

        <CabeceraFicha
          estrecha={estrecha}
          avatar={
            <button type="button" onClick={() => setShowAvatarPicker(v => !v)} aria-label="Cambiar su foto" className="shrink-0 rounded-full focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50">
              <ProfileAvatar avatarId={socio.avatar} nombre={socio.nombre} apellidos={socio.apellidos} size="lg" />
            </button>
          }
          nombre={nombreCompleto}
          pastillas={
            <>
              {estadoEsta && <PastillaEstado estado={estadoEsta.estado} desde={textoDesde(estadoEsta, hoyTxt, { baja: bajasSuyas.find(b => !b.altaEn) })} grande />}
              {aviso && <PastillaAviso aviso={aviso} ella={t.ella} />}
              {plazaFijaViva && (
                <span
                  data-testid="etiqueta-clienta-fija"
                  title="Tiene plaza fija: se le reserva sola cada semana"
                  className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-2.5 py-1 text-[12.5px] font-medium text-foreground"
                >
                  <CalendarClock size={13} aria-hidden />
                  {etiquetaFija(socio.genero)}
                </span>
              )}
            </>
          }
          contacto={
            // Los puntos solo donde cabe todo en una línea: en el móvil, al
            // partirse, el «·» quedaba colgando al principio de la segunda.
            <span className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
              {[
                socio.telefono ? <span key="t" className="whitespace-nowrap">{telefonoLegible(socio.telefono)}</span> : null,
                socio.email ? <span key="e" className="break-all">{socio.email}</span> : null,
                comoLlego ? <span key="c">{comoLlego}</span> : null,
              ].filter(Boolean).flatMap((x, i) => i === 0 ? [x] : [<span key={`p${i}`} aria-hidden className="hidden sm:inline">·</span>, x])}
            </span>
          }
          acciones={
            <>
              <AccionGrande icono={MessageCircle} primaria href={waHref} externo disabled={!waHref} title={waHref ? undefined : 'No tiene teléfono'} onClick={() => setContactoEnCurso('WHATSAPP')}>WhatsApp</AccionGrande>
              <AccionGrande icono={Phone} href={telefonoLimpio ? `tel:${telefonoLimpio}` : null} disabled={!telefonoLimpio} title={telefonoLimpio ? undefined : 'No tiene teléfono'} onClick={() => setContactoEnCurso('LLAMADA')}>Llamar</AccionGrande>
              <AccionGrande icono={CalendarPlus} onClick={() => setShowReservar(true)} disabled={!reservaPermitida || socio.activo === false} title={socio.activo === false ? 'Está de baja' : undefined}>Reservar</AccionGrande>
            </>
          }
          menu={menu}
          celdas={celdas}
          alertas={alertas}
        />

        {contactoEnCurso && gestionaClientas && (
          <PreguntaTrasContacto
            nombre={socio.nombre}
            canal={contactoEnCurso}
            onApuntar={() => { setApuntando({ canal: contactoEnCurso }); setContactoEnCurso(null); }}
            onDescartar={() => setContactoEnCurso(null)}
          />
        )}

        {showAvatarPicker && (
          <div className="rounded-2xl border border-border bg-card p-4">
            <AvatarPicker value={socio.avatar ?? null} onChange={nuevo => { void updateSocio(socio.id, { avatar: nuevo }).then(res => { if (!res.ok) setToast(res.error); }); }} />
          </div>
        )}

        {reboteCorreo && (
          <div className="rounded-2xl border border-destructive/30 bg-destructive/[0.05] p-4">
              {reboteCorreo && (
                <div className="flex items-start gap-2 rounded-lg bg-destructive/10 px-2.5 py-2">
                  <AlertTriangle size={13} className="text-destructive shrink-0 mt-0.5" />
                  <div className="text-[11px] leading-snug text-destructive">
                    <p>
                      <span className="font-semibold">No le está llegando el correo.</span>{' '}
                      {motivoLegible(reboteCorreo)}. Corrige la dirección en «Editar» y volverá a
                      recibir recordatorios, facturas y accesos.
                    </p>
                    {/* I-8: si la dirección ya es correcta (typo corregido, o
                        confirmado con ella que su buzón funciona), esto es lo
                        único que la desatasca — sin webhook posible que lo
                        haga solo, ver lib/emails/reactivar-buzon.ts. */}
                    {gestionaClientas && (
                      <button
                        type="button"
                        onClick={() => {
                          if (window.confirm(`¿Reactivar ${socio.email}? Solo hazlo si ya has confirmado que este buzón funciona.`)) {
                            reactivarBuzon();
                          }
                        }}
                        disabled={reactivandoBuzon}
                        className="mt-1 font-semibold underline underline-offset-2 disabled:opacity-50"
                      >
                        {reactivandoBuzon ? 'Reactivando…' : 'Ya funciona: reactivar'}
                      </button>
                    )}
                  </div>
                </div>
              )}

          </div>
        )}

        {aviso && (
          <PorQueTeAviso
            aviso={aviso}
            atendido={avisoAtendido && ultimoContactoSuyo
              ? <>{mayuscula(textoContacto(ultimoContactoSuyo))} El Centro de Control lo retira solo en su próxima revisión.</>
              : null}
            contexto={
              <>
                {!avisoAtendido && (ultimoContactoSuyo
                  ? `Último contacto: ${textoContacto(ultimoContactoSuyo)} `
                  : ultimoCorreoDelEquipo
                    ? `Último correo del equipo: ${fechaCorta(hoyEnEstudio(new Date(ultimoCorreoDelEquipo.creadoEn)), hoyTxt)}${ultimoCorreoDelEquipo.creadoPorNombre ? ` (${ultimoCorreoDelEquipo.creadoPorNombre})` : ''}. `
                    : comunicacionesCargadas ? 'Nadie del equipo le ha escrito todavía. ' : '')}
                {aviso.origen === 'CENTRO_DE_CONTROL' && (
                  // Directo a SU situación, con el detalle abierto: el Centro sin más
                  // la dejaba plegada entre todas las demás.
                  <Link
                    href={aviso.recomendacionId ? `/centro-de-control?rec=${encodeURIComponent(aviso.recomendacionId)}` : '/centro-de-control?detalle=1'}
                    className="font-semibold text-foreground underline-offset-2 hover:underline"
                  >
                    Ver en el Centro de Control
                  </Link>
                )}
              </>
            }
            acciones={aviso.dinero ? (
              <>
                <AccionGrande icono={CreditCard} primaria onClick={() => setActiveTab('pagos')}>Ver sus pagos</AccionGrande>
                {gestionaClientas && <AccionGrande icono={MessagesSquare} onClick={() => setApuntando({ canal: null })}>Ya hablé con {t.ella}</AccionGrande>}
              </>
            ) : (
              <>
                {!avisoAtendido && (
                  <AccionGrande icono={MessageCircle} primaria href={waHref} externo disabled={!waHref} onClick={() => setContactoEnCurso('WHATSAPP')}>Escribirle por WhatsApp</AccionGrande>
                )}
                {gestionaClientas && (
                  <AccionGrande icono={Check} onClick={() => setApuntando({ canal: null })}>{avisoAtendido ? 'Apuntar otro contacto' : `Ya hablé con ${t.ella}`}</AccionGrande>
                )}
                {gestionaClientas && (
                  <AccionGrande icono={Bell} onClick={() => setRecordando({ titulo: tituloPropuesto(socio.nombre, aviso.etiqueta), recomendacionId: aviso.recomendacionId ?? null })}>Recuérdamelo</AccionGrande>
                )}
              </>
            )}
          />
        )}

        {/* Pestañas: con su URL en la página (?pestana=pagos), para volver a la misma. */}
        <div role="tablist" aria-label="Secciones de la ficha" className="-mx-4 flex gap-1 overflow-x-auto border-b border-border px-4 sm:mx-0 sm:px-0">
          {pestanas.map(p => (
            <button
              key={p.id}
              role="tab"
              aria-selected={activeTab === p.id}
              onClick={() => setActiveTab(p.id)}
              className={cn(
                '-mb-px min-h-11 shrink-0 whitespace-nowrap border-b-2 px-3 text-[14px] font-medium transition-colors',
                activeTab === p.id ? 'border-foreground text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground',
              )}
            >
              {p.nombre}
            </button>
          ))}
        </div>

        <ReanimarAlCambiar clave={activeTab} animClassName="tab-content-in">
          {activeTab === 'resumen' && (
            <div className={cn('grid items-start gap-4', !estrecha && 'lg:grid-cols-[minmax(0,1fr)_340px]')}>
              <div className="min-w-0 space-y-4">
                {/* La valoración va PRIMERO: lo que la define es qué busca y de
                    dónde parte, no cuánto paga. Solo la mitad NO clínica. Si no
                    la ha rellenado, no ocupa el primer sitio: se dice en «Sobre ella». */}
                {valoracionHecha && <FichaValoracion historial={historialValoracion} />}

                <TarjetaFicha
                  id="plan"
                  // Visto en producción (15-sep): decía «PLAN ACTIVO» encima de «Cancelada».
                  titulo={!suscripcion ? 'Plan' : suscripcion.estado === 'CANCELADA' ? 'Plan cancelado' : suscripcion.estado === 'PAUSADA' ? 'Plan pausado' : 'Plan'}
                  icono={<CircleDollarSign size={16} />}
                  accion={plan && suscripcion ? (
                    <div className="flex flex-wrap justify-end gap-1.5">
                      {/* Congelar, reanudar y cancelar escriben en `suscripciones`, y
                          estaban fuera de `verFinanzas`: una instructora las veía y
                          podía cancelarle el plan a una clienta. */}
                      {puedeCobrar && suscripcion.estado === 'ACTIVA' && (
                        <BotonTarjeta icono={Pause} onClick={async () => { const res = await pausarSuscripcion(suscripcion.id); if (!res.ok) setToast(res.error); }}>Pausar</BotonTarjeta>
                      )}
                      {puedeCobrar && suscripcion.estado === 'PAUSADA' && (
                        <BotonTarjeta icono={Play} onClick={async () => { const res = await reanudarSuscripcion(suscripcion.id); if (!res.ok) setToast(res.error); }}>Reanudar</BotonTarjeta>
                      )}
                      {/* Hallazgo B (auditoría dunning 2026-08-10): reactiva ESTA misma
                          suscripción (mismo id, con su histórico) — distinto de
                          «Asignar plan», que crea una fila nueva desde cero. */}
                      {puedeCobrar && suscripcion.estado === 'CANCELADA' && (
                        <BotonTarjeta
                          icono={Play}
                          disabled={reactivando}
                          onClick={async () => {
                            setReactivando(true);
                            try {
                              const res = await reactivarSuscripcion(suscripcion.id);
                              setToast(res.ok ? 'Suscripción reactivada' : res.error);
                            } finally {
                              setReactivando(false);
                            }
                          }}
                        >
                          {reactivando ? 'Reactivando…' : 'Reactivar'}
                        </BotonTarjeta>
                      )}
                      {verFinanzas && <BotonTarjeta onClick={() => setShowChangePlan(true)}>Cambiar plan</BotonTarjeta>}
                    </div>
                  ) : undefined}
                >
                  {plan && suscripcion ? (
                    <>
                      <div className="flex items-start justify-between gap-4">
                        <div className="min-w-0">
                          <p className="text-[16px] font-semibold text-foreground">{plan.nombre}</p>
                          <p className="mt-0.5 text-[12.5px] text-muted-foreground text-pretty">
                            {lineaPlan}
                            {usoSemana !== null && (
                              <> · <span className={cn(usoSemana.n >= usoSemana.tope && 'font-semibold text-foreground')}>esta semana, {usoSemana.n} de {usoSemana.tope}</span></>
                            )}
                          </p>
                          {textoCaducidadSus && suscripcion.estado === 'ACTIVA' && !suscripcion.bajaAlVencer && (estadoSus.kind === 'bono' ? estadoSus.caducado || estadoSus.urgente : estadoSus.kind === 'recurrente' && estadoSus.urgente) && (
                            <p className="mt-1 inline-flex items-center gap-1 text-[12.5px] font-semibold" style={{ color: colorCaducidadSus }}>
                              {estadoSus.kind === 'recurrente' ? <RefreshCw size={12} aria-hidden /> : <Calendar size={12} aria-hidden />}
                              {textoCaducidadSus}
                            </p>
                          )}
                        </div>
                        {verFinanzas && (
                          <p className="shrink-0 text-right">
                            <span className="text-[22px] font-semibold tabular-nums text-foreground">{formatEuro(plan.precio).replace(',00', '')}</span>
                            <span className="text-[12.5px] text-muted-foreground">{plan.tipo === 'MENSUAL' ? `/${nombrePeriodo(plan)}` : ''}</span>
                          </p>
                        )}
                      </div>

                      {/* Lo que le queda de un bono: la barra dice más rápido que el número. */}
                      {sesionesTotales !== null && sesionesRestantes !== null && (
                        <div className="mt-3">
                          <div className="mb-1 flex items-baseline justify-between gap-2 text-[12.5px]">
                            <span className="font-semibold tabular-nums" style={{ color: sesionesColor }}>
                              {sesionesRestantes === 0 ? 'Agotado' : `Quedan ${sesionesRestantes}`}
                            </span>
                            <span className="text-muted-foreground tabular-nums">de {sesionesTotales} {sesionesTotales === 1 ? 'sesión' : 'sesiones'}</span>
                          </div>
                          <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                            <div className="h-full rounded-full transition-all duration-500" style={{ width: `${Math.min((sesionesRestantes / Math.max(1, sesionesTotales)) * 100, 100)}%`, backgroundColor: sesionesColor }} />
                          </div>
                          {/* El aviso lo ve todo el mundo (a la instructora le sirve para saber
                              por qué no puede reservarle); el botón, solo quien cobra. */}
                          {sesionesRestantes <= 2 && puedeCobrar && (
                            <button type="button" onClick={() => setShowChangePlan(true)} className="mt-2 text-[12.5px] font-semibold text-foreground underline underline-offset-2">
                              {sesionesRestantes === 0 ? 'Renovar el bono' : 'Ofrecerle renovar'}
                            </button>
                          )}
                        </div>
                      )}

                      {/* Baja programada: «Próxima renovación en N días» sería mentira,
                          así que se dice la fecha de baja y cómo deshacerla. */}
                      {suscripcion.bajaAlVencer && suscripcion.estado === 'ACTIVA' && (
                        <p className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 rounded-xl bg-warning/10 px-3 py-2 text-[12.5px] font-medium text-warning">
                          <span className="inline-flex items-center gap-1">
                            <Calendar size={12} aria-hidden />
                            Se da de baja el {suscripcion.fechaFin ? fecha(suscripcion.fechaFin) : 'final del periodo'} · no se generarán más cobros de esta cuota
                          </span>
                          {puedeCobrar && (
                            <button type="button" onClick={() => handleProgramarBaja(false)} disabled={cambiandoPlan} className="font-semibold text-foreground underline underline-offset-2 disabled:opacity-50">
                              Deshacer
                            </button>
                          )}
                        </p>
                      )}

                      {puedeCobrar && suscripcion.estado !== 'CANCELADA' && (
                        <button
                          type="button"
                          onClick={() => abrirCancelarSus()}
                          disabled={cambiandoPlan}
                          className="mt-3 text-[12.5px] font-medium text-muted-foreground underline-offset-2 hover:text-destructive hover:underline disabled:opacity-40"
                        >
                          {cambiandoPlan ? 'Cancelando…' : 'Cancelar suscripción'}
                        </button>
                      )}
                    </>
                  ) : (
                    <div className="flex flex-wrap items-center justify-between gap-3 py-1">
                      <p className="text-[13.5px] text-muted-foreground">No tiene ningún plan ahora mismo.</p>
                      {puedeCobrar && (
                        <button type="button" onClick={() => setShowChangePlan(true)} className="inline-flex min-h-10 items-center gap-1.5 rounded-xl bg-primary px-3.5 text-[13px] font-semibold text-primary-foreground hover:brightness-95">
                          <Plus size={15} aria-hidden /> Asignar plan
                        </button>
                      )}
                    </div>
                  )}
                </TarjetaFicha>

                {/* Sus próximas clases, por orden. */}
                {proximasReservas.length > 0 && (
                  <TarjetaFicha
                    titulo="Próximas clases"
                    icono={<CalendarCheck size={16} />}
                    accion={reservaPermitida && socio.activo !== false ? (
                      <button type="button" onClick={() => setShowReservar(true)} className="inline-flex items-center gap-1 text-[12.5px] font-semibold text-foreground hover:underline underline-offset-2">
                        <Plus size={14} aria-hidden /> Reservar otra
                      </button>
                    ) : undefined}
                  >
                    <ul className="space-y-2">
                      {proximasReservas.map(r => {
                        const info = getReservaInfo(r);
                        const badge = BADGE_RESERVA[r.estado] ?? BADGE_RESERVA.CANCELADA;
                        const inicio = sesionById.get(r.sesionId)?.inicio ?? null;
                        return (
                          <li key={r.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl bg-muted/60 px-3.5 py-3">
                            <span className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: info.color }} aria-hidden />
                            <div className="min-w-[10rem] flex-1">
                              <p className="text-[13.5px] font-semibold text-foreground">
                                {info.label}
                                {inicio && <span className="font-normal text-muted-foreground"> · {cuandoClase(inicio, hoyTxt)}</span>}
                              </p>
                              <p className="text-[12.5px] text-muted-foreground">{[info.instructor && `con ${info.instructor}`, info.sala].filter(Boolean).join(' · ')}</p>
                            </div>
                            <div className="flex shrink-0 items-center gap-2 max-sm:w-full max-sm:pl-[22px]">
                              <span className="rounded-full px-2.5 py-1 text-[12px] font-semibold" style={{ backgroundColor: badge.bg, color: badge.text }}>
                                {badge.label}
                              </span>
                              {r.estado === 'CONFIRMADA' && <BotonBajaRecuperacion reserva={r} socio={socio} />}
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  </TarjetaFicha>
                )}

                <TarjetaFicha titulo="Constancia" icono={<CalendarClock size={16} />} accion={<span className="text-[12px] text-muted-foreground">Últimas 12 semanas</span>}>
                  <BarrasConstancia semanas={constanciaSuya.semanas} />
                  <p className="mt-2 text-[12.5px] text-muted-foreground text-pretty">
                    {constanciaSuya.media === null
                      ? 'Todavía no ha venido a ninguna clase en estas semanas.'
                      : <><strong className="font-semibold text-foreground">{String(constanciaSuya.media).replace('.', ',')} clases por semana</strong> de media{constanciaSuya.semanasSinVenir >= 2 ? ` · lleva ${constanciaSuya.semanasSinVenir} semanas sin venir` : ''}</>}
                  </p>
                  <p className="mt-1 text-[12.5px] text-muted-foreground">
                    {asistidas === 0 ? 'Aún no ha venido a ninguna clase.' : `Ha venido a ${asistidas} ${asistidas === 1 ? 'clase' : 'clases'} en total`}
                    {verFinanzas && totalGastado > 0 ? ` · ha pagado ${formatEuro(totalGastado)}` : ''}
                  </p>
                </TarjetaFicha>
                <TarjetaFicha
                  titulo="Lo último"
                  icono={<Clock size={16} />}
                  accion={eventosHistoria.length > 5 ? (
                    <button type="button" onClick={() => setActiveTab('historia')} className="inline-flex items-center gap-1 text-[12.5px] font-semibold text-foreground hover:underline underline-offset-2">
                      Toda la historia <ChevronRight size={14} aria-hidden />
                    </button>
                  ) : undefined}
                >
                  <LineaHistoria items={loUltimo} hoyISO={hoyISO} />
                </TarjetaFicha>
              </div>
              <div className="min-w-0 space-y-4">
                  {gestionaClientas && (
                    <TarjetaSeguimiento
                      seguimientos={seguimientos}
                      error={errorSeguimientos}
                      hoyISO={hoyTxt}
                      uid={user?.id ?? null}
                      equipo={equipoSeguimientos}
                      puedeBorrarTodo={rol === 'PROPIETARIO'}
                      ella={t.ella}
                      lo={t.lo}
                      onNuevo={() => setRecordando({ titulo: tituloPropuesto(socio.nombre, aviso && !aviso.dinero ? aviso.etiqueta : null), recomendacionId: aviso?.recomendacionId ?? null })}
                      onCambio={() => void recargarSeguimientos()}
                      onToast={setToast}
                    />
                  )}

                  {/* Notas del equipo: quién las escribió y para quién son (RLS de notas_internas). */}
                  {puedeVerNotasInternas(rol) && (
                    <NotasDelEquipo socioId={id} notas={misNotas} rol={rol} autoras={autoras} hoyISO={hoyTxt} ella={t.ella} onToast={setToast} />
                  )}

                <TarjetaFicha titulo="Etiquetas" icono={<Tag size={16} />}>
                  <div className="flex flex-wrap gap-1.5">
                    {tags.map(tag => (
                      <span key={tag} className="inline-flex items-center gap-1 rounded-full border border-border bg-muted px-2.5 py-1 text-[12.5px] font-medium text-foreground">
                        {tag}
                        {gestionaClientas && (
                          <button onClick={async () => { const res = await removeTagSocio(id, tag); if (!res.ok) setToast(res.error); }} aria-label={`Quitar la etiqueta ${tag}`} className="-mr-1 rounded-full p-0.5 text-muted-foreground hover:text-foreground">
                            <X size={12} />
                          </button>
                        )}
                      </span>
                    ))}
                    {gestionaClientas && (
                      <button onClick={() => setShowAddTag(true)} className="inline-flex items-center gap-1 rounded-full border border-dashed border-input px-2.5 py-1 text-[12.5px] font-medium text-muted-foreground hover:border-foreground hover:text-foreground">
                        <Plus size={12} aria-hidden /> Añadir
                      </button>
                    )}
                    {tags.length === 0 && !gestionaClientas && <p className="text-[13px] text-muted-foreground">Sin etiquetas.</p>}
                  </div>
                </TarjetaFicha>
                <TarjetaFicha titulo={`Sobre ${t.ella}`} icono={<UserRound size={16} />} accion={gestionaClientas ? <button onClick={openEdit} className="text-[12.5px] font-semibold text-foreground hover:underline underline-offset-2">Editar</button> : undefined}>
                  <dl className="space-y-2.5">
                    <DatoSobreElla icono={Mail} etiqueta="Email" valor={socio.email || 'Sin email'} />
                    <DatoSobreElla icono={Phone} etiqueta="Teléfono" valor={socio.telefono ? telefonoLegible(socio.telefono) : 'Sin teléfono'} />
                    {veDatosPrivados && socio.nif && <DatoSobreElla icono={CreditCard} etiqueta="NIF" valor={socio.nif} />}
                    <DatoSobreElla icono={Calendar} etiqueta="Alta" valor={socio.fechaAlta ? fecha(socio.fechaAlta) : '—'} />
                    {comoLlego && <DatoSobreElla icono={Users} etiqueta="Cómo llegó" valor={comoLlego} />}
                    {pruebaSuya && (
                      <DatoSobreElla
                        icono={Sparkles}
                        etiqueta="Su prueba"
                        valor={`${fecha(pruebaSuya.fechaInicio)}${compraTrasPrueba ? ` · compró ${diasEntre(pruebaSuya.fechaInicio, compraTrasPrueba.fechaInicio) === 0 ? 'ese mismo día' : `a los ${diasEntre(pruebaSuya.fechaInicio, compraTrasPrueba.fechaInicio)} días`}` : ' · todavía no ha comprado'}`}
                      />
                    )}
                    {cumpleanos && <DatoSobreElla icono={Gift} etiqueta="Cumpleaños" valor={cumpleanos} />}
                    {creditos && creditos.saldo > 0 && <DatoSobreElla icono={Coins} etiqueta="Créditos" valor={`${creditos.saldo} para gastar`} />}
                    {!valoracionHecha && <DatoSobreElla icono={ListChecks} etiqueta="Valoración inicial" valor="Todavía no la ha rellenado" />}
                  </dl>
                </TarjetaFicha>
                  {/* Campos personalizados (solo lectura) */}
                  {camposPersonalizados.some(c => c.activo) && (
                    <div className="rounded-2xl border border-border bg-card shadow-xs p-5">
                      <SectionTitle>Datos adicionales</SectionTitle>
                      <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3 mt-4">
                        {camposPersonalizados.filter(c => c.activo).sort((a, b) => a.orden - b.orden).map(c => {
                          const v = socio.camposExtra?.[c.id];
                          const texto = v == null || v === ''
                            ? '—'
                            : c.tipo === 'booleano' ? (v ? 'Sí' : 'No') : String(v);
                          return (
                            <div key={c.id}>
                              <dt className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{c.etiqueta}</dt>
                              <dd className="text-sm font-medium text-foreground mt-0.5">{texto}</dd>
                            </div>
                          );
                        })}
                      </dl>
                    </div>
                  )}


              </div>
            </div>
          )}

          {activeTab === 'historia' && (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-1.5">
                {gruposHistoria.map(g => (
                  <button
                    key={g.id}
                    type="button"
                    onClick={() => { setFiltroHistoria(g.id); setHistoriaVisibles(30); }}
                    aria-pressed={filtroHistoria === g.id}
                    className={cn(
                      'min-h-9 rounded-full border px-3 text-[12.5px] font-medium',
                      filtroHistoria === g.id ? 'border-transparent bg-foreground text-background' : 'border-border bg-card text-foreground hover:bg-muted',
                    )}
                  >
                    {g.nombre}
                  </button>
                ))}
                {gestionaClientas && (
                  <span className="ml-auto flex flex-wrap gap-1.5">
                    <button type="button" onClick={() => setApuntando({ canal: null })} className="inline-flex min-h-9 items-center gap-1.5 rounded-xl border border-border bg-card px-3 text-[13px] font-semibold text-foreground hover:bg-muted">
                      <MessagesSquare size={14} aria-hidden /> Apuntar contacto
                    </button>
                    {socio.email && (
                      <button type="button" onClick={() => setShowSendMessage(true)} className="inline-flex min-h-9 items-center gap-1.5 rounded-xl border border-border bg-card px-3 text-[13px] font-semibold text-foreground hover:bg-muted">
                        <Send size={14} aria-hidden /> Escribirle un correo
                      </button>
                    )}
                  </span>
                )}
              </div>
              <div className="rounded-2xl border border-border bg-card px-4 py-3 shadow-xs sm:px-5">
                <LineaHistoria
                  items={itemsHistoria.slice(0, historiaVisibles)}
                  hoyISO={hoyISO}
                  vacio="No hay nada de este tipo todavía."
                  accion={e => {
                    if (e.tipo !== 'CONTACTO') return null;
                    const c = contactosSuyos.find(x => `con-${x.id}` === e.id);
                    if (!c || !puedeBorrarContacto(c)) return null;
                    return (
                      <button
                        type="button"
                        disabled={borrandoContacto === c.id}
                        onClick={() => setContactoABorrar(c.id)}
                        className="rounded-lg px-2 py-1 text-[12px] font-medium text-muted-foreground hover:bg-muted hover:text-destructive disabled:opacity-50"
                      >
                        {borrandoContacto === c.id ? 'Borrando…' : 'Borrar'}
                      </button>
                    );
                  }}
                />
                {quedanEnHistoria > 0 && (
                  <button type="button" onClick={() => setHistoriaVisibles(v => v + 30)} className="mt-1 w-full rounded-lg py-2 text-[13px] font-semibold text-foreground hover:bg-muted">
                    Ver más ({quedanEnHistoria})
                  </button>
                )}
                <p className="mt-2 border-t border-border pt-2.5 text-[12px] text-muted-foreground text-pretty">
                  Junta sus clases, sus cobros, los correos que se le han mandado y las notas. Solo se lee: aquí no se cambia nada.
                </p>
              </div>
            </div>
          )}

              {/* ═══ TAB: RESERVAS ══════════════════════════════════════════ */}
              {activeTab === 'reservas' && (
                <div className="space-y-4">
                  {/* Plaza fija (F2 · B2.2), recuperaciones (F2 · B2.3) y niveles: todo lo
                      que decide qué clases tiene y puede reservar, junto a sus reservas. */}
                  <FichaPlazaFija socioId={id} onToast={setToast} />
                  <FichaRecuperaciones socioId={id} onToast={setToast} />
                  {studio && <FichaClasesAutorizadas socioId={id} studioId={studio.id} onToast={setToast} />}
                  <div className="rounded-2xl border border-border bg-card shadow-xs p-4 sm:p-5">
                  {/* Filter row */}
                  <div className="flex items-center gap-2 mb-4">
                    <Filter size={14} className="text-muted-foreground" />
                    {(['todas', 'confirmadas', 'asistidas', 'canceladas'] as const).map(f => (
                      <button
                        key={f}
                        onClick={() => { setReservaFilter(f); setReservasPage(20); }}
                        className={cn(
                          'px-3 py-1.5 rounded-lg text-xs font-bold capitalize transition-colors',
                          reservaFilter === f ? 'bg-brand text-brand-foreground' : 'border border-border text-muted-foreground hover:border-muted-foreground'
                        )}
                      >
                        {f.charAt(0).toUpperCase() + f.slice(1)}
                      </button>
                    ))}
                    <span className="ml-auto text-xs font-medium text-muted-foreground">
                      {filteredReservas.length} reservas
                    </span>
                  </div>

                  {/* Table */}
                  {filteredReservas.length === 0 ? (
                    <div className="py-12 text-center">
                      <p className="text-sm font-medium text-muted-foreground">Sin reservas para este filtro.</p>
                    </div>
                  ) : (
                    <>
                      <div className="border border-border rounded-xl overflow-hidden">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="bg-muted border-b border-border">
                              <th className="text-left px-4 py-3 text-xs font-bold text-muted-foreground uppercase tracking-wider">Fecha</th>
                              <th className="text-left px-4 py-3 text-xs font-bold text-muted-foreground uppercase tracking-wider">Clase</th>
                              <th className="text-left px-4 py-3 text-xs font-bold text-muted-foreground uppercase tracking-wider hidden md:table-cell">Instructora</th>
                              <th className="text-left px-4 py-3 text-xs font-bold text-muted-foreground uppercase tracking-wider hidden lg:table-cell">Sala</th>
                              <th className="text-right px-4 py-3 text-xs font-bold text-muted-foreground uppercase tracking-wider">Estado</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-muted">
                            {filteredReservas.slice(0, reservasPage).map(r => {
                              const info = getReservaInfo(r);
                              const badge = BADGE_RESERVA[r.estado] ?? BADGE_RESERVA.CANCELADA;
                              return (
                                <tr key={r.id} className="hover:bg-muted transition-colors">
                                  <td className="px-4 py-3 text-xs font-medium text-muted-foreground whitespace-nowrap">
                                    {info.date}<br />
                                    <span className="text-muted-foreground">{info.time}</span>
                                  </td>
                                  <td className="px-4 py-3">
                                    <div className="flex items-center gap-2">
                                      <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: info.color }} />
                                      <span className="font-semibold text-foreground">{info.label}</span>
                                    </div>
                                  </td>
                                  <td className="px-4 py-3 text-muted-foreground hidden md:table-cell">{info.instructor}</td>
                                  <td className="px-4 py-3 text-muted-foreground hidden lg:table-cell">{info.sala}</td>
                                  <td className="px-4 py-3 text-right">
                                    <span className="text-xs font-bold px-2.5 py-1 rounded-full" style={{ backgroundColor: badge.bg, color: badge.text }}>
                                      {badge.label}
                                    </span>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                      {filteredReservas.length > reservasPage && (
                        <button
                          onClick={() => setReservasPage(p => p + 20)}
                          className="mt-3 w-full py-2.5 rounded-xl text-sm font-bold border border-border text-muted-foreground hover:bg-muted transition-colors"
                        >
                          Ver más ({filteredReservas.length - reservasPage} restantes)
                        </button>
                      )}
                    </>
                  )}

                  {/* Control de acceso con QR: su QR y sus accesos. Solo quien puede
                      escanear en el panel (la RLS de `accesos_escaneos` es la misma). */}
                  {puedeGestionarCalendario(rol) && <AccesosDeLaClienta socioId={id} />}
                </div>
                </div>
              )}


              {/* ═══ TAB: SALUD (ficha clínica) ═════════════════════════════ */}
              {activeTab === 'salud' && verFichaClinica && (
                <div className="space-y-4">
                  {/* Encima de la ficha clínica: es lo que declaró ELLA, y da
                      el contexto con el que leer todo lo demás. */}
                  <FichaValoracionSalud historial={historialValoracion} />
                  <FichaSalud socioId={id} now={now} onToast={setToast} />
                  {/* AI Instructor Notes — dato de seguimiento/salud de la
                      socia (progreso, alertas, ejercicios): mismo criterio que
                      la ficha clínica (verFichaClinica), no el de "gestiona
                      clientas". Antes se veía en el resumen general sin mirar
                      el rol — RECEPCIÓN podía leer y crear notas clínicas. */}
                  {verFichaClinica && (
                  <div className="rounded-2xl border border-border bg-card shadow-xs p-5">
                    <div className="flex items-center gap-2 mb-4">
                      <Bot size={15} className="text-muted-foreground" />
                      <SectionTitle>Nota de sesión IA</SectionTitle>
                      <span className="ml-auto text-[10px] bg-brand/10 text-brand-secondary px-2 py-0.5 rounded-full font-semibold">Beta</span>
                    </div>
                    <p className="text-xs text-muted-foreground mb-3">
                      Dicta o escribe lo que pasó en la sesión. La IA estructura automáticamente la nota de progreso.
                    </p>
                    {!socio?.consentimientoSalud && (
                      <p role="alert" className="text-xs font-semibold text-warning mb-3">
                        {SIN_CONSENTIMIENTO_SALUD} Hasta entonces no se pueden crear ni consultar sus notas de sesión.
                      </p>
                    )}
                    <div className="rounded-xl border border-border overflow-hidden focus-within:border-foreground transition-colors mb-3">
                      <textarea
                        rows={3}
                        placeholder='Ej: "Hoy mejoró la alineación en el roll-up. Sigue con tensión cervical. Próxima sesión: movilidad torácica. Ejercicios de respiración para casa."'
                        value={aiNoteText}
                        onChange={e => setAiNoteText(e.target.value)}
                        disabled={speech.grabando}
                        className="w-full px-3.5 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none resize-none bg-transparent disabled:opacity-60"
                      />
                    </div>
                    <div className="flex gap-2 mb-4">
                      {enPilotoVoz(yo?.id) && speech.disponible && (
                        <button
                          onClick={handleMicToggle}
                          title={speech.grabando ? 'Parar dictado' : 'Dictar por voz (piloto)'}
                          className={cn(
                            'flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold border transition-colors',
                            speech.grabando ? 'bg-destructive text-white border-destructive' : 'border-border text-foreground hover:bg-muted',
                          )}
                        >
                          <Mic size={12} />
                          {speech.grabando ? 'Escuchando…' : 'Dictar'}
                        </button>
                      )}
                      <button
                        onClick={handleAiNote}
                        disabled={aiLoading || speech.grabando || !aiNoteText.trim() || !socio?.consentimientoSalud}
                        className="flex items-center gap-1.5 px-4 py-2 bg-brand text-brand-foreground rounded-xl text-xs font-bold hover:brightness-95 disabled:opacity-40 transition-colors"
                      >
                        {aiLoading ? <Loader2 size={12} className="animate-spin" /> : <Bot size={12} />}
                        {aiLoading ? 'Procesando...' : 'Generar nota IA'}
                      </button>
                    </div>
                    {enPilotoVoz(yo?.id) && speech.error && (
                      <p className="text-xs text-destructive -mt-2 mb-3">No se ha podido grabar ({speech.error}). Usa el teclado.</p>
                    )}
                    {aiResult && (
                      <div className="rounded-xl border border-border bg-brand/10 p-4 space-y-3">
                        <p className="text-xs font-bold text-brand-secondary uppercase tracking-wide mb-2">Nota estructurada</p>
                        {aiResult.progreso && (
                          <div>
                            <p className="text-[10px] font-bold text-brand-secondary uppercase tracking-wide mb-0.5">Progreso</p>
                            <p className="text-sm text-foreground">{aiResult.progreso}</p>
                          </div>
                        )}
                        {aiResult.alertas && (
                          <div>
                            <p className="text-[10px] font-bold text-warning uppercase tracking-wide mb-0.5">Alertas / Limitaciones</p>
                            <p className="text-sm text-foreground">{aiResult.alertas}</p>
                          </div>
                        )}
                        {aiResult.planProximaSesion && (
                          <div>
                            <p className="text-[10px] font-bold text-brand-secondary uppercase tracking-wide mb-0.5">Próxima sesión</p>
                            <p className="text-sm text-foreground">{aiResult.planProximaSesion}</p>
                          </div>
                        )}
                        {aiResult.ejerciciosCasa && (
                          <div>
                            <p className="text-[10px] font-bold text-success uppercase tracking-wide mb-0.5">Ejercicios casa</p>
                            <p className="text-sm text-foreground">{aiResult.ejerciciosCasa}</p>
                          </div>
                        )}
                        <div className="flex gap-2 pt-2 border-t border-border">
                          <button
                            onClick={handleSaveAiNote}
                            className="flex items-center gap-1.5 px-3 py-1.5 bg-primary text-primary-foreground rounded-lg text-xs font-bold hover:bg-primary/90 transition-colors"
                          >
                            <CheckCircle2 size={12} /> Guardar nota
                          </button>
                          <button
                            onClick={() => setAiResult(null)}
                            className="px-3 py-1.5 border border-border text-foreground rounded-lg text-xs font-bold hover:bg-muted transition-colors"
                          >
                            Descartar
                          </button>
                        </div>
                      </div>
                    )}
                    {/* Notas anteriores: las de la IA del panel y las que escriben
                        las instructoras desde la app (15-sep-2026). Antes solo se
                        pintaba `progreso`, así que una nota de la app —que siempre
                        trae «qué tal ha ido» y a veces nada más— salía vacía, con
                        la fecha y nada. Ahora cada una con quién la escribió. */}
                    {notasProgreso.filter(n => n.socioId === id).length > 0 && (
                      <div className="mt-4 pt-4 border-t border-muted">
                        <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wide mb-2">Notas de sesión</p>
                        <div className="space-y-2">
                          {/* Ordenadas aquí: la carga no garantiza el orden y «las 5 últimas» tiene que serlo. */}
                          {notasProgreso.filter(n => n.socioId === id)
                            .sort((a, b) => b.creadaEn.localeCompare(a.creadaEn))
                            .slice(0, 5).map(nota => {
                            const autora = instructores.find(x => x.id === nota.instructorId)?.nombre;
                            return (
                              <div key={nota.id} className="rounded-lg bg-muted border border-border px-3 py-2.5 space-y-1">
                                <p className="text-[10px] text-muted-foreground">{fecha(nota.creadaEn)}{autora ? ` · ${autora}` : ''}</p>
                                {nota.textoLibre && <p className="text-xs text-foreground whitespace-pre-line line-clamp-4">{nota.textoLibre}</p>}
                                {nota.progreso && <p className="text-xs text-foreground line-clamp-2"><span className="font-semibold">Progreso:</span> {nota.progreso}</p>}
                                {nota.alertas && <p className="text-xs text-foreground line-clamp-2"><span className="font-semibold">A tener en cuenta:</span> {nota.alertas}</p>}
                                {nota.planProximaSesion && <p className="text-xs text-foreground line-clamp-2"><span className="font-semibold">Próxima sesión:</span> {nota.planProximaSesion}</p>}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                  )}
                </div>
              )}


              {/* ═══ TAB: PAGOS ═════════════════════════════════════════════ */}
              {activeTab === 'pagos' && verFinanzas && (
                <div className="space-y-4">
                  <div className="rounded-2xl border border-border bg-card shadow-xs p-4 sm:p-5">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex gap-2">
                      <button
                        onClick={() => setShowAddRecibo(true)}
                        className="flex items-center gap-1.5 text-xs font-bold px-3.5 py-2 rounded-lg text-primary-foreground bg-primary hover:brightness-95 transition-colors"
                      >
                        <Plus size={14} />Nuevo cobro
                      </button>
                      {pendientes.length > 0 && (
                        <BotonCobrarConMetodo
                          detalle={<>{pendientes.length} {pendientes.length === 1 ? 'recibo' : 'recibos'} — <span className="font-semibold text-foreground">{formatEuro(pendientes.reduce((t, r) => t + r.importe, 0))}</span></>}
                          onCobrar={metodo => cobrarTodosPendientes(id, metodo).then(res => {
                            setToast(res.ok ? textoLoteCobrado(res, res.saltados) : res.error);
                          })}
                          className="flex items-center gap-1.5 text-xs font-bold px-3.5 py-2 rounded-lg transition-colors"
                          style={{ backgroundColor: 'color-mix(in srgb, var(--success) 12%, var(--card))', color: 'var(--success)' }}
                        >
                          <CheckCircle2 size={14} />Cobrar pendientes ({pendientes.length})
                        </BotonCobrarConMetodo>
                      )}
                    </div>
                  </div>

                  {misRecibos.length === 0 ? (
                    <div className="py-12 text-center">
                      <p className="text-sm font-medium text-muted-foreground">Sin recibos todavía.</p>
                    </div>
                  ) : (
                    <>
                      <div className="border border-border rounded-xl overflow-hidden">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="bg-muted border-b border-border">
                              <th className="text-left px-4 py-3 text-xs font-bold text-muted-foreground uppercase tracking-wider">Fecha</th>
                              <th className="text-left px-4 py-3 text-xs font-bold text-muted-foreground uppercase tracking-wider">Concepto</th>
                              <th className="text-right px-4 py-3 text-xs font-bold text-muted-foreground uppercase tracking-wider">Importe</th>
                              <th className="text-right px-4 py-3 text-xs font-bold text-muted-foreground uppercase tracking-wider">Estado</th>
                              <th className="px-4 py-3" />
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-muted">
                            {misRecibos.map(r => (
                              <tr key={r.id} className="hover:bg-muted transition-colors">
                                <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">
                                  {fecha(r.fechaVencimiento)}
                                </td>
                                <td className="px-4 py-3 font-semibold text-foreground max-w-[200px] truncate">
                                  {r.concepto}
                                </td>
                                <td className="px-4 py-3 text-right font-extrabold text-foreground tabular-nums">
                                  {formatEuro(r.importe)}
                                </td>
                                <td className="px-4 py-3 text-right">
                                  {(() => {
                                    // Una devolución en vuelo manda sobre el estado del recibo:
                                    // mientras Stripe no confirma, el recibo sigue diciendo
                                    // "Cobrado" y eso es justo lo que confundía.
                                    const dev = estadoReembolso({
                                      estado: r.estado,
                                      // `enviadas` (este render) gana a la marca de fallo: acaba de
                                      // reintentarse y vuelve a estar "devolviendo…".
                                      reembolsoSolicitadoEn: enviadas.has(r.id) ? new Date().toISOString() : r.reembolsoSolicitadoEn,
                                      fechaDevolucion: r.fechaDevolucion,
                                      reembolsoFallidoEn: enviadas.has(r.id) ? null : r.reembolsoFallidoEn,
                                    }, ahoraDev);
                                    if (dev && dev.fase !== 'DEVUELTA') {
                                      return (
                                        <span
                                          title={dev.detalle}
                                          className={cn('text-xs font-bold px-2.5 py-1 rounded-full',
                                            // FALLIDA es un fallo de dinero (la clienta NO cobró la
                                            // devolución) — nunca en el azul informativo.
                                            dev.fase === 'FALLIDA' ? 'bg-destructive/10 text-destructive'
                                              : dev.fase === 'ATASCADA' ? 'bg-warning/10 text-warning' : 'bg-info/10 text-info')}
                                        >
                                          {dev.etiqueta}
                                        </span>
                                      );
                                    }
                                    return (
                                      <span title={dev?.detalle} className={cn('text-xs font-bold px-2.5 py-1 rounded-full', BADGE_RECIBO[r.estado])}>
                                        {LABEL_RECIBO[r.estado]}
                                      </span>
                                    );
                                  })()}
                                </td>
                                <td className="px-4 py-3 text-right">
                                  {r.estado === 'PENDIENTE' && (
                                    <BotonCobrarConMetodo
                                      detalle={<>{r.concepto} — <span className="font-semibold text-foreground">{formatEuro(r.importe)}</span></>}
                                      onCobrar={metodo => marcarCobrado(r.id, metodo).then(res => {
                                        setToast(res.ok ? (res.yaEstaba ? MENSAJE_YA_ESTABA : `Cobro registrado: ${formatEuro(r.importe)}`) : res.error);
                                      })}
                                      className="text-xs font-bold px-2.5 py-1 rounded-lg transition-colors"
                                      style={{ backgroundColor: 'color-mix(in srgb, var(--success) 12%, var(--card))', color: 'var(--success)' }}
                                    />
                                  )}
                                  {/* Devolver: mismo gate de rol que cobrar (`puedeMoverDinero`).
                                      El componente se calla solo si la política del estudio está
                                      apagada o el recibo no es de los que se devuelven. */}
                                  {puedeCobrar && (
                                    <BotonDevolverRecibo
                                      recibo={{
                                        id: r.id,
                                        estado: r.estado,
                                        importe: r.importe,
                                        fechaCobro: r.fechaCobro,
                                        sesionesAlEntregar: r.entregaSesionesDespues ?? null,
                                        sesionesRestantesHoy: r.suscripcionId
                                          ? (suscripciones.find(s => s.id === r.suscripcionId)?.sesionesRestantes ?? null)
                                          : null,
                                      }}
                                      politica={politicaReembolso}
                                      onHecho={setToast}
                                      yaEnviada={enviadas.has(r.id) || (!!r.reembolsoSolicitadoEn && !r.reembolsoFallidoEn)}
                                      bypassPolitica={!!r.reembolsoFallidoEn && !!r.reembolsoStripeId}
                                      onEnviada={() => setEnviadas(prev => new Set(prev).add(r.id))}
                                    />
                                  )}
                                  {/* Rectificativa (#769, Fase A): solo sobre un recibo ya
                                      DEVUELTO con factura sellada — no tiene sentido antes. */}
                                  {puedeCobrar && r.estado === 'DEVUELTO' && (() => {
                                    const facturaDelRecibo = facturas.find(f => f.reciboId === r.id);
                                    if (!facturaDelRecibo) return null;
                                    return (
                                      <div className="mt-1.5">
                                        <BotonRectificarFactura factura={facturaDelRecibo} facturas={facturas} onHecho={setToast} />
                                      </div>
                                    );
                                  })()}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                      {/* El estado de una devolución, en texto y no solo en un
                          tooltip: el panel se usa en el iPad del mostrador, donde
                          pasar el ratón por encima no existe. */}
                      {misRecibos.map(r => {
                        const dev = estadoReembolso({
                          estado: r.estado,
                          reembolsoSolicitadoEn: enviadas.has(r.id) ? new Date().toISOString() : r.reembolsoSolicitadoEn,
                          fechaDevolucion: r.fechaDevolucion,
                          reembolsoFallidoEn: enviadas.has(r.id) ? null : r.reembolsoFallidoEn,
                        }, ahoraDev);
                        // La nota del plazo del banco solo se enseña mientras sea
                        // reciente: en un recibo devuelto hace meses es ruido.
                        const reciente = dev?.fase !== 'DEVUELTA'
                          || (r.fechaDevolucion != null
                              && ahoraDev.getTime() - new Date(r.fechaDevolucion).getTime() < 15 * 24 * 3600 * 1000);
                        if (!dev || !reciente) return null;
                        return (
                          <div
                            key={`dev-${r.id}`}
                            className={cn('mt-3 rounded-lg px-3 py-2 text-[12px] leading-snug',
                              dev.fase === 'FALLIDA' ? 'bg-destructive/10 text-destructive'
                                : dev.fase === 'ATASCADA' ? 'bg-warning/10 text-warning' : 'bg-muted text-muted-foreground')}
                          >
                            <strong className="font-semibold">{r.concepto} · {formatEuro(r.importe)}</strong> — {dev.detalle}
                          </div>
                        );
                      })}

                      <div className="flex justify-end mt-3 pt-3 border-t border-muted">
                        <div className="text-right">
                          <p className="text-xs font-medium text-muted-foreground">Total cobrado</p>
                          <p className="text-xl font-extrabold text-foreground">{formatEuro(totalGastado)}</p>
                        </div>
                      </div>
                    </>
                  )}

                  {pagosHistoricos.length > 0 && (
                    <div className="mt-8">
                      <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground mb-2">
                        Pagos históricos (importados)
                      </p>
                      <div className="border border-border rounded-xl overflow-hidden">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="bg-muted border-b border-border">
                              <th className="text-left px-4 py-3 text-xs font-bold text-muted-foreground uppercase tracking-wider">Fecha</th>
                              <th className="text-left px-4 py-3 text-xs font-bold text-muted-foreground uppercase tracking-wider">Concepto</th>
                              <th className="text-right px-4 py-3 text-xs font-bold text-muted-foreground uppercase tracking-wider">Importe</th>
                              <th className="text-right px-4 py-3 text-xs font-bold text-muted-foreground uppercase tracking-wider">Medio</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-muted">
                            {pagosHistoricos.map(p => (
                              <tr key={p.id} className="hover:bg-muted transition-colors">
                                <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">{fecha(p.fecha)}</td>
                                <td className="px-4 py-3 font-semibold text-foreground max-w-[200px] truncate">{p.concepto ?? '—'}</td>
                                <td className="px-4 py-3 text-right font-extrabold text-foreground tabular-nums">{formatEuro(p.importe)}</td>
                                <td className="px-4 py-3 text-right text-xs text-muted-foreground">{p.medioPago ?? '—'}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                      <p className="text-[11px] text-muted-foreground mt-2">
                        Importados de la plataforma anterior — no son recibos de Tentare y no entran en el cierre fiscal.
                      </p>
                    </div>
                  )}

                  {/* Solo la propietaria: quién tocó el dinero de esta clienta. */}
                  {studio && puedeVerAuditoriaFinanciera(rol) && (
                    <section className="mt-8" aria-label="Cambios de dinero en esta ficha">
                      <h3 className="text-sm font-bold text-foreground mb-3">Cambios de dinero en esta ficha</h3>
                      <HistorialDinero studioId={studio.id} socioId={id} />
                    </section>
                  )}
                </div>
                  {/* Domiciliación SEPA (F2 · B2.10). Es el medio de COBRO de la
                      clienta: quien no mueve dinero no lo da de alta ni lo quita. */}
                  {puedeCobrar && <FichaMandatoSepa socioId={id} />}
                </div>
              )}


              {/* ═══ TAB: DOCUMENTOS ════════════════════════════════════════ */}
              {activeTab === 'documentos' && gestionaClientas && (
                <div className="rounded-2xl border border-border bg-card shadow-xs p-4 sm:p-5"><FichaDocumentos socioId={id} onToast={setToast} /></div>
              )}


          {activeTab === 'datos' && gestionaClientas && (
            <div className="grid items-start gap-4 md:grid-cols-2">
          {/* Contract acceptance */}
          <Card>
            <div className="flex items-center gap-2 mb-3">
              <ShieldCheck size={14} className={socio.aceptacionContrato ? 'text-success' : 'text-muted-foreground'} />
              <SectionTitle>Contrato</SectionTitle>
            </div>
            {socio.aceptacionContrato ? (
              <div className="space-y-2">
                <div className="flex items-center gap-2 px-3 py-2.5 rounded-lg bg-success/10">
                  <CheckCircle2 size={14} className="text-success shrink-0" />
                  <span className="text-xs font-bold text-success">Contrato aceptado</span>
                </div>
                <div className="text-xs text-muted-foreground space-y-1 pt-1">
                  {/* La firma es dato privado (M1 RGPD): el resto del
                      personal ve que está aceptado y cuándo, no el nombre. */}
                  {veDatosPrivados && socio.aceptacionContrato.firma && (
                    <div className="flex items-center gap-1.5">
                      <FileSignature size={11} className="shrink-0" />
                      <span className="font-medium text-foreground truncate">{socio.aceptacionContrato.firma}</span>
                    </div>
                  )}
                  <div className="flex items-center gap-1.5">
                    <Calendar size={11} className="shrink-0" />
                    <span>{fecha(socio.aceptacionContrato.fecha)}</span>
                  </div>
                  {/* De quién es la firma. Una recogida en el mostrador no vale
                      como consentimiento de la socia y no puede parecerlo. */}
                  {socio.aceptacionContrato.origen === 'MOSTRADOR' && (
                    <p className="text-[11px] text-warning pt-0.5">
                      Recogida en el estudio
                      {socio.aceptacionContrato.introducidaPor ? ` por ${socio.aceptacionContrato.introducidaPor}` : ''}
                      {' '}— no la firmó ella desde su portal.
                    </p>
                  )}
                  {socio.aceptacionContrato.origen === 'PORTAL' && (
                    <p className="text-[11px] text-success pt-0.5">Firmada por ella desde su portal.</p>
                  )}
                </div>
              </div>
            ) : (
              <div className="space-y-1.5">
                <div className="flex items-center gap-2 px-3 py-2.5 rounded-lg bg-warning/10">
                  <AlertTriangle size={14} className="text-warning shrink-0" />
                  <span className="text-xs font-bold text-warning">Pendiente de firma</span>
                </div>
                <p className="text-[11px] text-muted-foreground">
                  Se le pedirá aceptar el contrato la primera vez que entre a reservar.
                </p>
              </div>
            )}
          </Card>


          {/* Marketing consent — art. 7.4 RGPD: aparte del Contrato de arriba
              a propósito, no vale empaquetarlo con la aceptación general. Ver
              docs/marketing-integrations-arquitectura.md §7. */}
          <Card>
            <div className="flex items-center gap-2 mb-3">
              <Megaphone size={14} className={socio.consentimientoMarketing ? 'text-success' : 'text-muted-foreground'} />
              <SectionTitle>Marketing</SectionTitle>
            </div>
            {socio.consentimientoMarketing ? (
              <div className="space-y-2">
                <div className="flex items-center gap-2 px-3 py-2.5 rounded-lg bg-success/10">
                  <CheckCircle2 size={14} className="text-success shrink-0" />
                  <span className="text-xs font-bold text-success">Consiente recibir marketing por email</span>
                </div>
                <div className="text-xs text-muted-foreground flex items-center gap-1.5 pt-1">
                  <Calendar size={11} className="shrink-0" />
                  <span>{fecha(socio.consentimientoMarketing.fecha)}</span>
                </div>
                {gestionaClientas && (
                  <button
                    onClick={() => setConfirmarRetiroMkt(true)}
                    className="text-[11px] font-medium text-muted-foreground hover:text-destructive underline underline-offset-2"
                  >
                    Retirar consentimiento
                  </button>
                )}
              </div>
            ) : (
              <div className="space-y-1.5">
                <div className="flex items-center gap-2 px-3 py-2.5 rounded-lg bg-muted">
                  <span className="text-xs font-bold text-muted-foreground">Sin consentimiento de marketing</span>
                </div>
                <p className="text-[11px] text-muted-foreground">
                  No recibirá campañas ni automatizaciones de marketing hasta que dé su consentimiento explícito.
                </p>
                {retiroMkt && (
                  <p className="text-[11px] font-medium text-destructive" data-testid="retiro-marketing">
                    {textoRetiro(retiroMkt, fecha(retiroMkt.retiradoEn))}
                  </p>
                )}
                {gestionaClientas && (
                  <button
                    onClick={() => setConfirmarConsentimientoMkt(true)}
                    className="text-[11px] font-medium text-foreground hover:text-success underline underline-offset-2"
                  >
                    Registrar consentimiento
                  </button>
                )}
              </div>
            )}
          </Card>

              {/* Excepciones (F2 · B2.9): de qué avisos automáticos se la deja fuera. */}
              <FichaExcepciones socioId={id} onToast={setToast} />
              <DerechosRgpdFicha socioId={id} nombreSocia={nombreCompleto} onToast={setToast} />
            </div>
          )}
        </ReanimarAlCambiar>
      </div>

      <ReservarClase socio={socio} lo={t.lo} abierto={showReservar} onCerrar={() => setShowReservar(false)} onHecho={texto => { setShowReservar(false); setToast(texto); }} />

      <DialogoRecordar
        socioId={socio.id}
        nombre={socio.nombre}
        abierto={recordando !== null}
        tituloInicial={recordando?.titulo ?? ''}
        recomendacionId={recordando?.recomendacionId ?? null}
        hoyISO={hoyTxt}
        uid={user?.id ?? null}
        equipo={equipoSeguimientos}
        onCerrar={() => setRecordando(null)}
        onHecho={texto => { setRecordando(null); void recargarSeguimientos(); setToast(texto); }}
      />

      <ConfirmDialog
        open={contactoABorrar !== null}
        onOpenChange={o => { if (!o && !borrandoContacto) setContactoABorrar(null); }}
        titulo="¿Borrar este contacto?"
        descripcion="Sale de su historia para todo el equipo, y no se puede deshacer."
        textoConfirmar={borrandoContacto ? 'Borrando…' : 'Borrar'}
        destructivo
        onConfirm={() => { if (contactoABorrar) void quitarContacto(contactoABorrar); }}
      />
      <DialogoApuntarContacto
        socioId={socio.id}
        nombre={socio.nombre}
        ella={t.ella}
        lo={t.lo}
        abierto={apuntando !== null}
        canalInicial={apuntando?.canal ?? null}
        onCerrar={() => setApuntando(null)}
        onHecho={c => {
          setApuntando(null);
          setContactoEnCurso(null);
          void recargarComunicaciones();
          setToast(`Apuntado: ${ETIQUETA_CANAL[c.canal].toLowerCase()}${c.resultado ? ` · ${ETIQUETA_RESULTADO[c.resultado].toLowerCase()}` : ''}`);
        }}
      />

      {/* Retirar el consentimiento de marketing: no se deshace con un clic —
          volver a darlo exige que ella lo acepte otra vez—, así que se confirma. */}
      <Dialog open={confirmarRetiroMkt} onOpenChange={o => { if (!o && !retirandoMkt) setConfirmarRetiroMkt(false); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-base font-semibold text-foreground">Retirar su consentimiento de marketing</DialogTitle>
          </DialogHeader>
          <p className="text-xs text-muted-foreground mt-2 text-pretty">
            {socio.nombre} dejará de recibir campañas y automatizaciones de marketing. Para volver a enviárselas tendrá que aceptarlo otra vez. Los avisos de sus reservas y sus pagos le siguen llegando.
          </p>
          <div className="flex gap-3 mt-3">
            <button onClick={() => setConfirmarRetiroMkt(false)} disabled={retirandoMkt} className="flex-1 py-2.5 rounded-xl text-sm font-bold border border-border text-muted-foreground hover:bg-muted disabled:opacity-50">
              Cancelar
            </button>
            <button
              onClick={() => {
                setRetirandoMkt(true);
                void updateSocio(id, { consentimientoMarketing: undefined }).then(res => {
                  setRetirandoMkt(false);
                  if (!res.ok) { setToast(res.error); return; }
                  setConfirmarRetiroMkt(false);
                  setToast('Consentimiento de marketing retirado');
                });
              }}
              disabled={retirandoMkt}
              className="flex-1 py-2.5 rounded-xl text-sm font-bold text-primary-foreground bg-primary hover:brightness-95 disabled:opacity-50"
            >
              {retirandoMkt ? 'Retirando…' : 'Retirar'}
            </button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Confirmar consentimiento de marketing — recogido en el mostrador, no
          desde el portal de la socia: el mismo matiz que ya distingue
          aceptacionContrato.origen MOSTRADOR/PORTAL. */}
      <Dialog open={confirmarConsentimientoMkt} onOpenChange={setConfirmarConsentimientoMkt}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-base font-semibold text-foreground">¿{socio.nombre} ha dado su consentimiento?</DialogTitle>
          </DialogHeader>
          <p className="text-xs text-muted-foreground mt-2">
            Confirma solo si {t.la} {t.clienta} ha aceptado expresamente, en persona o por escrito, recibir marketing
            por email. Podrá retirarlo en cualquier momento desde el enlace de baja de cualquier email.
          </p>
          {retiroMkt && (
            <p className="mt-2 text-xs font-medium text-destructive" role="alert">
              {textoRetiro(retiroMkt, fecha(retiroMkt.retiradoEn))} Confirma solo si {t.la} {t.clienta} te ha dicho
              expresamente que quiere volver a recibirlo: quedará anotado.
            </p>
          )}
          <div className="flex gap-2 mt-4">
            <button
              onClick={() => setConfirmarConsentimientoMkt(false)}
              className="flex-1 justify-center py-2.5 rounded-xl border border-border text-xs font-medium text-foreground hover:bg-muted transition-colors"
            >
              Cancelar
            </button>
            <button
              disabled={guardandoConsentimientoMkt}
              onClick={async () => {
                setGuardandoConsentimientoMkt(true);
                const res = await updateSocio(id, {
                  consentimientoMarketing: {
                    fecha: new Date().toISOString(),
                    texto: textoConsentimientoMarketing({ nombre: studio?.nombre }),
                    registradoPor: 'MOSTRADOR',
                  },
                });
                setGuardandoConsentimientoMkt(false);
                if (!res.ok) { setToast(res.error); return; }
                setConfirmarConsentimientoMkt(false);
              }}
              className="flex-1 justify-center py-2.5 rounded-xl bg-brand text-brand-foreground text-xs font-bold hover:opacity-90 transition-opacity disabled:opacity-60"
            >
              {retiroMkt ? 'Sí, ha vuelto a aceptarlo' : 'Sí, lo ha aceptado'}
            </button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ═══════════════ MODALS ════════════════════════════════════════════════ */}

      {/* Add Tag */}
      <Dialog open={showAddTag} onOpenChange={setShowAddTag}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-base font-semibold text-foreground">Añadir etiqueta</DialogTitle>
          </DialogHeader>
          <div className="flex flex-wrap gap-2 mt-3">
            {tagsDisponibles.map(t => (
              <button
                key={t.label}
                onClick={async () => { const res = await addTagSocio(id, t.label); if (!res.ok) { setToast(res.error); return; } setShowAddTag(false); }}
                className="px-3 py-1.5 rounded-full text-xs font-bold transition-all hover:scale-105"
                style={{ backgroundColor: t.bg, color: t.text }}
              >
                {t.label}
              </button>
            ))}
            {tagsDisponibles.length === 0 && (
              <p className="text-sm text-muted-foreground">Todas las etiquetas ya están asignadas.</p>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Edit clienta */}
      <Dialog open={showEdit && gestionaClientas} onOpenChange={open => !open && setShowEdit(false)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-lg font-semibold text-foreground">Editar {t.clienta}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-2">
            <div className="grid grid-cols-2 gap-4">
              <FF label="Nombre">
                <input className={inputCls} value={editForm.nombre} onChange={e => setEditForm(f => ({ ...f, nombre: e.target.value }))} />
              </FF>
              <FF label="Apellidos">
                <input className={inputCls} value={editForm.apellidos} onChange={e => setEditForm(f => ({ ...f, apellidos: e.target.value }))} />
              </FF>
            </div>
            {/* El alta deja crearla sin email; la edición exigía tenerlo, así que
                una clienta dada de alta sin él no se podía editar nunca. Lo que no
                se deja es BORRAR el que ya tiene: es con lo que entra en su app. */}
            <FF label={socio.email ? 'Email' : 'Email (opcional)'}>
              <input type="email" className={inputCls} value={editForm.email} onChange={e => setEditForm(f => ({ ...f, email: e.target.value }))} />
            </FF>
            {!editForm.email.trim() && !!socio.email && (
              <p className="-mt-2 text-[12px] text-destructive">El email no se puede dejar vacío: es con lo que entra en su app.</p>
            )}
            <FF label="Género">
              <select
                className={inputCls}
                value={editForm.genero}
                onChange={e => setEditForm(f => ({ ...f, genero: generoDe(e.target.value) ?? '' }))}
              >
                <option value="">Sin indicar</option>
                {GENEROS.map(g => (
                  <option key={g} value={g}>{ETIQUETA_GENERO[g]}</option>
                ))}
              </select>
            </FF>
            <p className="-mt-2 text-[11px] text-muted-foreground">
              Solo cambia cómo se escribe en el panel («clienta»/«cliente», «alumna»/«alumno»). Sin indicar, en femenino.
            </p>
            <div className="grid grid-cols-2 gap-4">
              <FF label="Teléfono">
                <input className={inputCls} value={editForm.telefono} onChange={e => setEditForm(f => ({ ...f, telefono: e.target.value }))} />
              </FF>
              {veDatosPrivados && (
                <FF label="NIF (opcional)">
                  <input className={inputCls} value={editForm.nif} onChange={e => setEditForm(f => ({ ...f, nif: e.target.value }))} />
                </FF>
              )}
            </div>
            {camposPersonalizados.some(c => c.activo) && (
              <div className="grid grid-cols-2 gap-4 border-t border-border pt-4">
                <CamposExtraFields
                  campos={camposPersonalizados}
                  values={editForm.camposExtra}
                  onChange={(cid, v) => setEditForm(f => ({ ...f, camposExtra: { ...f.camposExtra, [cid]: v } }))}
                  inputClassName={inputCls}
                />
              </div>
            )}
          </div>
          <div className="flex gap-3 mt-6">
            <button onClick={() => setShowEdit(false)} className="flex-1 py-2.5 rounded-xl text-sm font-bold border border-border text-muted-foreground hover:bg-muted">
              Cancelar
            </button>
            <button
              onClick={saveEdit}
              disabled={!editForm.nombre || !editForm.apellidos || (!editForm.email.trim() && !!socio.email)}
              className="flex-1 py-2.5 rounded-xl text-sm font-bold text-primary-foreground bg-primary hover:brightness-95 disabled:opacity-40 transition-colors"
            >
              Guardar cambios
            </button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Tras asignar una cuota: ¿viene siempre a la misma clase? */}
      <Dialog open={ofrecerPlazaFija !== null} onOpenChange={open => { if (!open) setOfrecerPlazaFija(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-lg font-semibold text-foreground">¿Le das una plaza fija?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground mt-1">
            «{planOfrecido}» ya está asignado. Si {socio.nombre} viene siempre a la misma clase, elige cuál: se le
            reserva sola cada semana, sin apuntarla a mano.
          </p>
          <div className="flex flex-col gap-2 pt-2">
            <button
              onClick={() => { setOfrecerPlazaFija(null); setDialogoPlazaFija(true); }}
              className="w-full rounded-lg bg-brand px-3 py-2 text-sm font-semibold text-brand-foreground"
            >
              Elegir su clase
            </button>
            <button
              onClick={() => setOfrecerPlazaFija(null)}
              className="w-full rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground hover:text-foreground"
            >
              Ahora no
            </button>
          </div>
        </DialogContent>
      </Dialog>

      {dialogoPlazaFija && (
        <DialogoPlazaFija
          socioId={id}
          onClose={() => setDialogoPlazaFija(false)}
          onGuardada={(r, movida) => {
            setDialogoPlazaFija(false);
            setToast(textoPlazaGuardada(r, movida));
          }}
        />
      )}

      {/* Change plan */}
      <Dialog open={showChangePlan && verFinanzas} onOpenChange={open => !open && setShowChangePlan(false)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-lg font-semibold text-foreground">{plan ? 'Cambiar plan' : 'Asignar plan'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-2 mt-3">
            {/* «Sin plan» arrastraba el mismo fallo que el botón de la tarjeta:
                era `assignPlan(id, null)`, que con un bono con saldo no quitaba
                nada y aun así decía «Plan retirado». Ahora lleva a la misma
                confirmación —y al mismo camino real— que «Cancelar
                suscripción», así que las dos vías hacen lo mismo o no existen:
                sin nada que cancelar, este botón no tiene sentido y no se
                pinta. */}
            {suscripcion && suscripcion.estado !== 'CANCELADA' && (
              <button
                onClick={() => { setShowChangePlan(false); abrirCancelarSus(); }}
                disabled={cambiandoPlan}
                className="w-full flex items-center justify-between px-4 py-3 rounded-xl border text-sm font-semibold text-left transition-colors hover:bg-muted disabled:opacity-40"
                style={{ borderColor: 'var(--border)', color: 'var(--muted-foreground)' }}
              >
                <span>Sin plan</span>
              </button>
            )}
            {/* ⚠️ Sin tarifas a la venta el diálogo salía con el título y nada
                debajo: el asistente deja las tarifas en borrador (inactivas y a
                0 €) y aquí solo se listan las activas (evaluación del 13-sep).
                Se dice por qué está vacío y dónde se arregla. */}
            {planesTarifa.filter(p => p.activo).length === 0 && (
              <div className="rounded-xl border border-dashed border-border px-4 py-3 text-sm">
                <p className="font-semibold text-foreground">No tienes tarifas a la venta</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {planesTarifa.length > 0
                    ? `Tienes ${planesTarifa.length} en borrador: ponles precio y actívalas en Paquetes y podrás asignarlas desde aquí.`
                    : 'Crea un bono o una cuota en Paquetes y podrás asignarlo desde aquí.'}
                </p>
                <Link href="/productos" className="mt-2 inline-block text-xs font-semibold text-brand-medio hover:underline">
                  Ir a Paquetes
                </Link>
              </div>
            )}
            {planesTarifa.filter(p => p.activo).map(p => (
              <button
                key={p.id}
                onClick={() => cambiarPlan(p.id, p.nombre)}
                disabled={cambiandoPlan}
                className="w-full flex items-center justify-between px-4 py-3 rounded-xl border text-sm font-semibold text-left transition-colors hover:bg-brand/10 disabled:opacity-40"
                style={{
                  borderColor: suscripcion?.planId === p.id ? 'color-mix(in srgb, var(--info) 12%, var(--card))' : 'var(--border)',
                  backgroundColor: suscripcion?.planId === p.id ? 'color-mix(in srgb, var(--brand) 10%, var(--card))' : 'white',
                }}
              >
                <div>
                  <p className="font-bold text-foreground">{p.nombre}</p>
                  <p className="text-xs font-medium text-muted-foreground">
                    {p.precio} € {p.tipo === 'MENSUAL' ? `/ ${nombrePeriodo(p)}` : p.sesiones ? `· ${p.sesiones} sesiones` : ''}
                  </p>
                  {/* Se cobra al asignar el plan si es el primero que contrata
                      aquí, así que se dice ANTES de pulsar, no después en el
                      recibo. */}
                  {(p.matricula ?? 0) > 0 && (
                    <p className="text-xs font-medium text-muted-foreground">
                      + {p.matricula} € de matrícula si es su primer plan
                    </p>
                  )}
                </div>
                {suscripcion?.planId === p.id && (
                  <span className="text-xs font-bold px-2 py-0.5 rounded-full" style={{ backgroundColor: '#FFF2F7', color: 'var(--brand)' }}>Actual</span>
                )}
              </button>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      {/* Aviso anti-duplicado: el plan que se va a dar de alta ya está cobrado en
          el TPV sin clienta. Ver `cambiarPlan`. */}
      <Dialog
        open={ventaPorAsignar !== null && verFinanzas}
        onOpenChange={open => { if (!open && !asignandoVenta && !cambiandoPlan) setVentaPorAsignar(null); }}
      >
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-lg font-semibold text-foreground">Este plan ya está cobrado en el TPV</DialogTitle>
          </DialogHeader>
          {ventaPorAsignar && (
            <div className="space-y-3 mt-2">
              <p className="text-sm text-muted-foreground">
                «{ventaPorAsignar.nombrePlan}» se cobró en el mostrador sin clienta y está por asignar.
                Si es de {socio.nombre}, asígnale esa venta: se le entrega el plan sin cobrarlo otra vez.
              </p>
              <ul className="space-y-2">
                {ventaPorAsignar.ventas.map(v => (
                  <li key={v.id} className="rounded-xl border border-border px-3 py-2.5">
                    <p className="text-sm font-semibold text-foreground">Venta nº {v.numero} · {formatEuro(v.total)}</p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(v.realizadaEn).toLocaleString('es-ES', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Madrid' })}
                    </p>
                    {puedeCobrar && (
                      <button
                        onClick={() => void asignarVentaDelTPV(v)}
                        disabled={asignandoVenta || cambiandoPlan}
                        className="mt-2 w-full rounded-lg bg-brand px-3 py-2 text-sm font-semibold text-brand-foreground disabled:opacity-40"
                      >
                        {asignandoVenta ? 'Asignando…' : `Asignar la venta nº ${v.numero} a ${socio.nombre}`}
                      </button>
                    )}
                  </li>
                ))}
              </ul>
              {!puedeCobrar && (
                <p className="text-xs text-muted-foreground">Asignarla puede hacerlo quien lleve la caja, desde Caja → Ventas.</p>
              )}
              <div className="flex flex-col gap-2 pt-1">
                <button
                  onClick={() => void cambiarPlan(ventaPorAsignar.planId, ventaPorAsignar.nombrePlan, { aunqueEsteCobradoEnTPV: true })}
                  disabled={cambiandoPlan || asignandoVenta}
                  className="w-full rounded-lg border border-border px-3 py-2 text-sm font-semibold text-foreground hover:bg-muted disabled:opacity-40"
                >
                  Dar de alta igualmente (se cobra otra vez)
                </button>
                <button
                  onClick={() => setVentaPorAsignar(null)}
                  disabled={cambiandoPlan || asignandoVenta}
                  className="w-full rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground hover:text-foreground disabled:opacity-40"
                >
                  Volver
                </button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Add recibo */}
      <Dialog open={showAddRecibo && puedeCobrar} onOpenChange={open => !open && setShowAddRecibo(false)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-lg font-semibold text-foreground">Nuevo cobro</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-2">
            <FF label="Concepto">
              <input
                className={inputCls}
                placeholder="Mensual Jul 2026"
                value={reciboForm.concepto}
                onChange={e => setReciboForm(f => ({ ...f, concepto: e.target.value }))}
              />
            </FF>
            <div className="grid grid-cols-2 gap-4">
              <FF label="Importe (€)">
                <input
                  type="number" min="0" step="0.01" className={inputCls}
                  placeholder="85.00"
                  value={reciboForm.importe}
                  onChange={e => setReciboForm(f => ({ ...f, importe: e.target.value }))}
                />
              </FF>
              <FF label="Vencimiento">
                <input
                  type="date" className={inputCls}
                  value={reciboForm.fechaVencimiento}
                  onChange={e => setReciboForm(f => ({ ...f, fechaVencimiento: e.target.value }))}
                />
              </FF>
            </div>
            {suscripcion && (
              <CasillaRenovacion
                planNombre={plan?.nombre ?? 'plan'}
                marcada={reciboForm.esRenovacion}
                onCambio={esRenovacion => setReciboForm(f => ({ ...f, esRenovacion }))}
              />
            )}
          </div>
          <div className="flex gap-3 mt-6">
            <button onClick={() => setShowAddRecibo(false)} className="flex-1 py-2.5 rounded-xl text-sm font-bold border border-border text-muted-foreground hover:bg-muted">
              Cancelar
            </button>
            <button
              onClick={handleAddRecibo}
              // Con trim, como el mismo guard en panel-pendientes: sin él un
              // concepto de solo espacios habilitaba el botón, handleAddRecibo lo
              // guardaba ya trimeado (vacío) y el email del cobro salía luego
              // como "Pago confirmado — undefined".
              disabled={!reciboForm.concepto.trim() || !reciboForm.importe}
              className="flex-1 py-2.5 rounded-xl text-sm font-bold text-primary-foreground bg-primary hover:brightness-95 disabled:opacity-40 transition-colors"
            >
              Crear cobro
            </button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Send message */}
      <Dialog open={showSendMessage} onOpenChange={open => !open && setShowSendMessage(false)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-lg font-semibold text-foreground">Enviar mensaje a {socio.nombre}</DialogTitle>
          </DialogHeader>
          <p className="text-xs text-muted-foreground -mt-1">Para: {socio.email}</p>
          <div className="space-y-4 mt-3">
            <FF label="Asunto">
              <input
                className={inputCls}
                placeholder="Recordatorio de clase…"
                value={msgForm.asunto}
                onChange={e => setMsgForm(f => ({ ...f, asunto: e.target.value }))}
              />
            </FF>
            <FF label="Mensaje">
              <textarea
                rows={5}
                className={inputCls + ' resize-none'}
                placeholder="Escribe tu mensaje aquí…"
                value={msgForm.cuerpo}
                onChange={e => setMsgForm(f => ({ ...f, cuerpo: e.target.value }))}
              />
            </FF>
          </div>
          <div className="flex gap-3 mt-6">
            <button onClick={() => setShowSendMessage(false)} className="flex-1 py-2.5 rounded-xl text-sm font-bold border border-border text-muted-foreground hover:bg-muted">
              Cancelar
            </button>
            <button
              onClick={handleSendMessage}
              disabled={!msgForm.asunto.trim() || !msgForm.cuerpo.trim() || enviandoMsg}
              className="flex-1 py-2.5 rounded-xl text-sm font-bold text-primary-foreground bg-primary hover:brightness-95 disabled:opacity-40 transition-colors flex items-center justify-center gap-2"
            >
              {enviandoMsg ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}Enviar email
            </button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Confirmar cancelación de la suscripción.
          Cancelar un bono con sesiones sin gastar TIRA algo que la clienta ya
          ha pagado, así que se dice cuántas quedan antes de pulsar — es la
          diferencia entre una decisión y un susto. Con una cuota mensual no hay
          saldo que perder y el texto no lo inventa. */}
      <Dialog open={!!confirmarCancelarSus && !!suscripcion} onOpenChange={open => !open && setConfirmarCancelarSus(null)}>
        <DialogContent className="max-w-sm">
          <div className="flex flex-col items-center text-center gap-4 py-2">
            <div className="w-14 h-14 rounded-xl flex items-center justify-center bg-destructive/10">
              <XCircle size={24} className="text-destructive" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-foreground mb-1">Cancelar la suscripción</h3>
              {suscripcion && confirmarCancelarSus === 'elegir' ? (
                // Una cuota con fecha de renovación: lo normal es dejarla
                // terminar el periodo que ya ha pagado (evaluación del 13-sep).
                <p className="text-sm text-muted-foreground">
                  Lo habitual es darla de baja <strong className="text-foreground">al final del periodo</strong>: {socio.nombre} sigue
                  reservando hasta el {suscripcion.fechaFin ? fecha(suscripcion.fechaFin) : 'final del periodo'}.{' '}
                  {textoCobrosAlCancelar(studio?.recibosAlCancelarCuota ?? 'MANTENER_CON_REINTENTOS', pendientesCuota, 'al-final')}{' '}
                  Si la cancelas ahora, deja de poder reservar desde hoy
                  {pendientesCuota.length > 0
                    ? `: ${textoCobrosAlCancelar(studio?.recibosAlCancelarCuota ?? 'MANTENER_CON_REINTENTOS', pendientesCuota, 'ahora').replace('No se generarán cobros nuevos de esta cuota. ', '')}`
                    : '.'}
                  {plazasFijas.some(p => p.socioId === id && p.estado !== 'BAJA') && (
                    <> {textoPlazaFijaSinCuota(studio?.plazaFijaSinCuota ?? 'MANTENER', 'elegir', suscripcion.fechaFin ? fecha(suscripcion.fechaFin) : null)}</>
                  )}
                </p>
              ) : (
                <p className="text-sm text-muted-foreground">
                  {plan?.nombre ? `«${plan.nombre}» dejará` : 'La suscripción dejará'} de estar activa: {socio.nombre} no podrá reservar con ella.{' '}
                  {textoCobrosAlCancelar(studio?.recibosAlCancelarCuota ?? 'MANTENER_CON_REINTENTOS', pendientesCuota, 'ahora')}
                  {(suscripcion?.sesionesRestantes ?? 0) > 0 && (
                    <> Le quedan <strong className="text-destructive">{suscripcion!.sesionesRestantes} {suscripcion!.sesionesRestantes === 1 ? 'sesión' : 'sesiones'} sin usar</strong> que ya ha pagado, y las pierde.</>
                  )}
                  {plazasFijas.some(p => p.socioId === id && p.estado !== 'BAJA') && (
                    <> {textoPlazaFijaSinCuota(studio?.plazaFijaSinCuota ?? 'MANTENER', 'ahora')}</>
                  )}
                  {' '}Puedes volver a activarla después desde esta misma tarjeta.
                </p>
              )}
            </div>
            {suscripcion && confirmarCancelarSus === 'elegir' ? (
              <div className="flex flex-col gap-2 w-full">
                <button onClick={() => handleProgramarBaja(true)} disabled={cambiandoPlan} className="w-full py-2.5 rounded-xl text-sm font-bold text-primary-foreground bg-primary hover:brightness-95 disabled:opacity-50 transition-colors">
                  {cambiandoPlan ? 'Guardando…' : `Dar de baja el ${suscripcion.fechaFin ? fecha(suscripcion.fechaFin) : 'final del periodo'}`}
                </button>
                <button onClick={handleCancelarSuscripcion} disabled={cambiandoPlan} className="w-full py-2.5 rounded-xl text-sm font-bold text-destructive border border-destructive/30 hover:bg-destructive/10 disabled:opacity-50 transition-colors">
                  Cancelar ahora
                </button>
                <button onClick={() => setConfirmarCancelarSus(null)} className="w-full py-2 rounded-xl text-sm font-bold text-muted-foreground hover:bg-muted">
                  Volver
                </button>
              </div>
            ) : (
            <div className="flex gap-3 w-full">
              <button onClick={() => setConfirmarCancelarSus(null)} className="flex-1 py-2.5 rounded-xl text-sm font-bold border border-border text-muted-foreground hover:bg-muted">
                Volver
              </button>
              <button onClick={handleCancelarSuscripcion} disabled={cambiandoPlan} className="flex-1 py-2.5 rounded-xl text-sm font-bold text-white bg-red-500 hover:bg-red-600 disabled:opacity-50 transition-colors">
                {cambiandoPlan ? 'Cancelando…' : 'Cancelar suscripción'}
              </button>
            </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Dar de baja (reversible) y borrar sus datos (RGPD, solo la propietaria). */}
      <DialogoDarDeBaja
        socio={socio}
        abierto={showBaja && gestionaClientas}
        onCerrar={() => setShowBaja(false)}
        onHecho={resumen => { setShowBaja(false); setToast(resumen); }}
      />
      <DialogoBorrarDatos
        socio={socio}
        abierto={showConfirmDelete && puedeBorrarDatosClienta(rol)}
        borrando={borrando}
        error={errorBorrar}
        onCerrar={() => { setShowConfirmDelete(false); setErrorBorrar(null); }}
        onConfirmar={() => void handleDelete()}
      />

      {/* Toast */}
      {toast && <Toast message={toast} onDismiss={() => setToast(null)} />}
    </div>
  );
}
