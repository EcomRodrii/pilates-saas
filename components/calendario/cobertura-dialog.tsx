'use client';

import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { MessageCircle, UserCheck } from 'lucide-react';
import { candidatosCobertura } from '@/lib/cobertura-logic';
import { enlaceWhatsApp } from '@/lib/decision/mensajes-socia';
import { cn } from '@/lib/utils';

interface CoberturaDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sesion: { instructorId: string; tipoClaseId: string; inicio: string; tipoClase: { nombre: string } } | null;
  sesiones: readonly { instructorId: string; tipoClaseId: string; cancelada: boolean }[];
  instructores: readonly { id: string; nombre: string; telefono: string | null; activo: boolean }[];
  onAsignar: (instructorId: string) => void;
}

export function CoberturaDialog({ open, onOpenChange, sesion, sesiones, instructores, onAsignar }: CoberturaDialogProps) {
  if (!sesion) return null;

  const candidatos = candidatosCobertura(sesion, sesiones, instructores);
  const fechaHora = new Date(sesion.inicio).toLocaleString('es-ES', {
    weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit',
  });
  const mensaje = `Hola! ¿Podrías cubrir la clase de ${sesion.tipoClase.nombre} el ${fechaHora}? Avísame si puedes 🙏`;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="text-[15px] font-semibold text-foreground">Buscar sustituta</DialogTitle>
        </DialogHeader>
        <p className="text-[12px] text-muted-foreground -mt-1 mb-1">
          Ordenadas por quién ha dado más veces esta clase — contacta y, en cuanto alguien confirme, márcala como asignada.
        </p>
        {candidatos.length === 0 ? (
          <p className="text-[13px] text-muted-foreground py-4 text-center">No hay más instructoras activas en el estudio.</p>
        ) : (
          <div className="space-y-2 max-h-[360px] overflow-y-auto">
            {candidatos.map(c => {
              const wa = enlaceWhatsApp(c.telefono, mensaje);
              return (
                <div key={c.instructorId} className="flex items-center justify-between gap-2 p-3 rounded-xl border border-border">
                  <div className="min-w-0">
                    <p className="text-[13px] font-medium text-foreground truncate">{c.nombre}</p>
                    <p className="text-[11px] text-muted-foreground">
                      {c.vecesImpartida > 0
                        ? `Ha dado esta clase ${c.vecesImpartida} ${c.vecesImpartida === 1 ? 'vez' : 'veces'}`
                        : 'Nunca ha dado esta clase'}
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    {wa && (
                      <a
                        href={wa}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[12px] font-medium border border-border text-foreground hover:bg-muted transition-colors"
                      >
                        <MessageCircle size={13} className="text-[#25D366]" />
                        WhatsApp
                      </a>
                    )}
                    <button
                      onClick={() => onAsignar(c.instructorId)}
                      className={cn(
                        'flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[12px] font-medium',
                        'bg-brand text-brand-foreground hover:brightness-95 transition-colors'
                      )}
                    >
                      <UserCheck size={13} />
                      Asignar
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
