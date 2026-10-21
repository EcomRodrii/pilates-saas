'use client';

// ─────────────────────────────────────────────────────────────────────────────
// «Compartir mi enlace»: la tarea 3 de «Pon en marcha tu estudio» (PR-5) y el
// destino del aviso «Tu horario está listo: falta que lo sepan tus alumnas»
// (`/dashboard?compartir=1`, a las 72 h sin reservas). Lo mismo que «¡Listo!»
// (components/onboarding/listo-para-reservar.tsx) en pequeño, sin la vista
// previa ni Tenti: el enlace, Copiar, WhatsApp, la hoja de compartir del móvil
// y el QR para recepción.
//
//   · «Copiado» solo si el portapapeles lo confirma: Safari falla sin avisar
//     (#994), y decir «Copiado» con el portapapeles vacío es peor que nada.
//   · Lo que de verdad sale del panel (copiado, mandado, compartido, el QR
//     descargado) se apunta en el embudo del alta como `enlace_compartido`, con
//     su canal: es lo que marca la tarea. Cerrar la hoja de compartir sin elegir
//     nada no cuenta.
//   · Si aún no hay ninguna clase que reservar, se dice antes de mandarlo.
// ─────────────────────────────────────────────────────────────────────────────

import { useState } from 'react';
import { Check, Copy, ExternalLink, MessageCircle, Share2 } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { BotonQr } from '@/components/configuracion/dialogo-qr';
import { copiarAlPortapapeles } from '@/lib/utils';
import { capturarEvento } from '@/lib/posthog-cliente';
import { apuntarEnlaceCompartido } from '@/lib/alta/embudo-cliente';
import { anotarEnEstadoAlta } from '@/lib/alta/estado-cliente';
import type { DetalleEmbudo } from '@/lib/alta/embudo';

export function CompartirEnlace({ abierto, onCerrar, slug, nombreEstudio, esPropietaria, avisoSinClase }: {
  abierto: boolean;
  onCerrar: () => void;
  slug: string;
  nombreEstudio: string;
  /** El embudo del alta es el de la propietaria: quien no lo es no manda nada que se vaya a rechazar. */
  esPropietaria: boolean;
  /** Si una alumna nueva todavía no puede reservar, por qué (se dice antes de mandarlo). */
  avisoSinClase?: string | null;
}) {
  const [copiado, setCopiado] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const url = typeof window === 'undefined' ? `/reservar/${slug}` : `${window.location.origin}/reservar/${slug}`;
  const textoWhatsApp = encodeURIComponent(`¡Ya puedes reservar tus clases en ${nombreEstudio}! Entra aquí y elige la que quieras: ${url}`);
  const puedeCompartirNativo = typeof navigator !== 'undefined' && typeof navigator.share === 'function'
    && typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches;

  const compartido = (canal: DetalleEmbudo) => {
    capturarEvento('enlace_compartido', { via: canal === 'compartir' ? 'nativo' : canal });
    if (!esPropietaria) return;
    apuntarEnlaceCompartido(canal);
    anotarEnEstadoAlta({ enlaceCompartido: true });
  };

  async function copiar() {
    setError(null);
    if (await copiarAlPortapapeles(url)) {
      compartido('copiar');
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2200);
      return;
    }
    setError('No hemos podido copiar. Selecciona el enlace y cópialo a mano.');
  }

  async function compartir() {
    setError(null);
    try {
      await navigator.share({ title: nombreEstudio, text: `¡Ya puedes reservar tus clases en ${nombreEstudio}!`, url });
      compartido('compartir');
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') return;
      setError('No hemos podido abrir el menú de compartir. Copia el enlace y pégalo donde quieras.');
    }
  }

  return (
    <Dialog open={abierto} onOpenChange={o => { if (!o) onCerrar(); }}>
      {/* `grid-cols-[minmax(0,1fr)]`: la columna implícita del grid es `auto` y crece hasta el
          enlace entero sin cortar; en un móvil el diálogo se salía por la izquierda (como pasó en «¡Listo!»). */}
      <DialogContent className="grid-cols-[minmax(0,1fr)] sm:max-w-md" data-testid="compartir-enlace">
        <DialogHeader>
          <DialogTitle className="text-lg font-semibold text-foreground">Comparte tu enlace de reservas</DialogTitle>
          <DialogDescription className="text-[13.5px] text-muted-foreground text-pretty">
            Pégalo en tu Instagram, en el grupo de WhatsApp de tus alumnas o en tu web. No hace falta que se descarguen nada.
          </DialogDescription>
        </DialogHeader>

        {avisoSinClase && (
          <p role="status" className="rounded-xl border border-warning/30 bg-warning/10 px-3 py-2.5 text-[13px] leading-snug text-foreground">
            {avisoSinClase}
          </p>
        )}

        {puedeCompartirNativo && (
          <button
            type="button"
            onClick={() => void compartir()}
            className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-full bg-primary px-5 text-[14px] font-semibold text-primary-foreground transition-[filter] hover:brightness-110"
          >
            <Share2 size={16} aria-hidden /> Compartir mi enlace
          </button>
        )}

        <div className="flex items-center gap-2 rounded-xl border border-border bg-card px-3 py-2.5">
          <span className="min-w-0 flex-1 truncate font-t-mono text-[12.5px] text-foreground" title={url}>{url}</span>
          <button
            type="button"
            onClick={() => void copiar()}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-[12.5px] font-semibold text-foreground transition-colors hover:bg-muted"
          >
            {copiado ? <Check size={13} strokeWidth={3} aria-hidden /> : <Copy size={13} aria-hidden />}
            {copiado ? 'Copiado' : 'Copiar'}
          </button>
        </div>
        {error && <p role="alert" className="text-[12.5px] leading-snug text-destructive">{error}</p>}

        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <a
            href={`https://wa.me/?text=${textoWhatsApp}`}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => compartido('whatsapp')}
            className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-brand-medio hover:underline"
          >
            <MessageCircle size={14} aria-hidden /> Mandarlo por WhatsApp
          </a>
          <a
            href={`/reservar/${slug}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-brand-medio hover:underline"
          >
            <ExternalLink size={14} aria-hidden /> Ver mi página
          </a>
        </div>

        <div>
          <BotonQr
            destino="reservas"
            url={url}
            slug={slug}
            estudio={nombreEstudio}
            nombreEnlace="Página de reservas"
            onDescargado={() => compartido('qr')}
          />
          <p className="mt-1.5 text-[12px] text-muted-foreground">Imprímelo para recepción: al escanearlo, se abre tu página.</p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
