'use client';

import { useState } from 'react';
import { Check, X, Clock3, MessageCircle } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import type { VeredictoAPI } from './use-decisiones';

// El Umbral (lib/decision/umbral.ts), en pantalla: el elemento principal de
// Centro de Control ya no es una lista — es una sola frase, o silencio. La
// evidencia y el resto de detalle quedan ocultos hasta que se piden (ver
// nota de diseño "un mensaje, uno").

const QUE_REVISO = [
  'reservas y ocupación de las clases',
  'pagos y renovaciones',
  'asistencia y patrones de baja',
  'carga de trabajo del equipo',
];

export function VeredictoDelDia({ veredicto, onHecho, onYaLoSe, onPosponer, procesando, whatsappHref }: {
  veredicto: VeredictoAPI;
  onHecho: () => void;
  onYaLoSe: () => void;
  onPosponer: () => void;
  procesando?: boolean;
  whatsappHref?: string | null;
}) {
  const [porQueAbierto, setPorQueAbierto] = useState(false);
  const [queRevisoAbierto, setQueRevisoAbierto] = useState(false);

  if (veredicto.tipo === 'SIN_ANALIZAR') {
    return (
      <Card>
        <CardContent className="flex flex-col gap-1 py-6 text-center">
          <p className="text-[14px] text-muted-foreground">
            Todavía no he hecho mi primer análisis de hoy. Vuelve en un rato.
          </p>
        </CardContent>
      </Card>
    );
  }

  if (veredicto.tipo === 'SILENCIO') {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-2 py-8 text-center">
          <div aria-hidden className="h-8 w-8 rounded-full" style={{ border: '2.5px solid var(--success)' }} />
          <h2 className="font-heading text-[18px] font-semibold text-foreground">
            {veredicto.semanaTranquila ? 'Esta semana no hubo nada que mereciera interrumpirte.' : 'Todo va bien.'}
          </h2>
          <p className="max-w-sm text-[13.5px] text-muted-foreground">
            No he encontrado nada que necesite tu criterio {veredicto.semanaTranquila ? 'estos días' : 'hoy'}.
          </p>
          <button
            type="button"
            onClick={() => setQueRevisoAbierto(v => !v)}
            className="mt-2 text-[12px] font-semibold underline underline-offset-2"
            style={{ color: 'var(--brand-secondary)' }}
          >
            {queRevisoAbierto ? 'Ocultar' : '¿Qué he estado mirando?'}
          </button>
          {queRevisoAbierto && (
            <ul className="mt-1 flex flex-col gap-1 text-[12.5px] text-muted-foreground">
              {QUE_REVISO.map(item => <li key={item}>{item}</li>)}
            </ul>
          )}
        </CardContent>
      </Card>
    );
  }

  const r = veredicto.recomendacion;
  if (!r) return null; // MENSAJE sin recomendación viva (ya gestionada por otra vía) — no se pinta

  return (
    <Card>
      <CardContent className="flex flex-col gap-3">
        <h2 className="font-heading text-[20px] leading-snug font-semibold text-foreground">{r.titulo}</h2>
        <p className="text-[14.5px] leading-relaxed text-muted-foreground">{r.motivo}</p>

        {veredicto.fraseConfianza && (
          <p className="text-[13px] font-medium text-foreground">{veredicto.fraseConfianza}</p>
        )}

        <button
          type="button"
          onClick={() => setPorQueAbierto(v => !v)}
          className="w-fit text-[12px] font-semibold underline underline-offset-2"
          style={{ color: 'var(--brand-secondary)' }}
        >
          {porQueAbierto ? 'Ocultar evidencia' : '¿Por qué?'}
        </button>
        {porQueAbierto && (
          <ul className="flex flex-col gap-1 border-l-2 pl-3 text-[12.5px] text-muted-foreground" style={{ borderColor: 'var(--border)' }}>
            {r.confianza.evidencia.map((e, i) => <li key={i}>{e}</li>)}
          </ul>
        )}

        <div className="flex flex-wrap items-center gap-2 pt-1">
          <Button size="sm" onClick={onHecho} disabled={procesando}>
            <Check size={14} /> Hecho
          </Button>
          {whatsappHref && (
            <a href={whatsappHref} target="_blank" rel="noopener noreferrer" className="inline-flex">
              <Button size="sm" variant="outline" type="button" tabIndex={-1}>
                <MessageCircle size={14} /> WhatsApp
              </Button>
            </a>
          )}
          <Button size="sm" variant="outline" onClick={onYaLoSe} disabled={procesando}>
            <X size={14} /> Ya lo sé
          </Button>
          <Button size="sm" variant="outline" onClick={onPosponer} disabled={procesando}>
            <Clock3 size={14} /> Recuérdamelo
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
