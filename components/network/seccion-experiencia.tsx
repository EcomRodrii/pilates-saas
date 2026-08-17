'use client';

import { useEffect, useState } from 'react';
import { Plus, Trash2, Loader2, ShieldCheck, Search } from 'lucide-react';
import { cn } from '@/lib/utils';
import { SelectorChips } from '@/components/network/selector-chips';
import {
  fetchMisExperienciasNetwork, crearExperienciaNetwork, eliminarExperienciaNetwork,
  buscarEstudiosNetwork, solicitarVerificacionExperiencia, type EstudioBusqueda,
} from '@/lib/api-client';
import { ESPECIALIDADES_NETWORK, ESPECIALIDAD_LABEL } from '@/lib/network/catalogo';
import { rangoAnios } from '@/lib/network/formato';
import type { ExperienciaNetwork, NuevaExperienciaNetwork } from '@/lib/network/tipos';
import { inputCls, labelCls, cardCls } from '@/app/(dashboard)/configuracion/page';

const FORM_VACIO: NuevaExperienciaNetwork = {
  nombreEstudio: '', fechaInicio: '', fechaFin: null, especialidades: [], descripcion: null,
};

const ESTADO_VERIFICACION_INFO: Record<ExperienciaNetwork['estadoVerificacion'], { texto: string; cls: string } | null> = {
  sin_solicitar: null,
  pendiente: { texto: 'Verificación pendiente', cls: 'text-amber-600' },
  confirmada: { texto: '✓ Experiencia verificada', cls: 'text-success' },
  rechazada: { texto: 'No se pudo confirmar', cls: 'text-muted-foreground' },
};

// Picker de estudio para "Verificar experiencia" — búsqueda en vivo contra
// /api/network/estudios/buscar (solo estudios Tentare reales: una
// experiencia en un estudio fuera de Tentare no se puede verificar en V1,
// docs/NETWORK-IMPLEMENTATION-PLAN.md §3, límite conocido).
function PickerEstudio({ onElegir, onCancelar, enviando }: {
  onElegir: (estudio: EstudioBusqueda) => void;
  onCancelar: () => void;
  enviando: boolean;
}) {
  const [q, setQ] = useState('');
  const [resultados, setResultados] = useState<EstudioBusqueda[]>([]);
  const [buscando, setBuscando] = useState(false);

  useEffect(() => {
    let vivo = true;
    // `setResultados([])` va DENTRO del timeout (nunca síncrono en el cuerpo
    // del efecto) — regla react-hooks/set-state-in-effect, mismo criterio ya
    // aplicado en app/(dashboard)/network/page.tsx.
    const t = setTimeout(() => {
      if (q.trim().length < 2) { setResultados([]); return; }
      setBuscando(true);
      buscarEstudiosNetwork(q).then(r => { if (vivo) { setResultados(r); setBuscando(false); } });
    }, 250);
    return () => { vivo = false; clearTimeout(t); };
  }, [q]);

  return (
    <div className="mt-2 p-3 rounded-lg bg-background border border-border space-y-2">
      <div className="relative">
        <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <input
          autoFocus className={`${inputCls} pl-8`} value={q} onChange={e => setQ(e.target.value)}
          placeholder="Busca el estudio en Tentare…"
        />
      </div>
      {buscando && <Loader2 size={13} className="animate-spin text-muted-foreground" />}
      {!buscando && q.trim().length >= 2 && resultados.length === 0 && (
        <p className="text-[11px] text-muted-foreground">
          Ningún estudio Tentare coincide. Solo se pueden verificar experiencias en estudios que usan Tentare.
        </p>
      )}
      <div className="space-y-1">
        {resultados.map(estudio => (
          <button
            key={estudio.id}
            onClick={() => onElegir(estudio)}
            disabled={enviando}
            className="w-full text-left px-2.5 py-1.5 rounded-md hover:bg-muted transition-colors text-[12px] disabled:opacity-50"
          >
            <span className="font-medium text-foreground">{estudio.nombre}</span>
            {estudio.ciudad && <span className="text-muted-foreground"> · {estudio.ciudad}</span>}
          </button>
        ))}
      </div>
      <button onClick={onCancelar} className="text-[11px] text-muted-foreground hover:text-foreground">
        Cancelar
      </button>
    </div>
  );
}

// Autocontenida a propósito: carga su propia lista y avisa a la página
// padre la LISTA completa (`onExperienciasChange`) — hace falta para dos
// cosas del padre, no solo la completitud (lib/network/completitud.ts,
// "experiencia" es un booleano ahí) sino también el badge "Experiencia
// verificada" (Fase 8), que necesita saber si ALGUNA está `confirmada`.
export function SeccionExperienciaNetwork({ onExperienciasChange }: { onExperienciasChange: (lista: ExperienciaNetwork[]) => void }) {
  const [experiencias, setExperiencias] = useState<ExperienciaNetwork[]>([]);
  const [cargando, setCargando] = useState(true);
  const [formAbierto, setFormAbierto] = useState(false);
  const [form, setForm] = useState<NuevaExperienciaNetwork>(FORM_VACIO);
  const [actualLaboral, setActualLaboral] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');
  const [borrandoId, setBorrandoId] = useState<string | null>(null);
  const [picadorAbiertoId, setPicadorAbiertoId] = useState<string | null>(null);
  const [enviandoVerificacionId, setEnviandoVerificacionId] = useState<string | null>(null);

  useEffect(() => {
    let vivo = true;
    fetchMisExperienciasNetwork().then(lista => {
      if (!vivo) return;
      setExperiencias(lista);
      setCargando(false);
      onExperienciasChange(lista);
    });
    return () => { vivo = false; };
    // onExperienciasChange se recrea cada render en el padre si no está
    // memoizado ahí — aquí solo importa dispararlo cuando cambia la LISTA,
    // no la identidad de la función.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function guardar() {
    setError('');
    if (!form.nombreEstudio.trim()) { setError('Indica el nombre del estudio.'); return; }
    if (!form.fechaInicio) { setError('Indica cuándo empezaste.'); return; }
    setGuardando(true);
    const res = await crearExperienciaNetwork({ ...form, fechaFin: actualLaboral ? null : form.fechaFin });
    setGuardando(false);
    if (!res.ok) { setError(res.error); return; }
    const siguiente = [res.experiencia, ...experiencias];
    setExperiencias(siguiente);
    onExperienciasChange(siguiente);
    setForm(FORM_VACIO);
    setActualLaboral(true);
    setFormAbierto(false);
  }

  async function eliminar(id: string) {
    setBorrandoId(id);
    const res = await eliminarExperienciaNetwork(id);
    setBorrandoId(null);
    if (!res.ok) { setError(res.error ?? 'No se ha podido eliminar.'); return; }
    const siguiente = experiencias.filter(e => e.id !== id);
    setExperiencias(siguiente);
    onExperienciasChange(siguiente);
  }

  async function pedirVerificacion(experienciaId: string, estudio: EstudioBusqueda) {
    setEnviandoVerificacionId(experienciaId);
    const res = await solicitarVerificacionExperiencia(experienciaId, estudio.id);
    setEnviandoVerificacionId(null);
    if (!res.ok) { setError(res.error ?? 'No se ha podido enviar la solicitud.'); return; }
    setPicadorAbiertoId(null);
    const siguiente = experiencias.map(e => (
      e.id === experienciaId ? { ...e, estadoVerificacion: 'pendiente' as const, studioId: estudio.id } : e
    ));
    setExperiencias(siguiente);
    onExperienciasChange(siguiente);
  }

  if (cargando) {
    return (
      <div className={`${cardCls} p-6 flex items-center justify-center`}>
        <Loader2 size={16} className="animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className={`${cardCls} p-6 space-y-4`}>
      <div className="flex items-center justify-between">
        <h3 className="text-[14px] font-semibold text-foreground">Experiencia</h3>
        {!formAbierto && (
          <button
            onClick={() => setFormAbierto(true)}
            className="text-[12px] font-medium text-brand flex items-center gap-1"
          >
            <Plus size={13} /> Añadir
          </button>
        )}
      </div>

      {experiencias.length === 0 && !formAbierto && (
        <p className="text-[12px] text-muted-foreground">
          Todavía no has añadido ningún estudio donde hayas trabajado.
        </p>
      )}

      {experiencias.map(exp => {
        const estadoInfo = ESTADO_VERIFICACION_INFO[exp.estadoVerificacion];
        const puedeVerificar = exp.estadoVerificacion === 'sin_solicitar' || exp.estadoVerificacion === 'rechazada';
        return (
          <div key={exp.id} className="border-t border-border pt-3 first:border-t-0 first:pt-0">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[13px] font-medium text-foreground">{exp.nombreEstudio}</p>
                <p className="text-[11px] text-muted-foreground">{rangoAnios(exp.fechaInicio, exp.fechaFin)}</p>
                {exp.especialidades.length > 0 && (
                  <p className="text-[11px] text-foreground mt-0.5">
                    {exp.especialidades.map(e => ESPECIALIDAD_LABEL[e]).join(' · ')}
                  </p>
                )}
                {estadoInfo && <p className={cn('text-[11px] font-medium mt-1', estadoInfo.cls)}>{estadoInfo.texto}</p>}
              </div>
              <button
                onClick={() => eliminar(exp.id)}
                disabled={borrandoId === exp.id}
                className="shrink-0 text-muted-foreground hover:text-destructive transition-colors disabled:opacity-40"
                aria-label={`Eliminar experiencia en ${exp.nombreEstudio}`}
              >
                {borrandoId === exp.id ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
              </button>
            </div>

            {puedeVerificar && picadorAbiertoId !== exp.id && (
              <button
                onClick={() => setPicadorAbiertoId(exp.id)}
                className="mt-1.5 text-[11px] font-medium text-brand flex items-center gap-1"
              >
                <ShieldCheck size={12} /> Verificar experiencia
              </button>
            )}
            {picadorAbiertoId === exp.id && (
              <PickerEstudio
                enviando={enviandoVerificacionId === exp.id}
                onCancelar={() => setPicadorAbiertoId(null)}
                onElegir={estudio => pedirVerificacion(exp.id, estudio)}
              />
            )}
          </div>
        );
      })}

      {formAbierto && (
        <div className="border-t border-border pt-4 space-y-3">
          <div>
            <p className={labelCls}>Nombre del estudio</p>
            <input
              className={inputCls} value={form.nombreEstudio}
              onChange={e => setForm(f => ({ ...f, nombreEstudio: e.target.value }))}
              placeholder="Nombre del estudio"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <p className={labelCls}>Fecha de inicio</p>
              <input
                type="date" className={inputCls} value={form.fechaInicio}
                onChange={e => setForm(f => ({ ...f, fechaInicio: e.target.value }))}
              />
            </div>
            <div>
              <p className={labelCls}>Fecha de fin</p>
              <input
                type="date" className={inputCls} disabled={actualLaboral}
                value={form.fechaFin ?? ''}
                onChange={e => setForm(f => ({ ...f, fechaFin: e.target.value || null }))}
              />
              <label className="flex items-center gap-1.5 mt-1.5 text-[11px] text-muted-foreground">
                <input type="checkbox" checked={actualLaboral} onChange={e => setActualLaboral(e.target.checked)} />
                Sigo trabajando aquí
              </label>
            </div>
          </div>
          <div>
            <p className={labelCls}>Especialidades en ese estudio</p>
            <SelectorChips
              opciones={ESPECIALIDADES_NETWORK.map(v => ({ valor: v, etiqueta: ESPECIALIDAD_LABEL[v] }))}
              seleccion={form.especialidades}
              onChange={especialidades => setForm(f => ({ ...f, especialidades }))}
            />
          </div>
          <div>
            <p className={labelCls}>Descripción (opcional)</p>
            <textarea
              className={`${inputCls} min-h-16 resize-y`}
              value={form.descripcion ?? ''}
              onChange={e => setForm(f => ({ ...f, descripcion: e.target.value || null }))}
            />
          </div>
          {error && <p className="text-[11px] text-destructive">{error}</p>}
          <div className="flex items-center gap-2">
            <button
              onClick={guardar}
              disabled={guardando}
              className="px-3.5 py-2 rounded-lg bg-brand text-brand-foreground text-[12px] font-medium disabled:opacity-60"
            >
              {guardando ? 'Guardando…' : 'Guardar experiencia'}
            </button>
            <button
              onClick={() => { setFormAbierto(false); setForm(FORM_VACIO); setError(''); }}
              className="px-3.5 py-2 rounded-lg bg-card border border-border text-[12px] text-foreground"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

      {error && !formAbierto && <p className="text-[11px] text-destructive">{error}</p>}
    </div>
  );
}
