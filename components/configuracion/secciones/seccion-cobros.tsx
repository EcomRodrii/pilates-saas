'use client';

import { Landmark, Package, Receipt, RotateCcw, Wallet } from 'lucide-react';
import { useStudio } from '@/lib/studio-context';
import {
  resumenDatosFiscales, resumenDevoluciones, resumenDomiciliaciones, resumenPlanesActivos,
} from '@/lib/configuracion/resumenes';
import { FILAS_A_OTRA_PANTALLA, type TarjetaId } from '@/lib/configuracion/secciones';
import { FormDatosFiscales } from '@/components/configuracion/tab-datos-fiscales';
import { FormDevoluciones, FormDomiciliaciones } from '@/components/configuracion/tab-estudio-cobros';
import { DetalleCobroConTarjeta, FilaCobroConTarjeta, useCobroConTarjeta } from '@/components/configuracion/cobro-con-tarjeta';
import { CajonAjuste, useCajonAbierto } from '@/components/configuracion/shell/cajon-ajuste';
import { FilaAjuste, FilaExterna, GrupoFilas } from '@/components/configuracion/shell/fila-ajuste';

// Cobros y facturas: cómo te pagan tus alumnas y qué sale en tus facturas.
//
// Eran cuatro formas de guardar en una pantalla —una barra que aparecía, un
// botón de acción, un «Guardar datos SEPA» siempre a la vista y un «Guardar
// política» gris en reposo—. Ahora cada cosa es una fila con su valor de hoy, y
// lo que se abre se guarda con el «Guardar» de su cajón; lo que mueve dinero
// (el IVA, las devoluciones) pregunta antes con la consecuencia.
//
// Las anclas de las filas (`#datos-fiscales`, `#integracion-stripe`…) abren su
// cajón. Stripe solo tiene cajón cuando está conectado: sin conectar, su acción
// va en la misma fila.

type CajonId = Extract<TarjetaId, 'datos-fiscales' | 'integracion-stripe' | 'domiciliaciones' | 'devoluciones'>;
const CAJONES = ['datos-fiscales', 'integracion-stripe', 'domiciliaciones', 'devoluciones'] as const satisfies readonly CajonId[];

type FilaDeCobros = Extract<(typeof FILAS_A_OTRA_PANTALLA)[number], { seccion: 'cobros' }>;
const esDeCobros = (f: (typeof FILAS_A_OTRA_PANTALLA)[number]): f is FilaDeCobros => f.seccion === 'cobros';

const ICONOS_OTRA_PANTALLA: Record<FilaDeCobros['id'], typeof Package> = { 'fila-paquetes': Package, 'fila-cobros': Wallet };

export function SeccionCobros({ showToast }: { showToast: (m: string) => void }) {
  const { studio, dataLoaded, planesTarifa } = useStudio();
  const stripe = useCobroConTarjeta(showToast);
  const { cajon, abrir, cerrar } = useCajonAbierto(CAJONES);

  function guardado(texto: string) {
    cerrar();
    showToast(texto);
  }

  const cargado = dataLoaded ? studio : null;
  const fiscales = cargado ? resumenDatosFiscales(cargado) : null;
  const valorOtraPantalla: Record<FilaDeCobros['id'], string | null> = {
    'fila-paquetes': resumenPlanesActivos(dataLoaded ? planesTarifa : null),
    'fila-cobros': null,
  };
  const props = { showToast, onGuardado: guardado };

  return (
    <>
      <GrupoFilas titulo="Tus facturas">
        <FilaAjuste id="datos-fiscales" icono={Receipt} valor={fiscales?.valor ?? null} estado={fiscales?.estado} onAbrir={abrir} />
      </GrupoFilas>

      <GrupoFilas titulo="Cobrar a tus alumnas">
        <FilaCobroConTarjeta c={stripe} onAbrir={() => abrir('integracion-stripe')} />
        <FilaAjuste id="domiciliaciones" icono={Landmark} valor={cargado ? resumenDomiciliaciones(cargado) : null} onAbrir={abrir} />
        <FilaAjuste id="devoluciones" icono={RotateCcw} valor={cargado ? resumenDevoluciones(cargado) : null} onAbrir={abrir} />
      </GrupoFilas>

      <GrupoFilas titulo="En otras pantallas">
        {FILAS_A_OTRA_PANTALLA.filter(esDeCobros).map(f => (
          <FilaExterna
            key={f.id}
            id={f.id}
            icono={ICONOS_OTRA_PANTALLA[f.id]}
            titulo={f.titulo}
            valor={valorOtraPantalla[f.id]}
            descripcion={f.resumen}
            href={f.href}
          />
        ))}
      </GrupoFilas>

      <CajonAjuste id="datos-fiscales" abierto={cajon === 'datos-fiscales'} onCerrar={cerrar}>
        <FormDatosFiscales {...props} />
      </CajonAjuste>
      <CajonAjuste id="integracion-stripe" abierto={cajon === 'integracion-stripe' && stripe.conectado} onCerrar={cerrar}>
        <DetalleCobroConTarjeta c={stripe} onGuardado={guardado} />
      </CajonAjuste>
      <CajonAjuste id="domiciliaciones" abierto={cajon === 'domiciliaciones'} onCerrar={cerrar}>
        <FormDomiciliaciones {...props} />
      </CajonAjuste>
      <CajonAjuste id="devoluciones" abierto={cajon === 'devoluciones'} onCerrar={cerrar}>
        <FormDevoluciones {...props} />
      </CajonAjuste>
    </>
  );
}
