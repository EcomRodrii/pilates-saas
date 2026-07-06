'use client';

import { useMemo, useState } from 'react';
import { usePortalAuth } from '@/lib/portal-auth';
import { useStudio } from '@/lib/studio-context';
import { Clock, MapPin, User, CheckCircle, AlertCircle, Sparkles, X } from 'lucide-react';
import type { Sesion } from '@/lib/types';
import type { ParsedReserva } from '@/app/api/ai/parse-reserva/route';

type Tab = 'proximas' | 'mis-reservas';

const DIAS_SEMANA = ['DOMINGO', 'LUNES', 'MARTES', 'MIERCOLES', 'JUEVES', 'VIERNES', 'SABADO'] as const;

function normalizar(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
}

type ResultadoIA =
  | { tipo: 'reservada'; sesion: Sesion }
  | { tipo: 'cancelada'; sesion: Sesion }
  | { tipo: 'no_encontrada'; mensaje: string; alternativas: Sesion[] }
  | { tipo: 'error'; mensaje: string };

export default function ClasesPage() {
  const { session } = usePortalAuth();
  const { sesiones, reservas, tiposClase, salas, instructores, addReserva, cancelarReserva } = useStudio();
  const [tab, setTab] = useState<Tab>('proximas');
  const now = new Date();

  const [texto, setTexto] = useState('');
  const [procesando, setProcesando] = useState(false);
  const [resultado, setResultado] = useState<ResultadoIA | null>(null);

  const sesionesActivas = useMemo(() =>
    sesiones
      .filter(s => !s.cancelada && new Date(s.inicio) > now)
      .sort((a, b) => new Date(a.inicio).getTime() - new Date(b.inicio).getTime()),
  [sesiones]);

  const misReservas = useMemo(() =>
    reservas.filter(r => r.socioId === session?.socioId), [reservas, session?.socioId]);

  const sesionesFiltradas = useMemo(() => {
    if (tab === 'mis-reservas') {
      const ids = new Set(misReservas.filter(r => r.estado === 'CONFIRMADA' || r.estado === 'LISTA_ESPERA').map(r => r.sesionId));
      return sesionesActivas.filter(s => ids.has(s.id));
    }
    return sesionesActivas;
  }, [tab, sesionesActivas, misReservas]);

  const groupedByDay = useMemo(() => {
    const groups: { dayKey: string; label: string; items: typeof sesionesFiltradas }[] = [];
    for (const ses of sesionesFiltradas) {
      const d = new Date(ses.inicio);
      const dayKey = d.toISOString().slice(0, 10);
      const isToday = dayKey === now.toISOString().slice(0, 10);
      const isTomorrow = dayKey === new Date(now.getTime() + 86400000).toISOString().slice(0, 10);
      const label = isToday ? 'Hoy'
        : isTomorrow ? 'Mañana'
        : d.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'short' });
      const last = groups[groups.length - 1];
      if (last?.dayKey === dayKey) last.items.push(ses);
      else groups.push({ dayKey, label: label.charAt(0).toUpperCase() + label.slice(1), items: [ses] });
    }
    return groups;
  }, [sesionesFiltradas]);

  const getMiReserva = (sesionId: string) =>
    misReservas.find(r => r.sesionId === sesionId && (r.estado === 'CONFIRMADA' || r.estado === 'LISTA_ESPERA')) ?? null;

  const getLibres = (sesionId: string, aforo: number) =>
    aforo - reservas.filter(r => r.sesionId === sesionId && r.estado === 'CONFIRMADA').length;

  const formatTime = (iso: string) =>
    new Date(iso).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });

  const nombreSesion = (ses: Sesion) => {
    const tipo = tiposClase.find(t => t.id === ses.tipoClaseId);
    const instr = instructores.find(i => i.id === ses.instructorId);
    const d = new Date(ses.inicio);
    const dia = d.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'short' });
    return `${tipo?.nombre ?? 'Clase'} el ${dia} a las ${formatTime(ses.inicio)}${instr ? ` con ${instr.nombre}` : ''}`;
  };

  // Filtra las clases activas según lo que la IA entendió del texto libre.
  // Sólo aplica los criterios que el usuario mencionó — el resto no filtra.
  function filtrarPorCriterios(candidatas: Sesion[], parsed: ParsedReserva): Sesion[] {
    return candidatas.filter(ses => {
      const d = new Date(ses.inicio);

      if (parsed.fechaRelativa === 'HOY' && d.toISOString().slice(0, 10) !== now.toISOString().slice(0, 10)) return false;
      if (parsed.fechaRelativa === 'MANANA' && d.toISOString().slice(0, 10) !== new Date(now.getTime() + 86400000).toISOString().slice(0, 10)) return false;
      if (parsed.diaSemana && DIAS_SEMANA[d.getDay()] !== parsed.diaSemana) return false;

      if (parsed.hora) {
        const [h, m] = parsed.hora.split(':').map(Number);
        if (d.getHours() !== h || d.getMinutes() !== (m ?? 0)) return false;
      }

      if (parsed.tipoClase) {
        const tipo = tiposClase.find(t => t.id === ses.tipoClaseId);
        const nombreTipo = normalizar(tipo?.nombre ?? '');
        const buscado = normalizar(parsed.tipoClase);
        if (!nombreTipo.includes(buscado) && !buscado.includes(nombreTipo)) return false;
      }

      if (parsed.instructor) {
        const instr = instructores.find(i => i.id === ses.instructorId);
        const nombreInstr = normalizar(instr?.nombre ?? '');
        const buscado = normalizar(parsed.instructor);
        if (!nombreInstr.includes(buscado)) return false;
      }

      return true;
    });
  }

  async function handleSubmitIA(e: React.FormEvent) {
    e.preventDefault();
    if (!texto.trim() || !session?.socioId) return;
    setProcesando(true);
    setResultado(null);

    try {
      const res = await fetch('/api/ai/parse-reserva', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ texto }),
      });
      const parsed = (await res.json()) as ParsedReserva & { error?: string };

      if (parsed.error || parsed.intencion === 'DESCONOCIDA') {
        setResultado({ tipo: 'error', mensaje: 'No he entendido la petición. Prueba, por ejemplo: "Resérvame reformer el martes a las 18:00".' });
        return;
      }

      if (parsed.intencion === 'CANCELAR') {
        const idsMisSesiones = new Set(misReservas.filter(r => r.estado === 'CONFIRMADA' || r.estado === 'LISTA_ESPERA').map(r => r.sesionId));
        const candidatas = sesionesActivas.filter(s => idsMisSesiones.has(s.id));
        const coincidencias = filtrarPorCriterios(candidatas, parsed);

        if (coincidencias.length === 0) {
          setResultado({ tipo: 'no_encontrada', mensaje: 'No encontré ninguna reserva tuya que coincida.', alternativas: candidatas.slice(0, 3) });
          return;
        }
        const elegida = coincidencias[0];
        const miReserva = getMiReserva(elegida.id);
        if (miReserva) cancelarReserva(miReserva.id);
        setResultado({ tipo: 'cancelada', sesion: elegida });
        return;
      }

      // RESERVAR
      const coincidencias = filtrarPorCriterios(sesionesActivas, parsed);
      const disponibles = coincidencias.filter(s => !getMiReserva(s.id));

      if (disponibles.length === 0) {
        // Sugerir alternativas relajando el criterio de hora/día para ayudar a refinar.
        const relajado = { ...parsed, hora: null, diaSemana: null, fechaRelativa: null };
        const alternativas = parsed.tipoClase || parsed.instructor
          ? filtrarPorCriterios(sesionesActivas, relajado).filter(s => !getMiReserva(s.id)).slice(0, 3)
          : [];
        setResultado({
          tipo: 'no_encontrada',
          mensaje: coincidencias.length > 0
            ? 'Ya tienes reserva en la única clase que coincide.'
            : 'No encontré ninguna clase disponible que coincida con eso.',
          alternativas,
        });
        return;
      }

      const elegida = disponibles[0];
      addReserva(elegida.id, session.socioId);
      setResultado({ tipo: 'reservada', sesion: elegida });
      setTexto('');
    } catch {
      setResultado({ tipo: 'error', mensaje: 'Hubo un problema al procesar tu petición. Inténtalo de nuevo.' });
    } finally {
      setProcesando(false);
    }
  }

  function reservarAlternativa(ses: Sesion) {
    if (!session?.socioId) return;
    addReserva(ses.id, session.socioId);
    setResultado({ tipo: 'reservada', sesion: ses });
    setTexto('');
  }

  const totalReservas = misReservas.filter(r => r.estado === 'CONFIRMADA').length;

  return (
    <div className="bg-white min-h-full">

      {/* Header */}
      <div className="px-5 pt-6 pb-6" style={{ background: 'linear-gradient(160deg, #131313 0%, #1A1A1A 55%, #8FBF12 100%)' }}>
        <h1 className="text-white text-[28px] font-extrabold tracking-tight leading-tight">Clases</h1>
        <p className="text-white/50 text-[13px] mt-0.5">{totalReservas} reservas activas</p>

        {/* Barra de reserva por lenguaje natural */}
        <form onSubmit={handleSubmitIA} className="mt-4 relative">
          <Sparkles size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#8FBF12]" />
          <input
            type="text"
            value={texto}
            onChange={e => setTexto(e.target.value)}
            placeholder="Resérvame reformer el martes a las 18:00 con Ana"
            disabled={procesando}
            className="w-full pl-10 pr-4 py-3 rounded-2xl bg-white/10 border border-white/15 text-[13px] text-white placeholder:text-white/35 outline-none focus:bg-white/15 focus:border-white/25 transition-all disabled:opacity-60"
          />
        </form>

        {/* Tabs */}
        <div className="flex gap-2 mt-5">
          {([['proximas', 'Todas las clases'], ['mis-reservas', 'Mis reservas']] as [Tab, string][]).map(([key, label]) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className="px-4 py-2 rounded-2xl text-[13px] font-bold transition-all"
              style={{
                backgroundColor: tab === key ? 'white' : 'rgba(255,255,255,0.12)',
                color: tab === key ? '#171717' : 'rgba(255,255,255,0.7)',
              }}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Resultado IA */}
      {(procesando || resultado) && (
        <div className="px-4 pt-4">
          {procesando ? (
            <div className="flex items-center gap-2 px-4 py-3 rounded-2xl bg-[#F5F5F1] text-[13px] text-[#8E8E86]">
              <div className="w-3.5 h-3.5 border-2 border-[#8FBF12]/30 border-t-[#8FBF12] rounded-full animate-spin" />
              Buscando la clase...
            </div>
          ) : resultado?.tipo === 'reservada' ? (
            <div className="flex items-start gap-2.5 px-4 py-3.5 rounded-2xl bg-[#EDF9C8]">
              <CheckCircle size={16} className="text-[#3F5200] shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <p className="text-[13px] font-bold text-[#3F5200]">¡Reservado!</p>
                <p className="text-[13px] text-[#3F5200]/80 mt-0.5">{nombreSesion(resultado.sesion)}</p>
              </div>
              <button onClick={() => setResultado(null)} className="shrink-0"><X size={15} className="text-[#3F5200]/50" /></button>
            </div>
          ) : resultado?.tipo === 'cancelada' ? (
            <div className="flex items-start gap-2.5 px-4 py-3.5 rounded-2xl bg-[#F5F5F1]">
              <CheckCircle size={16} className="text-[#3A3A32] shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <p className="text-[13px] font-bold text-[#3A3A32]">Reserva cancelada</p>
                <p className="text-[13px] text-[#8E8E86] mt-0.5">{nombreSesion(resultado.sesion)}</p>
              </div>
              <button onClick={() => setResultado(null)} className="shrink-0"><X size={15} className="text-[#8E8E86]" /></button>
            </div>
          ) : resultado?.tipo === 'no_encontrada' ? (
            <div className="px-4 py-3.5 rounded-2xl bg-amber-50">
              <div className="flex items-start gap-2.5">
                <AlertCircle size={16} className="text-amber-600 shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] font-semibold text-amber-800">{resultado.mensaje}</p>
                </div>
                <button onClick={() => setResultado(null)} className="shrink-0"><X size={15} className="text-amber-600/60" /></button>
              </div>
              {resultado.alternativas.length > 0 && (
                <div className="mt-2.5 space-y-1.5">
                  {resultado.alternativas.map(alt => (
                    <button
                      key={alt.id}
                      onClick={() => reservarAlternativa(alt)}
                      className="w-full text-left text-[12px] font-medium text-amber-900 bg-white px-3 py-2 rounded-xl border border-amber-200 hover:bg-amber-50 transition-colors"
                    >
                      {nombreSesion(alt)}
                    </button>
                  ))}
                </div>
              )}
            </div>
          ) : resultado?.tipo === 'error' ? (
            <div className="flex items-start gap-2.5 px-4 py-3.5 rounded-2xl bg-red-50">
              <AlertCircle size={16} className="text-red-500 shrink-0 mt-0.5" />
              <p className="flex-1 text-[13px] font-medium text-red-700">{resultado.mensaje}</p>
              <button onClick={() => setResultado(null)} className="shrink-0"><X size={15} className="text-red-400" /></button>
            </div>
          ) : null}
        </div>
      )}

      {/* Content */}
      <div className="px-4 pt-4 pb-4 space-y-6">
        {groupedByDay.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="w-16 h-16 rounded-3xl bg-[#EDF9C8] flex items-center justify-center mb-4">
              <Clock size={28} className="text-[#6B8E00]" />
            </div>
            <p className="font-bold text-[#171717] text-[16px]">
              {tab === 'mis-reservas' ? 'Sin reservas activas' : 'Sin clases disponibles'}
            </p>
            <p className="text-[13px] text-[#8E8E93] mt-1">
              {tab === 'mis-reservas' ? 'Reserva una clase en la pestaña anterior' : 'Próximamente habrá nuevas clases'}
            </p>
          </div>
        ) : (
          groupedByDay.map(group => (
            <div key={group.dayKey}>
              <p className="text-[13px] font-bold text-[#8E8E93] mb-3">{group.label}</p>
              <div className="space-y-3">
                {group.items.map(ses => {
                  const tipo = tiposClase.find(t => t.id === ses.tipoClaseId);
                  const sala = salas.find(s => s.id === ses.salaId);
                  const instr = instructores.find(i => i.id === ses.instructorId);
                  const libres = getLibres(ses.id, ses.aforoMaximo);
                  const miReserva = getMiReserva(ses.id);
                  const color = tipo?.color ?? '#8FBF12';

                  return (
                    <div key={ses.id} className="bg-white rounded-2xl shadow-sm overflow-hidden" style={{ boxShadow: '0 1px 8px rgba(0,0,0,0.08)' }}>
                      {/* Color stripe */}
                      <div className="h-1" style={{ backgroundColor: color }} />
                      <div className="p-4">
                        <div className="flex items-start justify-between gap-3 mb-3">
                          <div className="flex-1 min-w-0">
                            <p className="font-extrabold text-[#171717] text-[16px] leading-tight">{tipo?.nombre ?? 'Clase'}</p>
                            {instr && (
                              <div className="flex items-center gap-1 mt-1">
                                <User size={11} className="text-[#8E8E93]" />
                                <p className="text-[12px] text-[#8E8E86]">{instr.nombre}</p>
                              </div>
                            )}
                          </div>
                          {miReserva?.estado === 'CONFIRMADA' && (
                            <div className="flex items-center gap-1 bg-green-50 px-2.5 py-1 rounded-full shrink-0">
                              <CheckCircle size={11} className="text-green-600" />
                              <span className="text-[11px] font-bold text-green-700">Reservada</span>
                            </div>
                          )}
                          {miReserva?.estado === 'LISTA_ESPERA' && (
                            <div className="flex items-center gap-1 bg-amber-50 px-2.5 py-1 rounded-full shrink-0">
                              <AlertCircle size={11} className="text-amber-600" />
                              <span className="text-[11px] font-bold text-amber-700">En espera</span>
                            </div>
                          )}
                        </div>

                        <div className="flex items-center gap-4">
                          <div className="flex items-center gap-1.5">
                            <Clock size={12} className="text-[#8E8E93]" />
                            <span className="text-[13px] font-semibold text-[#3A3A32]">{formatTime(ses.inicio)} – {formatTime(ses.fin)}</span>
                          </div>
                          {sala && (
                            <div className="flex items-center gap-1">
                              <MapPin size={11} className="text-[#8E8E93]" />
                              <span className="text-[12px] text-[#8E8E86]">{sala.nombre}</span>
                            </div>
                          )}
                        </div>

                        <div className="flex items-center justify-between mt-3 pt-3 border-t border-[#F5F5F5]">
                          <p className="text-[12px] font-medium" style={{ color: libres <= 2 && libres > 0 ? '#D97706' : libres === 0 ? '#EF4444' : '#8E8E93' }}>
                            {libres > 0 ? `${libres} plaza${libres !== 1 ? 's' : ''} libre${libres !== 1 ? 's' : ''}` : 'Aforo completo'}
                          </p>
                          {miReserva?.estado === 'CONFIRMADA' ? (
                            <button
                              onClick={() => cancelarReserva(miReserva.id)}
                              className="text-[13px] font-bold text-red-500 px-4 py-1.5 rounded-xl border border-red-100 active:opacity-70"
                            >
                              Cancelar
                            </button>
                          ) : !miReserva && (
                            <button
                              onClick={() => session?.socioId && addReserva(ses.id, session.socioId)}
                              disabled={libres <= 0}
                              className="text-[13px] font-bold px-4 py-1.5 rounded-xl text-white transition-opacity active:opacity-70 disabled:opacity-40"
                              style={{ backgroundColor: libres > 0 ? color : '#C7C7CC' }}
                            >
                              {libres > 0 ? 'Reservar' : 'Lista espera'}
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
