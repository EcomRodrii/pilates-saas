'use client';

import { useEffect, useState } from 'react';
import {
  BellRing, Briefcase, CalendarPlus, ConciergeBell, KeyRound, PersonStanding, Repeat, Smartphone, Users, Wallet, type LucideIcon,
} from 'lucide-react';
import { useStudio } from '@/lib/studio-context';
import { leerTarifasEquipo, type TarifaInstructor } from '@/lib/api-client';
import { urlAppInstructora } from '@/lib/avisos/app-instructora';
import type { Rol } from '@/lib/types';
import { QUE_HACE_CADA_ROL } from '@/lib/configuracion/que-hace-cada-rol';
import {
  resumenAppInstructoras, resumenAvisarAlumnas, resumenEquipo, resumenModoSustituciones, resumenTarifas,
} from '@/lib/configuracion/resumenes';
import { FILAS_A_OTRA_PANTALLA, tarjetaPorId } from '@/lib/configuracion/secciones';
import { BotonCopiar, useOrigen } from '@/components/configuracion/tab-estudio-enlaces';
import {
  FilaExterna, FilaInformativa, FilaInterruptor, FilaOtraSeccion, GrupoFilas, TituloFila, ValorFila,
} from '@/components/configuracion/shell/fila-ajuste';
import { IconoFila } from '@/components/configuracion/shell/fila-herramienta';

// Mi equipo, en filas con su valor de hoy (16-sep, v2). Era una sola tarjeta con
// su barra de guardar; ahora:
//   · «Las instructoras crean sus clases» es un sí/no que se guarda al tocarlo
//     (mismo escritor de siempre, `updateStudio`, que cuenta filas) y vuelve
//     atrás si el servidor dice que no;
//   · la app de tus instructoras, con «Copiar», que solo dice «Copiado» si el
//     portapapeles lo aceptó (#994);
//   · lo que se cambia en otra pantalla —el modo de Sustituciones, las tarifas y
//     liquidaciones, dar de alta y elegir el rol en Equipo— es una fila que lleva
//     allí con cómo está, y el aviso a las alumnas, una que lleva a su sección;
//   · qué hace cada rol, en filas de solo lectura comprobadas contra las reglas
//     de permisos (lib/configuracion/que-hace-cada-rol.ts).
// Nada para la instructora en el panel: su sitio es la app del estudio.

const ICONO_ROL: Record<Rol, LucideIcon> = {
  PROPIETARIO: KeyRound,
  MANAGER: Briefcase,
  RECEPCION: ConciergeBell,
  INSTRUCTOR: PersonStanding,
};

type IdFilaEquipo = Extract<(typeof FILAS_A_OTRA_PANTALLA)[number], { seccion: 'equipo' }>['id'];
const filaAOtraPantalla = (id: IdFilaEquipo) => FILAS_A_OTRA_PANTALLA.find(f => f.id === id)!;

export function SeccionEquipo({ showToast }: { showToast: (m: string) => void }) {
  const { studio, dataLoaded, instructores, updateStudio } = useStudio();
  // Sin cargar, cada fila enseña su descripción: nunca un valor de fábrica que no es el suyo.
  const cargado = dataLoaded ? studio : null;
  const equipo = dataLoaded ? instructores : null;
  // Como la pantalla de liquidaciones: las que siguen, con rol de instructora.
  const instructoras = equipo ? equipo.filter(i => i.activo && i.rol === 'INSTRUCTOR') : null;

  // Las tarifas no viajan con el panel (van aparte de `instructores` por
  // privacidad, #562): se piden a su ruta al abrir la sección. Sin respuesta la
  // fila no cuenta nada —«ninguna con tarifa» sería mentira— y dice qué hay allí.
  const [tarifas, setTarifas] = useState<TarifaInstructor[] | null>(null);
  useEffect(() => {
    let vivo = true;
    void leerTarifasEquipo().then(t => { if (vivo) setTarifas(t); });
    return () => { vivo = false; };
  }, []);

  async function cambiarCrearClases(v: boolean): Promise<string | null> {
    const res = await updateStudio({ instructorasCreanClases: v });
    if (!res.ok) return res.error;
    showToast(v ? 'Tus instructoras ya pueden crear sus clases' : 'Tus instructoras ya no crean clases');
    return null;
  }

  const sustituciones = filaAOtraPantalla('fila-sustituciones');
  const liquidaciones = filaAOtraPantalla('fila-liquidaciones');
  const pantallaEquipo = filaAOtraPantalla('fila-equipo');

  return (
    <>
      <GrupoFilas titulo="Tus instructoras">
        <FilaInterruptor
          id="ajuste-instructoras-crean-clases"
          icono={CalendarPlus}
          on={cargado ? (cargado.instructorasCreanClases ?? true) : null}
          onCambiar={cambiarCrearClases}
        />
        <FilaAppInstructoras showToast={showToast} />
      </GrupoFilas>

      <GrupoFilas titulo="Si alguien no puede dar su clase">
        <FilaExterna
          id={sustituciones.id}
          icono={Repeat}
          titulo={sustituciones.titulo}
          valor={cargado ? resumenModoSustituciones(cargado) : null}
          descripcion={sustituciones.resumen}
          href={sustituciones.href}
        />
        <FilaOtraSeccion
          id="fila-a-avisar-alumnas"
          icono={BellRing}
          titulo={tarjetaPorId('ajuste-avisar-alumnas').titulo}
          valor={resumenAvisarAlumnas(cargado?.avisarAlumnas)}
          descripcion="Si avisa a sus alumnas cuando su clase cambia por una baja"
          seccion="reservas"
          ancla="ajuste-avisar-alumnas"
        />
      </GrupoFilas>

      <GrupoFilas titulo="Pagar a tus instructoras">
        <FilaExterna
          id={liquidaciones.id}
          icono={Wallet}
          titulo={liquidaciones.titulo}
          valor={resumenTarifas(instructoras, tarifas)}
          descripcion={liquidaciones.resumen}
          href={liquidaciones.href}
        />
      </GrupoFilas>

      <GrupoFilas titulo="Qué puede hacer cada rol">
        <FilaExterna
          id={pantallaEquipo.id}
          icono={Users}
          titulo={pantallaEquipo.titulo}
          valor={resumenEquipo(equipo)}
          descripcion={pantallaEquipo.resumen}
          href={pantallaEquipo.href}
        />
        {QUE_HACE_CADA_ROL.map(r => (
          <FilaInformativa key={r.rol} icono={ICONO_ROL[r.rol]} titulo={r.titulo} detalle={r.detalle} />
        ))}
      </GrupoFilas>
    </>
  );
}

/**
 * «La app de tus instructoras»: la dirección corta y «Copiar». No abre nada: sin
 * la sesión de una instructora, la app no enseña nada útil a la propietaria. El
 * ancla (`#app-de-tus-instructoras`, desde el buscador) da el foco a «Copiar».
 */
function FilaAppInstructoras({ showToast }: { showToast: (m: string) => void }) {
  const { studio, dataLoaded } = useStudio();
  const origen = useOrigen();
  const tarjeta = tarjetaPorId('app-de-tus-instructoras');
  const slug = dataLoaded ? studio?.slug?.trim() || null : null;
  const corto = origen ? resumenAppInstructoras({ slug, origen }) : null;
  // La misma dirección a la que la puerta del panel manda a una instructora.
  const url = corto && slug ? `${origen}${urlAppInstructora(slug)}` : null;
  return (
    <li id="app-de-tus-instructoras" className="flex min-h-16 scroll-mt-32 scroll-mb-32 items-center gap-3 px-4 py-3">
      <IconoFila icono={Smartphone} />
      <span className="min-w-0 flex-1">
        <TituloFila titulo={tarjeta.titulo} />
        <ValorFila valor={corto} descripcion={tarjeta.frase} title={url ?? undefined} />
      </span>
      {url && <BotonCopiar texto={url} que="El enlace de la app de tus instructoras" showToast={showToast} compacto />}
    </li>
  );
}
