'use client';

import { FileSignature, HeartPulse, ListPlus, ShoppingBag, Sparkles } from 'lucide-react';
import { useStudio } from '@/lib/studio-context';
import { hayPenalizacionConfigurada } from '@/lib/configuracion/penalizacion-activa';
import {
  resumenCompraPublica, resumenContrato, resumenCuestionarioSalud, resumenDatosExtra,
} from '@/lib/configuracion/resumenes';
import type { TarjetaId } from '@/lib/configuracion/secciones';
import { FormContratoYPrivacidad } from '@/components/configuracion/tab-estudio-legal';
import { FormCompraPublica } from '@/components/configuracion/tarjeta-compra-publica';
import { TabCamposPersonalizados } from '@/components/configuracion/tab-campos-personalizados';
import { TabCuestionarioSalud } from '@/components/configuracion/tab-cuestionario-salud';
import { CajonAjuste, useCajonAbierto } from '@/components/configuracion/shell/cajon-ajuste';
import { FilaAjuste, FilaInterruptor, GrupoFilas } from '@/components/configuracion/shell/fila-ajuste';

// Alta de alumnas: lo que acepta y rellena una alumna nueva.
//
// Filas con su valor de hoy. El contrato y la compra desde tu enlace se cambian
// en su cajón, con su «Guardar»; la valoración inicial es un sí/no que se guarda
// al tocarlo.
//
// Los datos extra y el cuestionario de salud son catálogos, pero cortos —unas
// pocas preguntas de cuatro campos— y se tocan una vez: van en un cajón y no en
// una pantalla de herramienta (`?abrir=`), que es para lo que necesita el ancho
// entero (el constructor de widgets, la rejilla de tipos de clase). Cada
// pregunta se guarda con su propio botón, y cerrar con una a medias pregunta.

type CajonId = Extract<TarjetaId, 'contrato-y-privacidad' | 'compra-desde-tu-enlace' | 'datos-extra-de-la-ficha' | 'cuestionario-de-salud'>;
const CAJONES = ['contrato-y-privacidad', 'compra-desde-tu-enlace', 'datos-extra-de-la-ficha', 'cuestionario-de-salud'] as const satisfies readonly CajonId[];

export function SeccionAltas({ showToast }: { showToast: (m: string) => void }) {
  const {
    studio, dataLoaded, tiposClase, updateStudio, textosLegalesPropios,
    camposPersonalizados, camposPersonalizadosCargados, plantillasCuestionarioSalud, cuestionarioSaludCargado,
  } = useStudio();
  const { cajon, abrir, cerrar } = useCajonAbierto(CAJONES);

  function guardado(texto: string) {
    cerrar();
    showToast(texto);
  }

  const cargado = dataLoaded ? studio : null;
  const contrato = resumenContrato({
    propios: cargado ? textosLegalesPropios : null,
    hayPenalizacion: hayPenalizacionConfigurada(studio, tiposClase),
  });

  // ⚠️ Se comprueba el resultado antes de decir nada: aquí se decide si a las
  // alumnas se les pregunta o no por sus lesiones.
  async function cambiarValoracion(v: boolean): Promise<string | null> {
    const res = await updateStudio({ valoracionInicialActiva: v });
    if (!res.ok) return res.error;
    showToast(v ? 'La valoración inicial ya está activa' : 'Valoración inicial desactivada');
    return null;
  }

  const props = { showToast, onGuardado: guardado };

  return (
    <>
      <GrupoFilas titulo="Lo que acepta">
        <FilaAjuste id="contrato-y-privacidad" icono={FileSignature} valor={contrato.valor} estado={contrato.estado} onAbrir={abrir} />
        <FilaAjuste id="compra-desde-tu-enlace" icono={ShoppingBag} valor={cargado ? resumenCompraPublica(cargado.compraPublicaModo) : null} onAbrir={abrir} />
      </GrupoFilas>

      <GrupoFilas titulo="Lo que le preguntas">
        <FilaAjuste
          id="datos-extra-de-la-ficha"
          icono={ListPlus}
          valor={resumenDatosExtra(camposPersonalizadosCargados ? camposPersonalizados : null)}
          onAbrir={abrir}
        />
        <FilaInterruptor id="valoracion-inicial" icono={Sparkles} on={cargado ? cargado.valoracionInicialActiva : null} onCambiar={cambiarValoracion} />
        <FilaAjuste
          id="cuestionario-de-salud"
          icono={HeartPulse}
          valor={resumenCuestionarioSalud(cuestionarioSaludCargado ? plantillasCuestionarioSalud : null)}
          onAbrir={abrir}
        />
      </GrupoFilas>

      <CajonAjuste id="contrato-y-privacidad" abierto={cajon === 'contrato-y-privacidad'} onCerrar={cerrar}>
        <FormContratoYPrivacidad {...props} />
      </CajonAjuste>
      <CajonAjuste id="compra-desde-tu-enlace" abierto={cajon === 'compra-desde-tu-enlace'} onCerrar={cerrar}>
        <FormCompraPublica {...props} />
      </CajonAjuste>
      <CajonAjuste id="datos-extra-de-la-ficha" abierto={cajon === 'datos-extra-de-la-ficha'} onCerrar={cerrar}>
        <TabCamposPersonalizados showToast={showToast} />
      </CajonAjuste>
      <CajonAjuste id="cuestionario-de-salud" abierto={cajon === 'cuestionario-de-salud'} onCerrar={cerrar}>
        <TabCuestionarioSalud showToast={showToast} />
      </CajonAjuste>
    </>
  );
}
