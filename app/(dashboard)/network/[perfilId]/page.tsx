'use client';

// Rediseño 2026-08-25 (P2 de la auditoría UX de Network): esta ficha era una
// pila de 8-10 cajas idénticas (`cardCls p-6`, un <h3> de 14px + una línea de
// texto cada una) para el mismo dato que app/network/instructoras/[slug]/
// page.tsx ya enseña con foto grande, fila de stats jerarquizada y secciones
// reales — es la pantalla donde la propietaria decide si contacta a una
// candidata, y tenía la peor calidad visual de todo Network. Mismo dato
// (PerfilNetworkPublico/experiencias/certificaciones/resenas/mediaFotos/
// estudiosActuales — antes se pedían pero fetchPerfilNetworkPublico los
// descartaba, ver lib/api-client.ts), toda la interacción (contactar,
// favorito, reseñar, reportar, hilo de mensajes) intacta — esto es un
// rediseño visual, no una reescritura de lógica.
//
// A diferencia del perfil público, esto vive DENTRO de (dashboard) — el
// contenedor puede llevar `.dark` (lib/panel-theme.tsx). Por eso NO se
// importan los tokens NW_* de components/network-v2/tokens.ts (hex fijos,
// pensados para vivir SIEMPRE fuera de .dark — ver el comentario de ese
// fichero): aquí se usan los tokens del propio panel (text-foreground,
// text-brand, bg-card, border-border...), que sí resuelven bien en los dos
// temas.

import { use, useEffect, useState } from 'react';
import Link from 'next/link';
import {
  ArrowLeft, MapPin, Loader2, Send, Check, Flag, Heart, Star, MessageCircle,
  BadgeCheck, GraduationCap, Building2,
} from 'lucide-react';
import { PageHeader } from '@/components/ui/page-header';
import { DashboardSheet } from '@/components/ui/dashboard-sheet';
import { HiloMensajes } from '@/components/network/hilo-mensajes';
import { FotoInstructora } from '@/components/network-v2/FotoInstructora';
import { ListaBadgesNetwork } from '@/components/network/lista-badges';
import {
  fetchPerfilNetworkPublico, contactarPerfilNetwork, reportarPerfilNetwork,
  fetchFavoritosNetwork, toggleFavoritoNetwork,
  elegibilidadResenaNetwork, enviarResenaNetwork,
  fetchSolicitudEnviadaNetwork,
} from '@/lib/api-client';
import { cn } from '@/lib/utils';
import {
  ESPECIALIDAD_LABEL, HORARIO_LABEL, TIPO_TRABAJO_LABEL,
  TARIFA_RANGO_LABEL, DISPONIBILIDAD_ESTADO_LABEL, tituloProfesionalDe,
} from '@/lib/network/catalogo';
import { rangoAnios } from '@/lib/network/formato';
import type {
  PerfilNetworkPublico, ExperienciaNetworkPublica, BadgesNetwork,
  ResenaNetwork, MediaNetwork, EstudioActualNetwork,
} from '@/lib/network/tipos';
import type { CertificacionNetworkPublica } from '@/lib/network/publico';

function FilaStat({ valor, etiqueta, destacado = false }: { valor: string; etiqueta: string; destacado?: boolean }) {
  return (
    <div>
      <p className={cn('font-extrabold', destacado ? 'text-[20px] text-brand' : 'text-[16px] text-foreground')}>{valor}</p>
      <p className="text-[11.5px] text-muted-foreground">{etiqueta}</p>
    </div>
  );
}

function Seccion({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section className="border-t border-border pt-5">
      <h2 className="text-[13px] font-bold uppercase tracking-wide text-muted-foreground">{titulo}</h2>
      <div className="mt-3">{children}</div>
    </section>
  );
}

export default function PerfilNetworkPage({ params }: { params: Promise<{ perfilId: string }> }) {
  const { perfilId } = use(params);
  const [perfil, setPerfil] = useState<PerfilNetworkPublico | null>(null);
  const [experiencias, setExperiencias] = useState<ExperienciaNetworkPublica[]>([]);
  const [badges, setBadges] = useState<BadgesNetwork | null>(null);
  const [certificaciones, setCertificaciones] = useState<CertificacionNetworkPublica[]>([]);
  const [resenas, setResenas] = useState<ResenaNetwork[]>([]);
  const [mediaFotos, setMediaFotos] = useState<MediaNetwork[]>([]);
  const [estudiosActuales, setEstudiosActuales] = useState<EstudioActualNetwork[]>([]);
  const [cargando, setCargando] = useState(true);
  const [modalAbierto, setModalAbierto] = useState(false);
  const [mensaje, setMensaje] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState('');
  const [enviado, setEnviado] = useState(false);
  const [modalReporteAbierto, setModalReporteAbierto] = useState(false);
  const [motivoReporte, setMotivoReporte] = useState('spam');
  const [detalleReporte, setDetalleReporte] = useState('');
  const [enviandoReporte, setEnviandoReporte] = useState(false);
  const [errorReporte, setErrorReporte] = useState('');
  const [reportado, setReportado] = useState(false);
  const [esFavorito, setEsFavorito] = useState(false);
  const [cambiandoFavorito, setCambiandoFavorito] = useState(false);
  const [elegibleResena, setElegibleResena] = useState(false);
  const [yaResenado, setYaResenado] = useState(false);
  const [faltaClaseCompletada, setFaltaClaseCompletada] = useState(false);
  const [modalResenaAbierto, setModalResenaAbierto] = useState(false);
  const [puntuacionResena, setPuntuacionResena] = useState(5);
  const [comentarioResena, setComentarioResena] = useState('');
  const [enviandoResena, setEnviandoResena] = useState(false);
  const [errorResena, setErrorResena] = useState('');
  // Solicitud ya enviada a esta persona (pendiente o aceptada) → hay un
  // hilo de verdad, no solo el flag local `enviado` (que se olvida en
  // cuanto se recarga la página: antes, volver a esta ficha después de que
  // ella aceptara seguía enseñando "Contactar" como si nada, sin ningún
  // camino hacia la conversación real). F1: también cubre 'pendiente' para
  // poder abrir el chat pre-match sin esperar a que acepte.
  const [solicitudPropia, setSolicitudPropia] = useState<{ id: string; estado: 'pendiente' | 'aceptada' | 'rechazada' } | null>(null);
  const [hiloAbierto, setHiloAbierto] = useState(false);

  useEffect(() => {
    let vivo = true;
    fetchPerfilNetworkPublico(perfilId).then(r => {
      if (!vivo) return;
      setPerfil(r?.perfil ?? null);
      setExperiencias(r?.experiencias ?? []);
      setBadges(r?.badges ?? null);
      setCertificaciones(r?.certificaciones ?? []);
      setResenas(r?.resenas ?? []);
      setMediaFotos(r?.mediaFotos ?? []);
      setEstudiosActuales(r?.estudiosActuales ?? []);
      setCargando(false);
    });
    fetchFavoritosNetwork().then(fs => { if (vivo) setEsFavorito(fs.some(f => f.id === perfilId)); });
    elegibilidadResenaNetwork(perfilId).then(r => {
      if (!vivo) return;
      setElegibleResena(r.elegible);
      setYaResenado(r.yaResenado);
      setFaltaClaseCompletada(r.faltaClaseCompletada);
    });
    fetchSolicitudEnviadaNetwork(perfilId).then(s => { if (vivo) setSolicitudPropia(s); });
    return () => { vivo = false; };
  }, [perfilId]);

  async function alternarFavorito() {
    setCambiandoFavorito(true);
    const res = await toggleFavoritoNetwork(perfilId);
    setCambiandoFavorito(false);
    if (res.ok) setEsFavorito(res.favorito);
  }

  if (cargando) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 size={20} className="animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!perfil) {
    return (
      <div className="space-y-4 max-w-xl">
        <Link href="/network/buscar" className="text-[12px] text-muted-foreground hover:text-foreground flex items-center gap-1">
          <ArrowLeft size={14} /> Volver al buscador
        </Link>
        <div className="rounded-2xl border border-border bg-card p-8 text-center">
          <p className="text-[13px] text-muted-foreground">
            Este perfil ya no está disponible — puede que la profesional lo haya ocultado.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-3xl">
      <Link href="/network/buscar" className="text-[12px] text-muted-foreground hover:text-foreground flex items-center gap-1">
        <ArrowLeft size={14} /> Volver al buscador
      </Link>

      <PageHeader title="Perfil de Network" description="Toda la información que esta profesional comparte con estudios." />

      <div className="rounded-2xl border border-border bg-card p-6">
        <div className="flex items-start gap-5">
          <div className="w-[100px] shrink-0 sm:w-[128px]">
            <FotoInstructora fotoUrl={perfil.fotoUrl} nombre={perfil.nombre} aspectRatio="4 / 4.4" radius={16} eager />
          </div>
          <div className="min-w-0 flex-1">
            {badges?.experienciaVerificada && (
              <span className="mb-1.5 inline-flex items-center gap-1 rounded-full bg-success/10 px-2.5 py-1 text-[11px] font-bold text-success">
                <BadgeCheck size={12} /> Perfil verificado
              </span>
            )}
            <div className="flex items-start justify-between gap-2">
              <h1 className="text-[22px] font-extrabold leading-tight text-foreground truncate">{perfil.nombre}</h1>
              <button
                onClick={alternarFavorito}
                disabled={cambiandoFavorito}
                aria-pressed={esFavorito}
                title={esFavorito ? 'Quitar de favoritas' : 'Guardar en favoritas'}
                className="shrink-0 rounded-lg border border-border bg-card p-2 transition-colors hover:bg-muted disabled:opacity-60"
              >
                <Heart size={15} className={cn(esFavorito ? 'text-destructive' : 'text-muted-foreground')} fill={esFavorito ? 'currentColor' : 'none'} />
              </button>
            </div>
            <p className="mt-0.5 text-[13.5px] font-bold text-brand">{tituloProfesionalDe(perfil.especialidades)}</p>
            <div className="mt-2 flex flex-wrap items-center gap-3 text-[12.5px] text-muted-foreground">
              {perfil.resumenResenas.total > 0 && (
                <span className="flex items-center gap-1 font-semibold text-foreground">
                  <Star size={12} className="text-amber-500" fill="currentColor" />
                  {perfil.resumenResenas.promedio} ({perfil.resumenResenas.total})
                </span>
              )}
              {perfil.ciudad && (
                <span className="flex items-center gap-1">
                  <MapPin size={12} />{perfil.ciudad}{perfil.zona ? ` · ${perfil.zona}` : ''}
                </span>
              )}
            </div>

            <div className="mt-4 grid grid-cols-2 gap-3 border-t border-border pt-4 sm:grid-cols-4">
              {perfil.aniosExperiencia != null && <FilaStat valor={`${perfil.aniosExperiencia}`} etiqueta="años de experiencia" />}
              {experiencias.length > 0 && (
                <FilaStat valor={`${new Set(experiencias.map(e => e.studioId ?? e.nombreEstudio)).size}`} etiqueta="estudios" />
              )}
              <FilaStat valor={perfil.tarifaRango ? TARIFA_RANGO_LABEL[perfil.tarifaRango] : 'A consultar'} etiqueta="tarifa orientativa" destacado />
              <FilaStat valor={DISPONIBILIDAD_ESTADO_LABEL[perfil.disponibilidadEstado]} etiqueta="disponibilidad" destacado />
            </div>
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-border bg-card p-6">
        <div className="space-y-5">
          {perfil.descripcion && (
            <Seccion titulo="Sobre mí">
              <p className="whitespace-pre-line text-[14px] leading-[1.65] text-foreground">{perfil.descripcion}</p>
            </Seccion>
          )}

          {badges && Object.values(badges).some(Boolean) && (
            <div className={perfil.descripcion ? 'border-t border-border pt-5' : ''}>
              <h2 className="text-[13px] font-bold uppercase tracking-wide text-muted-foreground">Verificaciones</h2>
              <div className="mt-3"><ListaBadgesNetwork badges={badges} /></div>
            </div>
          )}

          {perfil.especialidades.length > 0 && (
            <Seccion titulo="Especialidades">
              <div className="flex flex-wrap gap-2">
                {perfil.especialidades.map(e => (
                  <span key={e} className="rounded-full bg-muted px-3 py-1.5 text-[12.5px] font-bold text-foreground">
                    {ESPECIALIDAD_LABEL[e]}
                  </span>
                ))}
              </div>
            </Seccion>
          )}

          {perfil.idiomas.length > 0 && (
            <Seccion titulo="Idiomas">
              <p className="text-[13.5px] text-foreground">{perfil.idiomas.join(', ')}</p>
            </Seccion>
          )}

          {(perfil.disponibilidadHorarios.length > 0 || perfil.tipoTrabajo.length > 0) && (
            <Seccion titulo="Disponibilidad">
              {perfil.disponibilidadHorarios.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {perfil.disponibilidadHorarios.map(h => (
                    <span key={h} className="rounded-full border border-border px-2.5 py-1 text-[12px] font-semibold text-foreground">
                      {HORARIO_LABEL[h]}
                    </span>
                  ))}
                </div>
              )}
              {perfil.tipoTrabajo.length > 0 && (
                <p className="mt-2 text-[12px] text-muted-foreground">
                  {perfil.tipoTrabajo.map(t => TIPO_TRABAJO_LABEL[t]).join(' · ')}
                </p>
              )}
            </Seccion>
          )}

          {experiencias.length > 0 && (
            <Seccion titulo="Experiencia">
              <div>
                {experiencias.map((exp, i) => (
                  <div key={exp.id} className={cn('flex gap-3 py-3', i > 0 && 'border-t border-border')}>
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-muted text-[13px] font-extrabold text-foreground">
                      {exp.nombreEstudio.charAt(0).toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <p className="text-[13.5px] font-bold text-foreground">{exp.nombreEstudio}</p>
                      <p className="text-[12px] text-muted-foreground">{rangoAnios(exp.fechaInicio, exp.fechaFin)}</p>
                      {exp.especialidades.length > 0 && (
                        <p className="mt-0.5 text-[12px] text-foreground">
                          {exp.especialidades.map(e => ESPECIALIDAD_LABEL[e]).join(' · ')}
                        </p>
                      )}
                      {exp.descripcion && <p className="mt-0.5 text-[12px] text-muted-foreground">{exp.descripcion}</p>}
                    </div>
                  </div>
                ))}
              </div>
            </Seccion>
          )}

          {estudiosActuales.length > 0 && (
            <Seccion titulo="Actualmente en">
              <div className="space-y-2.5">
                {estudiosActuales.map((e, i) => (
                  <div key={`${e.nombre}-${i}`} className="flex items-start gap-2.5">
                    <Building2 size={15} className="mt-0.5 shrink-0 text-brand" />
                    <div>
                      <p className="text-[13px] font-bold text-foreground">{e.nombre}</p>
                      {e.ciudad && <p className="text-[12px] text-muted-foreground">{e.ciudad}</p>}
                    </div>
                  </div>
                ))}
              </div>
            </Seccion>
          )}

          {certificaciones.length > 0 && (
            <Seccion titulo="Formación">
              <div className="space-y-2.5">
                {certificaciones.map((c, i) => (
                  <div key={`${c.nombre}-${i}`} className="flex items-start gap-2.5">
                    <GraduationCap size={15} className="mt-0.5 shrink-0 text-brand" />
                    <div>
                      <p className="text-[13px] font-bold text-foreground">{c.nombre}</p>
                      <p className="text-[12px] text-muted-foreground">{c.institucion}{c.anio ? ` · ${c.anio}` : ''}</p>
                    </div>
                  </div>
                ))}
              </div>
            </Seccion>
          )}

          {mediaFotos.length > 0 && (
            <Seccion titulo="Portfolio">
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                {mediaFotos.map(m => (
                  <div key={m.id} className="aspect-square overflow-hidden rounded-lg bg-muted">
                    {/* eslint-disable-next-line @next/next/no-img-element -- URL firmada de vida corta, no vale la pena que next/image la cachee */}
                    <img src={m.url} alt="" className="h-full w-full object-cover" loading="lazy" decoding="async" />
                  </div>
                ))}
              </div>
            </Seccion>
          )}

          {resenas.length > 0 && (
            <Seccion titulo={`Opiniones · ${perfil.resumenResenas.promedio ?? '—'} de ${resenas.length}`}>
              <div className="space-y-3.5">
                {resenas.map((r, i) => (
                  <div key={r.id} className={cn(i > 0 && 'border-t border-border pt-3.5')}>
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-0.5">
                        {Array.from({ length: 5 }, (_, j) => (
                          <Star key={j} size={13} className={j < r.puntuacion ? 'text-amber-500' : 'text-muted-foreground/30'} fill="currentColor" />
                        ))}
                      </div>
                      <span className="text-[11.5px] text-muted-foreground">{r.estudioNombre}</span>
                    </div>
                    {r.comentario && <p className="mt-1.5 text-[13px] leading-[1.6] text-foreground">{r.comentario}</p>}
                  </div>
                ))}
              </div>
            </Seccion>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2">
        {solicitudPropia?.estado === 'aceptada' ? (
          <Link
            href={`/network/mensajes?hilo=${solicitudPropia.id}`}
            className="px-4 py-2 rounded-lg bg-brand text-brand-foreground text-[12px] font-medium flex items-center gap-1.5 hover:brightness-95 transition-colors"
          >
            <MessageCircle size={14} /> Enviar mensaje
          </Link>
        ) : solicitudPropia?.estado === 'pendiente' ? (
          // F1: unos pocos mensajes ANTES de que acepte, para aclarar dudas
          // sin comprometerse — no sustituye el aviso de "solicitud enviada",
          // solo añade un camino a la conversación mientras se decide.
          <>
            <button
              onClick={() => setHiloAbierto(true)}
              className="px-4 py-2 rounded-lg bg-brand text-brand-foreground text-[12px] font-medium flex items-center gap-1.5 hover:brightness-95 transition-colors"
            >
              <MessageCircle size={14} /> Mensajes
            </button>
            <p className="text-[12px] text-muted-foreground">
              Solicitud pendiente de aceptar.
            </p>
          </>
        ) : enviado ? (
          <p className="text-[12px] text-success flex items-center gap-1.5">
            <Check size={14} /> Solicitud enviada. Te avisaremos si {perfil.nombre.split(' ')[0]} la acepta.
          </p>
        ) : (
          <button
            onClick={() => setModalAbierto(true)}
            className="px-4 py-2 rounded-lg bg-brand text-brand-foreground text-[12px] font-medium flex items-center gap-1.5 hover:brightness-95 transition-colors"
          >
            <Send size={14} /> Contactar
          </button>
        )}
      </div>

      <DashboardSheet open={modalAbierto} onClose={() => setModalAbierto(false)} label={`Contactar a ${perfil.nombre}`}>
        <div className="p-5 space-y-3">
          <h3 className="text-[14px] font-semibold text-foreground">Contactar a {perfil.nombre}</h3>
          <p className="text-[12px] text-muted-foreground">
            No verá tu email ni teléfono hasta que aceptes revelarlos — esto solo le llega tu mensaje y el nombre de tu estudio.
          </p>
          <textarea
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-[13px] text-foreground min-h-24 resize-y outline-none focus:border-brand"
            value={mensaje} onChange={e => setMensaje(e.target.value)}
            placeholder="Cuéntale por qué la contactas y qué estás buscando."
          />
          {error && <p className="text-[11px] text-destructive">{error}</p>}
          <div className="flex items-center gap-2">
            <button
              onClick={async () => {
                setError(''); setEnviando(true);
                const res = await contactarPerfilNetwork(perfilId, mensaje);
                setEnviando(false);
                if (!res.ok) { setError(res.error ?? 'No se ha podido enviar.'); return; }
                setModalAbierto(false);
                setEnviado(true);
                setSolicitudPropia({ id: res.solicitudId, estado: 'pendiente' });
              }}
              disabled={enviando}
              className="px-3.5 py-2 rounded-lg bg-brand text-brand-foreground text-[12px] font-medium disabled:opacity-60"
            >
              {enviando ? 'Enviando…' : 'Enviar solicitud'}
            </button>
            <button
              onClick={() => setModalAbierto(false)}
              className="px-3.5 py-2 rounded-lg bg-card border border-border text-[12px] text-foreground"
            >
              Cancelar
            </button>
          </div>
        </div>
      </DashboardSheet>

      {solicitudPropia?.estado === 'pendiente' && (
        <DashboardSheet
          open={hiloAbierto}
          onClose={() => setHiloAbierto(false)}
          label={`Mensajes con ${perfil.nombre}`}
          sheetClassName="bg-card rounded-2xl w-full max-w-md shadow-2xl flex flex-col overflow-hidden"
        >
          <div className="flex items-center gap-2.5 px-4 py-3 border-b border-border">
            <div className="h-8 w-8 shrink-0 overflow-hidden rounded-full">
              <FotoInstructora fotoUrl={perfil.fotoUrl} nombre={perfil.nombre} aspectRatio="1 / 1" radius={999} />
            </div>
            <p className="text-[13px] font-semibold text-foreground">{perfil.nombre}</p>
          </div>
          <HiloMensajes solicitudId={solicitudPropia.id} />
        </DashboardSheet>
      )}

      {(elegibleResena || yaResenado || faltaClaseCompletada) && (
        <div className="rounded-2xl border border-border bg-card p-5">
          {yaResenado ? (
            <p className="text-[12.5px] text-muted-foreground flex items-center gap-1.5">
              <Check size={14} className="text-success" /> Ya has dejado una reseña sobre {perfil.nombre.split(' ')[0]}.
            </p>
          ) : faltaClaseCompletada ? (
            // Aceptó el contacto, pero todavía no ha impartido ninguna clase
            // para este estudio — causa distinta de "aún no aceptasteis
            // contacto" (ese caso ni siquiera pinta esta tarjeta).
            <p className="text-[12.5px] text-muted-foreground">
              Podrás reseñar a {perfil.nombre.split(' ')[0]} en cuanto haya impartido al menos una clase para tu estudio.
            </p>
          ) : (
            <>
              <h3 className="text-[13px] font-semibold text-foreground mb-1">¿Cómo fue tu experiencia?</h3>
              <p className="text-[12px] text-muted-foreground mb-3">
                Ya ha impartido clases contigo — tu reseña ayuda a otros estudios.
              </p>
              <button
                onClick={() => setModalResenaAbierto(true)}
                className="px-3.5 py-2 rounded-lg bg-card border border-border text-[12px] font-medium text-foreground flex items-center gap-1.5"
              >
                <Star size={14} /> Dejar una reseña
              </button>
            </>
          )}
        </div>
      )}

      <DashboardSheet open={modalResenaAbierto} onClose={() => setModalResenaAbierto(false)} label={`Reseñar a ${perfil.nombre}`}>
        <div className="p-5 space-y-3">
          <h3 className="text-[14px] font-semibold text-foreground">Reseñar a {perfil.nombre}</h3>
          <div className="flex items-center gap-1">
            {Array.from({ length: 5 }, (_, i) => {
              const valor = i + 1;
              return (
                <button
                  key={valor}
                  type="button"
                  onClick={() => setPuntuacionResena(valor)}
                  aria-label={`${valor} estrellas`}
                  className="p-0.5"
                >
                  <Star
                    size={22}
                    className={valor <= puntuacionResena ? 'text-amber-500' : 'text-muted-foreground/40'}
                    fill="currentColor"
                  />
                </button>
              );
            })}
          </div>
          <textarea
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-[13px] text-foreground min-h-24 resize-y outline-none focus:border-brand"
            value={comentarioResena} onChange={e => setComentarioResena(e.target.value)}
            placeholder="Cuéntanos cómo fue trabajar con ella (opcional)."
          />
          <p className="text-[11px] text-muted-foreground">
            Se publica tras una revisión rápida del equipo de Tentare.
          </p>
          {errorResena && <p className="text-[11px] text-destructive">{errorResena}</p>}
          <div className="flex items-center gap-2">
            <button
              onClick={async () => {
                setErrorResena(''); setEnviandoResena(true);
                const res = await enviarResenaNetwork(perfilId, puntuacionResena, comentarioResena || null);
                setEnviandoResena(false);
                if (!res.ok) { setErrorResena(res.error ?? 'No se ha podido enviar.'); return; }
                setModalResenaAbierto(false);
                setElegibleResena(false);
                setYaResenado(true);
              }}
              disabled={enviandoResena}
              className="px-3.5 py-2 rounded-lg bg-brand text-brand-foreground text-[12px] font-medium disabled:opacity-60"
            >
              {enviandoResena ? 'Enviando…' : 'Enviar reseña'}
            </button>
            <button
              onClick={() => setModalResenaAbierto(false)}
              className="px-3.5 py-2 rounded-lg bg-card border border-border text-[12px] text-foreground"
            >
              Cancelar
            </button>
          </div>
        </div>
      </DashboardSheet>

      {!reportado ? (
        <button
          onClick={() => setModalReporteAbierto(true)}
          className="text-[11px] text-muted-foreground hover:text-destructive flex items-center gap-1"
        >
          <Flag size={11} /> Reportar este perfil
        </button>
      ) : (
        <p className="text-[11px] text-muted-foreground">Gracias, hemos recibido tu reporte.</p>
      )}

      <DashboardSheet open={modalReporteAbierto} onClose={() => setModalReporteAbierto(false)} label={`Reportar a ${perfil.nombre}`}>
        <div className="p-5 space-y-3">
          <h3 className="text-[14px] font-semibold text-foreground">Reportar este perfil</h3>
          <select
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-[13px] text-foreground outline-none focus:border-brand"
            value={motivoReporte}
            onChange={e => setMotivoReporte(e.target.value)}
          >
            <option value="informacion_falsa">Información falsa</option>
            <option value="suplantacion">Suplantación</option>
            <option value="spam">Spam</option>
            <option value="comportamiento">Comportamiento inapropiado</option>
            <option value="fraude">Fraude</option>
            <option value="otro">Otro</option>
          </select>
          <textarea
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-[13px] text-foreground min-h-20 resize-y outline-none focus:border-brand"
            value={detalleReporte} onChange={e => setDetalleReporte(e.target.value)}
            placeholder="Cuéntanos qué has visto (opcional)."
          />
          {errorReporte && <p className="text-[11px] text-destructive">{errorReporte}</p>}
          <div className="flex items-center gap-2">
            <button
              onClick={async () => {
                setErrorReporte(''); setEnviandoReporte(true);
                const res = await reportarPerfilNetwork(perfilId, motivoReporte, detalleReporte || null);
                setEnviandoReporte(false);
                if (!res.ok) { setErrorReporte(res.error ?? 'No se ha podido enviar.'); return; }
                setModalReporteAbierto(false);
                setReportado(true);
              }}
              disabled={enviandoReporte}
              className="px-3.5 py-2 rounded-lg bg-destructive text-destructive-foreground text-[12px] font-medium disabled:opacity-60"
            >
              {enviandoReporte ? 'Enviando…' : 'Enviar reporte'}
            </button>
            <button
              onClick={() => setModalReporteAbierto(false)}
              className="px-3.5 py-2 rounded-lg bg-card border border-border text-[12px] text-foreground"
            >
              Cancelar
            </button>
          </div>
        </div>
      </DashboardSheet>
    </div>
  );
}
