'use client';

import Link from 'next/link';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button, buttonVariants } from '@/components/ui/button';
import { Ticket, RefreshCw, Gift } from 'lucide-react';
import { formatEuro } from '@/lib/utils';

// F0 · E1 — cuando se añade a una socia SIN bono válido a una clase desde el panel
// (bono agotado/caducado o sin plan de sesiones), en vez de colarla gratis y en
// silencio se PARA y se pide una decisión consciente: cobrar clase suelta, vender/
// renovar bono, o dejarla como cortesía registrada. Las socias de tarifa MENSUAL
// no llegan aquí (tienen entitlement) — esto solo salta sin bono válido.
export interface AvisoSinBonoProps {
  open: boolean;
  socioNombre: string;
  socioId: string;
  claseLabel: string;
  precioSuelta: number | null; // null/0 → no hay precio de clase suelta configurado
  onCobrarSuelta: () => void;
  onCortesia: () => void;
  onClose: () => void;
}

export function AvisoSinBono({
  open, socioNombre, socioId, claseLabel, precioSuelta, onCobrarSuelta, onCortesia, onClose,
}: AvisoSinBonoProps) {
  const puedeCobrar = precioSuelta != null && precioSuelta > 0;
  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{socioNombre} no tiene bono para esta clase</DialogTitle>
        </DialogHeader>
        <p className="text-[13px] leading-snug text-muted-foreground">
          Su bono está agotado o caducado (o no tiene un plan de sesiones){claseLabel ? ` · ${claseLabel}` : ''}.
          Elige qué hacer — así no se cuela una clase gratis sin que nadie lo decida.
        </p>
        <div className="mt-3 flex flex-col gap-2">
          <Button onClick={onCobrarSuelta} disabled={!puedeCobrar} className="justify-start">
            <Ticket size={15} /> Cobrar clase suelta{puedeCobrar ? ` · ${formatEuro(precioSuelta!)}` : ''}
          </Button>
          {!puedeCobrar && (
            <p className="-mt-1 text-[11px] text-muted-foreground">
              Configura un precio de «Clase suelta» (un plan de tipo PUNTUAL) para poder cobrarla desde aquí.
            </p>
          )}
          <Link
            href={`/clientas/${socioId}`}
            className={buttonVariants({ variant: 'outline' }) + ' justify-start'}
            onClick={onClose}
          >
            <RefreshCw size={15} /> Renovar o vender bono en su ficha
          </Link>
          <Button variant="ghost" onClick={onCortesia} className="justify-start">
            <Gift size={15} /> Añadir como cortesía (sin cargo)
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
