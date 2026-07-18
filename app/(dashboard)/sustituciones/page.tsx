'use client';

import { useEffect, useMemo, useState } from 'react';
import { useStudio } from '@/lib/studio-context';
import {
  listarSustituciones, crearBaja, confirmarSustituta, descartarSustitucion,
  type SustitucionPanel,
} from '@/lib/api-client';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ProfileAvatar } from '@/components/ui/profile-avatar';
import {
  Plus, Check, X, Clock, AlertTriangle, CheckCircle2, CalendarX2, ChevronRight, Sparkles,
} from 'lucide-react';

type EstadoMeta = { label: string; cls: string; activa: boolean };
const ESTADO: Record<string, EstadoMeta> = {
  buscando: { label: 'Buscando', cls: 'bg-[#FEF3C7] text-[#92400E]', activa: true },
  pendiente_aprobacion: { label: 'Esperando tu visto bueno', cls: 'bg-brand/10 text-brand-secondary', activa: true },
  contactando: { label: 'Contactando', cls: 'bg-[#FEF3C7] text-[#92400E]', activa: true },
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

  const nombreInstructor = (id: string | null) => instructores.find(i => i.id === id)?.nombre ?? 'Instructora';
  const tipoDe = (id: string | null | undefined) => tiposClase.find(t => t.id === id);

  async function recargar() {
    setItems(await listarSustituciones());
    setCargando(false);
  }
  useEffect(() => { void recargar(); }, []);

  const activas = items.filter(s => ESTADO[s.estado]?.activa);
  const resueltas = items.filter(s => !ESTADO[s.estado]?.activa);

  async function confirmar(s: SustitucionPanel, instructorId: string) {
    setAccion(s.id);
    const r = await confirmarSustituta(s.id, instructorId);
    if ('error' in r) { alert(r.error); setAccion(null); return; }
    await recargar();
    setAccion(null);
  }
  async function descartar(s: SustitucionPanel) {
    setAccion(s.id);
    await descartarSustitucion(s.id);
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
                  key={s.id} s={s} tipo={tipoDe(s.sesiones?.tipo_clase_id)} nombreInstructor={nombreInstructor}
                  instructores={instructores} enProceso={accion === s.id}
                  onConfirmar={confirmar} onDescartar={descartar}
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
    </div>
  );
}

function SustitucionCard({
  s, tipo, nombreInstructor, instructores, enProceso, onConfirmar, onDescartar,
}: {
  s: SustitucionPanel;
  tipo: { nombre: string; color: string } | undefined;
  nombreInstructor: (id: string | null) => string;
  instructores: import('@/lib/types').Instructor[];
  enProceso: boolean;
  onConfirmar: (s: SustitucionPanel, instructorId: string) => void;
  onDescartar: (s: SustitucionPanel) => void;
}) {
  const meta = ESTADO[s.estado] ?? ESTADO.buscando;
  const ranking = Array.isArray(s.ranking) ? s.ranking : [];
  return (
    <div className="bg-card border border-border rounded-2xl p-5">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2.5 min-w-0">
          <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: tipo?.color ?? '#94A3B8' }} />
          <div className="min-w-0">
            <p className="font-bold text-foreground text-[15px] leading-tight">{tipo?.nombre ?? 'Clase'}</p>
            <p className="text-[13px] text-muted-foreground">{fmtClase(s.sesiones?.inicio)}</p>
          </div>
        </div>
        <span className={`text-[11px] font-bold px-2.5 py-1 rounded-full ${meta.cls}`}>{meta.label}</span>
      </div>

      <p className="text-[13px] text-muted-foreground mt-3">
        Falta <strong className="text-foreground">{nombreInstructor(s.instructor_original_id)}</strong>
        {s.motivo ? <> — <span className="italic">{s.motivo}</span></> : null}
      </p>

      {ranking.length === 0 ? (
        <div className="mt-4 flex items-start gap-2 rounded-xl bg-red-50 border border-red-100 p-3">
          <AlertTriangle size={16} className="text-red-500 shrink-0 mt-0.5" />
          <p className="text-[13px] text-red-700">Ninguna candidata disponible para esta franja. Tendrás que cancelar la clase o resolverlo por tu cuenta.</p>
        </div>
      ) : (
        <div className="mt-4 space-y-2">
          <p className="text-[12px] font-semibold text-foreground">Candidatas — elige a quién confirmar:</p>
          {ranking.map((c, idx) => (
            <div key={c.instructor_id} className="flex items-center gap-3 rounded-xl border border-border p-3">
              <ProfileAvatar avatarId={instructores.find(i => i.id === c.instructor_id)?.avatar ?? null} nombre={c.nombre} color={instructores.find(i => i.id === c.instructor_id)?.color ?? '#7C3AED'} size="sm" />
              <div className="min-w-0 flex-1">
                <p className="text-[14px] font-bold text-foreground flex items-center gap-1.5">
                  {c.nombre}
                  {idx === 0 && <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-brand/10 text-brand-secondary">Mejor opción</span>}
                </p>
                <p className="text-[12px] text-muted-foreground leading-snug">{(c.motivos ?? []).join(' · ')}</p>
              </div>
              <button
                onClick={() => onConfirmar(s, c.instructor_id)} disabled={enProceso}
                className="shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-lg bg-brand text-brand-foreground text-[12px] font-bold hover:brightness-95 disabled:opacity-50 transition"
              >
                <Check size={13} /> Confirmar
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="mt-3 flex justify-end">
        <button onClick={() => onDescartar(s)} disabled={enProceso} className="text-[12px] font-medium text-muted-foreground hover:text-foreground disabled:opacity-50 transition-colors">
          Lo resuelvo por mi cuenta
        </button>
      </div>
    </div>
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
  const [sesionId, setSesionId] = useState<string | null>(null);
  const [motivo, setMotivo] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const proximas = useMemo(() => {
    const ahora = Date.now();
    return sesiones
      .filter(s => !s.cancelada && new Date(s.inicio).getTime() > ahora && !yaConBaja.has(s.id))
      .sort((a, b) => a.inicio.localeCompare(b.inicio))
      .slice(0, 40);
  }, [sesiones, yaConBaja]);

  useEffect(() => { if (open) { setSesionId(null); setMotivo(''); setError(null); } }, [open]);

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
            <label className="text-[12px] font-semibold text-foreground block mb-1.5">Motivo (opcional)</label>
            <input
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
