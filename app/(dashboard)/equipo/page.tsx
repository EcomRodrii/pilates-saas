'use client';

import { useMemo, useState } from 'react';
import { useStudio } from '@/lib/studio-context';
import type { Instructor, Rol } from '@/lib/types';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Plus, Pencil, Trash2, Users, Mail, Phone, Calendar, Check, X, ShieldCheck, KeyRound, History } from 'lucide-react';
import { ProfileAvatar, AvatarPicker } from '@/components/ui/profile-avatar';

const COLORES = ['#F7A6C4', '#14B8A6', '#7C3AED', '#EC4899', '#059669', '#0EA5E9', '#D97706', '#DC2626'];

const inputCls = 'w-full rounded-xl border border-border bg-card px-3.5 py-2.5 text-sm text-foreground placeholder:text-[#A8A89F] focus:outline-none focus:border-brand focus:ring-2 focus:ring-brand/15 transition-all';
const labelCls = 'text-[12px] font-semibold text-[#3A3A34] block mb-1.5';

const ROL_LABEL: Record<Rol, string> = {
  PROPIETARIO: 'Propietaria',
  RECEPCION: 'Recepción',
  INSTRUCTOR: 'Instructora',
};
const ROL_DESC: Record<Rol, string> = {
  PROPIETARIO: 'Acceso total: negocio, marketing, automatizaciones y equipo.',
  RECEPCION: 'Reservas, socias, cobros y POS — sin acceso a marketing, informes ni ajustes del negocio.',
  INSTRUCTOR: 'Calendario, citas (sin precios), miembros, oferta digital, comunidad y mensajería — sin datos de facturación.',
};

type Form = { nombre: string; email: string; telefono: string; color: string; avatar: string | null; activo: boolean; rol: Rol };
const emptyForm = (): Form => ({ nombre: '', email: '', telefono: '', color: '#F7A6C4', avatar: null, activo: true, rol: 'INSTRUCTOR' });

export default function EquipoPage() {
  const { instructores, sesiones, citas, addInstructor, updateInstructor, deleteInstructor, actividadReciente } = useStudio();

  const [tab, setTab] = useState<'equipo' | 'actividad'>('equipo');
  const [modal, setModal] = useState<'nuevo' | 'editar' | null>(null);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<Form>(emptyForm());
  const [confirmDel, setConfirmDel] = useState<Instructor | null>(null);

  // Carga semanal: sesiones futuras de los próximos 7 días por instructor
  const ahora = new Date();
  const en7dias = new Date(ahora.getTime() + 7 * 86400000);
  const cargaPorInstructor = useMemo(() => {
    const map = new Map<string, number>();
    for (const s of sesiones) {
      if (s.cancelada) continue;
      const d = new Date(s.inicio);
      if (d >= ahora && d <= en7dias) map.set(s.instructorId, (map.get(s.instructorId) ?? 0) + 1);
    }
    return map;
  }, [sesiones]);

  const proximaClase = useMemo(() => {
    const map = new Map<string, Date>();
    for (const s of sesiones) {
      if (s.cancelada) continue;
      const d = new Date(s.inicio);
      if (d < ahora) continue;
      const actual = map.get(s.instructorId);
      if (!actual || d < actual) map.set(s.instructorId, d);
    }
    return map;
  }, [sesiones]);

  const citasPorInstructor = useMemo(() => {
    const map = new Map<string, number>();
    for (const c of citas) {
      if (c.estado === 'CANCELADA') continue;
      const d = new Date(c.inicio);
      if (d >= ahora && d <= en7dias) map.set(c.instructorId, (map.get(c.instructorId) ?? 0) + 1);
    }
    return map;
  }, [citas]);

  const activos = instructores.filter(i => i.activo).length;
  const totalClasesSemana = [...cargaPorInstructor.values()].reduce((a, b) => a + b, 0);

  function openNuevo() { setForm(emptyForm()); setEditId(null); setModal('nuevo'); }
  function openEditar(i: Instructor) {
    setForm({ nombre: i.nombre, email: i.email ?? '', telefono: i.telefono ?? '', color: i.color, avatar: i.avatar ?? null, activo: i.activo, rol: i.rol });
    setEditId(i.id);
    setModal('editar');
  }
  function guardar() {
    if (!form.nombre.trim()) return;
    const fields = {
      nombre: form.nombre.trim(),
      email: form.email.trim() || null,
      telefono: form.telefono.trim() || null,
      color: form.color,
      avatar: form.avatar,
      activo: form.activo,
      rol: form.rol,
    };
    if (modal === 'nuevo') addInstructor({ ...fields, authUserId: null });
    else if (editId) updateInstructor(editId, fields);
    setModal(null);
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-foreground tracking-tight">Equipo</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Instructoras y personal del estudio</p>
        </div>
        {tab === 'equipo' && (
          <button onClick={openNuevo} className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-brand text-brand-foreground text-sm font-bold hover:brightness-95 transition-colors">
            <Plus size={16} /> Nuevo miembro
          </button>
        )}
      </div>

      {/* Tabs */}
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
      {/* KPIs */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: 'Miembros', value: instructores.length, sub: `${activos} activos`, color: 'var(--brand)', bg: 'color-mix(in srgb, var(--brand) 10%, white)', Icon: Users },
          { label: 'Clases 7 días', value: totalClasesSemana, sub: 'programadas', color: '#059669', bg: '#DCFCE7', Icon: Calendar },
          { label: 'Media / persona', value: activos ? Math.round(totalClasesSemana / activos) : 0, sub: 'clases por activo', color: '#D97706', bg: '#FEF3C7', Icon: Calendar },
        ].map(({ label, value, sub, color, bg, Icon }) => (
          <div key={label} className="bg-card border border-border rounded-2xl p-4 flex flex-col gap-2.5">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold uppercase tracking-wider text-[#A8A89F]">{label}</span>
              <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ backgroundColor: bg }}>
                <Icon size={15} color={color} />
              </div>
            </div>
            <div>
              <p className="text-[26px] font-extrabold text-foreground leading-none tabular-nums">{value}</p>
              <p className="text-[11px] text-[#A8A89F] mt-1">{sub}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Grid */}
      {instructores.length === 0 ? (
        <div className="flex flex-col items-center justify-center text-center py-20 rounded-2xl border border-dashed border-[#E2E4EB] bg-card">
          <div className="w-14 h-14 rounded-2xl bg-brand/10 flex items-center justify-center mb-4">
            <Users size={26} className="text-brand" />
          </div>
          <p className="text-[16px] font-bold text-foreground">Aún no hay nadie en el equipo</p>
          <p className="text-[13px] text-[#94A3B8] mt-1 mb-5">Añade a tus instructoras para asignarles clases y citas</p>
          <button onClick={openNuevo} className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-brand text-brand-foreground text-[13px] font-bold">
            <Plus size={15} /> Nuevo miembro
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {instructores.map(i => {
            const carga = cargaPorInstructor.get(i.id) ?? 0;
            const nCitas = citasPorInstructor.get(i.id) ?? 0;
            const prox = proximaClase.get(i.id) ?? null;
            return (
              <div key={i.id} className="bg-card border border-border rounded-2xl p-5 flex flex-col gap-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-3 min-w-0">
                    <ProfileAvatar avatarId={i.avatar} nombre={i.nombre} color={i.color} size="md" />
                    <div className="min-w-0">
                      <p className="font-bold text-foreground text-[15px] leading-tight truncate">{i.nombre}</p>
                      <div className="flex items-center gap-1.5 flex-wrap mt-1">
                        <span className={`inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full ${i.activo ? 'bg-[#DCFCE7] text-[#059669]' : 'bg-muted text-[#A8A89F]'}`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${i.activo ? 'bg-[#059669]' : 'bg-[#A8A89F]'}`} />
                          {i.activo ? 'Activa' : 'Inactiva'}
                        </span>
                        <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-muted text-[#3A3A34]">{ROL_LABEL[i.rol]}</span>
                        {i.authUserId ? (
                          <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full bg-brand/10 text-brand-secondary">
                            <ShieldCheck size={10} />Con acceso
                          </span>
                        ) : i.email ? (
                          <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-[#FEF3C7] text-[#92400E]">Sin cuenta aún</span>
                        ) : null}
                      </div>
                    </div>
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <button onClick={() => openEditar(i)} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-muted text-muted-foreground transition-colors">
                      <Pencil size={14} />
                    </button>
                    <button onClick={() => setConfirmDel(i)} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-red-50 text-muted-foreground hover:text-red-500 transition-colors">
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>

                <div className="space-y-1.5">
                  {i.email && (
                    <p className="flex items-center gap-2 text-[13px] text-muted-foreground truncate"><Mail size={13} className="text-[#A8A89F] shrink-0" />{i.email}</p>
                  )}
                  {i.telefono && (
                    <p className="flex items-center gap-2 text-[13px] text-muted-foreground"><Phone size={13} className="text-[#A8A89F] shrink-0" />{i.telefono}</p>
                  )}
                  {!i.email && !i.telefono && (
                    <p className="text-[12px] text-[#C6C6BE] italic">Sin datos de contacto</p>
                  )}
                </div>

                <div className="flex items-center justify-between pt-3 border-t border-[#F1F1F4]">
                  <div>
                    <p className="text-[18px] font-extrabold text-foreground leading-none tabular-nums">{carga}<span className="text-[12px] font-medium text-[#A8A89F]"> clases</span></p>
                    <p className="text-[11px] text-[#A8A89F] mt-1">próximos 7 días{nCitas > 0 ? ` · ${nCitas} citas` : ''}</p>
                  </div>
                  {prox && (
                    <div className="text-right">
                      <p className="text-[11px] text-[#A8A89F]">Próxima</p>
                      <p className="text-[12px] font-semibold text-[#3A3A34] capitalize">
                        {prox.toLocaleDateString('es-ES', { weekday: 'short', hour: '2-digit', minute: '2-digit' })}
                      </p>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
      </>
      )}

      {/* Create/edit modal */}
      <Dialog open={modal !== null} onOpenChange={open => !open && setModal(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{modal === 'nuevo' ? 'Nuevo miembro del equipo' : 'Editar miembro'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <ProfileAvatar avatarId={form.avatar} nombre={form.nombre || '?'} color={form.color} size="lg" />
              <div className="min-w-0">
                <label className={labelCls + ' mb-1'}>Nombre</label>
                <input className={inputCls} value={form.nombre} placeholder="Ej. María Soler" onChange={e => setForm(f => ({ ...f, nombre: e.target.value }))} autoFocus />
              </div>
            </div>
            <div>
              <label className={labelCls}>Avatar</label>
              <AvatarPicker value={form.avatar} onChange={id => setForm(f => ({ ...f, avatar: id }))} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelCls}>Email</label>
                <input className={inputCls} value={form.email} placeholder="maria@tentare.es" onChange={e => setForm(f => ({ ...f, email: e.target.value }))} />
              </div>
              <div>
                <label className={labelCls}>Teléfono</label>
                <input className={inputCls} value={form.telefono} placeholder="+34 600 000 000" onChange={e => setForm(f => ({ ...f, telefono: e.target.value }))} />
              </div>
            </div>
            <div>
              <label className={labelCls}>Rol y acceso al panel</label>
              <div className="space-y-1.5">
                {(['PROPIETARIO', 'RECEPCION', 'INSTRUCTOR'] as Rol[]).map(r => (
                  <button
                    key={r}
                    type="button"
                    onClick={() => setForm(f => ({ ...f, rol: r }))}
                    className={`w-full flex items-start gap-2.5 text-left px-3.5 py-2.5 rounded-xl border transition-colors ${form.rol === r ? 'border-brand bg-[#F8FBEE]' : 'border-border hover:bg-muted'}`}
                  >
                    <ShieldCheck size={15} className={form.rol === r ? 'text-brand-secondary mt-0.5 shrink-0' : 'text-[#A8A89F] mt-0.5 shrink-0'} />
                    <div className="min-w-0">
                      <p className="text-[13px] font-bold text-foreground">{ROL_LABEL[r]}</p>
                      <p className="text-[11px] text-muted-foreground mt-0.5">{ROL_DESC[r]}</p>
                    </div>
                  </button>
                ))}
              </div>
              {form.email.trim() && (
                <p className="text-[11px] text-[#A8A89F] mt-2 flex items-start gap-1.5">
                  <KeyRound size={12} className="shrink-0 mt-0.5" />
                  Para acceder al panel, esta persona debe entrar en /login y crear una cuenta con el email <strong className="text-[#3A3A34]">{form.email.trim()}</strong> — quedará vinculada automáticamente a este rol.
                </p>
              )}
            </div>
            <div>
              <label className={labelCls}>Color</label>
              <div className="flex gap-2 flex-wrap">
                {COLORES.map(c => (
                  <button key={c} onClick={() => setForm(f => ({ ...f, color: c }))}
                    className="w-8 h-8 rounded-full flex items-center justify-center transition-transform hover:scale-110"
                    style={{ backgroundColor: c, outline: form.color === c ? '2px solid #1A1A1A' : 'none', outlineOffset: 2 }}>
                    {form.color === c && <Check size={14} className="text-white" />}
                  </button>
                ))}
              </div>
            </div>
            <label className="flex items-center gap-3 cursor-pointer pt-1">
              <input type="checkbox" checked={form.activo} onChange={e => setForm(f => ({ ...f, activo: e.target.checked }))} className="w-4 h-4 rounded accent-brand" />
              <span className="text-sm font-medium text-foreground">Miembro activo (puede recibir clases y citas)</span>
            </label>
            <div className="flex justify-end gap-2 pt-2">
              <button onClick={() => setModal(null)} className="px-4 py-2 rounded-xl border border-border text-[13px] font-medium text-[#3A3A34] hover:bg-muted">Cancelar</button>
              <button onClick={guardar} disabled={!form.nombre.trim()} className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-brand text-brand-foreground text-[13px] font-bold disabled:opacity-40">
                <Check size={14} /> Guardar
              </button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete confirm */}
      <Dialog open={confirmDel !== null} onOpenChange={open => !open && setConfirmDel(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Eliminar miembro</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            ¿Seguro que quieres eliminar a <strong className="text-foreground">{confirmDel?.nombre}</strong> del equipo? Las clases y citas ya asignadas no se borran, pero quedarán sin instructor visible.
          </p>
          <div className="flex justify-end gap-2 pt-4">
            <button onClick={() => setConfirmDel(null)} className="px-4 py-2 rounded-xl border border-border text-[13px] font-medium text-[#3A3A34] hover:bg-muted">Cancelar</button>
            <button onClick={() => { if (confirmDel) deleteInstructor(confirmDel.id); setConfirmDel(null); }} className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-red-500 text-white text-[13px] font-bold hover:bg-red-600">
              <X size={14} /> Eliminar
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Tab: Actividad (auditoría — quién hizo qué) ───────────────────────────────

const TIPO_AUDITORIA = new Set([
  'SOCIA_EDITADA', 'SOCIA_ELIMINADA', 'PLAN_CREADO', 'PLAN_EDITADO', 'PLAN_ELIMINADO',
  'PLAN_ASIGNADO', 'COBRO_MANUAL', 'EQUIPO_ALTA', 'EQUIPO_EDITADO', 'EQUIPO_BAJA',
  'AUTOMATIZACION_CAMBIO', 'NUEVA_SOCIA',
]);

function formatFechaHora(iso: string) {
  return new Date(iso).toLocaleString('es-ES', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

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
            <div key={a.id} className="flex items-start justify-between gap-3 py-2.5 border-b border-[#F1F1EC] last:border-0">
              <p className="text-sm text-[#3A3A34]">{a.texto}</p>
              <span className="text-xs text-[#A8A89F] whitespace-nowrap shrink-0">{formatFechaHora(a.creadoEn)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
