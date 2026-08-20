'use client';

import { useState } from 'react';
import { Undo2 } from 'lucide-react';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { reembolsarRecibo } from '@/lib/api-client';
import { evaluarReembolso, type PoliticaReembolso, type ReciboParaReembolso } from '@/lib/billing/politica-reembolso';
import { formatEuro } from '@/lib/utils';

// ─────────────────────────────────────────────────────────────────────────────
// Devolver un recibo desde la pestaña Pagos de la clienta.
//
// Usa `evaluarReembolso()` — la MISMA función que el servidor. Escrita dos
// veces, el día que cambie una el botón invitaría a devolver algo que el
// endpoint rechaza, y la propietaria se comería un error después de confirmar.
//
// Cuando la política no lo permite el botón no desaparece: se enseña apagado
// con el motivo en el `title`. Un botón que falta no explica nada, y "¿por qué
// no puedo devolverle a esta señora?" es exactamente la pregunta que acaba en
// el chat de soporte.
// ─────────────────────────────────────────────────────────────────────────────

export function BotonDevolverRecibo({
  recibo, politica, onHecho, onEnviada, yaEnviada, bypassPolitica,
}: {
  recibo: ReciboParaReembolso & { id: string };
  politica: PoliticaReembolso;
  onHecho: (mensaje: string) => void;
  /** Se llama al enviarla, para que la fila cambie sin esperar a recargar. */
  onEnviada?: () => void;
  /**
   * D-8: reintento de una devolución que Stripe comunicó como FALLIDA. La
   * decisión de política ya se tomó al pedirla la primera vez — el servidor
   * la salta (`esReintentoTrasFallo` en /api/reembolsos) y este espejo evita
   * que el veredicto de cliente pinte gris el botón justo en los dos casos
   * del reintento: plazo vencido (SEPA falla días después) y la REVERTIDA
   * leída como «bono ya usado».
   */
  bypassPolitica?: boolean;
  /** Ya hay una devolución en vuelo para este recibo: no se ofrece otra. */
  yaEnviada?: boolean;
}) {
  const [abierto, setAbierto] = useState(false);
  const [enviando, setEnviando] = useState(false);

  // Con la política apagada no se enseña nada: no es que este recibo no pueda,
  // es que el estudio no ha activado la función. Un botón gris en cada fila
  // sería ruido permanente para quien nunca va a usarlo.
  if (!politica.activos) return null;
  // Tampoco tiene sentido ofrecerlo sobre lo que nunca se cobró.
  if (recibo.estado !== 'COBRADO' && recibo.estado !== 'DEVUELTO') return null;
  // Una devolución ya enviada y sin confirmar: el botón desaparece. Volver a
  // pulsarlo no devolvería dos veces (la clave de idempotencia lo impide) pero
  // sí invita a intentarlo, que es justo lo que no queremos con dinero.
  if (yaEnviada) return null;

  const veredicto = bypassPolitica
    ? { permitido: true as const }
    : evaluarReembolso(politica, recibo, new Date());

  if (!veredicto.permitido) {
    return (
      <button
        type="button"
        disabled
        title={veredicto.mensaje}
        className="inline-flex items-center gap-1 text-xs font-bold px-2.5 py-1 rounded-lg text-muted-foreground opacity-60 cursor-not-allowed"
      >
        <Undo2 size={12} />Devolver
      </button>
    );
  }

  async function confirmar() {
    setEnviando(true);
    const res = await reembolsarRecibo(recibo.id);
    setEnviando(false);
    setAbierto(false);
    if ('ok' in res) {
      // Marca local para que la fila cambie YA, sin esperar a recargar. El dato
      // de verdad queda guardado en el recibo (`reembolso_solicitado_en`), así
      // que al recargar la pantalla se sigue viendo — esto solo cubre el hueco
      // entre pulsar y volver a leer.
      onEnviada?.();
      // No se dice "devuelto" en pasado: el recibo lo marca el webhook de
      // Stripe un momento después. Prometer aquí que ya está hecho es la misma
      // escritura optimista que ya ha costado bugs en este repo.
      onHecho('Devolución enviada. En unos segundos el recibo quedará como devuelto; el dinero tarda entre 5 y 10 días en llegar a su banco.');
    } else {
      onHecho(res.error);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setAbierto(true)}
        className="inline-flex items-center gap-1 text-xs font-bold px-2.5 py-1 rounded-lg transition-colors"
        style={{ backgroundColor: 'color-mix(in srgb, var(--destructive) 12%, var(--card))', color: 'var(--destructive)' }}
      >
        <Undo2 size={12} />Devolver
      </button>
      <ConfirmDialog
        open={abierto}
        onOpenChange={setAbierto}
        destructivo
        titulo={`¿Devolver ${formatEuro(recibo.importe)}?`}
        descripcion={
          `El dinero vuelve a la tarjeta con la que pagó (tarda unos días en aparecer en su banco) y el recibo `
          + `quedará marcado como devuelto. Esto no se puede deshacer desde Tentare.`
          + (recibo.sesionesAlEntregar != null
            ? ' Después te preguntaremos si quieres quitarle también las sesiones del bono.'
            : '')
        }
        textoConfirmar={enviando ? 'Devolviendo…' : 'Sí, devolver'}
        onConfirm={confirmar}
      />
    </>
  );
}
