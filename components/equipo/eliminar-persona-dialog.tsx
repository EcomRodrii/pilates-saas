'use client';

import { useState } from 'react';
import { AlertTriangle, Loader2, Trash2 } from 'lucide-react';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { eliminarPersonaDelEquipo } from '@/lib/api-client';
import {
  COMPLETAR_ELIMINACION, LO_QUE_NO_ALCANZA, NOMBRE_DE_UNA_PALABRA_NO_SE_BUSCA, NOMBRE_PERSONA_ELIMINADA,
  NO_SE_PUEDE_DESHACER, SE_BORRA, SE_CONSERVA_SIN_SU_NOMBRE, nombreSePuedeReconocerEnTextos,
} from '@/lib/equipo/eliminar-persona-reglas';

/**
 * Eliminar definitivamente a alguien del equipo (art. 17 RGPD): anonimiza su ficha y borra su
 * cuenta de acceso. Solo se ofrece a la propietaria y sobre alguien ya de baja
 * (`puedeEliminarDefinitivamente`); la cerradura real está en `/api/equipo/eliminar`.
 *
 * Tres caras:
 *   · confirmar: qué se borra, qué se conserva y lo que no alcanza; pide entender que no se deshace.
 *   · completar: la persona ya está eliminada (`Persona eliminada`) pero le falta borrar la cuenta de acceso
 *     o la foto. No hay nada nuevo que confirmar: solo reintentar.
 *   · resultado: si la respuesta trae algo que contar (lo que falta, o que su nombre no se pudo buscar en los
 *     textos) se queda en pantalla en vez de ir a un aviso que desaparece.
 *
 * Sin estado que sincronizar con efectos: quien lo usa le pone `key={persona.id}` y el
 * diálogo se monta limpio cada vez (casilla sin marcar, sin error de la vez anterior).
 */
export function EliminarPersonaDialog({ persona, onClose, onEliminada }: {
  persona: { id: string; nombre: string } | null;
  onClose: () => void;
  /** Se llama en cuanto el servidor acepta, con o sin aviso: quien lo usa recarga y, si no hay aviso, cierra. */
  onEliminada: (r: { nombre: string; completa: boolean; aviso: string | null }) => void;
}) {
  const [entiendo, setEntiendo] = useState(false);
  const [eliminando, setEliminando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resultado, setResultado] = useState<{ completa: boolean; aviso: string } | null>(null);

  const completando = persona?.nombre === NOMBRE_PERSONA_ELIMINADA;
  const nombreSinBuscar = persona ? !completando && !nombreSePuedeReconocerEnTextos(persona.nombre) : false;

  async function eliminar() {
    if (!persona || eliminando || (!completando && !entiendo)) return;
    setEliminando(true);
    setError(null);
    const res = await eliminarPersonaDelEquipo(persona.id);
    setEliminando(false);
    if ('error' in res) { setError(res.error); return; }
    if (res.aviso) setResultado({ completa: res.completa, aviso: res.aviso });
    onEliminada({ nombre: persona.nombre, completa: res.completa, aviso: res.aviso });
  }

  return (
    <Dialog open={persona !== null} onOpenChange={open => { if (!open && !eliminando) onClose(); }}>
      <DialogContent data-testid="dialogo-eliminar-persona" className="pb-0">
        {resultado ? (
          <>
            <DialogHeader>
              <DialogTitle>{resultado.completa ? `${persona?.nombre} se ha eliminado` : 'Falta terminar de borrar'}</DialogTitle>
            </DialogHeader>
            <p data-testid="resultado-eliminar-persona" className="text-[13px] leading-relaxed text-muted-foreground">{resultado.aviso}</p>
            <DialogFooter className="sticky bottom-0 mb-0 bg-popover">
              <button
                type="button" onClick={onClose} data-testid="cerrar-resultado-eliminar-persona"
                className="px-4 py-2 rounded-xl bg-foreground text-background text-[13px] font-bold hover:opacity-90"
              >
                Entendido
              </button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>{completando ? 'Completar la eliminación' : `Eliminar definitivamente a ${persona?.nombre}`}</DialogTitle>
            </DialogHeader>
            <div className="space-y-3 text-[13px] leading-relaxed text-muted-foreground">
              {completando ? (
                <p>{COMPLETAR_ELIMINACION}</p>
              ) : (
                <>
                  <p>
                    <strong className="text-foreground">{persona?.nombre}</strong> ya no forma parte del equipo. Al eliminarla
                    definitivamente se borran sus datos personales de tu estudio.
                  </p>
                  <p><strong className="text-foreground">Se borra.</strong> {SE_BORRA}</p>
                  <p><strong className="text-foreground">Se conserva.</strong> {SE_CONSERVA_SIN_SU_NOMBRE}</p>
                  <p>
                    <strong className="text-foreground">Qué no alcanza.</strong> {LO_QUE_NO_ALCANZA}
                    {nombreSinBuscar && <span data-testid="aviso-nombre-una-palabra"> {NOMBRE_DE_UNA_PALABRA_NO_SE_BUSCA}</span>}
                  </p>
                  <div className="flex items-start gap-2.5 rounded-xl border border-destructive/30 bg-destructive/10 p-3">
                    <AlertTriangle size={16} className="text-destructive shrink-0 mt-0.5" aria-hidden />
                    <p className="text-foreground/90">{NO_SE_PUEDE_DESHACER} Si solo quieres que no aparezca en el equipo, déjala de baja: así se puede recuperar.</p>
                  </div>
                  <label className="flex items-start gap-2.5 cursor-pointer text-foreground">
                    <input
                      type="checkbox" checked={entiendo} onChange={e => setEntiendo(e.target.checked)} disabled={eliminando}
                      className="w-4 h-4 rounded accent-brand mt-0.5"
                    />
                    <span>Entiendo que no se puede deshacer.</span>
                  </label>
                </>
              )}
              {error && (
                <p role="alert" data-testid="error-eliminar-persona" className="rounded-xl border border-destructive/30 bg-destructive/10 px-3 py-2 text-destructive">
                  {error}
                </p>
              )}
            </div>
            {/* Fijo abajo: el texto es largo y en un iPad de recepción hace scroll; el botón que decide no puede quedar fuera de vista. */}
            <DialogFooter className="sticky bottom-0 mb-0 bg-popover">
              <button
                type="button" onClick={onClose} disabled={eliminando}
                className="px-4 py-2 rounded-xl border border-border text-[13px] font-medium text-foreground hover:bg-muted disabled:opacity-40"
              >
                Cancelar
              </button>
              <button
                type="button" onClick={eliminar} disabled={(!completando && !entiendo) || eliminando} data-testid="confirmar-eliminar-persona"
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-red-500 text-white text-[13px] font-bold hover:bg-red-600 disabled:opacity-40"
              >
                {eliminando ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />} {completando ? 'Reintentar' : 'Eliminar definitivamente'}
              </button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
