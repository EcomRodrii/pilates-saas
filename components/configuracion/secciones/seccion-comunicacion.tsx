'use client';

import { useEffect, useState } from 'react';
import { Bot, MessageCircle, Mail } from 'lucide-react';
import { useStudio } from '@/lib/studio-context';
import { resumenHerramienta } from '@/lib/configuracion/resumenes';
import { FILAS_A_OTRA_PANTALLA, seccionPorId, tarjetaPorId } from '@/lib/configuracion/secciones';
import { CajonAjuste, useCajonAbierto } from '@/components/configuracion/shell/cajon-ajuste';
import { FilaAjuste, FilaExterna, FilaOtraSeccion, GrupoFilas } from '@/components/configuracion/shell/fila-ajuste';
import { FilaHerramienta } from '@/components/configuracion/shell/fila-herramienta';
import { dbListTextosAviso } from '@/lib/notifications/textos-estudio-db';
import { FormRemitente, useRemitente } from '@/components/configuracion/canales-comunicacion';

// Cómo me comunico: los correos que salen solos y con qué nombre salen, en filas
// con su valor de hoy (15-sep, v2). WhatsApp se conecta en Integraciones
// (16-oct-2026): aquí queda una fila que lleva allí.
//
// Los correos automáticos siguen siendo su herramienta (#2061).
// El recordatorio de clase sigue siendo de serie (sale solo), pero desde migr
// 20260921145514 el estudio elige su antelación y el texto de los avisos del
// móvil: herramienta «Avisos en el móvil».

const CAJONES = ['integracion-resend'] as const;

export function SeccionComunicacion({ showToast }: { showToast: (m: string) => void }) {
  const { studio, plantillasEmail, plantillasEmailCargadas } = useStudio();
  // Sin leerlos, la fila no dice cuántos textos son suyos: `null`, no «0».
  const [textosPropios, setTextosPropios] = useState<number | null>(null);
  const studioId = studio?.id;
  useEffect(() => {
    if (!studioId) return;
    let vivo = true;
    dbListTextosAviso(studioId).then(t => { if (vivo) setTextosPropios(Object.keys(t).length); }).catch(() => {});
    return () => { vivo = false; };
  }, [studioId]);
  const remitente = useRemitente();
  const { cajon, abrir, cerrar } = useCajonAbierto(CAJONES);

  function guardado(texto: string) {
    cerrar();
    showToast(texto);
  }

  const props = { showToast, onGuardado: guardado };
  const filaCorreos = {
    id: 'correos-automaticos' as const,
    valor: resumenHerramienta('correos-automaticos', { correos: plantillasEmailCargadas ? plantillasEmail : null }),
  };

  return (
    <>
      <GrupoFilas titulo="Tus correos">
        <FilaHerramienta {...filaCorreos} />
        <FilaAjuste id="integracion-resend" icono={Mail} valor={remitente.valor} onAbrir={abrir} />
      </GrupoFilas>

      <GrupoFilas titulo="Canales conectados">
        <FilaOtraSeccion
          id="fila-a-integraciones"
          icono={MessageCircle}
          titulo={tarjetaPorId('integracion-whatsapp').titulo}
          valor={`En «${seccionPorId('conexiones').titulo}»`}
          descripcion="Se conecta en Integraciones, junto al resto de tus conexiones."
          seccion="conexiones"
          ancla="integracion-whatsapp"
        />
      </GrupoFilas>

      <GrupoFilas titulo="Sus avisos">
        <FilaHerramienta
          id="avisos-del-movil"
          valor={resumenHerramienta('avisos-del-movil', {
            avisosMovil: studio ? {
              largoHoras: studio.recordatorioLargoHoras ?? 24,
              cortoMinutos: studio.recordatorioCortoMinutos ?? 60,
              textosPropios,
            } : null,
          })}
        />
      </GrupoFilas>

      <GrupoFilas titulo="En otras pantallas">
        {FILAS_A_OTRA_PANTALLA.filter(f => f.seccion === 'comunicacion').map(f => (
          <FilaExterna key={f.id} id={f.id} icono={Bot} titulo={f.titulo} valor={null} descripcion={f.resumen} href={f.href} />
        ))}
      </GrupoFilas>

      <CajonAjuste id="integracion-resend" abierto={cajon === 'integracion-resend'} onCerrar={cerrar}>
        <FormRemitente remitente={remitente} onGuardado={guardado} />
      </CajonAjuste>
    </>
  );
}
