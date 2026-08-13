'use client';

// Moderación de Tentare Network — docs/NETWORK-IMPLEMENTATION-PLAN.md §10.
// Tres colas independientes (perfiles / verificaciones / reportes), cada
// una con su propia carga — mismo criterio que el resto de /interno: no
// hay un modelo compartido, cada pestaña pide lo suyo.

import { useCallback, useEffect, useRef, useState } from 'react';
import { Star } from 'lucide-react';
import {
  fetchPerfilesNetworkInterno, cambiarEstadoPerfilNetworkInterno, destacarPerfilNetworkInterno, type PerfilNetworkInterno,
  fetchVerificacionesNetworkInterno, type VerificacionNetworkInterna,
  fetchReportesNetworkInterno, resolverReporteNetworkInterno, type ReporteNetworkInterno,
  fetchResenasNetworkInterno, moderarResenaNetworkInterno, type ResenaNetworkInterna,
} from '@/lib/interno/client';

const cuando = (iso: string) =>
  new Date(iso).toLocaleString('es-ES', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

const ESTADO_PERFIL_LABEL: Record<string, string> = {
  draft: 'Borrador', published: 'Publicado', hidden: 'Oculto', suspended: 'Suspendido',
};

function TabPerfiles() {
  const [perfiles, setPerfiles] = useState<PerfilNetworkInterno[] | null>(null);
  const [q, setQ] = useState('');
  const qRef = useRef('');
  const [estado, setEstado] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [accionandoId, setAccionandoId] = useState<string | null>(null);

  // qRef en vez de leer `q` directamente: `cargar` solo depende de `estado`
  // a propósito (buscar por texto no dispara una petición por cada tecla,
  // solo con Enter/clic en "Buscar"), pero eso deja `q` cerrado por closure
  // al valor que tenía cuando `cargar` se creó — con `estado` sin cambiar,
  // toda llamada a cargar() mandaba siempre q='' aunque hubiera texto en el
  // input. El ref siempre lee el valor actual sin añadir `q` a las deps.
  const cargar = useCallback(async () => {
    try { setPerfiles((await fetchPerfilesNetworkInterno({ q: qRef.current, estado })).perfiles); }
    catch (e) { setError(e instanceof Error ? e.message : 'Error'); }
  }, [estado]);

  useEffect(() => { void cargar(); }, [cargar]);

  async function cambiarEstado(id: string, nuevoEstado: string) {
    setAccionandoId(id);
    try {
      await cambiarEstadoPerfilNetworkInterno(id, nuevoEstado);
      await cargar();
    } catch (e) { setError(e instanceof Error ? e.message : 'Error'); }
    setAccionandoId(null);
  }

  async function destacar(id: string, destacado: boolean) {
    setAccionandoId(id);
    try {
      await destacarPerfilNetworkInterno(id, destacado);
      await cargar();
    } catch (e) { setError(e instanceof Error ? e.message : 'Error'); }
    setAccionandoId(null);
  }

  if (error) return <p className="text-[13.5px] text-muted-foreground">{error}</p>;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <input
          value={q}
          onChange={e => { setQ(e.target.value); qRef.current = e.target.value; }}
          onKeyDown={e => e.key === 'Enter' && cargar()}
          placeholder="Buscar por nombre…"
          className="rounded-lg border border-border bg-card px-3 py-1.5 text-[12.5px] text-foreground"
        />
        <select
          value={estado} onChange={e => setEstado(e.target.value)}
          className="rounded-lg border border-border bg-card px-2 py-1.5 text-[12.5px] text-foreground"
        >
          <option value="">Todos los estados</option>
          {Object.entries(ESTADO_PERFIL_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
        <button onClick={cargar} className="text-[12px] font-medium text-foreground underline">Buscar</button>
      </div>

      {!perfiles ? (
        <p className="text-[13px] text-muted-foreground">Cargando…</p>
      ) : perfiles.length === 0 ? (
        <p className="text-[13px] text-muted-foreground rounded-2xl border border-border bg-card px-4 py-6 text-center">
          Ningún perfil coincide.
        </p>
      ) : (
        <div className="rounded-2xl border border-border bg-card overflow-hidden">
          <table className="w-full text-[12.5px]">
            <thead>
              <tr className="text-left text-muted-foreground border-b border-border">
                <th className="px-4 py-2 font-medium">Nombre</th>
                <th className="px-4 py-2 font-medium">Ciudad</th>
                <th className="px-4 py-2 font-medium">Estado</th>
                <th className="px-4 py-2 font-medium">Creado</th>
                <th className="px-4 py-2 font-medium">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {perfiles.map(p => (
                <tr key={p.id} className="border-b border-border last:border-0">
                  <td className="px-4 py-2 text-foreground">{p.destacado && '⭐ '}{p.nombre}</td>
                  <td className="px-4 py-2 text-muted-foreground">{p.ciudad ?? '—'}</td>
                  <td className="px-4 py-2 text-foreground">{ESTADO_PERFIL_LABEL[p.estado] ?? p.estado}</td>
                  <td className="px-4 py-2 text-muted-foreground">{cuando(p.creado_en)}</td>
                  <td className="px-4 py-2">
                    <div className="flex items-center gap-2">
                      {p.estado !== 'suspended' && (
                        <button
                          disabled={accionandoId === p.id}
                          onClick={() => cambiarEstado(p.id, 'suspended')}
                          className="text-destructive underline disabled:opacity-50"
                        >
                          Suspender
                        </button>
                      )}
                      {p.estado === 'suspended' && (
                        <button
                          disabled={accionandoId === p.id}
                          onClick={() => cambiarEstado(p.id, 'published')}
                          className="text-foreground underline disabled:opacity-50"
                        >
                          Restaurar
                        </button>
                      )}
                      <button
                        disabled={accionandoId === p.id}
                        onClick={() => destacar(p.id, !p.destacado)}
                        className="text-foreground underline disabled:opacity-50"
                      >
                        {p.destacado ? 'Quitar destacado' : 'Destacar'}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function TabVerificaciones() {
  const [estado, setEstado] = useState('pendiente');
  const [filas, setFilas] = useState<VerificacionNetworkInterna[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    try { setFilas((await fetchVerificacionesNetworkInterno(estado)).verificaciones); }
    catch (e) { setError(e instanceof Error ? e.message : 'Error'); }
  }, [estado]);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void cargar(); }, [cargar]);

  if (error) return <p className="text-[13.5px] text-muted-foreground">{error}</p>;

  return (
    <div className="flex flex-col gap-3">
      <p className="text-[12px] text-muted-foreground">
        Solo lectura: quién confirma o rechaza sigue siendo el estudio implicado, no el equipo de Tentare.
      </p>
      <select
        value={estado} onChange={e => setEstado(e.target.value)}
        className="w-fit rounded-lg border border-border bg-card px-2 py-1.5 text-[12.5px] text-foreground"
      >
        {['pendiente', 'confirmada', 'rechazada', 'cancelada'].map(v => <option key={v} value={v}>{v}</option>)}
      </select>

      {!filas ? (
        <p className="text-[13px] text-muted-foreground">Cargando…</p>
      ) : filas.length === 0 ? (
        <p className="text-[13px] text-muted-foreground rounded-2xl border border-border bg-card px-4 py-6 text-center">
          Nada en este estado.
        </p>
      ) : (
        <div className="rounded-2xl border border-border bg-card overflow-hidden">
          <table className="w-full text-[12.5px]">
            <thead>
              <tr className="text-left text-muted-foreground border-b border-border">
                <th className="px-4 py-2 font-medium">Profesional</th>
                <th className="px-4 py-2 font-medium">Estudio</th>
                <th className="px-4 py-2 font-medium">Solicitado</th>
                <th className="px-4 py-2 font-medium">Resuelto</th>
              </tr>
            </thead>
            <tbody>
              {filas.map(f => (
                <tr key={f.id} className="border-b border-border last:border-0">
                  <td className="px-4 py-2 text-foreground">{f.profesionalNombre}</td>
                  <td className="px-4 py-2 text-muted-foreground">{f.estudioNombre}</td>
                  <td className="px-4 py-2 text-muted-foreground">{cuando(f.solicitadoEn)}</td>
                  <td className="px-4 py-2 text-muted-foreground">{f.resueltoEn ? cuando(f.resueltoEn) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

const MOTIVO_LABEL: Record<string, string> = {
  informacion_falsa: 'Información falsa', suplantacion: 'Suplantación', spam: 'Spam',
  comportamiento: 'Comportamiento inapropiado', fraude: 'Fraude', otro: 'Otro',
};

function TabReportes() {
  const [estado, setEstado] = useState('pendiente');
  const [reportes, setReportes] = useState<ReporteNetworkInterno[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [accionandoId, setAccionandoId] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    try { setReportes((await fetchReportesNetworkInterno(estado)).reportes); }
    catch (e) { setError(e instanceof Error ? e.message : 'Error'); }
  }, [estado]);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void cargar(); }, [cargar]);

  async function resolver(id: string, nuevoEstado: 'revisado' | 'resuelto') {
    setAccionandoId(id);
    try { await resolverReporteNetworkInterno(id, nuevoEstado); await cargar(); }
    catch (e) { setError(e instanceof Error ? e.message : 'Error'); }
    setAccionandoId(null);
  }

  if (error) return <p className="text-[13.5px] text-muted-foreground">{error}</p>;

  return (
    <div className="flex flex-col gap-3">
      <select
        value={estado} onChange={e => setEstado(e.target.value)}
        className="w-fit rounded-lg border border-border bg-card px-2 py-1.5 text-[12.5px] text-foreground"
      >
        {['pendiente', 'revisado', 'resuelto'].map(v => <option key={v} value={v}>{v}</option>)}
      </select>

      {!reportes ? (
        <p className="text-[13px] text-muted-foreground">Cargando…</p>
      ) : reportes.length === 0 ? (
        <p className="text-[13px] text-muted-foreground rounded-2xl border border-border bg-card px-4 py-6 text-center">
          Nada en este estado.
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          {reportes.map(r => (
            <div key={r.id} className="rounded-2xl border border-border bg-card p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-[13px] font-medium text-foreground">{r.perfilNombre}</p>
                  <p className="text-[12px] text-muted-foreground">{MOTIVO_LABEL[r.motivo] ?? r.motivo} · {cuando(r.creadoEn)}</p>
                  {r.detalle && <p className="text-[12px] text-foreground mt-1">{r.detalle}</p>}
                </div>
                {r.estado === 'pendiente' && (
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      disabled={accionandoId === r.id}
                      onClick={() => resolver(r.id, 'revisado')}
                      className="text-[12px] text-foreground underline disabled:opacity-50"
                    >
                      Marcar revisado
                    </button>
                    <button
                      disabled={accionandoId === r.id}
                      onClick={() => resolver(r.id, 'resuelto')}
                      className="text-[12px] text-foreground underline disabled:opacity-50"
                    >
                      Marcar resuelto
                    </button>
                  </div>
                )}
                {r.estado === 'revisado' && (
                  <button
                    disabled={accionandoId === r.id}
                    onClick={() => resolver(r.id, 'resuelto')}
                    className="text-[12px] text-foreground underline shrink-0 disabled:opacity-50"
                  >
                    Marcar resuelto
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function TabResenas() {
  const [estado, setEstado] = useState('pendiente');
  const [resenas, setResenas] = useState<ResenaNetworkInterna[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [accionandoId, setAccionandoId] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    try { setResenas((await fetchResenasNetworkInterno(estado)).resenas); }
    catch (e) { setError(e instanceof Error ? e.message : 'Error'); }
  }, [estado]);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void cargar(); }, [cargar]);

  async function moderar(id: string, nuevoEstado: 'publicada' | 'oculta') {
    setAccionandoId(id);
    try { await moderarResenaNetworkInterno(id, nuevoEstado); await cargar(); }
    catch (e) { setError(e instanceof Error ? e.message : 'Error'); }
    setAccionandoId(null);
  }

  if (error) return <p className="text-[13.5px] text-muted-foreground">{error}</p>;

  return (
    <div className="flex flex-col gap-3">
      <select
        value={estado} onChange={e => setEstado(e.target.value)}
        className="w-fit rounded-lg border border-border bg-card px-2 py-1.5 text-[12.5px] text-foreground"
      >
        {['pendiente', 'publicada', 'oculta'].map(v => <option key={v} value={v}>{v}</option>)}
      </select>

      {!resenas ? (
        <p className="text-[13px] text-muted-foreground">Cargando…</p>
      ) : resenas.length === 0 ? (
        <p className="text-[13px] text-muted-foreground rounded-2xl border border-border bg-card px-4 py-6 text-center">
          Nada en este estado.
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          {resenas.map(r => (
            <div key={r.id} className="rounded-2xl border border-border bg-card p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-1">
                    {Array.from({ length: 5 }, (_, i) => (
                      <Star key={i} size={12} className={i < r.puntuacion ? 'text-amber-500' : 'text-muted-foreground/30'} fill="currentColor" />
                    ))}
                  </div>
                  <p className="text-[13px] font-medium text-foreground mt-1">
                    {r.perfilNombre} · reseñada por {r.estudioNombre}
                  </p>
                  <p className="text-[12px] text-muted-foreground">{cuando(r.creadoEn)}</p>
                  {r.comentario && <p className="text-[12px] text-foreground mt-1">{r.comentario}</p>}
                </div>
                {r.estado === 'pendiente' && (
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      disabled={accionandoId === r.id}
                      onClick={() => moderar(r.id, 'publicada')}
                      className="text-[12px] text-foreground underline disabled:opacity-50"
                    >
                      Publicar
                    </button>
                    <button
                      disabled={accionandoId === r.id}
                      onClick={() => moderar(r.id, 'oculta')}
                      className="text-[12px] text-destructive underline disabled:opacity-50"
                    >
                      Ocultar
                    </button>
                  </div>
                )}
                {r.estado === 'publicada' && (
                  <button
                    disabled={accionandoId === r.id}
                    onClick={() => moderar(r.id, 'oculta')}
                    className="text-[12px] text-destructive underline shrink-0 disabled:opacity-50"
                  >
                    Ocultar
                  </button>
                )}
                {r.estado === 'oculta' && (
                  <button
                    disabled={accionandoId === r.id}
                    onClick={() => moderar(r.id, 'publicada')}
                    className="text-[12px] text-foreground underline shrink-0 disabled:opacity-50"
                  >
                    Publicar
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const PESTANAS = ['Perfiles', 'Verificaciones', 'Reportes', 'Reseñas'] as const;

export default function ModeracionNetworkInterna() {
  const [pestana, setPestana] = useState<(typeof PESTANAS)[number]>('Perfiles');

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-[17px] font-bold text-foreground">Tentare Network</h1>
        <p className="text-[12.5px] text-muted-foreground">
          Moderación de perfiles, supervisión de verificaciones y reportes de la comunidad.
        </p>
      </div>

      <div className="flex items-center gap-1 border-b border-border">
        {PESTANAS.map(p => (
          <button
            key={p}
            onClick={() => setPestana(p)}
            className={`px-3 py-2 text-[13px] font-medium border-b-2 -mb-px transition-colors ${
              pestana === p ? 'border-foreground text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            {p}
          </button>
        ))}
      </div>

      {pestana === 'Perfiles' && <TabPerfiles />}
      {pestana === 'Verificaciones' && <TabVerificaciones />}
      {pestana === 'Reportes' && <TabReportes />}
      {pestana === 'Reseñas' && <TabResenas />}
    </div>
  );
}
