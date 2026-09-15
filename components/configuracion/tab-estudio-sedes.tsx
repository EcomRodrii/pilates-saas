'use client';

import { useEffect, useId, useState } from 'react';
import { Building2, Check, Loader2, Layers, Pencil, Trash2, X } from 'lucide-react';
import { cn, uid } from '@/lib/utils';
import { useStudio } from '@/lib/studio-context';
import { authHeader } from '@/lib/api-client';
import {
  dbListCadenaTiposClase, dbInsertCadenaTipoClase, dbUpdateCadenaTipoClase, dbDeleteCadenaTipoClase,
  type SedeSeleccionable,
} from '@/lib/supabase-data';
import type { CadenaTipoClase } from '@/lib/types';
import {
  inputCls, labelCls, btnPrimary, btnSecondary, cardCls, ColorInput, ColorSwatch, NivelBadge,
} from '@/components/configuracion/estilos';
import { TarjetaAjuste } from '@/components/configuracion/shell/tarjeta-ajuste';

// Multi-sede (plan CADENA): ver quiénes son, cambiarse entre ellas y añadir
// una nueva. `sedes`/`cambiarmeASede` vienen de la sección «Mi estudio»
// (secciones/seccion-estudio.tsx) porque también los necesita para decidir si
// esta tarjeta existe.
export function TabEstudioSedes({
  showToast, sedes, refrescarSedes, cambiandoASede, cambiarmeASede, puedeAnadirSedes,
}: {
  showToast: (m: string) => void;
  sedes: SedeSeleccionable[];
  refrescarSedes: () => void;
  cambiandoASede: string | null;
  cambiarmeASede: (id: string) => void;
  puedeAnadirSedes: boolean;
}) {
  const { studio } = useStudio();
  const idSede = useId();
  const [nuevaSede, setNuevaSede] = useState({ nombre: '', ciudad: '', telefono: '' });
  const [creandoSede, setCreandoSede] = useState(false);
  const [aplicandoCatalogo, setAplicandoCatalogo] = useState<string | null>(null);

  async function aplicarCatalogo(sedeId: string, nombreSede: string) {
    setAplicandoCatalogo(sedeId);
    try {
      const res = await fetch('/api/cadena/tipos-clase/aplicar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(await authHeader()) },
        body: JSON.stringify({ studioId: sedeId }),
      });
      const data = await res.json();
      if (!res.ok) { showToast(`Error: ${data.error ?? 'no se pudo aplicar el catálogo'}`); return; }
      showToast(data.aplicados > 0
        ? `${data.aplicados} tipo(s) de clase añadidos a "${nombreSede}"`
        : `"${nombreSede}" ya tenía todo el catálogo de la cadena`);
    } catch {
      showToast('No se pudo conectar con el servidor.');
    } finally {
      setAplicandoCatalogo(null);
    }
  }

  async function anadirSede() {
    if (!nuevaSede.nombre.trim()) { showToast('Ponle un nombre a la sede'); return; }
    setCreandoSede(true);
    try {
      const res = await fetch('/api/cadena/sedes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(await authHeader()) },
        body: JSON.stringify(nuevaSede),
      });
      const data = await res.json();
      if (!res.ok) { showToast(`Error: ${data.error ?? 'no se pudo crear la sede'}`); return; }
      showToast(`Sede "${nuevaSede.nombre}" creada — ya aparece en "Tus sedes"`);
      setNuevaSede({ nombre: '', ciudad: '', telefono: '' });
      refrescarSedes();
    } catch {
      showToast('No se pudo conectar con el servidor. La sede no se ha creado.');
    } finally {
      setCreandoSede(false);
    }
  }

  return (
    <>
    <TarjetaAjuste id="sedes" marco={false}>
    <div className="space-y-5">
      {/* Con una sola sede no hay nada que listar (mismo criterio que el
          selector del menú de perfil). */}
      {sedes.length > 1 && (
        <div className={cn(cardCls, 'p-6')}>
          <h4 className="text-[14px] font-semibold text-foreground mb-1 flex items-center gap-2">
            <Building2 size={15} className="text-muted-foreground" aria-hidden /> Tus sedes
          </h4>
          <p className="text-[12px] text-muted-foreground mb-4">
            {sedes.length} sedes en tu cadena. Cámbiate a cualquiera sin salir de aquí.
          </p>
          <div className="space-y-2">
            {sedes.map(s => {
              const esActual = s.id === studio?.id;
              return (
                <div key={s.id} className="flex items-center justify-between gap-3 px-4 py-3 rounded-xl border border-border">
                  <div className="min-w-0">
                    <p className="text-[13px] font-semibold text-foreground truncate">{s.nombre}</p>
                    {s.ciudad && <p className="text-[11px] text-muted-foreground truncate">{s.ciudad}</p>}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {puedeAnadirSedes && (
                      <button
                        onClick={() => aplicarCatalogo(s.id, s.nombre)}
                        disabled={aplicandoCatalogo !== null}
                        title="Añade a esta sede los tipos de clase de la plantilla de cadena que todavía no tenga"
                        className={cn(btnSecondary, 'disabled:opacity-50 text-[11px] px-2.5 py-1.5')}
                      >
                        {aplicandoCatalogo === s.id ? <Loader2 size={12} className="animate-spin" /> : <Layers size={12} />}
                        Aplicar catálogo
                      </button>
                    )}
                    {esActual ? (
                      <span className="flex items-center gap-1.5 text-[12px] font-medium text-success">
                        <Check size={14} /> Estás aquí
                      </span>
                    ) : (
                      <button
                        onClick={() => cambiarmeASede(s.id)}
                        disabled={cambiandoASede !== null}
                        className={cn(btnSecondary, 'disabled:opacity-50')}
                      >
                        {cambiandoASede === s.id ? <Loader2 size={14} className="animate-spin" /> : null}
                        {cambiandoASede === s.id ? 'Cambiando…' : 'Cambiarme'}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {puedeAnadirSedes && (
        <div className={cn(cardCls, 'p-6')}>
          <h4 className="text-[14px] font-semibold text-foreground mb-1 flex items-center gap-2">
            <Building2 size={15} className="text-muted-foreground" aria-hidden /> Añadir sede
          </h4>
          <p className="text-[12px] text-muted-foreground mb-4">
            Tu plan Cadena cubre todas tus sedes con una sola suscripción. La sede nueva queda operativa
            al momento — aparecerá en &ldquo;Tus sedes&rdquo; arriba, con un botón para cambiarte a ella.
          </p>
          <div className="grid grid-cols-1 @md/config:grid-cols-3 gap-4">
            <div>
              <label htmlFor={`${idSede}-nombre`} className={labelCls}>Nombre</label>
              <input id={`${idSede}-nombre`} className={inputCls} value={nuevaSede.nombre} onChange={e => setNuevaSede(s => ({ ...s, nombre: e.target.value }))} />
            </div>
            <div>
              <label htmlFor={`${idSede}-ciudad`} className={labelCls}>Ciudad</label>
              <input id={`${idSede}-ciudad`} className={inputCls} value={nuevaSede.ciudad} onChange={e => setNuevaSede(s => ({ ...s, ciudad: e.target.value }))} />
            </div>
            <div>
              <label htmlFor={`${idSede}-telefono`} className={labelCls}>Teléfono</label>
              <input id={`${idSede}-telefono`} className={inputCls} value={nuevaSede.telefono} onChange={e => setNuevaSede(s => ({ ...s, telefono: e.target.value }))} />
            </div>
          </div>
          <button onClick={anadirSede} disabled={creandoSede} className={cn(btnPrimary, 'mt-4', creandoSede && 'opacity-50')}>
            {creandoSede ? 'Creando…' : 'Añadir sede'}
          </button>
        </div>
      )}

    </div>
    </TarjetaAjuste>

    {/* Su sitio es «Mis clases y citas», que tiene una fila que trae hasta
        aquí mientras no salga de este componente. */}
    {puedeAnadirSedes && studio?.cadenaId && <CatalogoCadena cadenaId={studio.cadenaId} showToast={showToast} />}
    </>
  );
}

const NIVELES: CadenaTipoClase['nivel'][] = ['TODOS', 'PRINCIPIANTE', 'MEDIO', 'AVANZADO'];
const formVacio = { nombre: '', color: '#4F46E5', duracionMinutos: '60', nivel: 'TODOS' as CadenaTipoClase['nivel'] };

// Plantilla de catálogo compartida por toda la cadena — primera pieza de
// "configuración centralizada" (ver .claude/tentare-os.md). Se COPIA a cada
// sede (al crearla, o con el botón "Aplicar catálogo" de arriba), nunca es
// un vínculo vivo: editar o borrar algo aquí no toca los tipos de clase que
// ya tenga una sede.
function CatalogoCadena({ cadenaId, showToast }: { cadenaId: string; showToast: (m: string) => void }) {
  const [items, setItems] = useState<CadenaTipoClase[]>([]);
  const idCat = useId();
  const [cargando, setCargando] = useState(true);
  const [form, setForm] = useState(formVacio);
  const [editId, setEditId] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    let vivo = true;
    dbListCadenaTiposClase(cadenaId).then(r => { if (vivo) { setItems(r); setCargando(false); } });
    return () => { vivo = false; };
  }, [cadenaId]);

  function abrirEditar(t: CadenaTipoClase) {
    setEditId(t.id);
    setForm({ nombre: t.nombre, color: t.color, duracionMinutos: String(t.duracionMinutos), nivel: t.nivel });
  }
  function cancelar() {
    setEditId(null);
    setForm(formVacio);
  }

  async function guardar() {
    if (!form.nombre.trim()) { showToast('Ponle un nombre'); return; }
    setGuardando(true);
    try {
      const cambios = {
        nombre: form.nombre.trim(), color: form.color,
        duracionMinutos: Number(form.duracionMinutos) || 60,
        nivel: form.nivel, descripcion: null, fotoUrl: null,
      };
      if (editId) {
        const res = await dbUpdateCadenaTipoClase(editId, cambios);
        if (!res.ok) { showToast(res.error); return; }
        setItems(prev => prev.map(t => t.id === editId ? { ...t, ...cambios } : t));
      } else {
        const nuevo: CadenaTipoClase = { id: `ctc-${uid()}`, cadenaId, creadoEn: new Date().toISOString(), actualizadoEn: new Date().toISOString(), ...cambios };
        const res = await dbInsertCadenaTipoClase(nuevo);
        if (!res.ok) { showToast(res.error); return; }
        setItems(prev => [...prev, nuevo].sort((a, b) => a.nombre.localeCompare(b.nombre)));
      }
      cancelar();
    } finally {
      setGuardando(false);
    }
  }

  async function borrar(id: string) {
    const res = await dbDeleteCadenaTipoClase(id);
    if (!res.ok) { showToast(res.error); return; }
    setItems(prev => prev.filter(t => t.id !== id));
    if (editId === id) cancelar();
  }

  return (
    <TarjetaAjuste id="catalogo-de-la-cadena">
      <p className="text-[12px] text-muted-foreground mb-4">
        Editar aquí no cambia nada en las sedes que ya tienen esos tipos de clase.
      </p>

      {cargando ? (
        <p className="text-[12px] text-muted-foreground">Cargando…</p>
      ) : items.length === 0 ? (
        <p className="text-[12px] text-muted-foreground mb-4">Todavía no hay ningún tipo de clase en la plantilla.</p>
      ) : (
        <div className="space-y-1.5 mb-4">
          {items.map(t => (
            <div key={t.id} className="flex items-center gap-3 px-3 py-2 rounded-xl border border-border">
              <ColorSwatch color={t.color} size="sm" />
              <div className="flex-1 min-w-0">
                <p className="text-[13px] font-medium text-foreground truncate">{t.nombre}</p>
                <p className="text-[11px] text-muted-foreground">{t.duracionMinutos} min</p>
              </div>
              <NivelBadge nivel={t.nivel} />
              <button onClick={() => abrirEditar(t)} aria-label={`Editar ${t.nombre}`} className="p-1.5 rounded-lg text-muted-foreground hover:bg-background hover:text-foreground transition-colors">
                <Pencil size={14} />
              </button>
              <button onClick={() => borrar(t.id)} aria-label={`Quitar ${t.nombre} de la plantilla`} className="p-1.5 rounded-lg text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors">
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="grid grid-cols-1 @md/config:grid-cols-4 gap-3 items-end">
        <div className="@md/config:col-span-2">
          <label htmlFor={`${idCat}-nombre`} className={labelCls}>Nombre</label>
          <input id={`${idCat}-nombre`} className={inputCls} value={form.nombre} onChange={e => setForm(f => ({ ...f, nombre: e.target.value }))} placeholder="Ej: Reformer" />
        </div>
        <div>
          <label htmlFor={`${idCat}-duracion`} className={labelCls}>Duración (min)</label>
          <input id={`${idCat}-duracion`} type="number" min={1} className={inputCls} value={form.duracionMinutos} onChange={e => setForm(f => ({ ...f, duracionMinutos: e.target.value }))} />
        </div>
        <div>
          <label htmlFor={`${idCat}-nivel`} className={labelCls}>Nivel</label>
          <select id={`${idCat}-nivel`} className={inputCls} value={form.nivel} onChange={e => setForm(f => ({ ...f, nivel: e.target.value as CadenaTipoClase['nivel'] }))}>
            {NIVELES.map(n => <option key={n} value={n}>{n}</option>)}
          </select>
        </div>
        <div className="@md/config:col-span-2">
          <p className={labelCls}>Color</p>
          <ColorInput value={form.color} onChange={v => setForm(f => ({ ...f, color: v }))} />
        </div>
        <div className="@md/config:col-span-2 flex items-center gap-2">
          <button onClick={guardar} disabled={guardando} className={cn(btnPrimary, guardando && 'opacity-50')}>
            {guardando ? 'Guardando…' : editId ? 'Guardar cambios' : 'Añadir a la plantilla'}
          </button>
          {editId && (
            <button onClick={cancelar} className={cn(btnSecondary, 'px-2.5')} aria-label="Cancelar edición">
              <X size={14} />
            </button>
          )}
        </div>
      </div>
    </TarjetaAjuste>
  );
}
