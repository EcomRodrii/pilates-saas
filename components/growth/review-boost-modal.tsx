'use client';

// ─────────────────────────────────────────────────────────────────────────────
// Review Boost — modal de feedback tras el trial. Overlay, no pantalla
// completa (a diferencia de PantallaBienvenida): no debe bloquear el panel.
//
// `elegible` (¿debería mostrarse, según los datos del estudio?) se DERIVA en
// cada render; `open` (¿está mostrándose AHORA?) es estado local, decidido
// UNA vez en un efecto — nunca directamente `open={elegible}`. Dos bugs
// reales encontrados y corregidos, los dos con la misma raíz («la
// visibilidad no puede depender de algo que el propio modal escribe o que
// coincide con el instante del montaje»):
//
//  1. Marcar `reviewBoostMostradoEn` al ABRIR (en vez de al cerrar) hacía que
//     la propia condición de "primera vez" pasara a falso a media
//     interacción — el modal se desmontaba solo mientras la propietaria
//     pulsaba una estrella (encontrado con una prueba real en navegador).
//  2. Con `open={elegible}` ya en `true` en el MISMO render que la
//     navegación a /dashboard, el diálogo se autocerraba casi al instante en
//     producción — el clic que llevó hasta aquí (u otro listener global del
//     panel) llegaba a la capa de "clic fuera" justo al montarse, y cero
//     feedbacks llegaron a guardarse. Diferir la apertura a un efecto (tras
//     el evento que disparó el render) rompe esa carrera.
//
// "Cerrar" (`cerrar()`) escribe `reviewBoostMostradoEn`/`Pospuesto` — nunca
// al abrir.
//
// La recompensa (20% primer mes) se concede por dar feedback interno honesto
// 4-5★, NUNCA por el clic en Capterra/GetApp — ver tentare-os.md, cumplimiento
// de sus normas de reseñas incentivadas. El enlace externo es una invitación
// aparte, sin condicionar.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import { Star, PartyPopper } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useStudio } from '@/lib/studio-context';
import { authHeader } from '@/lib/api-client';
import { capturarEvento } from '@/lib/posthog-cliente';
import { debeMostrarModal } from '@/lib/growth/review-boost';
import { REVIEW_BOOST_PLATAFORMAS } from '@/lib/growth/review-boost-plataformas';
import type { Studio } from '@/lib/types';

type Pantalla = 'rating' | 'negativo' | 'positivo';

async function enviarFeedback(rating: number, comentario?: string) {
  const res = await fetch('/api/growth/review-boost/feedback', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(await authHeader()) },
    body: JSON.stringify({ rating, comentario }),
  });
  return res.ok;
}

export function ReviewBoostModal({ studio, rol }: { studio: Studio | null; rol: string | null }) {
  const { updateStudio } = useStudio();
  const [open, setOpen] = useState(false);
  const [pantalla, setPantalla] = useState<Pantalla>('rating');
  const [rating, setRating] = useState(0);
  const [comentario, setComentario] = useState('');
  const [enviando, setEnviando] = useState(false);
  // Feedback ya enviado al servidor en ESTA sesión del modal — al cerrar,
  // distingue "respondió" (solo marca visto) de "cerró sin responder" (marca
  // visto + pospuesto, para la regla de reaparición a los 14 días).
  const respondidoRef = useRef(false);
  // Bug real en producción (2026-08-21): con `open` derivado del prop y ya en
  // `true` en el MISMO render que la navegación a /dashboard, el diálogo se
  // autocerraba casi al instante — el propio clic que llevó hasta aquí (u
  // otro listener global del panel, ⌘K/tour) llegaba a la capa de "clic
  // fuera" del diálogo justo al montarse. Cero feedbacks llegaron a guardarse
  // porque el modal desaparecía antes de que diera tiempo a responder.
  // Diferir la apertura a un efecto (después del evento que disparó el
  // render) rompe esa carrera: para cuando `setOpen(true)` corre, cualquier
  // clic en curso ya ha terminado de despacharse.
  const decididoRef = useRef(false);

  const elegible = rol === 'PROPIETARIO' && !!studio && debeMostrarModal({
    reviewBoostElegibleEn: studio.reviewBoostElegibleEn,
    reviewBoostMostradoEn: studio.reviewBoostMostradoEn,
    reviewBoostPospuestoEn: studio.reviewBoostPospuestoEn,
    reviewBoostVecesMostrado: studio.reviewBoostVecesMostrado,
  });

  useEffect(() => {
    if (decididoRef.current || !elegible) return;
    decididoRef.current = true;
    setOpen(true);
    capturarEvento('review_boost_shown');
  }, [elegible]);

  if (!open) return null;

  function cerrar(sinResponder: boolean) {
    setOpen(false);
    const cambios: Partial<Studio> = {};
    if (!studio!.reviewBoostMostradoEn) cambios.reviewBoostMostradoEn = new Date().toISOString();
    if (sinResponder && !respondidoRef.current) {
      cambios.reviewBoostPospuestoEn = new Date().toISOString();
      cambios.reviewBoostVecesMostrado = (studio!.reviewBoostVecesMostrado ?? 0) + 1;
    }
    if (Object.keys(cambios).length) void updateStudio(cambios);
  }

  async function elegirEstrellas(n: number) {
    setRating(n);
    if (n >= 4) {
      setEnviando(true);
      await enviarFeedback(n);
      respondidoRef.current = true;
      setEnviando(false);
      setPantalla('positivo');
    } else {
      setPantalla('negativo');
    }
  }

  async function enviarComentarioNegativo() {
    setEnviando(true);
    await enviarFeedback(rating, comentario);
    respondidoRef.current = true;
    setEnviando(false);
    cerrar(false);
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) cerrar(true); }}>
      <DialogContent className="max-w-[min(calc(100%-2rem),26rem)]">
        {pantalla === 'rating' && (
          <>
            <DialogHeader>
              <DialogTitle>¿Qué te está pareciendo Tentare?</DialogTitle>
              <DialogDescription>
                Tu opinión nos ayuda a mejorar Tentare y a que otros estudios puedan descubrirlo.
              </DialogDescription>
            </DialogHeader>
            <div className="flex items-center justify-center gap-1.5 py-2" role="radiogroup" aria-label="Valoración de 1 a 5 estrellas">
              {[1, 2, 3, 4, 5].map((n) => (
                <button
                  key={n} type="button" role="radio" aria-checked={rating === n} aria-label={`${n} estrellas`}
                  disabled={enviando}
                  onClick={() => void elegirEstrellas(n)}
                  className="flex size-11 items-center justify-center rounded-full transition-transform hover:scale-110 focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring disabled:opacity-50"
                >
                  <Star className={rating >= n ? 'size-7 fill-amber-400 text-amber-400' : 'size-7 text-muted-foreground'} />
                </button>
              ))}
            </div>
          </>
        )}

        {pantalla === 'negativo' && (
          <>
            <DialogHeader>
              <DialogTitle>Queremos hacerlo mejor</DialogTitle>
              <DialogDescription>Cuéntanos qué podemos mejorar y lo revisaremos.</DialogDescription>
            </DialogHeader>
            <textarea
              value={comentario} onChange={(e) => setComentario(e.target.value)}
              placeholder="Lo que quieras contarnos (opcional)"
              rows={4} maxLength={2000}
              className="w-full resize-none rounded-xl border border-border bg-background px-3 py-2 text-[13px] text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring"
            />
            <div className="flex justify-end">
              <Button onClick={() => void enviarComentarioNegativo()} disabled={enviando}>
                Enviar
              </Button>
            </div>
          </>
        )}

        {pantalla === 'positivo' && (
          <>
            <DialogHeader>
              <DialogTitle>Nos alegra mucho saberlo ❤️</DialogTitle>
              <DialogDescription>
                🎁 Como agradecimiento por compartir tu experiencia, te ofrecemos un 20% de descuento en tu primer
                mes. Se aplicará solo al elegir tu plan, sin ningún código que teclear.
              </DialogDescription>
            </DialogHeader>
            <div className="flex items-center gap-2 rounded-xl bg-emerald-500/10 px-3 py-2.5 text-[12.5px] text-emerald-700 dark:text-emerald-400">
              <PartyPopper className="size-4 shrink-0" aria-hidden />
              20% de descuento reservado en tu cuenta.
            </div>
            <p className="text-[12.5px] text-muted-foreground">
              Si tienes un minuto, nos ayudaría muchísimo que compartieras tu experiencia con otros estudios:
            </p>
            <div className="flex flex-col gap-2">
              {/* bg-white/text-neutral fijos a propósito, no tokens de tema: son
                  logos de marca ajena sobre fondo transparente con tinta oscura
                  — en modo oscuro un fondo del panel los dejaría ilegibles. */}
              {REVIEW_BOOST_PLATAFORMAS.map((p) => (
                <a
                  key={p.id} href={p.url} target="_blank" rel="noopener noreferrer"
                  onClick={() => capturarEvento('review_boost_platform_clicked', { plataforma: p.id })}
                  className="flex items-center justify-center gap-2.5 rounded-xl border border-border bg-white px-3.5 py-2.5 hover:bg-muted"
                >
                  <Image src={p.logo} alt={p.nombre} width={92} height={26} className="h-[22px] w-auto" />
                  <span className="text-[13px] font-semibold text-neutral-700">Reseñar en {p.nombre}</span>
                </a>
              ))}
            </div>
            <div className="flex justify-end">
              <Button variant="ghost" onClick={() => cerrar(false)}>Cerrar</Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
