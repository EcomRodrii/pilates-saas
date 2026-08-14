'use client';

// Moderación de Tentare Network — docs/NETWORK-IMPLEMENTATION-PLAN.md §10.
// Colas independientes (perfiles / identidad / verificaciones de
// experiencia / reportes / reseñas), cada una con su propia carga — mismo
// criterio que el resto de /interno: no hay un modelo compartido, cada
// pestaña pide lo suyo.
//
// "Identidad" (Fase 3 del rediseño 2026-08) es la única pestaña que
// resuelve documentos reales (DNI/certificaciones) — a diferencia de
// "Verificaciones" (experiencia laboral, solo lectura: resuelve el
// estudio), aquí SÍ aprueba/rechaza el equipo de Tentare, con motivo
// obligatorio al rechazar y el documento solo visible con una URL firmada
// de corta caducidad pedida bajo demanda.

import { useCallback, useEffect, useRef, useState } from 'react';
import { Star, FileText, Loader2 } from 'lucide-react';
import {
  fetchPerfilesNetworkInterno, cambiarEstadoPerfilNetworkInterno, destacarPerfilNetworkInterno, type PerfilNetworkInterno,
  fetchVerificacionesNetworkInterno, type VerificacionNetworkInterna,
  fetchReportesNetworkInterno, resolverReporteNetworkInterno, type ReporteNetworkInterno,
  fetchResenasNetworkInterno, moderarResenaNetworkInterno, type ResenaNetworkInterna,
  fetchAnaliticaNetworkInterno, type AnaliticaNetwork,
  fetchVerificacionesIdentidadNetworkInterno, resolverVerificacionIdentidadNetworkInterno, type VerificacionIdentidadNetworkInterna,
  fetchCertificacionesNetworkInterno, resolverCertificacionNetworkInterno, type CertificacionNetworkInterna,
  obtenerUrlDocumentoNetworkInterno,
} from '@/lib/interno/client';

const cuando = (iso: string) =>
  new Date(iso).toLocaleString('es-ES', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

const ESTADO_PERFIL_LABEL: Record<string, string> = {
  draft: 'Borrador', en_revision: 'En revisión', published: 'Publicado', hidden: 'Oculto', suspended: 'Suspendido',
};

function TabPerfiles() {
  const [perfiles, setPerfiles] = useState<PerfilNetworkInterno[] | null>(null);
  const [q, setQ] = useState('');
  const qRef = useRef('');
  // 'en_revision' por defecto, no "todos los estados" — la cola de
  // revisión es lo primero que hay que ver al entrar aquí (feedback del
  // fundador: un perfil completo ya no se publica solo).
  const [estado, setEstado] = useState('en_revision');
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
                      {p.estado === 'en_revision' && (
                        <>
                          <button
                            disabled={accionandoId === p.id}
                            onClick={() => cambiarEstado(p.id, 'published')}
                            className="text-success underline disabled:opacity-50 font-medium"
                          >
                            Aprobar
                          </button>
                          <button
                            disabled={accionandoId === p.id}
                            onClick={() => cambiarEstado(p.id, 'draft')}
                            className="text-foreground underline disabled:opacity-50"
                          >
                            Devolver a borrador
                          </button>
                        </>
                      )}
                      {p.estado !== 'suspended' && p.estado !== 'en_revision' && (
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

// "Solo equipo autorizado · los documentos no salen de esta vista" (2e del
// rediseño) — el botón pide una URL firmada de 5 min bajo demanda, nunca se
// guarda ni se muestra el path crudo.
function BotonVerDocumento({ id, tipo }: { id: string; tipo: 'identidad' | 'certificacion' }) {
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState('');
  return (
    <span>
      <button
        type="button"
        disabled={cargando}
        onClick={async () => {
          setCargando(true); setError('');
          try {
            const { url } = await obtenerUrlDocumentoNetworkInterno(id, tipo);
            window.open(url, '_blank', 'noopener,noreferrer');
          } catch (e) { setError(e instanceof Error ? e.message : 'Error'); }
          setCargando(false);
        }}
        className="inline-flex items-center gap-1 text-[12px] text-foreground underline disabled:opacity-50"
      >
        {cargando ? <Loader2 size={11} className="animate-spin" /> : <FileText size={11} />} Ver documento
      </button>
      {error && <span className="text-[11px] text-destructive ml-2">{error}</span>}
    </span>
  );
}

interface FilaResolucion {
  id: string; estado: string; motivoRechazo: string | null;
  creadoEn: string; resueltoEn: string | null;
  perfilId: string | null; perfilNombre: string; perfilSlug: string | null;
}

function ColaResolucion<T extends FilaResolucion>({
  filas, tipoDocumento, resolver, renderExtra,
}: {
  filas: T[];
  tipoDocumento: 'identidad' | 'certificacion';
  resolver: (id: string, aprobar: boolean, motivo?: string) => Promise<void>;
  renderExtra?: (f: T) => React.ReactNode;
}) {
  const [motivoAbierto, setMotivoAbierto] = useState<string | null>(null);
  const [motivo, setMotivo] = useState('');
  const [accionandoId, setAccionandoId] = useState<string | null>(null);

  async function aprobar(id: string) {
    setAccionandoId(id);
    await resolver(id, true);
    setAccionandoId(null);
  }
  async function rechazar(id: string) {
    if (!motivo.trim()) return;
    setAccionandoId(id);
    await resolver(id, false, motivo.trim());
    setAccionandoId(null);
    setMotivoAbierto(null);
    setMotivo('');
  }

  if (filas.length === 0) {
    return <p className="text-[13px] text-muted-foreground rounded-2xl border border-border bg-card px-4 py-6 text-center">Nada en este estado.</p>;
  }

  return (
    <div className="flex flex-col gap-2">
      {filas.map(f => (
        <div key={f.id} className="rounded-2xl border border-border bg-card p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[13px] font-medium text-foreground">
                {f.perfilSlug ? <a href={`/network/instructoras/${f.perfilSlug}`} target="_blank" rel="noopener noreferrer" className="hover:underline">{f.perfilNombre}</a> : f.perfilNombre}
              </p>
              {renderExtra?.(f)}
              <p className="text-[12px] text-muted-foreground mt-0.5">
                {cuando(f.creadoEn)} · <BotonVerDocumento id={f.id} tipo={tipoDocumento} />
              </p>
              {f.estado === 'rechazado' && f.motivoRechazo && (
                <p className="text-[12px] text-destructive mt-1">Rechazada: {f.motivoRechazo}</p>
              )}
            </div>
            {(f.estado === 'pendiente' || f.estado === 'en_revision') && (
              <div className="flex flex-col items-end gap-1.5 shrink-0">
                <div className="flex items-center gap-2">
                  <button
                    disabled={accionandoId === f.id}
                    onClick={() => aprobar(f.id)}
                    className="text-[12px] text-foreground underline disabled:opacity-50"
                  >
                    Aprobar
                  </button>
                  <button
                    disabled={accionandoId === f.id}
                    onClick={() => { setMotivoAbierto(motivoAbierto === f.id ? null : f.id); setMotivo(''); }}
                    className="text-[12px] text-destructive underline disabled:opacity-50"
                  >
                    Rechazar
                  </button>
                </div>
                {motivoAbierto === f.id && (
                  <div className="flex flex-col items-end gap-1.5 w-56">
                    <textarea
                      value={motivo}
                      onChange={e => setMotivo(e.target.value)}
                      placeholder="Motivo del rechazo (obligatorio) — la instructora podrá volver a subirlo"
                      rows={2}
                      className="w-full rounded-lg border border-border bg-background px-2 py-1.5 text-[12px] text-foreground"
                    />
                    <button
                      disabled={!motivo.trim() || accionandoId === f.id}
                      onClick={() => rechazar(f.id)}
                      className="text-[11.5px] font-medium text-destructive underline disabled:opacity-40"
                    >
                      Confirmar rechazo
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

function TabIdentidad() {
  const [sub, setSub] = useState<'identidad' | 'certificacion'>('identidad');
  const [estado, setEstado] = useState('pendiente');
  const [verificaciones, setVerificaciones] = useState<VerificacionIdentidadNetworkInterna[] | null>(null);
  const [certificaciones, setCertificaciones] = useState<CertificacionNetworkInterna[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    try {
      if (sub === 'identidad') setVerificaciones((await fetchVerificacionesIdentidadNetworkInterno(estado)).verificaciones);
      else setCertificaciones((await fetchCertificacionesNetworkInterno(estado)).certificaciones);
    } catch (e) { setError(e instanceof Error ? e.message : 'Error'); }
  }, [sub, estado]);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void cargar(); }, [cargar]);

  if (error) return <p className="text-[13.5px] text-muted-foreground">{error}</p>;

  return (
    <div className="flex flex-col gap-3">
      <p className="text-[12px] text-muted-foreground">
        Solo equipo autorizado · los documentos no salen de esta vista.
      </p>
      <div className="flex items-center gap-2 flex-wrap">
        <div className="flex items-center gap-1 rounded-lg border border-border bg-card p-0.5">
          {(['identidad', 'certificacion'] as const).map(v => (
            <button
              key={v}
              onClick={() => setSub(v)}
              className={`px-2.5 py-1 rounded-md text-[12px] font-medium transition-colors ${sub === v ? 'bg-foreground text-background' : 'text-muted-foreground'}`}
            >
              {v === 'identidad' ? 'Identidad' : 'Certificaciones'}
            </button>
          ))}
        </div>
        <select
          value={estado} onChange={e => setEstado(e.target.value)}
          className="rounded-lg border border-border bg-card px-2 py-1.5 text-[12.5px] text-foreground"
        >
          {['pendiente', 'verificado', 'rechazado'].map(v => <option key={v} value={v}>{v}</option>)}
        </select>
      </div>

      {sub === 'identidad' ? (
        !verificaciones ? <p className="text-[13px] text-muted-foreground">Cargando…</p> : (
          <ColaResolucion
            filas={verificaciones}
            tipoDocumento="identidad"
            resolver={async (id, aprobar, motivo) => { await resolverVerificacionIdentidadNetworkInterno(id, aprobar, motivo); await cargar(); }}
          />
        )
      ) : (
        !certificaciones ? <p className="text-[13px] text-muted-foreground">Cargando…</p> : (
          <ColaResolucion
            filas={certificaciones}
            tipoDocumento="certificacion"
            resolver={async (id, aprobar, motivo) => { await resolverCertificacionNetworkInterno(id, aprobar, motivo); await cargar(); }}
            renderExtra={f => <p className="text-[12px] text-muted-foreground">{f.nombre} · {f.institucion}{f.anio ? ` · ${f.anio}` : ''}</p>}
          />
        )
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

// Misma tarjeta que app/interno/page.tsx (no exportada desde ahí, es un
// componente de página) — mismo principio: ningún número sin procedencia.
function Tarjeta({ titulo, valor, pie }: { titulo: string; valor: string; pie?: string }) {
  return (
    <div className="rounded-2xl border border-border bg-card px-3.5 py-3 sm:px-4 sm:py-3.5">
      <p className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">{titulo}</p>
      <p className="mt-1 text-[22px] sm:text-[26px] font-bold tabular-nums leading-none text-foreground">{valor}</p>
      {pie && <p className="mt-1.5 text-[11.5px] text-muted-foreground leading-snug">{pie}</p>}
    </div>
  );
}

function TabAnalitica() {
  const [a, setA] = useState<AnaliticaNetwork | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchAnaliticaNetworkInterno().then(setA).catch((e: unknown) => setError(e instanceof Error ? e.message : 'Error'));
  }, []);

  if (error) return <p className="text-[13.5px] text-muted-foreground">{error}</p>;
  if (!a) return <p className="text-[13px] text-muted-foreground">Cargando…</p>;

  const maxAltas = Math.max(1, ...a.altasPorMes.map(m => m.altas));

  return (
    <div className="flex flex-col gap-6">
      <section>
        <h2 className="text-[12px] font-bold uppercase tracking-wide text-muted-foreground mb-2.5">Perfiles</h2>
        <div className="grid grid-cols-2 gap-2.5 sm:gap-3 lg:grid-cols-4">
          <Tarjeta
            titulo="Publicados" valor={String(a.perfiles.publicados)}
            pie={`${a.perfiles.total} en total · ${a.perfiles.borradores} en borrador · ${a.perfiles.suspendidos} suspendidos.`} />
          <Tarjeta titulo="Altas (30 días)" valor={String(a.perfiles.altasUltimos30d)} />
          <Tarjeta
            titulo="Activos (30 días)" valor={String(a.perfiles.activosUltimos30d)}
            pie="Con acceso registrado en los últimos 30 días." />
          <Tarjeta titulo="Ocultos" valor={String(a.perfiles.ocultos)} pie="Ocultados por su propia dueña." />
        </div>
      </section>

      <section>
        <h2 className="text-[12px] font-bold uppercase tracking-wide text-muted-foreground mb-2.5">Solicitudes de contacto</h2>
        <div className="grid grid-cols-2 gap-2.5 sm:gap-3 lg:grid-cols-4">
          <Tarjeta titulo="Total" valor={String(a.solicitudes.total)} />
          <Tarjeta titulo="Pendientes" valor={String(a.solicitudes.pendientes)} />
          <Tarjeta
            titulo="Tasa de aceptación"
            valor={a.solicitudes.tasaAceptacion != null ? `${a.solicitudes.tasaAceptacion}%` : '—'}
            pie={a.solicitudes.tasaAceptacion != null
              ? `${a.solicitudes.aceptadas} aceptadas de ${a.solicitudes.aceptadas + a.solicitudes.rechazadas} resueltas.`
              : 'Todavía no hay ninguna solicitud resuelta.'} />
          <Tarjeta titulo="Rechazadas" valor={String(a.solicitudes.rechazadas)} />
        </div>
      </section>

      <section>
        <h2 className="text-[12px] font-bold uppercase tracking-wide text-muted-foreground mb-2.5">Reseñas</h2>
        <div className="grid grid-cols-2 gap-2.5 sm:gap-3 lg:grid-cols-4">
          <Tarjeta
            titulo="Promedio general"
            valor={a.resenas.promedioGeneral != null ? `${a.resenas.promedioGeneral} ★` : '—'}
            pie={a.resenas.promedioGeneral != null ? `Sobre ${a.resenas.publicadas} reseña(s) publicada(s).` : 'Sin reseñas publicadas todavía.'} />
          <Tarjeta titulo="Pendientes de moderar" valor={String(a.resenas.pendientes)} />
          <Tarjeta titulo="Total" valor={String(a.resenas.total)} />
        </div>
      </section>

      <section>
        <h2 className="text-[12px] font-bold uppercase tracking-wide text-muted-foreground mb-2.5">Altas de perfil por mes</h2>
        <div className="rounded-2xl border border-border bg-card p-4">
          {a.altasPorMes.length === 0 ? (
            <p className="text-[13px] text-muted-foreground">Todavía no hay altas que dibujar.</p>
          ) : (
            <div className="flex items-end gap-2 h-32">
              {a.altasPorMes.map(m => (
                <div key={m.mes} className="flex-1 h-full flex flex-col items-center gap-1.5 min-w-0">
                  <span className="text-[11px] font-semibold tabular-nums text-muted-foreground">{m.altas}</span>
                  <div className="w-full flex-1 flex items-end">
                    <div className="w-full rounded-t bg-brand/80" style={{ height: `${(m.altas / maxAltas) * 100}%` }} />
                  </div>
                  <span className="text-[10.5px] text-muted-foreground truncate w-full text-center">{m.mes}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      <section className="rounded-2xl border border-border bg-muted/30 px-4 py-3.5">
        <p className="text-[12.5px] font-bold text-foreground">Lo que aquí no se puede saber (todavía)</p>
        <ul className="mt-1.5 text-[12.5px] text-muted-foreground leading-relaxed list-disc pl-4">
          <li><strong>Conversión perfil→contratación:</strong> una solicitud aceptada no implica que el estudio haya llegado a contratar a la profesional, solo que se reveló el contacto.</li>
          <li><strong>Uso de mensajería y &quot;cerca de mí&quot;:</strong> no se guarda un evento por cada mensaje enviado ni por cada búsqueda con geolocalización.</li>
        </ul>
      </section>
    </div>
  );
}

const PESTANAS = ['Perfiles', 'Identidad', 'Verificaciones', 'Reportes', 'Reseñas', 'Analítica'] as const;

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
      {pestana === 'Identidad' && <TabIdentidad />}
      {pestana === 'Verificaciones' && <TabVerificaciones />}
      {pestana === 'Reportes' && <TabReportes />}
      {pestana === 'Reseñas' && <TabResenas />}
      {pestana === 'Analítica' && <TabAnalitica />}
    </div>
  );
}
