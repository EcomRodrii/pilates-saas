'use client';

import { useState, useMemo, useEffect, useRef, useId, isValidElement, cloneElement, type ReactElement, type ReactNode, type ElementType, type MouseEvent } from 'react';
import { useSemaforoRecepcion } from '@/lib/hooks/use-semaforo-recepcion';
import { useCampoAsociado } from '@/components/ui/use-campo-asociado';
import { useRouter } from 'next/navigation';
import { useStudio } from '@/lib/studio-context';
import { useRol, puedeVerSemaforo, puedeGestionarClientas, puedeMoverDinero, puedeVerDatosPrivadosSocia } from '@/lib/permisos';
import { cambiosSociaPermitidos } from '@/lib/socios/datos-privados';
import { semaforo, SEMAFORO_META } from '@/lib/ficha-clinica';
import { enviarEmailBienvenida } from '@/lib/api-client';
import { textoLegalCompleto, textoConsentimientoMarketing } from '@/lib/legal-textos';
import { sellarAceptacionMostrador } from '@/lib/aceptacion-contrato-cliente';
import { tieneConsentimientoMarketingAlgunaVez } from '@/lib/marketing/consentimiento';
import { ERROR_GENERICO } from '@/lib/errores';
import { calcularEstadoSuscripcion, textoCaducidad } from '@/lib/suscripcion-estado';
import type { Socio, NivelSemaforo, Suscripcion, PlanTarifa, MetodoCobro } from '@/lib/types';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { DialogoPlazaFija, textoPlazaGuardada } from '@/components/plazas-fijas/dialogo-plaza-fija';
import { EtiquetaFija } from '@/components/clientas/etiqueta-fija';
import { ETIQUETA_GENERO, GENEROS, generoDe, trato, type Genero } from '@/lib/genero';
import { EmptyState } from '@/components/ui/empty-state';
import {
  ListChecks, Search, Plus, Users,
  ChevronUp, ChevronDown, ChevronsUpDown, Mail, Pencil,
  AlertTriangle, CheckCircle2, Upload, X,
  Tag, FileText, PenLine, ShieldCheck, Loader2,
  CalendarPlus, CreditCard, Download, ArrowUpRight, SlidersHorizontal, MoreHorizontal,
} from 'lucide-react';
import Link from 'next/link';
import { cn, hoyEnEstudio } from '@/lib/utils';
import { useEsAncho } from '@/lib/hooks/use-es-ancho';
import { useEstadosClientas } from '@/lib/clientas/use-estados-clientas';
import { useAvisosClientas } from '@/lib/clientas/use-avisos-clientas';
import { useSeguimientosParaHoy } from '@/lib/clientas/use-seguimientos';
import { useBajasAbiertas } from '@/lib/clientas/use-bajas';
import { DEFINICION_ESTADO, ESTADOS_CLIENTA, ETIQUETA_ESTADO, sinVenir, type EstadoClienta } from '@/lib/clientas/estado';
import { colorDeAvatar as avatarColor, cuandoClase, fechaCorta, haceCuanto, textoDesde } from '@/lib/clientas/textos';
import { PastillaAviso, PastillaEstado, PastillaSeguimiento, PuntoEstado } from '@/components/clientas/piezas';
import { FichaClienta } from '@/components/clientas/ficha-clienta';
import { MenuAcciones, type AccionMenu } from '@/components/ui/menu-acciones';
import { InteresadasYPruebas } from '@/components/clientas/interesadas-y-pruebas';
import { ProfileAvatar } from '@/components/ui/profile-avatar';
import { CamposExtraFields } from '@/components/socios/campos-extra-fields';
import { PageHeader } from '@/components/ui/page-header';
import { SolicitudesDerechosPendientes } from '@/components/socios/solicitudes-derechos-pendientes';
import { listarConsultas, marcarAtendida, type ConsultaContacto } from '@/lib/contacto/consultas-cliente';
import { useAuth } from '@/lib/auth-context';
import { ConstructorSegmentos } from '@/components/segmentos/constructor-segmento';
import { construirContextoSegmento, evaluarSegmento } from '@/lib/segmentos/evaluador';
import type { SegmentoCliente } from '@/lib/segmentos/tipos';
import { emiteFacturas } from '@/lib/factura-automatica';

// ─── Shared style tokens ────────────────────────────────────────────────────
const inputCls =
  'w-full rounded-lg border border-border bg-card px-3 py-2 text-[13px] font-medium text-foreground focus:outline-none focus:border-muted-foreground transition-colors placeholder:text-muted-foreground';
const selectCls = inputCls + ' appearance-none';

// ─── Types ───────────────────────────────────────────────────────────────────
// El filtro principal es el ESTADO de la clienta (lib/clientas/estado.ts): el
// mismo número en el chip, en las filas y en Resumen. «Más» son cortes que no
// son un estado: quién lleva 30 días sin venir, quién no ha dado el
// consentimiento de marketing, con o sin plan.
type FiltroEstado = 'TODAS' | EstadoClienta;
type FiltroMas = '' | 'seguimiento_hoy' | 'sin_venir_30d' | 'sin_consentimiento_mkt' | 'con_plan' | 'sin_plan';
const FILTROS_MAS: { id: Exclude<FiltroMas, ''>; label: string }[] = [
  // Los «Recuérdamelo» de hoy o atrasados (de quien mira o de nadie): el enlace
  // de «Por decidir» del Resumen llega aquí.
  { id: 'seguimiento_hoy', label: 'Con seguimiento para hoy' },
  { id: 'sin_venir_30d', label: 'Sin venir en 30 días' },
  { id: 'con_plan', label: 'Con plan o bono' },
  { id: 'sin_plan', label: 'Sin plan ni bono' },
  { id: 'sin_consentimiento_mkt', label: 'Sin consentimiento de marketing' },
];
type SortKey = 'nombre' | 'ultima_visita' | 'sesiones_restantes' | 'fecha_registro';
type SortDir = 'asc' | 'desc';

type FormSocia = {
  nombre: string;
  apellidos: string;
  email: string;
  telefono: string;
  nif: string;
  planId: string;
  /** Género gramatical de las palabras que hablan de ella o de él. '' = sin indicar (se escribe en femenino, como siempre). */
  genero: Genero | '';
  // Qué pasó con el dinero de esa primera cuota/bono. Por defecto, nada: el
  // recibo nace PENDIENTE. Antes el alta lo daba por cobrado siempre y sin
  // método, y «Cobrado este mes» contaba dinero que no había entrado.
  cobroPagado: boolean;
  cobroMetodo: Exclude<MetodoCobro, 'SEPA'>;
  camposExtra: Record<string, string | number | boolean | null>;
};

const emptyForm = (): FormSocia => ({
  nombre: '',
  apellidos: '',
  email: '',
  telefono: '',
  nif: '',
  planId: '',
  genero: '',
  cobroPagado: false,
  cobroMetodo: 'EFECTIVO',
  camposExtra: {},
});

// ─── Helpers ─────────────────────────────────────────────────────────────────
const RE_DIACRITICOS = /[̀-ͯ]/g;
function normalizaBusqueda(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(RE_DIACRITICOS, '');
}

// Tono del avatar. Sale de la paleta CATEGÓRICA del panel (`--cat-1..9`), que
// ya está resuelta para claro y para oscuro, en vez de los seis pares de hex
// fijos que había — pensados solo para fondo claro, y con un despiste dentro:
// el primer par mezclaba un fondo índigo con una tinta VERDE LIMA (#6E9E0A),
// que era el único que no compartía familia con su fondo. Nueve tonos en vez de
// seis, además, reparten mejor una lista larga.


// ─── Sub-components ───────────────────────────────────────────────────────────
// `description` es lo que faltaba: antes este wrapper solo aceptaba
// { label, children } y no había dónde explicar, p.ej., para qué se usa el
// email o qué pasa al elegir un plan aquí mismo. Mismo mecanismo que en
// Configuración: id + aria-describedby inyectados en el control real, así el
// lector de pantalla lee la explicación junto con el nombre del campo.
function FF({
  label,
  description,
  required,
  children,
}: {
  label: string;
  description?: ReactNode;
  required?: boolean;
  children: ReactNode;
}) {
  const { htmlFor, control } = useCampoAsociado(children);
  const descAutoId = useId();
  const idDesc = description ? `${descAutoId}-desc` : undefined;
  const controlDescrito = idDesc && isValidElement(control)
    ? cloneElement(control as ReactElement<{ 'aria-describedby'?: string }>, { 'aria-describedby': idDesc })
    : control;

  return (
    <div className="space-y-1.5">
      <label htmlFor={htmlFor} className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        {label}{required && <span className="text-destructive"> *</span>}
      </label>
      {description && (
        <p id={idDesc} className="text-xs leading-relaxed text-muted-foreground text-balance">
          {description}
        </p>
      )}
      {controlDescrito}
    </div>
  );
}


function SortIcon({ active, dir }: { active: boolean; dir: SortDir }) {
  if (!active) return <ChevronsUpDown size={11} className="text-muted-foreground ml-1 inline" />;
  return dir === 'asc'
    ? <ChevronUp size={11} className="text-foreground ml-1 inline" />
    : <ChevronDown size={11} className="text-foreground ml-1 inline" />;
}

// ─── Main page ────────────────────────────────────────────────────────────────
export default function Socios() {
  const router = useRouter();
  const {
    socios, suscripciones, planesTarifa, reservas, sesiones, addSocio, updateSocio, assignPlan, studioConfig, condicionesSalud, camposPersonalizados,
    segmentosClientes, addSegmentoCliente, updateSegmentoCliente, deleteSegmentoCliente,
    ampliarCaducidades, addTagSocio,
    // `studio` solo para PINTAR el texto legal en el diálogo de consentimiento.
    // Quien lo escribe de verdad es `registrarConsentimientoMarketing`, que lo
    // compone en el contexto con el mismo helper: el diálogo tiene que enseñar
    // exactamente lo que se va a guardar, no una versión parecida.
    studio, registrarConsentimientoMarketing,
    plazasFijas,
  } = useStudio();
  const rol = useRol();
  const verSemaforo = puedeVerSemaforo(rol);
  // El servidor y la RLS ya rechazan esto a la instructora (migr 0112/0118). Lo
  // que faltaba era no enseñárselo: veía "Nueva clienta", "Importar", editar,
  // dar de baja y cambiar plan, los pulsaba, y se llevaba un error. Un botón que
  // siempre falla no es una funcionalidad, es una trampa.
  const gestionaClientas = puedeGestionarClientas(rol);
  // NIF y firma son datos privados (M1 RGPD): solo propietaria y recepción los
  // ven, los rellenan y los mandan. Un MANAGER da el alta sin ellos.
  const veDatosPrivados = puedeVerDatosPrivadosSocia(rol);
  const mueveDinero = puedeMoverDinero(rol);

  // Quién tiene una plaza fija (no dada de baja): la lista lo enseña junto al
  // nombre, para no tener que abrir la ficha una a una. Mismo criterio que
  // `ofrecerPlazaFijaSiCuota`: una plaza en BAJA ya no cuenta.
  const idsFijas = useMemo(
    () => new Set(plazasFijas.filter((p) => p.estado !== 'BAJA').map((p) => p.socioId)),
    [plazasFijas],
  );

  // Semáforo de salud por clienta (solo el color; el motivo vive en el detalle).
  // FICHA-CLINICA.md §1, §11 — RECEPCIÓN sí ve el color, pero no el motivo ni
  // las condiciones (eso lo tapa `puedeVerFichaClinica` en la ficha de detalle).
  const semaforoPorSocio = useMemo(() => {
    const porSocio = new Map<string, NivelSemaforo>();
    if (!verSemaforo) return porSocio;
    const grupos = new Map<string, typeof condicionesSalud>();
    for (const c of condicionesSalud) {
      const arr = grupos.get(c.socioId) ?? [];
      arr.push(c);
      grupos.set(c.socioId, arr);
    }
    for (const [socioId, conds] of grupos) {
      const nivel = semaforo(conds);
      if (nivel !== 'VERDE') porSocio.set(socioId, nivel);
    }
    return porSocio;
  }, [condicionesSalud, verSemaforo]);

  // RECEPCIÓN sí ve el semáforo, pero la RLS de condiciones_salud no le deja
  // leer las filas — `condicionesSalud` le llega SIEMPRE vacío, así que el
  // cálculo de arriba nunca produce nada para ese rol. useSemaforoRecepcion
  // pide el nivel ya calculado por RPC (sin condiciones ni motivo).
  const semaforoRecepcion = useSemaforoRecepcion(rol);
  const semaforoParaMostrar = rol === 'RECEPCION' ? semaforoRecepcion : semaforoPorSocio;

  // Filter & sort state
  const [busqueda, setBusqueda] = useState('');
  const [filtroEstado, setFiltroEstado] = useState<FiltroEstado>('TODAS');
  const [filtroMas, setFiltroMas] = useState<FiltroMas>('');
  const [filtroPlan, setFiltroPlan] = useState('');
  const [segmentoAplicado, setSegmentoAplicado] = useState<SegmentoCliente | null>(null);
  const [filtroEtiqueta, setFiltroEtiqueta] = useState('');
  const [vista, setVista] = useState<'clientas' | 'interesadas'>('clientas');
  // La clienta abierta al lado de la lista (pantallas anchas). En la URL, para
  // que volver atrás o recargar la deje donde estaba.
  const [abierta, setAbierta] = useState<string | null>(null);
  const ancho = useEsAncho();
  // P0-34: paginación — no montar miles de filas (× 2 variantes responsive) a la
  // vez en el DOM. Se muestran de PAGE en PAGE con "Ver más".
  const PAGE = 50;
  const [visibles, setVisibles] = useState(PAGE);
  const [sortKey, setSortKey] = useState<SortKey>('nombre');
  const [sortDir, setSortDir] = useState<SortDir>('asc');

  // Bulk selection
  // Lo marcado a mano. Las acciones en bloque trabajan sobre `selected` (más
  // abajo): lo marcado QUE SE VE con los filtros de ahora.
  const [seleccionMarcada, setSelected] = useState<Set<string>>(new Set());
  const [showAcceso, setShowAcceso] = useState(false);
  const [enviandoAcceso, setEnviandoAcceso] = useState(false);
  const [resultadoAcceso, setResultadoAcceso] = useState<string | null>(null);
  const [showAsignarPlan, setShowAsignarPlan] = useState(false);
  const [asignarPlanId, setAsignarPlanId] = useState('');
  const [asignando, setAsignando] = useState(false);
  const [errorAsignar, setErrorAsignar] = useState<string | null>(null);
  // Ampliar caducidad en lote (cierre del centro, festivos, vacaciones).
  const [showAmpliar, setShowAmpliar] = useState(false);
  // Registro en lote del consentimiento de marketing. `afirmado` es el requisito
  // que separa volcar permisos que existen de fabricar los que no: la
  // propietaria tiene que decir que los tiene antes de que el botón se active.
  const [showConsentMkt, setShowConsentMkt] = useState(false);
  const [afirmadoConsentMkt, setAfirmadoConsentMkt] = useState(false);
  const [guardandoConsentMkt, setGuardandoConsentMkt] = useState(false);
  const [resultadoConsentMkt, setResultadoConsentMkt] = useState<string | null>(null);
  const [errorConsentMkt, setErrorConsentMkt] = useState<string | null>(null);
  const [diasAmpliar, setDiasAmpliar] = useState(7);
  const [ampliando, setAmpliando] = useState(false);
  const [errorAmpliar, setErrorAmpliar] = useState<string | null>(null);
  const [resultadoAmpliar, setResultadoAmpliar] = useState<{ bonos: number; recuperaciones: number } | null>(null);

  // Create / edit modal
  const [showForm, setShowForm] = useState<'nueva' | 'editar' | null>(null);
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [form, setForm] = useState<FormSocia>(emptyForm());
  // El alta se abrió desde una consulta de la web: al guardarse bien, esa
  // consulta pasa a atendida (y la tarjeta se recarga).
  const [consultaEnAlta, setConsultaEnAlta] = useState<string | null>(null);
  const [recargaConsultas, setRecargaConsultas] = useState(0);
  const { user } = useAuth();

  // Multi-step "nueva clienta" contract flow
  const [firma, setFirma] = useState('');
  const [aceptado, setAceptado] = useState(false);
  // El alta escribe en la BD y puede fallar: hasta ahora se cerraba el diálogo
  // igualmente y la clienta salía en la lista sin existir de verdad.
  const [guardando, setGuardando] = useState(false);
  // Cerrojo SÍNCRONO del alta: el estado `guardando` no llega a tiempo de parar un segundo clic, y
  // cada envío acuña recibos con ids nuevos (dos altas, dos recibos, dos cobros).
  const altaEnCursoRef = useRef(false);
  const [errorGuardar, setErrorGuardar] = useState<string | null>(null);
  // Aviso de las acciones de FILA (activar/desactivar). Aparte de `errorGuardar`
  // a propósito: aquel se pinta dentro del modal de alta/edición, así que
  // usarlo desde la lista dejaría el fallo escrito donde nadie lo ve — que es
  // justo el bug que hubo que arreglar en /reservar (#505).
  const [errorFila, setErrorFila] = useState<string | null>(null);
  // Tras dar de alta (o cambiar a) una cuota: a quién se le ofrece plaza fija, y
  // para quién está abierto el diálogo si dice que sí.
  const [ofrecerPlazaFija, setOfrecerPlazaFija] = useState<{ socioId: string; nombre: string; plan: string } | null>(null);
  // Lo último que se ofreció, para pintar el texto mientras la ventana se cierra
  // (si no, el párrafo desaparece a mitad de la animación y la ventana da un salto).
  const [ultimaOferta, setUltimaOferta] = useState<{ nombre: string; plan: string } | null>(null);
  const [plazaFijaPara, setPlazaFijaPara] = useState<string | null>(null);
  // Esta pantalla no tiene toast: lo que ha guardado el diálogo se dice arriba.
  const [avisoPlazaFija, setAvisoPlazaFija] = useState<string | null>(null);
  const contratoRef = useRef<HTMLDivElement>(null);

  // (El reset de la selección al cambiar de filtro vive más abajo, junto al de
  // la paginación: los dos vigilaban las mismas cuatro dependencias y ahora
  // son un único ajuste en render.)

  // Auto-open create modal when ?nuevo=1 in URL (linked from dashboard)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    // `?nuevo=1` abre el alta sin pasar por el botón: si no se comprueba aquí,
    // basta el enlace del dashboard (o escribir la url) para saltarse la puerta.
    if (params.get('nuevo') === '1' && gestionaClientas) {
      // `&nombre=` lo manda el buscador de «Añadir clienta a la clase» del
      // calendario cuando no encuentra a nadie: lo escrito pasa a nombre (la
      // primera palabra) y apellidos (el resto), editable como cualquier alta.
      const [nombre = '', ...apellidos] = (params.get('nombre') ?? '').trim().split(/\s+/);
      // eslint-disable-next-line react-hooks/set-state-in-effect -- Lee window.location.search (?nuevo=1). La URL no existe durante el render en servidor, así que esto NO se puede derivar en render.
      setForm({ ...emptyForm(), nombre, apellidos: apellidos.join(' ') });
      setShowForm('nueva');
      window.history.replaceState({}, '', '/clientas');
    }
    // `gestionaClientas` SÍ va en las dependencias, no es ruido: el rol se
    // resuelve después del primer render, así que con `[]` el efecto corría una
    // vez con el permiso todavía en false y el enlace `?nuevo=1` del dashboard
    // no abría nada. Al volver a correr cuando el permiso llega, la URL sigue
    // teniendo `?nuevo=1` (solo se limpia si se entró) y el alta se abre.
  }, [gestionaClientas]);

  // ── Índices precomputados (P0-34) ──────────────────────────────────────────
  // Antes cada helper escaneaba suscripciones/reservas/sesiones ENTERAS, y se
  // llamaban por cada socio en stats, en el filtro y en el comparador del sort:
  // O(socios² × reservas × sesiones). Ahora todo es O(1) por socio.
  const sesionById = useMemo(() => new Map(sesiones.map((s) => [s.id, s])), [sesiones]);
  const activeSusPorSocio = useMemo(() => {
    const m = new Map<string, typeof suscripciones[number]>();
    for (const s of suscripciones) {
      if ((s.estado === 'ACTIVA' || s.estado === 'PAUSADA') && !m.has(s.socioId)) m.set(s.socioId, s);
    }
    return m;
  }, [suscripciones]);
  // Lo que de verdad le queda a cada socia, sumando TODOS sus bonos vigentes.
  // `activeSusPorSocio` guarda la primera ACTIVA/PAUSADA que aparezca en el
  // array, y ese array llega sin `order by`: con varios bonos vivos (que es el
  // diseño, no una anomalía) la columna «Sesiones rest.» enseñaba el saldo de
  // uno cualquiera de ellos, y no se movía al venderle otro.
  //
  // Mismos criterios que `saldoSesionesBono` (lib/bono-logic), pero en UNA
  // pasada y no una por socia: esta tabla lista el estudio entero y el resto de
  // índices de aquí arriba existen justo por eso. No es duplicación a la que
  // haya que "sacar factor común" — si cambian los criterios, cambian los dos.
  const saldoBonosPorSocio = useMemo(() => {
    const hoyISO = new Date().toISOString().slice(0, 10);
    const m = new Map<string, number>();
    for (const s of suscripciones) {
      if (s.estado !== 'ACTIVA' || s.sesionesRestantes === null) continue;
      if (s.fechaFin && s.fechaFin < hoyISO) continue;
      const plan = planesTarifa.find((p) => p.id === s.planId);
      if (!plan || (plan.tipo !== 'BONO' && plan.tipo !== 'PUNTUAL')) continue;
      m.set(s.socioId, (m.get(s.socioId) ?? 0) + s.sesionesRestantes);
    }
    return m;
  }, [suscripciones, planesTarifa]);
  const ultimaVisitaPorSocio = useMemo(() => {
    const m = new Map<string, string>();
    for (const r of reservas) {
      if (r.estado !== 'ASISTIDA') continue;
      const ses = sesionById.get(r.sesionId);
      if (!ses) continue;
      const prev = m.get(r.socioId);
      if (!prev || ses.inicio > prev) m.set(r.socioId, ses.inicio);
    }
    return m;
  }, [reservas, sesionById]);

  // ── Derived helpers (O(1) por socio con los índices de arriba) ─────────────
  function getActiveSus(socioId: string) {
    return activeSusPorSocio.get(socioId);
  }

  function getPlan(planId: string | undefined) {
    if (!planId) return null;
    return planesTarifa.find((p) => p.id === planId) ?? null;
  }

  function getLastVisit(socioId: string): string | null {
    return ultimaVisitaPorSocio.get(socioId) ?? null;
  }

  // El estado de cada clienta (uno, calculado con sus datos) y su aviso (como
  // mucho uno). La hora con la que se calcula se fija al montar.
  const estados = useEstadosClientas();
  const ahoraMs = estados.ahora?.getTime() ?? 0;
  const hoyISO = estados.ahora ? hoyEnEstudio(estados.ahora) : null;
  const { avisoDe, atendido } = useAvisosClientas(hoyISO);
  // Los «Recuérdamelo» de hoy o atrasados, por clienta (para el filtro y la marca de su fila).
  const seguimientosHoy = useSeguimientosParaHoy(gestionaClientas, hoyISO, user?.id ?? null);
  // El motivo de las bajas abiertas («De baja · desde 12 sep · se muda»).
  const bajasAbiertas = useBajasAbiertas(gestionaClientas);

  // «Sin venir en 30 días»: la misma regla (`sinVenir`) que la cifra de Resumen,
  // que enlaza a este filtro.
  function isInactiva30d(socioId: string, s?: Socio): boolean {
    if (!estados.ahora) return false;
    return sinVenir(estados.porSocio.get(socioId), estados.hechos.get(socioId), s?.fechaAlta, estados.ahora);
  }

  // Su próxima clase reservada (confirmada), para la fila.
  const proximaPorSocio = useMemo(() => {
    const m = new Map<string, string>();
    if (!ahoraMs) return m;
    const ahoraIso = new Date(ahoraMs).toISOString();
    for (const r of reservas) {
      if (r.estado !== 'CONFIRMADA') continue;
      const ses = sesionById.get(r.sesionId);
      if (!ses || ses.cancelada || ses.inicio < ahoraIso) continue;
      const prev = m.get(r.socioId);
      if (!prev || ses.inicio < prev) m.set(r.socioId, ses.inicio);
    }
    return m;
  }, [reservas, sesionById, ahoraMs]);

  // Lo que ha comprado de verdad cada una, por plan: el filtro «Plan» mira las
  // suscripciones vivas (activas o pausadas), no una cualquiera.
  // Su último plan, si ya no tiene ninguno vivo (el que acabó más tarde).
  const ultimoPlanPorSocio = useMemo(() => {
    const m = new Map<string, Suscripcion>();
    for (const s of suscripciones) {
      if (s.estado === 'ACTIVA' || s.estado === 'PAUSADA') continue;
      const previo = m.get(s.socioId);
      const clave = (x: Suscripcion) => x.fechaFin ?? x.fechaInicio;
      if (!previo || clave(s) > clave(previo)) m.set(s.socioId, s);
    }
    return m;
  }, [suscripciones]);

  const planesVivosPorSocio = useMemo(() => {
    const m = new Map<string, Set<string>>();
    for (const s of suscripciones) {
      if (s.estado !== 'ACTIVA' && s.estado !== 'PAUSADA') continue;
      const set = m.get(s.socioId) ?? new Set<string>();
      set.add(s.planId);
      m.set(s.socioId, set);
    }
    return m;
  }, [suscripciones]);

  // "Caduca en N días"/"Próxima renovación en N días" para la fila de la
  // tabla y la card móvil — mismo cálculo puro que la ficha de la clienta
  // (lib/suscripcion-estado.ts), sin reimplementar la cuenta de días aquí.
  function textoCaducidadFila(sus: Suscripcion | undefined, plan: PlanTarifa | null): string | null {
    if (!sus || !plan) return null;
    return textoCaducidad(calcularEstadoSuscripcion(sus, plan));
  }
  function colorCaducidadFila(sus: Suscripcion | undefined, plan: PlanTarifa | null): string {
    if (!sus || !plan) return 'var(--muted-foreground)';
    const estado = calcularEstadoSuscripcion(sus, plan);
    if (estado.kind === 'bono') return estado.caducado ? 'var(--destructive)' : estado.urgente ? 'var(--warning)' : 'var(--muted-foreground)';
    if (estado.kind === 'recurrente') return estado.urgente ? 'var(--warning)' : 'var(--muted-foreground)';
    return 'var(--muted-foreground)';
  }

  // ── Filtered + sorted list ─────────────────────────────────────────────────
  const lista = useMemo(() => {
    // Sin normalizar acentos, buscar "maria" no encontraba a "María" (y
    // viceversa) — el gesto más natural de escribir rápido en el buscador.
    const q = normalizaBusqueda(busqueda);
    const ctxSegmento = segmentoAplicado
      ? construirContextoSegmento(socios, suscripciones, reservas, sesiones, camposPersonalizados, ahoraMs ? new Date(ahoraMs) : new Date(), estados.porSocio)
      : null;
    const filtered = socios.filter((s) => {
      // Search
      const matchB =
        !q ||
        normalizaBusqueda(`${s.nombre} ${s.apellidos} ${s.email} ${s.telefono ?? ''}`).includes(q);
      // Estado: el mismo cálculo que cuenta el chip y la cifra de Resumen.
      const estado = estados.porSocio.get(s.id);
      const matchEstado = filtroEstado === 'TODAS' || estado?.estado === filtroEstado;
      let matchMas = true;
      if (filtroMas === 'seguimiento_hoy') matchMas = seguimientosHoy?.has(s.id) ?? false;
      if (filtroMas === 'sin_venir_30d') matchMas = isInactiva30d(s.id, s);
      if (filtroMas === 'con_plan') matchMas = estado?.derecho === true;
      if (filtroMas === 'sin_plan') matchMas = estado?.derecho !== true;
      // Presencia, no vigencia: el panel no trae el texto del consentimiento,
      // así que una socia con uno ANTIGUO (el estudio se renombró) no sale
      // aquí aunque haya que renovarlo. La RPC sí lo distingue y lo cuenta
      // como registrada — ver sinConsentimientoMarketing en lib/marketing.
      if (filtroMas === 'sin_consentimiento_mkt') matchMas = !tieneConsentimientoMarketingAlgunaVez(s);
      const matchPlan = !filtroPlan || (planesVivosPorSocio.get(s.id)?.has(filtroPlan) ?? false);
      const matchEtiqueta = !filtroEtiqueta || (s.tags ?? []).includes(filtroEtiqueta);
      const matchSegmento = !segmentoAplicado || !ctxSegmento || evaluarSegmento(segmentoAplicado.condiciones, s, ctxSegmento);
      return matchB && matchEstado && matchMas && matchPlan && matchEtiqueta && matchSegmento;
    });

    return [...filtered].sort((a, b) => {
      let cmp = 0;
      if (sortKey === 'nombre') {
        cmp = `${a.nombre} ${a.apellidos}`.localeCompare(`${b.nombre} ${b.apellidos}`, 'es');
      } else if (sortKey === 'ultima_visita') {
        const la = getLastVisit(a.id);
        const lb = getLastVisit(b.id);
        if (!la && !lb) cmp = 0;
        else if (!la) cmp = 1;
        else if (!lb) cmp = -1;
        else cmp = new Date(lb).getTime() - new Date(la).getTime();
      } else if (sortKey === 'sesiones_restantes') {
        // Por saldo real, igual que la columna: ordenar por el bono de turno
        // ponía arriba a quien tiene 20 sesiones repartidas en cuatro bonos.
        const sa = saldoBonosPorSocio.get(a.id) ?? getActiveSus(a.id)?.sesionesRestantes ?? -1;
        const sb = saldoBonosPorSocio.get(b.id) ?? getActiveSus(b.id)?.sesionesRestantes ?? -1;
        cmp = sb - sa;
      } else if (sortKey === 'fecha_registro') {
        // Sin fecha de alta (la columna admite nulos), al final: NaN rompería el orden.
        cmp = (Date.parse(b.fechaAlta ?? '') || 0) - (Date.parse(a.fechaAlta ?? '') || 0);
      }
      return sortDir === 'asc' ? cmp : -cmp;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [socios, suscripciones, reservas, sesiones, camposPersonalizados, busqueda, filtroEstado, filtroMas, filtroPlan, filtroEtiqueta, segmentoAplicado, sortKey, sortDir, ahoraMs, estados.porSocio, planesVivosPorSocio, seguimientosHoy]);

  // Auditoría PR #1276 (QA): el estado vacío y "Limpiar filtros" solo miraban
  // busqueda/smartFilter — con filtroEtapa/filtroEtiqueta/segmentoAplicado
  // vaciando la lista, se veía "Aún no hay clientas" (mensaje de cuenta
  // nueva) sin ningún botón para salir del filtro.
  const hayFiltrosActivos = Boolean(busqueda || filtroEstado !== 'TODAS' || filtroMas || filtroPlan || filtroEtiqueta || segmentoAplicado);
  function limpiarFiltros() {
    setBusqueda(''); setFiltroEstado('TODAS'); setFiltroMas(''); setFiltroPlan(''); setFiltroEtiqueta(''); setSegmentoAplicado(null);
  }
  // Los que viven detrás del botón «Filtros» del móvil (el estado y la búsqueda se ven siempre).
  const nFiltrosPuestos = [filtroPlan, filtroEtiqueta, filtroMas, segmentoAplicado].filter(Boolean).length;
  const [filtrosAbiertos, setFiltrosAbiertos] = useState(false);

  // Una acción en bloque solo puede caer sobre clientas que se están viendo.
  // Antes la selección sobrevivía a un segmento o a un filtro: se marcaban 20,
  // se aplicaba un segmento que enseñaba 3, y «Cambiar plan» les anotaba el
  // cobro a las 20 — 17 de ellas fuera de la vista.
  const selected = useMemo(() => {
    const visibles = new Set(lista.map((s) => s.id));
    return new Set([...seleccionMarcada].filter((id) => visibles.has(id)));
  }, [seleccionMarcada, lista]);

  // ── Sort toggle ────────────────────────────────────────────────────────────
  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortKey(key); setSortDir('asc'); }
  }

  // Al cambiar filtros/búsqueda/orden: volver a la primera página y vaciar la
  // selección (no tendría sentido conservar marcadas clientas que ya no salen).
  //
  // Se ajusta DURANTE EL RENDER en vez de en dos `useEffect`, que es lo que
  // documenta React para "resetear estado cuando cambia una prop". Con efecto,
  // al teclear en el buscador se pintaba un frame con la lista nueva pero
  // todavía la paginación y la selección viejas, y el reset entraba en un
  // segundo render. Así React descarta el render en curso y rehace antes de
  // tocar el DOM: ese frame intermedio no llega a existir.
  const filtroActual = `${busqueda}\x00${filtroEstado}\x00${filtroMas}\x00${filtroPlan}\x00${filtroEtiqueta}\x00${segmentoAplicado?.id ?? ''}\x00${sortKey}\x00${sortDir}`;
  const [filtroPrevio, setFiltroPrevio] = useState(filtroActual);
  if (filtroActual !== filtroPrevio) {
    setFiltroPrevio(filtroActual);
    setVisibles(PAGE);
    setSelected(new Set());
  }
  const listaVisible = useMemo(() => lista.slice(0, visibles), [lista, visibles]);

  // ── Bulk helpers ───────────────────────────────────────────────────────────
  // "Seleccionar todo" opera sobre TODA la lista filtrada (no solo la página
  // montada): la selección es un Set de ids independiente del render, y las
  // acciones masivas (email, asignar plan) deben cubrir todo lo filtrado, no
  // saltarse en silencio lo que aún no se ha paginado.
  const allFiltradosIds = useMemo(() => lista.map((s) => s.id), [lista]);
  const allSelected = allFiltradosIds.length > 0 && allFiltradosIds.every((id) => selected.has(id));

  function toggleSelectAll() {
    setSelected(allSelected ? new Set() : new Set(allFiltradosIds));
  }

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  // «Enviar email» mandaba, sin preguntar y sin mirar si salía, el correo de
  // BIENVENIDA con el enlace de acceso a la app: el nombre no decía lo que hacía.
  // Ahora se llama por lo que es, se confirma con el recuento (quién no tiene
  // email no lo recibe) y se cuenta lo que el servidor ha aceptado de verdad.
  async function handleEnviarAcceso() {
    if (enviandoAcceso) return;
    setEnviandoAcceso(true);
    const destinatarias = socios.filter((s) => selected.has(s.id) && s.email);
    let enviados = 0;
    // A quién NO le ha salido, con nombre: «1 no ha salido» no dice a quién reintentar.
    const sinSalir: string[] = [];
    for (const s of destinatarias) {
      const nombre = `${s.nombre} ${s.apellidos}`.trim();
      if (await enviarEmailBienvenida({ to: s.email, toName: nombre, socioId: s.id })) enviados++;
      else sinSalir.push(nombre);
    }
    setEnviandoAcceso(false);
    const quienes = sinSalir.length <= 3
      ? sinSalir.join(', ').replace(/, ([^,]*)$/, ' y $1')
      : `${sinSalir.slice(0, 3).join(', ')} y ${sinSalir.length - 3} más`;
    setResultadoAcceso(sinSalir.length === 0
      ? `Enviado a ${enviados} clienta${enviados === 1 ? '' : 's'}.`
      : `Enviado a ${enviados}. No ${sinSalir.length === 1 ? 'ha salido el' : 'han salido los'} de ${quienes}: vuelve a intentarlo.`);
  }

  function cerrarAcceso() {
    if (enviandoAcceso) return;
    if (resultadoAcceso) setSelected(new Set());
    setShowAcceso(false);
    setResultadoAcceso(null);
  }

  // Asignar en bloque es la venta más cara de la pantalla: son N cobros a la vez.
  // Antes era un `forEach` que disparaba N escrituras sin esperar a ninguna, y el
  // diálogo se cerraba igual — con permisos insuficientes (una instructora) se
  // cerraba tras no haber asignado ni un solo plan. Ahora se van de una en una,
  // se cuenta lo que ha salido bien y el diálogo solo se cierra si TODO ha salido
  // bien; si no, se queda abierto diciendo a quién ha fallado y por qué.
  async function handleAsignarPlan() {
    if (!asignarPlanId || asignando) return;
    setAsignando(true);
    setErrorAsignar(null);

    const fallidas: string[] = [];
    let ultimoError = '';
    const conseguidas = new Set<string>();
    for (const id of selected) {
      try {
        await assignPlan(id, asignarPlanId);
        conseguidas.add(id);
      } catch (e) {
        const socio = socios.find((s) => s.id === id);
        fallidas.push(socio ? `${socio.nombre} ${socio.apellidos}`.trim() : id);
        ultimoError = e instanceof Error ? e.message : ERROR_GENERICO;
      }
    }
    setAsignando(false);

    if (fallidas.length > 0) {
      // Las que sí han salido dejan de estar seleccionadas: reintentar no debe
      // volver a cobrárselas.
      setSelected(new Set([...selected].filter((id) => !conseguidas.has(id))));
      setErrorAsignar(
        `No se ha podido asignar el plan a ${fallidas.length === 1 ? fallidas[0] : `${fallidas.length} clientas (${fallidas.join(', ')})`}. ${ultimoError}`,
      );
      return;
    }

    setSelected(new Set());
    setShowAsignarPlan(false);
    setAsignarPlanId('');
  }

  async function handleAmpliarCaducidades() {
    if (ampliando) return;
    setAmpliando(true);
    setErrorAmpliar(null);
    const res = await ampliarCaducidades([...selected], diasAmpliar);
    setAmpliando(false);
    if (!res.ok) { setErrorAmpliar(res.error); return; }
    // El resultado se enseña en el propio diálogo en vez de cerrarlo: "hecho"
    // a secas no distingue haber ampliado 40 bonos de no haber tocado nada
    // porque a nadie le quedaba un bono vivo.
    setResultadoAmpliar({ bonos: res.bonos, recuperaciones: res.recuperaciones });
  }

  // La selección se suelta al cerrar, no al ampliar: si se limpiara antes, el
  // título del propio diálogo ("— N clientas") se quedaría en cero mientras
  // se está leyendo el resultado.
  function cerrarAmpliar() {
    if (resultadoAmpliar) setSelected(new Set());
    setShowAmpliar(false);
    setErrorAmpliar(null);
    setResultadoAmpliar(null);
    setDiasAmpliar(7);
  }

  async function handleRegistrarConsentimientoMkt() {
    if (guardandoConsentMkt || !afirmadoConsentMkt) return;
    setGuardandoConsentMkt(true);
    setErrorConsentMkt(null);
    const res = await registrarConsentimientoMarketing([...selected]);
    setGuardandoConsentMkt(false);
    if (!res.ok) { setErrorConsentMkt(res.error); return; }
    // Los tres recuentos, no un "hecho": el caso que más confunde es registrar
    // 30 y que la 31 no se toque porque ya lo tenía, y sin decirlo parece que
    // algo ha fallado. `ya_vigentes` no es un fallo — es una fecha que NO se
    // ha falseado.
    const partes = [`${res.registradas} consentimiento${res.registradas === 1 ? '' : 's'} registrado${res.registradas === 1 ? '' : 's'}`];
    if (res.yaVigentes) partes.push(`${res.yaVigentes} ya lo tenía${res.yaVigentes === 1 ? '' : 'n'} (sin tocar la fecha)`);
    if (res.noEncontradas) partes.push(`${res.noEncontradas} no encontrada${res.noEncontradas === 1 ? '' : 's'}`);
    setResultadoConsentMkt(partes.join(' · '));
  }

  // Igual que en ampliar: la selección se suelta al CERRAR, no al registrar, para
  // que el título del diálogo no se quede en cero mientras se lee el resultado.
  function cerrarConsentMkt() {
    if (resultadoConsentMkt) setSelected(new Set());
    setShowConsentMkt(false);
    setAfirmadoConsentMkt(false);
    setResultadoConsentMkt(null);
    setErrorConsentMkt(null);
  }

  // ── Create / edit ──────────────────────────────────────────────────────────
  function resetModal() {
    setShowForm(null);
    setEditandoId(null);
    setForm(emptyForm());
    setConsultaEnAlta(null);
    setFirma('');
    setAceptado(false);
    setErrorGuardar(null);
  }

  // Mismo criterio que la ficha: la plaza fija va con la cuota, así que se
  // pregunta al darla. Con bono, o si ya tiene plaza fija, no se pregunta.
  function ofrecerPlazaFijaSiCuota(socioId: string, planId: string, nombre: string) {
    const plan = planesTarifa.find(p => p.id === planId);
    const yaTiene = plazasFijas.some(p => p.socioId === socioId && p.estado !== 'BAJA');
    if (plan?.tipo === 'MENSUAL' && !yaTiene) {
      setUltimaOferta({ nombre, plan: plan.nombre });
      setOfrecerPlazaFija({ socioId, nombre, plan: plan.nombre });
    }
  }

  async function handleCrear() {
    if (guardando || altaEnCursoRef.current) return;
    altaEnCursoRef.current = true;
    try {
      await crearAlta();
    } finally {
      altaEnCursoRef.current = false;
    }
  }

  async function crearAlta() {
    setGuardando(true);
    setErrorGuardar(null);
    const versionTexto = textoLegalCompleto(studioConfig);
    const permitidos = cambiosSociaPermitidos({
      nombre: form.nombre.trim(),
      apellidos: form.apellidos.trim(),
      email: form.email.trim(),
      telefono: form.telefono || null,
      genero: form.genero || null,
      nif: form.nif || null,
      activo: true,
      camposExtra: form.camposExtra,
      planId: form.planId || undefined,
      // `as const`: el objeto ya no va directo a `addSocio`, y sin contexto de
      // tipo `pagado` se ensancha a `boolean` y deja de encajar en `CobroAlta`.
      cobroAlta: form.cobroPagado ? { pagado: true as const, metodo: form.cobroMetodo } : { pagado: false as const },
      // Sin firma no se guarda ninguna aceptación: la socia queda pendiente y
      // el portal se la pedirá a ella (reservar/[slug] ya lo hace cuando no hay
      // `aceptacionContrato`). Con firma, se marca que la recogió el estudio.
      aceptacionContrato: firma.trim()
        ? {
            fecha: new Date().toISOString(),
            firma: firma.trim(),
            versionTexto,
            origen: 'MOSTRADOR' as const,
            // Quién la recogió lo rellena el contexto, que sí sabe quién opera.
          }
        : undefined,
    }, { puedeVerPrivados: veDatosPrivados });
    // `addSocio` tipa `nif` como obligatorio (`string | null`) y el filtro lo
    // quita a quien no puede verlo. En un alta, ausente y `null` terminan igual
    // —la columna queda NULL, que el trigger de cierre admite en un INSERT—, así
    // que se repone a `null` para cumplir el contrato del tipo.
    const res = await addSocio({ ...permitidos, nif: permitidos.nif ?? null });
    // Si la BD la rechaza, el diálogo se queda abierto con los datos puestos:
    // antes se cerraba igual y la clienta aparecía en la lista sin existir.
    if (!res.ok) { setGuardando(false); setErrorGuardar(res.error); return; }

    // La firma recogida en mostrador se vuelve a sellar EN SERVIDOR: fecha,
    // texto vigente, quién la introdujo, huella de IP y user-agent (plan RGPD
    // 3.17). La clienta ya existe, así que un fallo aquí no deshace el alta,
    // pero se dice en la lista en vez de dar la firma por registrada.
    //
    // Todo lo que no salió del todo bien con el alta ya hecha (la matrícula, el cobro, la
    // factura, la firma, la consulta) se junta y se dice UNA vez, en la lista: antes cada aviso
    // pisaba al anterior y los del contexto eran un toast de 6 s fácil de perder.
    const avisos: string[] = [...(res.avisos ?? [])];
    if (firma.trim() && res.id) {
      const sello = await sellarAceptacionMostrador(res.id, firma.trim(), versionTexto);
      if (!sello.ok) avisos.push(`La firma no ha quedado registrada: ${sello.error}`);
    }
    setGuardando(false);

    // Alta abierta desde una consulta de la web: la consulta queda atendida (si
    // la ficha lleva su mismo email, ya la ha cerrado la base de datos al crearla).
    // La ficha ya existe, así que si esto falla se dice, pero no se deshace nada.
    if (consultaEnAlta && user?.id) {
      const cierre = await marcarAtendida(consultaEnAlta, user.id);
      // «No se ha podido cerrar», no «sigue como nueva»: si otra persona la
      // descartó entretanto, ya no está como nueva.
      if (!cierre.ok) avisos.push(`No se ha podido cerrar su consulta: ${cierre.error}`);
      setRecargaConsultas(n => n + 1);
    }
    if (avisos.length > 0) setErrorFila(`La clienta se ha creado, pero hay algo que revisar. ${avisos.join(' ')}`);

    // La bienvenida la manda addSocio (lib/studio-context.tsx) — así cubre
    // también las altas que no pasan por esta pantalla (import CSV, alta
    // pública). Mandarla aquí también duplicaba el email.
    if (res.id && form.planId) ofrecerPlazaFijaSiCuota(res.id, form.planId, form.nombre.trim());
    resetModal();
  }

  async function handleEditar() {
    if (!editandoId || guardando) return;
    setGuardando(true);
    setErrorGuardar(null);
    // Sin permiso el NIF no se manda (oculto, valdría '' y lo borraría); con
    // permiso, solo si cambió respecto a la ficha cargada.
    const res = await updateSocio(editandoId, cambiosSociaPermitidos({
      nombre: form.nombre.trim(),
      apellidos: form.apellidos.trim(),
      email: form.email.trim(),
      telefono: form.telefono || null,
      genero: form.genero || null,
      nif: form.nif || null,
      camposExtra: form.camposExtra,
    }, { puedeVerPrivados: veDatosPrivados, original: socios.find(s => s.id === editandoId) }));
    setGuardando(false);
    if (!res.ok) { setErrorGuardar(res.error); return; }
    // Sólo si el plan ha cambiado de verdad. `assignPlan` cancela la suscripción
    // vigente y crea otra nueva (perdiendo las sesiones que le quedaban del bono)
    // y además emite el recibo de la venta: llamarlo al editar el teléfono le
    // reseteaba el bono a la clienta y ahora, encima, le cobraría otra vez.
    const susActual = suscripciones.find(s => s.socioId === editandoId && s.estado === 'ACTIVA');
    if (form.planId && form.planId !== (susActual?.planId ?? '')) {
      // Los datos ya están guardados; lo que puede fallar aquí es la venta. Si
      // falla, el diálogo se queda abierto contándolo en vez de cerrarse como si
      // el plan hubiera cambiado.
      setGuardando(true);
      try {
        await assignPlan(editandoId, form.planId);
      } catch (e) {
        setGuardando(false);
        setErrorGuardar(`Los datos se han guardado, pero el plan no se ha podido cambiar. ${e instanceof Error ? e.message : ERROR_GENERICO}`);
        return;
      }
      setGuardando(false);
      ofrecerPlazaFijaSiCuota(editandoId, form.planId, form.nombre.trim());
    }
    resetModal();
  }

  function openEdit(s: Socio, e: MouseEvent) {
    e.stopPropagation();
    const sus = suscripciones.find((x) => x.socioId === s.id && x.estado === 'ACTIVA');
    setForm({
      nombre: s.nombre,
      apellidos: s.apellidos,
      email: s.email,
      telefono: s.telefono ?? '',
      nif: s.nif ?? '',
      planId: sus?.planId ?? '',
      genero: generoDe(s.genero) ?? '',
      // Solo se usa en el alta; al editar no se crea ningún recibo.
      cobroPagado: false,
      cobroMetodo: 'EFECTIVO',
      camposExtra: s.camposExtra ?? {},
    });
    setFirma('');
    setAceptado(false);
    setEditandoId(s.id);
    setShowForm('editar');
  }

  // Etiquetas realmente en uso, no el catálogo completo de TAGS_OPTIONS de la
  // ficha: un estudio que nunca haya puesto "Embarazo" no necesita verlo en
  // este desplegable.
  const etiquetasDisponibles = useMemo(
    () => Array.from(new Set(socios.flatMap((s) => s.tags ?? []))).sort((a, b) => a.localeCompare(b, 'es')),
    [socios],
  );

  // ── Selección en el móvil, búsqueda con «/», consultas, etiqueta en bloque ──
  const [seleccionando, setSeleccionando] = useState(false);
  const buscadorRef = useRef<HTMLInputElement>(null);
  const [showEtiqueta, setShowEtiqueta] = useState(false);
  const [etiquetaBloque, setEtiquetaBloque] = useState('');
  const [aplicandoEtiqueta, setAplicandoEtiqueta] = useState(false);
  const [resultadoEtiqueta, setResultadoEtiqueta] = useState<string | null>(null);

  // Consultas de su web sin atender: van en «Interesadas y pruebas» y cuentan en
  // su pestaña. `null` = todavía no han llegado (no es «ninguna»).
  const studioIdConsultas = studio?.id ?? null;
  // 'error' = no se pudieron leer: se dice, no se pinta «nadie preguntó».
  const [consultasCargadas, setConsultasCargadas] = useState<ConsultaContacto[] | 'error' | null>(null);
  useEffect(() => {
    if (!studioIdConsultas || !gestionaClientas) return;
    let vivo = true;
    void listarConsultas(studioIdConsultas, 'nueva').then((r) => { if (vivo) setConsultasCargadas(r ?? 'error'); });
    return () => { vivo = false; };
  }, [studioIdConsultas, gestionaClientas, recargaConsultas]);
  const consultasNuevas = gestionaClientas && Array.isArray(consultasCargadas) ? consultasCargadas : [];
  const consultasNuevasCargando = gestionaClientas && consultasCargadas === null;
  const consultasConError = gestionaClientas && consultasCargadas === 'error';

  // Los filtros, la vista y la clienta abierta viven también en la URL: al volver
  // de una ficha (o recargar) la lista sigue donde estaba, y un enlace de Resumen
  // puede llegar ya filtrado (`/clientas?estado=SIN_RENOVAR`).
  const [urlLeida, setUrlLeida] = useState(false);
  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    const est = p.get('estado');
    /* eslint-disable react-hooks/set-state-in-effect -- Guarda de hidratación: la URL solo existe en el navegador; leerla en el render daría otra cosa en servidor y cliente. */
    if (est && (ESTADOS_CLIENTA as readonly string[]).includes(est)) setFiltroEstado(est as EstadoClienta);
    if (p.get('vista') === 'interesadas') setVista('interesadas');
    if (p.get('q')) setBusqueda(p.get('q') ?? '');
    if (p.get('plan')) setFiltroPlan(p.get('plan') ?? '');
    if (p.get('etiqueta')) setFiltroEtiqueta(p.get('etiqueta') ?? '');
    const mas = p.get('mas');
    if (mas && FILTROS_MAS.some((f) => f.id === mas)) setFiltroMas(mas as FiltroMas);
    if (p.get('seguimientos') === 'hoy') setFiltroMas('seguimiento_hoy');
    const orden = p.get('orden');
    if (orden === 'ultima_visita' || orden === 'sesiones_restantes' || orden === 'fecha_registro') setSortKey(orden);
    if (p.get('dir') === 'desc') setSortDir('desc');
    if (p.get('c')) setAbierta(p.get('c'));
    setUrlLeida(true);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, []);
  useEffect(() => {
    if (!urlLeida) return;
    const p = new URLSearchParams();
    if (vista !== 'clientas') p.set('vista', vista);
    if (filtroEstado !== 'TODAS') p.set('estado', filtroEstado);
    if (busqueda) p.set('q', busqueda);
    if (filtroPlan) p.set('plan', filtroPlan);
    if (filtroEtiqueta) p.set('etiqueta', filtroEtiqueta);
    if (filtroMas) p.set('mas', filtroMas);
    if (sortKey !== 'nombre') p.set('orden', sortKey);
    if (sortDir !== 'asc') p.set('dir', sortDir);
    if (abierta) p.set('c', abierta);
    const qs = p.toString();
    const url = `/clientas${qs ? `?${qs}` : ''}`;
    if (url !== window.location.pathname + window.location.search) window.history.replaceState(window.history.state, '', url);
  }, [urlLeida, vista, filtroEstado, busqueda, filtroPlan, filtroEtiqueta, filtroMas, sortKey, sortDir, abierta]);

  // Teclado: «/» busca; con una clienta abierta al lado, ↑ ↓ pasan a la de
  // arriba o abajo y Esc la cierra. Nunca mientras se escribe ni con una
  // ventana abierta encima.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const t = e.target as HTMLElement | null;
      const escribiendo = !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable);
      if (e.key === '/' && !escribiendo && !e.metaKey && !e.ctrlKey && !e.altKey) {
        e.preventDefault();
        buscadorRef.current?.focus();
        return;
      }
      if (escribiendo || document.querySelector('[role="dialog"]')) return;
      if (e.key === 'Escape' && abierta) { setAbierta(null); return; }
      if ((e.key === 'ArrowDown' || e.key === 'ArrowUp') && ancho && abierta) {
        const idx = listaVisible.findIndex((x) => x.id === abierta);
        const siguiente = listaVisible[idx + (e.key === 'ArrowDown' ? 1 : -1)];
        if (!siguiente) return;
        e.preventDefault();
        setAbierta(siguiente.id);
        document.querySelector(`[data-fila-clienta="${siguiente.id}"]`)?.scrollIntoView({ block: 'nearest' });
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [abierta, ancho, listaVisible]);

  // Una etiqueta a varias a la vez, de una en una y contando lo que ha salido.
  async function handleEtiquetaBloque() {
    const tag = etiquetaBloque.trim();
    if (!tag || aplicandoEtiqueta) return;
    setAplicandoEtiqueta(true);
    let puestas = 0;
    let yaLaTenian = 0;
    const fallos: string[] = [];
    for (const id of selected) {
      const s = socios.find((x) => x.id === id);
      if (!s) continue;
      if ((s.tags ?? []).includes(tag)) { yaLaTenian++; continue; }
      const r = await addTagSocio(id, tag);
      if (r.ok) puestas++;
      else fallos.push(`${s.nombre} ${s.apellidos}`.trim());
    }
    setAplicandoEtiqueta(false);
    setResultadoEtiqueta([
      `«${tag}» puesta a ${puestas} clienta${puestas === 1 ? '' : 's'}`,
      yaLaTenian ? `${yaLaTenian} ya la tenía${yaLaTenian === 1 ? '' : 'n'}` : null,
      fallos.length ? `no se ha podido con ${fallos.join(', ')}` : null,
    ].filter(Boolean).join(' · '));
  }

  function cerrarEtiqueta() {
    if (aplicandoEtiqueta) return;
    if (resultadoEtiqueta) setSelected(new Set());
    setShowEtiqueta(false);
    setResultadoEtiqueta(null);
    setEtiquetaBloque('');
  }

  // CSV de las seleccionadas, para abrirlo en una hoja de cálculo (separado por
  // «;» y con BOM: Excel en español lo abre bien a la primera).
  // Lo que toca planes o consentimientos va en «Más» de la barra de selección.
  // Cambiar plan y ampliar caducidad mueven producto vendido (`mueveDinero`);
  // anotar un consentimiento, no — mismo permiso que la tarjeta «Marketing» de
  // la ficha (puedeGestionarClientas).
  const accionesBloqueMas: AccionMenu[] = [
    ...(mueveDinero ? [
      { texto: 'Cambiar plan', icono: CreditCard, onClick: () => { setAsignarPlanId(''); setShowAsignarPlan(true); } },
      { texto: 'Ampliar caducidad', icono: CalendarPlus, onClick: () => { setResultadoAmpliar(null); setErrorAmpliar(null); setShowAmpliar(true); } },
    ] : []),
    ...(gestionaClientas ? [
      { texto: 'Anotar consentimiento de marketing', icono: ShieldCheck, onClick: () => { setResultadoConsentMkt(null); setErrorConsentMkt(null); setAfirmadoConsentMkt(false); setShowConsentMkt(true); } },
    ] : []),
  ];

  function exportarSeleccionadas() {
    const filas = socios.filter((s) => selected.has(s.id));
    const cabecera = ['Nombre', 'Apellidos', 'Email', 'Teléfono', 'Estado', 'Plan', 'Última clase'];
    const celda = (v: string) => (/[";\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
    const lineas = [cabecera, ...filas.map((s) => {
      const e = estados.porSocio.get(s.id);
      const ultima = getLastVisit(s.id);
      return [s.nombre, s.apellidos ?? '', s.email ?? '', s.telefono ?? '', e ? ETIQUETA_ESTADO[e.estado] : '', planYSaldo(s.id).plan ?? '', ultima ? hoyEnEstudio(new Date(ultima)) : ''];
    })];
    const csv = '\uFEFF' + lineas.map((l) => l.map(celda).join(';')).join('\r\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `clientas-${hoyISO ?? 'lista'}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  // ── Render ────────────────────────────────────────────────────────────────
  const SORT_OPTIONS: { key: SortKey; label: string }[] = [
    { key: 'nombre', label: 'Nombre' },
    { key: 'ultima_visita', label: 'Última clase' },
    { key: 'sesiones_restantes', label: 'Sesiones que le quedan' },
    { key: 'fecha_registro', label: 'Fecha de alta' },
  ];
  const conteos = estados.conteos;
  // En el filtro «Plan» salen los que están a la venta y los que alguna tiene
  // vivos aunque ya no se vendan: si no, no habría forma de encontrarlas.
  const planesFiltrables = planesTarifa.filter(
    (p) => p.activo || [...planesVivosPorSocio.values()].some((set) => set.has(p.id)),
  );
  const panelAbierto = ancho && vista === 'clientas' && abierta !== null && socios.some((s) => s.id === abierta);
  const nInteresadas = (conteos?.DE_PRUEBA ?? 0) + (conteos?.INTERESADA ?? 0) + consultasNuevas.length;
  const hoyTxt = hoyISO ?? '';

  function abrirClienta(id: string, e?: MouseEvent) {
    if (seleccionando) { e?.preventDefault(); toggleSelect(id); return; }
    // ⌘/Ctrl/Mayús-clic: lo hace el propio enlace (pestaña o ventana nueva).
    if (e && (e.metaKey || e.ctrlKey || e.shiftKey)) return;
    e?.preventDefault();
    if (ancho) { setAbierta(id); return; }
    router.push(`/clientas/${id}`);
  }

  // «Quedan 6 · Caduca en 29 días», «Renueva en 21 días», «Pausada».
  function planYSaldo(socioId: string): { plan: string | null; detalle: string | null; color: string } {
    const sus = getActiveSus(socioId);
    const plan = getPlan(sus?.planId);
    if (!sus || !plan) {
      // Sin plan ahora: cuál tuvo, para ofrecerle lo mismo sin abrir su ficha.
      const ultimo = ultimoPlanPorSocio.get(socioId);
      const nombre = ultimo ? getPlan(ultimo.planId)?.nombre : null;
      const fin = ultimo?.fechaFin?.slice(0, 10) ?? null;
      return {
        plan: null,
        detalle: nombre ? `Tuvo ${nombre}${fin && hoyISO && fin <= hoyISO ? ` hasta el ${fechaCorta(fin, hoyISO)}` : ''}` : null,
        color: 'var(--muted-foreground)',
      };
    }
    const otros = (planesVivosPorSocio.get(socioId)?.size ?? 1) - 1;
    const saldo = saldoBonosPorSocio.get(socioId);
    const detalle = sus.estado === 'PAUSADA'
      ? 'Pausada'
      : [saldo != null ? `Quedan ${saldo}` : null, textoCaducidadFila(sus, plan)].filter(Boolean).join(' · ');
    return {
      plan: plan.nombre + (otros > 0 ? ` +${otros}` : ''),
      detalle: detalle || null,
      color: sus.estado === 'PAUSADA' ? 'var(--muted-foreground)' : colorCaducidadFila(sus, plan),
    };
  }

  function ultimaTexto(socioId: string): string {
    const ultima = getLastVisit(socioId);
    return ultima && hoyISO ? haceCuanto(hoyEnEstudio(new Date(ultima)), hoyISO) : 'Nunca';
  }

  function proximaTexto(socioId: string): string | null {
    const iso = proximaPorSocio.get(socioId);
    return iso && hoyISO ? cuandoClase(iso, hoyISO) : null;
  }

  const fila = (s: Socio, i: number) => {
    const estado = estados.porSocio.get(s.id);
    const aviso = avisoDe(s.id);
    const ps = planYSaldo(s.id);
    return { s, i, estado, aviso, atendido: atendido(s.id), ps, seguimiento: seguimientosHoy?.get(s.id)?.[0] ?? null };
  };

  return (
    <div data-tour="clientas-lista" className="space-y-4 min-h-screen pb-24" style={{ backgroundColor: 'var(--background)' }}>
      {errorFila && (
        <p role="alert" className="flex items-start gap-2 p-2.5 rounded-lg bg-destructive/10 text-[12.5px] text-destructive">
          <AlertTriangle size={14} className="shrink-0 mt-0.5" />
          <span>{errorFila}</span>
        </p>
      )}
      {avisoPlazaFija && (
        <p role="status" className="flex items-start justify-between gap-2 p-2.5 rounded-lg bg-muted text-[12px] text-foreground">
          <span>{avisoPlazaFija}</span>
          <button onClick={() => setAvisoPlazaFija(null)} className="shrink-0 font-semibold text-muted-foreground hover:text-foreground">
            Cerrar
          </button>
        </p>
      )}

      {/* En el móvil, el «+» va en la fila del título (no una fila entera para el botón). */}
      <PageHeader
        className="max-sm:flex-row max-sm:items-start max-sm:justify-between"
        title="Clientas"
        description={conteos
          ? [
              `${conteos.ACTIVA} ${conteos.ACTIVA === 1 ? 'activa' : 'activas'}`,
              conteos.DE_PRUEBA > 0 && `${conteos.DE_PRUEBA} de prueba`,
              conteos.SIN_RENOVAR > 0 && `${conteos.SIN_RENOVAR} sin renovar`,
            ].filter(Boolean).join(' · ')
          : 'Gestiona y haz seguimiento de todas tus clientas'}
        actions={
          gestionaClientas ? (
          <>
            {/* Las respuestas de todas a las preguntas del estudio, juntas. Solo si hay preguntas. */}
            {camposPersonalizados.some(c => c.activo) && (
              <button
                onClick={() => router.push('/clientas/respuestas')}
                className="hidden sm:flex items-center gap-1.5 px-3.5 min-h-10 rounded-xl text-[13px] font-semibold text-foreground bg-card border border-border hover:bg-muted transition-colors"
              >
                <ListChecks size={15} />
                Respuestas
              </button>
            )}
            <button
              onClick={() => router.push('/clientas/importar')}
              className="hidden sm:flex items-center gap-1.5 px-3.5 min-h-10 rounded-xl text-[13px] font-semibold text-foreground bg-card border border-border hover:bg-muted transition-colors"
            >
              <Upload size={15} />
              Importar
            </button>
            <button
              onClick={() => { setForm(emptyForm()); setShowForm('nueva'); }}
              aria-label="Nueva clienta"
              data-tour="clientas-nueva"
              className="flex size-11 items-center justify-center gap-1.5 rounded-full text-[13px] font-semibold text-primary-foreground bg-primary hover:brightness-95 transition-colors shadow-sm sm:size-auto sm:min-h-10 sm:rounded-xl sm:px-3.5"
            >
              <Plus size={18} className="sm:size-[15px]" aria-hidden />
              <span className="hidden sm:inline">Nueva clienta</span>
            </button>
          </>
          ) : null
        }
      />

      {/* Dos vistas: las clientas y quienes todavía están entrando (preguntaron,
          tienen su prueba o vinieron a ella). Con la URL, para volver a la misma. */}
      <div role="tablist" aria-label="Vista" className="flex gap-1 border-b border-border">
        {([['clientas', 'Clientas', conteos?.TOTAL], ['interesadas', 'Interesadas y pruebas', nInteresadas]] as const).map(([id, nombre, n]) => (
          <button
            key={id}
            role="tab"
            aria-selected={vista === id}
            onClick={() => { setVista(id); setAbierta(null); setSelected(new Set()); setSeleccionando(false); }}
            className={cn(
              '-mb-px flex min-h-11 items-center gap-2 border-b-2 px-3 text-[14px] font-medium transition-colors',
              vista === id ? 'border-foreground text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground',
            )}
          >
            {nombre}
            {n != null && (
              <span className={cn('rounded-full px-1.5 text-[11.5px] tabular-nums', vista === id ? 'bg-foreground text-background' : 'bg-muted text-foreground')}>{n}</span>
            )}
          </button>
        ))}
      </div>

      {/* RGPD: solicitudes de las clientas desde su app, por plazo. Se atienden en la ficha. */}
      {gestionaClientas && <SolicitudesDerechosPendientes />}

      {vista === 'interesadas' ? (
        <InteresadasYPruebas
          consultas={consultasNuevas}
          cargandoConsultas={consultasNuevasCargando}
          errorConsultas={consultasConError}
          estados={estados.porSocio}
          hoyISO={hoyISO}
          puedeGestionar={gestionaClientas}
          onAbrirClienta={(id) => router.push(`/clientas/${id}`)}
          onDarDeAlta={(c: ConsultaContacto) => {
            const [nombre = '', ...apellidos] = c.nombre.trim().split(/\s+/);
            setForm({ ...emptyForm(), nombre, apellidos: apellidos.join(' '), email: c.email ?? '', telefono: c.telefono ?? '' });
            setConsultaEnAlta(c.id);
            setShowForm('nueva');
          }}
          onRecargar={() => setRecargaConsultas((n) => n + 1)}
        />
      ) : (
      <>
      {/* ── Estado: un chip por estado con su recuento ──────────────────────── */}
      <div className="space-y-2">
        <div className="-mx-4 flex gap-1.5 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0 sm:pb-0" role="radiogroup" aria-label="Estado">
          {(['TODAS', ...ESTADOS_CLIENTA] as const)
            .filter((e) => e === 'TODAS' || e === filtroEstado || (conteos?.[e] ?? 0) > 0 || e === 'ACTIVA')
            .map((e) => {
              const activo = filtroEstado === e;
              const n = e === 'TODAS' ? conteos?.TOTAL : conteos?.[e];
              return (
                <button
                  key={e}
                  role="radio"
                  aria-checked={activo}
                  data-estado-filtro={e}
                  onClick={() => setFiltroEstado(e)}
                  className={cn(
                    'inline-flex min-h-10 shrink-0 items-center gap-1.5 rounded-full border px-3.5 text-[13px] font-medium transition-colors [@media(pointer:fine)]:min-h-9',
                    activo ? 'border-transparent bg-foreground text-background' : 'border-border bg-card text-foreground hover:border-muted-foreground',
                  )}
                >
                  {e !== 'TODAS' && <PuntoEstado estado={e} />}
                  {e === 'TODAS' ? 'Todas' : ETIQUETA_ESTADO[e]}
                  <span className={cn('tabular-nums', activo ? 'text-background/70' : 'text-muted-foreground')}>{n ?? '—'}</span>
                </button>
              );
            })}
        </div>
        {filtroEstado !== 'TODAS' && (
          <p className="text-[12.5px] text-muted-foreground text-pretty">
            <strong className="font-semibold text-foreground">{ETIQUETA_ESTADO[filtroEstado]}:</strong> {DEFINICION_ESTADO[filtroEstado]}
          </p>
        )}
      </div>

      {/* ── Buscar y filtrar ─────────────────────────────────────────────────── */}
      {/* En el móvil, lo primero es buscar: los filtros van plegados detrás de un
          botón que dice cuántos hay puestos. En pantallas grandes, en la misma
          fila; ordenar ahí es pinchar en la cabecera de la columna. */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-0 flex-1 sm:w-72 sm:flex-none lg:w-80">
          <Search size={16} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <input
            ref={buscadorRef}
            type="search"
            placeholder="Buscar por nombre, email o teléfono"
            aria-label="Buscar clientas"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            className="w-full min-h-11 rounded-xl border border-input bg-card pl-10 pr-10 text-base text-foreground placeholder:text-muted-foreground focus:outline-none focus-visible:ring-3 focus-visible:ring-ring/50 [@media(pointer:fine)]:min-h-10 [@media(pointer:fine)]:text-[13.5px]"
          />
          {busqueda ? (
            <button
              onClick={() => setBusqueda('')}
              aria-label="Borrar búsqueda"
              className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-md p-1 text-muted-foreground hover:text-foreground"
            >
              <X size={15} />
            </button>
          ) : (
            <kbd className="pointer-events-none absolute right-3 top-1/2 hidden -translate-y-1/2 rounded border border-border px-1.5 text-[11px] text-muted-foreground [@media(pointer:fine)]:inline">/</kbd>
          )}
        </div>

        <button
          type="button"
          onClick={() => setFiltrosAbiertos((v) => !v)}
          aria-expanded={filtrosAbiertos}
          className={cn(
            'inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-xl border px-3.5 text-[13.5px] font-medium sm:hidden',
            nFiltrosPuestos > 0 ? 'border-foreground bg-card text-foreground' : 'border-border bg-card text-foreground',
          )}
        >
          <SlidersHorizontal size={16} aria-hidden />
          Filtros
          {nFiltrosPuestos > 0 && (
            <span className="rounded-full bg-foreground px-1.5 text-[11.5px] tabular-nums text-background">{nFiltrosPuestos}</span>
          )}
        </button>

        <div className={cn('basis-full flex-wrap items-center gap-2 sm:flex sm:basis-auto', filtrosAbiertos ? 'flex' : 'hidden')}>
          <SelectFiltro
            etiqueta="Plan"
            valor={filtroPlan}
            onCambiar={setFiltroPlan}
            opciones={planesFiltrables.map((p) => ({ valor: p.id, texto: p.nombre }))}
            todos="Todos los planes"
          />
          {etiquetasDisponibles.length > 0 && (
            <SelectFiltro
              etiqueta="Etiqueta"
              valor={filtroEtiqueta}
              onCambiar={setFiltroEtiqueta}
              opciones={etiquetasDisponibles.map((t) => ({ valor: t, texto: t }))}
              todos="Todas las etiquetas"
            />
          )}
          <SelectFiltro
            etiqueta="Más filtros"
            valor={filtroMas}
            onCambiar={(v) => setFiltroMas(v as FiltroMas)}
            opciones={FILTROS_MAS.map((f) => ({ valor: f.id, texto: f.label }))}
            todos="Sin más filtros"
          />
          {/* Ordenar: en la tabla se hace desde la cabecera de cada columna. */}
          <div className="flex shrink-0 items-center gap-1 md:hidden">
            <SelectFiltro
              etiqueta="Orden"
              valor={sortKey}
              onCambiar={(v) => setSortKey(v as SortKey)}
              opciones={SORT_OPTIONS.map((o) => ({ valor: o.key, texto: o.label }))}
            />
            <button
              onClick={() => setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))}
              className="flex size-10 items-center justify-center rounded-xl border border-border bg-card text-muted-foreground hover:bg-muted [@media(pointer:fine)]:size-9"
              aria-label={sortDir === 'asc' ? 'Orden ascendente: cambiar a descendente' : 'Orden descendente: cambiar a ascendente'}
            >
              {sortDir === 'asc' ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
            </button>
          </div>

          {/* Seguridad (auditoría PR #1276): crear/editar/borrar un segmento es
              escritura sobre una audiencia compartida del estudio, mismo
              criterio de rol que el resto de esta pantalla — gestionaClientas,
              no solo "puede ver /clientas" (INSTRUCTOR llega aquí pero no
              gestiona). La RLS de segmentos_clientes también exige rol
              explícito (migr 20260820130000), este gate es defensa en
              profundidad, no la cerradura real. */}
          {gestionaClientas && (
            <ConstructorSegmentos
              segmentos={segmentosClientes}
              camposPersonalizados={camposPersonalizados}
              onCrear={addSegmentoCliente}
              onActualizar={(id, changes) => updateSegmentoCliente(id, changes)}
              onEliminar={deleteSegmentoCliente}
              onAplicar={(seg) => { setSegmentoAplicado(seg); setSelected(new Set()); }}
            />
          )}
          {segmentoAplicado && (
            <button
              type="button"
              onClick={() => { setSegmentoAplicado(null); setSelected(new Set()); }}
              className="inline-flex min-h-10 shrink-0 items-center gap-1 rounded-xl border border-transparent bg-foreground px-3 text-[12.5px] font-medium text-background [@media(pointer:fine)]:min-h-9"
            >
              {segmentoAplicado.nombre} <X size={13} aria-label="Quitar vista" />
            </button>
          )}
          {hayFiltrosActivos && (
            <button
              type="button"
              onClick={limpiarFiltros}
              className="min-h-10 shrink-0 rounded-xl px-2.5 text-[13px] font-medium text-muted-foreground hover:text-foreground [@media(pointer:fine)]:min-h-9"
            >
              Quitar filtros
            </button>
          )}
        </div>
      </div>

      {/* Cuántas salen y, en el móvil, el modo de elegir varias. */}
      {lista.length > 0 && (
        <div className="-mt-1 flex items-center justify-between gap-2 md:hidden">
          <p className="text-[12.5px] text-muted-foreground" aria-live="polite">
            {lista.length === 1 ? '1 clienta' : `${lista.length} clientas`}
          </p>
          {gestionaClientas && (
            <button
              onClick={() => { setSeleccionando((v) => !v); if (seleccionando) setSelected(new Set()); }}
              className="min-h-10 rounded-lg px-2 text-[13.5px] font-semibold text-foreground"
            >
              {seleccionando ? 'Listo' : 'Seleccionar'}
            </button>
          )}
        </div>
      )}

      {/* ── La lista, y al lado la clienta abierta (pantallas anchas) ────────── */}
      <div className={cn(panelAbierto && 'grid grid-cols-[minmax(320px,380px)_minmax(0,1fr)] items-start gap-4')}>
      <div className={cn('overflow-hidden rounded-2xl border border-border bg-card shadow-xs', panelAbierto && 'sticky top-4')}>
        {lista.length === 0 ? (
          // P2 (auditoría de producto): migrado a `EmptyState`, la primitiva
          // extraída en la auditoría del 20-ago (~90 estados vacíos con 6
          // implementaciones distintas).
          <EmptyState
            icono={Users}
            titulo={hayFiltrosActivos ? 'Nadie cumple estos filtros' : 'Aún no hay clientas'}
            descripcion={hayFiltrosActivos
              ? 'Prueba con otros filtros, o quítalos para ver a todas.'
              : 'Añade tu primera clienta o tráelas de tu programa anterior.'}
            cta={hayFiltrosActivos
              ? { label: 'Quitar filtros', onClick: limpiarFiltros }
              : { label: 'Añadir primera clienta', icono: Plus, onClick: () => { setForm(emptyForm()); setShowForm('nueva'); } }}
          />
        ) : panelAbierto ? (
          // Lista compacta junto a la ficha: nombre, plan y su aviso.
          <ul aria-label="Clientas" className="max-h-[calc(100dvh-14rem)] divide-y divide-border overflow-y-auto">
            {listaVisible.map((s, i) => {
              const f = fila(s, i);
              const activa = abierta === s.id;
              return (
                <li key={s.id}>
                  <Link
                    href={`/clientas/${s.id}`}
                    onClick={(e) => abrirClienta(s.id, e)}
                    aria-current={activa ? 'true' : undefined}
                    data-fila-clienta={s.id}
                    className={cn(
                      'flex gap-3 px-3.5 py-2.5 transition-colors hover:bg-muted focus-visible:outline-none focus-visible:bg-muted',
                      activa && 'bg-accent shadow-[inset_3px_0_0_var(--brand)]',
                    )}
                  >
                    <ProfileAvatar avatarId={s.avatar} nombre={s.nombre} apellidos={s.apellidos} color={avatarColor(`${s.nombre}${s.apellidos}`)} size="sm" />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center justify-between gap-2">
                        <span className="truncate text-[13.5px] font-semibold text-foreground">{s.nombre} {s.apellidos}</span>
                        <span className="shrink-0 text-[11.5px] text-muted-foreground">{ultimaTexto(s.id)}</span>
                      </span>
                      <span className="block truncate text-[12.5px] text-muted-foreground">
                        {f.ps.plan ? `${f.ps.plan}${f.ps.detalle ? ` · ${f.ps.detalle}` : ''}` : `Sin plan${f.ps.detalle ? ` · ${f.ps.detalle.charAt(0).toLowerCase()}${f.ps.detalle.slice(1)}` : ''}`}
                      </span>
                      <span className="mt-1 flex flex-wrap gap-1">
                        {f.aviso ? <PastillaAviso aviso={f.aviso} atendido={f.atendido} ella={trato(s.genero).ella} /> : f.estado && <PastillaEstado estado={f.estado.estado} />}
                        {f.seguimiento && hoyISO && <PastillaSeguimiento titulo={f.seguimiento.titulo} atrasado={(f.seguimiento.venceEl ?? hoyISO) < hoyISO} className="ml-1" />}
                      </span>
                    </span>
                  </Link>
                </li>
              );
            })}
            {visibles < lista.length && (
              <li className="p-2">
                <button onClick={() => setVisibles((v) => v + PAGE)} className="w-full rounded-lg py-2 text-[12.5px] font-semibold text-foreground hover:bg-muted">
                  Ver {Math.min(PAGE, lista.length - visibles)} más
                </button>
              </li>
            )}
          </ul>
        ) : (
          <>
          <table className="hidden w-full md:table">
            <thead>
              <tr className="border-b border-border text-left text-[11.5px] font-semibold uppercase tracking-wide text-muted-foreground">
                {gestionaClientas && (
                  <th className="w-11 py-3 pl-4">
                    <input
                      type="checkbox"
                      checked={allSelected}
                      onChange={toggleSelectAll}
                      aria-label={allSelected ? 'Quitar la selección de todas' : `Seleccionar las ${lista.length} clientas de la lista`}
                      className="size-4 cursor-pointer rounded accent-[var(--foreground)]"
                    />
                  </th>
                )}
                <th className="py-3 pl-4 pr-3">
                  <button onClick={() => toggleSort('nombre')} className="inline-flex items-center uppercase hover:text-foreground">
                    Clienta <SortIcon active={sortKey === 'nombre'} dir={sortDir} />
                  </button>
                </th>
                <th className="py-3 pr-3">Estado</th>
                <th className="py-3 pr-3">
                  <button onClick={() => toggleSort('sesiones_restantes')} className="inline-flex items-center uppercase hover:text-foreground">
                    Plan y saldo <SortIcon active={sortKey === 'sesiones_restantes'} dir={sortDir} />
                  </button>
                </th>
                <th className="hidden py-3 pr-3 lg:table-cell">
                  <button onClick={() => toggleSort('ultima_visita')} className="inline-flex items-center uppercase hover:text-foreground">
                    Última clase <SortIcon active={sortKey === 'ultima_visita'} dir={sortDir} />
                  </button>
                </th>
                <th className="py-3 pr-3">Aviso</th>
                <th className="w-12 py-3 pr-3"><span className="sr-only">Editar</span></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {listaVisible.map((s, i) => {
                const f = fila(s, i);
                const isSelected = selected.has(s.id);
                const proxima = proximaTexto(s.id);
                return (
                  <tr
                    key={s.id}
                    onClick={(e) => abrirClienta(s.id, e)}
                    data-fila-clienta={s.id}
                    className={cn('group cursor-pointer transition-colors hover:bg-muted/60', isSelected && 'bg-accent')}
                  >
                    {gestionaClientas && (
                      <td className="py-3 pl-4" onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleSelect(s.id)}
                          aria-label={`Seleccionar a ${s.nombre} ${s.apellidos}`}
                          className="size-4 cursor-pointer rounded accent-[var(--foreground)]"
                        />
                      </td>
                    )}
                    <td className="py-3 pl-4 pr-3">
                      <div className="flex items-center gap-3">
                        <ProfileAvatar avatarId={s.avatar} nombre={s.nombre} apellidos={s.apellidos} color={avatarColor(`${s.nombre}${s.apellidos}`)} size="sm" />
                        <div className="min-w-0">
                          <p className="flex items-center gap-1.5 text-[14px] font-semibold text-foreground">
                            {semaforoParaMostrar.has(s.id) && (
                              <span className="size-2 shrink-0 rounded-full" title={SEMAFORO_META[semaforoParaMostrar.get(s.id)!].label}
                                style={{ backgroundColor: SEMAFORO_META[semaforoParaMostrar.get(s.id)!].color }} />
                            )}
                            {/* Enlace de verdad: ⌘-clic la abre en otra pestaña. */}
                            <Link href={`/clientas/${s.id}`} onClick={(e) => { e.stopPropagation(); abrirClienta(s.id, e); }} className="truncate hover:underline underline-offset-2">
                              {s.nombre} {s.apellidos}
                            </Link>
                            {idsFijas.has(s.id) && <EtiquetaFija genero={s.genero} />}
                          </p>
                          <p className="truncate text-[12.5px] text-muted-foreground">{s.telefono || s.email || '—'}</p>
                        </div>
                      </div>
                    </td>
                    <td className="py-3 pr-3">
                      {f.estado ? (
                        <>
                          <PastillaEstado estado={f.estado.estado} />
                          {hoyISO && textoDesde(f.estado, hoyTxt, { baja: bajasAbiertas.get(s.id) }) && (
                            <span className="mt-0.5 block text-[12px] text-muted-foreground">{textoDesde(f.estado, hoyTxt, { baja: bajasAbiertas.get(s.id) })}</span>
                          )}
                        </>
                      ) : <span className="text-[12px] text-muted-foreground">—</span>}
                    </td>
                    <td className="py-3 pr-3">
                      {f.ps.plan ? (
                        <>
                          <span className="block text-[13.5px] text-foreground">{f.ps.plan}</span>
                          {f.ps.detalle && <span className="block text-[12.5px]" style={{ color: f.ps.color }}>{f.ps.detalle}</span>}
                        </>
                      ) : (
                        <>
                          <span className="block text-[13px] text-muted-foreground">Sin plan</span>
                          {f.ps.detalle && <span className="block text-[12.5px] text-muted-foreground">{f.ps.detalle}</span>}
                        </>
                      )}
                    </td>
                    <td className="hidden py-3 pr-3 lg:table-cell">
                      <span className="block text-[13px] text-foreground">{ultimaTexto(s.id)}</span>
                      {proxima && <span className="block text-[12.5px] text-muted-foreground">Próxima: {proxima}</span>}
                    </td>
                    <td className="py-3 pr-3">
                      <span className="flex flex-wrap gap-1">
                        {f.aviso && <PastillaAviso aviso={f.aviso} atendido={f.atendido} ella={trato(s.genero).ella} />}
                        {f.seguimiento && hoyISO && <PastillaSeguimiento titulo={f.seguimiento.titulo} atrasado={(f.seguimiento.venceEl ?? hoyISO) < hoyISO} />}
                      </span>
                    </td>
                    <td className="py-3 pr-3" onClick={(e) => e.stopPropagation()}>
                      {gestionaClientas && (
                        <button
                          onClick={(e) => openEdit(s, e)}
                          className="rounded-lg p-2 text-muted-foreground opacity-100 transition hover:bg-muted hover:text-foreground focus-visible:opacity-100 [@media(pointer:fine)]:opacity-0 [@media(pointer:fine)]:group-hover:opacity-100"
                          aria-label={`Editar a ${s.nombre} ${s.apellidos}`}
                        >
                          <Pencil size={15} />
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {/* Móvil: una fila por clienta, con su plan y su estado o su aviso. */}
          <ul aria-label="Clientas" className="divide-y divide-border md:hidden">
            {listaVisible.map((s, i) => {
              const f = fila(s, i);
              const isSelected = selected.has(s.id);
              return (
                <li key={s.id}>
                  <Link
                    href={`/clientas/${s.id}`}
                    onClick={(e) => abrirClienta(s.id, e)}
                    aria-pressed={seleccionando ? isSelected : undefined}
                    className={cn('flex min-h-16 items-center gap-3 px-4 py-3 active:bg-muted', isSelected && 'bg-accent')}
                  >
                    {seleccionando && (
                      <span className={cn('flex size-6 shrink-0 items-center justify-center rounded-full border text-[12px]', isSelected ? 'border-foreground bg-foreground text-background' : 'border-input')} aria-hidden>
                        {isSelected && <CheckCircle2 size={14} />}
                      </span>
                    )}
                    <ProfileAvatar avatarId={s.avatar} nombre={s.nombre} apellidos={s.apellidos} color={avatarColor(`${s.nombre}${s.apellidos}`)} size="sm" />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center justify-between gap-2">
                        <span className="flex min-w-0 items-center gap-1.5">
                          {semaforoParaMostrar.has(s.id) && (
                            <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: SEMAFORO_META[semaforoParaMostrar.get(s.id)!].color }} aria-hidden />
                          )}
                          <span className="truncate text-[15px] font-semibold text-foreground">{s.nombre} {s.apellidos}</span>
                        </span>
                        <span className="shrink-0 text-[12px] text-muted-foreground">{ultimaTexto(s.id)}</span>
                      </span>
                      <span className="block truncate text-[12.5px] text-muted-foreground">
                        {f.ps.plan ? `${f.ps.plan}${f.ps.detalle ? ` · ${f.ps.detalle}` : ''}` : `Sin plan${f.ps.detalle ? ` · ${f.ps.detalle.charAt(0).toLowerCase()}${f.ps.detalle.slice(1)}` : ''}`}
                      </span>
                      <span className="mt-1 flex flex-wrap gap-1">
                        {f.aviso ? <PastillaAviso aviso={f.aviso} atendido={f.atendido} ella={trato(s.genero).ella} /> : f.estado && <PastillaEstado estado={f.estado.estado} />}
                        {f.seguimiento && hoyISO && <PastillaSeguimiento titulo={f.seguimiento.titulo} atrasado={(f.seguimiento.venceEl ?? hoyISO) < hoyISO} className="ml-1" />}
                        {idsFijas.has(s.id) && <EtiquetaFija genero={s.genero} />}
                      </span>
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
          </>
        )}

        {/* Pie: cuántas se ven y «ver más» (P0-34: no montar miles de filas). */}
        {lista.length > 0 && !panelAbierto && (
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-4 py-2.5">
            <p className="text-[12.5px] text-muted-foreground">
              Mostrando {listaVisible.length} de {lista.length}
              {lista.length !== socios.length ? ` (de ${socios.length})` : ''} clientas
            </p>
            {visibles < lista.length && (
              <button
                onClick={() => setVisibles((v) => v + PAGE)}
                className="min-h-9 rounded-lg px-3 text-[13px] font-semibold text-foreground hover:bg-muted"
              >
                Ver {Math.min(PAGE, lista.length - visibles)} más
              </button>
            )}
          </div>
        )}
      </div>

      {panelAbierto && abierta && (
        <section aria-label="Ficha de la clienta" className="min-w-0">
          <div className="mb-2 flex items-center justify-end gap-3 text-[13px] font-medium text-foreground">
            <span className="hidden text-[12px] text-muted-foreground xl:inline">↑ ↓ para moverte · Esc cierra</span>
            <Link href={`/clientas/${abierta}`} className="inline-flex items-center gap-1 rounded-lg px-2 py-1 hover:bg-muted">
              Abrir en página completa <ArrowUpRight size={14} aria-hidden />
            </Link>
            <button onClick={() => setAbierta(null)} aria-label="Cerrar la ficha" className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground">
              <X size={17} />
            </button>
          </div>
          <FichaClienta key={abierta} id={abierta} modo="panel" />
        </section>
      )}
      </div>
      </>
      )}

      {/* ── Barra de lo seleccionado: flota abajo, sin tapar la última fila ─── */}
      {/* Lo de todos los días a la vista (etiqueta, acceso, exportar); lo que
          toca planes o consentimientos, en «Más». */}
      {vista === 'clientas' && selected.size > 0 && (
        // En el móvil, por encima de la barra de navegación de abajo (56 px + zona segura).
        <div className="pointer-events-none fixed inset-x-0 bottom-0 z-40 flex justify-center px-3 pb-[calc(env(safe-area-inset-bottom,0px)+64px)] lg:pb-[calc(env(safe-area-inset-bottom,0px)+12px)] lg:pl-[var(--sidebar-w)]">
          <div role="toolbar" data-barra-seleccion aria-label="Acciones con las seleccionadas" className="pointer-events-auto flex w-full max-w-xl items-center gap-1 rounded-2xl bg-sidebar px-2 py-2 text-sidebar-foreground shadow-xl md:w-auto md:max-w-none md:px-3">
            <strong className="shrink-0 px-2 text-[13px] font-semibold tabular-nums">
              {selected.size}<span className="hidden md:inline"> seleccionada{selected.size !== 1 ? 's' : ''}</span>
            </strong>
            <span className="mx-1 hidden h-5 w-px bg-sidebar-foreground/25 md:block" aria-hidden />
            <div className="flex flex-1 items-center justify-around gap-1 md:flex-none md:justify-start">
              {gestionaClientas && (
                <AccionBloque icono={Tag} onClick={() => { setResultadoEtiqueta(null); setEtiquetaBloque(''); setShowEtiqueta(true); }}>Etiqueta</AccionBloque>
              )}
              {gestionaClientas && (
                <AccionBloque icono={Mail} onClick={() => { setResultadoAcceso(null); setShowAcceso(true); }}><span className="md:hidden">Acceso</span><span className="hidden md:inline">Acceso a la app</span></AccionBloque>
              )}
              {gestionaClientas && (
                <AccionBloque icono={Download} onClick={exportarSeleccionadas}>Exportar</AccionBloque>
              )}
              {accionesBloqueMas.length > 0 && (
                <MenuAcciones
                  arriba
                  etiqueta="Más acciones con las seleccionadas"
                  acciones={accionesBloqueMas}
                  claseBoton="flex min-h-12 flex-col items-center justify-center gap-0.5 rounded-xl px-2.5 text-[11.5px] font-medium text-sidebar-foreground/90 transition-colors hover:bg-sidebar-foreground/10 hover:text-sidebar-foreground md:min-h-9 md:flex-row md:gap-1.5 md:text-[13px]"
                  boton={<><MoreHorizontal size={16} aria-hidden />Más</>}
                />
              )}
            </div>
            <button
              onClick={() => { setSelected(new Set()); setSeleccionando(false); }}
              aria-label="Quitar la selección"
              className="ml-auto shrink-0 rounded-lg p-2 text-sidebar-foreground/80 hover:bg-sidebar-foreground/10 hover:text-sidebar-foreground"
            >
              <X size={16} />
            </button>
          </div>
        </div>
      )}

      {/* ── Modal: Nueva / Editar clienta ─────────────────────────────────────── */}
      <Dialog
        open={showForm !== null}
        onOpenChange={(open) => { if (!open) resetModal(); }}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-base font-semibold text-foreground flex items-center gap-2">
              {showForm === 'nueva' ? 'Nueva clienta' : 'Editar clienta'}
            </DialogTitle>
          </DialogHeader>

          {/* ── Datos de la clienta ───
              Alta en UN paso (evaluación del 13-sep): datos, aceptación y firma
              en la misma pantalla. Antes eran dos («Datos» → «Contrato») y con la
              alumna delante en recepción el segundo se hacía largo. */}
          {(showForm === 'editar' || showForm === 'nueva') && (
            <div className="space-y-3.5 mt-2">
              {/* P2 (auditoría de producto): el panel es `w-full` por debajo de
                  `lg` (components/ui/dashboard-drawer.tsx) — a 375px de ancho
                  esto cramaba dos campos en ~170px cada uno. Mismo patrón
                  `sm:` que ya usa el grid de campos personalizados, dos pasos
                  más abajo en este mismo formulario. */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <FF label="Nombre" required>
                  <input
                    className={inputCls}
                    placeholder="Laura"
                    value={form.nombre}
                    onChange={(e) => setForm((f) => ({ ...f, nombre: e.target.value }))}
                  />
                </FF>
                <FF label="Apellidos" required>
                  <input
                    className={inputCls}
                    placeholder="Martínez García"
                    value={form.apellidos}
                    onChange={(e) => setForm((f) => ({ ...f, apellidos: e.target.value }))}
                  />
                </FF>
              </div>
              <FF label="Género" description="Solo cambia cómo se escribe en el panel: «clienta fija» o «cliente fijo», «alumna» o «alumno». Sin indicar se escribe en femenino.">
                <select
                  className={inputCls}
                  value={form.genero}
                  onChange={(e) => setForm((f) => ({ ...f, genero: generoDe(e.target.value) ?? '' }))}
                >
                  <option value="">Sin indicar</option>
                  {GENEROS.map((g) => (
                    <option key={g} value={g}>{ETIQUETA_GENERO[g]}</option>
                  ))}
                </select>
              </FF>
              {/* Opcional (evaluación del 13-sep): con la alumna delante en
                  recepción no siempre hay correo, y sin él no se podía darla de
                  alta. Sin email no entra al portal ni recibe correos hasta que
                  se le ponga uno en su ficha. */}
              <FF label="Email (opcional)" description="Con esto entra al portal y recibe recordatorios y facturas. Si no lo tienes ahora, déjalo vacío y añádelo después en su ficha.">
                <input
                  type="email"
                  className={inputCls}
                  placeholder="laura@ejemplo.com"
                  value={form.email}
                  onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                />
              </FF>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <FF label="Teléfono" description="Para avisos por WhatsApp, si el estudio los tiene activados.">
                  <input
                    className={inputCls}
                    placeholder="+34 600 000 000"
                    value={form.telefono}
                    onChange={(e) => setForm((f) => ({ ...f, telefono: e.target.value }))}
                  />
                </FF>
                {veDatosPrivados && (
                  <FF label="NIF (opcional)" description="Solo hace falta si vas a facturarle. Se puede añadir más adelante.">
                    <input
                      className={inputCls}
                      placeholder="12345678A"
                      value={form.nif}
                      onChange={(e) => setForm((f) => ({ ...f, nif: e.target.value }))}
                    />
                  </FF>
                )}
              </div>
              {camposPersonalizados.some(c => c.activo) && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 pt-1">
                  <CamposExtraFields
                    campos={camposPersonalizados}
                    values={form.camposExtra}
                    onChange={(id, v) => setForm(f => ({ ...f, camposExtra: { ...f.camposExtra, [id]: v } }))}
                    inputClassName={inputCls}
                  />
                </div>
              )}
              {/* Elegir plan aquí genera la primera factura: es dinero, no alta.
                  El manager da de alta clientas pero no cobra, así que ve el
                  formulario sin este campo. */}
              {mueveDinero && (
              <FF label="Plan / Tarifa" description="Le crea su plan y su primer recibo. Tú dices si ya te lo ha pagado.">
                <select
                  className={selectCls}
                  value={form.planId}
                  onChange={(e) => setForm((f) => ({ ...f, planId: e.target.value }))}
                >
                  <option value="">Sin plan</option>
                  {planesTarifa.filter((p) => p.activo).map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.nombre} — {p.precio} €
                    </option>
                  ))}
                </select>
              </FF>
              )}
              {/* ¿Ya te ha pagado? Antes no se preguntaba: el recibo salía
                  siempre COBRADO, sin método, y sumaba a los ingresos del mes
                  dinero que no había entrado en el banco. */}
              {mueveDinero && form.planId && showForm === 'nueva' && (
                <FF label="¿Ya te ha pagado?" description={emiteFacturas(studio?.modoFacturacion) ? 'Marca «Todavía no» y el recibo queda pendiente en Cobros. La factura se emite cuando lo cobres.' : 'Marca «Todavía no» y el recibo queda pendiente en Cobros.'}>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setForm((f) => ({ ...f, cobroPagado: false }))}
                      aria-pressed={!form.cobroPagado}
                      className={`rounded-lg border px-3 py-2 text-[13px] text-left transition-colors ${
                        !form.cobroPagado
                          ? 'border-foreground bg-foreground text-background font-medium'
                          : 'border-border bg-card hover:bg-muted/40'
                      }`}
                    >
                      Todavía no
                      <span className="block text-[11px] opacity-70">Queda pendiente de cobro</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setForm((f) => ({ ...f, cobroPagado: true }))}
                      aria-pressed={form.cobroPagado}
                      className={`rounded-lg border px-3 py-2 text-[13px] text-left transition-colors ${
                        form.cobroPagado
                          ? 'border-foreground bg-foreground text-background font-medium'
                          : 'border-border bg-card hover:bg-muted/40'
                      }`}
                    >
                      Sí, ya está cobrado
                      <span className="block text-[11px] opacity-70">Cuenta como ingreso de hoy</span>
                    </button>
                  </div>
                  {form.cobroPagado && (
                    <select
                      className={`${selectCls} mt-2`}
                      aria-label="Cómo te lo ha pagado"
                      value={form.cobroMetodo}
                      onChange={(e) => setForm((f) => ({ ...f, cobroMetodo: e.target.value as Exclude<MetodoCobro, 'SEPA'> }))}
                    >
                      <option value="EFECTIVO">Efectivo</option>
                      <option value="TARJETA">Tarjeta (datáfono)</option>
                      <option value="BIZUM">Bizum</option>
                      <option value="TRANSFERENCIA">Transferencia</option>
                    </select>
                  )}
                </FF>
              )}
              {form.planId && showForm === 'nueva' && form.cobroPagado && (
                <div className="flex items-center gap-2 px-3 py-2 bg-success/10 border border-success/20 rounded-lg">
                  <CheckCircle2 size={14} className="text-success shrink-0" />
                  <p className="text-[12px] text-success">
                    Se emitirá su factura al completar la inscripción
                  </p>
                </div>
              )}
            </div>
          )}

          {/* ── Política de privacidad + contrato (mismo paso) ─── */}
          {showForm === 'nueva' && (
            <div className="space-y-3.5 mt-4 pt-4 border-t border-border">
              {/* El texto va PLEGADO: está a un clic para leerlo entero, pero no
                  obliga a recorrerlo con la alumna delante. La aceptación sigue
                  siendo obligatoria para crear la clienta. */}
              <details className="group space-y-1.5">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-2 [&::-webkit-details-marker]:hidden">
                  <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-1.5">
                    <FileText size={11} />
                    Ver política de privacidad y condiciones
                  </span>
                  <ChevronDown size={14} className="shrink-0 text-muted-foreground transition-transform group-open:rotate-180" aria-hidden />
                  {/* Aquí decía «Desplaza hasta el final ↓» y, al llegar,
                      «Leído». No bloqueaba nada —la casilla nunca dependió del
                      desplazamiento— pero con la alumna delante se leía como
                      un paso obligatorio (evaluación del 13-sep). Y un «Leído»
                      por mover la rueda no prueba que nadie lo haya leído. */}
                </summary>
                <div
                  ref={contratoRef}
                  className="mt-2 h-52 overflow-y-auto rounded-lg border border-border bg-muted p-3 text-[11px] text-foreground leading-relaxed whitespace-pre-wrap font-mono"
                >
                  {textoLegalCompleto(studioConfig)}
                </div>
              </details>

              {/* Acceptance checkbox */}
              <label className={cn(
                'flex items-start gap-2.5 p-3 rounded-lg border cursor-pointer transition-colors',
                aceptado ? 'border-success bg-success/10' : 'border-border bg-card hover:border-muted-foreground',
              )}>
                <input
                  type="checkbox"
                  checked={aceptado}
                  onChange={(e) => setAceptado(e.target.checked)}
                  className="mt-0.5 accent-success"
                />
                <span className="text-[12px] text-foreground leading-snug">
                  He leído y acepto la política de privacidad y las condiciones del servicio del estudio
                </span>
              </label>

              {/* Firma. Es OPCIONAL a propósito: si la clienta no está delante,
                  obligar a firmar aquí significaba que el estudio tecleara su
                  nombre por ella — y quedaba registrado como si hubiera firmado
                  ella misma. Sin firma, la socia se crea igual y la firma se le
                  pide la primera vez que entre a reservar. */}
              {/* La firma es dato privado (M1 RGPD): un MANAGER no la recoge;
                  la socia queda pendiente y firma ella al entrar a reservar. */}
              {veDatosPrivados && (
              <FF
                label="Firma de la clienta (opcional)"
                description="Solo si está delante y firma ella. Si se ha apuntado por teléfono, déjalo vacío: se lo pediremos cuando entre a reservar."
              >
                <div className="relative">
                  <PenLine size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  <input
                    className={inputCls + ' pl-8 font-medium italic'}
                    placeholder="Nombre completo de la clienta…"
                    value={firma}
                    onChange={(e) => setFirma(e.target.value)}
                  />
                </div>
              </FF>
              )}

              {/* Resumen: dice exactamente qué se va a guardar y de quién. */}
              {aceptado && (
                firma.trim() ? (
                  <div className="flex items-start gap-2 px-3 py-2.5 bg-success/10 border border-success/20 rounded-lg">
                    <ShieldCheck size={14} className="text-success shrink-0 mt-0.5" />
                    <div>
                      <p className="text-[12px] font-semibold text-success">Firmado en el estudio</p>
                      <p className="text-[11px] text-muted-foreground mt-0.5">
                        Se guardará como firmado por <span className="font-medium text-foreground">{firma.trim()}</span>,
                        recogido presencialmente por el estudio el{' '}
                        {new Date().toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' })}.
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-start gap-2 px-3 py-2.5 bg-warning/10 border border-warning/20 rounded-lg">
                    <FileText size={14} className="text-warning shrink-0 mt-0.5" />
                    <div>
                      <p className="text-[12px] font-semibold text-warning">Queda pendiente de firma</p>
                      <p className="text-[11px] text-muted-foreground mt-0.5">
                        La clienta se crea igualmente. Se le pedirá aceptar el contrato la primera vez
                        que entre a reservar, y firmará ella.
                      </p>
                    </div>
                  </div>
                )
              )}
            </div>
          )}

          {errorGuardar && (
            <p className="flex items-start gap-2 mt-4 p-2.5 rounded-lg bg-red-50 text-[12px] text-red-700">
              <AlertTriangle size={14} className="shrink-0 mt-0.5" />
              <span>{errorGuardar}</span>
            </p>
          )}

          {/* "Siguiente" se queda deshabilitado en silencio si falta algún
              obligatorio (#865) — este aviso dice cuál, en vez de dejar que
              el botón "no haga nada" sin explicación. */}
          {showForm === 'nueva' && (!form.nombre || !form.apellidos || !aceptado) && (
            <p className="mt-3 text-[11px] text-muted-foreground">
              Falta {[!form.nombre && 'Nombre', !form.apellidos && 'Apellidos', !aceptado && 'aceptar la política y las condiciones'].filter(Boolean).join(', ')} para crearla.
            </p>
          )}

          {/* ── Actions ─── */}
          <div className="flex gap-2 mt-5">
            <button
              onClick={resetModal}
              className="flex-1 py-2 rounded-xl text-[13px] font-medium border border-border text-muted-foreground hover:bg-muted transition-colors"
            >
              Cancelar
            </button>
              <button
                onClick={showForm === 'nueva' ? handleCrear : handleEditar}
                disabled={
                  guardando || !form.nombre || !form.apellidos || (showForm === 'nueva' && !aceptado)
                }
                className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-[13px] font-medium text-primary-foreground bg-primary disabled:opacity-40 hover:brightness-95 transition-colors"
              >
                {guardando && <Loader2 size={14} className="animate-spin" />}
                {guardando
                  ? 'Guardando…'
                  : showForm === 'nueva'
                    ? (firma.trim() ? 'Crear clienta y firmar' : 'Crear clienta')
                    : 'Guardar cambios'}
              </button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Tras dar una cuota: ¿viene siempre a la misma clase? ─────────────── */}
      <Dialog open={ofrecerPlazaFija !== null} onOpenChange={(open) => { if (!open) setOfrecerPlazaFija(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-lg font-semibold text-foreground">¿Le das una clase fija?</DialogTitle>
          </DialogHeader>
          {ultimaOferta && (
            <p className="text-sm text-muted-foreground mt-1">
              {ultimaOferta.nombre} ya tiene «{ultimaOferta.plan}». Si viene siempre a la misma clase, elige
              cuál: se le reserva sola cada semana, sin apuntarla a mano.
            </p>
          )}
          <div className="flex flex-col gap-2 pt-2">
            <button
              onClick={() => { setPlazaFijaPara(ofrecerPlazaFija?.socioId ?? null); setOfrecerPlazaFija(null); }}
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

      {plazaFijaPara && (
        <DialogoPlazaFija
          socioId={plazaFijaPara}
          onClose={() => setPlazaFijaPara(null)}
          onGuardada={(r, movida) => {
            setPlazaFijaPara(null);
            setErrorFila(null);
            setAvisoPlazaFija(textoPlazaGuardada(r, movida));
          }}
        />
      )}

      {/* ── Modal: Etiqueta en bloque ──────────────────────────────────────── */}
      <Dialog open={showEtiqueta} onOpenChange={(open) => { if (!open) cerrarEtiqueta(); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-base font-semibold text-foreground">
              Poner una etiqueta — {selected.size} clienta{selected.size !== 1 ? 's' : ''}
            </DialogTitle>
          </DialogHeader>
          {resultadoEtiqueta ? (
            <div className="space-y-4 mt-2">
              <p role="status" className="text-[13px] text-foreground">{resultadoEtiqueta}.</p>
              <button onClick={cerrarEtiqueta} className="w-full min-h-10 rounded-xl text-[13px] font-medium text-primary-foreground bg-primary hover:brightness-95">Cerrar</button>
            </div>
          ) : (
            <div className="space-y-4 mt-2">
              {etiquetasDisponibles.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {etiquetasDisponibles.map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setEtiquetaBloque(t)}
                      className={cn('rounded-full border px-3 py-1.5 text-[12.5px] font-medium', etiquetaBloque === t ? 'border-transparent bg-foreground text-background' : 'border-border bg-card text-foreground hover:bg-muted')}
                    >
                      {t}
                    </button>
                  ))}
                </div>
              )}
              <FF label="O escribe una nueva">
                <input className={inputCls} value={etiquetaBloque} onChange={(e) => setEtiquetaBloque(e.target.value.slice(0, 40))} placeholder="Por ejemplo: Mañanas" />
              </FF>
              <div className="flex gap-2">
                <button onClick={cerrarEtiqueta} disabled={aplicandoEtiqueta} className="flex-1 min-h-10 rounded-xl text-[13px] font-medium border border-border text-muted-foreground hover:bg-muted disabled:opacity-40">Cancelar</button>
                <button
                  onClick={() => void handleEtiquetaBloque()}
                  disabled={!etiquetaBloque.trim() || aplicandoEtiqueta}
                  className="flex-1 min-h-10 rounded-xl text-[13px] font-medium text-primary-foreground bg-primary disabled:opacity-40 hover:brightness-95"
                >
                  {aplicandoEtiqueta ? 'Poniendo…' : `Poner a ${selected.size}`}
                </button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ── Modal: Enviar acceso a la app (bulk) ────────────────────────────── */}
      <Dialog open={showAcceso} onOpenChange={(open) => { if (!open) cerrarAcceso(); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-base font-semibold text-foreground">
              Enviar el acceso a la app — {selected.size} clienta{selected.size !== 1 ? 's' : ''}
            </DialogTitle>
          </DialogHeader>
          {(() => {
            const conEmail = socios.filter((s) => selected.has(s.id) && s.email).length;
            const sinEmail = selected.size - conEmail;
            return resultadoAcceso ? (
              <div className="space-y-4 mt-2">
                <p role="status" className="text-[13px] text-foreground">{resultadoAcceso}</p>
                <button onClick={cerrarAcceso} className="w-full py-2 rounded-xl text-[13px] font-medium text-primary-foreground bg-primary hover:brightness-95">
                  Cerrar
                </button>
              </div>
            ) : (
              <div className="space-y-4 mt-2">
                <p className="text-[13px] text-muted-foreground text-pretty">
                  Les llega el correo de bienvenida del estudio con el enlace para entrar en su app, sin contraseña.
                  {sinEmail > 0 && <> <strong className="font-semibold text-foreground">{sinEmail} no tiene{sinEmail === 1 ? '' : 'n'} email</strong> y no lo recibirá{sinEmail === 1 ? '' : 'n'}.</>}
                </p>
                <div className="flex gap-2">
                  <button onClick={cerrarAcceso} disabled={enviandoAcceso} className="flex-1 py-2 rounded-xl text-[13px] font-medium border border-border text-muted-foreground hover:bg-muted disabled:opacity-40">
                    Cancelar
                  </button>
                  <button
                    onClick={() => void handleEnviarAcceso()}
                    disabled={conEmail === 0 || enviandoAcceso}
                    className="flex-1 py-2 rounded-xl text-[13px] font-medium text-primary-foreground bg-primary disabled:opacity-40 hover:brightness-95"
                  >
                    {enviandoAcceso ? 'Enviando…' : `Enviar a ${conEmail}`}
                  </button>
                </div>
              </div>
            );
          })()}
        </DialogContent>
      </Dialog>

      {/* ── Modal: Asignar plan (bulk) ──────────────────────────────────────── */}
      <Dialog
        open={showAsignarPlan}
        onOpenChange={(open) => { if (!open && !asignando) { setShowAsignarPlan(false); setAsignarPlanId(''); setErrorAsignar(null); } }}
      >
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-base font-semibold text-foreground">
              Cambiar plan — {selected.size} clienta{selected.size !== 1 ? 's' : ''}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-2">
            <FF label="Plan / Tarifa">
              <select
                className={selectCls}
                value={asignarPlanId}
                disabled={asignando}
                onChange={(e) => setAsignarPlanId(e.target.value)}
              >
                <option value="">Selecciona un plan…</option>
                {planesTarifa.filter((p) => p.activo).map((p) => (
                  <option key={p.id} value={p.id}>{p.nombre} — {p.precio} €</option>
                ))}
              </select>
            </FF>
            {/* Lo que va a pasar con el dinero, ANTES de pulsar: asignar en bloque
                son N ventas. No cobra en el momento (anota un recibo pendiente por
                clienta, como `assignPlan`), y eso también hay que decirlo. */}
            {(() => {
              const p = planesTarifa.find(x => x.id === asignarPlanId);
              if (!p) return null;
              const n = selected.size;
              const euros = (v: number) => `${Number.isInteger(v) ? v : v.toFixed(2).replace('.', ',')} €`;
              return (
                <div className="rounded-xl bg-muted px-3.5 py-3 text-[12.5px] text-foreground space-y-1">
                  {p.precio > 0 ? (
                    <p>
                      <strong className="font-semibold">Se anota{n === 1 ? '' : 'n'} {n} recibo{n === 1 ? '' : 's'} de {euros(p.precio)}{n > 1 ? ` (${euros(p.precio * n)} en total)` : ''}</strong> en «Quién me debe». {n === 1 ? 'No se cobra solo: lo cobras tú o lo paga ella.' : 'No se cobran solos: los cobras tú o los paga cada una.'}
                    </p>
                  ) : (
                    <p>Es un plan gratis: no se anota ningún cobro.</p>
                  )}
                  {(p.matricula ?? 0) > 0 && (
                    <p className="text-muted-foreground">A quien sea su primer plan en el estudio se le anota también la matrícula ({euros(p.matricula ?? 0)}), salvo que entre en una promoción de matrícula gratis.</p>
                  )}
                  <p className="text-muted-foreground">La cuota que tengan ahora se sustituye; los bonos con sesiones se conservan.</p>
                </div>
              );
            })()}
            {errorAsignar && (
              <p className="text-[12.5px] text-destructive">{errorAsignar}</p>
            )}
            <div className="flex gap-2">
              <button
                onClick={() => { setShowAsignarPlan(false); setAsignarPlanId(''); setErrorAsignar(null); }}
                disabled={asignando}
                className="flex-1 py-2 rounded-xl text-[13px] font-medium border border-border text-muted-foreground hover:bg-muted disabled:opacity-40 transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={handleAsignarPlan}
                disabled={!asignarPlanId || asignando}
                className="flex-1 py-2 rounded-xl text-[13px] font-medium text-primary-foreground bg-primary disabled:opacity-40 hover:brightness-95 transition-colors"
              >
                {asignando ? 'Asignando…' : `Asignar a ${selected.size} clienta${selected.size !== 1 ? 's' : ''}`}
              </button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Modal: Ampliar caducidad (bulk) ─────────────────────────────────── */}
      <Dialog open={showAmpliar} onOpenChange={(open) => { if (!open && !ampliando) cerrarAmpliar(); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-base font-semibold text-foreground">
              Ampliar caducidad — {selected.size} clienta{selected.size !== 1 ? 's' : ''}
            </DialogTitle>
          </DialogHeader>
          {resultadoAmpliar ? (
            <div className="space-y-4 mt-2">
              <p className="text-[13px] text-foreground">
                {resultadoAmpliar.bonos === 0 && resultadoAmpliar.recuperaciones === 0
                  ? 'No había ningún bono ni recuperación en vigor que ampliar.'
                  : `Ampliados ${diasAmpliar} días: ${resultadoAmpliar.bonos} bono${resultadoAmpliar.bonos !== 1 ? 's' : ''} y ${resultadoAmpliar.recuperaciones} recuperaci${resultadoAmpliar.recuperaciones !== 1 ? 'ones' : 'ón'}.`}
              </p>
              <button
                onClick={cerrarAmpliar}
                className="w-full py-2 rounded-xl text-[13px] font-medium text-primary-foreground bg-primary hover:brightness-95 transition-colors"
              >
                Cerrar
              </button>
            </div>
          ) : (
            <div className="space-y-4 mt-2">
              <FF label="Días a añadir">
                <input
                  type="number" min={1} max={365}
                  className={inputCls}
                  value={diasAmpliar}
                  disabled={ampliando}
                  onChange={(e) => setDiasAmpliar(Math.min(365, Math.max(1, Number(e.target.value) || 1)))}
                />
              </FF>
              <p className="text-[12px] text-muted-foreground">
                Se suman a los bonos en vigor y a las recuperaciones sin usar. Las cuotas
                mensuales no se tocan: su fecha marca el próximo cobro. Lo que ya haya
                caducado no se recupera, así que amplía antes de cerrar.
              </p>
              {errorAmpliar && <p className="text-[12.5px] text-destructive">{errorAmpliar}</p>}
              <div className="flex gap-2">
                <button
                  onClick={cerrarAmpliar}
                  disabled={ampliando}
                  className="flex-1 py-2 rounded-xl text-[13px] font-medium border border-border text-muted-foreground hover:bg-muted disabled:opacity-40 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleAmpliarCaducidades}
                  disabled={ampliando}
                  className="flex-1 py-2 rounded-xl text-[13px] font-medium text-primary-foreground bg-primary disabled:opacity-40 hover:brightness-95 transition-colors"
                >
                  {ampliando ? 'Ampliando…' : `Ampliar ${diasAmpliar} días`}
                </button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ── Modal: Consentimiento de marketing en lote ──────────────────────── */}
      {/* Esta pantalla ANOTA un consentimiento ya obtenido, no lo crea: el art. 7
          del RGPD exige que lo dé la interesada. De ahí las tres cosas que la
          hacen distinta de un botón de confirmar cualquiera — el texto legal
          exacto a la vista, la casilla de afirmación que desbloquea el botón, y
          el recuento por separado de a quién NO se ha tocado. */}
      <Dialog open={showConsentMkt} onOpenChange={(open) => { if (!open && !guardandoConsentMkt) cerrarConsentMkt(); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-base font-semibold text-foreground">
              Consentimiento de marketing — {selected.size} clienta{selected.size !== 1 ? 's' : ''}
            </DialogTitle>
          </DialogHeader>
          {resultadoConsentMkt ? (
            <div className="space-y-4 mt-2">
              <p className="text-[13px] text-foreground">{resultadoConsentMkt}</p>
              <button
                onClick={cerrarConsentMkt}
                className="w-full py-2 rounded-xl text-[13px] font-medium text-primary-foreground bg-primary hover:brightness-95 transition-colors"
              >
                Cerrar
              </button>
            </div>
          ) : (
            <div className="space-y-4 mt-2">
              <p className="text-[13px] text-foreground">
                Esto <strong>anota</strong> un consentimiento que ya te han dado — en mostrador,
                en la hoja de alta, por escrito. No se lo pide a nadie: la ley exige que lo dé
                la clienta, así que solo regístralo si de verdad lo tienes.
              </p>
              <div>
                <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground mb-1.5">
                  Texto que se guarda
                </p>
                <p className="text-[12px] leading-relaxed text-muted-foreground bg-muted/50 rounded-lg p-3 max-h-40 overflow-y-auto">
                  {textoConsentimientoMarketing({ nombre: studio?.nombre })}
                </p>
              </div>
              <p className="text-[12px] text-muted-foreground">
                A quien ya lo tenga registrado no se le toca la fecha. Queda anotado como
                registrado en mostrador, y cualquiera puede darse de baja desde el enlace de
                cualquier email.
              </p>
              <label className="flex items-start gap-2 text-[12.5px] text-foreground cursor-pointer">
                <input
                  type="checkbox"
                  className="mt-0.5"
                  checked={afirmadoConsentMkt}
                  disabled={guardandoConsentMkt}
                  onChange={(e) => setAfirmadoConsentMkt(e.target.checked)}
                />
                <span>
                  Confirmo que <strong>cada una</strong> de estas {selected.size} clienta{selected.size !== 1 ? 's' : ''} me
                  {selected.size !== 1 ? ' han' : ' ha'} dado este consentimiento.
                </span>
              </label>
              {errorConsentMkt && <p className="text-[12.5px] text-destructive">{errorConsentMkt}</p>}
              <div className="flex gap-2">
                <button
                  onClick={cerrarConsentMkt}
                  disabled={guardandoConsentMkt}
                  className="flex-1 py-2 rounded-xl text-[13px] font-medium border border-border text-muted-foreground hover:bg-muted disabled:opacity-40 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleRegistrarConsentimientoMkt}
                  disabled={guardandoConsentMkt || !afirmadoConsentMkt}
                  className="flex-1 py-2 rounded-xl text-[13px] font-medium text-primary-foreground bg-primary disabled:opacity-40 hover:brightness-95 transition-colors"
                >
                  {guardandoConsentMkt ? 'Registrando…' : 'Registrar'}
                </button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

    </div>
  );
}

// Un desplegable de filtro que enseña lo que tiene elegido («Plan: Mensual»):
// un <select> nativo encima, invisible, para que en el móvil salga la rueda del
// sistema y con teclado funcione como cualquier select.
function SelectFiltro({ etiqueta, valor, onCambiar, opciones, todos }: {
  etiqueta: string;
  valor: string;
  onCambiar: (v: string) => void;
  opciones: { valor: string; texto: string }[];
  /** Texto de «sin filtrar»; sin él, el select siempre tiene un valor (ordenar). */
  todos?: string;
}) {
  const elegido = opciones.find((o) => o.valor === valor)?.texto;
  const filtrando = todos !== undefined && !!valor;
  // Sin filtrar dice solo qué filtra («Plan»); filtrando, lo elegido («Plan: Mensual»).
  const conValor = todos === undefined || filtrando;
  return (
    <label className={cn(
      'relative inline-flex min-h-10 shrink-0 items-center rounded-xl border bg-card pl-3 pr-8 text-[13px] font-medium text-foreground transition-colors hover:border-muted-foreground [@media(pointer:fine)]:min-h-9',
      filtrando ? 'border-foreground bg-muted/60' : 'border-border',
    )}>
      {conValor ? (
        <>
          <span className="mr-1 text-muted-foreground">{etiqueta}:</span>
          <span className="max-w-[11rem] truncate">{elegido ?? ''}</span>
        </>
      ) : (
        <span>{etiqueta}</span>
      )}
      <ChevronDown size={14} className="pointer-events-none absolute right-2.5 text-muted-foreground" aria-hidden />
      <select
        value={valor}
        onChange={(e) => onCambiar(e.target.value)}
        aria-label={etiqueta}
        className="absolute inset-0 cursor-pointer appearance-none opacity-0"
      >
        {todos !== undefined && <option value="">{todos}</option>}
        {opciones.map((o) => <option key={o.valor} value={o.valor}>{o.texto}</option>)}
      </select>
    </label>
  );
}

function AccionBloque({ icono: Icono, onClick, children }: { icono: ElementType; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex min-h-12 flex-col items-center justify-center gap-0.5 rounded-xl px-2.5 text-[11.5px] font-medium text-sidebar-foreground/90 transition-colors hover:bg-sidebar-foreground/10 hover:text-sidebar-foreground md:min-h-9 md:flex-row md:gap-1.5 md:text-[13px]"
    >
      <Icono size={16} aria-hidden />
      {children}
    </button>
  );
}
