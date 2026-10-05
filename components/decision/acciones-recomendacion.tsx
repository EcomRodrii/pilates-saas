'use client';

import Link from 'next/link';
import { Check, Clock3, Euro, Mail, MessageCircle, Send, UserCheck, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { admiteYaContactada, efectoDe, ROTULO_EFECTO, TONO_TRAS_DECIDIR, trasDecidir, type EfectoAprobar } from '@/lib/decision/efecto-aprobar';
import type { RecomendacionAPI } from './use-decisiones';

const ICONO: Record<EfectoAprobar, typeof Check> = {
  COBRAR: Euro,
  ENVIAR_EMAIL: Mail,
  ENVIAR_MENSAJE: Send,
  MARCAR: Check,
};

// La botonera de una recomendación, la misma en el veredicto del día y en cada
// fila de situación. El botón principal dice lo que hace de verdad al pulsarlo
// —cobrar, mandarle un mensaje a la socia o solo marcarla—, y eso lo decide
// lib/decision/efecto-aprobar.ts, no cada tarjeta por su cuenta: el veredicto
// tenía un «Hecho» genérico que cobraba o escribía a la socia sin decirlo, y la
// fila solo conocía dos tipos.
export function AccionesRecomendacion({
  recomendacion, procesando, tardando, whatsappHref, onAprobar, onYaContactada, onYaLoSe, onPosponer,
}: {
  recomendacion: RecomendacionAPI;
  /** Hay una petición en vuelo para ESTA recomendación: botones apagados hasta la respuesta. */
  procesando?: boolean;
  /** Un cobro aprobado al que se le agotó el tope de preguntar cómo ha ido (use-decisiones.ts). */
  tardando?: boolean;
  whatsappHref?: string | null;
  onAprobar: () => void;
  onYaContactada: () => void;
  onYaLoSe: () => void;
  /** Solo el veredicto ofrece «Recuérdamelo». */
  onPosponer?: () => void;
}) {
  const efecto = efectoDe(recomendacion);
  const decidida = trasDecidir(efecto, recomendacion.estado, { resultado: recomendacion.resultado, tardando });

  // Ya no espera a nadie: en vez de botones que solo podrían fallar, dónde ha
  // quedado. Un cobro aprobado no se pinta como cobrado: lo hace el ejecutor
  // después, así que dice que está en marcha mientras la pantalla pregunta, y
  // luego lo que pasó de verdad —cobrado, en curso, sin confirmar, cobrado sin
  // registrar o por qué no—. El tono sale de lo que pasó, no del estado de la
  // fila (TONO_TRAS_DECIDIR): un cobro sin confirmar o cobrado sin registrar
  // queda FALLIDA y no es un fallo que pintar de rojo. Y «Lo ves en Cobros»
  // solo cuando allí hay algo que ver: un rechazo no deja nada en Cobros.
  if (decidida) {
    const tono = TONO_TRAS_DECIDIR[decidida.tipo];
    return (
      <p
        role="status"
        data-tono={tono}
        className={`pt-1 text-[13px] ${tono === 'apagado' ? 'text-muted-foreground' : 'font-medium text-foreground'}`}
        style={tono === 'fallo' ? { color: 'var(--destructive)' } : tono === 'aviso' ? { color: 'var(--warning)' } : undefined}
      >
        {decidida.texto}
        {decidida.enlaceACobros && (
          <>
            {' '}Lo ves en{' '}
            <Link href="/cobros" className="font-semibold underline underline-offset-2" style={{ color: 'var(--brand-secondary)' }}>Cobros</Link>.
          </>
        )}
      </p>
    );
  }

  const Icono = ICONO[efecto];
  return (
    <div className="flex flex-wrap items-center gap-2 pt-1">
      <Button size="sm" onClick={onAprobar} disabled={procesando}>
        <Icono size={14} /> {ROTULO_EFECTO[efecto]}
      </Button>
      {whatsappHref && (
        <a href={whatsappHref} target="_blank" rel="noopener noreferrer" className="inline-flex">
          <Button size="sm" variant="outline" type="button" tabIndex={-1}>
            <MessageCircle size={14} /> WhatsApp
          </Button>
        </a>
      )}
      {/* Para cuando ya le ha escrito o la ha llamado por su cuenta (p. ej. con
          el botón de WhatsApp de al lado): la marca hecha SIN mandarle otro
          mensaje. Solo donde aprobar le escribiría. */}
      {admiteYaContactada(efecto) && (
        <Button size="sm" variant="outline" onClick={onYaContactada} disabled={procesando}>
          <UserCheck size={14} /> Ya la he contactado
        </Button>
      )}
      <Button size="sm" variant="outline" onClick={onYaLoSe} disabled={procesando}>
        <X size={14} /> Ya lo sé
      </Button>
      {onPosponer && (
        <Button size="sm" variant="outline" onClick={onPosponer} disabled={procesando}>
          <Clock3 size={14} /> Recuérdamelo
        </Button>
      )}
    </div>
  );
}
