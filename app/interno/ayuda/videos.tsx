'use client';

// Vídeos de las guías (Tentare Academy). Quien graba pega aquí el enlace de Vimeo de cada guía y la publica; no hace falta desplegar.
// El TEXTO de las guías no se edita aquí: vive en código, con sus pruebas. Una guía sin vídeo publicado se ve igual, sin hueco.
// Lo escribe `PUT /api/interno/ayuda-videos` (permiso `content.write`); lo que valida el servidor (enlace de Vimeo, duración, nivel)
// es lo que se prueba en lib/ayuda/videos.test.ts, aquí solo se recogen los datos y se enseña el motivo si dice que no.

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Loader2, Video } from 'lucide-react';
import { fetchAyudaVideos, guardarAyudaVideo, quitarAyudaVideo, SinAcceso, type GuiaConVideo } from '@/lib/interno/client';
import { NIVELES, formatearDuracion, parsearDuracion } from '@/lib/ayuda/videos';

interface Borrador { vimeo: string; titulo: string; duracion: string; nivel: string; resultado: string; destacado: boolean; publicado: boolean }
const VACIO = (titulo: string): Borrador => ({ vimeo: '', titulo, duracion: '', nivel: 'principiante', resultado: '', destacado: false, publicado: false });

export function SeccionVideos() {
  const [guias, setGuias] = useState<GuiaConVideo[]>([]);
  const [sinTabla, setSinTabla] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(true);
  const [filtro, setFiltro] = useState('');
  const [abierta, setAbierta] = useState<string | null>(null);
  const [borrador, setBorrador] = useState<Borrador | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    try {
      const r = await fetchAyudaVideos();
      setGuias(r.guias); setSinTabla(r.sinTabla); setError(null);
    } catch (e) {
      setError(e instanceof SinAcceso ? e.message : 'No se han podido cargar los vídeos.');
    } finally { setCargando(false); }
  }, []);
  // eslint-disable-next-line react-hooks/set-state-in-effect -- Carga inicial desde la red: el estado viene de la respuesta.
  useEffect(() => { void cargar(); }, [cargar]);

  const visibles = useMemo(() => {
    const f = filtro.trim().toLowerCase();
    return guias.filter(g => !f || g.titulo.toLowerCase().includes(f) || g.articulo.includes(f));
  }, [guias, filtro]);

  function abrir(g: GuiaConVideo) {
    setAviso(null); setError(null);
    setAbierta(g.articulo);
    setBorrador(g.video ? {
      vimeo: g.video.hash_privado ? `https://vimeo.com/${g.video.video_id}/${g.video.hash_privado}` : g.video.video_id,
      titulo: g.video.titulo, duracion: formatearDuracion(g.video.duracion_seg), nivel: g.video.nivel,
      resultado: g.video.resultado ?? '', destacado: g.video.destacado, publicado: g.video.publicado,
    } : VACIO(g.titulo));
  }

  async function guardar() {
    if (!abierta || !borrador || guardando) return;
    const seg = parsearDuracion(borrador.duracion);
    if (seg === null) { setError('La duración va como 4:05 o en segundos.'); return; }
    setGuardando(true); setError(null); setAviso(null);
    try {
      await guardarAyudaVideo({ articulo: abierta, vimeo: borrador.vimeo, titulo: borrador.titulo, duracionSeg: seg, nivel: borrador.nivel, resultado: borrador.resultado, destacado: borrador.destacado, publicado: borrador.publicado });
      setAviso(borrador.publicado ? 'Guardado y publicado: ya se ve en la guía y en Academy.' : 'Guardado como borrador: todavía no se ve.');
      await cargar();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se ha podido guardar.');
    } finally { setGuardando(false); }
  }

  async function quitar() {
    if (!abierta || guardando) return;
    setGuardando(true); setError(null);
    try { await quitarAyudaVideo(abierta); setAbierta(null); setBorrador(null); await cargar(); }
    catch (e) { setError(e instanceof Error ? e.message : 'No se ha podido quitar.'); }
    finally { setGuardando(false); }
  }

  if (cargando) return <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 size={16} className="animate-spin" /> Cargando vídeos…</div>;

  const publicados = guias.filter(g => g.video?.publicado).length;
  const set = (c: Partial<Borrador>) => setBorrador(b => (b ? { ...b, ...c } : b));
  const campo = 'mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-[13px] text-foreground';

  return (
    <div className="flex flex-col gap-4">
      <p className="text-[13px] text-muted-foreground">
        {publicados} de {guias.length} guías con vídeo publicado. Un borrador no se ve en ninguna parte. Pega el enlace de Vimeo (si el vídeo es «no listado», el enlace completo lleva un código al final).
      </p>
      {sinTabla && <p role="alert" className="rounded-xl border border-border bg-muted p-3 text-[13px] text-foreground">Falta aplicar la migración de Academy: hasta entonces no se pueden guardar vídeos.</p>}
      {error && <p role="alert" className="text-[13px] text-destructive">{error}</p>}
      {aviso && <p role="status" className="text-[13px] text-foreground">{aviso}</p>}
      <input value={filtro} onChange={e => setFiltro(e.target.value)} placeholder="Buscar una guía…" aria-label="Buscar una guía" className={campo} />

      <ul className="flex flex-col gap-2">
        {visibles.map(g => {
          const estado = !g.video ? 'Sin vídeo' : g.video.publicado ? 'Publicado' : 'Borrador';
          return (
            <li key={g.articulo} className="rounded-xl border border-border bg-card">
              <button type="button" onClick={() => (abierta === g.articulo ? (setAbierta(null), setBorrador(null)) : abrir(g))}
                className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left" aria-expanded={abierta === g.articulo}>
                <span className="min-w-0"><span className="block truncate text-[13px] font-semibold text-foreground">{g.titulo}</span><span className="block text-[11px] text-muted-foreground">{g.articulo}</span></span>
                <span className={`flex shrink-0 items-center gap-1 text-[11px] font-semibold ${g.video?.publicado ? 'text-[#2E7D4F]' : 'text-muted-foreground'}`}><Video size={13} aria-hidden /> {estado}</span>
              </button>
              {abierta === g.articulo && borrador && (
                <form className="grid gap-3 border-t border-border px-4 py-4" onSubmit={e => { e.preventDefault(); void guardar(); }}>
                  <label className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">Enlace de Vimeo
                    <input value={borrador.vimeo} onChange={e => set({ vimeo: e.target.value })} className={campo} placeholder="https://vimeo.com/123456789/abcdef1234" required />
                  </label>
                  <label className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">Título del vídeo
                    <input value={borrador.titulo} onChange={e => set({ titulo: e.target.value })} className={campo} maxLength={120} required />
                  </label>
                  <div className="grid grid-cols-2 gap-3">
                    <label className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">Duración
                      <input value={borrador.duracion} onChange={e => set({ duracion: e.target.value })} className={campo} placeholder="4:05" required />
                    </label>
                    <label className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">Nivel
                      <select value={borrador.nivel} onChange={e => set({ nivel: e.target.value })} className={campo}>
                        {Object.entries(NIVELES).map(([v, t]) => <option key={v} value={v}>{t}</option>)}
                      </select>
                    </label>
                  </div>
                  <label className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">Lo que vas a conseguir (opcional)
                    <input value={borrador.resultado} onChange={e => set({ resultado: e.target.value })} className={campo} maxLength={200} />
                  </label>
                  <div className="flex flex-wrap items-center gap-4 text-[13px] text-foreground">
                    <label className="flex items-center gap-2"><input type="checkbox" checked={borrador.publicado} onChange={e => set({ publicado: e.target.checked })} /> Publicado</label>
                    <label className="flex items-center gap-2"><input type="checkbox" checked={borrador.destacado} onChange={e => set({ destacado: e.target.checked })} /> Destacado</label>
                  </div>
                  <div className="flex gap-2">
                    <button type="submit" disabled={guardando} className="rounded-xl bg-primary px-4 py-2 text-[13px] font-bold text-primary-foreground disabled:opacity-50">{guardando ? 'Guardando…' : 'Guardar'}</button>
                    {g.video && <button type="button" onClick={() => void quitar()} disabled={guardando} className="rounded-xl border border-border px-4 py-2 text-[13px] font-bold text-destructive disabled:opacity-50">Quitar el vídeo</button>}
                  </div>
                </form>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
