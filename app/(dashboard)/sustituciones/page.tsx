'use client';

import { useEffect, useMemo, useState, useId } from 'react';
import { useStudio } from '@/lib/studio-context';
import {
  listarSustituciones, crearBaja, confirmarSustituta, descartarSustitucion, avisarSustituta,
  cancelarClase, setAvisarAlumnas, resumenValoraciones, generarEnlaceDisponibilidad, recalcularCandidatas,
  type SustitucionPanel, type ResumenValoraciones,
} from '@/lib/api-client';
import { construirTraza, resumenTraza, type ContactoFila } from '@/lib/sustituciones/traza';
import { avisoEquipoIncompleto, motivoSinCandidatas, type DiagnosticoEquipo } from '@/lib/sustituciones/preparacion';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { ProfileAvatar } from '@/components/ui/profile-avatar';
import {
  Plus, Check, Clock, AlertTriangle, CheckCircle2, CalendarX2, Sparkles, Mail, MailCheck, Users, CalendarOff, Star, CalendarClock, X, RefreshCw,
} from 'lucide-react';

type EstadoMeta = { label: string; cls: string; activa: boolean };
const ESTADO: Record<string, EstadoMeta> = {
  buscando: { label: 'Buscando', cls: 'bg-[#FEF3C7] text-[#92400E]', activa: true },
  pendiente_aprobacion: { label: 'Esperando tu visto bueno', cls: 'bg-brand/10 text-brand-secondary', activa: true },
  contactando: { label: 'Contactando', cls: 'bg-[#FEF3C7] text-[#92400E]', activa: true },
  agotada: { label: 'Nadie ha respondido', cls: 'bg-red-100 text-red-700', activa: true },
  confirmada: { label: 'Cubierta', cls: 'bg-[#DCFCE7] text-[#059669]', activa: false },
  sin_sustituta: { label: 'Sin sustituta', cls: 'bg-red-100 text-red-700', activa: false },
  resuelta_fuera: { label: 'Resuelta fuera', cls: 'bg-muted text-muted-foreground', activa: false },
  cancelada: { label: 'Cancelada', cls: 'bg-muted text-muted-foreground', activa: false },
};

function fmtClase(inicio?: string | null): string {
  if (!inicio) return 'Clase';
  const d = new Date(inicio);
  const fecha = d.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'short' });
  const hora = d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
  return `${fecha.charAt(0).toUpperCase()}${fecha.slice(1)} · ${hora}`;
}

export default function SustitucionesPage() {
  const { instructores, sesiones, tiposClase } = useStudio();
  const [items, setItems] = useState<SustitucionPanel[]>([]);
  const [cargando, setCargando] = useState(true);
  const [nuevaBaja, setNuevaBaja] = useState(false);
  const [accion, setAccion] = useState<string | null>(null); // id en proceso
  const [aviso, setAviso] = useState<string | null>(null);   // toast breve
  const [avisar, setAvisar] = useState(false);               // toggle avisar_alumnas
  const [valoraciones, setValoraciones] = useState<ResumenValoraciones>({});
  const [ahoraMs, setAhoraMs] = useState(0);          // se fija al montar (evita Date.now en render)
  const [horarioCerrado, setHorarioCerrado] = useState<string | null>(null);
  // Cancelar una clase puede disparar un email a todas las alumnas: se
  // confirma en un diálogo accesible, no con el confirm() nativo.
  const [aCancelar, setACancelar] = useState<SustitucionPanel | null>(null);
  // Quién es invisible para el ranking por no tener disponibilidad cargada.
  const [equipo, setEquipo] = useState<DiagnosticoEquipo>({ total: 0, sinDisponibilidad: [] });
  const [pidiendo, setPidiendo] = useState(false); // diálogo "pedir disponibilidad"

  const nombreInstructor = (id: string | null) => instructores.find(i => i.id === id)?.nombre ?? 'Instructora';
  const tipoDe = (id: string | null | undefined) => tiposClase.find(t => t.id === id);

  async function recargar() {
    const r = await listarSustituciones();
    setItems(r.items); setAvisar(r.avisarAlumnas); setEquipo(r.equipo); setCargando(false);
  }
  useEffect(() => {
    let vivo = true;
    listarSustituciones().then(r => { if (vivo) { setItems(r.items); setAvisar(r.avisarAlumnas); setEquipo(r.equipo); setCargando(false); } });
    resumenValoraciones().then(r => { if (vivo) setValoraciones(r); });
    return () => { vivo = false; };
  }, []);
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { setAhoraMs(Date.now()); }, []);

  async function toggleAvisar() {
    const nuevo = !avisar;
    setAvisar(nuevo); // optimista
    const r = await setAvisarAlumnas(nuevo);
    if ('error' in r) { setAvisar(!nuevo); alert(r.error); }
  }
  async function cancelar(s: SustitucionPanel) {
    setAccion(s.id);
    const r = await cancelarClase(s.id);
    if ('error' in r) { alert(r.error); setAccion(null); return; }
    const a = r.alumnas;
    setAviso(a && !a.desactivado ? `Clase cancelada. ${a.avisadas} de ${a.total} alumnas avisadas por email.` : 'Clase cancelada.');
    await recargar();
    setAccion(null);
    setTimeout(() => setAviso(null), 6000);
  }

  // Aviso de "tu equipo está a medio configurar". Null → no se pinta nada: una
  // franja de alerta permanente se aprende a ignorar en dos días.
  const avisoEquipo = avisoEquipoIncompleto(equipo);

  const activas = items.filter(s => ESTADO[s.estado]?.activa);
  const resueltas = items.filter(s => !ESTADO[s.estado]?.activa);

  // Última sustitución confirmada (reciente) → card "Horario actualizado".
  const ultimaConfirmada = useMemo(() => {
    if (!ahoraMs) return null;
    const conf = items
      .filter(s => s.estado === 'confirmada' && s.sesiones?.inicio && s.resuelto_en)
      .sort((a, b) => (b.resuelto_en ?? '').localeCompare(a.resuelto_en ?? ''));
    const top = conf[0];
    if (!top || !top.resuelto_en) return null;
    if (ahoraMs - new Date(top.resuelto_en).getTime() > 7 * 24 * 3600 * 1000) return null; // solo recientes
    return top;
  }, [items, ahoraMs]);

  async function confirmar(s: SustitucionPanel, instructorId: string) {
    setAccion(s.id);
    const r = await confirmarSustituta(s.id, instructorId);
    if ('error' in r) { alert(r.error); setAccion(null); return; }
    await recargar();
    setAccion(null);
  }
  async function avisarCandidata(s: SustitucionPanel, instructorId: string) {
    setAccion(s.id);
    const r = await avisarSustituta(s.id, instructorId);
    if ('error' in r) { alert(r.error); setAccion(null); return; }
    setAviso(r.emailSkipped
      ? `Marcada como avisada a ${r.candidata} (el email no está configurado — envíaselo tú).`
      : `Email enviado a ${r.candidata}. Cuando acepte, la clase se reasigna sola.`);
    await recargar();
    setAccion(null);
    setTimeout(() => setAviso(null), 6000);
  }
  async function volverABuscar(s: SustitucionPanel) {
    setAccion(s.id);
    const r = await recalcularCandidatas(s.id);
    if ('error' in r) { alert(r.error); setAccion(null); return; }
    setAviso(r.omitidasPorRechazo > 0
      ? `${r.resumen} (no volvemos a escribir a quien ya dijo que no puede).`
      : r.resumen);
    await recargar();
    setAccion(null);
    setTimeout(() => setAviso(null), 6000);
  }

  async function descartar(s: SustitucionPanel) {
    setAccion(s.id);
    // Antes se ignoraba el resultado: si fallaba, la tarjeta seguía ahí sin
    // explicación y no había forma de saber si se había guardado o no.
    const r = await descartarSustitucion(s.id);
    if ('error' in r) { alert(r.error); setAccion(null); return; }
    await recargar();
    setAccion(null);
  }

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-foreground tracking-tight">Sustituciones</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Cuando alguien falla, aquí tienes la sustituta antes de coger el teléfono</p>
        </div>
        <button onClick={() => setNuevaBaja(true)} className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-brand text-brand-foreground text-sm font-bold hover:brightness-95 transition-colors">
          <Plus size={16} /> Marcar una baja
        </button>
      </div>

      <label className="flex items-center gap-2.5 cursor-pointer text-[13px] text-muted-foreground select-none">
        <button
          type="button" role="switch" aria-checked={avisar} onClick={toggleAvisar}
          className={`relative w-9 h-5 rounded-full transition-colors shrink-0 ${avisar ? 'bg-brand' : 'bg-muted'}`}
        >
          <span className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${avisar ? 'translate-x-4' : ''}`} />
        </button>
        <Users size={14} className="shrink-0" />
        Avisar a las alumnas por email cuando se confirma sustituta o se cancela una clase
      </label>

      {avisoEquipo && (
        <div className="flex items-start gap-2.5 rounded-xl bg-[#FEF3C7] border border-[#FDE68A] px-4 py-3">
          <AlertTriangle size={16} className="shrink-0 mt-0.5 text-[#92400E]" />
          <div className="min-w-0">
            <p className="text-[13px] text-[#92400E] leading-relaxed">{avisoEquipo}</p>
            <button
              onClick={() => setPidiendo(true)}
              className="mt-2 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#92400E] text-white text-[12px] font-bold hover:brightness-110 transition"
            >
              <CalendarClock size={13} /> Pedirles su disponibilidad
            </button>
          </div>
        </div>
      )}

      <PedirDisponibilidadDialog
        abierto={pidiendo}
        instructores={equipo.sinDisponibilidad}
        onClose={() => setPidiendo(false)}
      />

      {aviso && (
        <div className="flex items-start gap-2 rounded-xl bg-[#DCFCE7] border border-[#86EFAC] px-4 py-3 text-[13px] text-[#166534]">
          <MailCheck size={16} className="shrink-0 mt-0.5" /> {aviso}
        </div>
      )}

      {ultimaConfirmada && horarioCerrado !== ultimaConfirmada.id && (
        <HorarioActualizadoCard
          sub={ultimaConfirmada} sesiones={sesiones} tiposClase={tiposClase} nombreInstructor={nombreInstructor}
          onClose={() => setHorarioCerrado(ultimaConfirmada.id)}
        />
      )}

      {cargando ? (
        <p className="text-sm text-muted-foreground py-16 text-center">Cargando…</p>
      ) : items.length === 0 ? (
        <div className="flex flex-col items-center justify-center text-center py-20 rounded-2xl border border-dashed border-border bg-card">
          <div className="w-14 h-14 rounded-2xl bg-brand/10 flex items-center justify-center mb-4">
            <Sparkles size={26} className="text-brand" />
          </div>
          <p className="text-[16px] font-bold text-foreground">Ninguna baja ahora mismo</p>
          <p className="text-[13px] text-muted-foreground mt-1 mb-5 max-w-xs">Cuando una instructora no pueda dar una clase, márcala aquí y te propondremos a quién avisar — con sus motivos, sin números.</p>
          <button onClick={() => setNuevaBaja(true)} className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-brand text-brand-foreground text-[13px] font-bold">
            <Plus size={15} /> Marcar una baja
          </button>
        </div>
      ) : (
        <div className="space-y-5">
          {activas.length > 0 && (
            <div className="space-y-3">
              {activas.map(s => (
                <SustitucionCard
                  key={s.id} s={s} tipo={tipoDe(s.sesiones?.tipo_clase_id)} nombreInstructor={nombreInstructor} equipo={equipo}
                  instructores={instructores} valoraciones={valoraciones} enProceso={accion === s.id}
                  onConfirmar={confirmar} onDescartar={descartar} onAvisar={avisarCandidata} onCancelar={(s: SustitucionPanel) => setACancelar(s)}
                  onVolverABuscar={volverABuscar}
                />
              ))}
            </div>
          )}
          {resueltas.length > 0 && (
            <div className="space-y-2">
              <h2 className="text-[12px] font-bold uppercase tracking-wider text-muted-foreground pt-2">Historial</h2>
              {resueltas.map(s => (
                <ResueltaRow key={s.id} s={s} tipo={tipoDe(s.sesiones?.tipo_clase_id)} nombreInstructor={nombreInstructor} />
              ))}
            </div>
          )}
        </div>
      )}

      <NuevaBajaDialog
        open={nuevaBaja} onClose={() => setNuevaBaja(false)}
        sesiones={sesiones} instructores={instructores} tiposClase={tiposClase}
        yaConBaja={new Set(activas.map(s => s.sesion_id))}
        onCreada={recargar}
      />

      <ConfirmDialog
        open={aCancelar !== null}
        onOpenChange={abierto => { if (!abierto) setACancelar(null); }}
        titulo="¿Cancelar esta clase?"
        descripcion={avisar
          ? 'Se avisará por email a las alumnas apuntadas.'
          : 'El aviso a alumnas está desactivado: no se les enviará ningún email.'}
        textoConfirmar="Cancelar clase"
        destructivo
        onConfirm={() => { const s = aCancelar; setACancelar(null); if (s) void cancelar(s); }}
      />
    </div>
  );
}

function fmtHora(inicio?: string | null): string {
  if (!inicio) return '';
  return new Date(inicio).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
}

// Media de valoraciones de alumnas (si tiene alguna). Compacta, para las cards.
function Estrellas({ val }: { val?: { media: number; total: number } }) {
  if (!val || val.total <= 0) return null;
  return (
    <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full bg-[#FEF9C3] text-[#A16207] shrink-0" title={`${val.total} valoración${val.total === 1 ? '' : 'es'} de alumnas`}>
      <Star size={10} fill="#F5B301" stroke="#F5B301" />
      {val.media.toFixed(1)}
      <span className="font-medium text-[#CA8A04]">({val.total})</span>
    </span>
  );
}

// Nombre corto tipo "Laura M." para las celdas del mini-calendario.
function nombreCorto(n: string): string {
  const p = n.trim().split(/\s+/);
  return p.length > 1 && p[1] ? `${p[0]} ${p[1][0]}.` : (p[0] ?? n);
}

// Card "Horario actualizado automáticamente": mini-calendario de la semana de la
// clase recién cubierta, con la sustituta ya colocada (resaltada en verde).
function HorarioActualizadoCard({ sub, sesiones, tiposClase, nombreInstructor, onClose }: {
  sub: SustitucionPanel;
  sesiones: import('@/lib/types').Sesion[];
  tiposClase: import('@/lib/types').TipoClase[];
  nombreInstructor: (id: string | null) => string;
  onClose: () => void;
}) {
  const DIAS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
  const tipoDe = (id: string | null | undefined) => tiposClase.find(t => t.id === id);

  const grid = useMemo(() => {
    const inicio = sub.sesiones?.inicio;
    if (!inicio) return null;
    const base = new Date(inicio);
    const dow = (base.getDay() + 6) % 7; // 0 = lunes
    const monday = new Date(base); monday.setDate(base.getDate() - dow); monday.setHours(0, 0, 0, 0);
    const weekEnd = new Date(monday.getTime() + 7 * 24 * 3600 * 1000);
    const dentro = sesiones.filter(s => {
      if (s.cancelada) return false;
      const d = new Date(s.inicio);
      return d >= monday && d < weekEnd;
    });
    if (!dentro.length) return null;
    const hhmm = (d: Date) => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    const diaIdx = (d: Date) => (d.getDay() + 6) % 7;
    const dias = [...new Set(dentro.map(s => diaIdx(new Date(s.inicio))))].sort((a, b) => a - b);
    const slots = [...new Set(dentro.map(s => hhmm(new Date(s.inicio))))].sort().slice(0, 6);
    const cell = new Map<string, typeof dentro>();
    for (const s of dentro) {
      const d = new Date(s.inicio);
      const t = hhmm(d);
      if (!slots.includes(t)) continue;
      const key = `${diaIdx(d)}|${t}`;
      const arr = cell.get(key) ?? []; arr.push(s); cell.set(key, arr);
    }
    return { dias, slots, cell };
  }, [sub, sesiones]);

  if (!grid) return null;

  return (
    <div className="bg-card border border-border rounded-2xl p-5 shadow-sm">
      <div className="flex items-center justify-between mb-3.5">
        <div className="flex items-center gap-1.5">
          <RefreshCw size={14} className="text-[#16A34A]" />
          <span className="text-[13px] font-bold text-foreground">Horario actualizado automáticamente</span>
        </div>
        <button onClick={onClose} title="Cerrar" className="text-muted-foreground hover:text-foreground transition-colors"><X size={15} /></button>
      </div>
      <div className="overflow-x-auto">
        <table className="border-separate" style={{ borderSpacing: 4, minWidth: '100%' }}>
          <thead>
            <tr>
              <th className="w-9" />
              {grid.dias.map(d => <th key={d} className="text-[11px] font-bold text-muted-foreground pb-1 px-1">{DIAS[d]}</th>)}
            </tr>
          </thead>
          <tbody>
            {grid.slots.map(slot => (
              <tr key={slot}>
                <td className="text-[11px] font-semibold text-muted-foreground pr-1 whitespace-nowrap align-top pt-1.5">{slot}</td>
                {grid.dias.map(d => {
                  const arr = grid.cell.get(`${d}|${slot}`) ?? [];
                  return (
                    <td key={d} className="align-top min-w-[76px]">
                      <div className="flex flex-col gap-1">
                        {arr.slice(0, 2).map(s => {
                          const t = tipoDe(s.tipoClaseId);
                          const esSust = s.id === sub.sesion_id;
                          const color = t?.color ?? '#94A3B8';
                          const instrId = esSust ? sub.sustituta_final_id : s.instructorId;
                          return (
                            <div key={s.id} className={`rounded-lg px-2 py-1.5 leading-tight ${esSust ? 'ring-2 ring-[#22C55E]' : ''}`} style={{ backgroundColor: `${color}1A` }}>
                              <p className="text-[10px] font-bold truncate" style={{ color }}>{t?.nombre ?? 'Clase'}</p>
                              <p className="text-[10px] text-foreground/70 truncate">{nombreCorto(nombreInstructor(instrId))}</p>
                            </div>
                          );
                        })}
                        {arr.length > 2 && <p className="text-[9px] text-muted-foreground pl-1">+{arr.length - 2}</p>}
                      </div>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-[11px] text-muted-foreground mt-3">
        <strong className="text-foreground">{nombreInstructor(sub.sustituta_final_id)}</strong> cubre {tipoDe(sub.sesiones?.tipo_clase_id)?.nombre ?? 'la clase'} · {fmtClase(sub.sesiones?.inicio)}. Ya está en el calendario, sin que muevas un dedo.
      </p>
    </div>
  );
}

function SustitucionCard({
  s, tipo, nombreInstructor, instructores, valoraciones, equipo, enProceso, onConfirmar, onDescartar, onAvisar, onCancelar, onVolverABuscar,
}: {
  s: SustitucionPanel;
  tipo: { nombre: string; color: string } | undefined;
  nombreInstructor: (id: string | null) => string;
  instructores: import('@/lib/types').Instructor[];
  valoraciones: ResumenValoraciones;
  equipo: DiagnosticoEquipo;
  enProceso: boolean;
  onConfirmar: (s: SustitucionPanel, instructorId: string) => void;
  onDescartar: (s: SustitucionPanel) => void;
  onAvisar: (s: SustitucionPanel, instructorId: string) => void;
  onCancelar: (s: SustitucionPanel) => void;
  onVolverABuscar: (s: SustitucionPanel) => void;
}) {
  const meta = ESTADO[s.estado] ?? ESTADO.buscando;
  const ranking = Array.isArray(s.ranking) ? s.ranking : [];
  const hero = ranking[0];
  const resto = ranking.slice(1);
  const esp = tipo?.nombre ?? 'Clase';
  const contactada = s.estado === 'contactando';
  const esSolicitud = s.estado === 'pendiente_aprobacion'; // card "Nueva sustitución solicitada"
  const insDe = (id: string) => instructores.find(i => i.id === id);
  // Sin disponibilidad cargada, SIN contar a quien causa la baja: no puede
  // cubrirse a sí misma, así que sumarla al recuento despistaría.
  const sinDispRelevantes = equipo.sinDisponibilidad
    .filter(i => i.id !== s.instructor_original_id).length;

  return (
    <div className="bg-card border border-border rounded-2xl p-5 sm:p-6 shadow-sm">
      {/* Cabecera: la clase que hay que cubrir */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2.5 min-w-0">
          <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: tipo?.color ?? '#94A3B8' }} />
          <div className="min-w-0">
            <p className="font-bold text-foreground text-[15px] leading-tight">{esp}</p>
            <p className="text-[13px] text-muted-foreground">{fmtClase(s.sesiones?.inicio)}</p>
          </div>
        </div>
        <span className={`text-[11px] font-bold px-2.5 py-1 rounded-full ${meta.cls}`}>{meta.label}</span>
      </div>
      <p className="text-[13px] text-muted-foreground mt-2.5">
        {/* Si lo avisó ella misma desde el móvil, decirlo: es la diferencia entre
            "alguien ha marcado esto" y "Meri te ha avisado" — y evita que la
            propietaria coja el teléfono para confirmar algo que ya está confirmado. */}
        {s.origen === 'instructora' ? (
          <><strong className="text-foreground">{nombreInstructor(s.instructor_original_id)}</strong> ha avisado de que no puede</>
        ) : (
          <>Falta <strong className="text-foreground">{nombreInstructor(s.instructor_original_id)}</strong></>
        )}
        {s.motivo ? <> — <span className="italic">{s.motivo}</span></> : null}
      </p>

      {s.estado === 'agotada' && (
        <div className="mt-3 flex items-start gap-2 rounded-xl bg-red-50 border border-red-100 p-3">
          <AlertTriangle size={16} className="text-red-500 shrink-0 mt-0.5" />
          <div className="min-w-0">
            <p className="text-[13px] text-red-700">
              Avisamos a todas las candidatas disponibles y ninguna confirmó. Avisa a alguien por tu cuenta,
              vuelve a intentarlo con una candidata de abajo, o cancela la clase (avisamos a las alumnas).
            </p>
            <button
              onClick={() => onVolverABuscar(s)} disabled={enProceso}
              className="mt-2 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white border border-red-200 text-red-700 text-[12px] font-bold hover:bg-red-100 disabled:opacity-50 transition"
            >
              <RefreshCw size={13} /> {enProceso ? 'Buscando…' : 'Volver a buscar'}
            </button>
          </div>
        </div>
      )}

      {!hero ? (
        // Sin candidatas disponibles
        <div className="mt-4 rounded-xl bg-red-50 border border-red-100 p-3">
          <div className="flex items-start gap-2">
            <AlertTriangle size={16} className="text-red-500 shrink-0 mt-0.5" />
            <p className="text-[13px] text-red-700">{motivoSinCandidatas(sinDispRelevantes)}</p>
          </div>
          {/* Buscar otra vez va PRIMERO: es gratis y reversible. Cancelar manda
              un email a todas las alumnas y no hay vuelta atrás. */}
          <button
            onClick={() => onVolverABuscar(s)} disabled={enProceso}
            className="mt-3 w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-brand text-brand-foreground text-[12px] font-bold hover:brightness-95 disabled:opacity-50 transition"
          >
            <RefreshCw size={13} /> {enProceso ? 'Buscando…' : 'Volver a buscar'}
          </button>
          <button
            onClick={() => onCancelar(s)} disabled={enProceso}
            className="mt-2 w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-red-500 text-white text-[12px] font-bold hover:bg-red-600 disabled:opacity-50 transition"
          >
            <CalendarOff size={13} /> Cancelar clase y avisar a las alumnas
          </button>
        </div>
      ) : (
        <>
          {/* HERO: la sustituta ideal (o solicitud pendiente de aprobación) */}
          <div className="mt-4 rounded-2xl border border-brand/20 bg-brand/[0.05] p-4 sm:p-5">
            <div className="flex items-center gap-1.5 mb-3.5">
              {esSolicitud ? <CalendarClock size={15} className="text-brand-secondary" /> : <CheckCircle2 size={15} className="text-[#22C55E]" />}
              <span className="text-[12px] font-bold text-foreground">{esSolicitud ? 'Nueva sustitución solicitada' : 'Sustituta ideal encontrada'}</span>
            </div>

            <div className="flex items-center gap-3.5">
              <ProfileAvatar avatarId={insDe(hero.instructor_id)?.avatar ?? null} nombre={hero.nombre} color={insDe(hero.instructor_id)?.color ?? '#6D28D9'} size="lg" />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="text-[18px] font-extrabold text-foreground leading-tight truncate">{hero.nombre}</p>
                  <Estrellas val={valoraciones[hero.instructor_id]} />
                </div>
                <p className="text-[13px] font-semibold text-brand-secondary">Instructora de {esp}</p>
              </div>
            </div>

            {/* Compatibilidad */}
            <div className="mt-4">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-[12px] font-semibold text-foreground">Compatibilidad</span>
                <span className="text-[14px] font-extrabold text-[#16A34A] tabular-nums">{hero.compatibilidad}%</span>
              </div>
              <div className="h-2 rounded-full bg-black/[0.06] overflow-hidden">
                <div className="h-full rounded-full bg-[#22C55E] transition-all duration-500" style={{ width: `${hero.compatibilidad}%` }} />
              </div>
            </div>

            {/* Stats */}
            <div className="mt-4 grid grid-cols-2 rounded-xl border border-border bg-card overflow-hidden">
              <div className="p-3">
                <p className="text-[11px] text-muted-foreground">Disponible</p>
                <p className="text-[13px] font-bold text-foreground mt-0.5">{fmtHora(s.sesiones?.inicio)} h</p>
              </div>
              <div className="p-3 border-l border-border">
                <p className="text-[11px] text-muted-foreground">Clases de {esp}</p>
                <p className="text-[13px] font-bold text-foreground mt-0.5">{hero.veces > 0 ? `${hero.veces} impartidas` : 'Primera vez'}</p>
              </div>
            </div>

            {/* Motivos en lenguaje humano */}
            <p className="mt-3 text-[12px] text-muted-foreground leading-relaxed">{(hero.motivos ?? []).join(' · ')}</p>

            {/* Acciones */}
            {esSolicitud ? (
              // Card "Nueva sustitución solicitada": decisión binaria de la propietaria.
              // Aprobar = avisar a la candidata (dos lados: ella confirma desde el móvil);
              // Rechazar = descartar la sustitución ("lo resuelvo por mi cuenta").
              <div className="mt-4 flex gap-2">
                <button
                  onClick={() => onDescartar(s)} disabled={enProceso}
                  className="flex-1 flex items-center justify-center gap-1.5 py-3 rounded-xl border border-border text-foreground text-[14px] font-semibold hover:bg-muted disabled:opacity-50 transition"
                >
                  <X size={15} /> Rechazar
                </button>
                <button
                  onClick={() => onAvisar(s, hero.instructor_id)} disabled={enProceso}
                  className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl bg-[#16A34A] text-white text-[14px] font-bold hover:brightness-95 disabled:opacity-50 transition active:scale-[0.99]"
                >
                  <Check size={16} /> Aprobar
                </button>
              </div>
            ) : (
              <div className="mt-4 flex gap-2">
                <button
                  onClick={() => onAvisar(s, hero.instructor_id)} disabled={enProceso}
                  className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl bg-brand text-brand-foreground text-[14px] font-bold hover:brightness-95 disabled:opacity-50 transition active:scale-[0.99]"
                >
                  <Mail size={15} /> {contactada ? 'Volver a avisar' : `Avisar a ${hero.nombre.split(' ')[0]}`}
                </button>
                <button
                  onClick={() => onConfirmar(s, hero.instructor_id)} disabled={enProceso}
                  title="Confirmar directamente (sin email)"
                  className="flex items-center justify-center gap-1.5 px-4 py-3 rounded-xl border border-border text-foreground text-[13px] font-semibold hover:bg-muted disabled:opacity-50 transition"
                >
                  <Check size={14} /> Confirmar
                </button>
              </div>
            )}
            {esSolicitud && (
              <p className="mt-2.5 text-[11px] text-center text-muted-foreground">Al aprobar avisamos a {hero.nombre.split(' ')[0]}; cuando acepte, la clase se reasigna sola.</p>
            )}
            {contactada && (
              <p className="mt-2.5 text-[11px] text-center text-muted-foreground">✉️ Avisada — esperando su respuesta</p>
            )}
          </div>

          {/* Otras candidatas */}
          {resto.length > 0 && (
            <div className="mt-3.5">
              <p className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground mb-2">Otras opciones</p>
              <div className="space-y-1.5">
                {resto.map(c => (
                  <div key={c.instructor_id} className="flex items-center gap-3 rounded-xl border border-border p-2.5">
                    <ProfileAvatar avatarId={insDe(c.instructor_id)?.avatar ?? null} nombre={c.nombre} color={insDe(c.instructor_id)?.color ?? '#7C3AED'} size="sm" />
                    <div className="min-w-0 flex-1">
                      <p className="text-[13px] font-bold text-foreground flex items-center gap-1.5 flex-wrap">
                        {c.nombre}
                        <span className="text-[11px] font-bold text-[#16A34A] tabular-nums">{c.compatibilidad}%</span>
                        <Estrellas val={valoraciones[c.instructor_id]} />
                      </p>
                      <p className="text-[11px] text-muted-foreground truncate">{(c.motivos ?? []).join(' · ')}</p>
                    </div>
                    <div className="flex gap-1.5 shrink-0">
                      <button onClick={() => onAvisar(s, c.instructor_id)} disabled={enProceso} title="Avisar por email"
                        className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-brand/10 text-brand-secondary text-[11px] font-bold hover:bg-brand/20 disabled:opacity-50 transition">
                        <Mail size={12} /> Avisar
                      </button>
                      <button onClick={() => onConfirmar(s, c.instructor_id)} disabled={enProceso} title="Confirmar directamente"
                        className="flex items-center justify-center w-8 rounded-lg border border-border text-muted-foreground hover:bg-muted disabled:opacity-50 transition">
                        <Check size={13} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {/* Traza: qué ha hecho el motor por su cuenta */}
      <TrazaContactos contactos={s.sustitucion_contactos ?? []} instructores={instructores} activa={contactada || s.estado === 'agotada'} />

      {/* Pie */}
      <div className="mt-4 flex justify-end gap-4">
        {hero && (
          <button onClick={() => onCancelar(s)} disabled={enProceso} className="text-[12px] font-medium text-muted-foreground hover:text-red-600 disabled:opacity-50 transition-colors">
            Cancelar clase
          </button>
        )}
        {hero && s.estado !== 'contactando' && (
          <button onClick={() => onVolverABuscar(s)} disabled={enProceso} className="text-[12px] font-medium text-muted-foreground hover:text-foreground disabled:opacity-50 transition-colors">
            Volver a buscar
          </button>
        )}
        <button onClick={() => onDescartar(s)} disabled={enProceso} className="text-[12px] font-medium text-muted-foreground hover:text-foreground disabled:opacity-50 transition-colors">
          Lo resuelvo por mi cuenta
        </button>
      </div>
    </div>
  );
}

// Lo que el motor ha hecho por su cuenta: a quién avisó, por qué canal, cuándo y
// qué contestó. Abierta por defecto mientras la sustitución está en marcha (es
// cuando la propietaria necesita ver que algo se está moviendo) y plegada cuando
// ya está resuelta (entonces solo estorba).
function TrazaContactos({
  contactos, instructores, activa,
}: {
  contactos: ContactoFila[];
  instructores: import('@/lib/types').Instructor[];
  activa: boolean;
}) {
  const [abierta, setAbierta] = useState(activa);

  const nombres = useMemo(
    () => Object.fromEntries(instructores.map(i => [i.id, i.nombre])),
    [instructores],
  );
  const eventos = useMemo(() => construirTraza(contactos, nombres), [contactos, nombres]);
  const resumen = resumenTraza(eventos);

  if (eventos.length === 0) return null;

  return (
    <div className="mt-4 rounded-xl border border-border bg-muted/30 overflow-hidden">
      <button
        onClick={() => setAbierta(v => !v)}
        aria-expanded={abierta}
        className="w-full flex items-center gap-2 px-3.5 py-2.5 text-left hover:bg-muted/50 transition"
      >
        <MailCheck size={14} className="text-muted-foreground shrink-0" />
        <span className="text-[12px] font-bold text-foreground">Lo que hemos hecho por ti</span>
        {resumen && <span className="text-[11px] text-muted-foreground truncate">· {resumen}</span>}
        <span className="ml-auto text-[11px] text-muted-foreground shrink-0">{abierta ? 'Ocultar' : 'Ver'}</span>
      </button>

      {abierta && (
        <ol className="px-3.5 pb-3 space-y-1.5">
          {eventos.map((e, i) => (
            <li key={`${e.en}-${i}`} className="flex items-baseline gap-2.5 text-[12px]">
              <span className="tabular-nums text-muted-foreground shrink-0">{fmtMomento(e.en)}</span>
              <span className={
                e.tipo === 'aceptado' ? 'text-[#16A34A] font-semibold'
                : e.tipo === 'rechazado' ? 'text-muted-foreground'
                : e.tipo === 'fallo' ? 'text-red-600'
                : 'text-foreground'
              }>
                {e.texto}
              </span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

// Día + hora en corto ("mar 21, 18:04"). Distinto de fmtHora (solo hora): un
// escalado puede cruzar la medianoche y "18:04 → 09:12" sin día se lee al revés.
function fmtMomento(iso: string): string {
  const d = new Date(iso);
  const dia = d.toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', timeZone: 'Europe/Madrid' });
  const hora = d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Madrid' });
  return `${dia}, ${hora}`;
}

// Pedir la disponibilidad a quienes no la tienen, SIN salir de Sustituciones.
// El problema se detecta aquí, así que aquí se arregla: mandar a la propietaria
// a otra pantalla a buscar un menú ⋮ es la forma más fácil de que no lo haga.
function PedirDisponibilidadDialog({
  abierto, instructores, onClose,
}: {
  abierto: boolean;
  instructores: { id: string; nombre: string }[];
  onClose: () => void;
}) {
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [copiado, setCopiado] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [generando, setGenerando] = useState<string | null>(null);

  async function enlaceDe(id: string): Promise<string | null> {
    if (urls[id]) return urls[id];
    setGenerando(id); setError(null);
    const r = await generarEnlaceDisponibilidad(id, 'disponibilidad');
    setGenerando(null);
    if ('error' in r) { setError(r.error); return null; }
    setUrls(prev => ({ ...prev, [id]: r.url }));
    return r.url;
  }

  async function copiar(id: string) {
    const url = await enlaceDe(id);
    if (!url) return;
    try { await navigator.clipboard.writeText(url); } catch { /* queda visible para copiar a mano */ }
    setCopiado(id);
    setTimeout(() => setCopiado(c => (c === id ? null : c)), 2500);
  }

  return (
    <Dialog open={abierto} onOpenChange={open => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Pedir disponibilidad</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          Cada una abre su enlace en el móvil y marca sus franjas en unos segundos — sin instalar nada
          ni crear cuenta. En cuanto lo hagan, podré proponerlas como sustitutas.
        </p>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <ul className="space-y-2 mt-1">
          {instructores.map(i => (
            <li key={i.id} className="flex items-center justify-between gap-2 rounded-xl border border-border px-3 py-2.5">
              <span className="text-[13px] font-medium text-foreground truncate">{i.nombre}</span>
              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  onClick={() => copiar(i.id)}
                  disabled={generando === i.id}
                  className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-brand text-brand-foreground text-[12px] font-bold hover:brightness-95 disabled:opacity-50 transition"
                >
                  {copiado === i.id ? <><Check size={12} /> Copiado</> : generando === i.id ? 'Generando…' : 'Copiar enlace'}
                </button>
              </div>
            </li>
          ))}
        </ul>
        {urls[instructores[0]?.id ?? ''] && (
          <p className="text-[11px] text-muted-foreground mt-1">
            Los enlaces caducan en 30 días. Puedes generar otros cuando quieras.
          </p>
        )}
      </DialogContent>
    </Dialog>
  );
}

function ResueltaRow({
  s, tipo, nombreInstructor,
}: {
  s: SustitucionPanel;
  tipo: { nombre: string; color: string } | undefined;
  nombreInstructor: (id: string | null) => string;
}) {
  const meta = ESTADO[s.estado] ?? ESTADO.resuelta_fuera;
  return (
    <div className="flex items-center gap-3 bg-card border border-border rounded-xl px-4 py-3">
      {s.estado === 'confirmada' ? <CheckCircle2 size={16} className="text-[#059669] shrink-0" /> : <CalendarX2 size={16} className="text-muted-foreground shrink-0" />}
      <div className="min-w-0 flex-1">
        <p className="text-[13px] text-foreground truncate">
          <strong>{tipo?.nombre ?? 'Clase'}</strong> · {fmtClase(s.sesiones?.inicio)}
          {s.estado === 'confirmada' && s.sustituta_final_id ? <> — cubre <strong className="text-foreground">{nombreInstructor(s.sustituta_final_id)}</strong></> : null}
        </p>
      </div>
      <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full shrink-0 ${meta.cls}`}>{meta.label}</span>
    </div>
  );
}

function NuevaBajaDialog({
  open, onClose, sesiones, instructores, tiposClase, yaConBaja, onCreada,
}: {
  open: boolean;
  onClose: () => void;
  sesiones: import('@/lib/types').Sesion[];
  instructores: import('@/lib/types').Instructor[];
  tiposClase: import('@/lib/types').TipoClase[];
  yaConBaja: Set<string>;
  onCreada: () => Promise<void>;
}) {
  const uid = useId();
  const [sesionId, setSesionId] = useState<string | null>(null);
  const [motivo, setMotivo] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [ahoraMs, setAhoraMs] = useState(0);
  const proximas = useMemo(() => {
    return sesiones
      .filter(s => !s.cancelada && new Date(s.inicio).getTime() > ahoraMs && !yaConBaja.has(s.id))
      .sort((a, b) => a.inicio.localeCompare(b.inicio))
      .slice(0, 40);
  }, [sesiones, yaConBaja, ahoraMs]);

  // Reset al abrir (patrón estándar de diálogo controlado).
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { if (open) { setSesionId(null); setMotivo(''); setError(null); setAhoraMs(Date.now()); } }, [open]);

  async function crear() {
    if (!sesionId) return;
    setGuardando(true); setError(null);
    const r = await crearBaja(sesionId, motivo.trim() || undefined);
    setGuardando(false);
    if ('error' in r) { setError(r.error); return; }
    await onCreada();
    onClose();
  }

  return (
    <Dialog open={open} onOpenChange={o => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Marcar una baja</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">Elige la clase que se queda sin instructora. Te propondremos a quién avisar al instante.</p>
          <div className="max-h-72 overflow-y-auto space-y-1.5 pr-1">
            {proximas.length === 0 ? (
              <p className="text-sm text-muted-foreground py-6 text-center">No hay clases próximas sin baja marcada.</p>
            ) : proximas.map(s => {
              const t = tiposClase.find(x => x.id === s.tipoClaseId);
              const ins = instructores.find(i => i.id === s.instructorId);
              const sel = sesionId === s.id;
              return (
                <button
                  key={s.id} onClick={() => setSesionId(s.id)}
                  className={`w-full flex items-center gap-2.5 text-left px-3 py-2.5 rounded-xl border transition-colors ${sel ? 'border-brand bg-brand/10' : 'border-border hover:bg-muted'}`}
                >
                  <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: t?.color ?? '#94A3B8' }} />
                  <div className="min-w-0 flex-1">
                    <p className="text-[13px] font-bold text-foreground truncate">{t?.nombre ?? 'Clase'} · <span className="font-medium text-muted-foreground">{fmtClase(s.inicio)}</span></p>
                    <p className="text-[11px] text-muted-foreground">{ins?.nombre ?? 'Sin instructora'}</p>
                  </div>
                  {sel && <Check size={16} className="text-brand shrink-0" />}
                </button>
              );
            })}
          </div>
          <div>
            <label htmlFor={`${uid}-1`} className="text-[12px] font-semibold text-foreground block mb-1.5">Motivo (opcional)</label>
            <input id={`${uid}-1`}
              value={motivo} onChange={e => setMotivo(e.target.value)} placeholder="Ej. enferma, imprevisto…"
              className="w-full rounded-xl border border-border bg-card px-3.5 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-brand focus:ring-2 focus:ring-brand/15 transition-all"
            />
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex justify-end gap-2 pt-1">
            <button onClick={onClose} className="px-4 py-2 rounded-xl border border-border text-[13px] font-medium text-foreground hover:bg-muted">Cancelar</button>
            <button onClick={crear} disabled={!sesionId || guardando} className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-brand text-brand-foreground text-[13px] font-bold disabled:opacity-40">
              <Clock size={14} /> {guardando ? 'Buscando…' : 'Buscar sustituta'}
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
