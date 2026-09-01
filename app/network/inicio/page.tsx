'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  Loader2, Mail, Heart, ClipboardList, Zap, Sparkles, ShieldCheck,
  CircleUserRound, ArrowRight, Check,
} from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { fetchSolicitudesContactoNetwork, fetchVacantesPublicadasNetwork, type SolicitudContactoRecibida } from '@/lib/api-client';
import { usePerfilNetwork } from '@/lib/network/perfil-network-context';
import { calcularCompletitudPerfil } from '@/lib/network/completitud';
import { encajeCandidaturaDe } from '@/lib/network/encaje-candidatura';
import { ESPECIALIDAD_LABEL, DISPONIBILIDAD_ESTADO_LABEL } from '@/lib/network/catalogo';
import { selloTemporal } from '@/lib/avisos-portal';
import { TarjetaVacanteHorizontal } from '@/components/network-v2/TarjetaVacanteHorizontal';
import {
  NW_TINTA, NW_MUTED, NW_MUTED_2, NW_BORDE, NW_SAND, NW_PRODUCTO, NW_VERDE_OSCURO, NW_ESTADO,
} from '@/components/network-v2/tokens';
import type { VacanteNetwork } from '@/lib/network/tipos';

// Home del autoservicio de instructora — rediseño 2026-09 (Fase 1 del
// mockup del fundador "EL DISEÑO DEBE SER ASI"). Mismo principio de siempre
// (comentario original de esta pantalla, ahora heredado): solo se pinta lo
// que tiene una tabla real detrás. Confirmado con el fundador antes de
// programar (4 preguntas de producto, 2026-08-31):
// - "Visitas a tu perfil" queda FUERA — no existe tracking de vistas
//   todavía; construirlo es una fase aparte, no parte de "shell + Inicio".
// - "Oportunidades para ti" sin ningún encaje real: estado vacío con
//   enlace a Oportunidades, nunca se omite la sección ni se fabrica una
//   vacante.
// - Los badges de la barra de pestañas cuentan SOLO lo relevante para
//   ella (mismo criterio que aquí), no el total de la red.
// - Perfil al 100%: el hero cambia de mensaje y pierde el checklist, no
//   desaparece entero (sigue siendo el sitio para "ver mi perfil público").
const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
const MESES = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
];

function fechaHoyLarga(): string {
  const d = new Date();
  return `${DIAS[d.getDay()]}, ${d.getDate()} de ${MESES[d.getMonth()]}`.toUpperCase();
}

interface ItemChecklist { label: string; minutos: number; hecho: boolean }

export default function InicioNetworkPage() {
  const { user } = useAuth();
  const {
    perfil, loading, tieneExperiencia, estudiosQueTeGuardaron,
    solicitudesPendientesCount, candidaturasActivasCount, actualizarDisponibilidad,
  } = usePerfilNetwork();

  const [solicitudes, setSolicitudes] = useState<SolicitudContactoRecibida[] | null>(null);
  const [vacantes, setVacantes] = useState<VacanteNetwork[] | null>(null);
  const [activandoSustituciones, setActivandoSustituciones] = useState(false);

  useEffect(() => {
    if (!perfil) return;
    let vivo = true;
    fetchSolicitudesContactoNetwork().then(s => { if (vivo) setSolicitudes(s); });
    fetchVacantesPublicadasNetwork(perfil.ciudad ? { ciudad: perfil.ciudad } : {}).then(v => { if (vivo) setVacantes(v); });
    return () => { vivo = false; };
  }, [perfil?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 size={20} className="animate-spin" style={{ color: NW_MUTED }} />
      </div>
    );
  }

  if (!perfil) {
    return (
      <div className="max-w-2xl mx-auto text-center py-16">
        <p className="text-[13px] mb-4" style={{ color: NW_MUTED }}>Todavía no tienes un perfil en Tentare Network.</p>
        <Link href="/network/crear-perfil" className="inline-block px-5 py-2.5 rounded-full text-[13.5px] font-bold text-white" style={{ background: NW_PRODUCTO }}>
          Crear perfil
        </Link>
      </div>
    );
  }

  const nombrePila = perfil.nombre.split(' ')[0];
  const { porcentaje, detalle } = calcularCompletitudPerfil(
    {
      nombre: perfil.nombre, ciudad: perfil.ciudad, fotoUrl: perfil.fotoUrl,
      especialidades: perfil.especialidades, disponibilidadHorarios: perfil.disponibilidadHorarios,
      tarifaRango: perfil.tarifaRango, tipoTrabajo: perfil.tipoTrabajo,
    },
    tieneExperiencia,
  );
  const completo = porcentaje >= 100;

  const checklist: ItemChecklist[] = [
    { label: 'Foto y bio', minutos: 2, hecho: detalle.foto && Boolean(perfil.descripcion) },
    { label: 'Experiencia y formación', minutos: 3, hecho: detalle.experiencia },
    { label: 'Disponibilidad', minutos: 1, hecho: detalle.disponibilidad },
    { label: 'Tarifa orientativa', minutos: 1, hecho: detalle.tarifa },
  ];

  const vacantesConEncaje = (vacantes ?? [])
    .map(v => ({
      vacante: v,
      encaje: encajeCandidaturaDe(
        { especialidades: v.especialidades, horarios: v.horarios, tipoTrabajo: v.tipoTrabajo, tarifaRango: v.tarifaRango, estudioCiudad: v.estudioCiudad },
        { ciudad: perfil.ciudad, especialidades: perfil.especialidades, disponibilidadHorarios: perfil.disponibilidadHorarios, tipoTrabajo: perfil.tipoTrabajo, tarifaRango: perfil.tarifaRango },
      ),
    }))
    .filter(x => x.encaje.barra > 0)
    .sort((a, b) => b.encaje.barra - a.encaje.barra)
    .slice(0, 3);

  const vacanteMasReciente = (vacantes ?? [])
    .slice()
    .sort((a, b) => new Date(b.creadoEn).getTime() - new Date(a.creadoEn).getTime())[0] ?? null;

  // Actividad reciente — solo hechos reales de ESTA cuenta, ninguno
  // inventado. "Perfil visto por un estudio" queda fuera a propósito: no
  // hay tracking de vistas (misma decisión que la tarjeta de stats).
  const eventos: { icono: typeof Sparkles; texto: string; fecha: string }[] = [
    { icono: Sparkles, texto: 'Bienvenida a Tentare Network — cuenta creada.', fecha: perfil.creadoEn },
  ];
  if (user?.email_confirmed_at) {
    eventos.push({ icono: ShieldCheck, texto: 'Email verificado correctamente.', fecha: user.email_confirmed_at });
  }
  if (perfil.identidadVerificadaEn) {
    eventos.push({ icono: ShieldCheck, texto: 'Identidad verificada.', fecha: perfil.identidadVerificadaEn });
  }
  for (const s of (solicitudes ?? []).slice(0, 2)) {
    eventos.push({
      icono: Zap,
      texto: s.estado === 'pendiente'
        ? `${s.estudioNombre} quiere contactar contigo.`
        : `Solicitud de ${s.estudioNombre} resuelta.`,
      fecha: s.creadoEn,
    });
  }
  eventos.sort((a, b) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime());

  const especialidadesLabel = perfil.especialidades.slice(0, 2).map(e => ESPECIALIDAD_LABEL[e]).join(' · ');

  async function activarSustituciones() {
    setActivandoSustituciones(true);
    await actualizarDisponibilidad('disponible_sustituciones');
    setActivandoSustituciones(false);
  }

  return (
    <div className="max-w-5xl mx-auto">
      {/* Hero */}
      <div
        className="relative overflow-hidden rounded-[26px] px-6 py-8 sm:px-10 sm:py-10 grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-8 items-center"
        style={{ background: NW_VERDE_OSCURO }}
      >
        <div
          aria-hidden="true"
          className="absolute inset-0 bg-cover bg-center opacity-25"
          style={{ backgroundImage: 'url(/network/hero-reformer.webp)' }}
        />
        <div aria-hidden="true" className="absolute inset-0" style={{ background: 'linear-gradient(120deg, rgba(15,15,15,.94), rgba(15,15,15,.55))' }} />

        <div className="relative">
          <p className="text-[11.5px] font-bold uppercase tracking-[.14em]" style={{ color: 'rgba(255,255,255,.55)' }}>
            {fechaHoyLarga()}
          </p>
          <h1 className="mt-2 text-[30px] sm:text-[36px] font-extrabold text-white leading-tight">
            Hola, {nombrePila} 👋
          </h1>
          <p className="mt-2 text-[14.5px] max-w-[46ch]" style={{ color: 'rgba(255,255,255,.72)' }}>
            {completo
              ? 'Tu perfil está completo — así te ven los estudios que buscan justo tu perfil.'
              : 'Los estudios ya están buscando. Completa tu perfil para aparecer en sus resultados — se hace en unos minutos.'}
          </p>
          <div className="mt-6 flex flex-wrap items-center gap-3">
            {!completo && (
              <Link
                href="/network/mi-perfil"
                className="px-5 py-2.5 rounded-full text-[13.5px] font-bold transition-transform hover:scale-[1.02]"
                style={{ background: '#fff', color: NW_VERDE_OSCURO }}
              >
                Completar mi perfil
              </Link>
            )}
            {perfil.slug && (
              <Link
                href={`/network/instructoras/${perfil.slug}`}
                target="_blank"
                className="px-5 py-2.5 rounded-full text-[13.5px] font-bold text-white transition-opacity hover:opacity-80"
                style={{ border: '1px solid rgba(255,255,255,.4)' }}
              >
                Ver mi perfil público
              </Link>
            )}
          </div>
        </div>

        {!completo && (
          <div
            className="relative rounded-2xl p-4"
            style={{ background: 'rgba(255,255,255,.08)', backdropFilter: 'blur(6px)', border: '1px solid rgba(255,255,255,.14)' }}
          >
            <div className="space-y-2.5">
              {checklist.map(item => (
                <div key={item.label} className="flex items-center gap-2.5">
                  <span
                    className="w-[18px] h-[18px] rounded-full flex items-center justify-center shrink-0"
                    style={item.hecho ? { background: NW_PRODUCTO } : { border: '1px solid rgba(255,255,255,.4)' }}
                  >
                    {item.hecho && <Check size={11} color="#fff" />}
                  </span>
                  <span className="text-[13px] font-semibold flex-1" style={{ color: item.hecho ? 'rgba(255,255,255,.55)' : '#fff', textDecoration: item.hecho ? 'line-through' : 'none' }}>
                    {item.label}
                  </span>
                  <span className="text-[11px]" style={{ color: 'rgba(255,255,255,.45)' }}>{item.minutos} min</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Stats */}
      <div className="mt-6 grid grid-cols-2 sm:grid-cols-3 gap-3.5">
        <Link href="/network/solicitudes" className="rounded-2xl p-5 bg-white hover:opacity-90 transition-opacity" style={{ border: `1px solid ${NW_BORDE}` }}>
          <Mail size={16} style={{ color: NW_MUTED_2 }} className="mb-3" />
          <p className="text-[26px] font-extrabold" style={{ color: NW_TINTA }}>{solicitudesPendientesCount}</p>
          <p className="text-[12px] mt-0.5" style={{ color: NW_MUTED }}>
            {solicitudesPendientesCount === 1 ? 'solicitud de contacto' : 'solicitudes de contacto'}
            {solicitudesPendientesCount > 0 && <><br />pendientes de responder</>}
          </p>
        </Link>
        <div className="rounded-2xl p-5 bg-white" style={{ border: `1px solid ${NW_BORDE}` }}>
          <Heart size={16} style={{ color: NW_MUTED_2 }} className="mb-3" />
          <p className="text-[26px] font-extrabold" style={{ color: NW_TINTA }}>{estudiosQueTeGuardaron}</p>
          <p className="text-[12px] mt-0.5" style={{ color: NW_MUTED }}>
            {estudiosQueTeGuardaron === 1 ? 'estudio te ha guardado' : 'estudios te han guardado'}
            {estudiosQueTeGuardaron === 0 && <><br />Aparece al completar el perfil.</>}
          </p>
        </div>
        <Link href="/network/mis-candidaturas" className="rounded-2xl p-5 bg-white hover:opacity-90 transition-opacity col-span-2 sm:col-span-1" style={{ border: `1px solid ${NW_BORDE}` }}>
          <ClipboardList size={16} style={{ color: NW_MUTED_2 }} className="mb-3" />
          <p className="text-[26px] font-extrabold" style={{ color: NW_TINTA }}>{candidaturasActivasCount}</p>
          <p className="text-[12px] mt-0.5" style={{ color: NW_MUTED }}>
            {candidaturasActivasCount === 1 ? 'candidatura activa' : 'candidaturas activas'}
            {candidaturasActivasCount === 0 && <><br />Aplica a una oportunidad para empezar.</>}
          </p>
        </Link>
      </div>

      {/* Cuerpo: principal + sidebar */}
      <div className="mt-8 grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-8">
        <div className="space-y-5">
          <div className="flex items-end justify-between gap-3">
            <div>
              <h2 className="text-[16px] font-extrabold" style={{ color: NW_TINTA }}>Oportunidades para ti</h2>
              {especialidadesLabel && (
                <p className="text-[12px] mt-0.5" style={{ color: NW_MUTED_2 }}>
                  Según tu especialidad ({especialidadesLabel}){perfil.ciudad ? ` y tu zona` : ''}
                </p>
              )}
            </div>
            <Link href="/network/oportunidades" className="text-[12.5px] font-bold shrink-0" style={{ color: NW_PRODUCTO }}>
              Ver todas →
            </Link>
          </div>

          {vacantes === null ? (
            <div className="flex items-center justify-center py-10">
              <Loader2 size={16} className="animate-spin" style={{ color: NW_MUTED }} />
            </div>
          ) : vacantesConEncaje.length > 0 ? (
            <div className="space-y-2.5">
              {vacantesConEncaje.map(({ vacante }) => <TarjetaVacanteHorizontal key={vacante.id} vacante={vacante} />)}
            </div>
          ) : (
            <div className="rounded-2xl p-6 text-center" style={{ background: NW_SAND }}>
              <p className="text-[13px]" style={{ color: NW_MUTED }}>
                Aún no hay vacantes que encajen con tu perfil.
              </p>
              <Link href="/network/oportunidades" className="inline-block mt-2 text-[12.5px] font-bold" style={{ color: NW_PRODUCTO }}>
                Mira todas las oportunidades →
              </Link>
            </div>
          )}
        </div>

        <div className="space-y-4">
          {vacanteMasReciente && (
            <div className="rounded-2xl p-4" style={{ background: '#fff', border: `1px solid ${NW_BORDE}` }}>
              <div className="flex items-center gap-1.5">
                <span className="w-[7px] h-[7px] rounded-full" style={{ background: NW_PRODUCTO }} />
                <p className="text-[11px] font-bold uppercase tracking-wide" style={{ color: NW_MUTED_2 }}>Ahora en la red</p>
              </div>
              <p className="text-[13px] mt-2" style={{ color: NW_TINTA }}>
                {vacanteMasReciente.estudioNombre ?? 'Un estudio'}
                {vacanteMasReciente.estudioCiudad ? ` de ${vacanteMasReciente.estudioCiudad}` : ''} publicó una vacante
                <span style={{ color: NW_MUTED_2 }}> · {selloTemporal(vacanteMasReciente.creadoEn)}</span>
              </p>
            </div>
          )}

          {perfil.disponibilidadEstado !== 'disponible_sustituciones' && (
            <div className="rounded-2xl p-5" style={{ background: NW_VERDE_OSCURO }}>
              <p className="text-[10.5px] font-bold uppercase tracking-wide" style={{ color: 'rgba(255,255,255,.5)' }}>
                Dónde más se contacta
              </p>
              <p className="mt-2 text-[15px] font-extrabold text-white leading-snug">
                Las sustituciones son la puerta de entrada.
              </p>
              <p className="mt-1.5 text-[12.5px]" style={{ color: 'rgba(255,255,255,.65)' }}>
                Actívate y los estudios te encontrarán cuando les falle alguien.
              </p>
              <button
                type="button"
                onClick={activarSustituciones}
                disabled={activandoSustituciones}
                className="mt-3 inline-flex items-center gap-1 text-[13px] font-bold disabled:opacity-60"
                style={{ color: '#fff' }}
              >
                {activandoSustituciones ? 'Activando…' : 'Activar ahora'} <ArrowRight size={13} />
              </button>
            </div>
          )}

          <div className="rounded-2xl p-4" style={{ background: '#fff', border: `1px solid ${NW_BORDE}` }}>
            <p className="text-[11px] font-bold uppercase tracking-wide mb-3" style={{ color: NW_MUTED_2 }}>Actividad reciente</p>
            <div className="space-y-3">
              {eventos.slice(0, 4).map((e, i) => (
                <div key={i} className="flex items-start gap-2.5">
                  <e.icono size={14} className="mt-0.5 shrink-0" style={{ color: NW_PRODUCTO }} />
                  <div className="min-w-0">
                    <p className="text-[12.5px] leading-snug" style={{ color: NW_TINTA }}>{e.texto}</p>
                    <p className="text-[11px] mt-0.5" style={{ color: NW_MUTED_2 }}>{selloTemporal(e.fecha)}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <Link
            href={perfil.slug ? `/network/instructoras/${perfil.slug}` : '/network/mi-perfil'}
            target={perfil.slug ? '_blank' : undefined}
            className="block rounded-2xl p-4 transition-opacity hover:opacity-90"
            style={{ background: NW_VERDE_OSCURO }}
          >
            <div className="flex items-center gap-3">
              {perfil.fotoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element -- avatar pequeño, foto subida por la instructora
                <img src={perfil.fotoUrl} alt={perfil.nombre} className="w-10 h-10 rounded-full object-cover shrink-0" />
              ) : (
                <CircleUserRound size={40} style={{ color: 'rgba(255,255,255,.5)' }} className="shrink-0" />
              )}
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className="text-[13.5px] font-bold text-white truncate">{perfil.nombre}</p>
                  <span
                    className="shrink-0 px-2 py-0.5 rounded-full text-[10px] font-bold"
                    style={perfil.estado === 'published' ? { background: NW_ESTADO.verificada.fondo, color: NW_ESTADO.verificada.color } : { background: 'rgba(255,255,255,.14)', color: 'rgba(255,255,255,.7)' }}
                  >
                    {perfil.estado === 'published' ? 'Publicado' : perfil.estado === 'en_revision' ? 'En revisión' : 'Borrador'}
                  </span>
                </div>
                <p className="text-[12px] truncate" style={{ color: 'rgba(255,255,255,.6)' }}>
                  {especialidadesLabel || DISPONIBILIDAD_ESTADO_LABEL[perfil.disponibilidadEstado]}{perfil.ciudad ? ` · ${perfil.ciudad}` : ''}
                </p>
              </div>
            </div>
            <p className="mt-3 text-[12.5px] font-bold text-white flex items-center gap-1">
              Ver como te ven los estudios <ArrowRight size={12} />
            </p>
          </Link>
        </div>
      </div>
    </div>
  );
}
