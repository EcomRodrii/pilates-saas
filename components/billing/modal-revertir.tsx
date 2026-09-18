'use client';

import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { AlertCircle, Loader2 } from 'lucide-react';
import { useRevertirDobleCobroMutation } from '@/lib/hooks/use-revertir-doble-cobro';

interface DobleCobroFila {
  id: string;
  recibo_id: string;
  importe_centimos: number;
  intentos_exitosos_count: number;
  socia_nombre?: string;
  socia_email?: string;
}

interface ModalRevertirProps {
  open: boolean;
  dobleCoboro: DobleCobroFila;
  onClose: () => void;
  onSuccess?: (dobleCobroId: string) => void;
}

export function ModalRevertir({
  open,
  dobleCoboro,
  onClose,
  onSuccess,
}: ModalRevertirProps) {
  const [tipoReversion, setTipoReversion] = useState<'credito' | 'refund'>('credito');
  const [notas, setNotas] = useState('');
  const { revertir, loading, error } = useRevertirDobleCobroMutation();

  const importeEur = dobleCoboro.importe_centimos / 100;

  const handleRevertir = async () => {
    const result = await revertir({
      dobleCobroId: dobleCoboro.id,
      tipo: tipoReversion,
      notas: notas.trim() || undefined,
    });

    if (result && result.ok) {
      onClose();
      if (onSuccess) {
        onSuccess(dobleCoboro.id);
      }
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Revertir doble cobro</DialogTitle>
          <DialogDescription>
            Elige cómo resolver este doble cobro de €{importeEur.toFixed(2)}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Datos del doble cobro */}
          <div className="bg-muted/50 rounded-lg p-3 text-sm space-y-1">
            <div>
              <span className="text-muted-foreground">Recibo: </span>
              <span className="font-mono">{dobleCoboro.recibo_id}</span>
            </div>
            <div>
              <span className="text-muted-foreground">Socia: </span>
              <span>{dobleCoboro.socia_nombre || dobleCoboro.socia_email}</span>
            </div>
            <div>
              <span className="text-muted-foreground">Importe duplicado: </span>
              <span className="font-semibold">€{importeEur.toFixed(2)}</span>
            </div>
            <div>
              <span className="text-muted-foreground">Cargos detectados: </span>
              <span>{dobleCoboro.intentos_exitosos_count}x</span>
            </div>
          </div>

          {/* Opciones de reversión */}
          <RadioGroup value={tipoReversion} onValueChange={(v) => setTipoReversion(v as 'credito' | 'refund')}>
            <div className="flex items-center space-x-3 border rounded-lg p-3 cursor-pointer hover:bg-muted/50">
              <RadioGroupItem value="credito" id="credito" />
              <Label htmlFor="credito" className="flex-1 cursor-pointer">
                <div className="font-medium">Crear crédito</div>
                <div className="text-sm text-muted-foreground">
                  La socia podrá usar €{importeEur.toFixed(2)} como saldo en el próximo bono
                </div>
              </Label>
            </div>

            <div className="flex items-start space-x-3 border rounded-lg p-3 cursor-pointer hover:bg-muted/50">
              <RadioGroupItem value="refund" id="refund" className="mt-1" />
              <Label htmlFor="refund" className="flex-1 cursor-pointer">
                <div className="font-medium">Reembolso a tarjeta</div>
                <div className="text-sm text-muted-foreground">
                  Se devuelve €{importeEur.toFixed(2)} a la tarjeta original (puede tardar 3-5 días)
                </div>
              </Label>
            </div>
          </RadioGroup>

          {/* Notas opcionales */}
          <div className="space-y-2">
            <Label htmlFor="notas" className="text-sm">
              Notas internas (opcional)
            </Label>
            <Textarea
              id="notas"
              placeholder="Ej: Investigación realizada, confirma doble cargo en cobros_intentos..."
              value={notas}
              onChange={(e) => setNotas(e.target.value)}
              className="text-sm"
              rows={3}
            />
          </div>

          {/* Error */}
          {error && (
            <div className="flex items-start gap-2 bg-destructive/10 text-destructive p-3 rounded-lg text-sm">
              <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose} disabled={loading}>
            Cancelar
          </Button>
          <Button onClick={handleRevertir} disabled={loading}>
            {loading && <Loader2 className="mr-2 w-4 h-4 animate-spin" />}
            {loading ? 'Procesando...' : 'Confirmar reversión'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
