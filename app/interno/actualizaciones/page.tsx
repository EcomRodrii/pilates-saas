'use client';

// Changelog de "Actualizaciones" del panel de un estudio. Antes era texto
// hardcodeado en lib/novedades.ts: cada entrada nueva exigía tocar código y
// desplegar. Aquí se publica una versión y aparece sola, al instante, en el
// panel de cualquier estudio (Realtime sobre changelog_versiones) — sin volver
// a tocar código.
//
// Flujo mínimo, a propósito sin wizard: crear versión → escribir sus cambios
// (texto + etiqueta) → publicar. Una pantalla, un formulario, un botón de
// estado. Solo se ve con el permiso `content.write`.

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Check, Loader2, Plus, Rocket, Trash2, X } from 'lucide-react';
import {
  borrarVersionChangelog, crearVersionChangelog, fetchChangelog, guardarVersionChangelog,
  publicarVersionChangelog, type CambioChangelog, type EtiquetaCambio, type VersionChangelog,
} from '@/lib/interno/client';

const ETIQUETA_LABEL: Record<EtiquetaCambio, string> = {
  NUEVA_FUNCIONALIDAD: 'Nueva funcionalidad',
  MEJORA: 'Mejora',
  RENDIMIENTO: 'Rendimiento',
  ARREGLO: 'Bug corregido',
};

const ETIQUETAS: EtiquetaCambio[] = ['NUEVA_FUNCIONALIDAD', 'MEJORA', 'RENDIMIENTO', 'ARREGLO'];

const fecha = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' });

type CambioEdit = { texto: string; etiqueta: EtiquetaCambio };

function cambiosDesde(v: VersionChangelog): CambioEdit[] {
  return [...v.changelog_cambios].sort((a, b) => a.orden - b.orden).map(c => ({ texto: c.texto, etiqueta: c.etiqueta }));
}

function EditorCambios({ cambios, onChange, deshabilitado }: {
  cambios: CambioEdit[]; onChange: (v: CambioEdit[]) => void; deshabilitado?: boolean;
}) {
  const campo = 'flex-1 rounded-lg border border-border bg-background px-2.5 py-1.5 text-[12.5px] text-foreground';
  return (
    <div className="flex flex-col gap-1.5">
      {cambios.map((c, i) => (
        <div key={i} className="flex items-center gap-1.5">
          <select
            value={c.etiqueta} disabled={deshabilitado}
            onChange={e => onChange(cambios.map((x, j) => j === i ? { ...x, etiqueta: e.target.value as EtiquetaCambio } : x))}
            className="rounded-lg border border-border bg-background px-2 py-1.5 text-[11.5px] font-semibold text-foreground"
          >
            {ETIQUETAS.map(et => <option key={et} value={et}>{ETIQUETA_LABEL[et]}</option>)}
          </select>
          <input
            className={campo} value={c.texto} disabled={deshabilitado} placeholder="Qué ha cambiado, en una frase"
            onChange={e => onChange(cambios.map((x, j) => j === i ? { ...x, texto: e.target.value } : x))}
          />
          <button type="button" disabled={deshabilitado} aria-label="Quitar cambio"
            onClick={() => onChange(cambios.filter((_, j) => j !== i))}>
            <X className="size-3.5 text-muted-foreground" />
          </button>
        </div>
      ))}
      <button
        type="button" disabled={deshabilitado}
        onClick={() => onChange([...cambios, { texto: '', etiqueta: 'MEJORA' }])}
        className="mt-0.5 flex w-fit items-center gap-1 text-[12px] font-semibold text-brand-medio"
      >
        <Plus className="size-3.5" /> Añadir cambio
      </button>
    </div>
  );
}

function Tarjeta({ v, onCambiado }: { v: VersionChangelog; onCambiado: () => void }) {
  const [editando, setEditando] = useState(false);
  const [version, setVersion] = useState(v.version);
  const [titulo, setTitulo] = useState(v.titulo);
  const [fechaPub, setFechaPub] = useState(v.fecha_publicacion);
  const [cambios, setCambios] = useState<CambioEdit[]>(cambiosDesde(v));
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const abrir = () => {
    setVersion(v.version); setTitulo(v.titulo); setFechaPub(v.fecha_publicacion); setCambios(cambiosDesde(v));
    setError(null); setEditando(true);
  };

  const guardar = async () => {
    setGuardando(true); setError(null);
    try {
      await guardarVersionChangelog(v.id, { version, titulo, fechaPublicacion: fechaPub, cambios });
      setEditando(false); onCambiado();
    } catch (e) { setError(e instanceof Error ? e.message : 'No se ha podido guardar.'); }
    finally { setGuardando(false); }
  };

  const publicar = async () => {
    setGuardando(true); setError(null);
    try { await publicarVersionChangelog(v.id); onCambiado(); }
    catch (e) { setError(e instanceof Error ? e.message : 'No se ha podido publicar.'); }
    finally { setGuardando(false); }
  };

  const borrar = async () => {
    if (v.estado === 'publicado' && !confirm(`"${v.version}" ya está publicada. ¿Borrarla igualmente?`)) return;
    setGuardando(true); setError(null);
    try { await borrarVersionChangelog(v.id); onCambiado(); }
    catch (e) { setError(e instanceof Error ? e.message : 'No se ha podido borrar.'); }
    finally { setGuardando(false); }
  };

  const campo = 'rounded-lg border border-border bg-background px-2.5 py-1.5 text-[12.5px] text-foreground';

  return (
    <div className="rounded-2xl border border-border bg-card px-4 py-3.5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="rounded-lg bg-brand/10 px-2 py-0.5 text-[12.5px] font-bold text-brand">v{v.version}</span>
          <span className="text-[13.5px] font-bold text-foreground">{v.titulo}</span>
          <span className={`rounded-full px-2 py-0.5 text-[10.5px] font-bold uppercase tracking-wide ${
            v.estado === 'publicado' ? 'bg-success/10 text-success' : 'bg-warning/10 text-warning'}`}>
            {v.estado === 'publicado' ? 'Publicada' : 'Borrador'}
          </span>
        </div>
        <span className="text-[11.5px] text-muted-foreground">{fecha(v.fecha_publicacion)}</span>
      </div>

      {!editando ? (
        <>
          <ul className="mt-2 flex flex-col gap-1">
            {v.changelog_cambios.length === 0 && <li className="text-[12px] text-muted-foreground">Sin cambios todavía.</li>}
            {[...v.changelog_cambios].sort((a, b) => a.orden - b.orden).map(c => (
              <li key={c.id} className="flex items-start gap-1.5 text-[12.5px] text-foreground">
                <span className="mt-0.5 shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold uppercase text-muted-foreground bg-muted">
                  {ETIQUETA_LABEL[c.etiqueta]}
                </span>
                {c.texto}
              </li>
            ))}
          </ul>
          <div className="mt-3 flex items-center gap-2">
            <button type="button" onClick={abrir}
              className="rounded-xl border border-border px-3 py-1.5 text-[12.5px] font-semibold text-foreground">
              Editar
            </button>
            {v.estado === 'borrador' && (
              <button type="button" disabled={guardando} onClick={() => void publicar()}
                className="flex items-center gap-1.5 rounded-xl bg-brand px-3 py-1.5 text-[12.5px] font-bold text-brand-foreground disabled:opacity-40">
                {guardando ? <Loader2 className="size-3.5 animate-spin" /> : <Rocket className="size-3.5" />}
                Publicar
              </button>
            )}
            <span className="flex-1" />
            <button type="button" disabled={guardando} onClick={() => void borrar()} aria-label="Borrar versión"
              className="rounded-xl border border-red-500/40 px-2 py-1.5 text-red-700 dark:text-red-400">
              <Trash2 className="size-3.5" />
            </button>
          </div>
        </>
      ) : (
        <div className="mt-3 border-t border-border pt-3">
          <div className="grid gap-2 sm:grid-cols-3">
            <input className={campo} value={version} disabled={guardando} placeholder="Versión (0.92)" onChange={e => setVersion(e.target.value)} />
            <input className={`${campo} sm:col-span-2`} value={titulo} disabled={guardando} placeholder="Título" onChange={e => setTitulo(e.target.value)} />
          </div>
          <input className={`${campo} mt-2 w-full`} type="date" value={fechaPub} disabled={guardando} onChange={e => setFechaPub(e.target.value)} />
          <div className="mt-3">
            <EditorCambios cambios={cambios} onChange={setCambios} deshabilitado={guardando} />
          </div>
          {error && <p className="mt-2 text-[12.5px] text-red-600 dark:text-red-400">{error}</p>}
          <div className="mt-3 flex items-center gap-2">
            <button type="button" disabled={guardando} onClick={() => void guardar()}
              className="flex items-center gap-1.5 rounded-xl bg-brand px-3 py-1.5 text-[12.5px] font-bold text-brand-foreground disabled:opacity-40">
              {guardando ? <Loader2 className="size-3.5 animate-spin" /> : <Check className="size-3.5" />}
              Guardar
            </button>
            <button type="button" disabled={guardando} onClick={() => setEditando(false)}
              className="rounded-xl border border-border px-3 py-1.5 text-[12.5px] font-semibold text-foreground">
              Cancelar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function NuevaVersion({ onCreada }: { onCreada: () => void }) {
  const [abierto, setAbierto] = useState(false);
  const [version, setVersion] = useState('');
  const [titulo, setTitulo] = useState('');
  const [fechaPub, setFechaPub] = useState(() => new Date().toISOString().slice(0, 10));
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const crear = async () => {
    setGuardando(true); setError(null);
    try {
      await crearVersionChangelog({ version: version.trim(), titulo: titulo.trim(), fechaPublicacion: fechaPub });
      setVersion(''); setTitulo(''); setAbierto(false);
      onCreada();
    } catch (e) { setError(e instanceof Error ? e.message : 'No se ha podido crear.'); }
    finally { setGuardando(false); }
  };

  if (!abierto) {
    return (
      <button type="button" onClick={() => setAbierto(true)}
        className="flex items-center gap-1.5 rounded-xl bg-brand px-3.5 py-2 text-[13px] font-bold text-brand-foreground">
        <Plus className="size-4" /> Nueva versión
      </button>
    );
  }

  const campo = 'rounded-xl border border-border bg-background px-3 py-2 text-[13px] text-foreground';

  return (
    <div className="rounded-2xl border border-border bg-card px-4 py-3.5">
      <div className="flex items-center justify-between">
        <p className="text-[14px] font-bold text-foreground">Nueva versión</p>
        <button type="button" onClick={() => setAbierto(false)} aria-label="Cerrar"><X className="size-4 text-muted-foreground" /></button>
      </div>
      <div className="mt-3 grid gap-2 sm:grid-cols-3">
        <input className={campo} placeholder="Versión (0.94)" value={version} onChange={e => setVersion(e.target.value)} />
        <input className={`${campo} sm:col-span-2`} placeholder="Título corto" value={titulo} onChange={e => setTitulo(e.target.value)} />
      </div>
      <input className={`${campo} mt-2 w-full sm:w-auto`} type="date" value={fechaPub} onChange={e => setFechaPub(e.target.value)} />
      {error && <p className="mt-2 text-[12.5px] text-red-600 dark:text-red-400">{error}</p>}
      <button
        type="button" disabled={guardando || !version.trim() || !titulo.trim()}
        onClick={() => void crear()}
        className="mt-3 flex items-center gap-1.5 rounded-xl bg-brand px-3.5 py-2 text-[13px] font-bold text-brand-foreground disabled:opacity-40"
      >
        {guardando ? <Loader2 className="size-3.5 animate-spin" /> : <Plus className="size-3.5" />}
        Crear como borrador
      </button>
      <p className="mt-1.5 text-[11.5px] text-muted-foreground">
        Se crea en borrador. Añade sus cambios y publícala cuando esté lista.
      </p>
    </div>
  );
}

export default function ActualizacionesInterno() {
  const [versiones, setVersiones] = useState<VersionChangelog[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    try {
      const r = await fetchChangelog();
      setVersiones(r.versiones); setError(null);
    } catch (e) { setError(e instanceof Error ? e.message : 'Error'); }
  }, []);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void cargar(); }, [cargar]);

  const { borradores, publicadas } = useMemo(() => {
    const lista = versiones ?? [];
    return { borradores: lista.filter(v => v.estado === 'borrador'), publicadas: lista.filter(v => v.estado === 'publicado') };
  }, [versiones]);

  if (error) return <p className="text-[13.5px] text-muted-foreground">{error}</p>;
  if (!versiones) return <p className="text-[13.5px] text-muted-foreground">Cargando…</p>;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-[17px] font-bold text-foreground">Actualizaciones</h1>
          <p className="text-[12.5px] text-muted-foreground">
            El changelog que ve cualquier propietaria en su panel. Publicar aparece al instante, sin desplegar nada.
          </p>
        </div>
        <NuevaVersion onCreada={() => void cargar()} />
      </div>

      {borradores.length > 0 && (
        <section>
          <h2 className="text-[12px] font-bold uppercase tracking-wide text-muted-foreground mb-2.5">Borradores</h2>
          <div className="flex flex-col gap-2.5">
            {borradores.map(v => <Tarjeta key={v.id} v={v} onCambiado={() => void cargar()} />)}
          </div>
        </section>
      )}

      <section>
        <h2 className="text-[12px] font-bold uppercase tracking-wide text-muted-foreground mb-2.5">Publicadas</h2>
        <div className="flex flex-col gap-2.5">
          {publicadas.length === 0 && <p className="text-[12.5px] text-muted-foreground">Todavía no hay ninguna versión publicada.</p>}
          {publicadas.map(v => <Tarjeta key={v.id} v={v} onCambiado={() => void cargar()} />)}
        </div>
      </section>
    </div>
  );
}
