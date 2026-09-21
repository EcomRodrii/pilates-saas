'use client';

import { useEffect, useState } from 'react';
import { Bot, Mail } from 'lucide-react';
import { useStudio } from '@/lib/studio-context';
import { resumenHerramienta } from '@/lib/configuracion/resumenes';
import { FILAS_A_OTRA_PANTALLA } from '@/lib/configuracion/secciones';
import { CajonAjuste, useCajonAbierto } from '@/components/configuracion/shell/cajon-ajuste';
import { FilaAjuste, FilaExterna, GrupoFilas } from '@/components/configuracion/shell/fila-ajuste';
import { FilaHerramienta } from '@/components/configuracion/shell/fila-herramienta';
import { dbListTextosAviso } from '@/lib/notifications/textos-estudio-db';
import {
  DetalleGmail, DetalleWhatsapp, FilaGmail, FilaWhatsapp, FormRemitente, useGmail, useRemitente, useWhatsapp,
} from '@/components/configuracion/canales-comunicacion';

// Cómo me comunico: los correos que salen solos, con qué nombre salen y los
// canales conectados, en filas con su valor de hoy (15-sep, v2).
//
// Los correos automáticos siguen siendo su herramienta (#2061). WhatsApp y Gmail
// llevan UN estado y su acción en la fila o en su cajón (canales-comunicacion.tsx).
// El recordatorio de clase sigue siendo de serie (sale solo), pero desde migr
// 20260921145514 el estudio elige su antelación y el texto de los avisos del
// móvil: herramienta «Avisos en el móvil».

const CAJONES = ['integracion-resend', 'integracion-whatsapp', 'integracion-gmail'] as const;

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
  const whatsapp = useWhatsapp(showToast);
  const gmail = useGmail(showToast);
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
        <FilaWhatsapp w={whatsapp} onAbrir={() => abrir('integracion-whatsapp')} />
        <FilaGmail g={gmail} onAbrir={() => abrir('integracion-gmail')} />
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
      {/* Sin conectar y con Meta, no hay nada que pegar: su acción es «Conectar» en la fila. */}
      <CajonAjuste id="integracion-whatsapp" abierto={cajon === 'integracion-whatsapp' && (whatsapp.conectado || !whatsapp.conMeta)} onCerrar={cerrar}>
        <DetalleWhatsapp w={whatsapp} {...props} />
      </CajonAjuste>
      <CajonAjuste id="integracion-gmail" abierto={cajon === 'integracion-gmail' && gmail.conectado} onCerrar={cerrar}>
        <DetalleGmail g={gmail} {...props} />
      </CajonAjuste>
      {/* El SDK de Meta solo se descarga donde está la fila de WhatsApp. */}
      {whatsapp.script}
    </>
  );
}
