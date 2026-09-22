'use client';

import { useEffect, useState } from 'react';
import type { MostrarToast } from '@/components/ui/toast';
import { Building2, CalendarOff, Clock, MapPin, Phone } from 'lucide-react';
import { useStudio } from '@/lib/studio-context';
import { useAuth } from '@/lib/auth-context';
import { useRol } from '@/lib/permisos';
import { hoyEnEstudio } from '@/lib/utils';
import {
  fetchMisEstudios, dbContarClasesCanceladasPorCierre, dbListCierres, type SedeSeleccionable,
} from '@/lib/supabase-data';
import { seSolapaConOtro, type CierreGuardado } from '@/lib/cierres/quitar-cierre';
import { irASede } from '@/components/layout/sede-activa';
import { tieneFeature } from '@/lib/billing/entitlements';
import { FormContacto, FormNombreYDireccion } from '@/components/configuracion/tab-datos-contacto';
import { FormCerrarElCentro, FormHorario, ListaCierres } from '@/components/configuracion/tab-estudio-horario';
import { FormSedes } from '@/components/configuracion/tab-estudio-sedes';
import { CajonAjuste, useCajonAbierto } from '@/components/configuracion/shell/cajon-ajuste';
import { FilaAjuste, GrupoFilas } from '@/components/configuracion/shell/fila-ajuste';
import { FilaHerramienta } from '@/components/configuracion/shell/fila-herramienta';
import {
  resumenCierres, resumenContacto, resumenHerramienta, resumenHorarioSemana, resumenNombreYDireccion, resumenSedes,
} from '@/lib/configuracion/resumenes';
import { tarjetaVisible, type TarjetaId } from '@/lib/configuracion/secciones';

// Mi estudio: quién eres, dónde estás y cuándo abres, en filas que dicen cómo
// está cada cosa HOY. Tocar una abre su cajón (shell/cajon-ajuste.tsx), con su
// «Guardar» que manda solo sus campos. Las salas y sus averías tienen su propia
// pantalla; la marca y los textos de la app están en «Marca», y los datos
// fiscales en «Cobros y facturas».
//
// Un enlace con el ancla de una fila (`#horario`, y las de antes:
// `#horario-y-cierres`, `#datos-y-contacto`) abre su cajón.

type CajonId = Extract<TarjetaId, 'nombre-y-direccion' | 'contacto' | 'horario' | 'cerrar-el-centro' | 'sedes'>;

const CAJONES = ['nombre-y-direccion', 'contacto', 'horario', 'cerrar-el-centro', 'sedes'] as const satisfies readonly CajonId[];

const FILAS_DATOS = [{ id: 'nombre-y-direccion', icono: MapPin }, { id: 'contacto', icono: Phone }] as const;
const FILAS_HORARIO = [{ id: 'horario', icono: Clock }, { id: 'cerrar-el-centro', icono: CalendarOff }] as const;
const FILA_SEDES = { id: 'sedes', icono: Building2 } as const;

/** Clases canceladas de cada cierre; los que se pisan con otro no se cuentan (no se sabe de cuál es cada clase). */
const contarClases = (studioId: string, cierres: readonly CierreGuardado[]) =>
  dbContarClasesCanceladasPorCierre(studioId, cierres.filter(c => !seSolapaConOtro(c, cierres)));

export function SeccionEstudio({ showToast }: { showToast: MostrarToast }) {
  const { studio, dataLoaded, salas, bloqueosMaquina } = useStudio();
  const { user } = useAuth();
  // La gerencia lleva la operación de la sede: el horario, los cierres y las
  // salas. El nombre, el contacto y las sedes son de la propietaria, y su RLS lo
  // exige igual — aquí solo se deja de enseñar lo que se rechazaría.
  const rol = useRol();
  const ve = (id: TarjetaId) => tarjetaVisible(id, rol);
  const veSedes = ve('sedes');

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
    // Sin la fila de sedes no hay nada que leer: no se pide.
    if (!user || !veSedes) return;
    let vivo = true;
    fetchMisEstudios().then(r => { if (vivo) setSedes(r); });
    return () => { vivo = false; };
  }, [user, veSedes]);

  function cambiarmeASede(id: string) {
    if (!user || id === studio?.id || cambiandoASede) return;
    setCambiandoASede(id);
    // Mismo patrón que SedeActiva.elegir() (components/layout/sede-activa.tsx):
    // hard-nav tras guardar, para que StudioProvider remonte limpio contra la
    // nueva sede.
    void irASede(user.id, id, sedes?.find(s => s.id === id)?.nombre ?? '').then(ok => {
      if (!ok) { setCambiandoASede(null); showToast('No se ha podido cambiar de sede', { variant: 'error' }); }
    });
  }

  const haySedes = veSedes && ((sedes?.length ?? 0) > 1 || puedeAnadirSedes);

  // Los cierres (los que vienen y los pasados): el panel no los carga al
  // arrancar, se piden aquí. Una sola lista para la fila y para el cajón, así
  // la fila dice lo mismo que la lista tras quitar uno. `undefined` = cargando,
  // `null` = no se han podido leer.
  const [cierres, setCierres] = useState<CierreGuardado[] | null | undefined>(undefined);
  const [clasesPorCierre, setClasesPorCierre] = useState<Record<string, number | null>>({});
  const [recargaCierres, setRecargaCierres] = useState(0);
  const studioId = studio?.id;
  useEffect(() => {
    if (!studioId) return;
    let vivo = true;
    dbListCierres(studioId).then(r => {
      if (!vivo) return;
      setCierres(r);
      if (r) contarClases(studioId, r).then(c => { if (vivo) setClasesPorCierre(c); });
    });
    return () => { vivo = false; };
  }, [studioId, recargaCierres]);

  // Tras quitar uno: se espera a la lista releída, para que el cierre no salga
  // de ella antes de que la base de datos lo diga.
  async function recargarCierres() {
    if (!studioId) return;
    const r = await dbListCierres(studioId);
    setCierres(r);
    if (r) contarClases(studioId, r).then(setClasesPorCierre);
  }

  // El cajón abierto: un enlace con ancla abre el suyo (shell/cajon-ajuste.tsx).
  const { cajon, abrir, cerrar } = useCajonAbierto(CAJONES.filter(ve));

  function guardado(texto: string) {
    cerrar();
    showToast(texto);
  }

  const valores: Record<CajonId, string | null> = {
    'nombre-y-direccion': dataLoaded && studio ? resumenNombreYDireccion(studio) : null,
    contacto: dataLoaded && studio ? resumenContacto(studio) : null,
    horario: resumenHorarioSemana(studio?.horarioSemana),
    'cerrar-el-centro': hoy ? resumenCierres(cierres ?? null, hoy) : null,
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
      {FILAS_DATOS.some(f => ve(f.id)) && (
        <GrupoFilas titulo="Datos y contacto">
          {FILAS_DATOS.filter(f => ve(f.id)).map(f => <FilaAjuste key={f.id} {...f} valor={valores[f.id]} onAbrir={abrir} />)}
        </GrupoFilas>
      )}

      <GrupoFilas titulo="Horario y cierres">
        {FILAS_HORARIO.filter(f => ve(f.id)).map(f => <FilaAjuste key={f.id} {...f} valor={valores[f.id]} onAbrir={abrir} />)}
      </GrupoFilas>

      <GrupoFilas titulo="Dónde das clase">
        <FilaHerramienta {...filaSalas} />
        {haySedes && <FilaAjuste {...FILA_SEDES} valor={valores.sedes} onAbrir={abrir} />}
      </GrupoFilas>

      {ve('nombre-y-direccion') && (
        <CajonAjuste id="nombre-y-direccion" abierto={cajon === 'nombre-y-direccion'} onCerrar={cerrar}>
          <FormNombreYDireccion {...props} />
        </CajonAjuste>
      )}
      {ve('contacto') && (
        <CajonAjuste id="contacto" abierto={cajon === 'contacto'} onCerrar={cerrar}>
          <FormContacto {...props} />
        </CajonAjuste>
      )}
      <CajonAjuste id="horario" abierto={cajon === 'horario'} onCerrar={cerrar}>
        <FormHorario {...props} />
      </CajonAjuste>
      <CajonAjuste id="cerrar-el-centro" abierto={cajon === 'cerrar-el-centro'} onCerrar={cerrar}>
        <ListaCierres
          cierres={cierres}
          clases={clasesPorCierre}
          hoy={hoy}
          showToast={showToast}
          onQuitado={recargarCierres}
        />
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
