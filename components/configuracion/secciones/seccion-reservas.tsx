'use client';

import { Ban, BellRing, CalendarCheck, CalendarX, ClipboardCheck, Coins, ListOrdered, RotateCcw, Timer, Undo2, Users, type LucideIcon } from 'lucide-react';
import { useStudio } from '@/lib/studio-context';
import { setAvisarAlumnas } from '@/lib/api-client';
import { hayPenalizacionConfigurada } from '@/lib/configuracion/penalizacion-activa';
import { excepcionesPorRegla, reglasGuardadas, type TarjetaReglasId } from '@/lib/configuracion/reglas-reserva';
import { resumenContrato, resumenRegla } from '@/lib/configuracion/resumenes';
import { CajonAjuste, useCajonAbierto } from '@/components/configuracion/shell/cajon-ajuste';
import { FilaAjuste, FilaInformativa, FilaInterruptor, GrupoFilas } from '@/components/configuracion/shell/fila-ajuste';
import {
  FormAsistencia, FormCancelarYRecuperar, FormClaseCancelada, FormListaEspera, FormPenalizacion, FormReservar, FormSinCuota,
  useConfirmacionRiesgo, type PropsCajonRegla,
} from '@/components/configuracion/tab-estudio-reservas';

// Cómo reservan mis alumnas: cada regla, una fila con su valor de hoy
// («Hasta 12 h antes · 2 tipos lo cambian») que se cambia en su cajón
// (tab-estudio-reservas.tsx). Los ids de las filas son las anclas de siempre
// (`#asistencia` desde el pase de lista, `#lista-de-espera` desde ⌘K): abren su
// cajón.
//
// El aviso a las alumnas es un sí/no sin dinero: se guarda al tocarlo, por su
// único escritor (`/api/sustituciones`, el mismo que usa Sustituciones), y
// vuelve atrás si dice que no.
//
// «Tentare lo hace así» cuenta lo que es de serie y no se toca, comprobado en el
// código: el tope de 4 recuperaciones vivas (`crear_recuperacion`), el corte a
// 2 h del mínimo de asistentes (`cancelar-por-minimo.ts`) y que la plaza libre
// pasa sola a la primera en apuntarse (`promocionar_siguiente_espera`, por
// `creado_en`).

const CAJONES = [
  'reservar', 'cancelar-y-recuperar', 'si-se-cancela-una-clase', 'lista-de-espera', 'asistencia', 'si-cancela-tarde-o-no-viene',
  'si-se-queda-sin-cuota',
] as const satisfies readonly TarjetaReglasId[];

const ICONOS: Record<TarjetaReglasId, LucideIcon> = {
  reservar: CalendarCheck,
  'cancelar-y-recuperar': Undo2,
  'si-se-cancela-una-clase': Ban,
  'lista-de-espera': ListOrdered,
  asistencia: ClipboardCheck,
  'si-cancela-tarde-o-no-viene': Coins,
  'si-se-queda-sin-cuota': CalendarX,
};

export function SeccionReservas({ showToast }: { showToast: (m: string) => void }) {
  const { studio, dataLoaded, tiposClase, textosLegalesPropios, reflejarStudioGuardado } = useStudio();
  const { cajon, abrir, cerrar } = useCajonAbierto(CAJONES);
  const confirmacion = useConfirmacionRiesgo();

  function guardado(texto: string) {
    cerrar();
    showToast(texto);
  }

  // Sin cargar, cada fila enseña su descripción: nunca un valor de fábrica que no es el suyo.
  const cargado = dataLoaded ? studio : null;
  const reglas = cargado ? reglasGuardadas(cargado) : null;
  const excepciones = excepcionesPorRegla(reglas ?? reglasGuardadas(null), dataLoaded ? tiposClase : []);

  // Con términos propios no se cobra ninguna penalización: lo mismo que dice
  // «Contrato y privacidad» en Alta de alumnas, con las mismas palabras.
  const contrato = resumenContrato({
    propios: cargado ? textosLegalesPropios : null,
    hayPenalizacion: hayPenalizacionConfigurada(studio, tiposClase),
  });

  function fila(id: TarjetaReglasId) {
    const problema = id === 'si-cancela-tarde-o-no-viene' && contrato.estado ? contrato : null;
    const valor = problema?.valor ?? (reglas
      ? resumenRegla(id, reglas, { excepciones: excepciones[id].length, pideConfirmacion: confirmacion.guardada })
      : null);
    return (
      <FilaAjuste
        key={id}
        id={id}
        icono={ICONOS[id]}
        valor={valor}
        estado={problema?.estado}
        entero={excepciones[id].length > 0}
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
      <GrupoFilas titulo="Reservar y cancelar">
        {fila('reservar')}
        {fila('cancelar-y-recuperar')}
        {fila('si-se-cancela-una-clase')}
      </GrupoFilas>

      <GrupoFilas titulo="Clases llenas y asistencia">
        {fila('lista-de-espera')}
        {fila('asistencia')}
      </GrupoFilas>

      <GrupoFilas titulo="Cargos y avisos">
        {fila('si-cancela-tarde-o-no-viene')}
        <FilaInterruptor
          id="ajuste-avisar-alumnas"
          icono={BellRing}
          on={cargado ? (cargado.avisarAlumnas ?? null) : null}
          onCambiar={cambiarAvisar}
        />
      </GrupoFilas>

      <GrupoFilas titulo="Plazas fijas">
        {fila('si-se-queda-sin-cuota')}
      </GrupoFilas>

      <GrupoFilas titulo="Tentare lo hace así">
        <FilaInformativa icono={Users} titulo="La plaza que se libera va a la primera de la lista" detalle="Por orden de llegada: al momento, o con el plazo para aceptarla que pongas en Lista de espera." />
        <FilaInformativa icono={Timer} titulo="Una clase sin su mínimo de alumnas se cancela 2 h antes" detalle="Solo si le pones un mínimo. Avisa a quien tenía plaza." />
        <FilaInformativa icono={RotateCcw} titulo="Cada alumna guarda hasta 4 recuperaciones" detalle="Sin usar a la vez: con 4, no se le da otra hasta que use o le caduque una." />
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
    </>
  );
}
