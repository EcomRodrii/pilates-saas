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
import { NW_TINTA, NW_MUTED_2, NW_BORDE, NW_PRODUCTO } from '@/components/network-v2/tokens';

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
function PickerEstudio({ onElegir, onCancelar, enviando, v2 }: {
  onElegir: (estudio: EstudioBusqueda) => void;
  onCancelar: () => void;
  enviando: boolean;
  v2: boolean;
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
    <div
      className={v2 ? 'mt-2 p-3 rounded-lg space-y-2' : 'mt-2 p-3 rounded-lg bg-background border border-border space-y-2'}
      style={v2 ? { border: `1px solid ${NW_BORDE}`, background: '#fff' } : undefined}
    >
      <div className="relative">
        <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2" style={v2 ? { color: NW_MUTED_2 } : undefined} />
        <input
          autoFocus className={`${v2 ? 'w-full px-3.5 py-2.5 rounded-xl text-[14px] outline-none' : inputCls} pl-8`}
          style={v2 ? { border: `1px solid ${NW_BORDE}`, color: NW_TINTA } : undefined}
          value={q} onChange={e => setQ(e.target.value)}
          placeholder="Busca el estudio en Tentare…"
        />
      </div>
      {buscando && (
        v2
          ? <Loader2 size={13} className="animate-spin" style={{ color: NW_MUTED_2 }} />
          : <Loader2 size={13} className="animate-spin text-muted-foreground" />
      )}
      {!buscando && q.trim().length >= 2 && resultados.length === 0 && (
        <p className="text-[11px]" style={v2 ? { color: NW_MUTED_2 } : undefined}>
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
            <span className="font-medium" style={v2 ? { color: NW_TINTA } : undefined}>{estudio.nombre}</span>
            {estudio.ciudad && <span style={v2 ? { color: NW_MUTED_2 } : undefined}> · {estudio.ciudad}</span>}
          </button>
        ))}
      </div>
      <button onClick={onCancelar} className="text-[11px]" style={v2 ? { color: NW_MUTED_2 } : undefined}>
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
// `tokensNetworkV2`: este componente nació para /network/mi-perfil (tokens
// shadcn del panel, `inputCls`/`labelCls`/`cardCls` de configuracion/page)
// y se reutilizó tal cual dentro del wizard de alta (NW_*, paleta propia
// de components/network-v2/tokens.ts) — el resultado eran dos sistemas de
// diseño distintos en la MISMA pantalla (radio de borde, tamaño de fuente y
// paleta cambiando a mitad de paso). En vez de bifurcar el componente, se
// le pasa qué tokens usar.
export function SeccionExperienciaNetwork({
  onExperienciasChange, tokensNetworkV2 = false,
}: {
  onExperienciasChange: (lista: ExperienciaNetwork[]) => void;
  tokensNetworkV2?: boolean;
}) {
  const v2 = tokensNetworkV2;
  const cCard = v2 ? 'rounded-2xl' : cardCls;
  const sCard: React.CSSProperties | undefined = v2 ? { border: `1px solid ${NW_BORDE}`, background: '#fff' } : undefined;
  const cInput = v2 ? 'w-full px-3.5 py-2.5 rounded-xl text-[14px] outline-none' : inputCls;
  const sInput: React.CSSProperties | undefined = v2 ? { border: `1px solid ${NW_BORDE}`, color: NW_TINTA } : undefined;
  const cLabel = v2 ? 'block text-[13px] font-semibold mb-1.5' : labelCls;
  const sLabel: React.CSSProperties | undefined = v2 ? { color: NW_TINTA } : undefined;
  const cTitulo = v2 ? 'text-[14px] font-semibold' : 'text-[14px] font-semibold text-foreground';
  const sTitulo: React.CSSProperties | undefined = v2 ? { color: NW_TINTA } : undefined;
  const cLinkAccion = v2 ? 'text-[12px] font-medium flex items-center gap-1' : 'text-[12px] font-medium text-brand flex items-center gap-1';
  const sLinkAccion: React.CSSProperties | undefined = v2 ? { color: NW_PRODUCTO } : undefined;
  const cMuted = v2 ? 'text-[12px]' : 'text-[12px] text-muted-foreground';
  const sMuted: React.CSSProperties | undefined = v2 ? { color: NW_MUTED_2 } : undefined;
  const cBorde = v2 ? 'pt-3 first:pt-0' : 'border-t border-border pt-3 first:border-t-0 first:pt-0';
  const sBorde: React.CSSProperties | undefined = v2 ? { borderTop: `1px solid ${NW_BORDE}` } : undefined;
  const cBordeForm = v2 ? 'pt-4 space-y-3' : 'border-t border-border pt-4 space-y-3';
  const sBordeForm: React.CSSProperties | undefined = v2 ? { borderTop: `1px solid ${NW_BORDE}` } : undefined;
  const cBtnPrimario = v2
    ? 'px-3.5 py-2 rounded-lg text-white text-[12px] font-medium disabled:opacity-60'
    : 'px-3.5 py-2 rounded-lg bg-brand text-brand-foreground text-[12px] font-medium disabled:opacity-60';
  const sBtnPrimario: React.CSSProperties | undefined = v2 ? { background: NW_PRODUCTO } : undefined;
  const cBtnSecundario = v2
    ? 'px-3.5 py-2 rounded-lg text-[12px]'
    : 'px-3.5 py-2 rounded-lg bg-card border border-border text-[12px] text-foreground';
  const sBtnSecundario: React.CSSProperties | undefined = v2 ? { border: `1px solid ${NW_BORDE}`, color: NW_TINTA, background: '#fff' } : undefined;
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
      <div className={`${cCard} p-6 flex items-center justify-center`} style={sCard}>
        {v2
          ? <Loader2 size={16} className="animate-spin" style={{ color: NW_MUTED_2 }} />
          : <Loader2 size={16} className="animate-spin text-muted-foreground" />}
      </div>
    );
  }

  return (
    <div className={`${cCard} p-6 space-y-4`} style={sCard}>
      <div className="flex items-center justify-between">
        <h3 className={cTitulo} style={sTitulo}>Experiencia</h3>
        {!formAbierto && (
          <button
            onClick={() => setFormAbierto(true)}
            className={cLinkAccion} style={sLinkAccion}
          >
            <Plus size={13} /> Añadir
          </button>
        )}
      </div>

      {experiencias.length === 0 && !formAbierto && (
        <p className={cMuted} style={sMuted}>
          Todavía no has añadido ningún estudio donde hayas trabajado.
        </p>
      )}

      {experiencias.map(exp => {
        const estadoInfo = ESTADO_VERIFICACION_INFO[exp.estadoVerificacion];
        const puedeVerificar = exp.estadoVerificacion === 'sin_solicitar' || exp.estadoVerificacion === 'rechazada';
        return (
          <div key={exp.id} className={cBorde} style={sBorde}>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[13px] font-medium" style={v2 ? { color: NW_TINTA } : undefined}>{exp.nombreEstudio}</p>
                <p className={v2 ? 'text-[11px]' : 'text-[11px] text-muted-foreground'} style={v2 ? { color: NW_MUTED_2 } : undefined}>{rangoAnios(exp.fechaInicio, exp.fechaFin)}</p>
                {exp.especialidades.length > 0 && (
                  <p className="text-[11px] mt-0.5" style={v2 ? { color: NW_TINTA } : undefined}>
                    {exp.especialidades.map(e => ESPECIALIDAD_LABEL[e]).join(' · ')}
                  </p>
                )}
                {estadoInfo && <p className={cn('text-[11px] font-medium mt-1', estadoInfo.cls)}>{estadoInfo.texto}</p>}
              </div>
              <button
                onClick={() => eliminar(exp.id)}
                disabled={borrandoId === exp.id}
                className="shrink-0 hover:text-destructive transition-colors disabled:opacity-40"
                style={v2 ? { color: NW_MUTED_2 } : undefined}
                aria-label={`Eliminar experiencia en ${exp.nombreEstudio}`}
              >
                {borrandoId === exp.id ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
              </button>
            </div>

            {puedeVerificar && picadorAbiertoId !== exp.id && (
              <button
                onClick={() => setPicadorAbiertoId(exp.id)}
                className={`mt-1.5 text-[11px] ${cLinkAccion}`} style={sLinkAccion}
              >
                <ShieldCheck size={12} /> Verificar experiencia
              </button>
            )}
            {picadorAbiertoId === exp.id && (
              <PickerEstudio
                v2={v2}
                enviando={enviandoVerificacionId === exp.id}
                onCancelar={() => setPicadorAbiertoId(null)}
                onElegir={estudio => pedirVerificacion(exp.id, estudio)}
              />
            )}
          </div>
        );
      })}

      {formAbierto && (
        <div className={cBordeForm} style={sBordeForm}>
          <div>
            <p className={cLabel} style={sLabel}>Nombre del estudio</p>
            <input
              className={cInput} style={sInput} value={form.nombreEstudio}
              onChange={e => setForm(f => ({ ...f, nombreEstudio: e.target.value }))}
              placeholder="Pilates Studio Barcelona"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <p className={cLabel} style={sLabel}>Fecha de inicio</p>
              <input
                type="date" className={cInput} style={sInput} value={form.fechaInicio}
                onChange={e => setForm(f => ({ ...f, fechaInicio: e.target.value }))}
              />
            </div>
            <div>
              <p className={cLabel} style={sLabel}>Fecha de fin</p>
              <input
                type="date" className={cInput} style={sInput} disabled={actualLaboral}
                value={form.fechaFin ?? ''}
                onChange={e => setForm(f => ({ ...f, fechaFin: e.target.value || null }))}
              />
              <label className={v2 ? 'flex items-center gap-1.5 mt-1.5 text-[11px]' : 'flex items-center gap-1.5 mt-1.5 text-[11px] text-muted-foreground'} style={v2 ? { color: NW_MUTED_2 } : undefined}>
                <input type="checkbox" checked={actualLaboral} onChange={e => setActualLaboral(e.target.checked)} />
                Sigo trabajando aquí
              </label>
            </div>
          </div>
          <div>
            <p className={cLabel} style={sLabel}>Especialidades en ese estudio</p>
            <SelectorChips
              opciones={ESPECIALIDADES_NETWORK.map(esp => ({ valor: esp, etiqueta: ESPECIALIDAD_LABEL[esp] }))}
              seleccion={form.especialidades}
              onChange={especialidades => setForm(f => ({ ...f, especialidades }))}
            />
          </div>
          <div>
            <p className={cLabel} style={sLabel}>Descripción (opcional)</p>
            <textarea
              className={`${cInput} min-h-16 resize-y`} style={sInput}
              value={form.descripcion ?? ''}
              onChange={e => setForm(f => ({ ...f, descripcion: e.target.value || null }))}
            />
          </div>
          {error && <p className="text-[11px] text-destructive">{error}</p>}
          <div className="flex items-center gap-2">
            <button
              onClick={guardar}
              disabled={guardando}
              className={cBtnPrimario} style={sBtnPrimario}
            >
              {guardando ? 'Guardando…' : 'Guardar experiencia'}
            </button>
            <button
              onClick={() => { setFormAbierto(false); setForm(FORM_VACIO); setError(''); }}
              className={cBtnSecundario} style={sBtnSecundario}
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
