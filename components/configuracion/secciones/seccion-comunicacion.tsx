'use client';

import { BellRing, Bot, Mail } from 'lucide-react';
import { useStudio } from '@/lib/studio-context';
import { resumenHerramienta } from '@/lib/configuracion/resumenes';
import { FILAS_A_OTRA_PANTALLA } from '@/lib/configuracion/secciones';
import { CajonAjuste, useCajonAbierto } from '@/components/configuracion/shell/cajon-ajuste';
import { FilaAjuste, FilaExterna, FilaInformativa, GrupoFilas } from '@/components/configuracion/shell/fila-ajuste';
import { FilaHerramienta } from '@/components/configuracion/shell/fila-herramienta';
import {
  DetalleGmail, DetalleWhatsapp, FilaGmail, FilaWhatsapp, FormRemitente, useGmail, useRemitente, useWhatsapp,
} from '@/components/configuracion/canales-comunicacion';

// Cómo me comunico: los correos que salen solos, con qué nombre salen y los
// canales conectados, en filas con su valor de hoy (15-sep, v2).
//
// Los correos automáticos siguen siendo su herramienta (#2061). WhatsApp y Gmail
// llevan UN estado y su acción en la fila o en su cajón (canales-comunicacion.tsx).
// El recordatorio de clase es de serie: se cuenta, no se configura aquí
// (lib/notificaciones/recordatorio-clase.ts: 24 h antes app + email + WhatsApp si
// está conectado; 1 h antes, solo la app).

const CAJONES = ['integracion-resend', 'integracion-whatsapp', 'integracion-gmail'] as const;

export function SeccionComunicacion({ showToast }: { showToast: (m: string) => void }) {
  const { plantillasEmail, plantillasEmailCargadas } = useStudio();
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

      <GrupoFilas titulo="Tentare lo hace así">
        <FilaInformativa
          icono={BellRing}
          titulo="El recordatorio de cada clase sale solo"
          detalle="24 h antes, por correo y en su app (y por WhatsApp si lo conectas); 1 h antes, en su app."
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
