'use client';

// ─────────────────────────────────────────────────────────────────────────────
// «¿Ocultar Citas?» (pantalla Módulos del panel nuevo, 15-oct-2026). Lo que
// Bonsai no hace: antes de quitar un módulo, decir qué deja de verse, qué notan
// las alumnas en su app, qué sigue igual y, si hay algo que les toca o queda
// pendiente (reservas por delante, automatizaciones que les escriben…), avisar
// con su cifra. El texto sale de `alOcultar` (lib/modulos/al-ocultar.ts).
//
// Nada optimista: «Ocultar» espera al servidor. Si falla, el diálogo se queda
// abierto con el motivo y el módulo sigue activo; solo se cierra cuando el
// servidor ha guardado.
// ─────────────────────────────────────────────────────────────────────────────

import type { ElementType } from 'react';
import { AlertTriangle, Check, EyeOff, Smartphone } from 'lucide-react';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import type { AlOcultar } from '@/lib/modulos/al-ocultar';

function Bloque({ Icono, titulo, lineas, tono }: { Icono: ElementType; titulo: string; lineas: string[]; tono: string }) {
  return (
    <section aria-label={titulo} className="space-y-1.5">
      <h3 className="flex items-center gap-2 text-[12px] font-bold uppercase tracking-[0.06em] text-foreground">
        <span aria-hidden className="flex size-5 items-center justify-center rounded-md" style={{ backgroundColor: `color-mix(in srgb, ${tono} 14%, var(--popover))`, color: tono }}>
          <Icono size={12} strokeWidth={2.4} />
        </span>
        {titulo}
      </h3>
      <ul className="space-y-1 pl-7 text-[13px] leading-snug text-muted-foreground">
        {lineas.map(l => <li key={l} className="text-pretty">{l}</li>)}
      </ul>
    </section>
  );
}

export function DialogoOcultar({ nombre, Icono, color, texto, guardando, error, onConfirmar, onCerrar }: {
  nombre: string;
  Icono: ElementType;
  /** El tono de la sección (su baldosa). */
  color: string;
  texto: AlOcultar;
  guardando: boolean;
  error: string | null;
  onConfirmar: () => void;
  onCerrar: () => void;
}) {
  return (
    <Dialog open onOpenChange={abierto => { if (!abierto && !guardando) onCerrar(); }}>
      <DialogContent className="max-w-md gap-5 p-5" showCloseButton={false} data-testid="dialogo-ocultar">
        <DialogHeader className="gap-3">
          <div className="flex items-center gap-3">
            <span aria-hidden className="flex size-10 shrink-0 items-center justify-center rounded-xl" style={{ backgroundColor: color, color: 'var(--card)' }}>
              <Icono size={18} strokeWidth={2.2} />
            </span>
            <DialogTitle className="text-[17px] font-bold leading-tight">¿Ocultar {nombre}?</DialogTitle>
          </div>
          <DialogDescription className="text-[13px] text-pretty">
            Lo quitas del menú, nada más. Puedes volver a activarlo cuando quieras.
          </DialogDescription>
        </DialogHeader>

        {texto.aviso && (
          <p
            data-testid="aviso-ocultar"
            className="flex gap-2.5 rounded-xl border px-3.5 py-3 text-[13px] font-medium leading-snug text-foreground text-pretty"
            style={{ borderColor: 'color-mix(in srgb, var(--warning) 35%, var(--border))', backgroundColor: 'color-mix(in srgb, var(--warning) 10%, var(--popover))' }}
          >
            <AlertTriangle size={16} className="mt-px shrink-0" style={{ color: 'var(--warning)' }} aria-hidden />
            <span>{texto.aviso}</span>
          </p>
        )}

        <div className="space-y-4">
          <Bloque Icono={EyeOff} titulo="Deja de verse" lineas={texto.dejaDeVerse} tono="var(--muted-foreground)" />
          <Bloque Icono={Smartphone} titulo="En la app de tus alumnas" lineas={[texto.enLaApp]} tono="var(--t-text-link)" />
          <Bloque Icono={Check} titulo="Sigue igual" lineas={texto.sigueIgual} tono="var(--success)" />
        </div>

        {error && (
          <p role="alert" className="rounded-xl bg-destructive/10 px-3.5 py-2.5 text-[13px] font-medium text-destructive">
            {error} {nombre} sigue activo.
          </p>
        )}

        <DialogFooter className="-mx-5 -mb-5 p-4">
          <Button variant="outline" onClick={onCerrar} disabled={guardando}>Cancelar</Button>
          <Button onClick={onConfirmar} disabled={guardando} aria-busy={guardando || undefined}>
            {guardando ? 'Ocultando…' : `Ocultar ${nombre}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
