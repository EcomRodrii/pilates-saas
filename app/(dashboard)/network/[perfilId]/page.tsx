'use client';

import { use, useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, MapPin, Loader2, Send, Check, Flag, Heart, Star, MessageCircle } from 'lucide-react';
import { PageHeader } from '@/components/ui/page-header';
import { ProfileAvatar } from '@/components/ui/profile-avatar';
import { DashboardSheet } from '@/components/ui/dashboard-sheet';
import {
  fetchPerfilNetworkPublico, contactarPerfilNetwork, reportarPerfilNetwork,
  fetchFavoritosNetwork, toggleFavoritoNetwork,
  elegibilidadResenaNetwork, enviarResenaNetwork,
  fetchHilosMensajesNetwork,
} from '@/lib/api-client';
import { cn } from '@/lib/utils';
import {
  ESPECIALIDAD_LABEL, HORARIO_LABEL, TIPO_TRABAJO_LABEL,
  TARIFA_RANGO_LABEL, DISPONIBILIDAD_ESTADO_LABEL, tituloProfesionalDe,
} from '@/lib/network/catalogo';
import { rangoAnios } from '@/lib/network/formato';
import type { PerfilNetworkPublico, ExperienciaNetworkPublica, BadgesNetwork } from '@/lib/network/tipos';
import { ListaBadgesNetwork } from '@/components/network/lista-badges';
import { cardCls, inputCls } from '@/app/(dashboard)/configuracion/page';

export default function PerfilNetworkPage({ params }: { params: Promise<{ perfilId: string }> }) {
  const { perfilId } = use(params);
  const [perfil, setPerfil] = useState<PerfilNetworkPublico | null>(null);
  const [experiencias, setExperiencias] = useState<ExperienciaNetworkPublica[]>([]);
  const [badges, setBadges] = useState<BadgesNetwork | null>(null);
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
  // Solicitud ya aceptada con esta persona → hay un hilo de verdad, no solo
  // el flag local `enviado` (que se olvida en cuanto se recarga la
  // página: antes, volver a esta ficha después de que ella aceptara seguía
  // enseñando "Contactar" como si nada, sin ningún camino hacia la
  // conversación real).
  const [solicitudIdAceptada, setSolicitudIdAceptada] = useState<string | null>(null);

  useEffect(() => {
    let vivo = true;
    fetchPerfilNetworkPublico(perfilId).then(r => {
      if (!vivo) return;
      setPerfil(r?.perfil ?? null);
      setExperiencias(r?.experiencias ?? []);
      setBadges(r?.badges ?? null);
      setCargando(false);
    });
    fetchFavoritosNetwork().then(fs => { if (vivo) setEsFavorito(fs.some(f => f.id === perfilId)); });
    elegibilidadResenaNetwork(perfilId).then(r => {
      if (!vivo) return;
      setElegibleResena(r.elegible);
      setYaResenado(r.yaResenado);
      setFaltaClaseCompletada(r.faltaClaseCompletada);
    });
    fetchHilosMensajesNetwork().then(hilos => {
      if (!vivo) return;
      const hilo = hilos.find(h => h.perfilId === perfilId);
      if (hilo) setSolicitudIdAceptada(hilo.solicitudId);
    });
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
          <ArrowLeft size={13} /> Volver al buscador
        </Link>
        <div className={`${cardCls} p-8 text-center`}>
          <p className="text-[13px] text-muted-foreground">
            Este perfil ya no está disponible — puede que la profesional lo haya ocultado.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5 max-w-2xl">
      <Link href="/network/buscar" className="text-[12px] text-muted-foreground hover:text-foreground flex items-center gap-1">
        <ArrowLeft size={13} /> Volver al buscador
      </Link>

      <PageHeader title={perfil.nombre} description={tituloProfesionalDe(perfil.especialidades)} />

      <div className={`${cardCls} p-6`}>
        <div className="flex items-center gap-4">
          <ProfileAvatar fotoUrl={perfil.fotoUrl} nombre={perfil.nombre} size="xl" />
          <div>
            {perfil.ciudad && (
              <p className="text-[13px] text-muted-foreground flex items-center gap-1">
                <MapPin size={13} />
                {perfil.ciudad}{perfil.zona ? ` · ${perfil.zona}` : ''}
                {perfil.radioKm != null ? ` · ${perfil.radioKm} km` : ''}
              </p>
            )}
            <p className="text-[13px] font-medium text-foreground mt-1">
              {DISPONIBILIDAD_ESTADO_LABEL[perfil.disponibilidadEstado]}
            </p>
            {perfil.resumenResenas.total > 0 && (
              <p className="text-[12.5px] text-foreground flex items-center gap-1 mt-1">
                <Star size={12} className="text-amber-500" fill="currentColor" />
                {perfil.resumenResenas.promedio}
                <span className="text-muted-foreground">({perfil.resumenResenas.total} reseñas)</span>
              </p>
            )}
          </div>
        </div>
        {perfil.descripcion && (
          <p className="text-[13px] text-foreground mt-4 whitespace-pre-line">{perfil.descripcion}</p>
        )}
      </div>

      {badges && Object.values(badges).some(Boolean) && (
        <div className={`${cardCls} p-6`}>
          <h3 className="text-[14px] font-semibold text-foreground mb-2">Verificaciones</h3>
          <ListaBadgesNetwork badges={badges} />
        </div>
      )}

      {perfil.especialidades.length > 0 && (
        <div className={`${cardCls} p-6`}>
          <h3 className="text-[14px] font-semibold text-foreground mb-2">Especialidades</h3>
          <p className="text-[13px] text-foreground">
            {perfil.especialidades.map(e => ESPECIALIDAD_LABEL[e]).join(' · ')}
          </p>
        </div>
      )}

      <div className="grid grid-cols-2 gap-4">
        {perfil.aniosExperiencia != null && (
          <div className={`${cardCls} p-6`}>
            <h3 className="text-[14px] font-semibold text-foreground mb-1">Experiencia</h3>
            <p className="text-[13px] text-foreground">{perfil.aniosExperiencia} años</p>
          </div>
        )}
        {experiencias.length > 0 && (
          <div className={`${cardCls} p-6`}>
            <h3 className="text-[14px] font-semibold text-foreground mb-1">Experiencia en estudios</h3>
            <p className="text-[13px] text-foreground">
              {new Set(experiencias.map(e => e.studioId ?? e.nombreEstudio)).size} estudios
            </p>
          </div>
        )}
        {perfil.tarifaRango && (
          <div className={`${cardCls} p-6`}>
            <h3 className="text-[14px] font-semibold text-foreground mb-1">Tarifa orientativa</h3>
            <p className="text-[13px] text-foreground">{TARIFA_RANGO_LABEL[perfil.tarifaRango]}</p>
          </div>
        )}
      </div>

      {(perfil.disponibilidadHorarios.length > 0 || perfil.tipoTrabajo.length > 0) && (
        <div className={`${cardCls} p-6 space-y-3`}>
          <h3 className="text-[14px] font-semibold text-foreground">Disponibilidad</h3>
          {perfil.disponibilidadHorarios.length > 0 && (
            <p className="text-[13px] text-foreground">
              {perfil.disponibilidadHorarios.map(h => HORARIO_LABEL[h]).join(' · ')}
            </p>
          )}
          {perfil.tipoTrabajo.length > 0 && (
            <p className="text-[12px] text-muted-foreground">
              {perfil.tipoTrabajo.map(t => TIPO_TRABAJO_LABEL[t]).join(' · ')}
            </p>
          )}
        </div>
      )}

      {experiencias.length > 0 && (
        <div className={`${cardCls} p-6 space-y-4`}>
          <h3 className="text-[14px] font-semibold text-foreground">Experiencia</h3>
          {experiencias.map(exp => (
            <div key={exp.id} className="border-t border-border first:border-t-0 first:pt-0 pt-4">
              <p className="text-[13px] font-medium text-foreground">{exp.nombreEstudio}</p>
              <p className="text-[12px] text-muted-foreground">{rangoAnios(exp.fechaInicio, exp.fechaFin)}</p>
              {exp.especialidades.length > 0 && (
                <p className="text-[12px] text-foreground mt-1">
                  {exp.especialidades.map(e => ESPECIALIDAD_LABEL[e]).join(' · ')}
                </p>
              )}
              {exp.descripcion && <p className="text-[12px] text-muted-foreground mt-1">{exp.descripcion}</p>}
            </div>
          ))}
        </div>
      )}

      <div className="flex items-center gap-2">
        {solicitudIdAceptada ? (
          <Link
            href={`/network/mensajes?hilo=${solicitudIdAceptada}`}
            className="px-4 py-2 rounded-lg bg-brand text-brand-foreground text-[12px] font-medium flex items-center gap-1.5 hover:brightness-95 transition-colors"
          >
            <MessageCircle size={13} /> Enviar mensaje
          </Link>
        ) : enviado ? (
          <p className="text-[12px] text-success flex items-center gap-1.5">
            <Check size={13} /> Solicitud enviada. Te avisaremos si {perfil.nombre.split(' ')[0]} la acepta.
          </p>
        ) : (
          <button
            onClick={() => setModalAbierto(true)}
            className="px-4 py-2 rounded-lg bg-brand text-brand-foreground text-[12px] font-medium flex items-center gap-1.5 hover:brightness-95 transition-colors"
          >
            <Send size={13} /> Contactar
          </button>
        )}
        <button
          onClick={alternarFavorito}
          disabled={cambiandoFavorito}
          aria-pressed={esFavorito}
          title={esFavorito ? 'Quitar de favoritas' : 'Guardar en favoritas'}
          className="px-3 py-2 rounded-lg border border-border bg-card hover:bg-muted transition-colors disabled:opacity-60"
        >
          <Heart size={15} className={cn(esFavorito ? 'text-destructive' : 'text-muted-foreground')} fill={esFavorito ? 'currentColor' : 'none'} />
        </button>
      </div>

      <DashboardSheet open={modalAbierto} onClose={() => setModalAbierto(false)} label={`Contactar a ${perfil.nombre}`}>
        <div className="p-5 space-y-3">
          <h3 className="text-[14px] font-semibold text-foreground">Contactar a {perfil.nombre}</h3>
          <p className="text-[12px] text-muted-foreground">
            No verá tu email ni teléfono hasta que aceptes revelarlos — esto solo le llega tu mensaje y el nombre de tu estudio.
          </p>
          <textarea
            className={`${inputCls} min-h-24 resize-y`}
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

      {(elegibleResena || yaResenado || faltaClaseCompletada) && (
        <div className={`${cardCls} p-5`}>
          {yaResenado ? (
            <p className="text-[12.5px] text-muted-foreground flex items-center gap-1.5">
              <Check size={13} className="text-success" /> Ya has dejado una reseña sobre {perfil.nombre.split(' ')[0]}.
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
                <Star size={13} /> Dejar una reseña
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
            className={`${inputCls} min-h-24 resize-y`}
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
            className={inputCls}
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
            className={`${inputCls} min-h-20 resize-y`}
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
