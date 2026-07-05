'use client';

import { useMemo, useState } from 'react';
import { useStudio } from '@/lib/studio-context';
import type { Instructor } from '@/lib/types';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Plus, Pencil, Trash2, Users, Mail, Phone, Calendar, Check, X, AlertTriangle } from 'lucide-react';

const COLORES = ['#C08497', '#C08497', '#7C3AED', '#EC4899', '#059669', '#0EA5E9', '#D97706', '#DC2626'];

const inputCls = 'w-full rounded-xl border border-[#F0E6E4] bg-white px-3.5 py-2.5 text-sm text-[#2B2429] placeholder:text-[#B0A3A8] focus:outline-none focus:border-[#C08497] focus:ring-2 focus:ring-[#C08497]/15 transition-all';
const labelCls = 'text-[12px] font-semibold text-[#4A3F44] block mb-1.5';

function initials(nombre: string) {
  return nombre.split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase();
}

type Form = { nombre: string; email: string; telefono: string; color: string; activo: boolean };
const emptyForm = (): Form => ({ nombre: '', email: '', telefono: '', color: '#C08497', activo: true });

export default function EquipoPage() {
  const { instructores, sesiones, citas, addInstructor, updateInstructor, deleteInstructor } = useStudio();

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
    setForm({ nombre: i.nombre, email: i.email ?? '', telefono: i.telefono ?? '', color: i.color, activo: i.activo });
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
      activo: form.activo,
    };
    if (modal === 'nuevo') addInstructor(fields);
    else if (editId) updateInstructor(editId, fields);
    setModal(null);
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-[#2B2429] tracking-tight">Equipo</h1>
          <p className="text-sm text-[#8B7D82] mt-0.5">Instructoras y personal del estudio</p>
        </div>
        <button onClick={openNuevo} className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#2B2429] text-white text-sm font-bold hover:bg-[#3A2F35] transition-colors">
          <Plus size={16} /> Nuevo miembro
        </button>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: 'Miembros', value: instructores.length, sub: `${activos} activos`, color: '#C08497', bg: '#F7EDEF', Icon: Users },
          { label: 'Clases 7 días', value: totalClasesSemana, sub: 'programadas', color: '#059669', bg: '#DCFCE7', Icon: Calendar },
          { label: 'Media / persona', value: activos ? Math.round(totalClasesSemana / activos) : 0, sub: 'clases por activo', color: '#D97706', bg: '#FEF3C7', Icon: Calendar },
        ].map(({ label, value, sub, color, bg, Icon }) => (
          <div key={label} className="bg-white border border-[#F0E6E4] rounded-2xl p-4 flex flex-col gap-2.5">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold uppercase tracking-wider text-[#B0A3A8]">{label}</span>
              <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ backgroundColor: bg }}>
                <Icon size={15} color={color} />
              </div>
            </div>
            <div>
              <p className="text-[26px] font-extrabold text-[#2B2429] leading-none tabular-nums">{value}</p>
              <p className="text-[11px] text-[#B0A3A8] mt-1">{sub}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Grid */}
      {instructores.length === 0 ? (
        <div className="flex flex-col items-center justify-center text-center py-20 rounded-2xl border border-dashed border-[#E2E4EB] bg-white">
          <div className="w-14 h-14 rounded-2xl bg-[#F7EDEF] flex items-center justify-center mb-4">
            <Users size={26} className="text-[#C08497]" />
          </div>
          <p className="text-[16px] font-bold text-[#2B2429]">Aún no hay nadie en el equipo</p>
          <p className="text-[13px] text-[#94A3B8] mt-1 mb-5">Añade a tus instructoras para asignarles clases y citas</p>
          <button onClick={openNuevo} className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#2B2429] text-white text-[13px] font-bold">
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
              <div key={i.id} className="bg-white border border-[#F0E6E4] rounded-2xl p-5 flex flex-col gap-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-11 h-11 rounded-2xl flex items-center justify-center text-white text-[15px] font-bold shrink-0" style={{ backgroundColor: i.color }}>
                      {initials(i.nombre)}
                    </div>
                    <div className="min-w-0">
                      <p className="font-bold text-[#2B2429] text-[15px] leading-tight truncate">{i.nombre}</p>
                      <span className={`inline-flex items-center gap-1 text-[11px] font-bold mt-1 px-2 py-0.5 rounded-full ${i.activo ? 'bg-[#DCFCE7] text-[#059669]' : 'bg-[#F5EFEC] text-[#B0A3A8]'}`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${i.activo ? 'bg-[#059669]' : 'bg-[#B0A3A8]'}`} />
                        {i.activo ? 'Activa' : 'Inactiva'}
                      </span>
                    </div>
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <button onClick={() => openEditar(i)} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100 text-[#8B7D82] transition-colors">
                      <Pencil size={14} />
                    </button>
                    <button onClick={() => setConfirmDel(i)} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-red-50 text-[#8B7D82] hover:text-red-500 transition-colors">
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>

                <div className="space-y-1.5">
                  {i.email && (
                    <p className="flex items-center gap-2 text-[13px] text-[#8B7D82] truncate"><Mail size={13} className="text-[#B0A3A8] shrink-0" />{i.email}</p>
                  )}
                  {i.telefono && (
                    <p className="flex items-center gap-2 text-[13px] text-[#8B7D82]"><Phone size={13} className="text-[#B0A3A8] shrink-0" />{i.telefono}</p>
                  )}
                  {!i.email && !i.telefono && (
                    <p className="text-[12px] text-[#C9BCC0] italic">Sin datos de contacto</p>
                  )}
                </div>

                <div className="flex items-center justify-between pt-3 border-t border-[#F1F1F4]">
                  <div>
                    <p className="text-[18px] font-extrabold text-[#2B2429] leading-none tabular-nums">{carga}<span className="text-[12px] font-medium text-[#B0A3A8]"> clases</span></p>
                    <p className="text-[11px] text-[#B0A3A8] mt-1">próximos 7 días{nCitas > 0 ? ` · ${nCitas} citas` : ''}</p>
                  </div>
                  {prox && (
                    <div className="text-right">
                      <p className="text-[11px] text-[#B0A3A8]">Próxima</p>
                      <p className="text-[12px] font-semibold text-[#4A3F44] capitalize">
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

      {/* Roles note */}
      <div className="flex items-start gap-2 bg-[#F8F9FB] border border-[#F0E6E4] rounded-xl p-3.5 text-[12px] text-[#8B7D82]">
        <AlertTriangle size={14} className="text-[#B0A3A8] shrink-0 mt-0.5" />
        <p>Los roles y permisos por persona (propietaria / recepción / instructora) se activarán junto con el inicio de sesión de usuarios. De momento, todo el equipo comparte acceso.</p>
      </div>

      {/* Create/edit modal */}
      <Dialog open={modal !== null} onOpenChange={open => !open && setModal(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{modal === 'nuevo' ? 'Nuevo miembro del equipo' : 'Editar miembro'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className={labelCls}>Nombre</label>
              <input className={inputCls} value={form.nombre} placeholder="Ej. María Soler" onChange={e => setForm(f => ({ ...f, nombre: e.target.value }))} autoFocus />
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
              <label className={labelCls}>Color</label>
              <div className="flex gap-2 flex-wrap">
                {COLORES.map(c => (
                  <button key={c} onClick={() => setForm(f => ({ ...f, color: c }))}
                    className="w-8 h-8 rounded-full flex items-center justify-center transition-transform hover:scale-110"
                    style={{ backgroundColor: c, outline: form.color === c ? '2px solid #2B2429' : 'none', outlineOffset: 2 }}>
                    {form.color === c && <Check size={14} className="text-white" />}
                  </button>
                ))}
              </div>
            </div>
            <label className="flex items-center gap-3 cursor-pointer pt-1">
              <input type="checkbox" checked={form.activo} onChange={e => setForm(f => ({ ...f, activo: e.target.checked }))} className="w-4 h-4 rounded accent-[#C08497]" />
              <span className="text-sm font-medium text-[#2B2429]">Miembro activo (puede recibir clases y citas)</span>
            </label>
            <div className="flex justify-end gap-2 pt-2">
              <button onClick={() => setModal(null)} className="px-4 py-2 rounded-xl border border-[#F0E6E4] text-[13px] font-medium text-[#4A3F44] hover:bg-gray-50">Cancelar</button>
              <button onClick={guardar} disabled={!form.nombre.trim()} className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#2B2429] text-white text-[13px] font-bold disabled:opacity-40">
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
          <p className="text-sm text-[#8B7D82]">
            ¿Seguro que quieres eliminar a <strong className="text-[#2B2429]">{confirmDel?.nombre}</strong> del equipo? Las clases y citas ya asignadas no se borran, pero quedarán sin instructor visible.
          </p>
          <div className="flex justify-end gap-2 pt-4">
            <button onClick={() => setConfirmDel(null)} className="px-4 py-2 rounded-xl border border-[#F0E6E4] text-[13px] font-medium text-[#4A3F44] hover:bg-gray-50">Cancelar</button>
            <button onClick={() => { if (confirmDel) deleteInstructor(confirmDel.id); setConfirmDel(null); }} className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-red-500 text-white text-[13px] font-bold hover:bg-red-600">
              <X size={14} /> Eliminar
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
