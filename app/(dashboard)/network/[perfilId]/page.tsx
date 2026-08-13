'use client';

import { use, useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, MapPin, Loader2, Send, Check, Flag, Heart } from 'lucide-react';
import { PageHeader } from '@/components/ui/page-header';
import { ProfileAvatar } from '@/components/ui/profile-avatar';
import { DashboardSheet } from '@/components/ui/dashboard-sheet';
import {
  fetchPerfilNetworkPublico, contactarPerfilNetwork, reportarPerfilNetwork,
  fetchFavoritosNetwork, toggleFavoritoNetwork,
} from '@/lib/api-client';
import { cn } from '@/lib/utils';
import {
  ESPECIALIDAD_LABEL, HORARIO_LABEL, TIPO_TRABAJO_LABEL,
  TARIFA_RANGO_LABEL, DISPONIBILIDAD_ESTADO_LABEL,
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
        <Link href="/network" className="text-[12px] text-muted-foreground hover:text-foreground flex items-center gap-1">
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
      <Link href="/network" className="text-[12px] text-muted-foreground hover:text-foreground flex items-center gap-1">
        <ArrowLeft size={13} /> Volver al buscador
      </Link>

      <PageHeader title={perfil.nombre} description="Instructora de Pilates" />

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
        {enviado ? (
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
