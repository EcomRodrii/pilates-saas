'use client';

import { createContext, useContext, useState, useEffect, type ReactNode } from 'react';
import {
  fetchAllStudioData,
  dbInsertSocio, dbUpdateSocio, dbDeleteSocio,
  dbInsertSuscripcion, dbUpdateSuscripcion,
  dbInsertSesion, dbUpdateSesion, dbDeleteSesion,
  dbInsertReserva, dbUpdateReserva,
  dbInsertRecibo, dbUpdateRecibo, dbDeleteRecibo,
  dbInsertFactura,
  dbInsertCita, dbUpdateCita,
  dbInsertVentaPOS,
  dbInsertActividadReciente,
  dbInsertNotaInterna, dbDeleteNotaInterna,
  dbInsertCampana, dbDeleteCampana,
  dbInsertAutomatizacion, dbUpdateAutomatizacion,
  dbInsertVideoOnDemand, dbUpdateVideoOnDemand,
  dbInsertPostComunidad, dbUpdatePostComunidad,
} from '@/lib/supabase-data';
import type {
  Socio,
  AceptacionContrato,
  Suscripcion,
  Sesion,
  Reserva,
  Recibo,
  Factura,
  PlanTarifa,
  Sala,
  TipoClase,
  Instructor,
  Spot,
  NotaInterna,
  Cita,
  EstadoCita,
  ProductoPOS,
  VentaPOS,
  ItemVentaPOS,
  MetodoPago,
  Campana,
  EstadoCampana,
  TipoCampana,
  DestinatariosCampana,
  Automatizacion,
  CodigoDescuento,
  ActividadReciente,
  TipoActividad,
  Notificacion,
  VideoOnDemand,
  PostComunidad,
  AutomationRule,
  AutomationLog,
  NotaProgreso,
  AccionAutomatica,
  ResultadoLog,
} from '@/lib/types';

// ─── Studio config (policy / terms) ─────────────────────────────────────────

export interface StudioConfig {
  politicaPrivacidad: string;
  terminosServicio: string;
}

export const defaultStudioConfig: StudioConfig = {
  politicaPrivacidad: `POLÍTICA DE PRIVACIDAD

En cumplimiento del Reglamento (UE) 2016/679 del Parlamento Europeo (RGPD), le informamos que sus datos personales serán incorporados a nuestros ficheros con la finalidad de gestionar su inscripción y la prestación de los servicios contratados.

RESPONSABLE DEL TRATAMIENTO
El responsable del tratamiento de sus datos es el estudio de pilates (en adelante, "el Estudio").

FINALIDAD Y LEGITIMACIÓN
Sus datos serán tratados para la gestión de membresías, facturación y comunicaciones relacionadas con los servicios contratados. La base legal es la ejecución del contrato y el cumplimiento de obligaciones legales.

CONSERVACIÓN
Sus datos se conservarán durante la vigencia de la relación contractual y, una vez finalizada, durante los plazos legalmente establecidos.

DERECHOS
Puede ejercer sus derechos de acceso, rectificación, supresión, limitación, portabilidad y oposición enviando un escrito a la dirección del estudio.`,

  terminosServicio: `TÉRMINOS Y CONDICIONES DE SERVICIO

1. OBJETO
El presente contrato regula las condiciones de acceso y uso de los servicios de pilates ofrecidos por el Estudio.

2. PLANES Y TARIFAS
El socio abona la tarifa correspondiente al plan seleccionado. Los precios incluyen IVA. El Estudio se reserva el derecho de modificar tarifas con un preaviso mínimo de 30 días.

3. RESERVAS Y CANCELACIONES
Las reservas deben realizarse con antelación a través de los canales habilitados. Las cancelaciones efectuadas con menos de 12 horas de antelación serán descontadas del bono.

4. RESPONSABILIDAD
El socio declara estar en condiciones físicas adecuadas para la práctica de pilates. El Estudio no se responsabiliza de lesiones derivadas del incumplimiento de las indicaciones del instructor.

5. VIGENCIA
El contrato estará vigente mientras se mantenga la suscripción activa. Cualquiera de las partes podrá resolver el contrato con un preaviso de 15 días.

6. ACEPTACIÓN
La firma de este documento supone la aceptación íntegra de las presentes condiciones.`,
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function uid() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

// ─── Context shape ────────────────────────────────────────────────────────────

interface StudioContextValue {
  // Static reference data
  planesTarifa: PlanTarifa[];
  salas: Sala[];
  tiposClase: TipoClase[];
  instructores: Instructor[];
  spots: Spot[];

  // Mutable state
  socios: Socio[];
  suscripciones: Suscripcion[];
  sesiones: Sesion[];
  reservas: Reserva[];
  recibos: Recibo[];
  facturas: Factura[];
  notasInternas: NotaInterna[];

  // Socios
  addSocio: (fields: Omit<Socio, 'id' | 'studioId' | 'fechaAlta'> & { planId?: string }) => void;
  addSocioFromPortal: (fields: { id: string; nombre: string; email: string; aceptacionContrato?: AceptacionContrato }) => void;
  updateSocio: (id: string, changes: Partial<Socio>) => void;
  deleteSocio: (id: string) => void;
  addTagSocio: (socioId: string, tag: string) => void;
  removeTagSocio: (socioId: string, tag: string) => void;

  // Suscripciones
  assignPlan: (socioId: string, planId: string | null) => void;
  pausarSuscripcion: (susId: string) => void;
  reanudarSuscripcion: (susId: string) => void;

  // Notas internas
  addNota: (socioId: string, texto: string) => void;
  deleteNota: (notaId: string) => void;

  // Sesiones
  addSesion: (fields: Omit<Sesion, 'id' | 'studioId'>) => void;
  updateSesion: (id: string, changes: Partial<Sesion>) => void;
  deleteSesion: (id: string) => void;

  // Reservas
  addReserva: (sesionId: string, socioId: string) => void;
  cancelarReserva: (reservaId: string) => void;
  checkin: (reservaId: string) => void;
  liberarSpot: (reservaId: string) => void;
  asignarSpot: (sesionId: string, socioId: string, spotId: string) => void;

  // Recibos
  addRecibo: (fields: Omit<Recibo, 'id' | 'studioId' | 'estado' | 'fechaCobro' | 'fechaDevolucion' | 'intentosReintento'>) => void;
  marcarCobrado: (reciboId: string) => void;
  marcarDevuelto: (reciboId: string) => void;
  reintentar: (reciboId: string) => void;
  deleteRecibo: (id: string) => void;
  cobrarTodosPendientes: () => void;

  // Citas
  citas: Cita[];
  addCita: (fields: Omit<Cita, 'id' | 'studioId' | 'creadoEn'>) => void;
  updateCita: (id: string, changes: Partial<Cita>) => void;
  cancelarCita: (citaId: string) => void;
  completarCita: (citaId: string) => void;

  // POS
  productosPOS: ProductoPOS[];
  ventasPOS: VentaPOS[];
  addVentaPOS: (fields: Omit<VentaPOS, 'id' | 'studioId' | 'realizadaEn'>) => void;

  // Campañas
  campanas: Campana[];
  addCampana: (fields: Omit<Campana, 'id' | 'studioId' | 'creadaEn' | 'enviados' | 'abiertos' | 'clics'>) => void;
  deleteCampana: (id: string) => void;
  duplicateCampana: (campana: Campana) => void;

  // Automatizaciones
  automatizaciones: Automatizacion[];
  addAutomatizacion: (fields: Omit<Automatizacion, 'id' | 'studioId' | 'ejecutadas' | 'creadaEn'>) => void;
  toggleAutomatizacion: (autoId: string) => void;

  // Códigos de descuento
  codigosDescuento: CodigoDescuento[];
  addCodigoDescuento: (fields: Omit<CodigoDescuento, 'id' | 'studioId' | 'usos' | 'creadoEn'>) => void;
  toggleCodigoDescuento: (codigoId: string) => void;
  deleteCodigoDescuento: (id: string) => void;

  // Actividad reciente
  actividadReciente: ActividadReciente[];
  addActividadReciente: (tipo: TipoActividad, texto: string, socioId?: string, enlace?: string) => void;

  // Notificaciones
  notificaciones: Notificacion[];
  marcarNotificacionLeida: (notiId: string) => void;

  // Videos on demand
  videosOnDemand: VideoOnDemand[];
  addVideo: (fields: Omit<VideoOnDemand, 'id' | 'studioId' | 'vistas' | 'likes' | 'creadoEn'>) => void;
  toggleVideo: (videoId: string) => void;

  // Comunidad
  postsComunidad: PostComunidad[];
  addPost: (texto: string) => void;
  toggleLikePost: (postId: string) => void;
  marcarTodasLeidas: () => void;
  // Planes (mutable)
  addPlan: (fields: Omit<PlanTarifa, 'id' | 'studioId'>) => void;
  updatePlan: (id: string, changes: Partial<Omit<PlanTarifa, 'id' | 'studioId'>>) => void;
  deletePlan: (id: string) => void;

  // Salas (mutable)
  addSala: (fields: Omit<Sala, 'id' | 'studioId'>) => void;
  updateSala: (id: string, changes: Partial<Omit<Sala, 'id' | 'studioId'>>) => void;
  deleteSala: (id: string) => void;

  // Tipos de clase (mutable)
  addTipoClase: (fields: Omit<TipoClase, 'id' | 'studioId'>) => void;
  updateTipoClase: (id: string, changes: Partial<Omit<TipoClase, 'id' | 'studioId'>>) => void;
  deleteTipoClase: (id: string) => void;

  // Instructores (mutable)
  addInstructor: (fields: Omit<Instructor, 'id' | 'studioId'>) => void;
  updateInstructor: (id: string, changes: Partial<Omit<Instructor, 'id' | 'studioId'>>) => void;
  deleteInstructor: (id: string) => void;

  // Studio config (policy, terms)
  studioConfig: StudioConfig;
  updateStudioConfig: (changes: Partial<StudioConfig>) => void;

  // Motor de automatización avanzado
  automationRules: AutomationRule[];
  automationLogs: AutomationLog[];
  notasProgreso: NotaProgreso[];
  toggleAutomationRule: (id: string) => void;
  addAutomationLog: (log: Omit<AutomationLog, 'id' | 'studioId'>) => void;
  runAutomation: () => AutomationLog[];
  addNotaProgreso: (nota: Omit<NotaProgreso, 'id' | 'studioId' | 'creadaEn'>) => void;
  dismissLog: (id: string) => void;

  // Studio management
  resetDatosPilates: () => void;
  dataLoaded: boolean;
}

// ─── Context ──────────────────────────────────────────────────────────────────

const StudioContext = createContext<StudioContextValue | null>(null);

export function useStudio(): StudioContextValue {
  const ctx = useContext(StudioContext);
  if (!ctx) throw new Error('useStudio must be used within StudioProvider');
  return ctx;
}

// ─── Provider ─────────────────────────────────────────────────────────────────

export function StudioProvider({ children }: { children: ReactNode }) {
  const [dataLoaded, setDataLoaded] = useState(false);

  const [planesTarifa, setPlanesTarifa] = useState<PlanTarifa[]>([]);
  const [salas, setSalas] = useState<Sala[]>([]);
  const [tiposClase, setTiposClase] = useState<TipoClase[]>([]);
  const [instructores, setInstructores] = useState<Instructor[]>([]);
  const [spots, setSpots] = useState<Spot[]>([]);

  const [socios, setSocios] = useState<Socio[]>([]);
  const [suscripciones, setSuscripciones] = useState<Suscripcion[]>([]);
  const [sesiones, setSesiones] = useState<Sesion[]>([]);
  const [reservas, setReservas] = useState<Reserva[]>([]);
  const [recibos, setRecibos] = useState<Recibo[]>([]);
  const [facturas, setFacturas] = useState<Factura[]>([]);
  const [notasInternas, setNotasInternas] = useState<NotaInterna[]>([]);

  const [citas, setCitas] = useState<Cita[]>([]);
  const [productosPOS, setProductosPOS] = useState<ProductoPOS[]>([]);
  const [ventasPOS, setVentasPOS] = useState<VentaPOS[]>([]);
  const [campanas, setCampanas] = useState<Campana[]>([]);
  const [automatizaciones, setAutomatizaciones] = useState<Automatizacion[]>([]);
  const [codigosDescuento, setCodigosDescuento] = useState<CodigoDescuento[]>([]);
  const [actividadReciente, setActividadReciente] = useState<ActividadReciente[]>([]);
  const [notificaciones, setNotificaciones] = useState<Notificacion[]>([]);
  const [videosOnDemand, setVideosOnDemand] = useState<VideoOnDemand[]>([]);
  const [postsComunidad, setPostsComunidad] = useState<PostComunidad[]>([]);
  const [studioConfig, setStudioConfig] = useState<StudioConfig>(defaultStudioConfig);

  const [automationRules, setAutomationRules] = useState<AutomationRule[]>([]);
  const [automationLogs, setAutomationLogs] = useState<AutomationLog[]>([]);
  const [notasProgreso, setNotasProgreso] = useState<NotaProgreso[]>([]);

  // ── Fetch all data from Supabase on mount ────────────────────────────────────
  useEffect(() => {
    fetchAllStudioData().then(data => {
      setPlanesTarifa(data.planesTarifa);
      setSalas(data.salas);
      setTiposClase(data.tiposClase);
      setInstructores(data.instructores);
      setSpots(data.spots);
      setSocios(data.socios);
      setSuscripciones(data.suscripciones);
      setSesiones(data.sesiones);
      setReservas(data.reservas);
      setRecibos(data.recibos);
      setFacturas(data.facturas);
      setNotasInternas(data.notasInternas);
      setCitas(data.citas);
      setProductosPOS(data.productosPOS);
      setVentasPOS(data.ventasPOS);
      setCampanas(data.campanas);
      setAutomatizaciones(data.automatizaciones);
      setCodigosDescuento(data.codigosDescuento);
      setActividadReciente(data.actividadReciente);
      setNotificaciones(data.notificaciones);
      setVideosOnDemand(data.videosOnDemand);
      setPostsComunidad(data.postsComunidad);
      setAutomationRules(data.automationRules);
      setAutomationLogs(data.automationLogs);
      setNotasProgreso(data.notasProgreso);
      setDataLoaded(true);
    }).catch(err => {
      console.error('Error fetching Supabase data:', err);
      setDataLoaded(true);
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Auto-increment factura counter ──────────────────────────────────────────
  function nextFacturaNumero(existingFacturas: Factura[]): string {
    const year = new Date().getFullYear();
    const nums = existingFacturas
      .map(f => {
        const m = f.numeroCompleto.match(/A-\d{4}-(\d+)/);
        return m ? parseInt(m[1], 10) : 0;
      });
    const max = nums.length > 0 ? Math.max(...nums) : 0;
    return `A-${year}-${String(max + 1).padStart(4, '0')}`;
  }

  function buildFactura(recibo: Recibo, currentFacturas: Factura[]): Factura {
    const socio = socios.find(s => s.id === recibo.socioId);
    const baseImponible = Math.round((recibo.importe / 1.21) * 100) / 100;
    const cuotaIVA = Math.round((recibo.importe - baseImponible) * 100) / 100;
    return {
      id: `fac-auto-${uid()}`,
      studioId: 'studio-1',
      reciboId: recibo.id,
      numeroCompleto: nextFacturaNumero(currentFacturas),
      fechaEmision: new Date().toISOString(),
      receptorNombre: socio ? `${socio.nombre} ${socio.apellidos}` : 'Desconocido',
      receptorNIF: socio?.nif ?? null,
      baseImponible,
      tipoIVA: 21,
      cuotaIVA,
      total: recibo.importe,
      verifactuHash: null,
    };
  }

  // ── Socios ───────────────────────────────────────────────────────────────────

  // ── Planes ────────────────────────────────────────────────────────────────────

  function addPlan(fields: Omit<PlanTarifa, 'id' | 'studioId'>) {
    setPlanesTarifa(prev => [...prev, { ...fields, id: `plan-${uid()}`, studioId: 'studio-1' }]);
  }
  function updatePlan(id: string, changes: Partial<Omit<PlanTarifa, 'id' | 'studioId'>>) {
    setPlanesTarifa(prev => prev.map(p => p.id === id ? { ...p, ...changes } : p));
  }
  function deletePlan(id: string) {
    setPlanesTarifa(prev => prev.filter(p => p.id !== id));
  }

  // ── Salas ─────────────────────────────────────────────────────────────────────

  function addSala(fields: Omit<Sala, 'id' | 'studioId'>) {
    setSalas(prev => [...prev, { ...fields, id: `sala-${uid()}`, studioId: 'studio-1' }]);
  }
  function updateSala(id: string, changes: Partial<Omit<Sala, 'id' | 'studioId'>>) {
    setSalas(prev => prev.map(s => s.id === id ? { ...s, ...changes } : s));
  }
  function deleteSala(id: string) {
    setSalas(prev => prev.filter(s => s.id !== id));
  }

  // ── Tipos de clase ────────────────────────────────────────────────────────────

  function addTipoClase(fields: Omit<TipoClase, 'id' | 'studioId'>) {
    setTiposClase(prev => [...prev, { ...fields, id: `tc-${uid()}`, studioId: 'studio-1' }]);
  }
  function updateTipoClase(id: string, changes: Partial<Omit<TipoClase, 'id' | 'studioId'>>) {
    setTiposClase(prev => prev.map(t => t.id === id ? { ...t, ...changes } : t));
  }
  function deleteTipoClase(id: string) {
    setTiposClase(prev => prev.filter(t => t.id !== id));
  }

  // ── Instructores ──────────────────────────────────────────────────────────────

  function addInstructor(fields: Omit<Instructor, 'id' | 'studioId'>) {
    setInstructores(prev => [...prev, { ...fields, id: `ins-${uid()}`, studioId: 'studio-1' }]);
  }
  function updateInstructor(id: string, changes: Partial<Omit<Instructor, 'id' | 'studioId'>>) {
    setInstructores(prev => prev.map(i => i.id === id ? { ...i, ...changes } : i));
  }
  function deleteInstructor(id: string) {
    setInstructores(prev => prev.filter(i => i.id !== id));
  }

  // ── Socios ────────────────────────────────────────────────────────────────────

  function addSocio(fields: Omit<Socio, 'id' | 'studioId' | 'fechaAlta'> & { planId?: string; aceptacionContrato?: AceptacionContrato }) {
    const { planId, aceptacionContrato, ...socioFields } = fields;
    const ahora = new Date().toISOString();
    const nuevaSocia: Socio = {
      id: `soc-${uid()}`,
      studioId: 'studio-1',
      fechaAlta: ahora,
      ...(aceptacionContrato ? { aceptacionContrato } : {}),
      ...socioFields,
    };
    setSocios(prev => [...prev, nuevaSocia]);
    dbInsertSocio(nuevaSocia);
    if (planId) {
      const plan = planesTarifa.find(p => p.id === planId);
      if (plan) {
        const susId = `sus-${uid()}`;
        const sus: Suscripcion = {
          id: susId,
          studioId: 'studio-1',
          socioId: nuevaSocia.id,
          planId,
          estado: 'ACTIVA',
          fechaInicio: ahora,
          fechaFin: null,
          sesionesRestantes: plan.sesiones,
          stripeSubscriptionId: null,
        };
        setSuscripciones(prev => [...prev, sus]);
        dbInsertSuscripcion(sus);

        // Auto-generate a paid recibo + factura at enrolment
        const reciboId = `rec-${uid()}`;
        const reciboCobrado: Recibo = {
          id: reciboId,
          studioId: 'studio-1',
          socioId: nuevaSocia.id,
          suscripcionId: susId,
          concepto: `Alta — ${plan.nombre}`,
          importe: plan.precio,
          estado: 'COBRADO',
          fechaVencimiento: ahora,
          fechaCobro: ahora,
          fechaDevolucion: null,
          intentosReintento: 0,
        };
        setRecibos(prev => [...prev, reciboCobrado]);
        dbInsertRecibo(reciboCobrado);
        setFacturas(prev => {
          const fac = buildFactura(reciboCobrado, prev);
          dbInsertFactura(fac);
          return [...prev, fac];
        });
      }
    }
  }

  function addSocioFromPortal(fields: { id: string; nombre: string; email: string; aceptacionContrato?: AceptacionContrato }) {
    const nuevaSocia: Socio = {
      id: fields.id,
      studioId: 'studio-1',
      nombre: fields.nombre,
      apellidos: '',
      email: fields.email,
      telefono: null,
      nif: null,
      fechaAlta: new Date().toISOString(),
      activo: true,
      ...(fields.aceptacionContrato ? { aceptacionContrato: fields.aceptacionContrato } : {}),
    };
    setSocios(prev => [...prev, nuevaSocia]);
  }

  function updateStudioConfig(changes: Partial<StudioConfig>) {
    setStudioConfig(prev => ({ ...prev, ...changes }));
  }

  function updateSocio(id: string, changes: Partial<Socio>) {
    setSocios(prev => prev.map(s => s.id === id ? { ...s, ...changes } : s));
    dbUpdateSocio(id, changes);
  }

  function deleteSocio(id: string) {
    setSocios(prev => prev.filter(s => s.id !== id));
    setSuscripciones(prev => prev.filter(s => s.socioId !== id));
    setRecibos(prev => prev.filter(r => r.socioId !== id));
    setNotasInternas(prev => prev.filter(n => n.socioId !== id));
    dbDeleteSocio(id);
  }

  function addTagSocio(socioId: string, tag: string) {
    setSocios(prev => prev.map(s =>
      s.id === socioId
        ? { ...s, tags: [...new Set([...(s.tags ?? []), tag])] }
        : s
    ));
  }

  function removeTagSocio(socioId: string, tag: string) {
    setSocios(prev => prev.map(s =>
      s.id === socioId
        ? { ...s, tags: (s.tags ?? []).filter(t => t !== tag) }
        : s
    ));
  }

  // ── Notas internas ───────────────────────────────────────────────────────────

  function addNota(socioId: string, texto: string) {
    const nueva: NotaInterna = {
      id: `nota-${uid()}`,
      studioId: 'studio-1',
      socioId,
      texto: texto.trim(),
      tipo: 'NOTA',
      creadoEn: new Date().toISOString(),
    };
    setNotasInternas(prev => [nueva, ...prev]);
    dbInsertNotaInterna(nueva);
  }

  function deleteNota(notaId: string) {
    setNotasInternas(prev => prev.filter(n => n.id !== notaId));
    dbDeleteNotaInterna(notaId);
  }

  // ── Suscripciones ────────────────────────────────────────────────────────────

  function assignPlan(socioId: string, planId: string | null) {
    setSuscripciones(prev => {
      const deactivated = prev.map(s =>
        s.socioId === socioId && s.estado === 'ACTIVA'
          ? { ...s, estado: 'CANCELADA' as const }
          : s
      );
      if (!planId) return deactivated;
      const plan = planesTarifa.find(p => p.id === planId);
      if (!plan) return deactivated;
      const nueva: Suscripcion = {
        id: `sus-${uid()}`,
        studioId: 'studio-1',
        socioId,
        planId,
        estado: 'ACTIVA',
        fechaInicio: new Date().toISOString(),
        fechaFin: null,
        sesionesRestantes: plan.sesiones,
        stripeSubscriptionId: null,
      };
      return [...deactivated, nueva];
    });
  }

  function pausarSuscripcion(susId: string) {
    setSuscripciones(prev => prev.map(s =>
      s.id === susId && s.estado === 'ACTIVA' ? { ...s, estado: 'PAUSADA' as const } : s
    ));
  }

  function reanudarSuscripcion(susId: string) {
    setSuscripciones(prev => prev.map(s =>
      s.id === susId && s.estado === 'PAUSADA' ? { ...s, estado: 'ACTIVA' as const } : s
    ));
  }

  // ── Sesiones ─────────────────────────────────────────────────────────────────

  function addSesion(fields: Omit<Sesion, 'id' | 'studioId'>) {
    const nueva: Sesion = { id: `ses-${uid()}`, studioId: 'studio-1', ...fields };
    setSesiones(prev => [...prev, nueva]);
    dbInsertSesion(nueva);
  }

  function updateSesion(id: string, changes: Partial<Sesion>) {
    setSesiones(prev => prev.map(s => s.id === id ? { ...s, ...changes } : s));
    dbUpdateSesion(id, changes);
  }

  function deleteSesion(id: string) {
    setSesiones(prev => prev.filter(s => s.id !== id));
    setReservas(prev => prev.filter(r => r.sesionId !== id));
    dbDeleteSesion(id);
  }

  // ── Reservas ─────────────────────────────────────────────────────────────────

  function addReserva(sesionId: string, socioId: string) {
    const nueva: Reserva = {
      id: `res-${uid()}`,
      studioId: 'studio-1',
      sesionId,
      socioId,
      estado: 'CONFIRMADA',
      spotId: null,
      posicionEspera: null,
      checkInEn: null,
      creadoEn: new Date().toISOString(),
    };
    setReservas(prev => [...prev, nueva]);
    dbInsertReserva(nueva);
  }

  function cancelarReserva(reservaId: string) {
    let promotedSocioId: string | null = null;
    let promotedSesionId: string | null = null;

    setReservas(prev => {
      const updated = prev.map(r =>
        r.id === reservaId ? { ...r, estado: 'CANCELADA' as const } : r
      );
      dbUpdateReserva(reservaId, { estado: 'CANCELADA' });
      // Auto-promote first LISTA_ESPERA for same sesion
      const cancelada = prev.find(r => r.id === reservaId);
      if (!cancelada) return updated;
      const espera = updated.find(
        r => r.sesionId === cancelada.sesionId && r.estado === 'LISTA_ESPERA'
      );
      if (!espera) return updated;
      promotedSocioId = espera.socioId;
      promotedSesionId = espera.sesionId;
      dbUpdateReserva(espera.id, { estado: 'CONFIRMADA', posicion_espera: null });
      return updated.map(r =>
        r.id === espera.id ? { ...r, estado: 'CONFIRMADA' as const, posicionEspera: null } : r
      );
    });

    // Fire notification for promoted socia
    if (promotedSocioId && promotedSesionId) {
      const socio = socios.find(s => s.id === promotedSocioId);
      const sesion = sesiones.find(s => s.id === promotedSesionId);
      const tipo = sesion ? tiposClase.find(t => t.id === sesion.tipoClaseId) : null;
      const nombre = socio ? `${socio.nombre} ${socio.apellidos}` : 'Socia';
      const clase = tipo?.nombre ?? 'la clase';
      setNotificaciones(prev => [{
        id: `notif-promo-${uid()}`,
        studioId: 'studio-1',
        tipo: 'EXITO' as const,
        titulo: 'Lista de espera promovida',
        texto: `${nombre} ha pasado de lista de espera a confirmada en ${clase}.`,
        leida: false,
        creadaEn: new Date().toISOString(),
        enlace: promotedSocioId ? `/socios/${promotedSocioId}` : null,
      }, ...prev]);
      addActividadReciente('NUEVA_RESERVA', `${nombre} promovida de lista de espera → ${clase}`, promotedSocioId, `/socios/${promotedSocioId}`);
    }
  }

  function checkin(reservaId: string) {
    const checkInEn = new Date().toISOString();
    setReservas(prev => prev.map(r =>
      r.id === reservaId ? { ...r, estado: 'ASISTIDA' as const, checkInEn } : r
    ));
    dbUpdateReserva(reservaId, { estado: 'ASISTIDA', checkInEn });
    const reserva = reservas.find(r => r.id === reservaId);
    if (!reserva) return;
    const sus = suscripciones.find(s => s.socioId === reserva.socioId && s.estado === 'ACTIVA');
    if (!sus) return;
    const plan = planesTarifa.find(p => p.id === sus.planId);
    if (!plan) return;

    if ((plan.tipo === 'BONO' || plan.tipo === 'PUNTUAL') && sus.sesionesRestantes !== null) {
      const nuevasRestantes = Math.max(0, (sus.sesionesRestantes ?? 0) - 1);
      setSuscripciones(prev => prev.map(s =>
        s.id === sus.id ? { ...s, sesionesRestantes: nuevasRestantes } : s
      ));
      dbUpdateSuscripcion(sus.id, { sesionesRestantes: nuevasRestantes });

      // Bono agotado → generar recibo de renovación + notificación
      if (nuevasRestantes === 0) {
        const socio = socios.find(s => s.id === reserva.socioId);
        const nombreSocio = socio ? `${socio.nombre} ${socio.apellidos}` : 'Socia';
        const hoy = new Date().toISOString().slice(0, 10);
        const reciboRenovacion: Recibo = {
          id: `rec-renov-${uid()}`,
          studioId: 'studio-1',
          socioId: reserva.socioId,
          suscripcionId: sus.id,
          concepto: `Renovación ${plan.nombre}`,
          importe: plan.precio,
          estado: 'PENDIENTE',
          fechaVencimiento: hoy,
          fechaCobro: null,
          fechaDevolucion: null,
          intentosReintento: 0,
        };
        setRecibos(prev => [reciboRenovacion, ...prev]);
        dbInsertRecibo(reciboRenovacion);
        setNotificaciones(prev => [{
          id: `notif-bono-${uid()}`,
          studioId: 'studio-1',
          titulo: 'Bono agotado',
          texto: `${nombreSocio} ha consumido su último bono de ${plan.nombre}. Se ha generado un recibo de renovación.`,
          leida: false,
          tipo: 'AVISO' as const,
          enlace: `/socios/${reserva.socioId}`,
          creadaEn: new Date().toISOString(),
        }, ...prev]);
        addActividadReciente(
          'PAGO_PENDIENTE',
          `Bono agotado — ${nombreSocio} necesita renovar ${plan.nombre}`,
          reserva.socioId,
          `/socios/${reserva.socioId}`,
        );
      }
    }
  }

  // Detectar planes MENSUAL caducados al cargar (una vez por sesión)
  useEffect(() => {
    const hoy = new Date().toISOString().slice(0, 10);
    suscripciones.forEach(sus => {
      if (sus.estado !== 'ACTIVA' || !sus.fechaFin) return;
      if (sus.fechaFin >= hoy) return;
      const plan = planesTarifa.find(p => p.id === sus.planId);
      if (!plan || plan.tipo !== 'MENSUAL') return;
      const yaHayReciboPendiente = recibos.some(
        r => r.socioId === sus.socioId && r.suscripcionId === sus.id && r.estado === 'PENDIENTE'
      );
      if (yaHayReciboPendiente) return;
      const socio = socios.find(s => s.id === sus.socioId);
      const nombreSocio = socio ? `${socio.nombre} ${socio.apellidos}` : 'Socia';
      const reciboVencido: Recibo = {
        id: `rec-venc-${uid()}`,
        studioId: 'studio-1',
        socioId: sus.socioId,
        suscripcionId: sus.id,
        concepto: `Renovación ${plan.nombre}`,
        importe: plan.precio,
        estado: 'PENDIENTE',
        fechaVencimiento: sus.fechaFin,
        fechaCobro: null,
        fechaDevolucion: null,
        intentosReintento: 0,
      };
      setRecibos(prev => {
        if (prev.some(r => r.id === reciboVencido.id)) return prev;
        dbInsertRecibo(reciboVencido);
        return [reciboVencido, ...prev];
      });
      setNotificaciones(prev => [{
        id: `notif-venc-${uid()}`,
        studioId: 'studio-1',
        titulo: 'Plan mensual caducado',
        texto: `${nombreSocio} — ${plan.nombre} venció el ${sus.fechaFin}. Se ha generado recibo de renovación.`,
        leida: false,
        tipo: 'AVISO' as const,
        enlace: `/socios/${sus.socioId}`,
        creadaEn: new Date().toISOString(),
      }, ...prev]);
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function liberarSpot(reservaId: string) {
    setReservas(prev => prev.map(r =>
      r.id === reservaId ? { ...r, spotId: null } : r
    ));
    dbUpdateReserva(reservaId, { spotId: null });
  }

  function asignarSpot(sesionId: string, socioId: string, spotId: string) {
    const reserva = reservas.find(r => r.sesionId === sesionId && r.socioId === socioId);
    setReservas(prev => prev.map(r =>
      r.sesionId === sesionId && r.socioId === socioId ? { ...r, spotId } : r
    ));
    if (reserva) dbUpdateReserva(reserva.id, { spotId });
  }

  // ── Recibos ──────────────────────────────────────────────────────────────────

  function addRecibo(fields: Omit<Recibo, 'id' | 'studioId' | 'estado' | 'fechaCobro' | 'fechaDevolucion' | 'intentosReintento'>) {
    const nuevo: Recibo = {
      id: `rec-${uid()}`,
      studioId: 'studio-1',
      estado: 'PENDIENTE',
      fechaCobro: null,
      fechaDevolucion: null,
      intentosReintento: 0,
      ...fields,
    };
    setRecibos(prev => [...prev, nuevo]);
    dbInsertRecibo(nuevo);
  }

  function marcarCobrado(reciboId: string) {
    const fechaCobro = new Date().toISOString();
    setRecibos(prev => prev.map(r =>
      r.id === reciboId ? { ...r, estado: 'COBRADO' as const, fechaCobro } : r
    ));
    dbUpdateRecibo(reciboId, { estado: 'COBRADO', fecha_cobro: fechaCobro });
    setFacturas(prev => {
      // Avoid duplicate facturas for same recibo
      if (prev.some(f => f.reciboId === reciboId)) return prev;
      const recibo = recibos.find(r => r.id === reciboId) ??
        { id: reciboId, importe: 0, socioId: '', studioId: 'studio-1', suscripcionId: null, concepto: '', estado: 'PENDIENTE' as const, fechaVencimiento: new Date().toISOString(), fechaCobro: null, fechaDevolucion: null, intentosReintento: 0 };
      const updatedRecibo = { ...recibo, estado: 'COBRADO' as const, fechaCobro: new Date().toISOString() };
      const fac = buildFactura(updatedRecibo, prev);
      dbInsertFactura(fac);
      return [...prev, fac];
    });
    // Refill bono or extend mensual when renewal payment is collected
    const recibo = recibos.find(r => r.id === reciboId);
    if (recibo?.suscripcionId) {
      const sus = suscripciones.find(s => s.id === recibo.suscripcionId);
      if (sus) {
        const plan = planesTarifa.find(p => p.id === sus.planId);
        if (plan) {
          if ((plan.tipo === 'BONO' || plan.tipo === 'PUNTUAL') && sus.sesionesRestantes === 0) {
            setSuscripciones(prev => prev.map(s =>
              s.id === sus.id ? { ...s, sesionesRestantes: plan.sesiones, estado: 'ACTIVA' as const } : s
            ));
            dbUpdateSuscripcion(sus.id, { sesionesRestantes: plan.sesiones, estado: 'ACTIVA' });
          } else if (plan.tipo === 'MENSUAL') {
            const nuevaFin = new Date();
            nuevaFin.setMonth(nuevaFin.getMonth() + 1);
            const fechaFin = nuevaFin.toISOString().slice(0, 10);
            setSuscripciones(prev => prev.map(s =>
              s.id === sus.id ? { ...s, fechaFin, estado: 'ACTIVA' as const } : s
            ));
            dbUpdateSuscripcion(sus.id, { fechaFin, estado: 'ACTIVA' });
          }
        }
      }
    }
  }

  function marcarDevuelto(reciboId: string) {
    const fechaDev = new Date().toISOString();
    setRecibos(prev => prev.map(r =>
      r.id === reciboId ? { ...r, estado: 'DEVUELTO' as const, fechaDevolucion: fechaDev } : r
    ));
    dbUpdateRecibo(reciboId, { estado: 'DEVUELTO', fecha_devolucion: fechaDev });
  }

  function reintentar(reciboId: string) {
    setRecibos(prev => prev.map(r => {
      if (r.id !== reciboId) return r;
      const updated = { ...r, estado: 'EN_CURSO' as const, intentosReintento: r.intentosReintento + 1 };
      dbUpdateRecibo(reciboId, { estado: 'EN_CURSO', intentos_reintento: updated.intentosReintento });
      return updated;
    }));
  }

  function deleteRecibo(id: string) {
    setRecibos(prev => prev.filter(r => r.id !== id));
    dbDeleteRecibo(id);
  }

  function cobrarTodosPendientes() {
    const pendientes = recibos.filter(r => r.estado === 'PENDIENTE');
    const fechaCobro = new Date().toISOString();
    setRecibos(prev => prev.map(r =>
      r.estado === 'PENDIENTE' ? { ...r, estado: 'COBRADO' as const, fechaCobro } : r
    ));
    // Persist each recibo update to Supabase
    for (const recibo of pendientes) {
      dbUpdateRecibo(recibo.id, { estado: 'COBRADO', fechaCobro });
    }
    setFacturas(prev => {
      let current = [...prev];
      for (const recibo of pendientes) {
        if (!current.some(f => f.reciboId === recibo.id)) {
          const cobrado = { ...recibo, estado: 'COBRADO' as const, fechaCobro };
          const fac = buildFactura(cobrado, current);
          dbInsertFactura(fac);
          current = [...current, fac];
        }
      }
      return current;
    });
    // Refill bonos / extend mensual for every recibo being paid
    for (const recibo of pendientes) {
      if (!recibo.suscripcionId) continue;
      const sus = suscripciones.find(s => s.id === recibo.suscripcionId);
      if (!sus) continue;
      const plan = planesTarifa.find(p => p.id === sus.planId);
      if (!plan) continue;
      if ((plan.tipo === 'BONO' || plan.tipo === 'PUNTUAL') && sus.sesionesRestantes === 0) {
        setSuscripciones(prev => prev.map(s =>
          s.id === sus.id ? { ...s, sesionesRestantes: plan.sesiones, estado: 'ACTIVA' as const } : s
        ));
        dbUpdateSuscripcion(sus.id, { sesionesRestantes: plan.sesiones, estado: 'ACTIVA' });
      } else if (plan.tipo === 'MENSUAL') {
        const nuevaFin = new Date();
        nuevaFin.setMonth(nuevaFin.getMonth() + 1);
        const fechaFin = nuevaFin.toISOString().slice(0, 10);
        setSuscripciones(prev => prev.map(s =>
          s.id === sus.id ? { ...s, fechaFin, estado: 'ACTIVA' as const } : s
        ));
        dbUpdateSuscripcion(sus.id, { fechaFin, estado: 'ACTIVA' });
      }
    }
  }

  // ── Citas ────────────────────────────────────────────────────────────────────

  function addCita(fields: Omit<Cita, 'id' | 'studioId' | 'creadoEn'>) {
    const nueva: Cita = {
      id: `cita-${uid()}`,
      studioId: 'studio-1',
      creadoEn: new Date().toISOString(),
      ...fields,
    };
    setCitas(prev => [...prev, nueva]);
    dbInsertCita(nueva);
  }

  function updateCita(id: string, changes: Partial<Cita>) {
    setCitas(prev => prev.map(c => c.id === id ? { ...c, ...changes } : c));
    dbUpdateCita(id, changes);
  }

  function cancelarCita(citaId: string) {
    setCitas(prev => prev.map(c =>
      c.id === citaId ? { ...c, estado: 'CANCELADA' as const } : c
    ));
    dbUpdateCita(citaId, { estado: 'CANCELADA' });
  }

  function completarCita(citaId: string) {
    setCitas(prev => prev.map(c =>
      c.id === citaId ? { ...c, estado: 'COMPLETADA' as const } : c
    ));
    dbUpdateCita(citaId, { estado: 'COMPLETADA' });
  }

  // ── POS ──────────────────────────────────────────────────────────────────────

  function addVentaPOS(fields: Omit<VentaPOS, 'id' | 'studioId' | 'realizadaEn'>) {
    const nueva: VentaPOS = {
      id: `vpos-${uid()}`,
      studioId: 'studio-1',
      realizadaEn: new Date().toISOString(),
      ...fields,
    };
    setVentasPOS(prev => [...prev, nueva]);
    dbInsertVentaPOS(nueva);

    // When a named client buys, create a COBRADO recibo so it appears in Pagos/Facturas
    if (fields.socioId && fields.total > 0) {
      const concepto = fields.items.length > 0
        ? fields.items.map(i => i.nombre).join(', ')
        : 'Venta POS';
      const hoy = new Date().toISOString().slice(0, 10);
      const nuevoRecibo: Recibo = {
        id: `rec-pos-${uid()}`,
        studioId: 'studio-1',
        socioId: fields.socioId,
        suscripcionId: null,
        concepto,
        importe: fields.total,
        estado: 'COBRADO',
        fechaVencimiento: hoy,
        fechaCobro: new Date().toISOString(),
        fechaDevolucion: null,
        intentosReintento: 0,
      };
      setRecibos(prev => [nuevoRecibo, ...prev]);
      dbInsertRecibo(nuevoRecibo);
      setFacturas(prev => {
        const fac = buildFactura(nuevoRecibo, prev);
        dbInsertFactura(fac);
        return [...prev, fac];
      });
    }
  }

  // ── Campañas ─────────────────────────────────────────────────────────────────

  function addCampana(fields: Omit<Campana, 'id' | 'studioId' | 'creadaEn' | 'enviados' | 'abiertos' | 'clics'>) {
    const nueva: Campana = {
      id: `camp-${uid()}`,
      studioId: 'studio-1',
      creadaEn: new Date().toISOString(),
      enviados: 0,
      abiertos: 0,
      clics: 0,
      ...fields,
    };
    setCampanas(prev => [nueva, ...prev]);
    dbInsertCampana(nueva);
  }

  function deleteCampana(id: string) {
    setCampanas(prev => prev.filter(c => c.id !== id));
    dbDeleteCampana(id);
  }

  function duplicateCampana(campana: Campana) {
    const copy: Campana = {
      ...campana,
      id: `camp-${uid()}`,
      nombre: `Copia de ${campana.nombre}`,
      estado: 'BORRADOR',
      enviados: 0,
      abiertos: 0,
      clics: 0,
      enviadaEn: null,
      programadaEn: null,
      creadaEn: new Date().toISOString(),
    };
    setCampanas(prev => [copy, ...prev]);
    dbInsertCampana(copy);
  }

  // ── Automatizaciones ─────────────────────────────────────────────────────────

  function addAutomatizacion(fields: Omit<Automatizacion, 'id' | 'studioId' | 'ejecutadas' | 'creadaEn'>) {
    const nueva: Automatizacion = {
      id: `auto-${uid()}`,
      studioId: 'studio-1',
      ejecutadas: 0,
      creadaEn: new Date().toISOString(),
      ...fields,
    };
    setAutomatizaciones(prev => [nueva, ...prev]);
    dbInsertAutomatizacion(nueva);
  }

  function toggleAutomatizacion(autoId: string) {
    const actual = automatizaciones.find(a => a.id === autoId);
    setAutomatizaciones(prev => prev.map(a =>
      a.id === autoId ? { ...a, activa: !a.activa } : a
    ));
    if (actual) dbUpdateAutomatizacion(autoId, { activa: !actual.activa });
  }

  // ── Códigos de descuento ──────────────────────────────────────────────────────

  function addCodigoDescuento(fields: Omit<CodigoDescuento, 'id' | 'studioId' | 'usos' | 'creadoEn'>) {
    const nuevo: CodigoDescuento = {
      id: `disc-${uid()}`,
      studioId: 'studio-1',
      usos: 0,
      creadoEn: new Date().toISOString(),
      ...fields,
    };
    setCodigosDescuento(prev => [nuevo, ...prev]);
  }

  function toggleCodigoDescuento(codigoId: string) {
    setCodigosDescuento(prev => prev.map(c =>
      c.id === codigoId ? { ...c, activo: !c.activo } : c
    ));
  }

  function deleteCodigoDescuento(id: string) {
    setCodigosDescuento(prev => prev.filter(c => c.id !== id));
  }

  // ── Actividad reciente ────────────────────────────────────────────────────────

  function addActividadReciente(tipo: TipoActividad, texto: string, socioId?: string, enlace?: string) {
    const nueva: ActividadReciente = {
      id: `act-${uid()}`,
      studioId: 'studio-1',
      tipo,
      texto,
      socioId: socioId ?? null,
      enlace: enlace ?? null,
      creadoEn: new Date().toISOString(),
    };
    setActividadReciente(prev => [nueva, ...prev]);
    dbInsertActividadReciente(nueva);
  }

  // ── Notificaciones ────────────────────────────────────────────────────────────

  function marcarNotificacionLeida(notiId: string) {
    setNotificaciones(prev => prev.map(n =>
      n.id === notiId ? { ...n, leida: true } : n
    ));
  }

  function marcarTodasLeidas() {
    setNotificaciones(prev => prev.map(n => ({ ...n, leida: true })));
  }

  // ── Videos on demand ──────────────────────────────────────────────────────────

  function addVideo(fields: Omit<VideoOnDemand, 'id' | 'studioId' | 'vistas' | 'likes' | 'creadoEn'>) {
    const nuevo: VideoOnDemand = {
      id: `vid-${uid()}`,
      studioId: 'studio-1',
      vistas: 0,
      likes: 0,
      creadoEn: new Date().toISOString(),
      ...fields,
    };
    setVideosOnDemand(prev => [nuevo, ...prev]);
    dbInsertVideoOnDemand(nuevo);
  }

  function toggleVideo(videoId: string) {
    const actual = videosOnDemand.find(v => v.id === videoId);
    setVideosOnDemand(prev => prev.map(v =>
      v.id === videoId ? { ...v, activo: !v.activo } : v
    ));
    if (actual) dbUpdateVideoOnDemand(videoId, { activo: !actual.activo });
  }

  // ── Comunidad ─────────────────────────────────────────────────────────────────

  function addPost(texto: string) {
    const nuevo: PostComunidad = {
      id: `post-${uid()}`,
      studioId: 'studio-1',
      autorId: null,
      autorNombre: 'Tentare',
      autorInicial: 'TE',
      texto,
      likes: 0,
      comentariosCount: 0,
      fijado: false,
      creadoEn: new Date().toISOString(),
    };
    setPostsComunidad(prev => [nuevo, ...prev]);
    dbInsertPostComunidad(nuevo);
  }

  function toggleLikePost(postId: string) {
    const actual = postsComunidad.find(p => p.id === postId);
    setPostsComunidad(prev => prev.map(p =>
      p.id === postId ? { ...p, likes: p.likes + 1 } : p
    ));
    if (actual) dbUpdatePostComunidad(postId, { likes: actual.likes + 1 });
  }

  // ── Motor de automatización avanzado ─────────────────────────────────────────

  function toggleAutomationRule(id: string) {
    setAutomationRules(prev => prev.map(r =>
      r.id === id ? { ...r, activa: !r.activa } : r
    ));
  }

  function addAutomationLog(log: Omit<AutomationLog, 'id' | 'studioId'>) {
    const nuevo: AutomationLog = {
      id: `log-${uid()}`,
      studioId: 'studio-1',
      ...log,
    };
    setAutomationLogs(prev => [nuevo, ...prev]);
    setAutomationRules(prev => prev.map(r =>
      r.id === log.ruleId
        ? { ...r, ejecutadaVeces: r.ejecutadaVeces + 1, ultimaEjecucion: log.ejecutadoEn }
        : r
    ));
  }

  function dismissLog(id: string) {
    setAutomationLogs(prev => prev.filter(l => l.id !== id));
  }

  function runAutomation(): AutomationLog[] {
    const now = new Date();
    const nuevosLogs: AutomationLog[] = [];

    automationRules.filter(r => r.activa).forEach(rule => {
      if (rule.trigger === 'AUSENCIA_DIAS') {
        const diasUmbral = (rule.condicion.dias as number) ?? 7;
        socios.filter(s => s.activo).forEach(socio => {
          const ultimaReserva = reservas
            .filter(r => r.socioId === socio.id && r.estado === 'ASISTIDA')
            .sort((a, b) => b.creadoEn.localeCompare(a.creadoEn))[0];
          if (!ultimaReserva) return;
          const dias = Math.floor((now.getTime() - new Date(ultimaReserva.creadoEn).getTime()) / 86400000);
          if (dias >= diasUmbral) {
            const alreadyLogged = automationLogs.some(
              l => l.ruleId === rule.id && l.socioId === socio.id && l.resultado === 'ESPERANDO'
            );
            if (!alreadyLogged) {
              const log: AutomationLog = {
                id: `log-${uid()}`,
                studioId: 'studio-1',
                ruleId: rule.id,
                ruleName: rule.nombre,
                socioId: socio.id,
                socioNombre: `${socio.nombre} ${socio.apellidos}`,
                pasoIndex: 0,
                accion: 'ENVIAR_WHATSAPP' as AccionAutomatica,
                resultado: 'EJECUTADO' as ResultadoLog,
                detalle: `WhatsApp enviado: "${socio.nombre}, te echamos de menos. ¿Todo bien?"`,
                ejecutadoEn: now.toISOString(),
                proximaAccionEn: new Date(now.getTime() + 48 * 3600000).toISOString(),
              };
              nuevosLogs.push(log);
            }
          }
        });
      }

      if (rule.trigger === 'PAGO_PENDIENTE_DIAS') {
        const diasUmbral = (rule.condicion.dias as number) ?? 3;
        recibos.filter(r => r.estado === 'PENDIENTE').forEach(recibo => {
          const dias = Math.floor((now.getTime() - new Date(recibo.fechaVencimiento).getTime()) / 86400000);
          if (dias >= diasUmbral) {
            const socio = socios.find(s => s.id === recibo.socioId);
            if (!socio) return;
            const alreadyLogged = automationLogs.some(
              l => l.ruleId === rule.id && l.socioId === socio.id && l.resultado !== 'FALLIDO'
            );
            if (!alreadyLogged) {
              nuevosLogs.push({
                id: `log-${uid()}`,
                studioId: 'studio-1',
                ruleId: rule.id,
                ruleName: rule.nombre,
                socioId: socio.id,
                socioNombre: `${socio.nombre} ${socio.apellidos}`,
                pasoIndex: 0,
                accion: 'ENVIAR_EMAIL' as AccionAutomatica,
                resultado: 'EJECUTADO' as ResultadoLog,
                detalle: `Email de recordatorio enviado por recibo pendiente de ${recibo.importe}€`,
                ejecutadoEn: now.toISOString(),
                proximaAccionEn: new Date(now.getTime() + 72 * 3600000).toISOString(),
              });
            }
          }
        });
      }

      if (rule.trigger === 'CLASE_MANANA') {
        const manana = new Date(now);
        manana.setDate(manana.getDate() + 1);
        const mananaStr = manana.toISOString().slice(0, 10);
        sesiones
          .filter(s => s.inicio.startsWith(mananaStr) && !s.cancelada)
          .forEach(sesion => {
            reservas
              .filter(r => r.sesionId === sesion.id && r.estado === 'CONFIRMADA')
              .forEach(reserva => {
                const socio = socios.find(s => s.id === reserva.socioId);
                if (!socio) return;
                const alreadyLogged = automationLogs.some(
                  l => l.ruleId === rule.id && l.socioId === socio.id &&
                       l.ejecutadoEn.startsWith(now.toISOString().slice(0, 10))
                );
                if (!alreadyLogged) {
                  nuevosLogs.push({
                    id: `log-${uid()}`,
                    studioId: 'studio-1',
                    ruleId: rule.id,
                    ruleName: rule.nombre,
                    socioId: socio.id,
                    socioNombre: `${socio.nombre} ${socio.apellidos}`,
                    pasoIndex: 0,
                    accion: 'ENVIAR_WHATSAPP' as AccionAutomatica,
                    resultado: 'EJECUTADO' as ResultadoLog,
                    detalle: `Recordatorio clase enviado para mañana`,
                    ejecutadoEn: now.toISOString(),
                    proximaAccionEn: null,
                  });
                }
              });
          });
      }
    });

    if (nuevosLogs.length > 0) {
      setAutomationLogs(prev => [...nuevosLogs, ...prev]);
      setAutomationRules(prev => prev.map(r => {
        const ruleNewLogs = nuevosLogs.filter(l => l.ruleId === r.id);
        if (ruleNewLogs.length === 0) return r;
        return {
          ...r,
          ejecutadaVeces: r.ejecutadaVeces + ruleNewLogs.length,
          ultimaEjecucion: now.toISOString(),
        };
      }));
    }

    return nuevosLogs;
  }

  function addNotaProgreso(nota: Omit<NotaProgreso, 'id' | 'studioId' | 'creadaEn'>) {
    const nueva: NotaProgreso = {
      id: `nota-prog-${uid()}`,
      studioId: 'studio-1',
      creadaEn: new Date().toISOString(),
      ...nota,
    };
    setNotasProgreso(prev => [nueva, ...prev]);
  }

  const value: StudioContextValue = {
    planesTarifa,
    salas,
    tiposClase,
    instructores,
    spots,
    addPlan,
    updatePlan,
    deletePlan,
    addSala,
    updateSala,
    deleteSala,
    addTipoClase,
    updateTipoClase,
    deleteTipoClase,
    addInstructor,
    updateInstructor,
    deleteInstructor,
    socios,
    suscripciones,
    sesiones,
    reservas,
    recibos,
    facturas,
    notasInternas,
    addSocio,
    addSocioFromPortal,
    updateSocio,
    deleteSocio,
    addTagSocio,
    removeTagSocio,
    assignPlan,
    pausarSuscripcion,
    reanudarSuscripcion,
    addNota,
    deleteNota,
    addSesion,
    updateSesion,
    deleteSesion,
    addReserva,
    cancelarReserva,
    checkin,
    liberarSpot,
    asignarSpot,
    addRecibo,
    marcarCobrado,
    marcarDevuelto,
    reintentar,
    deleteRecibo,
    cobrarTodosPendientes,
    citas,
    addCita,
    updateCita,
    cancelarCita,
    completarCita,
    productosPOS,
    ventasPOS,
    addVentaPOS,
    campanas,
    addCampana,
    deleteCampana,
    duplicateCampana,
    automatizaciones,
    addAutomatizacion,
    toggleAutomatizacion,
    codigosDescuento,
    addCodigoDescuento,
    toggleCodigoDescuento,
    deleteCodigoDescuento,
    actividadReciente,
    addActividadReciente,
    notificaciones,
    marcarNotificacionLeida,
    marcarTodasLeidas,
    videosOnDemand,
    addVideo,
    toggleVideo,
    postsComunidad,
    addPost,
    toggleLikePost,
    studioConfig,
    updateStudioConfig,
    resetDatosPilates,
    automationRules,
    automationLogs,
    notasProgreso,
    toggleAutomationRule,
    addAutomationLog,
    runAutomation,
    addNotaProgreso,
    dismissLog,
    dataLoaded,
  };

  function resetDatosPilates() {
    fetchAllStudioData().then(data => {
      setPlanesTarifa(data.planesTarifa);
      setSalas(data.salas);
      setTiposClase(data.tiposClase);
      setInstructores(data.instructores);
      setSpots(data.spots);
      setSocios(data.socios);
      setSuscripciones(data.suscripciones);
      setSesiones(data.sesiones);
      setReservas(data.reservas);
      setRecibos(data.recibos);
      setFacturas(data.facturas);
      setNotasInternas(data.notasInternas);
      setCitas(data.citas);
      setProductosPOS(data.productosPOS);
      setVentasPOS(data.ventasPOS);
      setCampanas(data.campanas);
      setAutomatizaciones(data.automatizaciones);
      setCodigosDescuento(data.codigosDescuento);
      setActividadReciente(data.actividadReciente);
      setNotificaciones(data.notificaciones);
      setVideosOnDemand(data.videosOnDemand);
      setPostsComunidad(data.postsComunidad);
      setAutomationRules(data.automationRules);
      setAutomationLogs(data.automationLogs);
      setNotasProgreso(data.notasProgreso);
    }).catch(console.error);
  }

  return (
    <StudioContext.Provider value={value}>
      {children}
    </StudioContext.Provider>
  );
}
