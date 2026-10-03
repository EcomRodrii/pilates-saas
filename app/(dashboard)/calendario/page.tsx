'use client';

import { ETIQUETA_INSTRUCTORA_NO_DISPONIBLE, nombreInstructoraDeClase } from '@/lib/equipo/clases-sin-instructora';
import * as Sentry from '@sentry/nextjs';
import { useState, useMemo, useEffect, useRef, useCallback, useId, useSyncExternalStore } from 'react';
import { useAuth } from '@/lib/auth-context';
import { capturarMensaje } from '@/lib/sentry-cliente';
import { useStudio } from '@/lib/studio-context';
import { puedeAbrirEnConfiguracion } from '@/lib/configuracion/destino';
import { supabase } from '@/lib/db/supabase';
import { useAforoEnVivo } from '@/lib/realtime/aforo-en-vivo';
import { useSemaforoRecepcion } from '@/lib/hooks/use-semaforo-recepcion';
import { queImparten } from '@/lib/equipo';
import { useRol, puedeVer, puedeVerFichaClinica, puedeVerSemaforo, puedeGestionarClientas, puedeMoverDinero, puedeCrearClasesPropias, puedeGestionarCalendario } from '@/lib/permisos';
import { semaforo, alertaPreClase, resumenSaludClase, RESPUESTAS_ORDEN, RESPUESTA_META, SEMAFORO_META } from '@/lib/ficha-clinica';
import { authHeader } from '@/lib/api-client';
import type { ReservaEnriquecida, Sesion, Studio, TipoClase } from '@/lib/types';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import {
  ChevronRight, X, AlertTriangle, RefreshCw, CalendarDays, Clock3, ArrowRight,
  UserCheck, Pencil, Trash2, Copy, Ban, Wrench, PictureInPicture2, TrendingDown, Plus,
} from 'lucide-react';
import Link from 'next/link';
import { faltaParaCrearClase } from '@/lib/calendario/falta-para-crear-clase';
import { cn, cuandoEstudio, fechaLargaEstudio, formatEuro, franjaLocalDe, horaEstudio, capitalizarPrimera, hoyEnEstudio, masDias, TZ_ESTUDIO } from '@/lib/utils';
import { horaParedAInstante, fechaLocalDe, esHoraHHMM } from '@/lib/citas/slots';
import { calcularImpactoEdicionSerie, cambiosPorClase, type EdicionDeSerie, type ImpactoEdicionSerie } from '@/lib/series-impacto-edicion';
import { DialogoImpactoEdicion, type CambioVisible } from '@/components/series/dialogo-impacto-edicion';
import { enviarEmailCancelacionClase, avisarCambioClaseServidor, avisarCambioSerieServidor, avisarClaseCancelada, listarAusencias, decidirReservaPendiente, type AusenciaInstructora } from '@/lib/api-client';
import { resultadoDecisionReserva } from '@/lib/reservas-por-aprobar';
import { invalidarEstadoEstudio } from '@/lib/estado-estudio-cliente';
import type { CambioClaseSerie } from '@/lib/avisos-serie';
import { ausenciaEnFecha, sufijoAusencia } from '@/lib/ausencias';
import { colorPorIndice } from '@/lib/onboarding/plan-configuracion';
import { detectarConflictos, elegirLibre, hayConflicto, plazasSobrantesTrasAforo, type SlotSesion } from '@/lib/calendar-logic';
import { decidirReservaNueva } from '@/lib/booking-logic';
import { aforoPorDefectoDeSesion } from '@/lib/aforo-logic';
import { sesionEncajaEnPlaza, claveFranjaDeSesion, type SesionSlot } from '@/lib/plazas-fijas-slot';
import { cuotaParaPlazaFija } from '@/lib/plazas-fijas-reglas';
import { DialogoPlazaFija, textoPlazaGuardada } from '@/components/plazas-fijas/dialogo-plaza-fija';
import { marcaReserva, textoTrasQuitar } from '@/lib/plazas-fijas-cancelacion';
import { usePlataformasActivas } from '@/components/configuracion/plataformas-externas';
import { DashboardDrawer } from '@/components/ui/dashboard-drawer';
import { AvisoAforoSala, DIA_PILLS, DiaPill, FormField, inputCls, selectCls } from '@/components/calendario/campos-clase';
import { FormularioNuevaClase, type InicialNuevaClase, type SesionNueva, type SlotConTipo } from '@/components/calendario/formulario-nueva-clase';
import { finConDuracion, fraseAlLlenarse } from '@/lib/calendario/nueva-clase';
import { dbListCierres } from '@/lib/supabase-data';
import type { CierreGuardado } from '@/lib/cierres/quitar-cierre';
import type { ResultadoEscritura } from '@/lib/errores';
import { Toast, useToast } from '@/components/ui/toast';
import type { AccionMenu } from '@/components/ui/menu-acciones';

// ── Rediseño del Calendario ──────────────────────────────────────────────────
// Composición nueva sobre lib/calendario-*.ts + components/calendario/*
// (Etapas 0-8). Toda la lógica de negocio de esta pantalla (crear/editar/
// cancelar clase, series, cobertura, bonos, ficha clínica/IA, notificaciones)
// se conserva TAL CUAL — el rediseño cambia la arquitectura visual (estado
// derivado, rejilla día-por-sala, franja de decisiones, panel de 3 pestañas,
// datos por rol, filtros que atenúan, layout sin scroll de página), no las
// reglas de negocio ya probadas.
import { LienzoCalendario } from '@/components/calendario/lienzo-calendario';
import { CabeceraCalendario, type VistaCalendario } from '@/components/calendario/cabecera-calendario';
import { BuscadorCalendario } from '@/components/calendario/buscador-calendario';
import { SelectorFecha } from '@/components/calendario/selector-fecha';
import { ResumenCalendario } from '@/components/calendario/resumen-calendario';
import { TiraDias } from '@/components/calendario/tira-dias';
import { SemanaFranjas } from '@/components/calendario/semana-franjas';
import { FichaClase, type ModoFicha, type PestanaFicha } from '@/components/calendario/ficha-clase';
import { ClientasDeClase } from '@/components/calendario/clientas-de-clase';
import { AnadirAClase, type MetodoSuelta } from '@/components/calendario/anadir-a-clase';
import { SustitutaDeClase, type DatosSustitutaClase } from '@/components/calendario/sustituta-de-clase';
import { enlaceWhatsApp } from '@/lib/decision/mensajes-socia';
import { coberturaDeClase } from '@/lib/reservar/cobertura';
import { lineaCoberturaMostrador } from '@/lib/calendario/cobertura-mostrador';
import { idReciboDeClaseSuelta } from '@/lib/cobros/recibo-de-cita';
import { avisoClaseSueltaAlQuitar, importeDeClaseSuelta, motivoSinClaseSuelta, planDeClaseSuelta } from '@/lib/reservas/clase-suelta';
import type { CubiertaPor } from '@/lib/reservas/reserva-mostrador';
import { AdaptacionesClase } from '@/components/calendario/adaptaciones-clase';
import { HistorialSesion } from '@/components/calendario/historial-sesion';
import { SpotMap } from '@/components/spots/spot-map';
import type { DatosTarjeta } from '@/components/calendario/tarjeta-clase';
import { marcaDeClase, resumenDeVista, claseEnFiltro, type ClaseParaResumen, type FiltroResumen } from '@/lib/calendario/marca-clase';
import { estadoDeFicha, porQueSinCubrir } from '@/lib/calendario/estado-ficha';
import { claseDelMostrador, siguienteClase, vecinas } from '@/lib/calendario/mostrador';
import type { ClaseEnFranja } from '@/lib/calendario/franjas';
import { DialogoDecision } from '@/components/calendario/dialogo-decision';
import { VistaDiaSalas, type DatoSesion } from '@/components/calendario/vista-dia-salas';
import { PrimerHorario } from '@/components/calendario/primer-horario';
import { ListoParaReservar } from '@/components/onboarding/listo-para-reservar';
import { VistaAgenda, CONSULTA_AGENDA, clasesDeAgenda, type DiaDeAgenda } from '@/components/calendario/vista-agenda';
import { agendaDeDia, agendaDeSemana } from '@/lib/calendario-agenda';
import { useCoincideMedio } from '@/lib/hooks/use-coincide-medio';
import { semanaQueMuestra } from '@/lib/calendario/semana-visible';
import { CONSULTA_ESCRITORIO } from '@/lib/panel/escritorio';
import {
  EVENTO_SALTAR_A_CLASE, abrirVentanaDesde, actualizarVentana, estadoVentana, estadoVentanaServidor,
  suscribirVentana,
} from '@/lib/calendario/ventana-flotante';
import { useAltoHastaElFondo } from '@/lib/hooks/use-alto-hasta-el-fondo';
import { createPortal } from 'react-dom';
import { anfitrionPortal } from '@/lib/panel-portal';
import { estadoSesion, sesionYaEmpezada, checkinAbierto, aperturaCheckin, MENSAJE_CLASE_YA_EMPEZADA, MENSAJE_CLASE_DADA, MENSAJE_HORA_PASADA, type EstadoSesion } from '@/lib/calendario-estado';
import type { SesionCalendario } from '@/lib/calendario-datos';
import { prepararColumnasSalaDia, prepararColumnasDiaSemana, type SesionColumna, type SesionSemana } from '@/lib/calendario-columnas';
import { type SesionBuscable } from '@/lib/calendario-busqueda';
import { mmA } from '@/lib/calendario-metricas';
import { minutosEnEstudio, diaEnEstudio } from '@/lib/calendario-hora-estudio';
import { nuevoHorarioArrastrado } from '@/lib/calendario-arrastre';
import { puedeAjustarAforoASalaCapacidad, motivoAforoBloqueado } from '@/lib/calendario-acciones';
import { claseAtenuadaPorInstructor } from '@/lib/calendario-filtros';
import { rangoDia, rangoSemanaDesde, claveRango, type RangoFechas } from '@/lib/calendario-rango';
import { historialSustituciones } from '@/lib/calendario-historial';
import { enPilotoVoz } from '@/lib/piloto-ficha-viva';
import { ModalNotaVoz } from '@/components/socios/modal-nota-voz';
import { ReanimarAlCambiar } from '@/components/ui/reanimar-al-cambiar';
import { DialogoRenovarSerie } from '@/components/series/dialogo-renovar-serie';
import { VistaHorario } from '@/components/calendario/vista-horario';
import { ElegirClienta } from '@/components/calendario/elegir-clienta';
import { pedirHorario } from '@/lib/horario-fijo-cliente';
import { textoRepeticion, type HorarioFijo, type TarjetaHorario } from '@/lib/horario-fijo';
import { nombreSerie } from '@/lib/series-renovacion';
import { estaArchivado, tiposParaProgramar } from '@/lib/tipos-clase/orden-y-archivo';

// ─── Utility helpers ──────────────────────────────────────────────────────────

// Fecha fija con la que pintan IGUAL servidor y cliente hasta que monta y salta
// a la real (guarda de hidratación). A nivel de módulo, no dentro del
// componente: dentro era un objeto nuevo en cada render, y es el valor inicial
// de cuatro estados.
const FALLBACK = new Date('2026-01-01T12:00:00');
/** Mientras no se han leído los cierres del centro: el mismo array siempre, para no recalcular. */
const SIN_CIERRES: CierreGuardado[] = [];
/** El ajuste «Peticiones desde su app», al que lleva el aviso de la vista Horario. */
const HREF_PETICIONES_PLAZA_FIJA = '/configuracion?tab=reservas#plaza-fija-desde-la-app';

function addDays(date: Date, n: number) {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
}

// Semana PROGRESIVA, a petición explícita de una propietaria: la ventana
// visible arranca en la fecha que se le pase tal cual (medianoche), sin
// redondear al lunes de esa semana ISO — si hoy es domingo, la ventana es
// domingo→sábado, no el lunes-domingo que ya había pasado. `cambiarSemana`
// (más abajo) ya sumaba/restaba 7 días sobre este valor sin volver a anclar
// a ningún lunes, así que basta con este cambio para que "Hoy", la carga
// inicial y la navegación de semanas queden progresivos sin tocar nada más
// de ese lado. NO confundir con `inicioSemana`/`rangoSemana`
// (lib/calendario-rango.ts): esas siguen ancladas a lunes a propósito,
// porque las usa la vista de Mes para alinear su rejilla 6×7 al calendario
// real — cambiarlas rompería esa vista, que no tiene nada que ver con esto.
function weekStart(date: Date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

// ⚠️ Auditoría 2026-09-23 (RES-6): esto era un `toLocaleTimeString` SIN
// `timeZone`, es decir, la hora del NAVEGADOR — mientras todo lo que hay a su
// alrededor en este fichero (y el resto del panel) usa `horaEstudio`, que
// formatea con `TZ_ESTUDIO`. Con un navegador fuera de Madrid, los avisos de
// conflicto («la sala ya está ocupada: 10:00–11:00») y el registro de actividad
// por reasignación decían una hora distinta de la que pinta la propia tarjeta
// de la clase. Misma familia que R-3: se delega en la única fuente de verdad.
const formatHora = horaEstudio;

function localDate(d: Date | string): string {
  const dt = typeof d === 'string' ? new Date(d) : d;
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
}

// R-3 (auditoría 22-sep): `new Date('YYYY-MM-DDTHH:MM:00')` se interpreta en la
// zona del NAVEGADOR — una propietaria que crea/edita desde fuera de
// Europe/Madrid desplaza toda la sesión. `fecha`/`hora` ya llegan como cadenas
// sin ambigüedad (del input o de `localDate`, que solo extrae el día — no hay
// bug ahí); lo que había que anclar era la CONVERSIÓN a instante. Mismo
// mecanismo que ya usa serie-horario.ts para editar series.
function toISO(fecha: string, hora: string) {
  return horaParedAInstante(fecha, hora, TZ_ESTUDIO).toISOString();
}

// "Repite como la semana pasada": busca la sesión de la MISMA sala+tipo de
// clase exactamente 7 días después (match por timestamp exacto, no por "día
// de semana + hora" reconstruido a mano — evita el error de reglas de DST).
// Puntual, no en lote: un clic, una semana. Si falla (sin bono/llena/
// duplicada), lo dice la RPC de reservar_plaza vía addReserva — no se
// duplica esa validación aquí.
function buscarSesionSemanaSiguiente(
  sesiones: Sesion[],
  actual: Pick<Sesion, 'inicio' | 'salaId' | 'tipoClaseId'>,
): Sesion | null {
  const objetivo = new Date(actual.inicio).getTime() + 7 * 24 * 60 * 60 * 1000;
  return sesiones.find(s =>
    !s.cancelada &&
    s.salaId === actual.salaId &&
    s.tipoClaseId === actual.tipoClaseId &&
    new Date(s.inicio).getTime() === objetivo,
  ) ?? null;
}

// ─── SesionEnriquecida local type ─────────────────────────────────────────────
// Sigue viva: toda la lógica de formulario/edición/conflictos (existentesSlot,
// detectarConflictos, cobertura...) necesita ver TODO el estudio, no solo lo
// que el rol ve renderizado — igual que antes del rediseño.

interface SesionEnr {
  id: string;
  inicio: string;
  fin: string;
  cancelada: boolean;
  aforoMaximo: number;
  tipoClaseId: string;
  salaId: string;
  instructorId: string;
  notas: string | null;
  precioPuntual: number | null;
  serieId?: string | null;
  incidenciaTexto?: string | null;
  tipoClase: { nombre: string; color: string };
  sala: { nombre: string };
  instructor: { nombre: string };
  confirmadas: number;
  asistidas: number;
  reservadoIds: string[];
}

// ─── FormData ─────────────────────────────────────────────────────────────────

type FormData = {
  tipoClaseId: string;
  salaId: string;
  instructorId: string;
  fecha: string;
  horaInicio: string;
  horaFin: string;
  aforoMaximo: number;
  aforoTocado?: boolean;
  notas: string;
};

// ─── RecurringFormData ────────────────────────────────────────────────────────

type RecurringFormData = {
  tipoClaseId: string;
  instructorId: string;
  salaId: string;
  horaInicio: string;
  duracion: number;
  diasSemana: number[];
  fechaInicio: string;
  fechaFin: string;
  aforoMaximo: number;
  aforoTocado?: boolean;
  /** Igual que `aforoTocado`: si la propietaria ya escribió una duración a
   *  mano, cambiar de tipo de clase no se la pisa. */
  duracionTocada?: boolean;
};

const BOTON_VENTANA = 'flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground';

/** «jueves 1 oct»: de un instante, en hora del estudio; de un día del calendario (`Date` local), tal cual. */
const FORMATO_DIA_CORTO = new Intl.DateTimeFormat('es-ES', { weekday: 'long', day: 'numeric', month: 'short', timeZone: TZ_ESTUDIO });
const FORMATO_DIA_CORTO_LOCAL = new Intl.DateTimeFormat('es-ES', { weekday: 'long', day: 'numeric', month: 'short' });
function diaCorto(fecha: Date | string): string {
  const p = (typeof fecha === 'string' ? FORMATO_DIA_CORTO : FORMATO_DIA_CORTO_LOCAL).formatToParts(new Date(fecha));
  const de = (t: string) => p.find(x => x.type === t)?.value ?? '';
  return `${de('weekday')} ${de('day')} ${de('month').replace('.', '')}`;
}
/** «1 – 7 oct», o «28 sep – 4 oct» si la semana cambia de mes. */
const FORMATO_MES_CORTO = new Intl.DateTimeFormat('es-ES', { month: 'short' });
const FORMATO_MES_LARGO = new Intl.DateTimeFormat('es-ES', { month: 'long' });
function rangoCorto(desde: Date, hasta: Date): string {
  const mes = (d: Date) => FORMATO_MES_CORTO.format(d).replace('.', '');
  return desde.getMonth() === hasta.getMonth()
    ? `${desde.getDate()} – ${hasta.getDate()} ${mes(hasta)}`
    : `${desde.getDate()} ${mes(desde)} – ${hasta.getDate()} ${mes(hasta)}`;
}

// ─── ModalClasesRecurrentes ───────────────────────────────────────────────────

function ModalClasesRecurrentes({
  open, onClose, tiposClase, instructores, salas, onCrear, sesionesExistentes, ausencias = [], initial, studio,
}: {
  open: boolean;
  onClose: () => void;
  tiposClase: TipoClase[];
  /** Para decir qué pasa al llenarse con la lista de espera que se aplica de verdad. */
  studio: Studio | null;
  instructores: { id: string; nombre: string }[];
  ausencias?: AusenciaInstructora[];
  salas: { id: string; nombre: string; capacidad: number }[];
  onCrear: (sesiones: Omit<Sesion, 'id' | 'studioId'>[]) => void;
  sesionesExistentes: SlotSesion[];
  /** "Duplicar serie": arranca con los valores derivados de la serie de
   *  origen en vez de los defaults en blanco. Sigue siendo editable — es
   *  solo el punto de partida, no un valor fijo. */
  initial?: RecurringFormData;
}) {
  const uid = useId();
  // Solo se programa con tipos activos (un archivado lo rechaza la base de datos).
  const programables = tiposParaProgramar(tiposClase);

  // Las dos fechas por defecto se calculan DENTRO de emptyForm(), no en el
  // cuerpo del componente: así solo se leen cuando el formulario se crea o se
  // reinicia (al abrir el diálogo), en vez de en cada render. Antes, además de
  // ser impuro, significaba que el diálogo abierto a las 23:59 proponía el día
  // de ayer si el usuario tardaba un minuto en pulsar.
  const emptyForm = (): RecurringFormData => initial ?? {
    tipoClaseId: programables[0]?.id ?? '',
    instructorId: instructores[0]?.id ?? '',
    salaId: salas[0]?.id ?? '',
    horaInicio: '10:00',
    // La duración del TIPO de clase, no un 60 fijo. El aforo ya se heredaba de
    // la sala y de `aforoPorDefecto`; la duración era la única que se ignoraba,
    // así que un estudio con clases de 50 min programaba el trimestre entero a
    // 60 y se le solapaban las salas.
    duracion: programables[0]?.duracionMinutos ?? 60,
    diasSemana: [1, 3],
    // Día del ESTUDIO, no de UTC: entre las 00:00 y las 02:00 de Madrid,
    // `toISOString()` proponía el día anterior.
    fechaInicio: hoyEnEstudio(),
    fechaFin: masDias(hoyEnEstudio(), 30),
    aforoMaximo: aforoPorDefectoDeSesion(programables[0]?.aforoPorDefecto, salas[0]?.capacidad),
  };

  const [form, setForm] = useState<RecurringFormData>(emptyForm);
  // «Duplicar serie» de un tipo archivado: se enseña lo que trae, sin dejar crearla.
  const tipoArchivado = estaArchivado(tiposClase.find(t => t.id === form.tipoClaseId));
  const duracionInvalida = !form.duracion || form.duracion < 15;
  // Un <input type="time"> que se borra da '': sin esto el generador de abajo
  // pedía `.toISOString()` de una fecha inválida DURANTE EL RENDER y la pantalla
  // entera caía (Sentry JAVASCRIPT-NEXTJS-30).
  const horaInvalida = !esHoraHHMM(form.horaInicio);

  // Al abrir, el formulario vuelve a estar vacío. Ajuste en render, no efecto:
  // con efecto el diálogo aparecía un frame con lo que se escribió la vez
  // anterior y se limpiaba después.
  const [abiertoPrevio, setAbiertoPrevio] = useState(open);
  if (open !== abiertoPrevio) {
    setAbiertoPrevio(open);
    if (open) setForm(emptyForm());
  }

  function toggleDia(day: number) {
    setForm(f => ({
      ...f,
      diasSemana: f.diasSemana.includes(day)
        ? f.diasSemana.filter(d => d !== day)
        : [...f.diasSemana, day],
    }));
  }

  const sesionesGeneradas = useMemo<Omit<Sesion, 'id' | 'studioId'>[]>(() => {
    if (!form.fechaInicio || !form.fechaFin || form.diasSemana.length === 0 || horaInvalida) return [];
    const start = new Date(form.fechaInicio + 'T00:00:00');
    const end = new Date(form.fechaFin + 'T00:00:00');
    if (start > end) return [];
    const out: Omit<Sesion, 'id' | 'studioId'>[] = [];
    const cursor = new Date(start);
    while (cursor <= end) {
      if (form.diasSemana.includes(cursor.getDay())) {
        const dateStr = localDate(cursor);
        // R-3: mismo bug que crearSesion — anclar a la hora de Madrid, no a
        // la del navegador. `fin` no necesita el mismo tratamiento: es
        // `inicio` + una duración fija en ms, ajena a la zona.
        const inicio = horaParedAInstante(dateStr, form.horaInicio, TZ_ESTUDIO);
        const fin = new Date(inicio.getTime() + form.duracion * 60000);
        out.push({
          tipoClaseId: form.tipoClaseId,
          instructorId: form.instructorId,
          salaId: form.salaId,
          inicio: inicio.toISOString(),
          fin: fin.toISOString(),
          aforoMaximo: form.aforoMaximo,
          cancelada: false,
          notas: null,
          precioPuntual: null,
        });
      }
      cursor.setDate(cursor.getDate() + 1);
    }
    return out;
  }, [form, horaInvalida]);

  const estimatedCount = sesionesGeneradas.length;

  const conflictosCount = useMemo(() =>
    sesionesGeneradas.filter(s => hayConflicto(detectarConflictos(
      { salaId: s.salaId, instructorId: s.instructorId, inicio: s.inicio, fin: s.fin },
      sesionesExistentes,
    ))).length,
    [sesionesGeneradas, sesionesExistentes]
  );

  function handleSubmit() {
    if (sesionesGeneradas.length === 0) return;
    onCrear(sesionesGeneradas);
  }

  // Con el dedo los campos van a 16 px: por debajo, iOS amplía la página al
  // enfocarlos. Con ratón, los 14 px de siempre. `min-w-0` porque en Safari un
  // `<input type="date">` puede medir su ancho natural aunque lleve `w-full`.
  const f2 = 'w-full min-w-0 border border-border rounded-xl px-3.5 py-2.5 text-base pointer-fine:text-sm focus:border-foreground focus:outline-none text-foreground';
  const s2 = 'w-full min-w-0 border border-border rounded-xl px-3.5 py-2.5 text-base pointer-fine:text-sm focus:border-foreground focus:outline-none text-foreground bg-card appearance-none';

  return (
    <Dialog open={open} onOpenChange={o => !o && onClose()}>
      {/* En el móvil este diálogo iba de borde a borde de la pantalla: su
          `max-w-lg` pisaba el `max-w` del DialogContent base, que es el que deja
          1rem de margen a cada lado. `sm:max-w-lg` lo aplica solo donde cabe.
          Y «Crear» estaba al final del formulario, a dos pantallas de scroll:
          ahora la cabecera y los botones se quedan quietos y lo que se desplaza
          es el formulario. */}
      <DialogContent className="sm:max-w-lg max-h-[calc(100dvh-2rem)] sm:max-h-[90vh] flex flex-col gap-0 overflow-hidden p-0">
        <DialogHeader className="shrink-0 px-5 pt-5 pb-3 pr-12">
          <DialogTitle className="text-lg font-semibold text-foreground">Nueva clase fija</DialogTitle>
          <p className="text-sm text-muted-foreground mt-0.5 text-pretty">
            Se crea en tu horario cada semana, los días y a la hora que elijas. Tus clientas pueden quedarse fijas en
            ella: se la das tú o te la piden desde su app.
          </p>
        </DialogHeader>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pt-1 pb-4 space-y-4">
          <FormField
            label="Tipo de clase"
            description={tipoArchivado ? 'Este tipo está archivado: ya no se programan clases nuevas suyas. Elige otro, o recupéralo en Configuración.' : undefined}
          >
            <select className={s2} value={form.tipoClaseId} onChange={e => {
              const tipoClaseId = e.target.value;
              const tc = tiposClase.find(x => x.id === tipoClaseId);
              setForm(f => ({
                ...f,
                tipoClaseId,
                // Mismo criterio que el cambio de sala de abajo: si ya tocó el
                // aforo a mano, se respeta.
                aforoMaximo: f.aforoTocado
                  ? f.aforoMaximo
                  : aforoPorDefectoDeSesion(tc?.aforoPorDefecto, salas.find(x => x.id === f.salaId)?.capacidad, f.aforoMaximo),
                duracion: f.duracionTocada ? f.duracion : (tc?.duracionMinutos ?? f.duracion),
              }));
            }}>
              {tiposParaProgramar(tiposClase, form.tipoClaseId).map(t => (
                <option key={t.id} value={t.id} disabled={estaArchivado(t)}>{t.nombre}{estaArchivado(t) ? ' · archivado' : ''}</option>
              ))}
            </select>
          </FormField>
          <FormField label="Instructora">
            <select className={s2} value={form.instructorId} onChange={e => setForm(f => ({ ...f, instructorId: e.target.value }))}>
              {instructores.map(i => { const au = ausenciaEnFecha(ausencias, i.id, form.fechaInicio || new Date()); return <option key={i.id} value={i.id}>{i.nombre}{sufijoAusencia(au)}</option>; })}
            </select>
          </FormField>
          <FormField label="Sala">
            <select className={s2} value={form.salaId} onChange={e => {
              const salaId = e.target.value;
              const cap = salas.find(x => x.id === salaId)?.capacidad;
              setForm(f => ({
                ...f,
                salaId,
                aforoMaximo: f.aforoTocado
                  ? f.aforoMaximo
                  : aforoPorDefectoDeSesion(tiposClase.find(x => x.id === f.tipoClaseId)?.aforoPorDefecto, cap, f.aforoMaximo),
              }));
            }}>
              {salas.map(s => <option key={s.id} value={s.id}>{s.nombre}</option>)}
            </select>
          </FormField>
          {/* P2 (auditoría de producto): las 4 rejillas de 2 columnas de este
              fichero eran `grid-cols-2` fijo sin `sm:` — este modal es
              `max-w-lg` y el panel lateral de crear/editar clase es `w-full`
              por debajo de `lg` (components/ui/dashboard-drawer.tsx), así que
              a 375px cramaba dos campos de formulario en ~170px cada uno. */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <FormField label="Hora inicio">
              <input type="time" className={f2} aria-invalid={horaInvalida} value={form.horaInicio} onChange={e => setForm(f => ({ ...f, horaInicio: e.target.value }))} />
            </FormField>
            <FormField label="Duración (min)">
              <input type="number" min={15} max={300} step={5} className={f2}
                aria-invalid={duracionInvalida}
                value={form.duracion || ''}
                onChange={e => {
                  const bruto = e.target.value;
                  if (bruto === '') { setForm(f => ({ ...f, duracion: 0, duracionTocada: true })); return; }
                  const n = Number(bruto);
                  setForm(f => ({ ...f, duracion: Number.isNaN(n) ? f.duracion : Math.min(300, n), duracionTocada: true }));
                }} />
            </FormField>
            {horaInvalida && (
              <p className="sm:col-span-2 -mt-2 text-xs text-amber-700">Elige la hora de inicio.</p>
            )}
            {duracionInvalida && (
              // `sm:` y no a secas: en el móvil la rejilla tiene UNA columna, y un
              // `col-span-2` le añadía una segunda implícita.
              <p className="sm:col-span-2 -mt-2 text-xs text-amber-700">Mínimo 15 minutos.</p>
            )}
          </div>
          <div className="space-y-1.5">
            <span id={`${uid}-dias`} className="text-xs font-bold text-foreground uppercase tracking-wider">Días de la semana</span>
            <p className="text-xs leading-relaxed text-muted-foreground text-balance">
              Se creará una clase cada semana en estos días, desde la fecha de inicio hasta la de fin.
            </p>
            {/* Con el dedo, los siete en una fila que reparte el ancho (a 320 px
                siguen cabiendo en una); con ratón, los círculos de siempre. */}
            <div role="group" aria-labelledby={`${uid}-dias`} className="grid max-w-sm grid-cols-7 gap-1.5 pointer-fine:flex pointer-fine:items-center pointer-fine:gap-2">
              {DIA_PILLS.map(({ label, nombre, day }) => (
                <DiaPill key={day} label={label} nombre={nombre} active={form.diasSemana.includes(day)} onClick={() => toggleDia(day)} />
              ))}
            </div>
            {form.diasSemana.length === 0 && <p className="text-xs text-destructive">Selecciona al menos un día</p>}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <FormField label="Fecha inicio">
              <input type="date" className={f2} value={form.fechaInicio} onChange={e => setForm(f => ({ ...f, fechaInicio: e.target.value }))} />
            </FormField>
            <FormField label="Fecha fin">
              <input type="date" className={f2} value={form.fechaFin} onChange={e => setForm(f => ({ ...f, fechaFin: e.target.value }))} />
            </FormField>
          </div>
          <FormField label="Aforo máximo" description={fraseAlLlenarse(studio, tiposClase.find(t => t.id === form.tipoClaseId))}>
            <input type="number" min={1} max={300} className={f2} value={form.aforoMaximo}
              onChange={e => setForm(f => ({ ...f, aforoMaximo: Number(e.target.value), aforoTocado: true }))} />
          </FormField>
          <AvisoAforoSala salas={salas} salaId={form.salaId} aforo={form.aforoMaximo} />
          {estimatedCount > 0 && (
            <div className="rounded-xl bg-muted px-4 py-3 flex items-center gap-2">
              <CalendarDays size={15} className="text-muted-foreground shrink-0" />
              <p className="text-sm font-semibold text-foreground">Se crearán <span className="font-bold">{estimatedCount}</span> clases</p>
            </div>
          )}
          {conflictosCount > 0 && (
            <div className="rounded-xl bg-warning/10 border border-warning/30 px-4 py-3 flex items-center gap-2">
              <AlertTriangle size={15} className="text-warning shrink-0" />
              <p className="text-sm font-semibold text-warning">
                {conflictosCount} de estas clases se solapan con la sala o la instructora ya programadas.
              </p>
            </div>
          )}
        </div>
        <div className="shrink-0 flex gap-3 border-t border-border px-5 py-3">
          <button onClick={onClose} className="flex-1 min-h-11 py-2.5 rounded-xl text-sm font-bold border border-border text-muted-foreground hover:bg-muted transition-colors">Cancelar</button>
          <button
            onClick={handleSubmit}
            disabled={form.diasSemana.length === 0 || estimatedCount === 0 || duracionInvalida || horaInvalida || tipoArchivado}
            className="flex-1 min-h-11 py-2.5 rounded-xl text-sm font-bold bg-brand text-brand-foreground hover:brightness-95 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {estimatedCount > 0 ? `Crear ${estimatedCount} clases` : 'Crear clases'}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Datos por rango, desde /api/calendario ──────────────────────────────────
// Separado a propósito de `useStudio()`: ese fetch genérico usa el cliente
// admin y no da forma al payload por rol (punto 6). Esto es SOLO lo que se
// RENDERIZA (rejilla, métricas, franja de decisiones, panel) — todo lo que es
// formulario/edición/conflictos sigue usando el contexto de siempre (más
// abajo), que necesita ver el estudio entero para detectar solapes reales.

interface SustitucionVista {
  id: string; sesionId: string; estado: string; motivo: string | null;
  sustitutaFinalId: string | null; creadoEn: string | null; resueltoEn: string | null;
}

interface DatosVista {
  // Lo nuevo de /api/calendario va opcional: un payload antiguo (o un mock) no lo
  // trae, y entonces la clase no está ni sin cubrir ni floja.
  sesiones: (Sesion & { sustitucionAbierta: boolean; motivoBaja: string | null; sustitucionId: string | null }
    & Partial<Pick<SesionCalendario, 'sustitucionEstado' | 'ausencia' | 'instructoraInactiva' | 'floja'>>)[];
  reservas: import('@/lib/types').Reserva[];
  sustituciones: SustitucionVista[];
  salas: import('@/lib/types').Sala[];
  instructores: import('@/lib/types').Instructor[];
  horaApertura: string;
  horaCierre: string;
  horarioSemana: { dia: number; abierto: boolean }[];
  /** false = no se pudieron leer las ausencias: ninguna clase se da por cubierta por ello. */
  ausenciasCargadas?: boolean;
  rol: string;
}

// ─── Main Calendar Page ───────────────────────────────────────────────────────

// RES-8: quien está de baja no se enseña en sus clases futuras.
function instructoraVisible<T extends { activo: boolean; nombre: string }>(
  i: T | null, s: { inicio: string; cancelada: boolean }, ahora: Date,
): T | null {
  if (!i || i.activo || s.cancelada || new Date(s.inicio).getTime() <= ahora.getTime()) return i;
  return { ...i, nombre: ETIQUETA_INSTRUCTORA_NO_DISPONIBLE };
}


export default function Calendario() {
  const {
    sesiones, reservas, socios, spots, tiposClase, salas, instructores,
    suscripciones, planesTarifa, studio, plazasFijas, recuperaciones,
    addSesion, updateSesion, deleteSesion, addSesionesSerie, editarSerieDesde,
    cancelarReservasDeSesiones, cancelarSerieDesde,
    addReserva, cancelarReserva, checkin,
    deshacerCheckin, marcarNoShow, revertirNoShow, liberarSpot, asignarSpot,
    addActividadReciente, marcarCobrado, recibos, resetDatosPilates, dataLoaded, addInstructor,
  } = useStudio();
  const { user } = useAuth();
  // Un solo sistema de toast (antes había dos en paralelo) — con soporte de
  // Deshacer (punto 4), reutilizado por las 6 acciones de la franja.
  // `showToastError`: en rojo y 8 s, para lo que no ha salido (un cobro sin
  // confirmar no puede leerse como un aviso de éxito de 3 s).
  const { message: toastMsg, action: toastAction, variant: toastVariant, show: showToast, showError: showToastError, dismiss: dismissToast } = useToast();

  // Misma traducción de la respuesta que la bandeja de Inicio
  // (`resultadoDecisionReserva`): aprobar puede acabar en lista de espera, y un
  // 409 (ya la resolvió otra persona) también refresca, para que la lista deje
  // de ofrecer los botones. Mientras viaja, Aprobar/Rechazar se apagan; el ref
  // corta el doble toque antes de que React repinte.
  const resolviendoRef = useRef(false);
  const [resolviendoReserva, setResolviendoReserva] = useState<string | null>(null);
  const resolverPendiente = useCallback(async (reservaId: string, aprobar: boolean) => {
    if (resolviendoRef.current) return;
    resolviendoRef.current = true;
    setResolviendoReserva(reservaId);
    try {
      const r = resultadoDecisionReserva(aprobar, await decidirReservaPendiente(reservaId, aprobar));
      showToast(r.mensaje);
      if (r.quitar) {
        invalidarEstadoEstudio();
        resetDatosPilates();
        void refrescarVista();
      }
    } finally {
      resolviendoRef.current = false;
      setResolviendoReserva(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showToast, resetDatosPilates]);

  const rolActual = useRol();
  const gestionaClientas = puedeGestionarClientas(rolActual);
  const mueveDinero = puedeMoverDinero(rolActual);
  // El estudio decide si la instructora crea sus clases (migr 20260914104856).
  const creaClasesPropias = puedeCrearClasesPropias(rolActual, studio?.instructorasCreanClases ?? true);
  const esInstructorTop = rolActual === 'INSTRUCTOR';
  const yoTop = instructores.find(i => i.authUserId === user?.id) ?? null;

  // ── Hydration guard ─────────────────────────────────────────────────────────
  const [mounted, setMounted] = useState(false);

  // ── Vista: Día (por sala) / Semana (7 columnas) / Mes — punto 2 del rediseño ─
  // «Horario» no es un rango de fechas: son las clases que se repiten, por día
  // de la semana (components/calendario/vista-horario.tsx).
  const [vista, setVista] = useState<VistaCalendario>('semana');
  const [semana, setSemana] = useState(() => weekStart(FALLBACK));
  const [diaSeleccionado, setDiaSeleccionado] = useState(() => FALLBACK);

  // `now` vive en estado, no como `new Date()` en el cuerpo del render. Era un
  // objeto nuevo en cada pasada, y está en las dependencias de tres cosas caras
  // (el formulario vacío, el estado por sesión y las tarjetas): recalculaban
  // todas en cada render, incluido uno tan ajeno como abrir un toast.
  // Congelarlo tras montar tampoco vale —es la trampa que ya documenta
  // dashboard/page.tsx— porque la línea roja de "ahora" y los badges EN_CURSO
  // dejarían de moverse en una pestaña que se queda abierta. De ahí el
  // intervalo de un minuto, igual que allí.
  const [now, setNow] = useState(FALLBACK);

  useEffect(() => {
    const today = new Date();
    // ⚠️ El disable va AQUÍ, sobre la llamada, y no encima del `useEffect`: la
    // regla señala la línea del setState, no la del efecto, así que en un
    // efecto multilínea un disable sobre el `useEffect(` no la tapa (pasó en
    // este mismo sitio y se quedó avisando sin que se notara).
    // eslint-disable-next-line react-hooks/set-state-in-effect -- Guarda de hidratación: los tres estados arrancan en FALLBACK (fecha fija) para que servidor y cliente pinten lo mismo, y saltan a la fecha real tras montar. El segundo render es el OBJETIVO; derivarlo en render devolvería `new Date()` en el servidor y rompería la hidratación.
    setMounted(true);
    setSemana(weekStart(today));
    setDiaSeleccionado(today);
    setNow(today);
    const t = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(t);
  }, []);

  // ── Selection ───────────────────────────────────────────────────────────────
  const [sesionId, setSesionId] = useState<string | null>(null);

  // ── Selección múltiple: reasignar varias clases sueltas de una vez ──────────
  // Pedido tras una demo: cambiar la instructora de seis clases sueltas eran
  // seis vueltas de abrir clase → editar → guardar → decidir si avisar. Y esa
  // última decisión, repetida seis veces, es la que acaba en «avisa tú» o en
  // seis correos separados a la misma alumna.
  //
  // No es un modo nuevo del calendario: reutiliza el `onSeleccionar` que ya
  // tenían las dos vistas y solo cambia lo que ese clic significa.
  const [modoSeleccion, setModoSeleccion] = useState(false);
  const [marcadas, setMarcadas] = useState<Set<string>>(new Set());
  const [reasignarLote, setReasignarLote] = useState<{ instructorId: string; nombre: string } | null>(null);
  const [reasignando, setReasignando] = useState(false);

  function salirDeSeleccion() {
    setModoSeleccion(false);
    setMarcadas(new Set());
    setReasignarLote(null);
  }

  function alternarMarcada(id: string) {
    setMarcadas(prev => {
      const s = new Set(prev);
      if (s.has(id)) s.delete(id); else s.add(id);
      return s;
    });
  }
  const [pestanaPanel, setPestanaPanel] = useState<PestanaFicha>('clientas');
  // La ficha del modo mostrador se abre sola con la clase de ahora; si alguien
  // la cierra, se queda cerrada hasta que se abra otra clase a mano.
  const [fichaCerradaAMano, setFichaCerradaAMano] = useState(false);
  // La ficha la abrió el mostrador (nadie la eligió): se cierra sola en cuanto se
  // sale del Día de hoy. Sin esto, al pasar a la Semana en un iPad aparecía como
  // un cajón por encima, tapando la semana.
  // En cuanto alguien la toca (pasando lista, apuntando a alguien) pasa a ser
  // como si la hubiera abierto a mano: ni sigue al reloj ni se cierra sola, para
  // no cambiársela —ni perder las marcas— debajo de los dedos.
  const [abiertaSola, setAbiertaSola] = useState(false);
  // Una cifra de la línea de resumen pulsada: sus clases se resaltan.
  const [filtroResumen, setFiltroResumen] = useState<FiltroResumen | null>(null);

  // ── Modals ──────────────────────────────────────────────────────────────────
  const [showForm, setShowForm] = useState<'nueva' | 'editar' | null>(null);
  // Lo que se pinta en el cajón mientras se cierra: sin esto, al cerrar «Nueva
  // clase» se veía el formulario de editar durante la animación de salida.
  const [modoCajon, setModoCajon] = useState<'nueva' | 'editar'>('nueva');
  if (showForm && showForm !== modoCajon) setModoCajon(showForm);
  // «Nueva clase» es su propio componente, con su estado (teclear ya no vuelve a
  // pintar el calendario entero). La página le da el punto de partida —hueco
  // pulsado, duplicar— y una clave nueva en cada apertura, que lo reinicia.
  const [inicialNueva, setInicialNueva] = useState<InicialNuevaClase | null>(null);
  const [claveNueva, setClaveNueva] = useState(0);
  // Cierres del centro, para que el formulario avise (y una clase que se repite
  // se los salte, como `renovar_serie`). Se piden al abrirlo, no con la página.
  const [cierres, setCierres] = useState<CierreGuardado[] | null>(null);
  // «Nueva clase fija» (la ventana de la clase que se repite): la abren «Clase
  // fija» en «Crear clase», «Duplicar serie», Horario y `?recurrentes=1`.
  const [showRecurrentes, setShowRecurrentes] = useState(false);
  // «Crear clase» pregunta primero qué: una clase de un día o una clase fija. Eran
  // dos botones («Nueva clase» y «Clase recurrente») y los estudios no sabían
  // cuál era la clase fija (quejas del 23-sep). El rediseño del 1-oct lo quitó
  // («un solo Crear clase» directo al formulario) y el fundador lo pidió de vuelta
  // el 2-oct: la pregunta se queda.
  const [elegirQueCrear, setElegirQueCrear] = useState(false);
  // Cuántas clases acaba de crear A MANO quien no tenía ninguna. Su página
  // pública ya tiene algo que enseñar, y ese es el momento de decírselo y de
  // ofrecerle el enlace — antes solo lo veía quien pasaba por la propuesta de
  // horario, y quien montaba su primera clase a mano nunca se enteraba.
  const [primeraClaseCreada, setPrimeraClaseCreada] = useState<number | null>(null);
  const [initialRecurrente, setInitialRecurrente] = useState<RecurringFormData | undefined>(undefined);
  // Atajo «Agrupar con nombre»: qué franjas marcar al abrir el diálogo
  // de Horario justo después de crear la serie que las genera.
  const [preseleccionClaseFija, setPreseleccionClaseFija] = useState<{ serieId: string; diasSemana: number[] } | null>(null);
  // «Buscar sustituta» del ⋯ en una clase CON instructora: enseña la caja de
  // sustituta en su ficha aunque no esté sin cubrir (su instructora no puede).
  const [sustitutaPara, setSustitutaPara] = useState<string | null>(null);
  const [datosSustituta, setDatosSustituta] = useState<{ sesionId: string; datos: DatosSustitutaClase } | null>(null);
  const [errorSustituta, setErrorSustituta] = useState<string | null>(null);
  const [ocupadoSustituta, setOcupadoSustituta] = useState(false);
  const [recargaSustituta, setRecargaSustituta] = useState(0);
  const [ausencias, setAusencias] = useState<AusenciaInstructora[]>([]);
  useEffect(() => { let vivo = true; listarAusencias().then(r => { if (vivo) setAusencias(r); }); return () => { vivo = false; }; }, []);

  // ── Filters (punto 9: sala reduce columnas, instructora atenúa) ─────────────
  const [filtroInstructor, setFiltroInstructor] = useState('');
  const [filtroSala, setFiltroSala] = useState('todas');
  const [busqueda, setBusqueda] = useState('');

  const [guardandoSesion, setGuardandoSesion] = useState(false);
  // No dispara re-render (no hace falta pintar un loading): solo evita que
  // ejecutarPasarLista se re-entre para la misma sesión mientras ya está en curso.
  const pasandoListaRef = useRef<Set<string>>(new Set());
  const [avisoInstructora, setAvisoInstructora] = useState<
    {
      sesionId: string; apuntadas: number; instructora: string;
      datos: { clase: string; cuando: string; sala: string; instructora: string };
      email: { clase: string; fecha: string; hora: string; sala: string; instructora: string; anterior: string };
    } | null
  >(null);
  const [confirmarEspera, setConfirmarEspera] = useState<
    { sesionId: string; socioId: string; nombre: string; posicion: number } | null
  >(null);
  // «Avisar a la alumna» del buscador de «Añadir clienta a la clase». Vive aquí
  // y no dentro del buscador porque el alta puede terminar DESPUÉS de cerrarlo
  // (diálogo de lista de espera, aviso de sin bono): la decisión tiene que
  // llegar hasta `confirmarAddReserva`. Vuelve a marcado cada vez que se abre.
  const [avisarAlumna, setAvisarAlumna] = useState(true);

  // Punto 4: diálogo de confirmación para CUBRIR / OFRECER / AJUSTAR_AFORO.
  const [dialogoAccion, setDialogoAccion] = useState<{ tipo: 'OFRECER' | 'AJUSTAR_AFORO'; sesionId: string } | null>(null);
  // Reporta una incidencia (necesario para que el estado INCIDENCIA sea
  // alcanzable: sin esto, `incidencia_texto` nunca lo pondría nadie).
  const [dialogoIncidencia, setDialogoIncidencia] = useState<{ sesionId: string; texto: string } | null>(null);

  // ── Form ─────────────────────────────────────────────────────────────────────

  // Con un tipo archivado no se programan clases nuevas: el primero por defecto
  // y los selectores de crear salen de aquí.
  const tiposProgramables = useMemo(() => tiposParaProgramar(tiposClase), [tiposClase]);

  const finSegunDuracion = useCallback((horaInicio: string, tipoClaseId: string): string => {
    const dur = tiposClase.find(t => t.id === tipoClaseId)?.duracionMinutos;
    const [h, m] = horaInicio.split(':').map(Number);
    if (!dur || Number.isNaN(h) || Number.isNaN(m)) return horaInicio;
    const total = h * 60 + m + dur;
    if (total >= 24 * 60) return '23:59';
    return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
  }, [tiposClase]);

  const emptyForm = useCallback((): FormData => ({
    tipoClaseId: tiposProgramables[0]?.id ?? '',
    salaId: salas[0]?.id ?? '',
    instructorId: queImparten(instructores)[0]?.id ?? '',
    fecha: diaEnEstudio(now),
    horaInicio: '09:00',
    horaFin: tiposProgramables[0]?.duracionMinutos
      ? `${String(9 + Math.floor(tiposProgramables[0].duracionMinutos / 60)).padStart(2, '0')}:${String(tiposProgramables[0].duracionMinutos % 60).padStart(2, '0')}`
      : '10:00',
    aforoMaximo: aforoPorDefectoDeSesion(tiposProgramables[0]?.aforoPorDefecto, salas[0]?.capacidad),
    notas: '',
  }), [tiposProgramables, salas, instructores, now]);

  const [form, setForm] = useState<FormData>(() => emptyForm());

  const instructoresActivos = useMemo(() => queImparten(instructores), [instructores]);

  const instructoresForm = useMemo(() => {
    const actual = instructores.find(i => i.id === form.instructorId);
    return actual && !actual.activo ? [actual, ...instructoresActivos] : instructoresActivos;
  }, [instructores, instructoresActivos, form.instructorId]);

  // ── Derived data (contexto completo — formularios/conflictos) ───────────────
  const todayStr = diaEnEstudio(now);
  const dias = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(semana, i)), [semana]);
  // Semana progresiva: la columna de una sesión ya NO es su día ISO
  // (lunes=0…domingo=6) — es su offset respecto al primer día de la ventana
  // VISIBLE, que puede ser cualquier weekday. `dias` ya es esa ventana; este
  // mapa evita rehacer aritmética de fechas (con riesgo de DST) en cada sitio
  // que necesita "columna de esta sesión".
  const columnaPorFecha = useMemo(() => new Map(dias.map((d, i) => [localDate(d), i])), [dias]);

  const sesionesEnriquecidas = useMemo<SesionEnr[]>(() => {
    const tiposById = new Map(tiposClase.map(t => [t.id, t]));
    const salasById = new Map(salas.map(x => [x.id, x]));
    const instrById = new Map(instructores.map(i => [i.id, i]));
    const agg = new Map<string, { confirmadas: number; asistidas: number; reservadoIds: string[] }>();
    for (const r of reservas) {
      if (r.estado !== 'CONFIRMADA' && r.estado !== 'ASISTIDA') continue;
      let a = agg.get(r.sesionId);
      if (!a) { a = { confirmadas: 0, asistidas: 0, reservadoIds: [] }; agg.set(r.sesionId, a); }
      a.confirmadas++;
      if (r.estado === 'ASISTIDA') a.asistidas++;
      a.reservadoIds.push(r.socioId);
    }
    return sesiones.map(s => {
      const a = agg.get(s.id);
      return {
        ...s,
        tipoClase: tiposById.get(s.tipoClaseId) ?? { nombre: '?', color: 'var(--muted-foreground)' },
        sala: salasById.get(s.salaId) ?? { nombre: '?' },
        instructor: instrById.get(s.instructorId) ?? { nombre: '?' },
        confirmadas: a?.confirmadas ?? 0,
        asistidas: a?.asistidas ?? 0,
        reservadoIds: a?.reservadoIds ?? [],
      };
    });
  }, [sesiones, reservas, tiposClase, salas, instructores]);

  const sesionActual = sesionesEnriquecidas.find(s => s.id === sesionId) ?? null;

  const reservasActuales = useMemo<ReservaEnriquecida[]>(() =>
    sesionActual
      ? reservas
          .filter(r => r.sesionId === sesionActual.id && r.estado !== 'CANCELADA')
          .map(r => ({
            ...r,
            socio: socios.find(s => s.id === r.socioId) ?? null,
            spot: spots.find(sp => sp.id === r.spotId) ?? null,
          }))
      : [],
    [sesionActual, reservas, socios, spots]
  );

  // Solo para EDITAR: «Nueva clase» calcula lo suyo en su propio componente.
  const editando = showForm === 'editar';
  const horaInvalida = !!(editando && form.horaInicio && form.horaFin && form.horaFin <= form.horaInicio);
  // Un <input type="time"> borrado da '': sin hora no hay clase que guardar (y la
  // conversión a instante lanzaría). Mismo criterio que el formulario de series.
  const horaVacia = !!(editando && (!form.horaInicio || !form.horaFin));

  const faltaConfigurar = useMemo(() => {
    if (!editando) return null;
    // La instructora solo se exige al CREAR. El horario propuesto deja clases
    // «Sin instructora» y, al editar una para cambiarle la sala, el formulario
    // obligaba a elegir instructora antes de dejar guardar (evaluación del
    // 13-sep). Editar guarda el mismo `instructorId` que ya tenía la clase.
    return faltaParaCrearClase({
      tipoClaseId: form.tipoClaseId, salaId: form.salaId, instructorId: form.instructorId,
      hayTipos: tiposClase.length > 0, haySalas: salas.length > 0, hayInstructoras: instructores.length > 0,
      exigeInstructora: false,
    });
  }, [editando, form.tipoClaseId, form.salaId, form.instructorId, tiposClase.length, salas.length, instructores.length]);

  // Con el tipo de clase: «Nueva clase» dice qué clase ocupa el hueco que choca.
  const existentesSlot = useMemo<SlotConTipo[]>(() => sesiones.map(s => ({
    id: s.id, salaId: s.salaId, instructorId: s.instructorId,
    inicio: s.inicio, fin: s.fin, cancelada: s.cancelada, tipoClaseId: s.tipoClaseId,
  })), [sesiones]);

  // ── Buscador rápido (Fase 2): sobre TODO el estudio, no solo `datosVista`,
  // porque estos datos vienen del contexto completo. El filtro de instructora
  // es la red de debajo: desde el retiro de Tentare Core ella no llega aquí.
  const candidatasBusqueda = useMemo<SesionBuscable[]>(() => {
    const tiposById = new Map(tiposClase.map(t => [t.id, t]));
    const salasById = new Map(salas.map(s => [s.id, s]));
    const instrById = new Map(instructores.map(i => [i.id, i]));
    const visibles = esInstructorTop && yoTop ? sesiones.filter(s => s.instructorId === yoTop.id) : sesiones;
    return visibles.map(s => ({
      id: s.id, inicio: s.inicio, cancelada: s.cancelada,
      tipoClaseNombre: tiposById.get(s.tipoClaseId)?.nombre ?? '?',
      salaNombre: salasById.get(s.salaId)?.nombre ?? '?',
      instructorNombre: instrById.get(s.instructorId)?.nombre ?? '?',
    }));
  }, [sesiones, tiposClase, salas, instructores, esInstructorTop, yoTop]);

  function saltarAClase(id: string) {
    const s = sesiones.find(x => x.id === id);
    if (!s) return;
    const inicio = new Date(s.inicio);
    setDiaSeleccionado(inicio);
    // Nunca `weekStart(inicio)` a secas: saltar a una clase de mañana dejaba la
    // semana empezando mañana y hoy se caía de la vista. Ver semana-visible.ts.
    setSemana(prev => semanaQueMuestra(inicio, prev, new Date()));
    setVista('dia');
    setSesionId(id);
    setAbiertaSola(false);
    setFichaCerradaAMano(false);
    setPestanaPanel('clientas');
  }

  // ── Enlace directo a una clase: /calendario?sesion=<id> ─────────────────────
  // Lo usa «Hoy en el estudio» (la home) para llevar a la ficha de la clase en
  // vez de duplicar aquí sus acciones —buscar sustituta, pasar lista, resolver
  // una incidencia—, que ya viven en el panel lateral. Es exactamente lo mismo
  // que hace el buscador rápido: `saltarAClase`, no un camino nuevo.
  //
  // Se lee de window.location y no con useSearchParams para no suspender el
  // árbol (mismo motivo que en el resto de pantallas del panel). Y se espera a
  // que `sesiones` tenga la clase: el contexto tarda en cargar y sin esa espera
  // el salto se perdía en silencio en la primera visita.
  const saltoPendiente = useRef<string | null>(null);
  useEffect(() => {
    saltoPendiente.current = new URLSearchParams(window.location.search).get('sesion');
  }, []);
  useEffect(() => {
    const id = saltoPendiente.current;
    if (!id || !sesiones.some(x => x.id === id)) return;
    saltoPendiente.current = null;
    saltarAClase(id);
    // Se limpia la URL para que recargar o compartir el enlace no reabra el
    // panel sobre una clase que quizá ya no exista.
    window.history.replaceState(null, '', window.location.pathname);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `saltarAClase` se redefine en cada render; añadirla dispararía el efecto en bucle. Lo que decide cuándo saltar es la llegada de `sesiones`.
  }, [sesiones]);

  const conflictosForm = useMemo(() => {
    if (!editando || !form.fecha || !form.horaInicio || !form.horaFin) return null;
    const inicio = toISO(form.fecha, form.horaInicio);
    const fin = toISO(form.fecha, form.horaFin);
    if (new Date(fin).getTime() <= new Date(inicio).getTime()) return null;
    const c = detectarConflictos(
      { salaId: form.salaId, instructorId: form.instructorId, inicio, fin },
      existentesSlot,
      sesionId ?? undefined,
    );
    return hayConflicto(c) ? c : null;
  }, [editando, form.fecha, form.horaInicio, form.horaFin, form.salaId, form.instructorId, existentesSlot, sesionId]);

  // Instructora con ausencia vigente ese día (I-1 no lo cubre: una ausencia no
  // es un solape de horario que la BD rechace, así que antes solo se veía
  // como un sufijo de texto en el desplegable, fácil de no ver). Avisa, no
  // bloquea: puede ser una sustitución deliberada.
  const ausenciaInstructorForm = useMemo(() => {
    if (!editando || !form.fecha || !form.instructorId) return null;
    return ausenciaEnFecha(ausencias, form.instructorId, form.fecha);
  }, [editando, form.fecha, form.instructorId, ausencias]);

  // I-2: al editar, cuántas confirmadas quedarían fuera si se baja el aforo.
  const aforoSobrante = useMemo(() => {
    if (showForm !== 'editar' || !sesionActual) return 0;
    return plazasSobrantesTrasAforo(sesionActual.confirmadas, form.aforoMaximo);
  }, [showForm, sesionActual, form.aforoMaximo]);

  const nombreSala = (id: string | null) => salas.find(s => s.id === id)?.nombre ?? 'sala';
  const nombreInstructor = (id: string | null) => instructores.find(i => i.id === id)?.nombre ?? 'instructora';

  // ── Calendar navigation ──────────────────────────────────────────────────────
  function cambiarSemana(delta: number) {
    setSemana(prev => addDays(prev, delta * 7));
  }
  function irAHoy() {
    const hoy = new Date();
    setSemana(weekStart(hoy));
    setDiaSeleccionado(hoy);
    setFichaCerradaAMano(false);
  }
  function cambiarDia(delta: number) {
    setDiaSeleccionado(prev => addDays(prev, delta));
  }
  // El selector de fecha: lleva a ese día sin cambiar de vista (en Semana, a la
  // semana que lo enseña; ver semana-visible.ts).
  function irAFecha(fecha: string) {
    const dia = new Date(`${fecha}T12:00:00`);
    setDiaSeleccionado(dia);
    setSemana(prev => semanaQueMuestra(dia, prev, new Date()));
  }

  // ── Session actions (creación/edición/cancelación — sin cambios de fondo) ───
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('nueva') === '1') {
      openNueva();
      window.history.replaceState({}, '', '/calendario');
    } else if (params.get('recurrentes') === '1') {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setInitialRecurrente(undefined);
      setShowRecurrentes(true);
      window.history.replaceState({}, '', '/calendario');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Abre «Nueva clase» con este punto de partida. La clave nueva reinicia el
  // formulario (su estado es suyo), y los cierres se piden la primera vez.
  function abrirNueva(inicial: InicialNuevaClase) {
    setInicialNueva(inicial);
    setClaveNueva(k => k + 1);
    setShowForm('nueva');
    if (cierres === null && studio?.id) {
      // `null` = no se han podido leer: se vuelve a intentar la próxima vez.
      void dbListCierres(studio.id).then(r => { if (r) setCierres(r); });
    }
  }

  function openNueva(prefillFecha?: string, prefillHoraInicio?: string, prefillSalaId?: string) {
    const base = emptyForm();
    // Hoy en hora del ESTUDIO y con el reloj de este momento: abierta al montar
    // (`?nueva=1`), `now` todavía era la fecha fija de hidratación.
    const fecha = prefillFecha ?? hoyEnEstudio();
    const horaInicio = prefillHoraInicio ?? base.horaInicio;
    // La duración del tipo, desplazada al hueco donde se hizo clic.
    const horaFin = finConDuracion(horaInicio, tiposClase.find(t => t.id === base.tipoClaseId)?.duracionMinutos || 60) ?? base.horaFin;
    const inicio = toISO(fecha, horaInicio);
    const fin = toISO(fecha, horaFin);
    const salaId = prefillSalaId ?? elegirLibre(salas.map(s => s.id), 'salaId', inicio, fin, existentesSlot);
    abrirNueva({
      tipoClaseId: base.tipoClaseId,
      fecha,
      horaInicio,
      horaFin,
      salaId,
      // Una instructora crea SU clase: fijada a sí misma, no se le ofrece
      // elegir (la RLS de la 20260731100000 la rechazaría igual si lo hiciera).
      instructorId: esInstructorTop && yoTop ? yoTop.id : elegirLibre(instructoresActivos.map(i => i.id), 'instructorId', inicio, fin, existentesSlot, ausencias),
      aforoMaximo: aforoPorDefectoDeSesion(
        tiposClase.find(t => t.id === base.tipoClaseId)?.aforoPorDefecto,
        salas.find(s => s.id === salaId)?.capacidad,
        base.aforoMaximo,
      ),
      notas: '',
    });
  }

  function openEdit() {
    if (!sesionActual) return;
    const ini = new Date(sesionActual.inicio);
    const fin = new Date(sesionActual.fin);
    setForm({
      tipoClaseId: sesionActual.tipoClaseId,
      salaId: sesionActual.salaId,
      instructorId: sesionActual.instructorId,
      // R-3: hay que extraer fecha/hora en la MISMA zona (Madrid) con la que
      // `toISO` las recombina al guardar — con `getHours()`/`localDate`
      // (zona del navegador) no cambiar nada en el formulario desplazaba la
      // sesión igual que el bug original, solo que al revés.
      fecha: fechaLocalDe(ini),
      horaInicio: horaEstudio(ini),
      horaFin: horaEstudio(fin),
      aforoMaximo: sesionActual.aforoMaximo,
      notas: sesionActual.notas ?? '',
    });
    setShowForm('editar');
  }

  // Duplicar: mismo tipo/sala/instructora/aforo, +7 días (nunca el mismo
  // instante — chocaría consigo misma). Nace como clase suelta: sin notas
  // (son de la instancia de origen, no de la plantilla) y sin precio puntual
  // ni serie (el formulario de nueva clase no lleva esos campos).
  function openDuplicar(origen: SesionEnr) {
    const ini = new Date(origen.inicio);
    const fin = new Date(origen.fin);
    abrirNueva({
      tipoClaseId: origen.tipoClaseId,
      salaId: origen.salaId,
      instructorId: origen.instructorId,
      // R-3: mismo motivo que openEdit — extraer en zona de Madrid, la misma
      // que usa `toISO` al recombinar.
      fecha: fechaLocalDe(addDays(ini, 7)),
      horaInicio: horaEstudio(ini),
      horaFin: horaEstudio(fin),
      aforoMaximo: origen.aforoMaximo,
      notas: '',
    });
  }

  // Duplicar la SERIE completa (no una instancia suelta): deriva
  // día(s)/hora/tipo/sala/instructora del tramo FUTURO de la serie de origen
  // (mismo criterio que editarSerieDesde — una serie puede tener un tramo
  // pasado con otra configuración) y abre el modal de recurrentes ya
  // relleno. La copia es una serie totalmente independiente (mismo criterio
  // que "Duplicar" de una instancia no vincula a la original) — se genera
  // desde cero con addSesionesSerie, sin RPC ni tabla nueva.
  function openDuplicarSerie(origen: SesionEnr) {
    if (!origen.serieId) return;
    const futuras = sesionesEnriquecidas.filter(s => s.serieId === origen.serieId && s.inicio >= origen.inicio);
    if (futuras.length === 0) return;

    const diasSemana = [...new Set(futuras.map(s => franjaLocalDe(s.inicio).dow))];
    const ultimaFecha = futuras.reduce((max, s) => (s.inicio > max ? s.inicio : max), futuras[0].inicio);
    const inicioCopia = addDays(new Date(ultimaFecha), 1);
    const nSemanas = Math.max(1, Math.ceil((new Date(ultimaFecha).getTime() - new Date(origen.inicio).getTime()) / (7 * 24 * 3600_000)) + 1);
    const finCopia = addDays(inicioCopia, nSemanas * 7 - 1);

    const ini = new Date(origen.inicio);
    const fin = new Date(origen.fin);
    setInitialRecurrente({
      tipoClaseId: origen.tipoClaseId,
      instructorId: origen.instructorId,
      salaId: origen.salaId,
      // R-3: mismo motivo que openEdit — extraer en zona de Madrid.
      horaInicio: horaEstudio(ini),
      duracion: Math.round((fin.getTime() - ini.getTime()) / 60_000),
      diasSemana,
      fechaInicio: fechaLocalDe(inicioCopia),
      fechaFin: fechaLocalDe(finCopia),
      aforoMaximo: origen.aforoMaximo,
    });
    setShowRecurrentes(true);
  }

  // Compartido por crearSesion() y crearClasesRecurrentes(): invalida el
  // caché de TODAS las semanas que toque una serie (no solo la primera —
  // una serie de varias semanas dejaba el resto con datos obsoletos si ya
  // se habían visitado antes) y navega a la semana de la primera clase si
  // no es la que se está viendo ahora mismo. Llamar a refrescarVista() aquí
  // mismo pediría el rango ANTERIOR a este cambio de semana (React no
  // re-renderiza síncronamente) — por eso solo se invalida caché y se deja
  // que el efecto de claveVista dispare el fetch correcto tras el
  // setSemana; si no navegamos, el caller es responsable de refrescar la
  // vista actual.
  /**
   * Borra del caché TODA ventana que contenga alguna de estas fechas.
   *
   * Se extrae de `invalidarCacheSerieYNavegarSiHaceFalta` para poder usarla sin
   * navegar: mover una clase tiene que invalidar el día de ORIGEN y el de
   * DESTINO, pero no debe llevarte de viaje a otra semana por haberla
   * arrastrado.
   */
  function invalidarCacheDeFechas(fechas: Date[]) {
    for (const [clave] of cacheVistaRef.current) {
      const [desdeIso, hastaIso] = clave.split('_');
      const desdeMs = new Date(desdeIso).getTime();
      const hastaMs = new Date(hastaIso).getTime();
      const tocaAlgunaFecha = fechas.some(f => f.getTime() >= desdeMs && f.getTime() < hastaMs);
      if (tocaAlgunaFecha) cacheVistaRef.current.delete(clave);
    }
  }

  function invalidarCacheSerieYNavegarSiHaceFalta(fechas: Date[]): { navego: boolean } {
    if (fechas.length === 0) return { navego: false };
    // Semana progresiva: ya no hay una partición fija de 7-en-7 días que
    // garantice que cada fecha caiga en EXACTAMENTE una entrada cacheada —
    // el usuario puede haber visitado ventanas que se solapan (p. ej.
    // [3-9 ago] y luego, tras pulsar Hoy otro día, [5-11 ago]), y una fecha
    // nueva puede caer dentro de varias a la vez. Se borra cualquier
    // entrada cuyo rango [desde,hasta) contenga alguna fecha tocada — el
    // caché nunca tiene más de un puñado de entradas vivas, así que esto no
    // es caro.
    invalidarCacheDeFechas(fechas);
    // "¿la primera fecha cae dentro de la ventana visible?" — antes era
    // "¿su weekStart coincide con `semana`?", que dejó de ser equivalente en
    // cuanto weekStart dejó de redondear a lunes (dos fechas de la MISMA
    // ventana progresiva ya no comparten weekStart salvo que una de ellas
    // sea justo el primer día). Sin este cambio, crear una clase el jueves
    // con la ventana abierta en miércoles (ambos en la misma semana visible)
    // disparaba una navegación innecesaria.
    const primera = fechas[0];
    const dentroDeLaVentana = dias.some(d => localDate(d) === localDate(primera));
    if (!dentroDeLaVentana) setSemana(prev => semanaQueMuestra(primera, prev, new Date()));
    return { navego: !dentroDeLaVentana };
  }

  // Crea lo que «Nueva clase» ha dejado listo: una clase, o una serie con las
  // fechas que no chocan. Escribe primero (`addSesion`/`addSesionesSerie` solo
  // pintan lo que la base de datos aceptó) y solo entonces lo anuncia. Una serie
  // entra en UN insert: o se crean todas o ninguna, nunca media.
  async function crearClases(nuevas: SesionNueva[], saltadas: string[]): Promise<ResultadoEscritura> {
    if (nuevas.length === 0) return { ok: false, error: 'No hay ninguna fecha libre que crear.' };
    const eraLaPrimera = sinNingunaClase;
    const res = nuevas.length > 1 ? await addSesionesSerie(nuevas) : await addSesion(nuevas[0]);
    if (!res.ok) return res;

    if (nuevas.length > 1) invalidarHorario();
    const { navego: otraSemana } = invalidarCacheSerieYNavegarSiHaceFalta(nuevas.map(s => new Date(s.inicio)));
    if (!otraSemana) void refrescarVista();
    setDiaSeleccionado(new Date(`${diaEnEstudio(nuevas[0].inicio)}T12:00:00`));

    const cuantas = nuevas.length > 1 ? `Serie creada · ${nuevas.length} clases` : 'Clase creada';
    const saltos = saltadas.length === 0 ? ''
      : ` · ${saltadas.length === 1 ? 'se ha saltado el' : 'se han saltado:'} ${saltadas.slice(0, 3).join(', ')}${saltadas.length > 3 ? ` y ${saltadas.length - 3} más` : ''}`;
    const texto = `${cuantas}${saltos}${otraSemana ? ' — te llevo a esa semana' : ''}`;
    // Una clase que se repite es una clase fija: es el momento de ofrecer que las
    // clientas se queden fijas en ella (lo que hacía la ventana «Nueva clase fija»,
    // que ya no es el camino de «Crear clase»).
    const serieId = 'serieId' in res && typeof res.serieId === 'string' ? res.serieId : null;
    if (nuevas.length > 1 && serieId && puedeGestionarCalendario(rolActual)) {
      const diasSemana = [...new Set(nuevas.map(x => franjaLocalDe(x.inicio).dow))];
      showToast(texto, {
        texto: 'Agrupar con nombre',
        onClick: () => { setVista('horario'); setPreseleccionClaseFija({ serieId, diasSemana }); },
      });
    } else {
      showToast(texto);
    }
    setShowForm(null);
    if (eraLaPrimera && studio?.slug) setPrimeraClaseCreada(nuevas.length);
    return res;
  }

  function cuantasApuntadas(id: string): number {
    return reservas.filter(r => r.sesionId === id && r.estado === 'CONFIRMADA').length;
  }

  // Plazas fijas ancladas al slot de esta clase (día/hora/sala, mismo criterio
  // que el cron). Por el SLOT y no por las reservas 'res-pf-' de la sesión:
  // si la ocurrencia de esta semana no se materializó (sin aforo, cancelada
  // por la socia, plaza de hace menos de una noche) no habría reserva y el
  // aviso se callaría con plaza. Mover UNA clase no mueve la plaza fija —es
  // una excepción puntual, la plaza sigue anclada a su día/hora— y eso
  // conviene decirlo antes de que la propietaria suelte el bloque.
  function cuantasPlazasFijasEnSlot(sesion: SesionSlot): number {
    return plazasFijas.filter(pf => (pf.estado === 'ACTIVA' || pf.estado === 'PAUSADA') && sesionEncajaEnPlaza(pf, sesion)).length;
  }

  function avisoPlazaFijaNoSeMueve(n: number): string {
    return `${n === 1 ? 'Una clienta tiene plaza fija' : `${n} clientas tienen plaza fija`} a esta hora. Solo se mueve esta clase: la plaza fija sigue anclada a su día y hora de siempre. Para cambiar el horario fijo, edita la serie o la plaza fija desde la ficha de la clienta.`;
  }

  async function avisarCambioInstructora(aviso: NonNullable<typeof avisoInstructora>) {
    showToast('Avisando…');
    const r = await avisarCambioClaseServidor(aviso.sesionId, {
      clase: aviso.datos.clase, cuando: aviso.datos.cuando, sala: aviso.datos.sala,
      instructora: aviso.datos.instructora, instructorActual: aviso.datos.instructora,
      fecha: aviso.email.fecha, hora: aviso.email.hora, instructorAnterior: aviso.email.anterior,
    });
    if (!r) { showToast('No se ha podido avisar. Inténtalo otra vez.'); return; }

    const faltan = r.sinEmail > 0 ? ` · ${r.sinEmail} sin email guardado` : '';
    if (r.enviados > 0) {
      showToast(`Avisada${r.enviados !== 1 ? 's' : ''} ${r.enviados} clienta${r.enviados !== 1 ? 's' : ''} por email${faltan}`);
    } else if (r.enApp > 0) {
      showToast(`Aviso puesto en la app${faltan}`);
    } else {
      showToast('No se ha podido avisar. Inténtalo otra vez.');
    }
  }

  // ── Reasignar en lote ──────────────────────────────────────────────────────
  //
  // ⚠️ Lo que se agrupa es la DECISIÓN de avisar, no los correos. El endpoint
  // resuelve destinatarias por sesión en servidor, así que se le llama una vez
  // por clase movida y quien esté en dos recibe dos avisos — que es correcto:
  // son dos clases suyas cambiando, no un mensaje repetido. Lo que se ahorra es
  // contestar «¿aviso a las apuntadas?» una vez por clase.
  function loteReasignable(instructorId: string) {
    const candidatas = sesionesEnriquecidas.filter(x => marcadas.has(x.id));
    // Ya empezada no se puede editar (misma regla que el botón Editar), y una
    // clase que YA la da esa instructora no es un cambio: contarla inflaría el
    // «vas a mover N clases» con clases que no se mueven.
    const mueven = candidatas.filter(x =>
      !sesionYaEmpezada(x.inicio) && !x.cancelada && x.instructorId !== instructorId);
    const descartadas = candidatas.length - mueven.length;
    // Una alumna apuntada a tres de las clases del lote cuenta UNA vez.
    const alumnas = new Set<string>();
    for (const x of mueven) {
      for (const r of reservas) {
        if (r.sesionId === x.id && r.estado === 'CONFIRMADA' && r.socioId) alumnas.add(r.socioId);
      }
    }
    return { mueven, descartadas, alumnas: alumnas.size };
  }

  async function aplicarReasignacionLote(instructorId: string, avisar: boolean) {
    if (reasignando) return;
    const { mueven } = loteReasignable(instructorId);
    if (mueven.length === 0) { setReasignarLote(null); return; }
    setReasignando(true);
    try {
      const nueva = nombreInstructor(instructorId);
      let hechas = 0;
      const fallos: string[] = [];
      for (const ses of mueven) {
        const anterior = nombreInstructor(ses.instructorId);
        const guardado = await updateSesion(ses.id, { instructorId });
        if (!guardado.ok) { fallos.push(guardado.error); continue; }
        hechas++;
        addActividadReciente(
          'SESION_REASIGNADA',
          `Clase de ${ses.tipoClase.nombre} (${formatHora(ses.inicio)}) reasignada: ${anterior} → ${nueva}`,
        );
        if (!avisar) continue;
        const d = new Date(ses.inicio);
        await avisarCambioClaseServidor(ses.id, {
          clase: ses.tipoClase.nombre, cuando: cuandoEstudio(d),
          sala: salas.find(x => x.id === ses.salaId)?.nombre ?? '',
          instructora: nueva, instructorActual: nueva,
          fecha: fechaLargaEstudio(d), hora: horaEstudio(d), instructorAnterior: anterior,
        });
      }
      // Se cuenta lo que de verdad se guardó, no lo que se intentó: decir
      // «6 clases» cuando dos fallaron es justo la escritura optimista que
      // este repo no se permite en ningún sitio.
      if (fallos.length) {
        showToast(`${hechas} de ${mueven.length} clases pasadas a ${nueva}. ${fallos.length} no se pudieron cambiar.`);
      } else {
        showToast(`${hechas} clase${hechas === 1 ? '' : 's'} ${hechas === 1 ? 'pasada' : 'pasadas'} a ${nueva}${avisar ? ' · alumnas avisadas' : ''}`);
      }
      salirDeSeleccion();
      void refrescarVista();
    } finally {
      setReasignando(false);
    }
  }

  async function avisarCambioHorarioSala(
    sesionId: string,
    datos: {
      clase: string; cuando: string; d: Date; sala: string;
      instructora: string; instructorActual: string; instructorAnterior?: string;
    },
    opts: { cambioHora: boolean; cambioSala: boolean },
  ) {
    await avisarCambioClaseServidor(sesionId, {
      clase: datos.clase, cuando: datos.cuando, sala: datos.sala,
      instructora: datos.instructora, instructorActual: datos.instructorActual,
      fecha: fechaLargaEstudio(datos.d), hora: horaEstudio(datos.d), instructorAnterior: datos.instructorAnterior ?? '',
      cambioHora: opts.cambioHora, cambioSala: opts.cambioSala,
    });
  }

  async function editarSesion() {
    if (!sesionId || horaInvalida || horaVacia || guardandoSesion) return;
    if (sesionActual && sesionYaEmpezada(sesionActual.inicio)) {
      showToast(MENSAJE_CLASE_YA_EMPEZADA);
      return;
    }
    setGuardandoSesion(true);
    try {
    const nuevoInicio = toISO(form.fecha, form.horaInicio);
    const mismoInstante = (a: string, b: string) => new Date(a).getTime() === new Date(b).getTime();
    const cambioHora = !!sesionActual && !mismoInstante(sesionActual.inicio, nuevoInicio);
    if (cambioHora && sesionYaEmpezada(nuevoInicio)) { showToast(MENSAJE_HORA_PASADA); return; }
    const cambioSala = !!sesionActual && sesionActual.salaId !== form.salaId;
    const cambioInstructora = !!sesionActual && sesionActual.instructorId !== form.instructorId;
    const guardado = await updateSesion(sesionId, {
      tipoClaseId: form.tipoClaseId,
      salaId: form.salaId,
      instructorId: form.instructorId,
      inicio: nuevoInicio,
      fin: toISO(form.fecha, form.horaFin),
      aforoMaximo: form.aforoMaximo,
      notas: form.notas || null,
    });
    if (!guardado.ok) { showToast(guardado.error); return; }
    const apuntadas = cuantasApuntadas(sesionId);

    if (sesionActual && (cambioHora || cambioSala || cambioInstructora)) {
      const d = new Date(nuevoInicio);
      const cuando = cuandoEstudio(d);
      const clase = tiposClase.find(t => t.id === form.tipoClaseId)?.nombre ?? sesionActual.tipoClase.nombre;
      const sala = salas.find(s => s.id === form.salaId)?.nombre ?? '';
      const instructora = cambioInstructora ? (instructores.find(x => x.id === form.instructorId)?.nombre ?? '') : '';
      const datos = { clase, cuando, sala, instructora };

      if (cambioInstructora && !cambioHora && !cambioSala) {
        setAvisoInstructora({
          sesionId, apuntadas, instructora, datos,
          email: {
            clase, sala, instructora,
            fecha: fechaLargaEstudio(d), hora: horaEstudio(d),
            anterior: nombreInstructor(sesionActual.instructorId),
          },
        });
      } else {
        void avisarCambioHorarioSala(
          sesionId,
          {
            clase, cuando, d, sala,
            instructora,
            instructorActual: instructores.find(x => x.id === form.instructorId)?.nombre ?? nombreInstructor(sesionActual.instructorId),
            instructorAnterior: cambioInstructora ? nombreInstructor(sesionActual.instructorId) : undefined,
          },
          { cambioHora, cambioSala },
        );
      }
    }
    setShowForm(null);
    showToast('Clase actualizada');
    void refrescarVista();
    } finally {
      setGuardandoSesion(false);
    }
  }


  // Las clases que tocaría «Guardar esta y las siguientes»: la clase abierta y las
  // siguientes de su serie. Una sola definición para la vista previa, el recuento
  // del toast y los avisos.
  function tramoDeLaSerie() {
    const base = sesionesEnriquecidas.find(x => x.id === sesionId);
    if (!base?.serieId) return [];
    return sesionesEnriquecidas.filter(s => s.serieId === base.serieId && s.inicio >= base.inicio);
  }

  function edicionDelFormulario(): EdicionDeSerie {
    return {
      tipoClaseId: form.tipoClaseId, salaId: form.salaId, instructorId: form.instructorId,
      aforoMaximo: form.aforoMaximo, horaInicio: form.horaInicio, horaFin: form.horaFin,
      notas: form.notas || null,
    };
  }

  // «Guardar esta y las siguientes» ya no guarda al pulsarlo: primero enseña qué va
  // a pasar (a cuántas alumnas se avisa, plazas fijas, lista de espera…) y guarda
  // al confirmar. Los datos son los mismos que ya tiene el panel en pantalla.
  const [impactoSerie, setImpactoSerie] = useState<{ impacto: ImpactoEdicionSerie; cambios: CambioVisible[]; desdeTexto: string } | null>(null);
  // Editar «esta y las siguientes» pone la hora nueva también a esta: si es la
  // de hoy y esa hora ya pasó, quedaría en el pasado con sus reservas (y el cron
  // de plantones las daría por no venidas). Las siguientes son de otras semanas.
  function serieAlPasado(): boolean {
    const base = sesionesEnriquecidas.find(x => x.id === sesionId);
    if (!base || sesionYaEmpezada(base.inicio)) return false;
    return sesionYaEmpezada(toISO(diaEnEstudio(base.inicio), form.horaInicio));
  }

  function pedirConfirmacionSerie() {
    if (!sesionId || horaInvalida || horaVacia || guardandoSesion) return;
    const base = sesionesEnriquecidas.find(x => x.id === sesionId);
    if (!base) return;
    if (serieAlPasado()) { showToast(MENSAJE_HORA_PASADA); return; }
    const edicion = edicionDelFormulario();
    const impacto = calcularImpactoEdicionSerie({
      tramo: tramoDeLaSerie(), edicion, reservas, plazasFijas, recuperaciones,
    });
    const cambios: CambioVisible[] = [];
    if (impacto.cambian.hora > 0) cambios.push({ etiqueta: 'Hora', desde: `${horaEstudio(new Date(base.inicio))}–${horaEstudio(new Date(base.fin))}`, a: `${form.horaInicio}–${form.horaFin}` });
    if (impacto.cambian.sala > 0) cambios.push({ etiqueta: 'Sala', desde: nombreSala(base.salaId), a: nombreSala(form.salaId) });
    if (impacto.cambian.instructora > 0) cambios.push({ etiqueta: 'Instructora', desde: nombreInstructor(base.instructorId), a: nombreInstructor(form.instructorId) });
    if (impacto.cambian.tipo > 0) cambios.push({ etiqueta: 'Tipo de clase', desde: base.tipoClase.nombre, a: tiposClase.find(t => t.id === form.tipoClaseId)?.nombre ?? '' });
    if (impacto.cambian.aforo > 0) cambios.push({ etiqueta: 'Aforo', desde: String(base.aforoMaximo), a: String(form.aforoMaximo) });
    if (impacto.cambian.notas > 0) cambios.push({ etiqueta: 'Notas', desde: '', a: form.notas ? 'se actualizan' : 'se quitan' });
    setImpactoSerie({
      impacto, cambios,
      desdeTexto: fechaLargaEstudio(new Date(impacto.primeraISO ?? base.inicio)),
    });
  }

  async function editarSerie() {
    if (!sesionId || horaInvalida || horaVacia || guardandoSesion) return;
    // Otra vez al confirmar: entre pedir la confirmación y darle pueden pasar minutos.
    if (serieAlPasado()) { showToast(MENSAJE_HORA_PASADA); return; }
    setGuardandoSesion(true);
    try {
    // Se calcula ANTES de guardar: es lo que había, no lo que queda.
    const tramo = tramoDeLaSerie();
    const n = tramo.length;
    const evaluadas = cambiosPorClase(tramo, edicionDelFormulario());
    const guardado = await editarSerieDesde(sesionId, {
      tipoClaseId: form.tipoClaseId,
      salaId: form.salaId,
      instructorId: form.instructorId,
      aforoMaximo: form.aforoMaximo,
      notas: form.notas || null,
      horaInicio: form.horaInicio,
      horaFin: form.horaFin,
    });
    if (!guardado.ok) { showToast(guardado.error); return; }
    invalidarHorario();
    if (guardado.count != null && guardado.count !== n) {
      Sentry.captureMessage('[calendario] editar_serie_desde: filas afectadas no coinciden con las esperadas', {
        level: 'warning', tags: { area: 'calendario', tipo: 'conflicto_edicion' },
        extra: { sesionId, esperadas: n, afectadas: guardado.count },
      });
      showToast(`Serie actualizada · ${guardado.count} de ${n} clases (alguien más tocó la serie mientras editabas — revisa el calendario)`);
      setShowForm(null);
      void refrescarVista();
      return;
    }
    const base = sesionesEnriquecidas.find(x => x.id === sesionId);
    if (base?.serieId) {
      const clase = tiposClase.find(t => t.id === form.tipoClaseId)?.nombre ?? base.tipoClase.nombre;
      const salaNombre = salas.find(s => s.id === form.salaId)?.nombre ?? '';
      const nuevaInstructora = nombreInstructor(form.instructorId);
      // Se juntan TODAS las clases que cambian y se avisa una sola vez: antes
      // el bucle llamaba al aviso clase a clase y una alumna con plaza en toda
      // la serie recibía un correo por clase (evaluación del 13-sep). El
      // servidor decide a quién avisar en qué clase (lib/avisos-serie.ts).
      const cambios: CambioClaseSerie[] = [];
      for (const c of evaluadas) {
        // La MISMA función que la vista previa (lib/series-impacto-edicion.ts):
        // compara instantes, no texto (ver el porqué allí), y el cambio de
        // INSTRUCTORA cuenta —antes no estaba y una serie de 12 clases pasada a
        // otra profesora no avisaba a nadie—. La comparación es POR SESIÓN y no
        // contra `base`: dentro de una serie puede haber clases con instructoras
        // distintas (una sustitución puntual), y esas también cambian.
        if (!c.avisa) continue;
        const s = c.sesion;
        // R-3: la fecha local del estudio con la hora nueva (no la del navegador).
        const d = new Date(c.nuevoInicio);
        // Mismos datos que el aviso COMPLETO de una clase suelta, no los de
        // `avisarClaseModificada`: ese no lleva instructora, así que el correo
        // habría dicho que algo cambió sin decir qué.
        cambios.push({
          sesionId: s.id, inicio: c.nuevoInicio,
          clase, cuando: cuandoEstudio(d), sala: salaNombre,
          instructora: c.instructora ? nuevaInstructora : '',
          instructorActual: nuevaInstructora,
          instructorAnterior: c.instructora ? nombreInstructor(s.instructorId) : undefined,
          fecha: fechaLargaEstudio(d), hora: horaEstudio(d),
          cambioHora: c.hora, cambioSala: c.sala,
        });
      }
      if (cambios.length > 0) void avisarCambioSerieServidor(cambios);
    }
    setShowForm(null);
    showToast(`Serie actualizada · ${n} clases`);
    void refrescarVista();
    } finally {
      setGuardandoSesion(false);
    }
  }

  // P1-3 (auditoría de producto): "Cancelar"/"Eliminar" clase ejecutaban
  // directo — el número de alumnas afectadas solo aparecía en el toast
  // POSTERIOR. Combinado con P0-1 (ya cerrado: "Eliminar" ahora sí devuelve
  // el bono), un clic accidental en la papelera de una clase llena tenía
  // impacto real y solo se descubría después. Confirmación previa con el
  // conteo, mismo componente que ya usa el resto del panel.
  const [confirmCancelar, setConfirmCancelar] = useState(false);
  const [confirmEliminar, setConfirmEliminar] = useState(false);
  const [confirmCancelarSerie, setConfirmCancelarSerie] = useState(false);
  // «Renovar serie»: se guarda la serie y su nombre al abrir, porque el panel
  // de la clase puede cerrarse (o cambiar de clase) con el diálogo abierto.
  const [renovarSerieDe, setRenovarSerieDe] = useState<{ serieId: string; nombre: string } | null>(null);
  const apuntadasSesionActual = reservasActuales.filter(r => r.estado === 'CONFIRMADA' || r.estado === 'ASISTIDA').length;

  // Lo que se llevaría por delante "Cancelar serie": exactamente el mismo
  // tramo que cancela `cancelarSerieDesde` (esta clase y las siguientes de su
  // serie, sin contar las ya canceladas). Se calcula aquí para poder decirlo
  // ANTES en la confirmación, igual que "Cancelar"/"Eliminar" de una suelta.
  const sesionesSerieRestantes = sesionActual?.serieId
    ? sesionesEnriquecidas.filter(s => s.serieId === sesionActual.serieId && s.inicio >= sesionActual.inicio && !s.cancelada && !sesionYaEmpezada(s.inicio))
    : [];
  const idsSerieRestantes = new Set(sesionesSerieRestantes.map(s => s.id));
  const apuntadasSerieRestante = reservas.filter(
    r => idsSerieRestantes.has(r.sesionId) && (r.estado === 'CONFIRMADA' || r.estado === 'ASISTIDA'),
  ).length;

  async function cancelarSesion() {
    if (!sesionId) return;
    const aCancelar = sesionesEnriquecidas.find(s => s.id === sesionId);
    if (aCancelar && sesionYaEmpezada(aCancelar.inicio)) { showToast(MENSAJE_CLASE_DADA); return; }
    const guardado = await updateSesion(sesionId, { cancelada: true });
    if (!guardado.ok) { showToast(guardado.error); return; }
    const sesion = sesionesEnriquecidas.find(s => s.id === sesionId);
    let avisadas = 0;
    let sinAvisar = 0;
    if (sesion) {
      const apuntadas = reservas.filter(r => r.sesionId === sesionId && (r.estado === 'CONFIRMADA' || r.estado === 'ASISTIDA'));
      // Se espera cada envío y se cuenta el resultado real: antes el
      // `.forEach` disparaba enviarEmailCancelacionClase sin await por cada
      // clienta y el toast decía "avisadas" pase lo que pase con el envío.
      const resultados = await Promise.all(apuntadas.map(async r => {
        const socia = socios.find(s => s.id === r.socioId);
        if (!socia?.email) return null;
        // Los datos de la clase los pone el servidor, que ya la ve cancelada.
        return enviarEmailCancelacionClase({ to: socia.email, toName: socia.nombre, sesionId });
      }));
      for (const ok of resultados) {
        if (ok === null) continue; // sin email: no cuenta ni como avisada ni como fallo
        if (ok) avisadas++; else sinAvisar++;
      }
    }
    // Se espera el aviso ANTES de cancelar las reservas: avisarClaseCancelada
    // resuelve destinatarios en servidor filtrando por estado = 'CONFIRMADA',
    // así que cancelarlas primero dejaría el push/in-app sin nadie a quien ir.
    await avisarClaseCancelada(sesionId);
    // La clase no va a ocurrir: sus reservas activas dejan de estarlo. Sin esto
    // quedaban CONFIRMADA apuntando a una sesión cancelada — la socia veía en
    // su portal una plaza "confirmada" para una clase que nunca iba a pasar, y
    // esa reserva fantasma le seguía comiendo el tope de reservas simultáneas
    // del plan. Es el mismo tratamiento que ya recibía
    // cancelar una SERIE; el camino de clase suelta (el habitual) no lo tenía.
    // (El cupo SEMANAL se cuenta en SQL dentro de reservar_plaza, que también
    // excluye las clases canceladas de ese conteo.)
    // Se ESPERA: antes era fire-and-forget y el toast daba por buena la
    // cancelación de las reservas pasara lo que pasara, así que un fallo del
    // UPDATE reintroducía las reservas fantasma sin que nadie se enterara.
    const resReservas = await cancelarReservasDeSesiones([sesionId], 'cancelarSesion');
    setSesionId(null);
    // F-32: si alguna socia no recuperó su sesión de bono, el toast base
    // ("clientas avisadas") ya no puede quedarse tan tranquilo — se añade el
    // mismo aviso que ya usa cancelarReserva (una sola reserva).
    const base = !resReservas.ok
      ? 'Clase cancelada · no hemos podido cancelar sus reservas, recarga la página'
      : sinAvisar > 0
        ? `Clase cancelada · ${avisadas} clienta${avisadas !== 1 ? 's' : ''} avisada${avisadas !== 1 ? 's' : ''} · ${sinAvisar} sin avisar`
        : 'Clase cancelada · clientas avisadas';
    showToast(resReservas.avisoBono ? `${base} · ${resReservas.avisoBono}` : base);
    void refrescarVista();
  }

  // Cancelar la serie entera desde esta clase. `cancelarSerieDesde` ya existía
  // en studio-context (batch atómico + aviso a las socias + cancelación de sus
  // reservas con devolución de bono según la política del estudio) pero no
  // tenía botón: editar serie sí, cancelar serie no, y la única salida era
  // cancelar clase por clase.
  async function cancelarSerie() {
    if (!sesionId) return;
    // El conteo se captura ANTES de escribir: al cerrar el panel el tramo
    // deja de calcularse y el toast se quedaría sin cifra.
    const n = sesionesSerieRestantes.length;
    const res = await cancelarSerieDesde(sesionId);
    setSesionId(null);
    if (!res.ok) { showToast(res.error); return; }
    invalidarHorario();
    // El toast cuenta lo que de verdad salió. Antes decía «clientas avisadas»
    // siempre: `notificarCancelacionSesiones` disparaba los emails sin esperar
    // el resultado, exactamente el fallo que ya se cerró en `cancelarSesion`
    // (clase suelta) y que su gemelo de serie se había quedado sin heredar.
    const avisadas = res.avisadas ?? 0, sinAvisar = res.sinAvisar ?? 0;
    const aviso = sinAvisar > 0
      ? `${avisadas} clienta${avisadas !== 1 ? 's' : ''} avisada${avisadas !== 1 ? 's' : ''} · ${sinAvisar} sin avisar`
      : avisadas > 0 ? 'clientas avisadas' : 'sin clientas a las que avisar';
    const base = `Serie cancelada · ${n} clase${n !== 1 ? 's' : ''} · ${aviso}${res.enApp === false ? ' · sin aviso en la app' : ''}`;
    showToast(res.avisoBono ? `${base} · ${res.avisoBono}` : base);
    void refrescarVista();
  }

  async function eliminarSesion() {
    if (!sesionId) return;
    // Espera a que deleteSesion() termine de verdad (incluye avisar a las
    // socias antes de borrar, y el DELETE real) antes de cerrar el panel y
    // anunciar éxito — antes esto no se esperaba, y con el aviso tardando
    // varios segundos la clase seguía visible en el calendario aunque el
    // toast ya dijera "eliminada".
    const res = await deleteSesion(sesionId);
    if (!res.ok) { showToast(res.error); return; }
    setSesionId(null);
    // F-9 (auditoría 22ª pasada): mismo trato que "Cancelar" — si alguna socia
    // no recuperó su sesión de bono, el toast no puede decir solo "eliminada".
    // Igual que "Cancelar": eliminar también avisa por email e in-app, así que
    // el toast tiene que poder decir que ese aviso no salió.
    const sinAvisar = res.sinAvisar ?? 0;
    const pegas = [
      sinAvisar > 0 ? `${sinAvisar} sin avisar` : null,
      res.enApp === false ? 'sin aviso en la app' : null,
      res.avisoBono ?? null,
    ].filter(Boolean);
    showToast(['Clase eliminada', ...pegas].join(' · '));
    void refrescarVista();
  }

  async function crearClasesRecurrentes(sesionesFields: Omit<Sesion, 'id' | 'studioId'>[]) {
    const eraLaPrimera = sinNingunaClase;
    const res = await addSesionesSerie(sesionesFields);
    if (!res.ok) { showToast(`No se ha creado la serie. ${res.error}`); return; }
    if (eraLaPrimera && studio?.slug) setPrimeraClaseCreada(sesionesFields.length);
    invalidarHorario();
    setShowRecurrentes(false);
    const { navego: otraSemana } = invalidarCacheSerieYNavegarSiHaceFalta(sesionesFields.map(s => new Date(s.inicio)));
    if (!otraSemana) void refrescarVista();
    const cuantas = otraSemana
      ? `Clase fija creada · ${sesionesFields.length} clases — te llevo a esa semana`
      : `Clase fija creada · ${sesionesFields.length} clases`;
    // Crear una serie es justo el momento de ofrecer que las alumnas se
    // apunten solas: antes esto quedaba en dos pasos sin conectar (crear la
    // serie, y por separado ir a armar la clase fija en Horario).
    const serieId = res.serieId;
    if (serieId && puedeGestionarCalendario(rolActual)) {
      const diasSemana = [...new Set(sesionesFields.map(s => franjaLocalDe(s.inicio).dow))];
      showToast(cuantas, {
        texto: 'Agrupar con nombre',
        onClick: () => { setVista('horario'); setPreseleccionClaseFija({ serieId, diasSemana }); },
      });
      return;
    }
    showToast(cuantas);
  }

  function anadirOPreguntarEspera(sesionId: string, socioId: string) {
    const sesion = sesionesEnriquecidas.find(s => s.id === sesionId);
    const { estado, posicionEspera } = decidirReservaNueva(sesion?.aforoMaximo, sesionId, reservas);
    if (estado === 'LISTA_ESPERA') {
      const socio = socios.find(s => s.id === socioId);
      setConfirmarEspera({
        sesionId, socioId,
        nombre: socio ? `${socio.nombre} ${socio.apellidos}`.trim() : 'Esta clienta',
        posicion: posicionEspera ?? 1,
      });
      return;
    }
    void confirmarAddReserva(sesionId, socioId);
  }

  async function confirmarAddReserva(sesionId: string, socioId: string): Promise<boolean> {
    const socio = socios.find(s => s.id === socioId);
    const nombre = socio ? socio.nombre : 'La clienta';
    // Walk-in (pilar 6): si la clase ya ha empezado, quien se añade desde aquí
    // está delante en ese momento — se marca asistencia en el mismo paso en vez
    // de exigir un segundo clic en "Check-in" sobre la fila recién creada.
    const sesion = sesionesEnriquecidas.find(s => s.id === sesionId);
    const esWalkIn = !!sesion && new Date(sesion.inicio) <= now;
    // Se espera el resultado AUTORITATIVO de addReserva (la RPC del servidor),
    // no la estimación del cliente: antes se tostaba "añadida" incondicionalmente
    // aunque el servidor rechazara la reserva (clase ya empezada, tope semanal,
    // sin bono que cubra el tipo de clase) y la plaza nunca llegara a existir.
    const res = await addReserva(sesionId, socioId, undefined, { checkInInmediato: esWalkIn, avisar: avisarAlumna });
    if (!res.ok) {
      showToast(res.error);
      return false;
    }
    // Si recepción decidió no avisarla, el toast lo recuerda: es la única
    // pista de que la alumna no sabe nada de esta reserva.
    const sinAviso = avisarAlumna ? '' : ' · sin avisarla';
    showToast((res.estado === 'LISTA_ESPERA'
      ? `Clase llena — ${nombre} va a lista de espera`
      : esWalkIn
      ? `${nombre} añadida y registrada como asistencia`
      : `${nombre} añadida a la clase`) + sinAviso);
    void refrescarVista();
    return true;
  }

  // La clase suelta es la tarifa PUNTUAL de una sesión que gasta la reserva
  // (lib/reservas/clase-suelta.ts): la MISMA regla que usa el servidor para
  // vender, así que el botón nunca promete un precio que el servidor no cobra.
  // `null`: desde aquí no se puede vender una clase suelta para esta clase.
  const precioSueltaDe = (sesionId: string): number | null => {
    const sesion = sesionesEnriquecidas.find(s => s.id === sesionId);
    return importeDeClaseSuelta(sesion?.precioPuntual ?? null, planDeClaseSuelta(planesTarifa, sesion?.tipoClaseId ?? null));
  };
  // Por qué no se puede cobrar: que lo diga con lo que hay que hacer.
  const sinPrecioSueltaDe = (sesionId: string): { texto: string; aPaquetes: boolean } => {
    const sesion = sesionesEnriquecidas.find(s => s.id === sesionId);
    return motivoSinClaseSuelta(planesTarifa, sesion?.tipoClaseId ?? null, sesion?.precioPuntual);
  };
  // El recibo de la clase suelta de una reserva (`rec-suelta-<reserva>`), si lo tiene.
  const reciboDeSuelta = (reservaId: string) => {
    const id = idReciboDeClaseSuelta(reservaId);
    return id ? recibos.find(r => r.id === id) : undefined;
  };

  // La pantalla decide cobrar con la cartera que tiene en memoria, y puede ser
  // vieja (un bono renovado desde la app o vendido en otro dispositivo). El
  // servidor la lee al reservar y, si ya traía con qué venir, entra con eso: ni
  // se cobra ni se deja recibo.
  const textoYaCubierta = (nombre: string, c: CubiertaPor) => !c.suelta
    ? `${nombre} entra con su ${c.plan}, que ya cubría esta clase: no se le ha cobrado nada`
    : c.suelta.debe == null
      ? `${nombre} entra con la clase suelta que recuperó: no se le cobra otra. Mira en «Quién me debe» si aún debe aquella`
      : c.suelta.debe > 0
        ? `${nombre} entra con la clase suelta que recuperó: no se le cobra otra. Sigue debiendo ${formatEuro(c.suelta.debe)} de aquella, en «Quién me debe»`
        : `${nombre} entra con la clase suelta que recuperó: no se le cobra otra`;
  // Lo que se le dice a recepción si no ha quedado apuntada: si se llegó a
  // vender y no se pudo deshacer, o si ni siquiera se sabe, «no se le ha
  // cobrado nada» no sería verdad del todo.
  const textoSinApuntar = (r: { error: string; queda?: 'recibo' | 'revisar'; sinRespuesta?: boolean }, nombre: string) =>
    r.sinRespuesta ? `No se ha podido confirmar si ${nombre} ha quedado apuntada: mira la clase antes de cobrarle.`
      : r.queda === 'revisar' ? `${r.error} Su clase suelta no se ha podido deshacer: mira la clase y su ficha antes de cobrarle o de borrar nada.`
      : r.queda === 'recibo' ? `${r.error} Ha quedado un recibo pendiente de esta clase suelta que sobra: elimínalo en «Quién me debe».`
      : `${r.error} No se le ha cobrado nada.`;

  // «Cobrar y añadirla» (maqueta aprobada, 1-oct-2026): la clase suelta se
  // cobra en el mostrador de verdad —efectivo, tarjeta o Bizum—.
  //
  // Orden: PRIMERO la plaza y DESPUÉS el cobro. Al reservar, el servidor le
  // vende la clase suelta (la PUNTUAL de una sesión, con su recibo PENDIENTE) y
  // la reserva la gasta bajo su candado; si la plaza no sale, la anula. Así le
  // vale la política de cancelación del estudio, como a un bono (decisión del
  // fundador, 2-oct-2026). Después se cobra ese recibo por el servidor
  // (`marcarCobrado` → `POST /api/cobros/marcar-cobrado`, con el método): un
  // recibo no nace cobrado desde el navegador.
  async function cobrarSueltaYAnadir(sesionId: string, socioId: string, metodo: MetodoSuelta): Promise<boolean> {
    const precio = precioSueltaDe(sesionId);
    if (precio == null || precio <= 0) return false;
    const sesion = sesionesEnriquecidas.find(s => s.id === sesionId);
    const nombre = socios.find(s => s.id === socioId)?.nombre ?? 'La clienta';
    const esWalkIn = !!sesion && new Date(sesion.inicio) <= now;
    const reserva = await addReserva(sesionId, socioId, undefined, {
      checkInInmediato: esWalkIn, avisar: avisarAlumna, claseSuelta: { importeEsperado: precio },
    });
    if (!reserva.ok) { showToastError(textoSinApuntar(reserva, nombre)); void refrescarVista(); return false; }
    void refrescarVista();
    if (reserva.avisoVenta) {
      showToastError(`${reserva.estado === 'LISTA_ESPERA' ? `${nombre} va a la lista de espera` : `${nombre} está en la clase`}, pero ${reserva.avisoVenta}`);
      return true;
    }
    if (reserva.estado === 'LISTA_ESPERA') {
      showToast(`La clase se ha llenado justo ahora: ${nombre} va a la lista de espera, sin cobrarle nada. Si entra, cóbrale la clase en la puerta`);
      return true;
    }
    if (reserva.cubiertaPor) { showToast(textoYaCubierta(nombre, reserva.cubiertaPor)); return true; }
    if (!reserva.venta) {
      showToastError(`${nombre} está en la clase, pero no se ha podido apuntar su clase suelta. Cóbrasela desde Cobros con «Nuevo cobro».`);
      return true;
    }
    const res = await marcarCobrado(reserva.venta.reciboId, metodo);
    const como = metodo === 'EFECTIVO' ? 'en efectivo' : metodo === 'TARJETA' ? 'con tarjeta' : 'por Bizum';
    // `yaEstaba`: un intento anterior la apuntó y su respuesta no llegó; lo
    // que se cobra es la clase suelta de aquel intento.
    const dondeEsta = reserva.yaEstaba ? `${nombre} ya estaba en la clase` : `${nombre} añadida a la clase`;
    if (res.ok && res.yaEstaba) {
      // Otra pestaña (u otro intento) ya la había cobrado: este clic no ha cobrado nada.
      showToast(`Su clase suelta ya estaba cobrada · ${dondeEsta}. No le cobres otra vez`);
    } else if (res.ok) {
      showToast(`${formatEuro(reserva.venta.importe)} cobrados ${como} · ${dondeEsta}`);
    } else if ('cobroRegistrado' in res) {
      // El dinero entró; falta sellar la factura (se reintenta sola).
      showToast(`${formatEuro(reserva.venta.importe)} cobrados ${como} · ${dondeEsta}. ${res.error}`);
    } else {
      // El recibo existe, pendiente: queda en «Quién me debe». En rojo y más
      // rato: recepción puede tener ya el dinero en la mano.
      showToastError(`${dondeEsta}, pero no consta el cobro. ${res.error} El recibo queda pendiente en «Quién me debe».`);
    }
    return true;
  }

  // «Cobrar después»: apuntarla y dejarle el recibo pendiente para cobrarlo en
  // Cobros. Es la misma venta (la clase suelta con su recibo pendiente), así
  // que la política de cancelación le vale igual; si cancela, sigue debiéndola
  // como cualquier compra a crédito.
  async function anadirYCobrarDespues(sesionId: string, socioId: string): Promise<boolean> {
    const precio = precioSueltaDe(sesionId);
    if (precio == null || precio <= 0) return false;
    const sesion = sesionesEnriquecidas.find(s => s.id === sesionId);
    const nombre = socios.find(s => s.id === socioId)?.nombre ?? 'La clienta';
    const esWalkIn = !!sesion && new Date(sesion.inicio) <= now;
    const reserva = await addReserva(sesionId, socioId, undefined, {
      checkInInmediato: esWalkIn, avisar: avisarAlumna, claseSuelta: { importeEsperado: precio },
    });
    if (!reserva.ok) {
      showToastError(reserva.sinRespuesta || reserva.queda ? textoSinApuntar(reserva, nombre) : reserva.error);
      void refrescarVista();
      return false;
    }
    void refrescarVista();
    if (reserva.avisoVenta) {
      showToastError(`${reserva.estado === 'LISTA_ESPERA' ? `${nombre} va a la lista de espera` : `${nombre} está en la clase`}, pero ${reserva.avisoVenta}`);
      return true;
    }
    if (reserva.estado === 'LISTA_ESPERA') {
      showToast(`La clase está llena: ${nombre} va a la lista de espera, sin recibo. Si entra, cóbrale la clase en la puerta`);
      return true;
    }
    if (reserva.cubiertaPor) { showToast(textoYaCubierta(nombre, reserva.cubiertaPor)); return true; }
    if (!reserva.venta) {
      showToastError(`${nombre} está en la clase, pero no se ha podido apuntar su clase suelta. Cóbrasela desde Cobros con «Nuevo cobro».`);
      return true;
    }
    showToast(reserva.yaEstaba
      ? `${nombre} ya estaba en la clase · su recibo de ${formatEuro(reserva.venta.importe)} sigue pendiente en Cobros`
      : `${nombre} añadida · recibo de ${formatEuro(reserva.venta.importe)} pendiente en Cobros`);
    return true;
  }

  // Cortesía: a la clase sin bono y sin cargo. Queda en la actividad para que
  // la propietaria vea quién regaló qué — solo si de verdad entró.
  async function anadirCortesia(sesionId: string, socioId: string) {
    const socio = socios.find(s => s.id === socioId);
    const nombre = socio ? `${socio.nombre} ${socio.apellidos}` : 'La clienta';
    if (await confirmarAddReserva(sesionId, socioId)) {
      addActividadReciente('NUEVA_RESERVA', `Cortesía · ${nombre} añadida sin bono (sin cargo)`, socioId);
    }
  }

  // ── Rediseño: datos de vista (rejilla/métricas/franja/panel) por rango+rol ──
  const [datosVista, setDatosVista] = useState<DatosVista | null>(null);
  // ⚠️ TRES condiciones, y las tres hacen falta para no acusar de vacío a un
  // estudio que no lo está:
  //
  //  · `dataLoaded`: sin él, `sesiones.length === 0` es cierto DURANTE la
  //    carga, y un estudio en marcha vería el bloque un instante antes de que
  //    llegaran sus clases.
  //  · `sesiones` (la lista completa del estudio) y no las de la semana: una
  //    semana sin clases en un estudio en marcha es normal —vacaciones— y ahí
  //    esto sería ruido.
  //  · Y ADEMÁS que la vista actual tampoco traiga ninguna. Es redundante a
  //    propósito: si la lista completa fallara al cargar por cualquier motivo,
  //    `sesiones` quedaría a cero con `dataLoaded` ya en true, y le diríamos
  //    «tu horario está vacío» a alguien que tiene el calendario lleno
  //    delante. Con dos fuentes, para equivocarse tienen que fallar las dos.
  const sinNingunaClase = dataLoaded
    && sesiones.length === 0
    && (datosVista?.sesiones.length ?? 0) === 0;
  const cacheVistaRef = useRef<Map<string, DatosVista>>(new Map());
  // Guarda contra la carrera entre dos fetches de rangos distintos en vuelo a
  // la vez (p. ej. refrescarVista() del rango viejo + el efecto de claveVista
  // para el rango nuevo, disparados casi a la vez al crear una clase que cae
  // en otra semana): solo se aplica la respuesta si su rango sigue siendo el
  // último que se pidió — si no, quien responda último no debería "ganar".
  const ultimaClaveSolicitadaRef = useRef<string>('');

  const rango: RangoFechas = vista === 'dia' ? rangoDia(diaSeleccionado) : rangoSemanaDesde(semana);
  const claveVista = claveRango(rango);

  // P1-2 (auditoría de producto): un fallo de red/500 en la PRIMERA carga
  // dejaba `datosVista` en null para siempre — la pantalla más usada del
  // panel se quedaba en "Cargando…" indistinguible de un cuelgue real, sin
  // botón de reintentar (a diferencia de /centro-de-control, que ya tiene
  // este patrón). Solo se marca error cuando no hay NADA que enseñar
  // todavía: si ya había una vista cargada, una recarga fallida la deja tal
  // cual (silencioso a propósito, mismo criterio de antes) en vez de tapar
  // una rejilla que sigue siendo útil con un error de refresco.
  const [errorCargaVista, setErrorCargaVista] = useState<string | null>(null);

  const cargarDatosVista = useCallback(async (r: RangoFechas) => {
    const clave = claveRango(r);
    ultimaClaveSolicitadaRef.current = clave;
    const cacheado = cacheVistaRef.current.get(clave);
    if (cacheado) { setDatosVista(cacheado); setErrorCargaVista(null); return; }
    setErrorCargaVista(null); // reintento: vuelve a "Cargando…" en vez de dejar el error puesto
    try {
      const res = await fetch(`/api/calendario?desde=${encodeURIComponent(r.desde)}&hasta=${encodeURIComponent(r.hasta)}`, {
        headers: await authHeader(),
      });
      if (!res.ok) {
        // Antes las dos causas decían lo mismo, y encima repetían el título
        // palabra por palabra: «No hemos podido cargar el calendario» arriba y
        // «El servidor no ha podido cargar el calendario» debajo. Dos frases
        // para no decir nada — quien lo lee no sabe si esperar, reintentar o
        // llamar a alguien.
        setDatosVista(prev => {
          if (!prev) setErrorCargaVista(res.status >= 500
            ? 'El servidor ha fallado al responder. Vuelve a intentarlo en un momento.'
            : 'No hemos podido pedir las clases de estos días. Comprueba tu conexión.');
          return prev;
        });
        return;
      }
      const data = (await res.json()) as DatosVista;
      // Defensa ante un payload incompleto (mock de test a medio configurar, o
      // una respuesta real inesperada): sin `sesiones`/`horaApertura` la rejilla
      // reventaría al leer `horaApertura.slice(...)`. Mejor seguir "Cargando…".
      if (!Array.isArray(data?.sesiones) || typeof data?.horaApertura !== 'string') {
        setDatosVista(prev => {
          if (!prev) setErrorCargaVista('La respuesta del servidor llegó incompleta. Reintenta; si sigue igual, avísanos.');
          return prev;
        });
        return;
      }
      cacheVistaRef.current.set(clave, data);
      if (ultimaClaveSolicitadaRef.current !== clave) return; // respuesta obsoleta, se descarta
      setDatosVista(data);
      setErrorCargaVista(null);
    } catch {
      // Sin red: mismo criterio — solo bloquea la pantalla si no hay nada aún.
      setDatosVista(prev => { if (!prev) setErrorCargaVista('No se ha podido conectar. Comprueba tu conexión.'); return prev; });
    }
  }, []);

  useEffect(() => {
    if (!mounted) return;
    void cargarDatosVista(rango);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mounted, claveVista, cargarDatosVista]);

  // Tras cualquier mutación: invalida la caché del rango actual y vuelve a
  // pedirlo — mismo patrón que ya usaba resolverPendiente con resetDatosPilates.
  const refrescarVista = useCallback(async () => {
    cacheVistaRef.current.delete(claveRango(rango));
    await cargarDatosVista(rango);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rango.desde, rango.hasta, cargarDatosVista]);

  // ── Horario fijo: las clases que se repiten ─────────────────────────────────
  // Todas las clases futuras de cada serie, agrupadas en el servidor
  // (`/api/calendario/horario`). Se pide al entrar en la vista «Horario» o al
  // abrir una clase de una serie (para decir hasta cuándo se repite), y se
  // olvida tras cualquier cambio que lo mueva: crear, editar, cancelar o renovar
  // una serie y dar una plaza fija. `versionHorario` descarta la respuesta de
  // una petición que ya estaba en vuelo cuando se olvidó.
  const [horario, setHorario] = useState<HorarioFijo | null>(null);
  const [errorHorario, setErrorHorario] = useState<string | null>(null);
  const [versionHorario, setVersionHorario] = useState(0);
  const necesitaHorario = vista === 'horario' || Boolean(sesionActual?.serieId);
  useEffect(() => {
    if (!mounted || !necesitaHorario || horario) return;
    let vigente = true;
    void pedirHorario().then(h => {
      if (!vigente) return;
      if (h) { setHorario(h); setErrorHorario(null); }
      else setErrorHorario('Comprueba tu conexión y vuelve a intentarlo.');
    });
    return () => { vigente = false; };
  }, [mounted, necesitaHorario, horario, versionHorario]);
  const invalidarHorario = useCallback(() => {
    setHorario(null);
    setErrorHorario(null);
    setVersionHorario(v => v + 1);
  }, []);

  const nombreTipoDe = (id: string) => tiposClase.find(t => t.id === id)?.nombre;
  const nombreSalaDe = (id: string) => salas.find(x => x.id === id)?.nombre;
  // «+ Plaza fija» desde una tarjeta: primero la clienta, luego el mismo
  // diálogo que la ficha, con esa clase ya elegida.
  const [plazaFijaEnTarjeta, setPlazaFijaEnTarjeta] = useState<TarjetaHorario | null>(null);

  function verProximaClase(t: TarjetaHorario) {
    if (sesiones.some(x => x.id === t.proximaSesionId)) { saltarAClase(t.proximaSesionId); return; }
    // Más allá de lo que tiene cargado el panel: al menos se lleva a ese día.
    const inicio = new Date(t.proximaInicio);
    setDiaSeleccionado(inicio);
    setSemana(prev => semanaQueMuestra(inicio, prev, new Date()));
    setVista('dia');
  }

  // Aforo en vivo. Cierra dos agujeros a la vez:
  //
  //  · Lo que ve OTRA gente. Una socia reserva o cancela desde su móvil y esta
  //    rejilla no se enteraba hasta recargar. Igual entre dos ventanas del
  //    propio mostrador.
  //  · Lo que hace UNO MISMO por un camino que se olvidó de refrescar. Esta
  //    pantalla tiene DOS fuentes para el mismo número —`datosVista` (que es lo
  //    que pinta «8/8») y `reservas` del contexto (que es lo que pinta la lista
  //    de asistentes del panel)—, y cada mutación tiene que acordarse de llamar
  //    a `refrescarVista()`. Veinticuatro se acuerdan; `onQuitar` no se acordaba,
  //    y por eso quitar a una alumna la sacaba de la lista y dejaba el contador
  //    en 8/8. Eso se arregla abajo, pero el aviso del servidor lo cubre pase lo
  //    que pase: llega igual aunque el siguiente manejador nuevo vuelva a
  //    olvidarse.
  //
  // No es un sondeo: si nadie toca nada, no se pide nada. Ver
  // `lib/realtime/aforo-en-vivo.ts` para por qué Broadcast y no `postgres_changes`.
  useAforoEnVivo(supabase, {
    studioId: studio?.id,
    alCambiar: () => { void refrescarVista(); },
  });

  // ── Estado derivado por sesión (punto 1) ────────────────────────────────────
  const estadoPorSesion = useMemo(() => {
    const m = new Map<string, EstadoSesion>();
    if (!datosVista) return m;
    for (const s of datosVista.sesiones) {
      const conflicto = hayConflicto(detectarConflictos(
        { salaId: s.salaId, instructorId: s.instructorId, inicio: s.inicio, fin: s.fin },
        existentesSlot, s.id,
      ));
      const confirmadasSinCheckin = datosVista.reservas.filter(r =>
        r.sesionId === s.id && r.estado === 'CONFIRMADA' && !r.checkInEn).length;
      m.set(s.id, estadoSesion(s, now, {
        sustitucionAbierta: s.sustitucionAbierta, conflicto, confirmadasSinCheckin,
        sinCubrir: !!s.ausencia || !!s.instructoraInactiva,
      }));
    }
    return m;
  }, [datosVista, existentesSlot, now]);

  const reservasPorSesion = useMemo(() => {
    const m = new Map<string, import('@/lib/types').Reserva[]>();
    if (!datosVista) return m;
    for (const r of datosVista.reservas) {
      const arr = m.get(r.sesionId) ?? [];
      arr.push(r);
      m.set(r.sesionId, arr);
    }
    return m;
  }, [datosVista]);

  // ── Filtros: la sala reduce; la instructora, la búsqueda y las cifras atenúan ─
  // Atenuar y no esconder: lo que no coincide sigue en su sitio, más apagado, y
  // la semana no cambia de forma al buscar (punto 9 del rediseño anterior, que
  // ahora vale también para «Buscar» y para las cifras del resumen).
  const sesionesVistaFiltradas = useMemo(() => datosVista?.sesiones ?? [], [datosVista]);

  // Solo para decidir si una clase es «futura»: se recalcula al cambiar de datos, no cada segundo.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const ahoraVista = useMemo(() => new Date(), [datosVista]);
  const datosPorSesionId = useMemo(() => {
    const m = new Map<string, DatoSesion>();
    if (!datosVista) return m;
    const tiposById = new Map(tiposClase.map(t => [t.id, t]));
    const instrById = new Map(datosVista.instructores.map(i => [i.id, i]));
    for (const s of sesionesVistaFiltradas) {
      m.set(s.id, {
        sesion: s,
        tipo: tiposById.get(s.tipoClaseId) ?? { id: s.tipoClaseId, studioId: s.studioId, nombre: '?', color: '#999' } as import('@/lib/types').TipoClase,
        // RES-8: una clase futura de quien está de baja no enseña su nombre.
        instructor: instructoraVisible(instrById.get(s.instructorId) ?? null, s, ahoraVista),
        reservasSesion: reservasPorSesion.get(s.id) ?? [],
        estado: estadoPorSesion.get(s.id) ?? 'PROGRAMADA',
      });
    }
    return m;
  }, [sesionesVistaFiltradas, reservasPorSesion, estadoPorSesion, tiposClase, datosVista, ahoraVista]);


  // ── Lo que dice cada clase en la rejilla (una marca) y la línea de cifras ────
  const fijasPorSesion = useMemo(() => {
    const m = new Map<string, number>();
    if (!datosVista) return m;
    for (const r of datosVista.reservas) {
      if ((r.estado === 'CONFIRMADA' || r.estado === 'ASISTIDA') && marcaReserva(r, recuperaciones) === 'fija') {
        m.set(r.sesionId, (m.get(r.sesionId) ?? 0) + 1);
      }
    }
    return m;
  }, [datosVista, recuperaciones]);

  // Las clases que se ven: las del día en Día, las siete columnas en Semana; con la sala filtrada.
  const sesionesALaVista = useMemo(() => sesionesVistaFiltradas.filter(s =>
    (filtroSala === 'todas' || s.salaId === filtroSala)
    && (vista === 'dia' ? diaEnEstudio(s.inicio) === localDate(diaSeleccionado) : columnaPorFecha.has(diaEnEstudio(s.inicio)))),
  [sesionesVistaFiltradas, filtroSala, vista, diaSeleccionado, columnaPorFecha]);

  // «La siguiente» de hoy, la que se anuncia en su tarjeta y en el resumen del Día.
  const siguienteHoyId = useMemo(() => siguienteClase(
    sesionesVistaFiltradas.filter(s => diaEnEstudio(s.inicio) === todayStr),
    now,
  ), [sesionesVistaFiltradas, todayStr, now]);

  const tarjetasPorId = useMemo(() => {
    const m = new Map<string, DatosTarjeta>();
    for (const [id, d] of datosPorSesionId) {
      const s = d.sesion as DatosVista['sesiones'][number];
      const r = d.reservasSesion;
      const apuntadas = r.filter(x => x.estado === 'CONFIRMADA' || x.estado === 'ASISTIDA').length;
      const enEspera = r.filter(x => x.estado === 'LISTA_ESPERA').length;
      const instructora = d.instructor?.nombre ?? 'Sin instructora';
      m.set(id, {
        id, inicio: s.inicio, fin: s.fin, cancelada: s.cancelada,
        tipoNombre: d.tipo.nombre, tipoColor: d.tipo.color || 'var(--muted-foreground)',
        instructora, confirmadas: apuntadas, aforo: s.aforoMaximo, enEspera, estado: d.estado, serie: !!s.serieId,
        marca: marcaDeClase({
          estado: d.estado, inicio: s.inicio, fin: s.fin, instructora: d.instructor?.nombre ?? null,
          sustitucionEstado: s.sustitucionEstado, ausencia: s.ausencia, instructoraInactiva: s.instructoraInactiva,
          incidenciaTexto: s.incidenciaTexto, confirmadas: apuntadas,
          asistidas: r.filter(x => x.estado === 'ASISTIDA').length,
          noVinieron: r.filter(x => x.estado === 'NO_ASISTIO').length,
          enEspera, aforo: s.aforoMaximo, fijas: fijasPorSesion.get(id) ?? 0,
          floja: !!s.floja, esSiguiente: id === siguienteHoyId,
        }, now),
      });
    }
    return m;
  }, [datosPorSesionId, fijasPorSesion, siguienteHoyId, now]);

  const clasesParaResumen = useMemo<ClaseParaResumen[]>(() => {
    const capacidad = new Map(datosVista?.salas.map(x => [x.id, x.capacidad]));
    return sesionesALaVista.map(s => {
      const t = tarjetasPorId.get(s.id);
      return {
        id: s.id, estado: t?.estado ?? 'PROGRAMADA', cancelada: s.cancelada,
        terminada: now.getTime() >= new Date(s.fin).getTime(),
        floja: !!s.floja, enEspera: t?.enEspera ?? 0, confirmadas: t?.confirmadas ?? 0, aforo: s.aforoMaximo,
        sobreaforo: s.aforoMaximo > (capacidad.get(s.salaId) ?? Infinity),
      };
    });
  }, [sesionesALaVista, tarjetasPorId, datosVista, now]);
  const resumen = useMemo(() => resumenDeVista(clasesParaResumen), [clasesParaResumen]);
  // Una cifra que ya no está (se resolvió lo que contaba) deja de resaltar.
  const filtroResumenVivo = filtroResumen && resumen.cifras.some(c => c.filtro === filtroResumen) ? filtroResumen : null;

  const busquedaNormal = busqueda.trim().toLowerCase();
  const atenuadaPorId = useCallback((id: string) => {
    const d = datosPorSesionId.get(id);
    if (!d) return false;
    if (claseAtenuadaPorInstructor(d.sesion.instructorId, filtroInstructor)) return true;
    if (filtroResumenVivo) {
      const c = clasesParaResumen.find(x => x.id === id);
      if (!c || !claseEnFiltro(c, filtroResumenVivo)) return true;
    }
    if (busquedaNormal) {
      const sala = datosVista?.salas.find(x => x.id === d.sesion.salaId)?.nombre ?? '';
      const texto = `${d.tipo.nombre} ${sala} ${d.instructor?.nombre ?? ''}`.toLowerCase();
      if (!texto.includes(busquedaNormal)) return true;
    }
    return false;
  }, [datosPorSesionId, filtroInstructor, filtroResumenVivo, clasesParaResumen, busquedaNormal, datosVista]);

  // ── Columnas (Día por sala / Semana 7 columnas) ─────────────────────────────
  const columnasDia = useMemo(() => {
    if (!datosVista) return [];
    const cols: SesionColumna[] = sesionesVistaFiltradas
      .filter(s => diaEnEstudio(s.inicio) === localDate(diaSeleccionado))
      .map(s => {
        const r = reservasPorSesion.get(s.id) ?? [];
        return {
          id: s.id,
          inicioMin: minutosEnEstudio(s.inicio),
          finMin: minutosEnEstudio(s.fin),
          salaId: s.salaId,
          estado: estadoPorSesion.get(s.id) ?? 'PROGRAMADA',
          confirmadas: r.filter(x => x.estado === 'CONFIRMADA' || x.estado === 'ASISTIDA').length,
          enEspera: r.filter(x => x.estado === 'LISTA_ESPERA').length,
          aforoMaximo: s.aforoMaximo,
          finalizada: now.getTime() >= new Date(s.fin).getTime(),
        };
      });
    return prepararColumnasSalaDia(cols, datosVista.salas, filtroSala);
  }, [datosVista, sesionesVistaFiltradas, diaSeleccionado, reservasPorSesion, estadoPorSesion, filtroSala, now]);

  const columnasSemana = useMemo(() => {
    if (!datosVista) return [];
    const porSala = filtroSala === 'todas' ? sesionesVistaFiltradas : sesionesVistaFiltradas.filter(s => s.salaId === filtroSala);
    const cols: SesionSemana[] = porSala.map(s => {
      const r = reservasPorSesion.get(s.id) ?? [];
      return {
        id: s.id,
        inicioMin: minutosEnEstudio(s.inicio),
        finMin: minutosEnEstudio(s.fin),
        salaId: s.salaId,
        estado: estadoPorSesion.get(s.id) ?? 'PROGRAMADA',
        confirmadas: r.filter(x => x.estado === 'CONFIRMADA' || x.estado === 'ASISTIDA').length,
        enEspera: r.filter(x => x.estado === 'LISTA_ESPERA').length,
        aforoMaximo: s.aforoMaximo,
        dia: columnaPorFecha.get(diaEnEstudio(s.inicio)) ?? 0,
        finalizada: now.getTime() >= new Date(s.fin).getTime(),
      };
    });
    return prepararColumnasDiaSemana(cols, dias, datosVista.horarioSemana);
  }, [datosVista, sesionesVistaFiltradas, reservasPorSesion, estadoPorSesion, filtroSala, now, columnaPorFecha, dias]);

  // ── Móvil: Día y Semana en lista ────────────────────────────────────────────
  // En un teléfono la rejilla de horas no se leía: cabecera, filtros y franja de
  // decisiones se comían ~600 px de 812 y la rejilla quedaba en una tira al fondo,
  // con las clases a 9,5 px. Por debajo de `md` Día y Semana son una lista por
  // hora (components/calendario/vista-agenda.tsx) hecha con las MISMAS columnas
  // que la rejilla, y la página hace scroll entera. Arrastrar se queda en la
  // tablet y el ordenador; en el móvil una clase se mueve desde «Editar».
  const enMovil = useCoincideMedio(CONSULTA_AGENDA);
  // En el ordenador el calendario ocupa justo hasta el fondo de la ventana (ver
  // `useAltoHastaElFondo`): con `calc(100vh - 72px)` la página se desplazaba y
  // la rejilla salía cortada abajo en cuanto había algo más encima.
  const refLienzo = useAltoHastaElFondo<HTMLDivElement>(useCoincideMedio('(min-width: 1024px)'));

  // ── Ventana flotante (solo en un ordenador) ───────────────────────────────
  // «Ampliar a toda la pantalla» ya no vive aquí: es de todo el panel
  // (lib/panel/ampliar.ts) y su botón lo pinta PageHeader junto al título.
  const escritorio = useCoincideMedio(CONSULTA_ESCRITORIO);
  const ventana = useSyncExternalStore(suscribirVentana, estadoVentana, estadoVentanaServidor);
  // Una clase pulsada en la ventana flotante con el Calendario ya abierto: la
  // página no se vuelve a montar, así que `?sesion=` no sirve y avisa con un
  // evento. Sin dependencias a propósito: `saltarAClase` se redefine en cada
  // render y tiene que ser siempre la del render actual.
  useEffect(() => {
    const alSaltar = (e: Event) => {
      const id = (e as CustomEvent<string>).detail;
      if (typeof id === 'string' && id) saltarAClase(id);
    };
    window.addEventListener(EVENTO_SALTAR_A_CLASE, alSaltar);
    return () => window.removeEventListener(EVENTO_SALTAR_A_CLASE, alSaltar);
  });
  const agendaSemana = useMemo<DiaDeAgenda[]>(() => {
    if (!datosVista) return [];
    return agendaDeSemana(columnasSemana, datosVista.salas.map(s => s.id)).flatMap(d => {
      const fecha = dias[d.indice];
      if (!fecha) return [];
      return [{
        clave: localDate(fecha), fecha, esHoy: localDate(fecha) === todayStr, cerrado: d.cerrado,
        sesiones: clasesDeAgenda(d.ids, datosPorSesionId, datosVista.salas),
      }];
    });
  }, [datosVista, columnasSemana, dias, todayStr, datosPorSesionId]);
  const agendaDia = useMemo<DiaDeAgenda[]>(() => {
    if (!datosVista) return [];
    return [{
      clave: localDate(diaSeleccionado), fecha: diaSeleccionado, esHoy: localDate(diaSeleccionado) === todayStr, cerrado: false,
      sesiones: clasesDeAgenda(agendaDeDia(columnasDia), datosPorSesionId, datosVista.salas),
    }];
  }, [datosVista, columnasDia, diaSeleccionado, todayStr, datosPorSesionId]);

  // ⚠️ Una clase que la cabecera cuenta y la rejilla no pinta.
  //
  // Las vistas hacen `datos.get(s.id)` y, si no está, un
  // `return null`: el bloque desaparece SIN decir nada, mientras la cabecera de
  // la columna sigue diciendo «1 clase» porque cuenta el mismo array que el
  // bloque no llegó a pintar. Eso es exactamente lo que se ve en el vídeo del
  // arrastre — y por lectura los dos salen del mismo `sesionesVistaFiltradas`,
  // así que no debería poder pasar.
  //
  // No se «arregla» aquí a base de inventar un dato de relleno: si el mapa no
  // la tiene, pintarla con un tipo de clase falso sería peor. Lo que se quita
  // es el silencio, para que la próxima vez haya por dónde empezar en vez de
  // otro vídeo. Va en un efecto y no en el render: `capturarMensaje` encola, y
  // eso es un efecto secundario.
  useEffect(() => {
    const enColumnas = new Set([
      ...columnasDia.flatMap(c => c.sesiones.map(s => s.id)),
      ...columnasSemana.flatMap(c => c.sesiones.map(s => s.id)),
    ]);
    const huerfanas = [...enColumnas].filter(id => !datosPorSesionId.has(id));
    if (huerfanas.length === 0) return;
    capturarMensaje('[calendario] sesión en columnas pero no en datosPorSesionId', 'error', {
      extra: { ids: huerfanas.slice(0, 5), cuantas: huerfanas.length, enColumnas: enColumnas.size },
    });
  }, [columnasDia, columnasSemana, datosPorSesionId]);

  // El horario del estudio, en minutos. La vista de Día lo ensancha sola si hay
  // una clase antes de abrir o después de cerrar (lib/calendario/escala-dia.ts):
  // los límites de lo que se pinta nunca recortan una clase real.
  const aperturaMin = datosVista ? Number(datosVista.horaApertura.slice(0, 2)) * 60 : 8 * 60;
  const cierreMin = datosVista ? Number(datosVista.horaCierre.slice(0, 2)) * 60 : 22 * 60;

  // ── Las 6 acciones con nombre propio (punto 4) ──────────────────────────────

  // Pasar lista marcando solo a quien NO vino (antes «Pasar lista» daba a TODAS
  // por venidas de un toque). Cada escritura se espera y solo se cuentan —y se
  // deshacen— las que el servidor aceptó.
  async function guardarLista(sesionId: string, plan: { vinieron: string[]; noVinieron: string[] }) {
    if (pasandoListaRef.current.has(sesionId)) return;
    pasandoListaRef.current.add(sesionId);
    try {
      // Uno detrás de otro y con la foto que va dejando el anterior: `checkin`
      // pinta su cambio sobre la lista que recibe, y en paralelo cada uno pisaba
      // el del otro (en pantalla solo quedaba marcada la última).
      let foto = reservas;
      const okVino: string[] = [];
      for (const id of plan.vinieron) {
        const res = await checkin(id, foto);
        if (!res.ok) continue;
        okVino.push(id);
        foto = foto.map(r => (r.id === id ? { ...r, estado: 'ASISTIDA' as const, checkInEn: new Date().toISOString() } : r));
      }
      const okNoVino: string[] = [];
      for (const id of plan.noVinieron) {
        if ((await marcarNoShow(id)).ok) okNoVino.push(id);
      }
      const fallidas = plan.vinieron.length + plan.noVinieron.length - okVino.length - okNoVino.length;
      await refrescarVista();
      if (okVino.length + okNoVino.length === 0) { showToast('No se ha podido pasar lista. Inténtalo de nuevo.'); return; }
      const partes = [
        `${okVino.length} ${okVino.length === 1 ? 'vino' : 'vinieron'}`,
        ...(okNoVino.length ? [`${okNoVino.length} no`] : []),
        ...(fallidas ? [`${fallidas} sin marcar: inténtalo otra vez`] : []),
      ];
      showToast(`Lista pasada · ${partes.join(', ')}`, {
        texto: 'Deshacer',
        onClick: async () => {
          let sinDeshacer = 0;
          for (const id of okVino) if (!(await deshacerCheckin(id)).ok) sinDeshacer++;
          for (const id of okNoVino) if (!(await revertirNoShow(id)).ok) sinDeshacer++;
          await refrescarVista();
          if (sinDeshacer > 0) showToast(`${sinDeshacer} ${sinDeshacer === 1 ? 'no se ha podido deshacer' : 'no se han podido deshacer'}: cámbialas en su fila`);
        },
      });
    } finally {
      pasandoListaRef.current.delete(sesionId);
    }
  }

  // Las acciones de una fila esperan al servidor y dicen si no la aceptó (la
  // RLS, o la reserva ya no estaba como se veía): si no, el botón no hacía nada
  // y nadie sabía por qué.
  function conAviso(accion: (reservaId: string) => Promise<ResultadoEscritura>) {
    return (reservaId: string) => {
      void accion(reservaId).then(res => { if (!res.ok) showToast(res.error); });
    };
  }

  async function repetirSemanaSiguiente(reservaId: string) {
    const r = reservasActuales.find(x => x.id === reservaId);
    if (!r || !sesionActual) return;
    const destino = buscarSesionSemanaSiguiente(sesiones, sesionActual);
    if (!destino) { showToast('No hay clase programada la semana que viene en este mismo horario y sala.'); return; }
    // Sin casilla aquí, y se la avisa: es una clase FUTURA que no ha reservado
    // ella, así que si no se le cuenta no tiene forma de saber que va apuntada
    // (ni de cancelarla a tiempo). Es la regla general de las reservas del
    // mostrador; la casilla solo existe donde la clienta suele estar delante.
    const res = await addReserva(destino.id, r.socioId, undefined, { avisar: true });
    if (!res.ok) { showToast(res.error); return; }
    showToast(res.estado === 'CONFIRMADA' ? 'Añadida a la clase de la semana que viene.' : 'La clase de la semana que viene está llena — añadida a lista de espera.');
  }

  // Atajo pedido tras feedback real de una propietaria en prueba: crear una
  // plaza fija estaba solo en la ficha de la socia (Clientas → ficha →
  // "Plaza fija" → Añadir), sin ningún enlace desde el calendario — nadie la
  // encontraba desde el sitio donde de verdad se decide "esta clienta viene
  // siempre a este hueco". Ancla al slot de la sesión actual (sala/día/hora
  // en local del estudio, mismo criterio que sesionEncajaEnPlaza).
  //
  // Ya no crea en un clic: abre el MISMO diálogo que la ficha, con esta clase y
  // el sitio de esta reserva ya elegidos, para que se vea qué se va a guardar y
  // el resultado sea idéntico venga de donde venga.
  const [plazaFijaDesdeClase, setPlazaFijaDesdeClase] = useState<{ socioId: string; clave: string; spotId: string | null } | null>(null);
  function hacerPlazaFija(reservaId: string) {
    const r = reservasActuales.find(x => x.id === reservaId);
    if (!r || !sesionActual) return;
    setPlazaFijaDesdeClase({ socioId: r.socioId, clave: claveFranjaDeSesion(sesionActual), spotId: r.spotId ?? null });
  }

  function abrirIncidencia(sesionId: string) {
    const actual = datosVista?.sesiones.find(s => s.id === sesionId)?.incidenciaTexto ?? '';
    setDialogoIncidencia({ sesionId, texto: actual ?? '' });
  }

  async function guardarIncidencia() {
    if (!dialogoIncidencia) return;
    const { sesionId, texto } = dialogoIncidencia;
    setDialogoIncidencia(null);
    const guardado = await updateSesion(sesionId, { incidenciaTexto: texto.trim() || null });
    if (!guardado.ok) { showToast(guardado.error); return; }
    await refrescarVista();
    showToast(texto.trim() ? 'Incidencia registrada' : 'Incidencia borrada');
  }

  async function ejecutarResolverIncidencia(sesionId: string) {
    const prevTexto = datosVista?.sesiones.find(s => s.id === sesionId)?.incidenciaTexto ?? null;
    const guardado = await updateSesion(sesionId, { incidenciaTexto: null });
    if (!guardado.ok) { showToast(guardado.error); return; }
    await refrescarVista();
    showToast('Incidencia resuelta', {
      texto: 'Deshacer',
      onClick: async () => {
        const vuelta = await updateSesion(sesionId, { incidenciaTexto: prevTexto });
        if (!vuelta.ok) { showToast(vuelta.error); return; }
        await refrescarVista();
      },
    });
  }

  async function ejecutarOfrecerPlaza(sesionId: string) {
    const res = await fetch('/api/reservas/ofrecer-plaza', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(await authHeader()) },
      body: JSON.stringify({ sesionId }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) { showToast(data?.error ?? 'No se ha podido ofrecer la plaza'); return; }
    setDialogoAccion(null);
    await refrescarVista();
    showToast(data.resultado === 'confirmada' ? 'Plaza confirmada a la siguiente en la lista' : 'Oferta de plaza enviada');
  }

  async function ejecutarAjustarAforo(sesionId: string, nuevoAforo: number) {
    const s = datosVista?.sesiones.find(x => x.id === sesionId);
    const prevAforo = s?.aforoMaximo ?? nuevoAforo;
    const guardado = await updateSesion(sesionId, { aforoMaximo: nuevoAforo });
    if (!guardado.ok) { showToast(guardado.error); return; }
    setDialogoAccion(null);
    await refrescarVista();
    showToast(`Aforo ajustado a ${nuevoAforo}`, {
      texto: 'Deshacer',
      onClick: async () => {
        const vuelta = await updateSesion(sesionId, { aforoMaximo: prevAforo });
        if (!vuelta.ok) { showToast(vuelta.error); return; }
        await refrescarVista();
      },
    });
  }

  // ── Arrastrar y soltar (Fase 2) ──────────────────────────────────────────────
  const [confirmarArrastre, setConfirmarArrastre] = useState<{
    sesionId: string; nuevoSalaId: string; nuevoInicio: string; nuevoFin: string;
    apuntadas: number; plazasFijas: number;
    /** «a las 10:00», o «al jue 8 oct a las 10:00» si cambia de día. */
    destinoTexto: string;
  } | null>(null);

  const arrastrableSesion = useCallback((d: DatoSesion) =>
    !d.sesion.cancelada && !sesionYaEmpezada(d.sesion.inicio) &&
    (!esInstructorTop || (!!yoTop && d.sesion.instructorId === yoTop.id)),
  [esInstructorTop, yoTop]);

  async function ejecutarMoverSesion(sesionId: string, nuevoSalaId: string, nuevoInicio: string, nuevoFin: string) {
    const sesion = sesionesEnriquecidas.find(s => s.id === sesionId);
    if (!sesion) return;
    // Se vuelve a mirar al ejecutar, no solo al soltar: con gente apuntada hay un
    // diálogo de por medio, y mientras está abierto la hora puede pasar (o la
    // clase empezar).
    if (sesionYaEmpezada(sesion.inicio)) { showToast(MENSAJE_CLASE_YA_EMPEZADA); return; }
    if (sesionYaEmpezada(nuevoInicio)) { showToast(MENSAJE_HORA_PASADA); return; }
    const cambioHora = new Date(sesion.inicio).getTime() !== new Date(nuevoInicio).getTime();
    const cambioSala = sesion.salaId !== nuevoSalaId;
    const guardado = await updateSesion(sesionId, { salaId: nuevoSalaId, inicio: nuevoInicio, fin: nuevoFin });
    if (!guardado.ok) { showToast(guardado.error); return; }
    if (cambioHora || cambioSala) {
      const d = new Date(nuevoInicio);
      void avisarCambioHorarioSala(
        sesionId,
        {
          clase: sesion.tipoClase.nombre, cuando: cuandoEstudio(d), d, sala: nombreSala(nuevoSalaId),
          instructora: nombreInstructor(sesion.instructorId), instructorActual: nombreInstructor(sesion.instructorId),
        },
        { cambioHora, cambioSala },
      );
    }
    showToast('Clase movida');
    // ⚠️ El caché de la vista se invalida por FECHAS, no solo por el rango que
    // se está mirando. `refrescarVista()` a secas solo borra la ventana actual,
    // así que la clase movida se quedaba en la caché del día/semana de DESTINO
    // tal y como estaba ANTES: al ir allí, no aparecía —el dato ya era correcto
    // en el servidor, pero se pintaba una copia vieja—. Y hay que invalidar las
    // dos, origen y destino: en el origen para que deje de verse donde ya no
    // está. Mismo mecanismo que ya usaban crear y crear-recurrentes.
    invalidarCacheDeFechas([new Date(sesion.inicio), new Date(nuevoInicio)]);
    void refrescarVista();
  }

  // Mover una clase a un día y una hora (y, en el Día, a otra sala). Lo usan los
  // dos arrastres: el del Día (hora exacta y sala) y el de la Semana por franjas
  // (otro día, a la misma hora). Reutiliza detectarConflictos/hayConflicto —los
  // mismos que el formulario de editar—, no una comprobación nueva.
  function moverSesionA(sesionId: string, destino: { dia: string; inicioMin: number; salaId?: string }) {
    if (guardandoSesion || !datosVista) return;
    const sesion = sesionesEnriquecidas.find(s => s.id === sesionId);
    if (!sesion || sesion.cancelada) return;
    if (esInstructorTop && (!yoTop || sesion.instructorId !== yoTop.id)) return;
    if (sesionYaEmpezada(sesion.inicio)) { showToast(MENSAJE_CLASE_YA_EMPEZADA); return; }

    const horaAperturaMin = Number(datosVista.horaApertura.slice(0, 2)) * 60;
    const horaCierreMin = Number(datosVista.horaCierre.slice(0, 2)) * 60;
    const duracionMin = (new Date(sesion.fin).getTime() - new Date(sesion.inicio).getTime()) / 60000;
    const { inicioMin, finMin } = nuevoHorarioArrastrado(duracionMin, destino.inicioMin);
    if (inicioMin < horaAperturaMin || finMin > horaCierreMin) {
      showToast('Fuera del horario del estudio');
      return;
    }

    // ⚠️ Auditoría 2026-09-25 (RES-7-a): el día es el del ESTUDIO (o el de la
    // columna, que es una fecha de calendario), nunca el del navegador: con el
    // navegador detrás de Madrid, mover una clase de las 10:00 la reprogramaba al
    // día anterior (y avisaba por email a las alumnas).
    const nuevoInicio = toISO(destino.dia, mmA(inicioMin));
    const nuevoFin = toISO(destino.dia, mmA(finMin));
    const nuevoSalaId = destino.salaId ?? sesion.salaId;
    // Por instante, no por texto: `toISO` da «…00.000Z» y la base de datos
    // «…00+00:00», así que comparar las cadenas nunca daba «no se ha movido».
    if (new Date(nuevoInicio).getTime() === new Date(sesion.inicio).getTime() && nuevoSalaId === sesion.salaId) return;
    if (sesionYaEmpezada(nuevoInicio)) { showToast(MENSAJE_HORA_PASADA); return; }

    const conflicto = detectarConflictos(
      { salaId: nuevoSalaId, instructorId: sesion.instructorId, inicio: nuevoInicio, fin: nuevoFin },
      existentesSlot, sesionId,
    );
    if (hayConflicto(conflicto)) {
      showToast(`No se puede: ${nombreSala(nuevoSalaId)} o ${nombreInstructor(sesion.instructorId)} ya tienen clase a esa hora`);
      return;
    }

    const apuntadas = cuantasApuntadas(sesionId);
    const enPlazaFija = cuantasPlazasFijasEnSlot(sesion);
    if (apuntadas > 0) {
      // Un desliz en un iPad no debe reprogramar una clase con gente apuntada
      // y avisarla por email sin confirmación previa — a diferencia del
      // formulario de editar (que ya tiene su propia pausa: el botón Guardar).
      setConfirmarArrastre({
        sesionId, nuevoSalaId, nuevoInicio, nuevoFin, apuntadas,
        plazasFijas: enPlazaFija,
        destinoTexto: destino.dia === diaEnEstudio(sesion.inicio) ? `a las ${mmA(inicioMin)}` : `al ${diaCorto(nuevoInicio)} a las ${mmA(inicioMin)}`,
      });
      return;
    }
    // Sin nadie apuntada no hay diálogo — pero con plaza fija en este slot el
    // aviso tiene que llegar igual, así que va en el toast.
    if (enPlazaFija > 0) showToast(avisoPlazaFijaNoSeMueve(enPlazaFija));
    void ejecutarMoverSesion(sesionId, nuevoSalaId, nuevoInicio, nuevoFin);
  }

  function moverEnElDia(sesionId: string, destino: { salaId: string; inicioMin: number }) {
    const s = sesionesEnriquecidas.find(x => x.id === sesionId);
    if (s) moverSesionA(sesionId, { dia: diaEnEstudio(s.inicio), inicioMin: destino.inicioMin, salaId: destino.salaId });
  }

  function moverAOtroDia(sesionId: string, columna: number) {
    const s = sesionesEnriquecidas.find(x => x.id === sesionId);
    const fecha = dias[columna];
    if (s && fecha) moverSesionA(sesionId, { dia: localDate(fecha), inicioMin: minutosEnEstudio(s.inicio) });
  }

  // Tocar un hueco de la rejilla: «Nueva clase» con el día, la hora (y la sala,
  // en el Día) ya puestos.
  function crearEnElDia(destino: { salaId: string; inicioMin: number }) {
    openNueva(localDate(diaSeleccionado), mmA(destino.inicioMin), destino.salaId);
  }
  function crearEnLaSemana(columna: number, hora: number) {
    const fecha = dias[columna];
    if (fecha) openNueva(localDate(fecha), mmA(hora * 60));
  }

  // ── La fecha de la cabecera (se toca para elegir otro día) ────────────────────
  // En el Día del móvil, la tira ya dice qué día es: la fecha dice el mes
  // («Octubre»), como en la maqueta, y así cabe en la fila con Día · Semana · Horario.
  const etiquetaFecha = vista === 'semana' ? rangoCorto(semana, addDays(semana, 6))
    : enMovil ? capitalizarPrimera(FORMATO_MES_LARGO.format(diaSeleccionado))
    : capitalizarPrimera(diaCorto(diaSeleccionado));
  // Los días con clase, para el punto del selector de fecha (todo el estudio; la
  // instructora, solo los suyos — igual que el buscador).
  const diasConClase = useMemo(() => new Set(
    sesiones.filter(s => !s.cancelada && (!esInstructorTop || (!!yoTop && s.instructorId === yoTop.id))).map(s => diaEnEstudio(s.inicio)),
  ), [sesiones, esInstructorTop, yoTop]);

  // ── Dónde va la ficha de la clase (decisión 5) ───────────────────────────────
  // Al lado de la rejilla, sin taparla, si hay sitio: el Día cabe con la ficha
  // desde 1180 px (un iPad en horizontal); la Semana, desde 1440. Si no, en un
  // cajón por encima, y en el móvil, en una hoja desde abajo.
  const fichaAlLadoDia = useCoincideMedio('(min-width: 1180px)');
  const fichaAlLadoSemana = useCoincideMedio('(min-width: 1440px)');
  const modoFicha: ModoFicha = enMovil ? 'hoja' : (vista === 'dia' ? fichaAlLadoDia : fichaAlLadoSemana) ? 'lateral' : 'cajon';

  // Las herramientas de la cabecera llevan su nombre si caben (con el menú
  // lateral, desde unos 1400 px); si no, solo el icono, con el nombre al pasar.
  const herramientasConNombre = useCoincideMedio('(min-width: 1400px)');
  // La semana con tarjetas de dos líneas si hay ancho; si no (un iPad en
  // vertical), de tres: hora y plazas, clase, y quién la da.
  const semanaAncha = useCoincideMedio('(min-width: 1180px)');

  // El orden de ‹ ›: el de la vista, por hora y por sala.
  const ordenSalas = useMemo(() => new Map((datosVista?.salas ?? []).map((x, i) => [x.id, i])), [datosVista]);
  const ordenClases = useMemo(() => [...sesionesALaVista]
    .sort((a, b) => a.inicio.localeCompare(b.inicio) || (ordenSalas.get(a.salaId) ?? 0) - (ordenSalas.get(b.salaId) ?? 0))
    .map(s => s.id), [sesionesALaVista, ordenSalas]);

  // El modo mostrador: en el Día de hoy, con la ficha al lado, la clase de ahora
  // se abre sola (lib/calendario/mostrador.ts). Ajuste en render, no efecto: con
  // efecto se pintaba un instante la rejilla sin ficha.
  //
  // Sigue al reloj mientras nadie la toque: acaba una clase y pasa a la
  // siguiente. Y cuenta solo las clases que siguen vivas en el contexto, que se
  // entera antes que `datosVista`: si no, al cancelar o borrar la clase de ahora
  // se volvía a abrir esa misma (y tras borrarla, la ficha apuntaba a una clase
  // que ya no existe y el mostrador dejaba de abrirse).
  const esHoyEnDia = vista === 'dia' && localDate(diaSeleccionado) === todayStr;
  const vivasEnContexto = useMemo(() => new Set(sesionesEnriquecidas.filter(s => !s.cancelada).map(s => s.id)), [sesionesEnriquecidas]);
  const claseDeAhora = esHoyEnDia && modoFicha === 'lateral'
    ? claseDelMostrador(sesionesALaVista.filter(s => vivasEnContexto.has(s.id)), now) : null;
  if (claseDeAhora && !fichaCerradaAMano && !modoSeleccion
    && (sesionId === null || (abiertaSola && sesionId !== claseDeAhora))) {
    setSesionId(claseDeAhora);
    setAbiertaSola(true);
  }
  if (abiertaSola && sesionId !== null && (!esHoyEnDia || modoFicha !== 'lateral' || claseDeAhora === null)) {
    setSesionId(null);
    setAbiertaSola(false);
  }

  // ── La Semana por franjas ────────────────────────────────────────────────────
  const clasesFranjas = useMemo<ClaseEnFranja[]>(() => (vista !== 'semana' ? [] : sesionesALaVista.map(s => ({
    id: s.id,
    dia: columnaPorFecha.get(diaEnEstudio(s.inicio)) ?? 0,
    inicioMin: minutosEnEstudio(s.inicio),
    orden: ordenSalas.get(s.salaId) ?? 0,
  }))), [vista, sesionesALaVista, columnaPorFecha, ordenSalas]);
  const resumenDelDia = useCallback((dia: number) => {
    const ids = new Set(clasesFranjas.filter(c => c.dia === dia).map(c => c.id));
    const r = resumenDeVista(clasesParaResumen.filter(c => ids.has(c.id)));
    return { clases: r.clases, ocupacion: r.ocupacion };
  }, [clasesFranjas, clasesParaResumen]);

  function cerrarFicha() {
    const id = sesionId;
    // Al cerrar desde dentro (× o Esc con el teclado), el foco vuelve a su
    // tarjeta: si no, se quedaba en el aire y había que empezar a tabular otra vez.
    const desdeDentro = modoFicha === 'lateral' && !!document.activeElement?.closest('[data-testid="ficha-clase"]');
    setSesionId(null);
    setAbiertaSola(false);
    if (esHoyEnDia) setFichaCerradaAMano(true);
    if (desdeDentro && id) {
      requestAnimationFrame(() => document.querySelector<HTMLElement>(`[role="button"][data-sesion-id="${CSS.escape(id)}"]`)?.focus());
    }
  }
  // Tocar una clase: en «Seleccionar varias» la marca; si no, abre su ficha (o la cierra si ya estaba abierta).
  function abrirClase(id: string) {
    if (modoSeleccion) { alternarMarcada(id); return; }
    if (sesionId === id) { cerrarFicha(); return; }
    setSesionId(id);
    setAbiertaSola(false);
    setPestanaPanel('clientas');
    // Al lado, la ficha va detrás de todas las tarjetas en el orden del
    // teclado: el foco salta a su título, o quien va con el teclado tendría que
    // tabular por todas las clases que quedan para llegar a ella. (El cajón y la
    // hoja son diálogos y ya se llevan el foco.)
    if (modoFicha === 'lateral') {
      requestAnimationFrame(() => document.querySelector<HTMLElement>('[data-testid="ficha-clase"] h2')?.focus({ preventScroll: true }));
    }
  }

  // ── Panel lateral: sesión seleccionada, vista de rol ────────────────────────
  const sesionVista = datosVista?.sesiones.find(s => s.id === sesionId) ?? null;
  const estadoVista = sesionVista ? (estadoPorSesion.get(sesionVista.id) ?? 'PROGRAMADA') : 'PROGRAMADA';

  const nombreClientaResolver = useCallback((socioId: string) => {
    const s = socios.find(x => x.id === socioId);
    return s ? `${s.nombre} ${s.apellidos}` : 'Clienta';
  }, [socios]);

  // ── Ficha clínica / semáforo / IA (sin cambios de fondo, solo reubicados) ──
  const rolCalendario = useRol();
  const verFichaClinica = puedeVerFichaClinica(rolCalendario);
  const verSemaforo = puedeVerSemaforo(rolCalendario);
  const { condicionesSalud, respuestasSesion, registrarRespuestaSesion, cargarFichaClienta } = useStudio();

  // ⚠️ Aquí no es solo que la lista se vea vacía. `registrarRespuestaSesion`
  // decide UPDATE vs INSERT buscando en `respuestasSesion`, y con la lista
  // siempre vacía (#1375 la sacó del arranque y nadie escribió la carga) nunca
  // encuentra la respuesta previa: SIEMPRE inserta. La tabla no tiene índice
  // único, así que corregir la respuesta de una alumna añadía una fila más en
  // vez de corregir la que había.
  useEffect(() => { cargarFichaClienta(); }, [cargarFichaClienta]);
  const esInstructor = rolCalendario === 'INSTRUCTOR';
  const yo = instructores.find(i => i.authUserId === user?.id) ?? null;
  const esPropiaClase = sesionActual ? (!esInstructor || (!!yo && sesionActual.instructorId === yo.id)) : false;

  // Piloto de validación de captura por voz (ver lib/piloto-ficha-viva.ts) —
  // gateado a las instructoras del piloto, no visible al resto.
  const enPiloto = enPilotoVoz(yo?.id);
  const [notaVozSocioId, setNotaVozSocioId] = useState<string | null>(null);
  // (El reset de `notaVozSocioId` al cambiar de sesión vive más abajo, junto al
  // del panel de preparación con IA: los dos vigilaban `sesionId` por separado
  // y ahora son un único ajuste en render.)

  const condicionesPorSocio = useMemo(() => {
    const m = new Map<string, typeof condicionesSalud>();
    if (!verFichaClinica) return m;
    for (const c of condicionesSalud) {
      const arr = m.get(c.socioId) ?? [];
      arr.push(c);
      m.set(c.socioId, arr);
    }
    return m;
  }, [condicionesSalud, verFichaClinica]);

  const nivelSemaforoPorSocio = useMemo(() => {
    const m = new Map<string, ReturnType<typeof semaforo>>();
    if (!verSemaforo) return m;
    const grupos = new Map<string, typeof condicionesSalud>();
    for (const c of condicionesSalud) {
      const arr = grupos.get(c.socioId) ?? [];
      arr.push(c);
      grupos.set(c.socioId, arr);
    }
    for (const [socioId, conds] of grupos) m.set(socioId, semaforo(conds));
    return m;
  }, [condicionesSalud, verSemaforo]);

  const semaforoRecepcion = useSemaforoRecepcion(rolCalendario);
  const semaforoParaMostrar = rolCalendario === 'RECEPCION' ? semaforoRecepcion : nivelSemaforoPorSocio;

  const alertasClase = useMemo(() => {
    if (!verFichaClinica) return [] as string[];
    return reservasActuales
      .filter(r => r.estado === 'CONFIRMADA' || r.estado === 'ASISTIDA')
      .map(r => {
        const conds = condicionesPorSocio.get(r.socioId);
        if (!conds || !r.socio) return null;
        return alertaPreClase(r.socio.nombre, conds, now);
      })
      .filter((a): a is string => a !== null);
    // now (no hoyRef, ver comentario abajo) entra por su string de día: pasar
    // el objeto Date entero recalcularía esto en cada render sin motivo, ya
    // que `now` es una instancia nueva cada vez aunque sea el mismo día.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reservasActuales, condicionesPorSocio, verFichaClinica, todayStr]);

  const respuestaPorSocio = useMemo(() => {
    const m = new Map<string, (typeof respuestasSesion)[number]>();
    if (!sesionActual) return m;
    for (const r of respuestasSesion) {
      if (r.sesionId === sesionActual.id) m.set(r.socioId, r);
    }
    return m;
  }, [respuestasSesion, sesionActual]);

  const [prepIA, setPrepIA] = useState<{ resumen: string; evitar: string[]; variantes: string[] } | null>(null);
  const [prepIALoading, setPrepIALoading] = useState(false);
  const [prepIAError, setPrepIAError] = useState(false);
  // «Añadir» a una clienta o una plaza vendida por ClassPass/USC/Wellhub (solo
  // las plataformas activadas en Conexiones). Lo que se escribe en el buscador
  // vive en `AnadirAClase`, que se reinicia al cambiar de clase (`key`).
  const plataformasActivas = usePlataformasActivas();

  // Al cambiar de sesión (o cerrar el drawer) se limpia todo lo que colgaba de
  // la anterior: el socio de la nota de voz y el panel de preparación con IA.
  //
  // Se ajusta DURANTE EL RENDER en vez de en dos `useEffect`, que es lo que
  // documenta React para "resetear estado cuando cambia una prop". Con efecto,
  // el usuario veía un frame con los datos de la sesión ANTERIOR ya pintados y
  // el reset llegaba en un segundo render. Así React descarta el render en
  // curso y vuelve a renderizar antes de tocar el DOM: nunca se pinta.
  // De paso, los dos efectos que vigilaban `sesionId` por separado pasan a ser
  // uno solo.
  const [sesionIdPrevia, setSesionIdPrevia] = useState(sesionId);
  if (sesionId !== sesionIdPrevia) {
    setSesionIdPrevia(sesionId);
    setNotaVozSocioId(null);
    setPrepIA(null);
    setPrepIAError(false);
  }

  async function prepararClaseIA() {
    if (!sesionActual) return;
    setPrepIALoading(true);
    setPrepIA(null);
    setPrepIAError(false);
    try {
      const resumen = resumenSaludClase(
        reservasActuales.filter(r => r.estado === 'CONFIRMADA' || r.estado === 'ASISTIDA').map(r => condicionesPorSocio.get(r.socioId) ?? []),
      );
      const res = await fetch('/api/ai/ficha-clinica-clase', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(await authHeader()) },
        // La clase va con el resumen: una instructora solo puede prepararla si
        // la imparte ella (lo comprueba el servidor).
        body: JSON.stringify({ ...resumen, sesionId: sesionActual.id }),
      });
      if (!res.ok) { setPrepIAError(true); return; }
      const data = await res.json();
      setPrepIA(data);
    } catch {
      setPrepIAError(true);
    } finally {
      setPrepIALoading(false);
    }
  }

  const sociosDisponibles = useMemo(() => {
    const sociosEnClase = new Set(reservasActuales.filter(r => r.estado !== 'CANCELADA').map(r => r.socioId));
    return socios.filter(s => s.activo && !sociosEnClase.has(s.id));
  }, [reservasActuales, socios]);

  const spotsActuales = sesionActual ? spots.filter(sp => sp.salaId === sesionActual.salaId) : [];

  const eventosHistorial = useMemo(() => {
    if (!datosVista || !sesionId) return [];
    const nombrePorId = new Map(datosVista.instructores.map(i => [i.id, i.nombre]));
    const desdeSesion = datosVista.sustituciones.filter(s => s.sesionId === sesionId);
    return historialSustituciones(desdeSesion, id => nombrePorId.get(id) ?? null);
  }, [datosVista, sesionId]);

  // ── La ficha de la clase abierta ─────────────────────────────────────────────
  // Todo lo que hacía el panel de antes sigue aquí (inventario del 1-oct-2026);
  // cambia el orden: lo principal del momento arriba, lo demás en su ⋯.
  const tarjetaActual = sesionId ? tarjetasPorId.get(sesionId) ?? null : null;
  const empezadaActual = sesionActual ? sesionYaEmpezada(sesionActual.inicio, now) : false;
  const terminadaActual = sesionActual ? now.getTime() >= new Date(sesionActual.fin).getTime() : false;
  // Una clase cancelada no pide nada: ni plazas que ofrecer o ajustar, ni
  // sustituta, ni volver a cancelarla.
  const canceladaActual = !!sesionActual?.cancelada;
  const vivaActual = !terminadaActual && !canceladaActual;
  // Por qué «cancelar la serie desde aquí» no incluye esta clase, si no la incluye.
  const sinEstaEnLaSerie = empezadaActual ? 'esta ya ha empezado y se queda' : canceladaActual ? 'esta ya está cancelada' : null;
  const enEsperaActual = reservasActuales.filter(r => r.estado === 'LISTA_ESPERA').length;
  const salaActual = sesionActual ? salas.find(x => x.id === sesionActual.salaId) ?? null : null;
  const sobreaforoActual = !!salaActual && !!sesionActual && sesionActual.aforoMaximo > salaActual.capacidad;
  const vecinasActual = vecinas(ordenClases, sesionId);
  const apuntadasActual = sesionActual?.confirmadas ?? 0;

  const menuClase: AccionMenu[] = !sesionActual || !esPropiaClase ? [] : [
    ...(!canceladaActual ? [{
      texto: 'Editar esta clase', icono: Pencil, onClick: openEdit,
      desactivada: empezadaActual, nota: empezadaActual ? MENSAJE_CLASE_YA_EMPEZADA : 'Hora, sala, instructora, plazas o notas',
    }] : []),
    { texto: 'Duplicar', icono: Copy, onClick: () => openDuplicar(sesionActual), nota: 'La misma clase, la semana que viene' },
    ...(!canceladaActual ? [
      {
        texto: 'Buscar sustituta', icono: UserCheck, onClick: () => setSustitutaPara(sesionActual.id),
        desactivada: empezadaActual, nota: empezadaActual ? MENSAJE_CLASE_YA_EMPEZADA : 'Su instructora no puede darla',
      },
      { texto: 'Anotar incidencia de sala', icono: Wrench, onClick: () => abrirIncidencia(sesionActual.id), nota: 'Una nota para el equipo; no avisa a nadie' },
    ] : []),
    ...(sesionActual.serieId ? [
      {
        texto: 'Duplicar serie', icono: Copy, onClick: () => openDuplicarSerie(sesionActual), separar: true, dentro: true,
        seccion: horario ? textoRepeticion(sesionActual.inicio, sesionActual.serieId, horario) : 'La serie: se repite cada semana',
        nota: 'Lo que queda de la serie, desde su última clase',
      },
      ...(!esInstructor ? [{
        texto: 'Renovar serie', icono: RefreshCw, dentro: true, nota: 'La misma clase, más semanas',
        onClick: () => {
          const { dow, hora, minuto } = franjaLocalDe(sesionActual.inicio);
          setRenovarSerieDe({
            serieId: sesionActual.serieId!,
            nombre: nombreSerie(
              { diaSemana: dow, hora: `${String(hora).padStart(2, '0')}:${String(minuto).padStart(2, '0')}`, salaId: sesionActual.salaId, tipoClaseId: sesionActual.tipoClaseId },
              id => tiposClase.find(t => t.id === id)?.nombre,
              id => salas.find(x => x.id === id)?.nombre,
            ),
          });
        },
      }] : []),
      // Con una sola clase viva por delante haría lo mismo que «Cancelar esta
      // clase». Fuera del rol INSTRUCTOR: la RLS le deja tocar solo sus propias
      // clases, y un lote sobre la serie podría cancelar media y decir que fue bien.
      // Con esta ya empezada o ya cancelada, el lote no la incluye
      // (`sesionesSerieRestantes` va sin ellas), y el texto tiene que decirlo.
      ...(sesionesSerieRestantes.length > (sinEstaEnLaSerie ? 0 : 1) && !esInstructor ? [{
        texto: sinEstaEnLaSerie ? 'Cancelar las siguientes' : 'Cancelar esta y las siguientes', icono: Ban, dentro: true, peligro: true,
        onClick: () => setConfirmCancelarSerie(true),
        nota: sinEstaEnLaSerie
          ? `${sesionesSerieRestantes.length === 1 ? 'La próxima' : `Las ${sesionesSerieRestantes.length} próximas`}; ${sinEstaEnLaSerie}`
          : `${sesionesSerieRestantes.length} clases; las de antes no se tocan`,
      }] : []),
    ] as AccionMenu[] : []),
    ...(!empezadaActual ? [
      ...(!canceladaActual ? [{
        texto: 'Cancelar esta clase', icono: Ban, peligro: true, separar: true, onClick: () => setConfirmCancelar(true),
        nota: apuntadasActual > 0 ? `Avisa a ${apuntadasActual === 1 ? 'la apuntada' : `las ${apuntadasActual} apuntadas`}` : 'No tiene clientas apuntadas',
      }] : []),
      ...(!esInstructor ? [{ texto: 'Eliminar', icono: Trash2, peligro: true, separar: canceladaActual, onClick: () => setConfirmEliminar(true), nota: 'Solo si la creaste por error' }] : []),
    ] as AccionMenu[] : []),
  ];

  const estadoFicha = sesionActual ? estadoDeFicha({
    estado: estadoVista, inicio: sesionActual.inicio, fin: sesionActual.fin,
    marca: tarjetaActual?.marca ?? { aviso: null, extra: null },
    apuntadas: apuntadasActual, asistidas: sesionActual.asistidas,
    sinMarcar: reservasActuales.filter(r => r.estado === 'CONFIRMADA' && !r.checkInEn).length,
    aforo: sesionActual.aforoMaximo, enEspera: enEsperaActual,
  }, now) : null;

  const explicacionFicha = !sesionActual ? null
    : estadoVista === 'SIN_INSTRUCTORA' && !terminadaActual ? porQueSinCubrir({
      instructora: sesionActual.instructor.nombre === '?' ? null : sesionActual.instructor.nombre,
      ausencia: sesionVista?.ausencia ?? null,
      instructoraInactiva: !!sesionVista?.instructoraInactiva,
      motivoBaja: sesionVista?.motivoBaja ?? null,
      sustitucionAbierta: !!sesionVista?.sustitucionAbierta,
    })
    : estadoVista === 'INCIDENCIA' ? sesionActual.incidenciaTexto ?? null
    : estadoVista === 'CONFLICTO' ? 'La sala o la instructora ya tienen otra clase a esa hora.'
    : null;

  const BOTON_PRINCIPAL = 'inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-brand px-4 text-[14px] font-semibold text-brand-foreground transition-[filter] hover:brightness-95 disabled:opacity-50';
  const BOTON_SECUNDARIO = 'inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-border bg-card px-4 text-[14px] font-semibold text-foreground transition-colors hover:bg-muted';
  const floja = sesionVista?.floja ?? null;
  // ── Sustituta (PR4 del rediseño): la caja de la ficha y sus acciones ───────
  // Se enseña en una clase sin cubrir, en una con búsqueda abierta, o cuando se
  // ha pedido desde su «⋯» («Buscar sustituta» de una clase CON instructora).
  if (sustitutaPara && sustitutaPara !== sesionId) setSustitutaPara(null);
  const mostrarSustituta = !!sesionActual && esPropiaClase && !empezadaActual && !canceladaActual
    && (estadoVista === 'SIN_INSTRUCTORA' || sustitutaPara === sesionActual.id || !!sesionVista?.sustitucionId);
  const datosSustitutaActual = datosSustituta && datosSustituta.sesionId === sesionId ? datosSustituta.datos : null;
  // Se pide SOLO cuando la caja se pinta: sin búsqueda abierta, la lectura
  // calcula el orden con `rankear_candidatas`, y eso no se hace por abrir una clase cualquiera.
  useEffect(() => {
    if (!mostrarSustituta || !sesionId) return;
    let vivo = true;
    void (async () => {
      try {
        const res = await fetch(`/api/sustituciones/clase?sesionId=${encodeURIComponent(sesionId)}`, { headers: await authHeader() });
        const data = await res.json().catch(() => null) as (DatosSustitutaClase & { error?: string }) | null;
        if (!vivo) return;
        if (!res.ok || !data) { setErrorSustituta(data?.error ?? 'No se ha podido ver quién puede darla. Vuelve a intentarlo.'); return; }
        setErrorSustituta(null);
        setDatosSustituta({ sesionId, datos: data });
      } catch {
        if (vivo) setErrorSustituta('No se ha podido ver quién puede darla. Revisa la conexión.');
      }
    })();
    return () => { vivo = false; };
  }, [mostrarSustituta, sesionId, recargaSustituta]);

  // Del equipo, las que podrían darla de verdad (lo que filtraba el diálogo de
  // antes): imparten, no están ausentes ese día y no tienen otra clase a esa
  // hora. `confirmar_sustitucion` no mira ausencias; esto sí.
  const opcionesSustituta = useMemo(() => {
    if (!sesionActual) return [];
    return instructoresActivos
      .filter(i => i.id !== sesionActual.instructorId
        && !ausenciaEnFecha(ausencias, i.id, sesionActual.inicio)
        && !sesiones.some(x => !x.cancelada && x.id !== sesionActual.id && x.instructorId === i.id
          && x.inicio < sesionActual.fin && sesionActual.inicio < x.fin))
      .map(i => ({ id: i.id, nombre: i.nombre, telefono: i.telefono ?? null }));
  }, [sesionActual, instructoresActivos, ausencias, sesiones]);

  async function pedirSustituciones(metodo: 'POST' | 'PATCH', cuerpo: Record<string, unknown>) {
    const res = await fetch('/api/sustituciones', {
      method: metodo,
      headers: { 'Content-Type': 'application/json', ...(await authHeader()) },
      body: JSON.stringify(cuerpo),
    }).catch(() => null);
    const data = await res?.json().catch(() => null) as Record<string, unknown> | null;
    return { ok: !!res?.ok, data, error: typeof data?.error === 'string' ? data.error : null };
  }
  // Una acción a la vez; al terminar se relee la caja y la rejilla (la marca de
  // la clase cambia: buscando, espera tu visto bueno, cubierta…).
  async function enSustituta(accion: () => Promise<void>) {
    if (ocupadoSustituta) return;
    setOcupadoSustituta(true);
    try { await accion(); } finally {
      setOcupadoSustituta(false);
      setRecargaSustituta(n => n + 1);
      void refrescarVista();
    }
  }
  function buscarSustituta() {
    if (!sesionActual) return;
    const id = sesionActual.id;
    void enSustituta(async () => {
      const r = await pedirSustituciones('POST', { sesionId: id });
      if (!r.ok) { showToastError(r.error ?? 'No se ha podido empezar a buscar. Inténtalo otra vez.'); return; }
      const sust = r.data?.sustitucion as { estado?: string } | undefined;
      if (r.data?.yaExistia && sust?.estado === 'confirmada') {
        showToast('A esta clase ya la cubrió una sustituta: para cambiar quién la da, edita la clase');
        return;
      }
      showToast(sust?.estado === 'contactando' ? 'Buscando sustituta: avisada la que mejor encaja'
        : sust?.estado === 'agotada' ? 'No hay a quién avisar: asígnala tú'
        : 'Búsqueda abierta: dale el visto bueno para avisar a la primera');
    });
  }
  function avisarCandidata(instructorId: string) {
    const sustitucionId = datosSustitutaActual?.sustitucion?.id;
    if (!sustitucionId) return;
    void enSustituta(async () => {
      const r = await pedirSustituciones('PATCH', { action: 'contactar', sustitucionId, instructorId });
      if (r.ok) showToast(`Avisada ${nombreInstructor(instructorId)}`);
      else showToastError(r.error ?? 'No se ha podido avisarla. Inténtalo otra vez.');
    });
  }
  function volverABuscar() {
    const sustitucionId = datosSustitutaActual?.sustitucion?.id;
    if (!sustitucionId) return;
    void enSustituta(async () => {
      const r = await pedirSustituciones('PATCH', { action: 'recalcular', sustitucionId });
      if (!r.ok) showToastError(r.error ?? 'No se ha podido volver a buscar. Inténtalo otra vez.');
    });
  }
  function descartarBusqueda() {
    const sustitucionId = datosSustitutaActual?.sustitucion?.id;
    if (!sustitucionId) return;
    void enSustituta(async () => {
      const r = await pedirSustituciones('PATCH', { action: 'descartar', sustitucionId });
      if (!r.ok) { showToastError(r.error ?? 'No se ha podido parar la búsqueda.'); return; }
      showToast('Búsqueda parada');
      setSustitutaPara(null);
    });
  }
  // «¿Ya sabes quién la da?»: siempre por el POST con `asignarA` (el servidor
  // decide si abre la baja o confirma sobre la que ya había).
  function asignarDirecta(instructorId: string, avisarClientas: boolean) {
    if (!sesionActual) return;
    const id = sesionActual.id;
    const apuntadas = apuntadasActual;
    void enSustituta(async () => {
      const r = await pedirSustituciones('POST', { sesionId: id, asignarA: instructorId, avisar: avisarClientas });
      if (!r.ok) { showToastError(r.error ?? 'No se ha podido asignar la clase. Sigue como estaba.'); return; }
      const alumnas = r.data?.alumnas as { avisadas?: number; total?: number; skipped?: boolean; desactivado?: boolean } | null | undefined;
      // `desactivado` llega con total 0 (el servidor ni las cuenta): se mira
      // antes que el total, o el «no se las ha avisado» no salía nunca.
      const sobreClientas = !alumnas || alumnas.skipped ? ''
        : alumnas.desactivado ? (apuntadas > 0 ? ' · sin avisar a las clientas (el aviso está apagado en Sustituciones)' : '')
        : (alumnas.total ?? 0) > 0 ? ` · avisadas ${alumnas.avisadas ?? 0} de ${alumnas.total} clientas` : '';
      showToast(`Clase cubierta con ${nombreInstructor(instructorId)}${sobreClientas}`);
      setSustitutaPara(null);
    });
  }

  const principalFicha = !sesionActual || !esPropiaClase ? null : (
    <>
      {mostrarSustituta && (
        <SustitutaDeClase
          datos={datosSustitutaActual}
          cargando={!datosSustitutaActual && !errorSustituta}
          error={errorSustituta}
          opciones={opcionesSustituta}
          apuntadas={apuntadasActual}
          avisoClientasApagado={studio?.avisarAlumnas === false}
          mensajeWhatsApp={o => o.telefono
            ? enlaceWhatsApp(o.telefono, `Hola! ¿Podrías cubrir la clase de ${sesionActual.tipoClase.nombre} el ${diaCorto(sesionActual.inicio)} a las ${horaEstudio(sesionActual.inicio)}? Avísame si puedes 🙏`)
            : null}
          ocupado={ocupadoSustituta}
          nombreDe={nombreInstructor}
          onBuscar={buscarSustituta}
          onAvisar={avisarCandidata}
          onVolverABuscar={volverABuscar}
          onDescartar={descartarBusqueda}
          onAsignar={asignarDirecta}
        />
      )}
      {estadoVista === 'INCIDENCIA' && (
        <div className="grid grid-cols-2 gap-2">
          <button type="button" className={BOTON_PRINCIPAL} onClick={() => void ejecutarResolverIncidencia(sesionActual.id)}>Resolver</button>
          <button type="button" className={BOTON_SECUNDARIO} onClick={() => abrirIncidencia(sesionActual.id)}>Cambiar la nota</button>
        </div>
      )}
      {estadoVista === 'CONFLICTO' && !empezadaActual && (
        <button type="button" className={BOTON_PRINCIPAL} onClick={openEdit}>Cambiar la hora o la sala</button>
      )}
      {vivaActual && enEsperaActual > 0 && apuntadasActual < sesionActual.aforoMaximo && (
        <button type="button" className={BOTON_SECUNDARIO} onClick={() => setDialogoAccion({ tipo: 'OFRECER', sesionId: sesionActual.id })}>
          Ofrecer la plaza libre a la lista de espera
        </button>
      )}
      {vivaActual && sobreaforoActual && salaActual && (
        <button type="button" className={BOTON_SECUNDARIO} onClick={() => setDialogoAccion({ tipo: 'AJUSTAR_AFORO', sesionId: sesionActual.id })}>
          Ajustar las plazas a {salaActual.capacidad} (las de la sala)
        </button>
      )}
      {vivaActual && floja && (
        <div className="rounded-xl bg-muted/60 px-3.5 py-3 text-[13px] text-foreground">
          <p className="flex items-start gap-2 text-pretty">
            <TrendingDown size={15} className="mt-0.5 shrink-0 text-warning" aria-hidden />
            <span>
              <b className="font-semibold">Va floja:</b> lleva {floja.reservasAhora} de {floja.aforo}, y a {floja.diasVista === 1 ? 'un día' : `${floja.diasVista} días`} suele llevar {floja.referenciaHabitual} ({floja.ocurrencias} semanas comparadas).
            </span>
          </p>
          {puedeVer(rolActual, '/centro-de-control') && (
            <Link href="/centro-de-control" className="mt-2 inline-flex items-center gap-1 text-[12.5px] font-semibold text-brand-medio hover:underline">
              Qué hacer, en el Centro de Control<ArrowRight size={13} aria-hidden />
            </Link>
          )}
        </div>
      )}
    </>
  );
  const hayPrincipal = !!sesionActual && esPropiaClase && (
    mostrarSustituta || estadoVista === 'INCIDENCIA'
    || (estadoVista === 'CONFLICTO' && !empezadaActual)
    || (vivaActual && ((enEsperaActual > 0 && apuntadasActual < sesionActual.aforoMaximo) || sobreaforoActual || !!floja))
  );

  if (!mounted) return null;

  const cerradosSemana = columnasSemana.map(c => c.cerrado);
  const fichaAbierta = !!sesionActual && !!sesionId && (modoFicha === 'lateral' || !showForm);
  const fichaLateral = modoFicha === 'lateral' && fichaAbierta && vista !== 'horario';
  const puedeCrear = gestionaClientas || creaClasesPropias;
  const ficha = sesionActual && (
    <FichaClase
      modo={modoFicha}
      abierta={fichaAbierta && vista !== 'horario'}
      onCerrar={cerrarFicha}
      onTocar={abiertaSola ? () => setAbiertaSola(false) : undefined}
      titulo={sesionActual.tipoClase.nombre}
      color={sesionActual.tipoClase.color}
      cuando={`${capitalizarPrimera(diaCorto(sesionActual.inicio))} · ${horaEstudio(sesionActual.inicio)} – ${horaEstudio(sesionActual.fin)}`}
      donde={[
        salaActual?.nombre,
        sesionVista ? (datosPorSesionId.get(sesionVista.id)?.instructor?.nombre ?? 'Sin instructora')
          : sesionActual.instructor.nombre === '?' ? 'Sin instructora' : sesionActual.instructor.nombre,
      ].filter(Boolean).join(' · ')}
      repeticion={sesionActual.serieId ? textoRepeticion(sesionActual.inicio, sesionActual.serieId, horario) : null}
      pastilla={estadoFicha?.pastilla ?? null}
      cifra={estadoFicha?.cifra}
      explicacion={explicacionFicha}
      onAnterior={vecinasActual.anterior ? () => { setSesionId(vecinasActual.anterior); setAbiertaSola(false); setPestanaPanel('clientas'); } : undefined}
      onSiguiente={vecinasActual.siguiente ? () => { setSesionId(vecinasActual.siguiente); setAbiertaSola(false); setPestanaPanel('clientas'); } : undefined}
      menu={menuClase}
      pieMenu={empezadaActual && esPropiaClase ? 'Una clase que ya ha empezado no se cancela ni se borra: su asistencia es la historia de tus clientas.' : undefined}
      principal={hayPrincipal ? principalFicha : undefined}
      pestana={pestanaPanel}
      onPestana={setPestanaPanel}
      nClientas={reservasActuales.filter(r => r.estado !== 'CANCELADA' && r.estado !== 'LISTA_ESPERA').length}
      conPlazas={spotsActuales.length > 0}
      clientas={
        <>
          {((verFichaClinica && alertasClase.length > 0) || gestionaClientas) && (
            <div className="space-y-2.5 px-5 pt-3">
              {verFichaClinica && alertasClase.length > 0 && (
                <AdaptacionesClase
                  key={`adaptaciones-${sesionActual.id}`}
                  alertas={alertasClase}
                  puedePreparar={esPropiaClase}
                  preparando={prepIALoading}
                  preparacion={prepIA}
                  error={prepIAError}
                  onPreparar={prepararClaseIA}
                  onCerrarPreparacion={() => setPrepIA(null)}
                />
              )}
              {gestionaClientas && (
                <AnadirAClase
                  key={`anadir-${sesionActual.id}`}
                  sesionId={sesionActual.id}
                  confirmadas={sesionActual.confirmadas}
                  aforo={sesionActual.aforoMaximo}
                  plataformas={plataformasActivas}
                  clientas={sociosDisponibles}
                  avisar={avisarAlumna}
                  onAvisar={setAvisarAlumna}
                  hrefQr={studio?.controlAccesoQr !== false ? `/calendario/pase?sesion=${encodeURIComponent(sesionActual.id)}` : null}
                  showToast={showToast}
                  onPlazaPlataforma={refrescarVista}
                  // Con qué viene cada una: la MISMA regla que ve la alumna al
                  // reservar y que sigue el servidor para elegir bono.
                  coberturaDe={socioId => lineaCoberturaMostrador(coberturaDeClase({
                    socioId, suscripciones, planesTarifa, hoyISO: hoyEnEstudio(),
                    tipoClaseId: sesionActual.tipoClaseId, precioClaseSuelta: precioSueltaDe(sesionActual.id),
                  }))}
                  precio={precioSueltaDe(sesionActual.id)}
                  sinPrecio={sinPrecioSueltaDe(sesionActual.id)}
                  onAnadir={socioId => anadirOPreguntarEspera(sesionActual.id, socioId)}
                  onCobrarYAnadir={mueveDinero ? ((socioId, metodo) => cobrarSueltaYAnadir(sesionActual.id, socioId, metodo)) : null}
                  onAnadirYCobrarDespues={mueveDinero ? (socioId => anadirYCobrarDespues(sesionActual.id, socioId)) : null}
                  onCortesia={socioId => void anadirCortesia(sesionActual.id, socioId)}
                  hrefVenderBono={puedeVer(rolActual, '/pos') ? (socioId => `/pos?clienta=${encodeURIComponent(socioId)}`) : null}
                />
              )}
            </div>
          )}
          {/* Con su clave: las marcas de «pasar lista» a medias son de ESTA clase. */}
          <ClientasDeClase
            key={`clientas-${sesionActual.id}`}
            reservas={reservasActuales}
            nombreClienta={nombreClientaResolver}
            pasarLista={estadoVista === 'SIN_PASAR_LISTA'}
            checkinAbierto={checkinAbierto(sesionActual.inicio, now)}
            checkinDesde={diaEnEstudio(sesionActual.inicio) === todayStr ? horaEstudio(aperturaCheckin(sesionActual.inicio)) : null}
            empezada={empezadaActual}
            onCheckin={conAviso(id => checkin(id))}
            onDeshacerCheckin={conAviso(deshacerCheckin)}
            onNoShow={conAviso(marcarNoShow)}
            onRevertirNoShow={conAviso(revertirNoShow)}
            onAprobar={id => resolverPendiente(id, true)}
            onRechazar={id => resolverPendiente(id, false)}
            resolviendoId={resolviendoReserva}
            onQuitar={gestionaClientas ? (id: string) => {
              const marca = marcaReserva({ id }, recuperaciones); // antes de cancelar
              const suelta = reciboDeSuelta(id); // ídem
              // El aviso de bono no devuelto, y lo que decidió el servidor sobre
              // la plaza fija, la recuperación y la clase suelta (su política).
              void cancelarReserva(id).then(async res => {
                if (!res.ok) showToast(res.error);
                else {
                  const texto = [textoTrasQuitar(res, marca), res.avisoBono,
                    avisoClaseSueltaAlQuitar({ recibo: suelta, reservaId: id, bonoDevuelto: !!res.bonoDevuelto, tardia: !!res.tardia })]
                    .filter(Boolean).join(' · ');
                  if (texto) showToast(texto);
                }
                // ⚠️ Sin esto el contador se quedaba en «8/8» con la clienta ya
                // fuera de la lista: `cancelarReserva` actualiza `reservas` del
                // contexto (de donde sale la lista) y NO `datosVista` (de donde
                // sale el número).
                await refrescarVista();
              });
            } : undefined}
            onRepetirSemanaSiguiente={gestionaClientas ? repetirSemanaSiguiente : undefined}
            onHacerPlazaFija={gestionaClientas ? hacerPlazaFija : undefined}
            plazaFijaExistePara={socioId => plazasFijas.some(p => p.socioId === socioId && p.estado !== 'BAJA'
              && !!sesionActual && sesionEncajaEnPlaza(p, sesionActual))}
            // Escribe en `notas_progreso` (detalle clínico): la misma puerta que
            // la ficha de salud, no solo el piloto (FICHA-CLINICA.md §11, #561).
            onNotaVoz={verFichaClinica && enPiloto && esPropiaClase ? setNotaVozSocioId : undefined}
            marcaDe={r => marcaReserva(r, recuperaciones)}
            semaforoPorSocio={verSemaforo ? (socioId => {
              const nivel = semaforoParaMostrar.get(socioId);
              return nivel ? { color: SEMAFORO_META[nivel].color, label: SEMAFORO_META[nivel].label } : undefined;
            }) : undefined}
            sitioDe={r => (r.spotId ? spots.find(sp => sp.id === r.spotId)?.nombre ?? null : null)}
            onGuardarLista={plan => guardarLista(sesionActual.id, plan)}
            filaExtra={verFichaClinica ? (r => r.estado === 'ASISTIDA' ? (
              <div className="mt-1.5 flex items-center gap-1 pl-[52px]">
                {(() => {
                  // 38ª pasada de auditoría: sin consentimiento de salud vigente,
                  // la RLS de `respuestas_sesion` rechaza la escritura en
                  // silencio — deshabilitar el botón es lo que evita que el
                  // mostrador pulse algo que el servidor va a tirar.
                  const tieneConsentimiento = Boolean(socios.find(x => x.id === r.socioId)?.consentimientoSalud);
                  return RESPUESTAS_ORDEN.map(resp => {
                    const rm = RESPUESTA_META[resp];
                    const activa = respuestaPorSocio.get(r.socioId)?.respuesta === resp;
                    return (
                      <button
                        key={resp}
                        type="button"
                        disabled={!tieneConsentimiento}
                        onClick={async () => {
                          const res = await registrarRespuestaSesion({ socioId: r.socioId, sesionId: sesionActual?.id ?? null, respuesta: resp });
                          if (!res.ok) showToast(res.error);
                        }}
                        title={tieneConsentimiento ? rm.label : 'Pide primero el consentimiento de datos de salud desde su ficha'}
                        aria-label={rm.label}
                        aria-pressed={activa}
                        className={cn(
                          'flex size-7 items-center justify-center rounded-md text-xs transition-all',
                          !tieneConsentimiento ? 'cursor-not-allowed opacity-20' : activa ? 'scale-110 ring-2' : 'opacity-45 hover:opacity-100',
                        )}
                        style={activa && tieneConsentimiento ? { backgroundColor: rm.bg, boxShadow: `0 0 0 2px ${rm.color}` } : { backgroundColor: rm.bg }}
                      >
                        {rm.emoji}
                      </button>
                    );
                  });
                })()}
              </div>
            ) : null) : undefined}
          />
        </>
      }
      plazas={spotsActuales.length > 0 ? (
        <SpotMap
          spots={spotsActuales}
          reservas={reservasActuales}
          socios={socios}
          onCheckin={checkinAbierto(sesionActual.inicio, now) ? conAviso(id => checkin(id)) : undefined}
          onQuitarSpot={conAviso(liberarSpot)}
          onAsignarSpot={async (spotId, socioId) => {
            const res = await asignarSpot(sesionActual.id, socioId, spotId);
            if (!res.ok) showToast(res.error ?? 'No hemos podido asignar el sitio. Inténtalo de nuevo.');
          }}
        />
      ) : undefined}
      sustituciones={<HistorialSesion eventos={eventosHistorial} />}
    />
  );

  return (
    // Desde `md` el calendario ocupa justo hasta el fondo de la ventana y lo que
    // se desplaza es la rejilla, no la página (ver LienzoCalendario). Desde `lg`
    // el alto lo pone `refLienzo` midiendo lo que hay encima y debajo; el `calc`
    // de `md` es solo el punto de partida. En el móvil Día y Semana son una lista
    // y es la PÁGINA la que hace scroll.
    <div ref={refLienzo} data-tour="calendario-vista" className="flex flex-col md:h-[calc(100vh-136px)]">
    <LienzoCalendario>
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-3xl border border-border bg-card shadow-[0_20px_50px_-24px_rgba(0,0,0,0.18)]">
      <div className="shrink-0 space-y-3 px-4 pt-4 pb-3 lg:px-6 lg:pt-5 escritorio-bajo:space-y-2 escritorio-bajo:pt-3 escritorio-bajo:pb-2">
        <CabeceraCalendario
          vista={vista}
          onVista={v => { setVista(v); setFiltroResumen(null); }}
          conHorario={!esInstructorTop}
          compacta={!herramientasConNombre}
          ventana={escritorio ? (
            <button
              type="button"
              onClick={(e) => (ventana.abierta ? actualizarVentana({ abierta: false }) : abrirVentanaDesde(e.currentTarget))}
              aria-pressed={ventana.abierta}
              aria-label={ventana.abierta ? 'Cerrar la ventana flotante' : 'Abrir en una ventana flotante'}
              title={ventana.abierta
                ? 'Cerrar la ventana flotante'
                : 'Ventana flotante: la agenda del día a mano mientras usas el resto del panel'}
              className={cn(BOTON_VENTANA, ventana.abierta && 'bg-muted text-foreground')}
            >
              <PictureInPicture2 size={15} />
            </button>
          ) : undefined}
          buscador={<BuscadorCalendario candidatas={candidatasBusqueda} texto={busqueda} onTexto={setBusqueda} onSeleccionar={saltarAClase} compacto={!herramientasConNombre} />}
          hrefEscanear={puedeGestionarCalendario(rolActual) && studio?.controlAccesoQr !== false ? '/calendario/pase' : null}
          hrefImportar={gestionaClientas ? '/calendario/importar' : null}
          seleccion={gestionaClientas && vista !== 'horario' ? { activa: modoSeleccion, onAlternar: () => (modoSeleccion ? salirDeSeleccion() : setModoSeleccion(true)) } : null}
          // Quien gestiona el estudio elige primero qué crea; la instructora que
          // crea sus clases va directa a la suya (no tiene clases fijas).
          onCrear={gestionaClientas ? () => setElegirQueCrear(true) : creaClasesPropias ? () => openNueva() : null}
          navegacion={vista === 'horario' ? null : {
            onAnterior: () => (vista === 'semana' ? cambiarSemana(-1) : cambiarDia(-1)),
            onSiguiente: () => (vista === 'semana' ? cambiarSemana(1) : cambiarDia(1)),
            onHoy: irAHoy,
            textoAnterior: vista === 'semana' ? 'Semana anterior' : 'Día anterior',
            textoSiguiente: vista === 'semana' ? 'Semana siguiente' : 'Día siguiente',
            fecha: (
              <SelectorFecha
                etiqueta={etiquetaFecha}
                abrirEn={vista === 'semana' ? localDate(semana) : localDate(diaSeleccionado)}
                desde={vista === 'semana' ? localDate(semana) : localDate(diaSeleccionado)}
                hasta={vista === 'semana' ? localDate(addDays(semana, 6)) : localDate(diaSeleccionado)}
                hoy={todayStr}
                diasConClase={diasConClase}
                onElegir={irAFecha}
                onSemanaQueViene={() => irAFecha(masDias(todayStr, 7))}
              />
            ),
          }}
          salas={datosVista?.salas ?? salas}
          instructoras={instructoresActivos}
          filtroSala={filtroSala}
          filtroInstructora={filtroInstructor}
          onSala={setFiltroSala}
          onInstructora={setFiltroInstructor}
        />
        {/* En el móvil, el Día lleva la semana en una tira: un toque y a otro día. */}
        {enMovil && vista === 'dia' && (
          <TiraDias
            dias={Array.from({ length: 7 }, (_, i) => localDate(addDays(semanaQueMuestra(diaSeleccionado, semana, now), i)))}
            elegido={localDate(diaSeleccionado)}
            hoy={todayStr}
            conClase={diasConClase}
            onElegir={irAFecha}
          />
        )}
        {vista !== 'horario' && datosVista && !sinNingunaClase && (
          <ResumenCalendario
            resumen={resumen}
            activo={filtroResumenVivo}
            onFiltro={setFiltroResumen}
            extra={esHoyEnDia && siguienteHoyId ? (() => {
              const t = tarjetasPorId.get(siguienteHoyId);
              if (!t) return null;
              const min = Math.round((new Date(t.inicio).getTime() - now.getTime()) / 60_000);
              return (
                <span className="inline-flex items-center gap-1.5 text-[13px] text-muted-foreground">
                  <Clock3 size={14} aria-hidden />Siguiente: <b className="font-semibold text-foreground">{t.tipoNombre} {horaEstudio(t.inicio)}</b>
                  {min > 0 && min <= 180 ? ` · en ${min < 60 ? `${min} min` : `${Math.floor(min / 60)} h${min % 60 ? ` ${min % 60}` : ''}`}` : ''} · {t.confirmadas} de {t.aforo}
                </span>
              );
            })() : undefined}
          />
        )}
      </div>

      <ReanimarAlCambiar clave={vista === 'horario' ? 'horario' : claveVista} className="flex-1 min-h-0 px-4 lg:px-6 pb-4 lg:pb-6" animClassName="calendario-vista-in">
        {vista === 'horario' ? (
          <VistaHorario
            horario={horario}
            error={errorHorario}
            onReintentar={invalidarHorario}
            hoy={todayStr}
            nombreTipo={nombreTipoDe}
            nombreSala={nombreSalaDe}
            nombreInstructora={id => nombreInstructoraDeClase(id, instructores)}
            nombreClienta={nombreClientaResolver}
            puedeRenovar={!esInstructorTop}
            puedeAsignarPlaza={gestionaClientas}
            onRenovar={t => setRenovarSerieDe({ serieId: t.serieId, nombre: nombreSerie(t, nombreTipoDe, nombreSalaDe) })}
            onAnadirPlaza={setPlazaFijaEnTarjeta}
            onVerClase={verProximaClase}
            onCrearRecurrente={gestionaClientas ? () => { setInitialRecurrente(undefined); setShowRecurrentes(true); } : undefined}
            puedeGestionarClasesFijas={puedeGestionarCalendario(rolActual)}
            alumnasPidenPlaza={gestionaClientas ? studio?.plazaFijaSolicitarDesdeApp === true : undefined}
            plazasSeApruebanSolas={studio?.plazaFijaAprobacion === 'AUTOMATICA'}
            hrefAjustePeticiones={gestionaClientas && puedeAbrirEnConfiguracion(rolActual, HREF_PETICIONES_PLAZA_FIJA) ? HREF_PETICIONES_PLAZA_FIJA : null}
            preseleccionClaseFija={preseleccionClaseFija}
            onPreseleccionClaseFijaConsumida={() => setPreseleccionClaseFija(null)}
          />
        ) : !datosVista && errorCargaVista ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 px-4 text-center">
            <p className="text-[13px] font-medium text-foreground">No hemos podido cargar el calendario</p>
            <p className="text-[12px] text-muted-foreground">{errorCargaVista}</p>
            <button
              onClick={() => void cargarDatosVista(rango)}
              className="rounded-lg border border-border px-4 py-2 text-[12px] font-bold transition-colors hover:bg-muted"
            >
              Reintentar
            </button>
          </div>
        ) : !datosVista ? (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">Cargando…</div>
        ) : sinNingunaClase ? (
          // ⚠️ CERO sesiones en TODO el estudio, no «cero esta semana»: una
          // semana vacía en un estudio en marcha es normal (vacaciones) y aquí
          // sería ruido.
          <PrimerHorario
            horaApertura={datosVista.horaApertura}
            horaCierre={datosVista.horaCierre}
            tiposClase={tiposProgramables.map(t => ({ nombre: t.nombre, duracionMinutos: t.duracionMinutos }))}
            salas={salas.map(x => ({ nombre: x.nombre, capacidad: x.capacidad }))}
            // Solo si el equipo es UNA persona (la propietaria que dijo «sí, yo
            // doy clases»): con más gente, repartir clases es decisión suya.
            instructora={instructoresActivos.length === 1 ? instructoresActivos[0].nombre : null}
            // Con el equipo vacío las clases nacían sin instructora: se pregunta quién.
            sinEquipo={instructoresActivos.length === 0}
            onCrearInstructora={async (nombre) => {
              const res = await addInstructor({
                nombre, email: null, telefono: null, color: colorPorIndice(instructores.length),
                activo: true, rol: 'INSTRUCTOR', authUserId: null,
              });
              return res.ok ? { ok: true } : { ok: false, error: res.error };
            }}
            puedeCrear={gestionaClientas}
            slug={studio?.slug ?? null}
            nombreEstudio={studio?.nombre ?? 'tu estudio'}
            onCreado={(n) => {
              showToast(`Horario creado: ${n} clases en las próximas semanas`);
              invalidarHorario();
              void cargarDatosVista(rango);
            }}
          />
        ) : enMovil ? (
          <VistaAgenda
            modo={vista === 'dia' ? 'dia' : 'semana'}
            dias={vista === 'dia' ? agendaDia : agendaSemana}
            seleccionadaId={sesionId}
            marcadas={marcadas}
            onSeleccionar={abrirClase}
            atenuada={d => atenuadaPorId(d.sesion.id)}
            marcaDe={id => tarjetasPorId.get(id)?.marca}
          />
        ) : (
          <div
            className={cn('grid h-full min-h-0 gap-3', fichaLateral ? 'grid-cols-[minmax(0,1fr)_400px]' : 'grid-cols-1')}
          >
            {vista === 'dia' ? (
              <VistaDiaSalas
                key={localDate(diaSeleccionado)}
                columnas={columnasDia}
                tarjetas={tarjetasPorId}
                aperturaMin={aperturaMin}
                cierreMin={cierreMin}
                pxPorHora={fichaLateral ? 80 : 88}
                ahoraMin={esHoyEnDia ? minutosEnEstudio(now) : null}
                seleccionadaId={sesionId}
                marcadas={marcadas}
                enSeleccion={modoSeleccion}
                atenuada={atenuadaPorId}
                onSeleccionar={abrirClase}
                arrastrable={id => { const d = datosPorSesionId.get(id); return !!d && arrastrableSesion(d); }}
                onMover={moverEnElDia}
                onCrearEn={puedeCrear ? crearEnElDia : undefined}
              />
            ) : sesionesALaVista.length === 0 ? (
              <div className="flex h-full flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-border px-6 text-center">
                <CalendarDays size={22} className="text-muted-foreground" aria-hidden />
                <p className="text-[14px] font-semibold text-foreground">No hay clases del {rangoCorto(semana, addDays(semana, 6))}</p>
                <p className="max-w-sm text-[13px] text-muted-foreground text-pretty">
                  {filtroSala !== 'todas' ? 'En esta sala no hay ninguna estos días. Prueba con «Todas las salas».' : 'Puede que sean vacaciones. Si no, crea una clase o importa tu horario.'}
                </p>
              </div>
            ) : (
              <SemanaFranjas
                fechas={dias}
                hoyIndex={dias.some(d => localDate(d) === todayStr) ? dias.findIndex(d => localDate(d) === todayStr) : null}
                clases={clasesFranjas}
                tarjetas={tarjetasPorId}
                cerrados={cerradosSemana}
                resumenDia={resumenDelDia}
                compacta={fichaLateral || !semanaAncha}
                seleccionadaId={sesionId}
                marcadas={marcadas}
                enSeleccion={modoSeleccion}
                atenuada={atenuadaPorId}
                onSeleccionar={abrirClase}
                arrastrable={id => { const d = datosPorSesionId.get(id); return !!d && arrastrableSesion(d); }}
                onMoverADia={moverAOtroDia}
                onCrearEn={puedeCrear ? crearEnLaSemana : undefined}
              />
            )}
            {fichaLateral && ficha}
          </div>
        )}
      </ReanimarAlCambiar>
    </div>
    </LienzoCalendario>

      {/* ── Selección múltiple: barra de acción ──────────────────────────────────
          Flotante y anclada abajo: en semana hay que poder seguir marcando
          clases de días distintos sin que la barra tape la rejilla. En portal:
          un `fixed` dentro de la página se anclaba a ella. */}
      {modoSeleccion && createPortal(
        <div className="pointer-events-none fixed inset-x-0 bottom-[calc(6rem+env(safe-area-inset-bottom,0px))] z-40 flex justify-center px-4 lg:bottom-4">
          <div className="pointer-events-auto flex flex-wrap items-center gap-3 rounded-2xl border border-border bg-card px-4 py-3 shadow-[0_20px_50px_-20px_rgba(0,0,0,0.35)]">
            <span className="flex items-center gap-2 text-[14px] font-medium text-foreground">
              {marcadas.size === 0 ? 'Toca las clases que quieras cambiar' : (
                <>
                  <span className="flex size-7 items-center justify-center rounded-full bg-brand text-[13px] font-bold text-brand-foreground">{marcadas.size}</span>
                  {` clase${marcadas.size === 1 ? '' : 's'} marcada${marcadas.size === 1 ? '' : 's'}`}
                </>
              )}
            </span>
            {marcadas.size > 0 && (
              <select
                aria-label="Pasar las clases marcadas a"
                className="min-h-9 rounded-lg border border-border bg-card px-2.5 text-[13.5px] text-foreground"
                value=""
                onChange={e => {
                  const id = e.target.value;
                  if (!id) return;
                  setReasignarLote({ instructorId: id, nombre: nombreInstructor(id) });
                }}
              >
                <option value="">Pasarlas a…</option>
                {instructores.filter(i => i.activo).map(i => (
                  <option key={i.id} value={i.id}>{i.nombre}</option>
                ))}
              </select>
            )}
            <button
              onClick={salirDeSeleccion}
              className="rounded-lg px-2.5 py-1.5 text-[13px] font-medium text-muted-foreground transition-colors hover:text-foreground"
            >
              Salir
            </button>
          </div>
        </div>,
        anfitrionPortal(),
      )}

      {/* La ficha en cajón (iPad en vertical) o en hoja (móvil); al lado, va dentro de la rejilla. */}
      {!fichaLateral && vista !== 'horario' && ficha}

      {toastMsg && <Toast message={toastMsg} onDismiss={dismissToast} action={toastAction} variant={toastVariant} />}

      {verFichaClinica && notaVozSocioId && sesionActual && yo && (
        <ModalNotaVoz
          socioId={notaVozSocioId}
          nombreSocia={nombreClientaResolver(notaVozSocioId)}
          instructorId={yo.id}
          sesionId={sesionActual.id}
          onClose={() => setNotaVozSocioId(null)}
        />
      )}

      {plazaFijaEnTarjeta && (
        <ElegirClienta
          titulo="Añadir plaza fija"
          subtitulo={nombreSerie(plazaFijaEnTarjeta, nombreTipoDe, nombreSalaDe)}
          clientas={socios
            .filter(s => s.activo && !plazaFijaEnTarjeta.plazasFijas.some(p => p.socioId === s.id))
            .map(s => ({
              id: s.id,
              nombre: `${s.nombre} ${s.apellidos}`,
              sinCuota: !cuotaParaPlazaFija(s.id, suscripciones, planesTarifa, todayStr, plazaFijaEnTarjeta.tipoClaseId),
            }))
            // Primero las que pueden tenerla: con cuota que incluya la clase.
            .sort((a, b) => Number(a.sinCuota) - Number(b.sinCuota) || a.nombre.localeCompare(b.nombre, 'es'))}
          onClose={() => setPlazaFijaEnTarjeta(null)}
          onElegir={socioId => {
            const t = plazaFijaEnTarjeta;
            setPlazaFijaEnTarjeta(null);
            setPlazaFijaDesdeClase({
              socioId,
              clave: claveFranjaDeSesion({ salaId: t.salaId, tipoClaseId: t.tipoClaseId, inicio: t.proximaInicio }),
              spotId: null,
            });
          }}
        />
      )}

      {plazaFijaDesdeClase && (
        <DialogoPlazaFija
          socioId={plazaFijaDesdeClase.socioId}
          claveInicial={plazaFijaDesdeClase.clave}
          spotInicial={plazaFijaDesdeClase.spotId}
          onClose={() => setPlazaFijaDesdeClase(null)}
          onGuardada={(r, movida) => {
            setPlazaFijaDesdeClase(null);
            invalidarHorario();
            showToast(textoPlazaGuardada(r, movida));
            // Las reservas de las próximas semanas las acaba de crear el servidor.
            void refrescarVista();
          }}
        />
      )}


      {impactoSerie && (
        <DialogoImpactoEdicion
          impacto={impactoSerie.impacto}
          cambios={impactoSerie.cambios}
          desdeTexto={impactoSerie.desdeTexto}
          guardando={guardandoSesion}
          onClose={() => setImpactoSerie(null)}
          onConfirm={() => { void editarSerie().finally(() => setImpactoSerie(null)); }}
        />
      )}

      <ConfirmDialog
        open={confirmCancelar}
        onOpenChange={setConfirmCancelar}
        titulo="¿Cancelar esta clase?"
        descripcion={apuntadasSesionActual > 0
          ? `${apuntadasSesionActual} alumna${apuntadasSesionActual !== 1 ? 's' : ''} apuntada${apuntadasSesionActual !== 1 ? 's' : ''} se quedará${apuntadasSesionActual !== 1 ? 'n' : ''} sin plaza y recibirá${apuntadasSesionActual !== 1 ? 'n' : ''} un aviso.`
          : 'La clase no tiene alumnas apuntadas.'}
        textoConfirmar="Cancelar clase"
        destructivo
        onConfirm={() => void cancelarSesion()}
      />

      <ConfirmDialog
        open={confirmCancelarSerie}
        onOpenChange={setConfirmCancelarSerie}
        titulo={`¿Cancelar ${sesionesSerieRestantes.length === 1 ? 'la próxima clase' : `${sesionesSerieRestantes.length} clases`} de esta serie?`}
        descripcion={`${sinEstaEnLaSerie ? `Desde la próxima: ${sinEstaEnLaSerie}.` : 'Desde esta clase en adelante.'} ${apuntadasSerieRestante > 0
          ? `${apuntadasSerieRestante} reserva${apuntadasSerieRestante !== 1 ? 's' : ''} se cancelará${apuntadasSerieRestante !== 1 ? 'n' : ''}${(studio?.cancelacionClaseDevuelveBono ?? true) ? ' — se les devuelve la sesión del bono' : ''} y las clientas recibirán un aviso. Las clases anteriores de la serie no se tocan.`
          : 'Ninguna tiene clientas apuntadas, y las clases anteriores de la serie no se tocan.'}`}
        textoConfirmar="Cancelar serie"
        destructivo
        onConfirm={() => void cancelarSerie()}
      />

      <ConfirmDialog
        open={confirmEliminar}
        onOpenChange={setConfirmEliminar}
        titulo="¿Eliminar esta clase?"
        descripcion={apuntadasSesionActual > 0
          ? `${apuntadasSesionActual} alumna${apuntadasSesionActual !== 1 ? 's' : ''} apuntada${apuntadasSesionActual !== 1 ? 's' : ''} se quedará${apuntadasSesionActual !== 1 ? 'n' : ''} sin plaza${apuntadasSesionActual !== 1 ? 's' : ''}${(studio?.cancelacionClaseDevuelveBono ?? true) ? ' — su bono se devuelve' : ''} y recibirá${apuntadasSesionActual !== 1 ? 'n' : ''} un aviso.`
          : 'La clase no tiene alumnas apuntadas.'}
        textoConfirmar="Eliminar clase"
        destructivo
        onConfirm={() => void eliminarSesion()}
      />

      {/* ── Panel lateral crear / editar ────────────────────────────────────────── */}
      <DashboardDrawer open={!!showForm} onClose={() => setShowForm(null)} label={modoCajon === 'nueva' ? 'Nueva clase' : 'Editar clase'}>
        {modoCajon === 'nueva' ? (
          inicialNueva && (
            <FormularioNuevaClase
              key={claveNueva}
              inicial={inicialNueva}
              tiposClase={tiposClase}
              salas={salas}
              instructores={instructores}
              ausencias={ausencias}
              existentes={existentesSlot}
              studio={studio}
              planes={planesTarifa}
              cierres={cierres ?? SIN_CIERRES}
              rol={rolActual}
              esInstructora={esInstructorTop}
              onCrear={crearClases}
              onCerrar={() => setShowForm(null)}
            />
          )
        ) : (
        <>
            <div className="px-6 py-5 flex items-center justify-between border-b border-border shrink-0">
              <h2 className="text-lg font-extrabold text-foreground tracking-tight">Editar clase</h2>
              <button onClick={() => setShowForm(null)} aria-label="Cerrar" className="w-8 h-8 rounded-full bg-muted flex items-center justify-center hover:bg-border transition-colors">
                <X size={16} className="text-foreground" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <FormField label="Tipo de clase">
                  <select
                    className={selectCls}
                    value={form.tipoClaseId}
                    onChange={e => {
                      const tipoClaseId = e.target.value;
                      const tc = tiposClase.find(x => x.id === tipoClaseId);
                      setForm(f => ({
                        ...f,
                        tipoClaseId,
                        horaFin: finSegunDuracion(f.horaInicio, tipoClaseId),
                        aforoMaximo: f.aforoTocado
                          ? f.aforoMaximo
                          : aforoPorDefectoDeSesion(tc?.aforoPorDefecto, salas.find(x => x.id === f.salaId)?.capacidad, f.aforoMaximo),
                      }));
                    }}
                  >
                    {!form.tipoClaseId && (
                      <option value="">{tiposClase.length ? 'Elige un tipo de clase' : 'Todavía no tienes tipos de clase'}</option>
                    )}
                    {/* Los activos y el que la clase ya tiene: se puede editar una
                        clase de un tipo archivado sin cambiárselo. */}
                    {tiposParaProgramar(tiposClase, sesionActual?.tipoClaseId).map(t => (
                      <option key={t.id} value={t.id}>{t.nombre}{estaArchivado(t) ? ' · archivado' : ''}</option>
                    ))}
                  </select>
                </FormField>
                <FormField label="Sala">
                  <select className={selectCls} value={form.salaId} onChange={e => {
                    const salaId = e.target.value;
                    const cap = salas.find(x => x.id === salaId)?.capacidad;
                    setForm(f => ({
                      ...f,
                      salaId,
                      aforoMaximo: f.aforoTocado
                        ? f.aforoMaximo
                        : aforoPorDefectoDeSesion(tiposClase.find(x => x.id === f.tipoClaseId)?.aforoPorDefecto, cap, f.aforoMaximo),
                    }));
                  }}>
                    {!form.salaId && (
                      <option value="">{salas.length ? 'Elige una sala' : 'Todavía no tienes salas'}</option>
                    )}
                    {salas.map(s => <option key={s.id} value={s.id}>{s.nombre}</option>)}
                  </select>
                </FormField>
              </div>
              {/* Una instructora crea y edita solo su PROPIA clase: no se le
                  ofrece elegir instructora (la RLS 20260730109000/
                  20260731100000 rechazaría el UPDATE/INSERT si lo intentara).
                  Aplica también al EDITAR, no solo al alta — antes solo se
                  ocultaba en 'nueva', así que al editar su propia clase veía
                  el desplegable completo, podía tocarlo sin querer y recibía
                  un error crudo de la BD al guardar en vez de no ver la
                  opción siquiera. */}
              {!esInstructorTop && (
              <FormField label="Instructora">
                <select className={selectCls} value={form.instructorId} onChange={e => setForm(f => ({ ...f, instructorId: e.target.value }))}>
                  {!form.instructorId && (
                    <option value="">{!instructoresForm.length ? 'Todavía no tienes instructoras' : 'Sin instructora'}</option>
                  )}
                  {instructoresForm.map(i => { const au = ausenciaEnFecha(ausencias, i.id, form.fecha || new Date()); return <option key={i.id} value={i.id}>{i.nombre}{i.activo ? '' : ' · ya no está en el equipo'}{sufijoAusencia(au)}</option>; })}
                </select>
              </FormField>
              )}
              <FormField label="Fecha">
                <input type="date" className={inputCls} value={form.fecha} onChange={e => setForm(f => ({ ...f, fecha: e.target.value }))} />
              </FormField>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <FormField label="Hora inicio">
                  <input
                    type="time"
                    className={inputCls}
                    value={form.horaInicio}
                    onChange={e => setForm(f => ({
                      ...f,
                      horaInicio: e.target.value,
                      horaFin: finSegunDuracion(e.target.value, f.tipoClaseId),
                    }))}
                  />
                </FormField>
                <FormField label="Hora fin">
                  <input type="time" className={inputCls} value={form.horaFin} onChange={e => setForm(f => ({ ...f, horaFin: e.target.value }))} />
                </FormField>
              </div>
              <FormField label="Aforo máximo" description={fraseAlLlenarse(studio, tiposClase.find(t => t.id === form.tipoClaseId))}>
                <input type="number" min={1} max={300} className={inputCls} value={form.aforoMaximo}
                  onChange={e => setForm(f => ({ ...f, aforoMaximo: Number(e.target.value), aforoTocado: true }))} />
              </FormField>
              <AvisoAforoSala salas={salas} salaId={form.salaId} aforo={form.aforoMaximo} />
              <FormField label="Notas (opcional)">
                <textarea
                  className={inputCls + ' resize-none h-20'}
                  value={form.notas}
                  onChange={e => setForm(f => ({ ...f, notas: e.target.value }))}
                  placeholder="Indicaciones especiales, material necesario..."
                />
              </FormField>
            </div>

            {faltaConfigurar && (
              <div className="px-6 pb-1 shrink-0">
                <div className="rounded-xl px-3.5 py-2.5 text-xs bg-warning/10 border border-warning/30 text-amber-900 flex gap-2">
                  <AlertTriangle size={14} className="shrink-0 mt-0.5 text-warning" />
                  <div>
                    <p>Para crear la clase falta {faltaConfigurar.faltan.join(', ')}.</p>
                    {faltaConfigurar.porCrear.map(x => (
                      <p key={x.href} className="mt-1" data-testid="falta-crear">
                        {x.texto}{' '}
                        <Link href={x.href} className="underline font-semibold">{x.enlace}</Link>{' '}
                        y vuelve aquí.
                      </p>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {horaInvalida && !faltaConfigurar && (
              <div className="px-6 pb-1 shrink-0">
                <div className="rounded-xl px-3.5 py-2.5 text-xs bg-destructive/10 border border-destructive/30 text-destructive flex gap-2">
                  <AlertTriangle size={14} className="shrink-0 mt-0.5 text-destructive" />
                  <p>La hora de fin debe ser posterior a la hora de inicio.</p>
                </div>
              </div>
            )}
            {horaVacia && !faltaConfigurar && (
              <div className="px-6 pb-1 shrink-0">
                <div className="rounded-xl px-3.5 py-2.5 text-xs bg-destructive/10 border border-destructive/30 text-destructive flex gap-2">
                  <AlertTriangle size={14} className="shrink-0 mt-0.5 text-destructive" />
                  <p>Elige la hora de inicio y la de fin.</p>
                </div>
              </div>
            )}

            {/* Conflicto de sala/instructora (I-1): BLOQUEA el guardado — la BD lo
                rechazaría igualmente (sesiones_sala_sin_solape, 0071, y
                sesiones_instructor_sin_solape, 0048); con escrituras optimistas
                dejarlo pasar significaría un fallo silencioso. Aforo (I-2) solo informa. */}
            {(conflictosForm || aforoSobrante > 0 || ausenciaInstructorForm) && (
              <div className="px-6 pb-1 shrink-0 space-y-2">
                {ausenciaInstructorForm && (
                  <div className="rounded-xl px-3.5 py-2.5 text-xs bg-warning/10 border border-warning/30 text-warning flex gap-2">
                    <AlertTriangle size={14} className="shrink-0 mt-0.5 text-warning" />
                    <p><span className="font-bold">{nombreInstructor(form.instructorId)}</span>{sufijoAusencia(ausenciaInstructorForm) ? sufijoAusencia(ausenciaInstructorForm).replace(' · ', ' está ') : ' está ausente'} ese día. Comprueba que sea una sustitución deliberada antes de guardar.</p>
                  </div>
                )}
                {conflictosForm && (
                  <div className="rounded-xl px-3.5 py-2.5 text-xs bg-destructive/10 border border-destructive/30 text-destructive flex gap-2">
                    <AlertTriangle size={14} className="shrink-0 mt-0.5 text-destructive" />
                    <div className="space-y-0.5">
                      {conflictosForm.sala.length > 0 && (
                        <p><span className="font-bold">{nombreSala(form.salaId)}</span> ya está ocupada: {conflictosForm.sala.map(c => `${formatHora(c.inicio)}–${formatHora(c.fin)}`).join(', ')}</p>
                      )}
                      {conflictosForm.instructor.length > 0 && (
                        <p><span className="font-bold">{nombreInstructor(form.instructorId)}</span> ya tiene clase: {conflictosForm.instructor.map(c => `${formatHora(c.inicio)}–${formatHora(c.fin)}`).join(', ')}</p>
                      )}
                      <p>Cambia la hora, la sala o la instructora para poder guardar.</p>
                    </div>
                  </div>
                )}
                {aforoSobrante > 0 && (
                  <div className="rounded-xl px-3.5 py-2.5 text-xs bg-warning/10 border border-warning/30 text-warning flex gap-2">
                    <AlertTriangle size={14} className="shrink-0 mt-0.5 text-warning" />
                    <p>Hay <span className="font-bold">{sesionActual?.confirmadas} confirmada{(sesionActual?.confirmadas ?? 0) !== 1 ? 's' : ''}</span> y bajas el aforo a {form.aforoMaximo}: {aforoSobrante} quedaría{aforoSobrante !== 1 ? 'n' : ''} por encima del cupo. No se moverán a lista de espera automáticamente.</p>
                  </div>
                )}
              </div>
            )}

            {showForm === 'editar' && sesionActual?.serieId ? (
              <div className="px-6 py-5 border-t border-border flex flex-col gap-2 shrink-0">
                <button
                  onClick={editarSesion}
                  disabled={horaInvalida || horaVacia || !!faltaConfigurar || !!conflictosForm}
                  className="w-full py-3 rounded-2xl text-sm font-extrabold text-brand-foreground transition-opacity hover:opacity-90 bg-brand disabled:opacity-50 disabled:pointer-events-none"
                >
                  Guardar solo esta clase
                </button>
                <button
                  onClick={pedirConfirmacionSerie}
                  disabled={horaInvalida || horaVacia || !!faltaConfigurar || !!conflictosForm}
                  className="w-full py-3 rounded-2xl text-sm font-bold border border-border text-foreground hover:bg-muted transition-colors disabled:opacity-50 disabled:pointer-events-none"
                >
                  Guardar esta y las siguientes
                </button>
              </div>
            ) : (
              <div className="px-6 py-5 border-t border-border shrink-0">
                <div className="flex gap-3">
                  <button onClick={() => setShowForm(null)} disabled={guardandoSesion} className="flex-1 py-3 rounded-2xl text-sm font-bold border border-border text-foreground hover:bg-muted transition-colors disabled:opacity-50">
                    Cancelar
                  </button>
                  <button
                    onClick={editarSesion}
                    disabled={horaInvalida || horaVacia || !!faltaConfigurar || !!conflictosForm || guardandoSesion}
                    className="flex-[2] py-3 rounded-2xl text-sm font-extrabold text-brand-foreground transition-opacity hover:opacity-90 bg-brand disabled:opacity-50 disabled:pointer-events-none"
                  >
                    {guardandoSesion
                      ? 'Guardando…'
                      : 'Guardar cambios'}
                  </button>
                </div>
              </div>
            )}
        </>
        )}
      </DashboardDrawer>

      {primeraClaseCreada != null && studio?.slug && (
        <ListoParaReservar
          slug={studio.slug}
          nombreEstudio={studio.nombre ?? 'tu estudio'}
          clasesCreadas={primeraClaseCreada}
          onSeguir={() => setPrimeraClaseCreada(null)}
        />
      )}

      <Dialog open={elegirQueCrear} onOpenChange={setElegirQueCrear}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-lg font-semibold text-foreground">¿Qué quieres crear?</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-2.5">
            <button
              type="button"
              onClick={() => { setElegirQueCrear(false); openNueva(); }}
              data-testid="crear-clase-suelta"
              className="flex items-start gap-3 rounded-xl border border-border bg-card p-4 text-left hover:bg-muted transition-colors"
            >
              <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted text-foreground"><Plus size={17} aria-hidden /></span>
              <span className="min-w-0">
                <span className="block text-sm font-bold text-foreground">Clase</span>
                <span className="block text-xs text-muted-foreground text-pretty">
                  Un día concreto, o varios si la repites: una clase suelta, un taller o una clase extra. Tus clientas la reservan.
                </span>
              </span>
            </button>
            <button
              type="button"
              onClick={() => { setElegirQueCrear(false); setInitialRecurrente(undefined); setShowRecurrentes(true); }}
              data-testid="crear-clase-fija"
              className="flex items-start gap-3 rounded-xl border border-border bg-card p-4 text-left hover:bg-muted transition-colors"
            >
              <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted text-foreground"><RefreshCw size={17} aria-hidden /></span>
              <span className="min-w-0">
                <span className="block text-sm font-bold text-foreground">Clase fija</span>
                <span className="block text-xs text-muted-foreground text-pretty">
                  Se repite cada semana a la misma hora. Tus clientas pueden quedarse fijas y no tienen que reservarla
                  cada semana.
                </span>
              </span>
            </button>
          </div>
        </DialogContent>
      </Dialog>

      <ModalClasesRecurrentes
        ausencias={ausencias}
        open={showRecurrentes}
        onClose={() => { setShowRecurrentes(false); setInitialRecurrente(undefined); }}
        tiposClase={tiposClase}
        instructores={instructoresActivos}
        salas={salas}
        onCrear={crearClasesRecurrentes}
        sesionesExistentes={existentesSlot}
        initial={initialRecurrente}
        studio={studio}
      />

      {renovarSerieDe && (
        <DialogoRenovarSerie
          serieId={renovarSerieDe.serieId}
          nombre={renovarSerieDe.nombre}
          // Al cerrar también se olvida el horario: «Renovar sola» se guarda sin
          // renovar, y la tarjeta tiene que decir si se renueva sola.
          onClose={() => { setRenovarSerieDe(null); invalidarHorario(); }}
          onHecho={(mensaje, renovada) => {
            setRenovarSerieDe(null);
            invalidarHorario();
            showToast(mensaje);
            // Las clases nuevas las ha creado el servidor: se olvida la caché de
            // todas las semanas y se vuelve a pedir la que se está viendo.
            if (renovada) {
              cacheVistaRef.current.clear();
              void refrescarVista();
            }
          }}
        />
      )}

      {/* Clase llena: se pregunta ANTES de dejar a nadie en lista de espera. */}
      <Dialog open={confirmarEspera !== null} onOpenChange={open => !open && setConfirmarEspera(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-[15px] font-semibold text-foreground">
              Esta clase está llena
            </DialogTitle>
          </DialogHeader>
          <p className="text-[13px] text-muted-foreground mt-2">
            <strong className="text-foreground">{confirmarEspera?.nombre}</strong> no entra en la
            clase: quedaría en <strong className="text-foreground">lista de espera, en el puesto nº {confirmarEspera?.posicion}</strong>.
            Solo entrará si alguien cancela.
          </p>
          <div className="flex gap-2 mt-4">
            <button
              className="flex-1 justify-center py-2.5 rounded-xl border border-border text-[13px] font-medium text-foreground hover:bg-muted transition-colors"
              onClick={() => setConfirmarEspera(null)}
            >
              No, déjalo
            </button>
            <button
              className="flex-1 justify-center py-2.5 rounded-xl bg-brand text-brand-foreground text-[13px] font-bold hover:opacity-90 transition-opacity"
              onClick={() => {
                if (confirmarEspera) void confirmarAddReserva(confirmarEspera.sesionId, confirmarEspera.socioId);
                setConfirmarEspera(null);
              }}
            >
              Sí, a la lista de espera
            </button>
          </div>
        </DialogContent>
      </Dialog>

      {/* La clase ya está guardada; lo único que se decide aquí es si se avisa. */}
      {/* ── Confirmación del lote ─────────────────────────────────────────────────
          Lo que se agrupa aquí es LA DECISIÓN, no los correos: cada clase que
          cambia genera su aviso, porque cada una es información distinta para
          quien está apuntada. Lo que desaparece es tener que contestar «¿aviso?»
          una vez por clase.
          El recuento de arriba sí es de PERSONAS distintas, no de reservas:
          «2 alumnas» con una apuntada a las dos clases, no «3». */}
      <Dialog open={reasignarLote !== null} onOpenChange={open => !open && setReasignarLote(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-[15px] font-semibold text-foreground">
              {(() => {
                const n = reasignarLote ? loteReasignable(reasignarLote.instructorId).mueven.length : 0;
                return `¿Pasar ${n} clase${n === 1 ? '' : 's'} a ${reasignarLote?.nombre}?`;
              })()}
            </DialogTitle>
          </DialogHeader>
          {reasignarLote && (() => {
            const { mueven, descartadas, alumnas } = loteReasignable(reasignarLote.instructorId);
            return (
              <>
                <p className="text-[13px] text-muted-foreground mt-2">
                  {alumnas === 0
                    ? 'No hay ninguna alumna apuntada en esas clases.'
                    : <>Hay <strong className="text-foreground">{alumnas} alumna{alumnas === 1 ? '' : 's'}</strong> apuntada{alumnas === 1 ? '' : 's'} en total. Si avisas, {alumnas === 1 ? 'recibe' : 'reciben'} un correo por cada clase suya que cambie.</>}
                  {descartadas > 0 && (
                    <> {descartadas} de las marcadas no se {descartadas === 1 ? 'mueve' : 'mueven'}: ya {descartadas === 1 ? 'la da' : 'las da'} esa instructora, o la clase ya empezó.</>
                  )}
                </p>
                <div className="flex flex-wrap gap-2 mt-4">
                  <button
                    disabled={reasignando}
                    className="flex-1 justify-center py-2.5 rounded-xl border border-border text-[13px] font-medium text-foreground hover:bg-muted transition-colors disabled:opacity-50"
                    onClick={() => setReasignarLote(null)}
                  >
                    Cancelar
                  </button>
                  <button
                    disabled={reasignando || mueven.length === 0}
                    className="flex-1 justify-center py-2.5 rounded-xl border border-border text-[13px] font-medium text-foreground hover:bg-muted transition-colors disabled:opacity-50"
                    onClick={() => void aplicarReasignacionLote(reasignarLote.instructorId, false)}
                  >
                    Cambiar sin avisar
                  </button>
                  <button
                    disabled={reasignando || mueven.length === 0}
                    className="flex-1 justify-center py-2.5 rounded-xl bg-brand text-brand-foreground text-[13px] font-bold hover:opacity-90 transition-opacity disabled:opacity-50"
                    onClick={() => void aplicarReasignacionLote(reasignarLote.instructorId, true)}
                  >
                    {reasignando ? 'Cambiando…' : alumnas === 0 ? 'Cambiar' : 'Cambiar y avisar'}
                  </button>
                </div>
              </>
            );
          })()}
        </DialogContent>
      </Dialog>

      <Dialog open={avisoInstructora !== null} onOpenChange={open => !open && setAvisoInstructora(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-[15px] font-semibold text-foreground">
              ¿Aviso a {avisoInstructora?.apuntadas === 0
                ? 'las clientas apuntadas'
                : avisoInstructora?.apuntadas === 1 ? 'la clienta' : `las ${avisoInstructora?.apuntadas} clientas`}?
            </DialogTitle>
          </DialogHeader>
          <p className="text-[13px] text-muted-foreground mt-2">
            Has cambiado quién da la clase{avisoInstructora?.instructora ? <> — ahora la da <strong className="text-foreground">{avisoInstructora.instructora}</strong></> : null}.
            {' '}Puedo avisarlas por email y por la app. El horario y la sala no cambian.
          </p>
          <div className="flex gap-2 mt-4">
            <button
              className="flex-1 justify-center py-2.5 rounded-xl border border-border text-[13px] font-medium text-foreground hover:bg-muted transition-colors"
              onClick={() => setAvisoInstructora(null)}
            >
              No hace falta
            </button>
            <button
              className="flex-1 justify-center py-2.5 rounded-xl bg-brand text-brand-foreground text-[13px] font-bold hover:opacity-90 transition-opacity"
              onClick={() => {
                const aviso = avisoInstructora;
                setAvisoInstructora(null);
                if (!aviso) return;
                void avisarCambioInstructora(aviso);
              }}
            >
              Sí, avisar
            </button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Fase 2: confirmación al arrastrar una clase con clientas apuntadas ──── */}
      <Dialog open={confirmarArrastre !== null} onOpenChange={open => !open && setConfirmarArrastre(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-[15px] font-semibold text-foreground">
              ¿Mover {confirmarArrastre?.destinoTexto} y avisar a{' '}
              {confirmarArrastre?.apuntadas === 1 ? 'la clienta' : `las ${confirmarArrastre?.apuntadas} clientas`}?
            </DialogTitle>
          </DialogHeader>
          <p className="text-[13px] text-muted-foreground mt-2">
            Hay reservas confirmadas en esta clase — al moverla les avisamos por email del nuevo horario.
          </p>
          {(confirmarArrastre?.plazasFijas ?? 0) > 0 && (
            <p className="text-[13px] text-muted-foreground mt-2">
              {avisoPlazaFijaNoSeMueve(confirmarArrastre?.plazasFijas ?? 0)}
            </p>
          )}
          <div className="flex gap-2 mt-4">
            <button
              className="flex-1 justify-center py-2.5 rounded-xl border border-border text-[13px] font-medium text-foreground hover:bg-muted transition-colors"
              onClick={() => setConfirmarArrastre(null)}
            >
              Cancelar
            </button>
            <button
              className="flex-1 justify-center py-2.5 rounded-xl bg-brand text-brand-foreground text-[13px] font-bold hover:opacity-90 transition-opacity"
              onClick={() => {
                const c = confirmarArrastre;
                setConfirmarArrastre(null);
                if (!c) return;
                void ejecutarMoverSesion(c.sesionId, c.nuevoSalaId, c.nuevoInicio, c.nuevoFin);
              }}
            >
              Mover y avisar
            </button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Punto 4: diálogos de CUBRIR / OFRECER / AJUSTAR_AFORO ───────────────── */}
      {dialogoAccion?.tipo === 'OFRECER' && (
        <DialogoDecision
          abierto
          titulo="Ofrecer la plaza libre"
          cuerpo={<p>Se ofrecerá el hueco libre a la siguiente persona en lista de espera.</p>}
          onConfirmar={() => void ejecutarOfrecerPlaza(dialogoAccion.sesionId)}
          textoConfirmar="Ofrecer plaza"
          onCerrar={() => setDialogoAccion(null)}
        />
      )}

      {dialogoAccion?.tipo === 'AJUSTAR_AFORO' && (() => {
        const s = datosVista?.sesiones.find(x => x.id === dialogoAccion.sesionId);
        if (!s) return null;
        const sala = datosVista?.salas.find(x => x.id === s.salaId);
        if (!sala) return null;
        const r = reservasPorSesion.get(s.id) ?? [];
        const confirmadas = r.filter(x => x.estado === 'CONFIRMADA' || x.estado === 'ASISTIDA').length;
        const permitido = puedeAjustarAforoASalaCapacidad(confirmadas, sala.capacidad);
        return (
          <DialogoDecision
            abierto
            titulo={`Ajustar aforo a ${sala.capacidad}`}
            cuerpo={<p>{permitido
              ? `Se bajará el aforo de esta clase a ${sala.capacidad} (capacidad de ${sala.nombre}). No afecta a ninguna clienta confirmada.`
              : motivoAforoBloqueado(confirmadas, sala.capacidad)}</p>}
            onConfirmar={permitido ? () => void ejecutarAjustarAforo(s.id, sala.capacidad) : null}
            textoConfirmar="Ajustar"
            onCerrar={() => setDialogoAccion(null)}
          />
        );
      })()}

      {/* ── Reportar/editar incidencia (necesario para que el estado INCIDENCIA sea alcanzable) ── */}
      <Dialog open={dialogoIncidencia !== null} onOpenChange={open => !open && setDialogoIncidencia(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-[15px] font-semibold text-foreground">Incidencia de esta clase</DialogTitle>
          </DialogHeader>
          <textarea
            className={inputCls + ' resize-none h-24 mt-2'}
            placeholder="Ej. sala sin luz, gotera, se ha ido la calefacción..."
            value={dialogoIncidencia?.texto ?? ''}
            onChange={e => setDialogoIncidencia(prev => prev && { ...prev, texto: e.target.value })}
          />
          <p className="text-[11px] text-muted-foreground mt-1">Una nota para tu equipo, solo en esta clase. Déjalo en blanco y guarda para borrarla.</p>
          {/* ⚠️ El ejemplo de este campo era «reformer averiado», y aquí eso no
              hace nada: es una nota de texto. Quien de verdad baja el aforo de
              todas las clases de esa sala es «Averías de máquina»
              (en Salas, dentro de Configuración), y con el ejemplo anterior la propietaria
              escribía la avería aquí, se quedaba tranquila y seguía vendiendo
              una plaza que no existía. Dos cosas con el mismo vocabulario y
              distinto efecto: ahora esta se queda con lo que sí resuelve y
              señala a la otra. */}
          <Link
            href="/configuracion?tab=estudio&abrir=salas"
            className="mt-2 inline-flex items-center gap-1 text-[11px] font-semibold text-brand-medio hover:underline"
          >
            ¿Se ha averiado una máquina? Márcalo en Salas y baja el aforo solo
            <ChevronRight size={12} />
          </Link>
          <div className="flex gap-2 mt-4">
            <button className="flex-1 justify-center py-2.5 rounded-xl border border-border text-[13px] font-medium text-foreground hover:bg-muted transition-colors" onClick={() => setDialogoIncidencia(null)}>
              Cancelar
            </button>
            <button className="flex-1 justify-center py-2.5 rounded-xl bg-brand text-brand-foreground text-[13px] font-bold hover:opacity-90 transition-opacity" onClick={guardarIncidencia}>
              Guardar
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
