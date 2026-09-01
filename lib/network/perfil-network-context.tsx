'use client';

// Un solo fetch de "quién soy y cuántas cosas tengo pendientes" para todo el
// shell de autoservicio de Network (app/network/layout.tsx + sus 6 páginas)
// — antes cada página repetía su propio fetchResumenInicioNetwork/
// fetchSolicitudesContactoNetwork sueltos. Mismo patrón que el resto del
// repo (`lib/*-context.tsx`), no Zustand ni un fetch duplicado en el layout.
//
// Deliberadamente NO trae las listas completas (vacantes/solicitudes/hilos)
// — eso es cosa de cada página, que sabe qué forma necesita (Inicio pinta
// tarjetas de vacante enteras, Solicitudes pinta el hilo completo). Este
// contexto solo expone lo que la CABECERA compartida necesita pintar en
// las 6 pantallas: quién es, su disponibilidad, y tres contadores.
import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { useAuth } from '@/lib/auth-context';
import {
  fetchResumenInicioNetwork, fetchSolicitudesContactoNetwork, fetchMisCandidaturasNetwork,
  fetchVacantesPublicadasNetwork, fetchHilosMensajesNetwork, fetchMisExperienciasNetwork,
  guardarPerfilNetwork,
} from '@/lib/api-client';
import { encajeCandidaturaDe } from './encaje-candidatura.ts';
import type { PerfilNetwork } from './tipos.ts';
import type { DisponibilidadEstadoNetwork } from './catalogo.ts';

const ACTIVOS = ['recibida', 'contactada', 'entrevista', 'propuesta'] as const;

interface ResumenNetwork {
  perfil: PerfilNetwork | null;
  loading: boolean;
  tieneExperiencia: boolean;
  estudiosQueTeGuardaron: number;
  solicitudesPendientesCount: number;
  candidaturasActivasCount: number;
  /** Solo vacantes con AL MENOS un criterio de encaje real cumplido — nunca el total de la red. */
  vacantesQueEncajanCount: number;
  mensajesNoLeidosCount: number;
  refetch: () => void;
  actualizarDisponibilidad: (estado: DisponibilidadEstadoNetwork) => Promise<boolean>;
}

const Ctx = createContext<ResumenNetwork | null>(null);

export function PerfilNetworkProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [perfil, setPerfil] = useState<PerfilNetwork | null>(null);
  const [loading, setLoading] = useState(true);
  const [tieneExperiencia, setTieneExperiencia] = useState(false);
  const [estudiosQueTeGuardaron, setEstudiosQueTeGuardaron] = useState(0);
  const [solicitudesPendientesCount, setSolicitudesPendientesCount] = useState(0);
  const [candidaturasActivasCount, setCandidaturasActivasCount] = useState(0);
  const [vacantesQueEncajanCount, setVacantesQueEncajanCount] = useState(0);
  const [mensajesNoLeidosCount, setMensajesNoLeidosCount] = useState(0);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- Sincroniza con la sesión de Supabase (useAuth), sistema externo; sin user no hay nada que fetchear.
    if (!user) { setLoading(false); return; }
    let vivo = true;
    setLoading(true);
    Promise.all([
      fetchResumenInicioNetwork(),
      fetchSolicitudesContactoNetwork(),
      fetchMisCandidaturasNetwork(),
      fetchMisExperienciasNetwork(),
      fetchHilosMensajesNetwork(),
    ]).then(([resumen, solicitudes, candidaturas, experiencias, hilos]) => {
      if (!vivo) return;
      setPerfil(resumen.perfil);
      setEstudiosQueTeGuardaron(resumen.estudiosQueTeGuardaron);
      setSolicitudesPendientesCount(solicitudes.filter(s => s.estado === 'pendiente').length);
      setCandidaturasActivasCount(candidaturas.filter(c => (ACTIVOS as readonly string[]).includes(c.estado)).length);
      setTieneExperiencia(experiencias.length > 0);
      setMensajesNoLeidosCount(hilos.reduce((acc, h) => acc + h.noLeidos, 0));

      // Vacantes que encajan de verdad con este perfil — mismo criterio que
      // la tarjeta "Oportunidades para ti" de Inicio, así el badge de la
      // pestaña y la tarjeta nunca cuentan cosas distintas. Sin ciudad, sin
      // filtrar por ciudad (no hay dato para excluir nada).
      if (resumen.perfil) {
        const p = resumen.perfil;
        fetchVacantesPublicadasNetwork(p.ciudad ? { ciudad: p.ciudad } : {}).then(vacantes => {
          if (!vivo) return;
          const conEncaje = vacantes.filter(v => encajeCandidaturaDe(
            { especialidades: v.especialidades, horarios: v.horarios, tipoTrabajo: v.tipoTrabajo, tarifaRango: v.tarifaRango, estudioCiudad: v.estudioCiudad },
            { ciudad: p.ciudad, especialidades: p.especialidades, disponibilidadHorarios: p.disponibilidadHorarios, tipoTrabajo: p.tipoTrabajo, tarifaRango: p.tarifaRango },
          ).barra > 0);
          setVacantesQueEncajanCount(conEncaje.length);
        });
      }
      setLoading(false);
    });
    return () => { vivo = false; };
  }, [user, version]);

  const refetch = useCallback(() => setVersion(v => v + 1), []);

  const actualizarDisponibilidad = useCallback(async (estado: DisponibilidadEstadoNetwork) => {
    const res = await guardarPerfilNetwork({ disponibilidadEstado: estado });
    if (res.ok) { setPerfil(res.perfil); return true; }
    return false;
  }, []);

  return (
    <Ctx.Provider value={{
      perfil, loading, tieneExperiencia, estudiosQueTeGuardaron, solicitudesPendientesCount,
      candidaturasActivasCount, vacantesQueEncajanCount, mensajesNoLeidosCount, refetch, actualizarDisponibilidad,
    }}
    >
      {children}
    </Ctx.Provider>
  );
}

export function usePerfilNetwork(): ResumenNetwork {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('usePerfilNetwork() solo dentro de PerfilNetworkProvider');
  return ctx;
}
