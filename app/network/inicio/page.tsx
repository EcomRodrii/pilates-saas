'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Loader2, ArrowRight, Mail, Heart } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import {
  fetchResumenInicioNetwork, fetchSolicitudesContactoNetwork, fetchMisExperienciasNetwork,
} from '@/lib/api-client';
import { calcularCompletitudPerfil } from '@/lib/network/completitud';
import type { PerfilNetwork } from '@/lib/network/tipos';
import { cardCls } from '@/components/network/campo-estilos';

// Home del panel de la instructora (Fase 2, "punto 15" del brief: "no solo
// Mi perfil, sino Network con un Inicio"). Solo pinta datos que YA existen
// de verdad — nada de "3 oportunidades compatibles" ni "127 vistas de
// perfil", que no tienen ninguna tabla detrás todavía (ver nota de
// tentare-arquitecto en el PR que introdujo esta pantalla). Cuando
// Oportunidades/Candidaturas existan, esta pantalla gana sus tarjetas sin
// rehacerse — es el sitio pensado para eso.
export default function InicioNetworkPage() {
  const { user, loading: cargandoSesion } = useAuth();
  const [perfil, setPerfil] = useState<PerfilNetwork | null>(null);
  const [estudiosQueTeGuardaron, setEstudiosQueTeGuardaron] = useState(0);
  const [solicitudesPendientes, setSolicitudesPendientes] = useState(0);
  const [tieneExperiencia, setTieneExperiencia] = useState(false);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    if (!user) return;
    let vivo = true;
    Promise.all([
      fetchResumenInicioNetwork(),
      fetchSolicitudesContactoNetwork(),
      fetchMisExperienciasNetwork(),
    ]).then(([resumen, solicitudes, experiencias]) => {
      if (!vivo) return;
      setPerfil(resumen.perfil);
      setEstudiosQueTeGuardaron(resumen.estudiosQueTeGuardaron);
      setSolicitudesPendientes(solicitudes.filter(s => s.estado === 'pendiente').length);
      setTieneExperiencia(experiencias.length > 0);
      setCargando(false);
    });
    return () => { vivo = false; };
  }, [user]);

  if (cargandoSesion || cargando) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 size={20} className="animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!perfil) {
    return (
      <div className={`${cardCls} p-8 text-center`}>
        <p className="text-[13px] text-muted-foreground mb-4">Todavía no tienes un perfil en Tentare Network.</p>
        <Link href="/network/crear-perfil" className="inline-block px-5 py-2.5 rounded-full text-[13.5px] font-bold text-white bg-brand">
          Crear perfil
        </Link>
      </div>
    );
  }

  const nombrePila = perfil.nombre.split(' ')[0];
  const { porcentaje } = calcularCompletitudPerfil(
    {
      nombre: perfil.nombre, ciudad: perfil.ciudad, fotoUrl: perfil.fotoUrl,
      especialidades: perfil.especialidades, disponibilidadHorarios: perfil.disponibilidadHorarios,
      tarifaRango: perfil.tarifaRango, tipoTrabajo: perfil.tipoTrabajo,
    },
    tieneExperiencia,
  );

  return (
    <div className="space-y-5">
      <h1 className="text-[22px] font-bold text-foreground">Hola, {nombrePila}</h1>

      <div className={`${cardCls} p-5`}>
        <div className="flex items-center justify-between mb-2">
          <p className="text-[13px] font-semibold text-foreground">Tu perfil está al {porcentaje}%</p>
          <Link href="/network/mi-perfil" className="text-[12px] font-medium text-brand flex items-center gap-1">
            Completar <ArrowRight size={12} />
          </Link>
        </div>
        <div className="h-1.5 rounded-full overflow-hidden bg-muted">
          <div className="h-full rounded-full bg-brand" style={{ width: `${porcentaje}%` }} />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <Link href="/network/solicitudes" className={`${cardCls} p-5 hover:border-brand/40 transition-colors`}>
          <Mail size={16} className="text-muted-foreground mb-2" />
          <p className="text-[20px] font-bold text-foreground">{solicitudesPendientes}</p>
          <p className="text-[12px] text-muted-foreground">solicitudes sin responder</p>
        </Link>
        <div className={`${cardCls} p-5`}>
          <Heart size={16} className="text-muted-foreground mb-2" />
          <p className="text-[20px] font-bold text-foreground">{estudiosQueTeGuardaron}</p>
          <p className="text-[12px] text-muted-foreground">
            {estudiosQueTeGuardaron === 1 ? 'estudio te ha guardado' : 'estudios te han guardado'}
          </p>
        </div>
      </div>
    </div>
  );
}
