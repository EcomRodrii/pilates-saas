'use client';

import { useMemo, useState } from 'react';
import { Ban, Bell, BellRing, CalendarCheck, CalendarClock, CalendarX, ClipboardCheck, Coins, ListOrdered, Pause, Smartphone, Undo2, type LucideIcon } from 'lucide-react';
import { useStudio } from '@/lib/studio-context';
import { setAvisarAlumnas } from '@/lib/api-client';
import { hayPenalizacionConfigurada } from '@/lib/configuracion/penalizacion-activa';
import { excepcionesPorRegla, queCambiaElTipo, reglasGuardadas, type ReglasReserva, type TarjetaReglasId, type TipoConReglas } from '@/lib/configuracion/reglas-reserva';
import { MAX_RESUMEN_REGLA, resumenContrato, resumenRegla } from '@/lib/configuracion/resumenes';
import { resumenClasesPorSemana } from '@/lib/configuracion/linea-de-tiempo-reserva';
import { CajonAjuste, useCajonAbierto } from '@/components/configuracion/shell/cajon-ajuste';
import { FilaAjuste, FilaExterna, FilaInterruptor, FilaOtraSeccion, GrupoFilas } from '@/components/configuracion/shell/fila-ajuste';
import { AsiLoViveTuAlumna } from './asi-lo-vive-tu-alumna';
import { hayAlgoQueContratar } from '@/lib/bono-logic';
import { tiposConVida } from '@/lib/tipos-clase/orden-y-archivo';
import {
  FormAsistencia, FormCancelarYRecuperar, FormClaseCancelada, FormListaEspera, FormPausaPlazaFija, FormPenalizacion,
  FormPlazaFijaDesdeApp, FormReservar, FormSinCuota,
  useConfirmacionRiesgo, type PropsCajonRegla,
} from '@/components/configuracion/tab-estudio-reservas';

// Cómo reservan mis alumnas: cada regla, una fila con su valor de hoy
// («Hasta 12 h antes · después pierde la sesión», y debajo «Reformer: cancela
// gratis hasta 24 h antes») que se cambia en su cajón
// (tab-estudio-reservas.tsx). Los ids de las filas son las anclas de siempre
// (`#asistencia` desde el pase de lista, `#lista-de-espera` desde ⌘K): abren su
// cajón.
//
// El aviso a las alumnas es un sí/no sin dinero: se guarda al tocarlo, por su
// único escritor (`/api/sustituciones`, el mismo que usa Sustituciones), y
// vuelve atrás si dice que no.
//
// Arriba, «Así lo vive tu alumna»: las reglas contadas sobre una clase de verdad,
// con horas (asi-lo-vive-tu-alumna.tsx). Debajo, las filas agrupadas por MOMENTO
// de la alumna (antes de reservar, si cambia de planes, el día de la clase, plaza
// fija), cada una con los tipos de clase que la cambian y QUÉ cambian. Lo que
// decide cómo reserva y vive en otra pantalla —clases por semana de cada plan,
// recordatorios— tiene aquí su fila-enlace.
//
// Lo que Tentare hace de serie y no se toca (el tope de 4 recuperaciones vivas,
// el corte del mínimo a 2 h, la plaza libre a la primera de la lista) se cuenta
// DENTRO del cajón de su regla (tab-estudio-reservas.tsx, `NotaDeSerie`), no en
// un grupo aparte que repetía lo que ya decía cada cajón.

const CAJONES = [
  'reservar', 'cancelar-y-recuperar', 'si-se-cancela-una-clase', 'lista-de-espera', 'asistencia', 'si-cancela-tarde-o-no-viene',
  'si-se-queda-sin-cuota', 'plaza-fija-desde-la-app', 'si-pausa-su-plaza-fija',
] as const satisfies readonly TarjetaReglasId[];

const ICONOS: Record<TarjetaReglasId, LucideIcon> = {
  reservar: CalendarCheck,
  'cancelar-y-recuperar': Undo2,
  'si-se-cancela-una-clase': Ban,
  'lista-de-espera': ListOrdered,
  asistencia: ClipboardCheck,
  'si-cancela-tarde-o-no-viene': Coins,
  'si-se-queda-sin-cuota': CalendarX,
  'plaza-fija-desde-la-app': Smartphone,
  'si-pausa-su-plaza-fija': Pause,
};

export function SeccionReservas({ showToast }: { showToast: (m: string) => void }) {
  const { studio, dataLoaded, tiposClase, sesiones, planesTarifa, textosLegalesPropios, reflejarStudioGuardado } = useStudio();
  const { cajon, abrir, cerrar } = useCajonAbierto(CAJONES);
  const confirmacion = useConfirmacionRiesgo();

  function guardado(texto: string) {
    cerrar();
    showToast(texto);
  }

  // Sin cargar, cada fila enseña su descripción: nunca un valor de fábrica que no es el suyo.
  const cargado = dataLoaded ? studio : null;
  const reglas = cargado ? reglasGuardadas(cargado) : null;
  // Los tipos que la alumna aún puede encontrarse: los activos y los archivados
  // a los que les quedan clases. Uno archivado sin ninguna ya no tiene excepción
  // que contar ni clase sobre la que contarla.
  const [ahora] = useState(() => Date.now());
  const tipos: readonly TipoConReglas[] = useMemo(
    () => (dataLoaded ? tiposConVida(tiposClase, sesiones, ahora) : []),
    [dataLoaded, tiposClase, sesiones, ahora],
  );
  const excepciones = excepcionesPorRegla(reglas ?? reglasGuardadas(null), tipos);

  // Con términos propios no se cobra ninguna penalización: lo mismo que dice
  // «Contrato y privacidad» en Alta de alumnas, con las mismas palabras.
  const contrato = resumenContrato({
    propios: cargado ? textosLegalesPropios : null,
    hayPenalizacion: hayPenalizacionConfigurada(studio, tiposClase),
  });

  function fila(id: TarjetaReglasId) {
    const problema = id === 'si-cancela-tarde-o-no-viene' && contrato.estado ? contrato : null;
    // A dos líneas y sin «N tipos lo cambian»: debajo va QUÉ tipo y QUÉ cambia.
    const valor = problema?.valor ?? (reglas
      ? resumenRegla(id, reglas, {
        excepciones: 0, pideConfirmacion: confirmacion.guardada, max: MAX_RESUMEN_REGLA,
        nadaALaVenta: !hayAlgoQueContratar(planesTarifa),
      })
      : null);
    return (
      <FilaAjuste
        key={id}
        id={id}
        icono={ICONOS[id]}
        valor={valor}
        estado={problema?.estado}
        entero
        extra={reglas ? <Excepciones tarjeta={id} reglas={reglas} tipos={tipos} ids={excepciones[id].map(t => t.id)} /> : null}
        onAbrir={abrir}
      />
    );
  }

  async function cambiarAvisar(v: boolean): Promise<string | null> {
    const r = await setAvisarAlumnas(v);
    if ('error' in r) return r.error;
    reflejarStudioGuardado({ avisarAlumnas: v });
    showToast(v ? 'Tus alumnas recibirán el aviso' : 'Aviso a las alumnas desactivado');
    return null;
  }

  const props = (id: TarjetaReglasId): PropsCajonRegla => ({ showToast, onGuardado: guardado, excepciones: excepciones[id] });

  return (
    <>
      <AsiLoViveTuAlumna reglas={reglas} tipos={tipos} sesiones={dataLoaded ? sesiones : []} planes={dataLoaded ? planesTarifa : []} />

      <GrupoFilas titulo="Antes de reservar">
        {fila('reservar')}
        {fila('lista-de-espera')}
        <FilaExterna
          id="fila-clases-por-semana"
          icono={CalendarClock}
          titulo="Clases por semana"
          valor={dataLoaded ? resumenClasesPorSemana(planesTarifa) : null}
          descripcion="Cuántas clases a la semana puede hacer con cada plan. Se pone en cada plan, en Paquetes."
          href="/productos"
        />
      </GrupoFilas>

      <GrupoFilas titulo="Si cambia de planes">
        {fila('cancelar-y-recuperar')}
        {fila('si-cancela-tarde-o-no-viene')}
      </GrupoFilas>

      <GrupoFilas titulo="El día de la clase">
        {fila('asistencia')}
        <FilaOtraSeccion
          id="fila-recordatorios"
          icono={Bell}
          titulo="Recordatorios"
          valor={null}
          descripcion="Cuándo le llega el recordatorio de su clase. Se cambia en Avisos en el móvil."
          seccion="comunicacion"
          ancla="avisos-del-movil"
        />
        {fila('si-se-cancela-una-clase')}
        <FilaInterruptor
          id="ajuste-avisar-alumnas"
          icono={BellRing}
          on={cargado ? (cargado.avisarAlumnas ?? null) : null}
          onCambiar={cambiarAvisar}
        />
      </GrupoFilas>

      <GrupoFilas titulo="Plazas fijas">
        {fila('si-se-queda-sin-cuota')}
        {fila('plaza-fija-desde-la-app')}
        {fila('si-pausa-su-plaza-fija')}
      </GrupoFilas>

      <CajonAjuste id="reservar" abierto={cajon === 'reservar'} onCerrar={cerrar}>
        <FormReservar {...props('reservar')} />
      </CajonAjuste>
      <CajonAjuste id="cancelar-y-recuperar" abierto={cajon === 'cancelar-y-recuperar'} onCerrar={cerrar}>
        <FormCancelarYRecuperar {...props('cancelar-y-recuperar')} />
      </CajonAjuste>
      <CajonAjuste id="si-se-cancela-una-clase" abierto={cajon === 'si-se-cancela-una-clase'} onCerrar={cerrar}>
        <FormClaseCancelada {...props('si-se-cancela-una-clase')} />
      </CajonAjuste>
      <CajonAjuste id="lista-de-espera" abierto={cajon === 'lista-de-espera'} onCerrar={cerrar}>
        <FormListaEspera {...props('lista-de-espera')} />
      </CajonAjuste>
      <CajonAjuste id="asistencia" abierto={cajon === 'asistencia'} onCerrar={cerrar}>
        <FormAsistencia {...props('asistencia')} confirmacion={confirmacion} />
      </CajonAjuste>
      <CajonAjuste id="si-cancela-tarde-o-no-viene" abierto={cajon === 'si-cancela-tarde-o-no-viene'} onCerrar={cerrar}>
        <FormPenalizacion {...props('si-cancela-tarde-o-no-viene')} />
      </CajonAjuste>
      <CajonAjuste id="si-se-queda-sin-cuota" abierto={cajon === 'si-se-queda-sin-cuota'} onCerrar={cerrar}>
        <FormSinCuota {...props('si-se-queda-sin-cuota')} />
      </CajonAjuste>
      <CajonAjuste id="plaza-fija-desde-la-app" abierto={cajon === 'plaza-fija-desde-la-app'} onCerrar={cerrar}>
        <FormPlazaFijaDesdeApp {...props('plaza-fija-desde-la-app')} />
      </CajonAjuste>
      <CajonAjuste id="si-pausa-su-plaza-fija" abierto={cajon === 'si-pausa-su-plaza-fija'} onCerrar={cerrar}>
        <FormPausaPlazaFija {...props('si-pausa-su-plaza-fija')} />
      </CajonAjuste>
    </>
  );
}

/** «HIIT Reformer: cancela gratis hasta 24 h antes»: qué tipo la cambia y qué cambia (hasta tres). */
function Excepciones({ tarjeta, reglas, tipos, ids }: {
  tarjeta: TarjetaReglasId; reglas: ReglasReserva; tipos: readonly TipoConReglas[]; ids: readonly string[];
}) {
  if (ids.length === 0) return null;
  const lineas = ids
    .map(id => tipos.find(t => t.id === id))
    .filter((t): t is TipoConReglas => !!t)
    .map(t => ({ id: t.id, texto: `${t.nombre}: ${queCambiaElTipo(tarjeta, t, reglas) ?? 'su propia regla'}` }));
  return (
    <>
      {lineas.slice(0, 3).map(l => (
        <span key={l.id} data-excepcion="" className="inline-flex max-w-full rounded-lg border border-border bg-card px-2 py-0.5 text-[12px] text-foreground">{l.texto}</span>
      ))}
      {lineas.length > 3 && <span className="inline-flex px-1 py-0.5 text-[12px] text-muted-foreground">y {lineas.length - 3} más</span>}
    </>
  );
}
