'use client';

import { useEffect, useMemo, useRef, useState, type ReactNode, useId } from 'react';
import { useStudio } from '@/lib/studio-context';
import type { Instructor, Rol } from '@/lib/types';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Plus, Pencil, Trash2, Users, Mail, Phone, Calendar, Check, X, ShieldCheck, KeyRound, History, CalendarClock, CalendarOff, Copy, Star, Search, LayoutGrid, List, MoreVertical, Camera, Loader2 } from 'lucide-react';
import { ProfileAvatar, AvatarPicker } from '@/components/ui/profile-avatar';
import { formatFechaHora, uid as generarId } from '@/lib/utils';
import { subirFotoInstructor, eliminarFotoInstructor, validarFotoPerfil } from '@/lib/portal-storage';
import { generarEnlaceDisponibilidad, equipoStats, listarValoraciones, type EquipoStats, type ValoracionDetalle } from '@/lib/api-client';
import { PageHeader } from '@/components/ui/page-header';

type FiltroEstado = 'activas' | 'inactivas' | 'todas';
type FiltroRol = 'todos' | Rol;
type Orden = 'nombre-az' | 'nombre-za' | 'clases' | 'valoracion';

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
  RECEPCION: 'Recepción',
  INSTRUCTOR: 'Instructora',
};
const ROL_DESC: Record<Rol, string> = {
  PROPIETARIO: 'Acceso total: negocio, marketing, automatizaciones y equipo.',
  RECEPCION: 'Reservas, clientas, cobros y caja — sin acceso a marketing, informes ni ajustes del negocio.',
  INSTRUCTOR: 'Calendario, citas (sin precios), miembros, oferta digital, comunidad y mensajería — sin datos de facturación.',
};

// `tempId` es el id que usará la ficha si es de alta: se genera al abrir el
// modal (no al guardar) para poder subir la foto ANTES de que la instructora
// exista en BD — el storage necesita una clave estable desde el primer upload.
type Form = { tempId: string; nombre: string; email: string; telefono: string; color: string; avatar: string | null; fotoUrl: string | null; activo: boolean; rol: Rol };
const emptyForm = (): Form => ({ tempId: `ins-${generarId()}`, nombre: '', email: '', telefono: '', color: '#F7A6C4', avatar: null, fotoUrl: null, activo: true, rol: 'INSTRUCTOR' });

export default function EquipoPage() {
  const uid = useId();
  const { instructores, sesiones, tiposClase, addInstructor, updateInstructor, deleteInstructor, actividadReciente } = useStudio();

  const [tab, setTab] = useState<'equipo' | 'actividad'>('equipo');
  const [modal, setModal] = useState<'nuevo' | 'editar' | null>(null);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<Form>(emptyForm());
  const [subiendoFoto, setSubiendoFoto] = useState(false);
  const [errorFoto, setErrorFoto] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [confirmDel, setConfirmDel] = useState<Instructor | null>(null);
  const [enlace, setEnlace] = useState<
    { instructor: Instructor; scope: EnlaceScope; url: string | null; loading: boolean; error: string | null; copiado: boolean } | null
  >(null);
  const [stats, setStats] = useState<EquipoStats>({ valoracion: {}, asistencia: {} });
  const [q, setQ] = useState('');
  const [fEstado, setFEstado] = useState<FiltroEstado>('activas');
  const [fRol, setFRol] = useState<FiltroRol>('todos');
  const [orden, setOrden] = useState<Orden>('nombre-az');
  const [vista, setVista] = useState<'grid' | 'lista'>('grid');
  const [menuId, setMenuId] = useState<string | null>(null);
  const [verValor, setVerValor] = useState<Instructor | null>(null);

  useEffect(() => {
    let vivo = true;
    equipoStats().then(r => { if (vivo) setStats(r); });
    return () => { vivo = false; };
  }, []);

  async function abrirEnlace(i: Instructor, scope: EnlaceScope = 'disponibilidad') {
    setEnlace({ instructor: i, scope, url: null, loading: true, error: null, copiado: false });
    const r = await generarEnlaceDisponibilidad(i.id, scope);
    setEnlace(prev => (prev && prev.instructor.id === i.id && prev.scope === scope
      ? { ...prev, loading: false, url: 'url' in r ? r.url : null, error: 'error' in r ? r.error : null }
      : prev));
  }
  async function copiarEnlace(url: string) {
    try { await navigator.clipboard.writeText(url); } catch { /* el input readonly permite copiar a mano */ }
    setEnlace(prev => (prev ? { ...prev, copiado: true } : prev));
  }

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

  const activos = instructores.filter(i => i.activo).length;
  const totalClasesSemana = [...cargaPorInstructor.values()].reduce((a, b) => a + b, 0);

  // Buscador + filtros + orden (todo en cliente; el equipo cabe de sobra en memoria).
  const listaVisible = useMemo(() => {
    const term = q.trim().toLowerCase();
    let out = instructores.filter(i => {
      if (fEstado === 'activas' && !i.activo) return false;
      if (fEstado === 'inactivas' && i.activo) return false;
      if (fRol !== 'todos' && i.rol !== fRol) return false;
      if (term && !(`${i.nombre} ${i.email ?? ''}`.toLowerCase().includes(term))) return false;
      return true;
    });
    const val = (id: string) => stats.valoracion[id]?.media ?? -1;
    out = [...out].sort((a, b) => {
      if (orden === 'nombre-az') return a.nombre.localeCompare(b.nombre, 'es');
      if (orden === 'nombre-za') return b.nombre.localeCompare(a.nombre, 'es');
      if (orden === 'clases') return (cargaPorInstructor.get(b.id) ?? 0) - (cargaPorInstructor.get(a.id) ?? 0);
      return val(b.id) - val(a.id); // valoración desc
    });
    return out;
  }, [instructores, q, fEstado, fRol, orden, stats, cargaPorInstructor]);

  function openNuevo() { setForm(emptyForm()); setEditId(null); setModal('nuevo'); }
  function openEditar(i: Instructor) {
    setForm({ tempId: i.id, nombre: i.nombre, email: i.email ?? '', telefono: i.telefono ?? '', color: i.color, avatar: i.avatar ?? null, fotoUrl: i.fotoUrl ?? null, activo: i.activo, rol: i.rol });
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
      fotoUrl: form.fotoUrl,
      activo: form.activo,
      rol: form.rol,
    };
    if (modal === 'nuevo') addInstructor({ ...fields, authUserId: null }, form.tempId);
    else if (editId) updateInstructor(editId, fields);
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
    // Si ya existe (edición), persiste al momento — igual que el avatar
    // predefinido más abajo. Si es alta nueva, se guarda con el resto al pulsar "Guardar".
    if (editId) updateInstructor(editId, { fotoUrl: result.url });
  }

  async function handleEliminarFoto() {
    setSubiendoFoto(true);
    const result = await eliminarFotoInstructor(form.tempId);
    setSubiendoFoto(false);
    if ('error' in result) { setErrorFoto(result.error); return; }
    setForm(f => ({ ...f, fotoUrl: null }));
    if (editId) updateInstructor(editId, { fotoUrl: null });
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="Equipo"
        description="Instructoras y personal del estudio"
        actions={tab === 'equipo' && (
          <button onClick={openNuevo} className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-brand text-brand-foreground text-sm font-bold hover:brightness-95 transition-colors">
            <Plus size={16} /> Nuevo miembro
          </button>
        )}
      />

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
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {[
          { label: 'Miembros', value: instructores.length, sub: `${activos} activos`, color: 'var(--brand)', bg: 'color-mix(in srgb, var(--brand) 10%, var(--card))', Icon: Users },
          { label: 'Clases 7 días', value: totalClasesSemana, sub: 'programadas', color: 'var(--success)', bg: 'color-mix(in srgb, var(--success) 12%, var(--card))', Icon: Calendar },
          { label: 'Media / persona', value: activos ? Math.round(totalClasesSemana / activos) : 0, sub: 'clases por activo', color: 'var(--warning)', bg: 'color-mix(in srgb, var(--warning) 12%, var(--card))', Icon: Calendar },
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

      {/* Barra: buscador + filtros + orden + vista (como el mockup) */}
      {instructores.length > 0 && (
        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative flex-1 min-w-[200px]">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
            <input
              value={q} onChange={e => setQ(e.target.value)} placeholder="Buscar instructora…"
              className="w-full rounded-xl border border-border bg-card pl-9 pr-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-brand focus:ring-2 focus:ring-brand/15 transition"
            />
          </div>
          <PillSelect label="Estado" value={fEstado} onChange={v => setFEstado(v as FiltroEstado)}
            options={[['activas', 'Activas'], ['inactivas', 'Inactivas'], ['todas', 'Todas']]} />
          <PillSelect label="Rol" value={fRol} onChange={v => setFRol(v as FiltroRol)}
            options={[['todos', 'Todos'], ['PROPIETARIO', 'Propietaria'], ['RECEPCION', 'Recepción'], ['INSTRUCTOR', 'Instructora']]} />
          <div className="ml-auto flex items-center gap-2">
            <PillSelect label="Ordenar" value={orden} onChange={v => setOrden(v as Orden)}
              options={[['nombre-az', 'Nombre A-Z'], ['nombre-za', 'Nombre Z-A'], ['clases', 'Más clases'], ['valoracion', 'Mejor valoración']]} />
            <div className="flex items-center gap-0.5 rounded-xl border border-border bg-card p-0.5">
              <button onClick={() => setVista('grid')} title="Cuadrícula"
                className={`w-8 h-8 flex items-center justify-center rounded-lg transition-colors ${vista === 'grid' ? 'bg-brand text-brand-foreground' : 'text-muted-foreground hover:bg-muted'}`}>
                <LayoutGrid size={16} />
              </button>
              <button onClick={() => setVista('lista')} title="Lista"
                className={`w-8 h-8 flex items-center justify-center rounded-lg transition-colors ${vista === 'lista' ? 'bg-brand text-brand-foreground' : 'text-muted-foreground hover:bg-muted'}`}>
                <List size={16} />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Contenido */}
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
      ) : listaVisible.length === 0 ? (
        <p className="text-sm text-muted-foreground py-16 text-center">Nadie coincide con la búsqueda o los filtros.</p>
      ) : vista === 'grid' ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {listaVisible.map(i => (
            <InstructorCard
              key={i.id} i={i} carga={cargaPorInstructor.get(i.id) ?? 0}
              prox={proximaClase.get(i.id) ?? null} val={stats.valoracion[i.id]} asis={stats.asistencia[i.id]}
              menuAbierto={menuId === i.id} onMenu={() => setMenuId(menuId === i.id ? null : i.id)}
              onEnlace={(scope) => { setMenuId(null); abrirEnlace(i, scope); }} onEdit={() => openEditar(i)} onDelete={() => { setMenuId(null); setConfirmDel(i); }}
              onValoraciones={() => { setMenuId(null); setVerValor(i); }}
            />
          ))}
        </div>
      ) : (
        <div className="bg-card border border-border rounded-2xl divide-y divide-[#F1F1F4] overflow-visible">
          {listaVisible.map(i => (
            <InstructorRow
              key={i.id} i={i} carga={cargaPorInstructor.get(i.id) ?? 0} prox={proximaClase.get(i.id) ?? null}
              val={stats.valoracion[i.id]} asis={stats.asistencia[i.id]}
              menuAbierto={menuId === i.id} onMenu={() => setMenuId(menuId === i.id ? null : i.id)}
              onEnlace={(scope) => { setMenuId(null); abrirEnlace(i, scope); }} onEdit={() => openEditar(i)} onDelete={() => { setMenuId(null); setConfirmDel(i); }}
              onValoraciones={() => { setMenuId(null); setVerValor(i); }}
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
                {(['PROPIETARIO', 'RECEPCION', 'INSTRUCTOR'] as Rol[]).map(r => (
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
            <div className="flex justify-end gap-2 pt-2">
              <button onClick={() => setModal(null)} className="px-4 py-2 rounded-xl border border-border text-[13px] font-medium text-foreground hover:bg-muted">Cancelar</button>
              <button onClick={guardar} disabled={!form.nombre.trim()} className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-brand text-brand-foreground text-[13px] font-bold disabled:opacity-40">
                <Check size={14} /> Guardar
              </button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Enlaces sin login para la instructora (disponibilidad / avisar de baja) */}
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
                <p className="text-sm text-red-600">{enlace.error}</p>
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
                    {enlace.scope === 'reportar_baja'
                      ? 'Que lo guarde en el móvil: le sirve para cualquier clase suya. Caduca en 30 días.'
                      : 'El enlace caduca en 30 días. Puedes generar uno nuevo cuando quieras.'}
                  </p>
                </>
              ) : null}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Valoraciones de una instructora (leer cada ⭐ + comentario) */}
      <ValoracionesDialog instructor={verValor} tiposClase={tiposClase} onClose={() => setVerValor(null)} />

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
            <button onClick={() => setConfirmDel(null)} className="px-4 py-2 rounded-xl border border-border text-[13px] font-medium text-foreground hover:bg-muted">Cancelar</button>
            <button onClick={() => { if (confirmDel) deleteInstructor(confirmDel.id); setConfirmDel(null); }} className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-red-500 text-white text-[13px] font-bold hover:bg-red-600">
              <X size={14} /> Eliminar
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Piezas del rediseño de Equipo ────────────────────────────────────────────

type Val = { media: number; total: number } | undefined;
type Asis = { pct: number; base: number } | undefined;
type AccProps = { menuAbierto: boolean; onMenu: () => void; onEnlace: (scope: EnlaceScope) => void; onEdit: () => void; onDelete: () => void; onValoraciones: () => void };

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

function fmtProx(prox: Date | null): string {
  return prox ? prox.toLocaleDateString('es-ES', { weekday: 'short', hour: '2-digit', minute: '2-digit' }) : '—';
}

function Badges({ i }: { i: Instructor }) {
  return (
    <div className="flex items-center gap-1.5 flex-wrap mt-1">
      <span className={`inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full ${i.activo ? 'bg-success/10 text-success' : 'bg-muted text-muted-foreground'}`}>
        <span className={`w-1.5 h-1.5 rounded-full ${i.activo ? 'bg-success' : 'bg-muted-foreground'}`} />
        {i.activo ? 'Activa' : 'Inactiva'}
      </span>
      <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-muted text-foreground">{ROL_LABEL[i.rol]}</span>
      {i.authUserId ? (
        <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full bg-brand/10 text-brand-secondary">
          <ShieldCheck size={10} />Con acceso
        </span>
      ) : i.email ? (
        <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-warning/10 text-warning">Sin cuenta aún</span>
      ) : null}
    </div>
  );
}

function StatCol({ valor, sub, star, borde, onClick }: { valor: ReactNode; sub: string; star?: boolean; borde?: boolean; onClick?: () => void }) {
  const inner = (
    <>
      <p className={`text-[16px] font-extrabold text-foreground leading-none tabular-nums flex items-center gap-1 ${onClick ? 'group-hover:text-brand-secondary transition-colors' : ''}`}>
        {valor}{star && <Star size={13} fill="#F5B301" stroke="#F5B301" />}
      </p>
      <p className="text-[11px] text-muted-foreground mt-1">{sub}</p>
    </>
  );
  const cls = borde ? 'pl-3 border-l border-[#F1F1F4]' : '';
  if (onClick) {
    return (
      <button type="button" onClick={onClick} title="Ver valoraciones" className={`${cls} text-left group cursor-pointer`}>
        {inner}
      </button>
    );
  }
  return <div className={cls}>{inner}</div>;
}

function Acciones({ menuAbierto, onMenu, onEnlace, onEdit, onDelete, onValoraciones, tieneValoraciones }: AccProps & { tieneValoraciones: boolean }) {
  return (
    <div className="flex items-center gap-1 shrink-0 relative">
      <button onClick={onEdit} title="Editar" className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-muted text-muted-foreground transition-colors">
        <Pencil size={14} />
      </button>
      <button onClick={onMenu} title="Más acciones" className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-muted text-muted-foreground transition-colors">
        <MoreVertical size={15} />
      </button>
      {menuAbierto && (
        <>
          <button className="fixed inset-0 z-20 cursor-default" onClick={onMenu} aria-hidden tabIndex={-1} />
          <div className="absolute right-0 top-9 z-30 w-56 rounded-xl border border-border bg-card shadow-lg py-1">
            {tieneValoraciones && (
              <button onClick={onValoraciones} className="w-full flex items-center gap-2 px-3 py-2 text-[13px] text-foreground hover:bg-muted text-left">
                <Star size={14} className="text-[#F5B301]" fill="#F5B301" /> Ver valoraciones
              </button>
            )}
            <button onClick={() => onEnlace('disponibilidad')} className="w-full flex items-center gap-2 px-3 py-2 text-[13px] text-foreground hover:bg-muted text-left">
              <CalendarClock size={14} className="text-muted-foreground" /> {TEXTOS_ENLACE.disponibilidad.menu}
            </button>
            <button onClick={() => onEnlace('reportar_baja')} className="w-full flex items-center gap-2 px-3 py-2 text-[13px] text-foreground hover:bg-muted text-left">
              <CalendarOff size={14} className="text-muted-foreground" /> {TEXTOS_ENLACE.reportar_baja.menu}
            </button>
            <button onClick={onDelete} className="w-full flex items-center gap-2 px-3 py-2 text-[13px] text-red-600 hover:bg-red-50 text-left">
              <Trash2 size={14} /> Eliminar
            </button>
          </div>
        </>
      )}
    </div>
  );
}

function InstructorCard({ i, carga, prox, val, asis, ...acc }: {
  i: Instructor; carga: number; prox: Date | null; val: Val; asis: Asis;
} & AccProps) {
  return (
    <div className="bg-card border border-border rounded-2xl p-5 flex flex-col gap-4">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-3 min-w-0">
          <ProfileAvatar avatarId={i.avatar} fotoUrl={i.fotoUrl} nombre={i.nombre} color={i.color} size="md" />
          <div className="min-w-0">
            <p className="font-bold text-foreground text-[15px] leading-tight truncate">{i.nombre}</p>
            <Badges i={i} />
          </div>
        </div>
        <Acciones {...acc} tieneValoraciones={!!(val && val.total > 0)} />
      </div>

      <div className="space-y-1.5">
        {i.email && <p className="flex items-center gap-2 text-[13px] text-muted-foreground truncate"><Mail size={13} className="shrink-0" />{i.email}</p>}
        {i.telefono && <p className="flex items-center gap-2 text-[13px] text-muted-foreground"><Phone size={13} className="shrink-0" />{i.telefono}</p>}
        {!i.email && !i.telefono && <p className="text-[12px] text-muted-foreground italic">Sin datos de contacto</p>}
      </div>

      <div className="mt-auto">
        <div className="grid grid-cols-3 pt-3 border-t border-[#F1F1F4]">
          <StatCol valor={<>{carga}<span className="text-[11px] font-medium text-muted-foreground"> clase{carga === 1 ? '' : 's'}</span></>} sub="próx. 7 días" />
          <StatCol valor={asis && asis.base > 0 ? `${asis.pct}%` : '—'} sub="asistencia" borde />
          <StatCol valor={val && val.total > 0 ? val.media.toFixed(1) : '—'} star={!!(val && val.total > 0)} sub="valoración" borde onClick={val && val.total > 0 ? acc.onValoraciones : undefined} />
        </div>
        <div className="flex items-center justify-between pt-3 mt-3 border-t border-[#F1F1F4]">
          <span className="text-[12px] text-muted-foreground">Próxima clase</span>
          <span className="text-[12px] font-semibold text-foreground capitalize">{fmtProx(prox)}</span>
        </div>
      </div>
    </div>
  );
}

function InstructorRow({ i, carga, prox, val, asis, ...acc }: {
  i: Instructor; carga: number; prox: Date | null; val: Val; asis: Asis;
} & AccProps) {
  return (
    <div className="flex items-center gap-3 px-4 py-3">
      <ProfileAvatar avatarId={i.avatar} fotoUrl={i.fotoUrl} nombre={i.nombre} color={i.color} size="sm" />
      <div className="min-w-0 flex-1">
        <p className="font-bold text-foreground text-[14px] leading-tight truncate">{i.nombre}</p>
        <Badges i={i} />
      </div>
      <div className="hidden md:flex items-center gap-6 text-right">
        <div><p className="text-[15px] font-extrabold text-foreground leading-none tabular-nums">{carga}</p><p className="text-[10px] text-muted-foreground mt-0.5">7 días</p></div>
        <div><p className="text-[15px] font-extrabold text-foreground leading-none tabular-nums">{asis && asis.base > 0 ? `${asis.pct}%` : '—'}</p><p className="text-[10px] text-muted-foreground mt-0.5">asistencia</p></div>
        {val && val.total > 0 ? (
          <button type="button" onClick={acc.onValoraciones} title="Ver valoraciones" className="text-right group cursor-pointer">
            <p className="text-[15px] font-extrabold text-foreground leading-none tabular-nums flex items-center gap-1 justify-end group-hover:text-brand-secondary transition-colors">{val.media.toFixed(1)}<Star size={12} fill="#F5B301" stroke="#F5B301" /></p>
            <p className="text-[10px] text-muted-foreground mt-0.5">valoración</p>
          </button>
        ) : (
          <div><p className="text-[15px] font-extrabold text-foreground leading-none tabular-nums">—</p><p className="text-[10px] text-muted-foreground mt-0.5">valoración</p></div>
        )}
        <div className="w-20"><p className="text-[10px] text-muted-foreground">Próxima</p><p className="text-[12px] font-semibold text-foreground capitalize">{fmtProx(prox)}</p></div>
      </div>
      <Acciones {...acc} tieneValoraciones={!!(val && val.total > 0)} />
    </div>
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
