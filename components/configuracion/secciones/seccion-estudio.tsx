'use client';

import { useEffect, useState } from 'react';
import { Building2, CalendarOff, Clock, MapPin, Phone } from 'lucide-react';
import { useStudio } from '@/lib/studio-context';
import { useAuth } from '@/lib/auth-context';
import { hoyEnEstudio } from '@/lib/utils';
import { fetchMisEstudios, cambiarSedeActiva, dbListCierresProximos, type SedeSeleccionable } from '@/lib/supabase-data';
import { CLAVE_CAMBIO_SEDE } from '@/components/layout/sede-activa';
import { tieneFeature } from '@/lib/billing/entitlements';
import { FormContacto, FormNombreYDireccion } from '@/components/configuracion/tab-datos-contacto';
import { FormCerrarElCentro, FormHorario } from '@/components/configuracion/tab-estudio-horario';
import { FormSedes } from '@/components/configuracion/tab-estudio-sedes';
import { CajonAjuste } from '@/components/configuracion/shell/cajon-ajuste';
import { FilaAjuste, GrupoFilas } from '@/components/configuracion/shell/fila-ajuste';
import { FilaHerramienta } from '@/components/configuracion/shell/fila-herramienta';
import { useNavegacionConfig } from '@/components/configuracion/shell/contexto';
import {
  resumenCierres, resumenContacto, resumenHerramienta, resumenHorarioSemana, resumenNombreYDireccion, resumenSedes,
} from '@/lib/configuracion/resumenes';
import type { TarjetaId } from '@/lib/configuracion/secciones';

// Mi estudio: quién eres, dónde estás y cuándo abres, en filas que dicen cómo
// está cada cosa HOY. Tocar una abre su cajón (shell/cajon-ajuste.tsx), con su
// «Guardar» que manda solo sus campos. Las salas y sus averías tienen su propia
// pantalla; la marca y los textos de la app están en «Marca», y los datos
// fiscales en «Cobros y facturas».
//
// Un enlace con el ancla de una fila (`#horario`, y las de antes:
// `#horario-y-cierres`, `#datos-y-contacto`) abre su cajón.

type CajonId = Extract<TarjetaId, 'nombre-y-direccion' | 'contacto' | 'horario' | 'cerrar-el-centro' | 'sedes'>;

const CAJONES: readonly string[] = ['nombre-y-direccion', 'contacto', 'horario', 'cerrar-el-centro', 'sedes'] satisfies CajonId[];
const esCajon = (id: string | undefined): id is CajonId => !!id && CAJONES.includes(id);

const FILAS_DATOS = [{ id: 'nombre-y-direccion', icono: MapPin }, { id: 'contacto', icono: Phone }] as const;
const FILAS_HORARIO = [{ id: 'horario', icono: Clock }, { id: 'cerrar-el-centro', icono: CalendarOff }] as const;
const FILA_SEDES = { id: 'sedes', icono: Building2 } as const;

export function SeccionEstudio({ showToast }: { showToast: (m: string) => void }) {
  const { studio, dataLoaded, salas, bloqueosMaquina } = useStudio();
  const { user } = useAuth();
  const nav = useNavegacionConfig();

  // Qué avería sigue abierta y qué cierre ya pasó dependen de la hora: se lee
  // una vez al montar (leer el reloj en render es impuro).
  const [ahoraMs, setAhoraMs] = useState(0);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- La hora del reloj no se puede derivar en render; es justo lo que prohíbe la regla de pureza.
    setAhoraMs(Date.now());
  }, []);
  const hoy = ahoraMs > 0 ? hoyEnEstudio(new Date(ahoraMs)) : null;

  // «Sedes» solo existe si hay algo que decidir ahí: más de una sede, o el plan
  // Cadena para poder añadir la segunda. Con un estudio normal (la inmensa
  // mayoría) la fila ni aparece.
  const puedeAnadirSedes = !!studio && tieneFeature({ plan: studio.plan, subscriptionStatus: studio.subscriptionStatus }, 'multiCentro');
  const [sedes, setSedes] = useState<SedeSeleccionable[] | null>(null);
  const [cambiandoASede, setCambiandoASede] = useState<string | null>(null);
  useEffect(() => {
    if (!user) return;
    let vivo = true;
    fetchMisEstudios().then(r => { if (vivo) setSedes(r); });
    return () => { vivo = false; };
  }, [user]);

  function cambiarmeASede(id: string) {
    if (!user || id === studio?.id || cambiandoASede) return;
    setCambiandoASede(id);
    // Mismo patrón que SedeActiva.elegir() (components/layout/sede-activa.tsx):
    // hard-nav tras guardar, para que StudioProvider remonte limpio contra la
    // nueva sede.
    cambiarSedeActiva(user.id, id).then(ok => {
      if (!ok) { setCambiandoASede(null); showToast('No se ha podido cambiar de sede'); return; }
      const destino = sedes?.find(s => s.id === id);
      try { sessionStorage.setItem(CLAVE_CAMBIO_SEDE, destino?.nombre ?? ''); } catch { /* modo privado */ }
      window.location.href = '/dashboard';
    });
  }

  const haySedes = (sedes?.length ?? 0) > 1 || puedeAnadirSedes;

  // Los cierres que vienen: el panel no los carga al arrancar, se piden aquí.
  const [cierres, setCierres] = useState<{ desde: string; hasta: string }[] | null>(null);
  const [recargaCierres, setRecargaCierres] = useState(0);
  const studioId = studio?.id;
  useEffect(() => {
    if (!studioId || !hoy) return;
    let vivo = true;
    dbListCierresProximos(studioId, hoy).then(r => { if (vivo) setCierres(r); });
    return () => { vivo = false; };
  }, [studioId, hoy, recargaCierres]);

  // El cajón abierto. Un enlace con ancla abre el suyo, también la misma ancla
  // pedida otra vez (`anclaAbierta` cambia en cada navegación).
  const anclaAbierta = nav?.anclaAbierta ?? null;
  const idAncla = anclaAbierta?.id;
  const [cajon, setCajon] = useState<CajonId | null>(esCajon(idAncla) ? idAncla : null);
  const [anclaVista, setAnclaVista] = useState(anclaAbierta);
  if (anclaAbierta !== anclaVista) {
    setAnclaVista(anclaAbierta);
    if (esCajon(idAncla)) setCajon(idAncla);
  }

  function abrir(id: TarjetaId) {
    if (esCajon(id)) setCajon(id);
  }

  function cerrar() {
    const id = cajon;
    setCajon(null);
    // Llegó por un enlace (`#horario`): la dirección deja de decir que está abierto.
    if (id && window.location.hash === `#${id}`) {
      window.history.replaceState(window.history.state, '', `${window.location.pathname}${window.location.search}`);
    }
  }

  function guardado(texto: string) {
    cerrar();
    showToast(texto);
  }

  const valores: Record<CajonId, string | null> = {
    'nombre-y-direccion': dataLoaded && studio ? resumenNombreYDireccion(studio) : null,
    contacto: dataLoaded && studio ? resumenContacto(studio) : null,
    horario: resumenHorarioSemana(studio?.horarioSemana),
    'cerrar-el-centro': hoy ? resumenCierres(cierres, hoy) : null,
    sedes: resumenSedes(sedes, studio?.id),
  };

  const filaSalas = {
    id: 'salas' as const,
    valor: resumenHerramienta('salas', {
      salas: dataLoaded && ahoraMs > 0 ? { numSalas: salas.length, averias: bloqueosMaquina, ahoraMs } : null,
    }),
  };

  const props = { showToast, onGuardado: guardado };

  return (
    <>
      <GrupoFilas titulo="Datos y contacto">
        {FILAS_DATOS.map(f => <FilaAjuste key={f.id} {...f} valor={valores[f.id]} onAbrir={abrir} />)}
      </GrupoFilas>

      <GrupoFilas titulo="Horario y cierres">
        {FILAS_HORARIO.map(f => <FilaAjuste key={f.id} {...f} valor={valores[f.id]} onAbrir={abrir} />)}
      </GrupoFilas>

      <GrupoFilas titulo="Dónde das clase">
        <FilaHerramienta {...filaSalas} />
        {haySedes && <FilaAjuste {...FILA_SEDES} valor={valores.sedes} onAbrir={abrir} />}
      </GrupoFilas>

      <CajonAjuste id="nombre-y-direccion" abierto={cajon === 'nombre-y-direccion'} onCerrar={cerrar}>
        <FormNombreYDireccion {...props} />
      </CajonAjuste>
      <CajonAjuste id="contacto" abierto={cajon === 'contacto'} onCerrar={cerrar}>
        <FormContacto {...props} />
      </CajonAjuste>
      <CajonAjuste id="horario" abierto={cajon === 'horario'} onCerrar={cerrar}>
        <FormHorario {...props} />
      </CajonAjuste>
      <CajonAjuste id="cerrar-el-centro" abierto={cajon === 'cerrar-el-centro'} onCerrar={cerrar}>
        <FormCerrarElCentro
          {...props}
          onGuardado={texto => { setRecargaCierres(n => n + 1); guardado(texto); }}
        />
      </CajonAjuste>
      {haySedes && (
        <CajonAjuste id="sedes" abierto={cajon === 'sedes'} onCerrar={cerrar}>
          <FormSedes
            sedes={sedes ?? []}
            refrescarSedes={() => { fetchMisEstudios().then(setSedes); }}
            cambiandoASede={cambiandoASede}
            cambiarmeASede={cambiarmeASede}
            puedeAnadirSedes={puedeAnadirSedes}
          />
        </CajonAjuste>
      )}
    </>
  );
}
