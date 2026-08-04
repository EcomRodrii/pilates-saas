'use client';

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useId } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useStudio } from '@/lib/studio-context';
import type { Instructor, Rol, Sesion, TipoClase } from '@/lib/types';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  Plus, Pencil, Trash2, Users, Mail, Phone, Calendar, Check, X, ShieldCheck, KeyRound, History,
  CalendarClock, CalendarOff, Copy, Star, Search, MoreVertical, Camera, Loader2, Clock, Download,
  ChevronLeft, ChevronRight, Plane, Stethoscope, AlertTriangle, MessageCircle, Bell, Euro,
} from 'lucide-react';
import { ProfileAvatar, AvatarPicker } from '@/components/ui/profile-avatar';
import { formatFechaHora, uid as generarId } from '@/lib/utils';
import { subirFotoInstructor, eliminarFotoInstructor, validarFotoPerfil } from '@/lib/portal-storage';
import {
  generarEnlaceDisponibilidad, listarValoraciones, listarAusencias, crearAusencia, borrarAusencia,
  fetchTarifasEquipo, actualizarTarifaInstructor, tarjetasEquipo,
  type ValoracionDetalle, type AusenciaInstructora,
} from '@/lib/api-client';
import { PageHeader } from '@/components/ui/page-header';
import { Toast, useToast } from '@/components/ui/toast';
import { invitarAlEquipo } from '@/lib/api-client';
import { ausenciaHoy, AUSENCIA_ETIQUETA } from '@/lib/ausencias';
import { useRol } from '@/lib/permisos';
import { rolesQuePuedeAsignar, puedeGestionarEquipo } from '@/lib/permisos-reglas';
import {
  DIAS, DIAS_LARGOS, estado as estadoTarjeta, cifras as cifrasTarjeta, accion as accionTarjeta,
  filtrar as filtrarMiembros, ordenar as ordenarMiembros, ordenesDisponibles, situacionDe,
  type MiembroCompleto, type FiltroEstado, type FiltroRol, type Orden, type Situacion, type AccionTipo,
} from '@/lib/equipo-tarjetas.ts';

type FiltroEstadoEquipo = FiltroEstado;

// Enlaces sin login que la propietaria puede mandar a una instructora. Scopes
// separados a propósito (mínimo privilegio): el de disponibilidad no permite
// desconvocar clases. Ver lib/sustituciones/token.ts.
type EnlaceScope = 'disponibilidad' | 'reportar_baja';

const TEXTOS_ENLACE: Record<EnlaceScope, { titulo: string; explicacion: string; whatsapp: string; menu: string }> = {
  disponibilidad: {
    titulo: 'Enlace de disponibilidad',
    explicacion: 'Lo abre en el móvil y marca cuándo puede cubrir clases en unos segundos — sin descargar nada ni crear cuenta.',
    whatsapp: 'marca aquí tu disponibilidad para cubrir clases (30 seg, sin instalar nada):',
    menu: 'Enlace de disponibilidad',
  },
  reportar_baja: {
    titulo: 'Enlace para avisar de una baja',
    explicacion: 'Lo abre en el móvil el día que no pueda dar una clase y avisa ella misma: nosotros buscamos sustituta y te avisamos. Sin que tenga que llamarte.',
    whatsapp: 'guárdate este enlace: si algún día no puedes dar una clase, avisas desde aquí y buscamos sustituta (sin instalar nada):',
    menu: 'Enlace para avisar de una baja',
  },
};

const COLORES = ['#F7A6C4', '#14B8A6', '#7C3AED', '#EC4899', '#059669', '#0EA5E9', '#D97706', '#DC2626'];

const inputCls = 'w-full rounded-xl border border-border bg-card px-3.5 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-brand focus:ring-2 focus:ring-brand/15 transition-all';
const labelCls = 'text-[12px] font-semibold text-foreground block mb-1.5';

const ROL_LABEL: Record<Rol, string> = {
  PROPIETARIO: 'Propietaria',
  MANAGER: 'Responsable de sede',
  RECEPCION: 'Recepción',
  INSTRUCTOR: 'Instructora',
};
const ROL_DESC: Record<Rol, string> = {
  PROPIETARIO: 'Acceso total: negocio, marketing, automatizaciones y equipo.',
  MANAGER: 'Lleva el día a día de la sede: horario, clientas, lista de espera, sustituciones y equipo. No ve facturación, informes de ingresos ni ajustes del negocio, y no puede dar acceso de propietaria.',
  RECEPCION: 'Reservas, clientas, cobros y caja — sin acceso a marketing, informes ni ajustes del negocio.',
  INSTRUCTOR: 'Calendario, citas (sin precios), miembros, oferta digital, comunidad y mensajería — sin datos de facturación.',
};

// `tempId` es el id que usará la ficha si es de alta: se genera al abrir el
// modal (no al guardar) para poder subir la foto ANTES de que la instructora
// exista en BD — el storage necesita una clave estable desde el primer upload.
type Form = { tempId: string; nombre: string; email: string; telefono: string; color: string; avatar: string | null; fotoUrl: string | null; activo: boolean; rol: Rol };
const emptyForm = (): Form => ({ tempId: `ins-${generarId()}`, nombre: '', email: '', telefono: '', color: '#F7A6C4', avatar: null, fotoUrl: null, activo: true, rol: 'INSTRUCTOR' });

const ORDEN_LABEL: Record<Orden, string> = {
  'nombre-az': 'Nombre A-Z', 'nombre-za': 'Nombre Z-A', 'mas-clases': 'Más clases',
  'peor-ocupacion': 'Peor ocupación', 'mayor-coste': 'Mayor coste',
};
const ESTADO_LABEL: Record<FiltroEstadoEquipo, string> = { activas: 'Activas', inactivas: 'Inactivas', todas: 'Todas' };

// Una franja de color por situación (I-4 del rediseño). `mostrador` y `flojo`
// no tenían token propio en globals.css — el resto (clase/libre/direccion) sí
// reutiliza brand/success/muted, como pide la tarea.
const SITUACION_ESTILO: Record<Situacion, { fondo: string; tinta: string; punto: string }> = {
  clase: { fondo: 'bg-success/10', tinta: 'text-success', punto: 'bg-success' },
  mostrador: { fondo: 'bg-sky-500/10', tinta: 'text-sky-700 dark:text-sky-400', punto: 'bg-sky-600' },
  flojo: { fondo: 'bg-rose-500/10', tinta: 'text-rose-700 dark:text-rose-400', punto: 'bg-rose-600' },
  // Mismo tono que "flojo" (ámbar/rosa de aviso) pero distinguible: esto no
  // es "sus clases van mal", es "puede que ya ni trabaje aquí".
  inactiva: { fondo: 'bg-amber-500/10', tinta: 'text-amber-700 dark:text-amber-400', punto: 'bg-amber-600' },
  libre: { fondo: 'bg-muted', tinta: 'text-muted-foreground', punto: 'bg-muted-foreground/40' },
  direccion: { fondo: 'bg-brand/10', tinta: 'text-brand-secondary', punto: 'bg-brand-secondary' },
};

function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  );
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const onChange = () => setReduced(mq.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);
  return reduced;
}

export default function EquipoPage() {
  const miRol = useRol();
  const gestiona = miRol !== 'INSTRUCTOR';
  const uid = useId();
  const router = useRouter();
  const { instructores, sesiones, tiposClase, addInstructor, updateInstructor, deleteInstructor, actividadReciente } = useStudio();

  const [tab, setTab] = useState<'equipo' | 'actividad'>('equipo');
  const [modal, setModal] = useState<'nuevo' | 'editar' | null>(null);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<Form>(emptyForm());
  const [subiendoFoto, setSubiendoFoto] = useState(false);
  const [errorFoto, setErrorFoto] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [errorGuardar, setErrorGuardar] = useState('');
  const { message: toastMsg, show: showToast, dismiss: dismissToast } = useToast();
  const [invitarAhora, setInvitarAhora] = useState(false);
  const [invitando, setInvitando] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [confirmDel, setConfirmDel] = useState<Instructor | null>(null);
  const [enlace, setEnlace] = useState<
    { instructor: MiembroCompleto; scope: EnlaceScope; url: string | null; loading: boolean; error: string | null; copiado: boolean } | null
  >(null);

  // La rejilla de tarjetas: un único fetch a un endpoint que ya recorta cada
  // ficha al rol de quien mira (ver app/api/equipo/tarjetas/route.ts). Se
  // repite cada vez que cambia `instructores` (tras un alta/edición/baja).
  const [tarjetas, setTarjetas] = useState<MiembroCompleto[]>([]);
  const [cargandoTarjetas, setCargandoTarjetas] = useState(true);
  const recargarTarjetas = useCallback(() => {
    tarjetasEquipo().then(items => { setTarjetas(items); setCargandoTarjetas(false); });
  }, []);
  useEffect(() => { recargarTarjetas(); }, [recargarTarjetas, instructores]);

  // Red de seguridad además de Realtime (studio-context.tsx): si por lo que
  // sea (token rotado, conexión que se cayó un instante) el canal se pierde
  // algún evento, volver a esta pestaña ya refresca la rejilla sin necesidad
  // de recargar la página entera.
  useEffect(() => {
    function onVisible() { if (document.visibilityState === 'visible') recargarTarjetas(); }
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [recargarTarjetas]);

  // Ausencias vigentes del estudio → distintivo "De vacaciones/De baja" en la lista.
  const [ausencias, setAusencias] = useState<AusenciaInstructora[]>([]);
  // Tarifa por hora — solo se usa para prefilling el formulario de edición
  // (PROPIETARIO/MANAGER pueden fijarla, decisión ya cerrada); la rejilla
  // nunca la pinta directamente, así que no es una fuga nueva.
  const [tarifas, setTarifas] = useState<Record<string, number | null>>({});
  const [tarifaHoraInput, setTarifaHoraInput] = useState('');

  useEffect(() => {
    let vivo = true;
    listarAusencias().then(r => { if (vivo) setAusencias(r); });
    if (gestiona) {
      fetchTarifasEquipo().then(r => {
        if (!vivo) return;
        setTarifas(Object.fromEntries(r.map(t => [t.instructorId, t.tarifaHora])));
      });
    }
    return () => { vivo = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Filtros + orden ──────────────────────────────────────────────────────
  const [busca, setBusca] = useState('');
  const [estadoF, setEstadoF] = useState<FiltroEstadoEquipo>('activas');
  const [filtroRol, setFiltroRol] = useState<FiltroRol>('todos');
  const [orden, setOrden] = useState<Orden>('nombre-az');
  const ordenesPermitidos = useMemo(() => ordenesDisponibles(miRol), [miRol]);

  const filtrados = useMemo(
    () => filtrarMiembros(tarjetas, { busca, estadoF, rol: filtroRol }),
    [tarjetas, busca, estadoF, filtroRol],
  );
  const ordenados = useMemo(() => ordenarMiembros(filtrados, orden), [filtrados, orden]);
  const hayFiltro = busca.trim() !== '' || filtroRol !== 'todos';

  // ── Menú "…" de una tarjeta y detalle de día de la semana: un único oyente
  // de documento para toda la pantalla, no uno por tarjeta. ──────────────────
  const [menuCardId, setMenuCardId] = useState<string | null>(null);
  const [diaSel, setDiaSel] = useState<{ id: string; i: number } | null>(null);
  useEffect(() => {
    function alPulsar(e: PointerEvent) {
      if (!menuCardId) return;
      const target = e.target as HTMLElement;
      if (target.closest?.('[data-menu-equipo]')) return;
      setMenuCardId(null);
    }
    function alTeclear(e: KeyboardEvent) {
      if (e.key === 'Escape') { setMenuCardId(null); setDiaSel(null); }
    }
    document.addEventListener('pointerdown', alPulsar, true);
    document.addEventListener('keydown', alTeclear);
    return () => {
      document.removeEventListener('pointerdown', alPulsar, true);
      document.removeEventListener('keydown', alTeclear);
    };
  }, [menuCardId]);

  // ── Reordenar sin saltos: la Web Animations API compone la transición, no
  // recalcula layout. Solo se anima cuando el ORDEN de verdad cambia (no al
  // teclear, no al abrir un menú) y nunca si `prefers-reduced-motion`. ───────
  const reducedMotion = usePrefersReducedMotion();
  const fichaRefs = useRef(new Map<string, HTMLElement>());
  const cajasPrevias = useRef(new Map<string, DOMRect>());
  const ordenPrevio = useRef<string | null>(null);
  const ordenClave = ordenados.map(m => m.id).join('|');
  useLayoutEffect(() => {
    const cambio = ordenPrevio.current !== null && ordenPrevio.current !== ordenClave;
    if (cambio && !reducedMotion) {
      fichaRefs.current.forEach((el, id) => {
        if (!el || !el.isConnected) return;
        const antes = cajasPrevias.current.get(id);
        if (!antes) return;
        const ahora = el.getBoundingClientRect();
        const dx = antes.left - ahora.left;
        const dy = antes.top - ahora.top;
        if (Math.abs(dx) < 2 && Math.abs(dy) < 2) return;
        el.animate(
          [{ transform: `translate(${dx}px,${dy}px)` }, { transform: 'none' }],
          { duration: 420, easing: 'cubic-bezier(.2,.9,.25,1)', composite: 'add' },
        );
      });
    }
    ordenPrevio.current = ordenClave;
    const snapshot = new Map<string, DOMRect>();
    fichaRefs.current.forEach((el, id) => { if (el?.isConnected) snapshot.set(id, el.getBoundingClientRect()); });
    cajasPrevias.current = snapshot;
    // Solo depende de la CLAVE de orden, no de `ordenados` entero: escribir en
    // el buscador no debe disparar esto salvo que el conjunto/orden cambie de
    // verdad.
  }, [ordenClave, reducedMotion]);

  // ── "Enlace copiado ✓" + aviso con Deshacer (5 s) ───────────────────────
  const [pedido, setPedido] = useState<Record<string, boolean>>({});
  const [aviso, setAviso] = useState<{ texto: string; deshacer: (() => void) | null } | null>(null);
  const avisoTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lanzarAviso = useCallback((texto: string, deshacer?: () => void) => {
    if (avisoTimer.current) clearTimeout(avisoTimer.current);
    setAviso({ texto, deshacer: deshacer ?? null });
    avisoTimer.current = setTimeout(() => setAviso(null), 5000);
  }, []);

  const [verValor, setVerValor] = useState<Instructor | null>(null);
  const [verHoras, setVerHoras] = useState<Instructor | null>(null);
  const [verAusencias, setVerAusencias] = useState<Instructor | null>(null);

  function instructorDe(m: MiembroCompleto): Instructor | null {
    return instructores.find(i => i.id === m.id) ?? null;
  }

  async function abrirEnlace(m: MiembroCompleto, scope: EnlaceScope) {
    setEnlace({ instructor: m, scope, url: null, loading: true, error: null, copiado: false });
    const r = await generarEnlaceDisponibilidad(m.id, scope);
    setEnlace(prev => (prev && prev.instructor.id === m.id && prev.scope === scope
      ? { ...prev, loading: false, url: 'url' in r ? r.url : null, error: 'error' in r ? r.error : null }
      : prev));
  }
  async function copiarEnlace(url: string) {
    try { await navigator.clipboard.writeText(url); } catch { /* el input readonly permite copiar a mano */ }
    setEnlace(prev => (prev ? { ...prev, copiado: true } : prev));
  }

  // La acción principal de la tarjeta ("Pedirle disponibilidad" → copia el
  // enlace directamente, sin abrir diálogo — mismo criterio que pedía el
  // rediseño). El resto de tipos de acción abren lo que ya existía.
  async function ejecutarAccion(m: MiembroCompleto, tipo: AccionTipo) {
    if (tipo === 'avisos') { lanzarAviso('Tus avisos están arriba, en la campana de notificaciones.'); return; }
    if (tipo === 'mensaje') { router.push('/mensajeria'); return; }
    if (tipo === 'hecho') { lanzarAviso('El enlace sigue en tu portapapeles.'); return; }
    if (tipo === 'horas') { setMenuCardId(null); setVerHoras(instructorDe(m)); return; }
    // 'pedir'
    const r = await generarEnlaceDisponibilidad(m.id, 'disponibilidad');
    if ('error' in r) { lanzarAviso(`No se ha podido generar el enlace: ${r.error}`); return; }
    try { await navigator.clipboard.writeText(r.url); } catch { /* el diálogo secundario del menú permite copiar a mano */ }
    setPedido(prev => ({ ...prev, [m.id]: true }));
    lanzarAviso(`Enlace de disponibilidad de ${m.nombre.split(' ')[0]} copiado`, () => {
      setPedido(prev => { const p = { ...prev }; delete p[m.id]; return p; });
      setAviso(null);
    });
  }

  // Carga semanal para el modal de horas/ausencias (siguen operando sobre
  // `sesiones` en crudo, como antes del rediseño).
  async function enviarInvitacion(i: Instructor) {
    setMenuCardId(null);
    setInvitando(i.id);
    const res = await invitarAlEquipo(i.id);
    setInvitando(null);
    showToast('ok' in res ? `Invitación enviada a ${res.email}` : res.error);
  }

  function openNuevo() { setForm(emptyForm()); setEditId(null); setErrorGuardar(''); setInvitarAhora(false); setModal('nuevo'); }
  function openEditar(m: MiembroCompleto) {
    const i = instructorDe(m);
    if (!i) return;
    setForm({ tempId: i.id, nombre: i.nombre, email: i.email ?? '', telefono: i.telefono ?? '', color: i.color, avatar: i.avatar ?? null, fotoUrl: i.fotoUrl ?? null, activo: i.activo, rol: i.rol });
    setEditId(i.id);
    const tarifaActual = tarifas[i.id];
    setTarifaHoraInput(tarifaActual == null ? '' : String(tarifaActual));
    setModal('editar');
  }

  async function guardar() {
    if (!form.nombre.trim()) return;
    const fields = {
      nombre: form.nombre.trim(),
      email: form.email.trim() || null,
      telefono: form.telefono.trim() || null,
      color: form.color,
      avatar: form.avatar,
      fotoUrl: form.fotoUrl,
      activo: form.activo,
      rol: form.rol,
    };
    if (modal === 'nuevo') {
      setGuardando(true);
      setErrorGuardar('');
      const res = await addInstructor({ ...fields, authUserId: null }, form.tempId);
      setGuardando(false);
      if (!res.ok) { setErrorGuardar(res.error); return; }
      if (fields.email && invitarAhora) {
        const inv = await invitarAlEquipo(form.tempId);
        showToast('ok' in inv
          ? `${fields.nombre} ya está en tu equipo — invitación enviada a ${fields.email}`
          : `${fields.nombre} ya está en tu equipo, pero la invitación no salió: ${inv.error}`);
      } else if (fields.email) {
        showToast(`${fields.nombre} ya está en tu equipo — todavía sin invitar`);
      } else {
        showToast(`${fields.nombre} ya está en tu equipo`);
      }
    } else if (editId) {
      const res = await updateInstructor(editId, fields);
      if (!res.ok) { showToast(res.error); setModal(null); return; }
      const tarifaAnterior = tarifas[editId] ?? null;
      const tarifaNueva = tarifaHoraInput.trim() === '' ? null : Number(tarifaHoraInput);
      let mensaje = 'Cambios guardados';
      if (tarifaNueva !== tarifaAnterior) {
        const r = await actualizarTarifaInstructor(editId, tarifaNueva);
        if (r.ok) setTarifas(prev => ({ ...prev, [editId]: tarifaNueva }));
        else mensaje = `Cambios guardados, pero la tarifa no se pudo actualizar: ${r.error ?? ''}`;
      }
      showToast(mensaje);
    }
    setModal(null);
  }

  async function handleFotoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const invalido = validarFotoPerfil(file);
    if (invalido) { setErrorFoto(invalido); return; }
    setErrorFoto('');
    setSubiendoFoto(true);
    const result = await subirFotoInstructor(form.tempId, file);
    setSubiendoFoto(false);
    if ('error' in result) { setErrorFoto(result.error); return; }
    setForm(f => ({ ...f, fotoUrl: result.url }));
    if (editId) { const res = await updateInstructor(editId, { fotoUrl: result.url }); if (!res.ok) setErrorFoto(res.error); }
  }

  async function handleEliminarFoto() {
    setSubiendoFoto(true);
    const result = await eliminarFotoInstructor(form.tempId);
    setSubiendoFoto(false);
    if ('error' in result) { setErrorFoto(result.error); return; }
    setForm(f => ({ ...f, fotoUrl: null }));
    if (editId) { const res = await updateInstructor(editId, { fotoUrl: null }); if (!res.ok) setErrorFoto(res.error); }
  }

  const activos = tarjetas.filter(m => m.activo).length;
  const clasesEstaSemana = tarjetas.reduce((a, m) => a + m.semana.reduce((x, y) => x + y, 0), 0);
  const conAcceso = tarjetas.filter(m => m.conAcceso).length;
  const costeDelEquipo = tarjetas.reduce((a, m) => a + (m.esYo ? 0 : (m.costeMes ?? 0)), 0);

  return (
    <div className="space-y-5">
      <PageHeader
        title="Equipo"
        description="Instructoras y personal del estudio"
        actions={tab === 'equipo' && gestiona && (
          <div className="flex items-center gap-2">
            {puedeGestionarEquipo(miRol) && (
              <Link href="/equipo/liquidaciones" className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-border text-sm font-bold text-foreground hover:bg-muted transition-colors">
                <Euro size={16} /> Liquidaciones
              </Link>
            )}
            <button onClick={openNuevo} className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-brand text-brand-foreground text-sm font-bold hover:brightness-95 transition-colors">
              <Plus size={16} /> Nuevo miembro
            </button>
          </div>
        )}
      />

      <div className="flex gap-1 bg-card border border-border rounded-xl p-1 w-fit">
        {(['equipo', 'actividad'] as const).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              tab === t ? 'bg-brand text-brand-foreground' : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            {t === 'equipo' ? 'Equipo' : 'Actividad'}
          </button>
        ))}
      </div>

      {tab === 'actividad' ? (
        <ActividadTab actividadReciente={actividadReciente} />
      ) : (
      <>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {[
          { label: 'Miembros', value: tarjetas.length, sub: `${activos} activos`, color: 'var(--brand)', bg: 'color-mix(in srgb, var(--brand) 10%, var(--card))', Icon: Users },
          { label: 'Clases esta semana', value: clasesEstaSemana, sub: 'programadas', color: 'var(--success)', bg: 'color-mix(in srgb, var(--success) 12%, var(--card))', Icon: Calendar },
          miRol === 'PROPIETARIO'
            ? { label: 'Coste del mes', value: costeDelEquipo.toLocaleString('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }), sub: 'nóminas del equipo', color: 'var(--warning)', bg: 'color-mix(in srgb, var(--warning) 12%, var(--card))', Icon: Euro }
            : { label: 'Con acceso', value: conAcceso, sub: `de ${tarjetas.length} miembros`, color: 'var(--warning)', bg: 'color-mix(in srgb, var(--warning) 12%, var(--card))', Icon: ShieldCheck },
        ].map(({ label, value, sub, color, bg, Icon }) => (
          <div key={label} className="bg-card border border-border rounded-2xl p-4 flex flex-col gap-2.5">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">{label}</span>
              <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ backgroundColor: bg }}>
                <Icon size={15} color={color} />
              </div>
            </div>
            <div>
              <p className="text-[26px] font-extrabold text-foreground leading-none tabular-nums">{value}</p>
              <p className="text-[11px] text-muted-foreground mt-1">{sub}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Barra de filtros, fija al hacer scroll */}
      {tarjetas.length > 0 && (
        <div className="sticky top-0 z-30 -mx-1 px-1 py-2 flex items-center gap-2 flex-wrap bg-background/85 backdrop-blur-md">
          <div className="relative flex-1 min-w-[200px]">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
            <input
              value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar por nombre…"
              className="w-full rounded-xl border border-border bg-card pl-9 pr-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-brand focus:ring-2 focus:ring-brand/15 transition"
            />
          </div>
          <PillSelect label="Estado" value={estadoF} onChange={v => setEstadoF(v as FiltroEstadoEquipo)}
            options={(['activas', 'todas', 'inactivas'] as FiltroEstadoEquipo[]).map(v => [v, ESTADO_LABEL[v]])} />
          {gestiona && (
            <PillSelect label="Rol" value={filtroRol} onChange={v => setFiltroRol(v as FiltroRol)}
              options={[['todos', 'Todos'], ['PROPIETARIO', 'Propietaria'], ['MANAGER', 'Responsable de sede'], ['RECEPCION', 'Recepción'], ['INSTRUCTOR', 'Instructora']]} />
          )}
          <div className="ml-auto flex items-center gap-2">
            <PillSelect label="Ordenar" value={orden} onChange={v => setOrden(v as Orden)}
              options={ordenesPermitidos.map(o => [o, ORDEN_LABEL[o]])} />
            {hayFiltro && (
              <button onClick={() => { setBusca(''); setFiltroRol('todos'); }}
                className="h-[42px] px-4 rounded-xl bg-foreground text-background text-[12.5px] font-bold whitespace-nowrap">
                {ordenados.length} de {tarjetas.length} · quitar filtros
              </button>
            )}
          </div>
        </div>
      )}

      {cargandoTarjetas ? (
        <p className="text-sm text-muted-foreground py-16 text-center">Cargando el equipo…</p>
      ) : tarjetas.length === 0 ? (
        <div className="flex flex-col items-center justify-center text-center py-20 rounded-2xl border border-dashed border-border bg-card">
          <div className="w-14 h-14 rounded-2xl bg-brand/10 flex items-center justify-center mb-4">
            <Users size={26} className="text-brand-medio" />
          </div>
          <p className="text-[16px] font-bold text-foreground">Aún no hay nadie en el equipo</p>
          {gestiona && (
            <>
              <p className="text-[13px] text-muted-foreground mt-1 mb-5">Añade a tus instructoras para asignarles clases y citas</p>
              <button onClick={openNuevo} className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-brand text-brand-foreground text-[13px] font-bold">
                <Plus size={15} /> Nuevo miembro
              </button>
            </>
          )}
        </div>
      ) : ordenados.length === 0 ? (
        <div className="flex flex-col items-center justify-center text-center py-16 rounded-2xl border border-dashed border-border bg-card">
          <p className="text-[15px] font-bold text-foreground">Nadie con ese nombre</p>
          <p className="text-[13px] text-muted-foreground mt-1 mb-4">Prueba con otro filtro.</p>
          <button onClick={() => { setBusca(''); setFiltroRol('todos'); }} className="px-4 py-2 rounded-xl bg-brand text-brand-foreground text-[13px] font-bold">
            Ver todo el equipo
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4 items-start">
          {ordenados.map(m => (
            <TarjetaMiembro
              key={m.id} m={m} rolViewer={miRol} gestiona={gestiona}
              refCb={el => { if (el) fichaRefs.current.set(m.id, el); else fichaRefs.current.delete(m.id); }}
              pedido={!!pedido[m.id]}
              diaSel={diaSel && diaSel.id === m.id ? diaSel.i : null}
              onDiaSel={i => setDiaSel(prev => (prev && prev.id === m.id && prev.i === i ? null : { id: m.id, i }))}
              menuAbierto={menuCardId === m.id}
              onMenu={() => setMenuCardId(prev => (prev === m.id ? null : m.id))}
              onAccion={tipo => ejecutarAccion(m, tipo)}
              onEditar={() => openEditar(m)}
              onEliminar={() => { setMenuCardId(null); const i = instructorDe(m); if (i) setConfirmDel(i); }}
              onValoraciones={() => { setMenuCardId(null); setVerValor(instructorDe(m)); }}
              onHoras={() => { setMenuCardId(null); setVerHoras(instructorDe(m)); }}
              onAusencias={() => { setMenuCardId(null); setVerAusencias(instructorDe(m)); }}
              onEnlaceBaja={() => { setMenuCardId(null); abrirEnlace(m, 'reportar_baja'); }}
              ausente={ausenciaHoy(ausencias, m.id)}
              invitando={invitando === m.id}
              onInvitar={() => { const i = instructorDe(m); if (i) enviarInvitacion(i); }}
            />
          ))}
        </div>
      )}
      </>
      )}

      {/* Create/edit modal */}
      <Dialog open={modal !== null} onOpenChange={open => !open && setModal(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{modal === 'nuevo' ? 'Nuevo miembro del equipo' : 'Editar miembro'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="relative shrink-0">
                <ProfileAvatar avatarId={form.avatar} fotoUrl={form.fotoUrl} nombre={form.nombre || '?'} color={form.color} size="lg" />
                {subiendoFoto && (
                  <div className="absolute inset-0 rounded-full bg-black/40 flex items-center justify-center">
                    <Loader2 size={16} className="text-white animate-spin" />
                  </div>
                )}
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full bg-card border border-border flex items-center justify-center hover:bg-background transition-colors"
                  aria-label="Subir foto"
                >
                  <Camera size={11} className="text-foreground" />
                </button>
                <input ref={fileInputRef} type="file" accept="image/*" onChange={handleFotoChange} className="hidden" />
              </div>
              <div className="min-w-0">
                <label htmlFor={`${uid}-1`} className={labelCls + ' mb-1'}>Nombre</label>
                <input id={`${uid}-1`} className={inputCls} value={form.nombre} placeholder="Ej. María Soler" onChange={e => setForm(f => ({ ...f, nombre: e.target.value }))} autoFocus />
              </div>
            </div>
            <div className="flex items-center gap-3 -mt-2">
              {form.fotoUrl && (
                <button type="button" onClick={handleEliminarFoto} className="text-[11px] font-medium text-muted-foreground hover:text-foreground flex items-center gap-1">
                  <Trash2 size={11} />Quitar foto
                </button>
              )}
            </div>
            <p className="text-[11px] text-muted-foreground -mt-2">Sube una foto de su cara — solo la cara, sin recortes raros: es la que verán las clientas y el resto del equipo.</p>
            {errorFoto && <p className="text-[11px] text-destructive -mt-2">{errorFoto}</p>}
            <div>
              <span id={`${uid}-avatar`} className={labelCls}>Avatar</span>
              <div role="group" aria-labelledby={`${uid}-avatar`}><AvatarPicker value={form.avatar} onChange={id => setForm(f => ({ ...f, avatar: id }))} /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor={`${uid}-2`} className={labelCls}>Email</label>
                <input id={`${uid}-2`} className={inputCls} value={form.email} placeholder="maria@tentare.es" onChange={e => setForm(f => ({ ...f, email: e.target.value }))} />
              </div>
              <div>
                <label htmlFor={`${uid}-3`} className={labelCls}>Teléfono</label>
                <input id={`${uid}-3`} className={inputCls} value={form.telefono} placeholder="+34 600 000 000" onChange={e => setForm(f => ({ ...f, telefono: e.target.value }))} />
              </div>
            </div>
            <div>
              <span id={`${uid}-rol`} className={labelCls}>Rol y acceso al panel</span>
              <div role="group" aria-labelledby={`${uid}-rol`} className="space-y-1.5">
                {rolesQuePuedeAsignar(miRol).map(r => (
                  <button
                    key={r}
                    type="button"
                    onClick={() => setForm(f => ({ ...f, rol: r }))}
                    className={`w-full flex items-start gap-2.5 text-left px-3.5 py-2.5 rounded-xl border transition-colors ${form.rol === r ? 'border-brand bg-brand/10' : 'border-border hover:bg-muted'}`}
                  >
                    <ShieldCheck size={15} className={form.rol === r ? 'text-brand-secondary mt-0.5 shrink-0' : 'text-muted-foreground mt-0.5 shrink-0'} />
                    <div className="min-w-0">
                      <p className="text-[13px] font-bold text-foreground">{ROL_LABEL[r]}</p>
                      <p className="text-[11px] text-muted-foreground mt-0.5">{ROL_DESC[r]}</p>
                    </div>
                  </button>
                ))}
              </div>
              {form.email.trim() && (
                <p className="text-[11px] text-muted-foreground mt-2 flex items-start gap-1.5">
                  <KeyRound size={12} className="shrink-0 mt-0.5" />
                  Para acceder al panel, esta persona debe entrar en /login y crear una cuenta con el email <strong className="text-foreground">{form.email.trim()}</strong> — quedará vinculada automáticamente a este rol.
                </p>
              )}
            </div>
            <div>
              <span id={`${uid}-color`} className={labelCls}>Color</span>
              <div role="group" aria-labelledby={`${uid}-color`} className="flex gap-2 flex-wrap">
                {COLORES.map(c => (
                  <button key={c} onClick={() => setForm(f => ({ ...f, color: c }))}
                    className="w-8 h-8 rounded-full flex items-center justify-center transition-transform hover:scale-110"
                    style={{ backgroundColor: c, outline: form.color === c ? '2px solid var(--foreground)' : 'none', outlineOffset: 2 }}>
                    {form.color === c && <Check size={14} className="text-white" />}
                  </button>
                ))}
              </div>
            </div>
            <label className="flex items-center gap-3 cursor-pointer pt-1">
              <input type="checkbox" checked={form.activo} onChange={e => setForm(f => ({ ...f, activo: e.target.checked }))} className="w-4 h-4 rounded accent-brand" />
              <span className="text-sm font-medium text-foreground">Miembro activo (puede recibir clases y citas)</span>
            </label>

            {modal === 'editar' && (
              <div>
                <label htmlFor={`${uid}-tarifa`} className={labelCls}>Tarifa por hora (opcional)</label>
                <div className="relative">
                  <input
                    id={`${uid}-tarifa`} type="number" min={0} max={999.99} step={0.01}
                    className={inputCls + ' pr-8'} value={tarifaHoraInput} placeholder="Sin asignar"
                    onChange={e => setTarifaHoraInput(e.target.value)}
                  />
                  <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-[13px] text-muted-foreground">€/h</span>
                </div>
              </div>
            )}

            {modal === 'nuevo' && form.email.trim() !== '' && (
              <label className="flex items-start gap-3 cursor-pointer rounded-xl border border-border p-3">
                <input
                  type="checkbox"
                  checked={invitarAhora}
                  onChange={e => setInvitarAhora(e.target.checked)}
                  className="w-4 h-4 rounded accent-brand mt-0.5"
                />
                <span className="text-[13px] text-foreground">
                  Enviarle ahora el email de invitación
                  <span className="block text-[12px] text-muted-foreground mt-0.5">
                    Le llega a {form.email.trim()} para que cree su acceso. Si lo dejas sin
                    marcar podrás enviárselo cuando quieras desde la lista de equipo.
                  </span>
                </span>
              </label>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <button onClick={() => setModal(null)} className="px-4 py-2 rounded-xl border border-border text-[13px] font-medium text-foreground hover:bg-muted">Cancelar</button>
              <button onClick={guardar} disabled={!form.nombre.trim() || guardando} className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-brand text-brand-foreground text-[13px] font-bold disabled:opacity-40">
                {guardando ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
                {guardando ? 'Guardando…' : 'Guardar'}
              </button>
            </div>
            {errorGuardar && (
              <p role="alert" className="mt-3 text-[13px] text-destructive">
                No se ha guardado. {errorGuardar}
              </p>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Enlace secundario ("avisar de una baja") — el de disponibilidad ahora
          se copia directo desde la acción principal de la tarjeta. */}
      <Dialog open={enlace !== null} onOpenChange={open => !open && setEnlace(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{enlace ? TEXTOS_ENLACE[enlace.scope].titulo : ''}</DialogTitle>
          </DialogHeader>
          {enlace && (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                Envíaselo a <strong className="text-foreground">{enlace.instructor.nombre}</strong>. {TEXTOS_ENLACE[enlace.scope].explicacion}
              </p>
              {enlace.loading ? (
                <p className="text-sm text-muted-foreground py-6 text-center">Generando enlace…</p>
              ) : enlace.error ? (
                <p className="text-sm text-destructive">{enlace.error}</p>
              ) : enlace.url ? (
                <>
                  <div className="flex items-center gap-2">
                    <input readOnly value={enlace.url} onFocus={e => e.currentTarget.select()} className={inputCls + ' font-mono text-[11px]'} />
                    <button onClick={() => copiarEnlace(enlace.url!)} className="shrink-0 flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl bg-brand text-brand-foreground text-[13px] font-bold hover:brightness-95 transition">
                      {enlace.copiado ? <><Check size={14} /> Copiado</> : <><Copy size={14} /> Copiar</>}
                    </button>
                  </div>
                  <a
                    href={`https://wa.me/${(enlace.instructor.telefono ?? '').replace(/[^0-9]/g, '')}?text=${encodeURIComponent(`Hola ${enlace.instructor.nombre}, ${TEXTOS_ENLACE[enlace.scope].whatsapp} ${enlace.url}`)}`}
                    target="_blank" rel="noopener noreferrer"
                    className="flex items-center justify-center gap-2 w-full px-4 py-2.5 rounded-xl border border-border text-[13px] font-medium text-foreground hover:bg-muted transition"
                  >
                    Enviar por WhatsApp
                  </a>
                  <p className="text-[11px] text-muted-foreground">
                    Que lo guarde en el móvil: le sirve para cualquier clase suya. Caduca en 30 días.
                  </p>
                </>
              ) : null}
            </div>
          )}
        </DialogContent>
      </Dialog>

      <ValoracionesDialog instructor={verValor} tiposClase={tiposClase} onClose={() => setVerValor(null)} />
      <HorasDialog instructor={verHoras} sesiones={sesiones} tiposClase={tiposClase} onClose={() => setVerHoras(null)} />
      <AusenciasDialog instructor={verAusencias} onClose={() => setVerAusencias(null)} />

      <Dialog open={confirmDel !== null} onOpenChange={open => !open && setConfirmDel(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Eliminar miembro</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            ¿Seguro que quieres eliminar a <strong className="text-foreground">{confirmDel?.nombre}</strong> del equipo? Las clases y citas ya asignadas no se borran, pero quedarán sin instructor visible.
          </p>
          <div className="flex justify-end gap-2 pt-4">
            <button onClick={() => setConfirmDel(null)} className="px-4 py-2 rounded-xl border border-border text-[13px] font-medium text-foreground hover:bg-muted">Cancelar</button>
            <button onClick={async () => {
              if (!confirmDel) return;
              const res = await deleteInstructor(confirmDel.id);
              setConfirmDel(null);
              if (!res.ok) showToast(res.error);
            }} className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-red-500 text-white text-[13px] font-bold hover:bg-red-600">
              <X size={14} /> Eliminar
            </button>
          </div>
        </DialogContent>
      </Dialog>

      {toastMsg && <Toast message={toastMsg} onDismiss={dismissToast} />}

      {/* Aviso con Deshacer (5 s) de la acción principal de una tarjeta */}
      {aviso && (
        <div className="fixed left-1/2 bottom-6 z-50 -translate-x-1/2 flex items-center gap-3 bg-foreground text-background rounded-full pl-5 pr-2 py-2.5 shadow-lg">
          <span className="text-[13px] font-medium whitespace-nowrap">{aviso.texto}</span>
          {aviso.deshacer && (
            <button
              onClick={() => { aviso.deshacer?.(); }}
              className="h-8 px-3.5 rounded-full bg-background/15 text-[12.5px] font-bold hover:bg-background/25 transition-colors"
            >
              Deshacer
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Piezas del rediseño de Equipo ────────────────────────────────────────────

function PillSelect({ label, value, onChange, options }: {
  label: string; value: string; onChange: (v: string) => void; options: [string, string][];
}) {
  return (
    <label className="flex items-center gap-1.5 rounded-xl border border-border bg-card pl-3 pr-2 py-2 text-[13px] cursor-pointer hover:bg-muted/40 transition-colors">
      <span className="text-muted-foreground font-medium whitespace-nowrap">{label}:</span>
      <select value={value} onChange={e => onChange(e.target.value)}
        className="bg-transparent font-semibold text-foreground focus:outline-none cursor-pointer">
        {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select>
    </label>
  );
}

const ACCION_ESTILO: Record<AccionTipo, { fondo: string; tinta: string; borde: string }> = {
  avisos: { fondo: 'bg-brand', tinta: 'text-brand-foreground', borde: 'border-transparent' },
  mensaje: { fondo: 'bg-brand', tinta: 'text-brand-foreground', borde: 'border-transparent' },
  pedir: { fondo: 'bg-brand', tinta: 'text-brand-foreground', borde: 'border-transparent' },
  horas: { fondo: 'bg-rose-600', tinta: 'text-white', borde: 'border-transparent' },
  hecho: { fondo: 'bg-success/10', tinta: 'text-success', borde: 'border-border' },
};
const ACCION_ICONO: Record<AccionTipo, typeof Bell> = {
  avisos: Bell, mensaje: MessageCircle, pedir: CalendarClock, horas: AlertTriangle, hecho: Check,
};

function TarjetaMiembro({
  m, rolViewer, gestiona, refCb, pedido, diaSel, onDiaSel, menuAbierto, onMenu, onAccion,
  onEditar, onEliminar, onValoraciones, onHoras, onAusencias, onEnlaceBaja, ausente, invitando, onInvitar,
}: {
  m: MiembroCompleto; rolViewer: Rol; gestiona: boolean; refCb: (el: HTMLElement | null) => void;
  pedido: boolean; diaSel: number | null; onDiaSel: (i: number) => void;
  menuAbierto: boolean; onMenu: () => void; onAccion: (tipo: AccionTipo) => void;
  onEditar: () => void; onEliminar: () => void; onValoraciones: () => void; onHoras: () => void;
  onAusencias: () => void; onEnlaceBaja: () => void;
  ausente?: AusenciaInstructora | null; invitando?: boolean; onInvitar?: () => void;
}) {
  const ahora = new Date();
  const situacion = situacionDe(m, ahora);
  const est = estadoTarjeta(m, rolViewer, ahora);
  const cif = cifrasTarjeta(m, rolViewer, ahora);
  const acc = accionTarjeta(m, rolViewer, { pedido });
  const estilo = SITUACION_ESTILO[situacion];
  const accEstilo = ACCION_ESTILO[acc.tipo];
  const AccIcono = ACCION_ICONO[acc.tipo];
  // Mostrar "…" solo si hay algo que gestionar sobre esta ficha: ni la vista
  // de compañeras (instructora sobre otra persona) ni "tu propia cuenta desde
  // fuera de la gestión" tienen acciones administrativas.
  const verMenu = gestiona;
  const clasesSemana = m.semana.reduce((a, b) => a + b, 0);

  return (
    <article
      ref={refCb}
      className="bg-card border border-border rounded-2xl p-5 flex flex-col gap-4 transition-shadow hover:shadow-lg motion-reduce:transition-none"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-3 min-w-0">
          <ProfileAvatar avatarId={m.avatar} fotoUrl={m.fotoUrl} nombre={m.nombre} color={m.color} size="md" />
          <div className="min-w-0">
            <p className="font-bold text-foreground text-[15px] leading-tight truncate flex items-center gap-1.5">
              <span className="truncate">{m.nombre}</span>
              {m.conAcceso && (
                <ShieldCheck size={14} className="shrink-0 text-brand-secondary" aria-label="Con acceso a la app" />
              )}
            </p>
            <div className="flex items-center gap-1.5 flex-wrap mt-1">
              <span className={`inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full ${m.activo ? 'bg-success/10 text-success' : 'bg-muted text-muted-foreground'}`}>
                <span className={`w-1.5 h-1.5 rounded-full ${m.activo ? 'bg-success' : 'bg-muted-foreground'}`} />
                {m.activo ? 'Activa' : 'Inactiva'}
              </span>
              <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-muted text-foreground">{ROL_LABEL[m.rol]}</span>
              {ausente && (
                <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full bg-warning/10 text-warning">
                  <Plane size={10} />{AUSENCIA_ETIQUETA[ausente.tipo]}
                </span>
              )}
            </div>
          </div>
        </div>
        {verMenu && (
          <div className="flex items-center gap-1 shrink-0 relative" data-menu-equipo>
            <button onClick={onEditar} title="Editar" className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-muted text-muted-foreground transition-colors">
              <Pencil size={14} />
            </button>
            <button onClick={onMenu} title="Más acciones" className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-muted text-muted-foreground transition-colors">
              <MoreVertical size={15} />
            </button>
            {menuAbierto && (
              <div data-menu-equipo className="absolute right-0 top-9 z-30 w-56 rounded-xl border border-border bg-card shadow-lg py-1">
                {cif.conValoracion && (
                  <button onClick={onValoraciones} className="w-full flex items-center gap-2 px-3 py-2 text-[13px] text-foreground hover:bg-muted text-left">
                    <Star size={14} className="text-[#F5B301]" fill="#F5B301" /> Ver valoraciones
                  </button>
                )}
                {m.rol === 'INSTRUCTOR' && (
                  <>
                    <button onClick={onHoras} className="w-full flex items-center gap-2 px-3 py-2 text-[13px] text-foreground hover:bg-muted text-left">
                      <Clock size={14} className="text-muted-foreground" /> Horas del mes
                    </button>
                    <button onClick={onAusencias} className="w-full flex items-center gap-2 px-3 py-2 text-[13px] text-foreground hover:bg-muted text-left">
                      <Plane size={14} className="text-muted-foreground" /> Vacaciones y bajas
                    </button>
                    <button onClick={onEnlaceBaja} className="w-full flex items-center gap-2 px-3 py-2 text-[13px] text-foreground hover:bg-muted text-left">
                      <CalendarOff size={14} className="text-muted-foreground" /> {TEXTOS_ENLACE.reportar_baja.menu}
                    </button>
                  </>
                )}
                <button onClick={onEliminar} className="w-full flex items-center gap-2 px-3 py-2 text-[13px] text-destructive hover:bg-destructive/10 text-left">
                  <Trash2 size={14} /> Eliminar
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* 1. Dónde está ahora */}
      <div className={`rounded-xl px-4 py-3 ${estilo.fondo}`}>
        <p className={`flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider ${estilo.tinta}`}>
          <span className={`w-1.5 h-1.5 rounded-full ${estilo.punto}`} />{est.etiqueta}
        </p>
        <p className="text-[14px] font-semibold text-foreground mt-1.5 leading-snug">{est.titulo}</p>
        <p className="text-[12.5px] text-muted-foreground mt-0.5">{est.pie}</p>
      </div>

      {/* 2. Su semana */}
      {cif.verBarras && (
        <div>
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-[10.5px] font-bold uppercase tracking-wider text-muted-foreground">Esta semana</span>
            <span className="text-[12.5px] font-semibold text-foreground">{clasesSemana} clase{clasesSemana === 1 ? '' : 's'}</span>
          </div>
          <div className="grid grid-cols-7 gap-1.5 mt-3 items-end">
            {m.semana.map((n, i) => (
              <button key={i} type="button" onClick={() => onDiaSel(i)}
                className="flex flex-col items-center gap-1.5 bg-transparent border-none p-0 cursor-pointer">
                <span
                  className={`w-full rounded-[6px] transition-[height] ${n === 0 ? 'bg-muted' : diaSel === i ? 'bg-brand' : 'bg-foreground/70'}`}
                  style={{ height: `${n === 0 ? 8 : 8 + n * 10}px` }}
                />
                <span className={`text-[10px] ${diaSel === i ? 'font-bold text-foreground' : 'text-muted-foreground'}`}>{DIAS[i]}</span>
              </button>
            ))}
          </div>
          <p className="text-[12.5px] text-muted-foreground mt-3 leading-snug min-h-[2.6em]">
            {diaSel === null
              ? (clasesSemana > 0 ? pistaDe(m) : 'Sin clases programadas esta semana.')
              : `${DIAS_LARGOS[diaSel]}: ${m.horasDia[diaSel] ?? 'Libre'}`}
          </p>
        </div>
      )}

      {/* 3. Ocupación + segunda cifra */}
      {cif.verCifras && (
        <div className="grid grid-cols-2 gap-3.5 pt-3 border-t border-border">
          <div>
            <p className="text-[22px] font-extrabold text-foreground leading-none tabular-nums">{cif.ocupacionTexto}</p>
            <span className="block h-1 mt-2 rounded-full bg-foreground/[0.07]">
              <span className="block h-1 rounded-full bg-brand transition-[width] duration-700" style={{ width: `${cif.ocupacionBarraPct}%` }} />
            </span>
            <p className="text-[12px] text-muted-foreground mt-2">{cif.ocupacionPie}</p>
          </div>
          <div className="pl-3.5 border-l border-border">
            <p className="text-[22px] font-extrabold text-foreground leading-none tabular-nums">{cif.segundaValor}</p>
            <p className="text-[12px] text-muted-foreground mt-2">{cif.segundaEtiqueta}</p>
            {rolViewer !== 'INSTRUCTOR' || m.esYo ? (
              <p className="flex items-center gap-1 text-[11px] text-muted-foreground/70 mt-1">
                {cif.conValoracion && <Star size={11} fill="#F5B301" stroke="#F5B301" />}{cif.valoracionTexto}
              </p>
            ) : null}
          </div>
        </div>
      )}

      {/* Frecuencia media (90 días): distingue de un vistazo "plantilla" de
          "colaboradora ocasional/freelance" sin necesitar un campo aparte que
          alguien tenga que marcar a mano. */}
      {cif.verCifras && cif.frecuenciaTexto && (
        <p className="text-[11px] text-muted-foreground/70 -mt-1">{cif.frecuenciaTexto} de media</p>
      )}

      {!m.conAcceso && m.email && gestiona && (
        <div className="flex items-center justify-between gap-2">
          <span className="text-[12px] text-warning font-medium flex items-center gap-1.5"><AlertTriangle size={12} />Todavía sin acceso</span>
          {onInvitar && (
            <button onClick={onInvitar} disabled={invitando} className="text-[12px] font-semibold text-brand-medio hover:underline underline-offset-2 disabled:opacity-50">
              {invitando ? 'Enviando…' : 'Enviar invitación'}
            </button>
          )}
        </div>
      )}

      {/* Acción con nombre propio */}
      <button
        onClick={() => onAccion(acc.tipo)}
        className={`mt-auto flex items-center justify-center gap-2 h-11 rounded-full border ${accEstilo.borde} ${accEstilo.fondo} ${accEstilo.tinta} text-[13.5px] font-semibold transition-[filter,transform] hover:brightness-105 active:scale-[.98]`}
      >
        <AccIcono size={14} />{acc.texto}
      </button>

      {(gestiona || m.esYo) && (m.email || m.telefono) && (
        <p className="flex items-center gap-2 text-[11.5px] text-muted-foreground/70 truncate">
          {m.email && <span className="flex items-center gap-1 truncate"><Mail size={11} className="shrink-0" />{m.email}</span>}
          {m.telefono && <span className="flex items-center gap-1 shrink-0"><Phone size={11} className="shrink-0" />{m.telefono}</span>}
        </p>
      )}
    </article>
  );
}

function pistaDe(m: MiembroCompleto): string {
  const libre = m.semana.findIndex(n => n === 0);
  if (libre === -1) return 'Trabaja todos los días de la semana.';
  return `El ${DIAS_LARGOS[libre].toLowerCase()} lo tiene libre: es a quien preguntar si falta alguien.`;
}

// ─── Tab: Actividad (auditoría — quién hizo qué) ───────────────────────────────

const TIPO_AUDITORIA = new Set([
  'SOCIA_EDITADA', 'SOCIA_ELIMINADA', 'PLAN_CREADO', 'PLAN_EDITADO', 'PLAN_ELIMINADO',
  'PLAN_ASIGNADO', 'COBRO_MANUAL', 'EQUIPO_ALTA', 'EQUIPO_EDITADO', 'EQUIPO_BAJA',
  'AUTOMATIZACION_CAMBIO', 'NUEVA_SOCIA', 'SESION_REASIGNADA',
]);

function ActividadTab({ actividadReciente }: { actividadReciente: import('@/lib/types').ActividadReciente[] }) {
  const relevantes = actividadReciente
    .filter(a => TIPO_AUDITORIA.has(a.tipo))
    .sort((a, b) => b.creadoEn.localeCompare(a.creadoEn));

  return (
    <div className="bg-card border border-border rounded-2xl p-5">
      <div className="flex items-center gap-2 mb-4">
        <History size={16} className="text-muted-foreground" />
        <h2 className="text-sm font-bold text-foreground">Quién ha hecho qué</h2>
      </div>
      {relevantes.length === 0 ? (
        <p className="text-sm text-muted-foreground py-8 text-center">Todavía no hay movimientos registrados.</p>
      ) : (
        <div className="space-y-2">
          {relevantes.map(a => (
            <div key={a.id} className="flex items-start justify-between gap-3 py-2.5 border-b border-muted last:border-0">
              <p className="text-sm text-foreground">{a.texto}</p>
              <span className="text-xs text-muted-foreground whitespace-nowrap shrink-0">{formatFechaHora(a.creadoEn)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Horas del mes por instructora ───────────────────────────────────────────

function HorasDialog({ instructor, sesiones, tiposClase, onClose }: {
  instructor: Instructor | null; sesiones: Sesion[]; tiposClase: TipoClase[]; onClose: () => void;
}) {
  const [mesAtras, setMesAtras] = useState(0);
  // Reinicia el mes al cambiar de instructora — ajuste de estado durante el
  // render (patrón recomendado), no un efecto: evita el cascading render de
  // "setState síncrono dentro de un efecto".
  const [instructorAnteriorId, setInstructorAnteriorId] = useState(instructor?.id);
  if (instructor?.id !== instructorAnteriorId) {
    setInstructorAnteriorId(instructor?.id);
    setMesAtras(0);
  }

  const ref = new Date();
  const mes = new Date(ref.getFullYear(), ref.getMonth() - mesAtras, 1);
  const mesFin = new Date(ref.getFullYear(), ref.getMonth() - mesAtras + 1, 1);

  const filas = useMemo(() => {
    if (!instructor) return [];
    const tipoById = new Map(tiposClase.map(t => [t.id, t]));
    return sesiones
      .filter(s => {
        if (s.instructorId !== instructor.id || s.cancelada) return false;
        const d = new Date(s.inicio);
        return d >= mes && d < mesFin;
      })
      .sort((a, b) => a.inicio.localeCompare(b.inicio))
      .map(s => {
        const ini = new Date(s.inicio);
        const horas = Math.max(0, (new Date(s.fin).getTime() - ini.getTime()) / 3600000);
        return { id: s.id, inicio: ini, clase: tipoById.get(s.tipoClaseId)?.nombre ?? 'Clase', horas };
      });
  }, [instructor, sesiones, tiposClase, mesAtras]);

  const totalHoras = filas.reduce((a, f) => a + f.horas, 0);
  const fmtMes = mes.toLocaleDateString('es-ES', { month: 'long', year: 'numeric' });
  const fmtH = (h: number) => `${h % 1 === 0 ? h : h.toFixed(1)} h`;

  function exportar() {
    if (!instructor) return;
    const esc = (v: string | number) => { const s = String(v); return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
    const rows: (string | number)[][] = [['Fecha', 'Hora', 'Clase', 'Horas']];
    for (const f of filas) {
      rows.push([
        f.inicio.toLocaleDateString('es-ES'),
        f.inicio.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }),
        f.clase,
        f.horas % 1 === 0 ? f.horas : f.horas.toFixed(2),
      ]);
    }
    rows.push(['', '', 'TOTAL', totalHoras % 1 === 0 ? totalHoras : totalHoras.toFixed(2)]);
    const csv = rows.map(r => r.map(esc).join(';')).join('\r\n');
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `horas-${instructor.nombre.toLowerCase().replace(/\s+/g, '-')}-${mes.toISOString().slice(0, 7)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  return (
    <Dialog open={instructor !== null} onOpenChange={open => !open && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Horas de {instructor?.nombre}</DialogTitle>
        </DialogHeader>

        <div className="flex items-center justify-between">
          <button onClick={() => setMesAtras(m => Math.min(m + 1, 11))} disabled={mesAtras >= 11} aria-label="Mes anterior"
            className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-muted text-muted-foreground disabled:opacity-30">
            <ChevronLeft size={16} />
          </button>
          <p className="text-[14px] font-bold text-foreground capitalize">{fmtMes}</p>
          <button onClick={() => setMesAtras(m => Math.max(m - 1, 0))} disabled={mesAtras === 0} aria-label="Mes siguiente"
            className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-muted text-muted-foreground disabled:opacity-30">
            <ChevronRight size={16} />
          </button>
        </div>

        <div className="flex items-center gap-6 py-3 px-4 rounded-xl bg-muted/50">
          <div>
            <p className="text-[20px] font-extrabold text-foreground leading-none tabular-nums">{fmtH(totalHoras)}</p>
            <p className="text-[11px] text-muted-foreground mt-1">en clases este mes</p>
          </div>
          <div className="pl-6 border-l border-border">
            <p className="text-[20px] font-extrabold text-foreground leading-none tabular-nums">{filas.length}</p>
            <p className="text-[11px] text-muted-foreground mt-1">clase{filas.length === 1 ? '' : 's'}</p>
          </div>
        </div>

        {filas.length === 0 ? (
          <p className="text-[13px] text-muted-foreground text-center py-6">Sin clases este mes.</p>
        ) : (
          <div className="max-h-72 overflow-y-auto divide-y divide-[#F1F1F4] -mx-1 px-1">
            {filas.map(f => (
              <div key={f.id} className="flex items-center justify-between py-2 gap-3">
                <div className="min-w-0">
                  <p className="text-[13px] font-semibold text-foreground truncate">{f.clase}</p>
                  <p className="text-[11.5px] text-muted-foreground capitalize">
                    {f.inicio.toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short' })} · {f.inicio.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}
                  </p>
                </div>
                <span className="text-[13px] font-bold text-foreground tabular-nums shrink-0">{fmtH(f.horas)}</span>
              </div>
            ))}
          </div>
        )}

        <div className="flex justify-end pt-1">
          <button onClick={exportar} disabled={filas.length === 0}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl border border-border text-[13px] font-semibold text-foreground hover:bg-muted disabled:opacity-40">
            <Download size={14} /> Exportar CSV
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Vacaciones y bajas de una instructora ───────────────────────────────────

const TIPO_AUSENCIA_LABEL: Record<AusenciaInstructora['tipo'], string> = {
  VACACIONES: 'Vacaciones', BAJA_MEDICA: 'Baja médica', OTRO: 'Otra ausencia',
};

function AusenciasDialog({ instructor, onClose }: { instructor: Instructor | null; onClose: () => void }) {
  const [items, setItems] = useState<AusenciaInstructora[]>([]);
  const [cargando, setCargando] = useState(false);
  const [tipo, setTipo] = useState<AusenciaInstructora['tipo']>('VACACIONES');
  const [desde, setDesde] = useState('');
  const [hasta, setHasta] = useState('');
  const [motivo, setMotivo] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');
  const [aviso, setAviso] = useState('');

  const instructorId = instructor?.id;
  const cargar = useCallback(async (id: string) => {
    setCargando(true); setError(''); setAviso('');
    setTipo('VACACIONES'); setDesde(''); setHasta(''); setMotivo('');
    setItems(await listarAusencias(id));
    setCargando(false);
  }, []);
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { if (instructorId) void cargar(instructorId); }, [instructorId, cargar]);

  async function guardar() {
    if (!instructor || !desde || !hasta || guardando) return;
    if (hasta < desde) { setError('La fecha de fin es anterior a la de inicio.'); return; }
    setGuardando(true); setError(''); setAviso('');
    const r = await crearAusencia({ instructorId: instructor.id, tipo, desde, hasta, motivo });
    setGuardando(false);
    if ('error' in r) { setError(r.error); return; }
    setAviso(r.clasesAfectadas > 0
      ? `Guardada. Ojo: ${r.clasesAfectadas} ${r.clasesAfectadas === 1 ? 'clase suya cae' : 'clases suyas caen'} en esas fechas — hay que cubrirlas.`
      : 'Guardada. No tiene clases en esas fechas.');
    setDesde(''); setHasta(''); setMotivo('');
    setItems(await listarAusencias(instructor.id));
  }

  async function borrar(id: string) {
    if (!instructor) return;
    setItems(prev => prev.filter(a => a.id !== id));
    await borrarAusencia(id);
    setItems(await listarAusencias(instructor.id));
  }

  const fmt = (iso: string) =>
    new Date(`${iso}T12:00:00Z`).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' });

  return (
    <Dialog open={instructor !== null} onOpenChange={open => !open && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Vacaciones y bajas · {instructor?.nombre}</DialogTitle>
        </DialogHeader>

        <p className="text-[12.5px] text-muted-foreground -mt-1 mb-3">
          Mientras dure la ausencia no se le ofrecerán sustituciones ni saldrá como candidata.
        </p>

        <div className="rounded-2xl border border-border bg-muted/30 p-3.5 space-y-2.5">
          <div className="flex gap-1.5">
            {(Object.keys(TIPO_AUSENCIA_LABEL) as AusenciaInstructora['tipo'][]).map(t => (
              <button key={t} onClick={() => setTipo(t)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[12px] font-bold transition-colors ${tipo === t ? 'bg-brand text-brand-foreground' : 'bg-card border border-border text-muted-foreground hover:text-foreground'}`}>
                {t === 'VACACIONES' ? <Plane size={12} /> : t === 'BAJA_MEDICA' ? <Stethoscope size={12} /> : <CalendarOff size={12} />}
                {TIPO_AUSENCIA_LABEL[t]}
              </button>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-2">
            <label className="block">
              <span className={labelCls}>Desde</span>
              <input type="date" value={desde} onChange={e => setDesde(e.target.value)} className={inputCls} />
            </label>
            <label className="block">
              <span className={labelCls}>Hasta</span>
              <input type="date" value={hasta} onChange={e => setHasta(e.target.value)} min={desde || undefined} className={inputCls} />
            </label>
          </div>
          <input value={motivo} onChange={e => setMotivo(e.target.value)}
            placeholder="Nota (opcional, solo la ves tú)" className={inputCls} />
          {error && <p className="text-[12.5px] text-destructive">{error}</p>}
          {aviso && (
            <p className="flex items-start gap-1.5 text-[12.5px] text-warning">
              <AlertTriangle size={13} className="shrink-0 mt-0.5" />{aviso}
            </p>
          )}
          <button onClick={guardar} disabled={!desde || !hasta || guardando}
            className="w-full py-2.5 rounded-xl bg-brand text-brand-foreground text-[13px] font-bold disabled:opacity-40">
            {guardando ? 'Guardando…' : 'Registrar ausencia'}
          </button>
        </div>

        <div className="mt-3 max-h-[38vh] overflow-y-auto">
          {cargando ? (
            <p className="text-[13px] text-muted-foreground py-4 text-center">Cargando…</p>
          ) : items.length === 0 ? (
            <p className="text-[13px] text-muted-foreground py-4 text-center">Sin ausencias registradas.</p>
          ) : items.map(a => (
            <div key={a.id} className="flex items-center gap-3 py-2.5 border-b border-border/60 last:border-0">
              <span className="w-8 h-8 rounded-full bg-muted flex items-center justify-center shrink-0">
                {a.tipo === 'VACACIONES' ? <Plane size={14} className="text-muted-foreground" />
                  : a.tipo === 'BAJA_MEDICA' ? <Stethoscope size={14} className="text-muted-foreground" />
                  : <CalendarOff size={14} className="text-muted-foreground" />}
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-[13px] font-bold text-foreground">{TIPO_AUSENCIA_LABEL[a.tipo]}</p>
                <p className="text-[12px] text-muted-foreground">
                  {fmt(a.desde)} → {fmt(a.hasta)}{a.motivo ? ` · ${a.motivo}` : ''}
                </p>
              </div>
              <button onClick={() => borrar(a.id)} aria-label="Quitar ausencia"
                className="shrink-0 text-muted-foreground/60 hover:text-destructive">
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Valoraciones de una instructora (leer cada ⭐ + comentario) ───────────────

function Estrellas({ n, size = 14 }: { n: number; size?: number }) {
  return (
    <span className="inline-flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map(s => (
        <Star key={s} size={size} fill={s <= n ? '#F5B301' : 'none'} stroke={s <= n ? '#F5B301' : '#CBD5E1'} strokeWidth={1.6} />
      ))}
    </span>
  );
}

function ValoracionesDialog({ instructor, tiposClase, onClose }: {
  instructor: Instructor | null;
  tiposClase: import('@/lib/types').TipoClase[];
  onClose: () => void;
}) {
  const [items, setItems] = useState<ValoracionDetalle[]>([]);
  const [cargando, setCargando] = useState(false);

  useEffect(() => {
    if (!instructor) return;
    let vivo = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setCargando(true); setItems([]);
    listarValoraciones(instructor.id).then(r => { if (vivo) { setItems(r); setCargando(false); } });
    return () => { vivo = false; };
  }, [instructor]);

  const total = items.length;
  const media = total ? items.reduce((a, v) => a + v.puntuacion, 0) / total : 0;
  const dist = [5, 4, 3, 2, 1].map(n => ({ n, c: items.filter(v => v.puntuacion === n).length }));
  const tipoNombre = (id: string | null) => tiposClase.find(t => t.id === id)?.nombre ?? 'Clase';
  const fechaCorta = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' }) : '');

  return (
    <Dialog open={!!instructor} onOpenChange={o => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Valoraciones de {instructor?.nombre}</DialogTitle>
        </DialogHeader>
        {cargando ? (
          <p className="text-sm text-muted-foreground py-10 text-center">Cargando…</p>
        ) : total === 0 ? (
          <div className="py-10 text-center">
            <div className="w-12 h-12 rounded-2xl bg-[#FEF9C3] flex items-center justify-center mx-auto mb-3"><Star size={22} className="text-[#F5B301]" fill="#F5B301" /></div>
            <p className="text-[15px] font-bold text-foreground">Aún sin valoraciones</p>
            <p className="text-[13px] text-muted-foreground mt-1">Cuando las alumnas valoren sus clases, aparecerán aquí.</p>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center gap-5 rounded-2xl border border-border bg-muted/30 p-4">
              <div className="text-center shrink-0">
                <p className="text-[34px] font-extrabold text-foreground leading-none tabular-nums">{media.toFixed(1)}</p>
                <div className="mt-1.5 flex justify-center"><Estrellas n={Math.round(media)} size={13} /></div>
                <p className="text-[11px] text-muted-foreground mt-1">{total} valoración{total === 1 ? '' : 'es'}</p>
              </div>
              <div className="flex-1 space-y-1">
                {dist.map(({ n, c }) => (
                  <div key={n} className="flex items-center gap-2">
                    <span className="text-[11px] text-muted-foreground w-2 tabular-nums">{n}</span>
                    <Star size={10} fill="#F5B301" stroke="#F5B301" className="shrink-0" />
                    <div className="flex-1 h-1.5 rounded-full bg-black/[0.06] overflow-hidden"><div className="h-full rounded-full bg-[#F5B301]" style={{ width: `${total ? Math.round(100 * c / total) : 0}%` }} /></div>
                    <span className="text-[11px] text-muted-foreground w-4 text-right tabular-nums">{c}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="space-y-2.5 max-h-[46vh] overflow-y-auto pr-1">
              {items.map(v => (
                <div key={v.id} className="rounded-xl border border-border p-3">
                  <div className="flex items-center justify-between gap-2">
                    <Estrellas n={v.puntuacion} size={14} />
                    <span className="text-[11px] text-muted-foreground shrink-0">{fechaCorta(v.creado_en)}</span>
                  </div>
                  {v.comentario && <p className="text-[13px] text-foreground mt-2 leading-relaxed">“{v.comentario}”</p>}
                  <p className="text-[11px] text-muted-foreground mt-2">
                    {tipoNombre(v.tipo_clase_id)}{v.inicio ? ` · ${fechaCorta(v.inicio)}` : ''}{v.alumna ? ` · ${v.alumna}` : ''}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
