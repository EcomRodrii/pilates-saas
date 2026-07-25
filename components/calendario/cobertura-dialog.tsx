'use client';

import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { MessageCircle, UserCheck } from 'lucide-react';
import { candidatosCobertura } from '@/lib/cobertura-logic';
import { ausenciaEnFecha } from '@/lib/ausencias';
import type { AusenciaInstructora } from '@/lib/api-client';
import { enlaceWhatsApp } from '@/lib/decision/mensajes-socia';
import { cn } from '@/lib/utils';

interface CoberturaDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sesion: { id: string; instructorId: string; tipoClaseId: string; inicio: string; fin: string; tipoClase: { nombre: string } } | null;
  sesiones: readonly { id: string; instructorId: string; tipoClaseId: string; cancelada: boolean; inicio: string; fin: string }[];
  instructores: readonly { id: string; nombre: string; telefono: string | null; activo: boolean }[];
  ausencias?: AusenciaInstructora[];
  onAsignar: (instructorId: string) => void;
}

export function CoberturaDialog({ open, onOpenChange, sesion, sesiones, instructores, ausencias = [], onAsignar }: CoberturaDialogProps) {
  if (!sesion) return null;

  // No proponer a quien no puede cubrir esta franja: ausentes ese día (vacaciones/
  // baja) o ya ocupadas con otra clase que solapa. Asignar a una ocupada violaría
  // `sesiones_instructor_sin_solape` (0048) y el error se tragaba en silencio.
  const noDisponibles = new Set<string>();
  for (const i of instructores) {
    if (ausenciaEnFecha(ausencias, i.id, sesion.inicio)) noDisponibles.add(i.id);
  }
  for (const s of sesiones) {
    if (s.cancelada || s.id === sesion.id) continue;
    if (s.inicio < sesion.fin && sesion.inicio < s.fin) noDisponibles.add(s.instructorId); // solape de franja
  }

  const candidatos = candidatosCobertura(sesion, sesiones, instructores, noDisponibles);
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
