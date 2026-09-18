'use client';

import { useState } from 'react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { AlertCircle, CheckCircle2, Clock } from 'lucide-react';
import { ModalRevertir } from './modal-revertir';

export interface DobleCobroFila {
  id: string;
  recibo_id: string;
  importe_centimos: number;
  intentos_exitosos_count: number;
  primera_fecha: string;
  estado: string;
  socia_nombre?: string;
  socia_email?: string;
  tipo_clase?: string;
  payment_intent_ids?: string[];
}

interface DoblesCobrosTableProps {
  dobles: DobleCobroFila[];
  loading?: boolean;
  onRevertirSuccess?: (dobleCobroId: string) => void;
}

export function DoblesCobrosTable({
  dobles,
  loading = false,
  onRevertirSuccess,
}: DoblesCobrosTableProps) {
  const [filtroEstado, setFiltroEstado] = useState<string>('todos');
  const [modalOpen, setModalOpen] = useState(false);
  const [dobleSeleccionado, setDobleSeleccionado] = useState<DobleCobroFila | null>(null);

  const doblesFiltrados = dobles.filter((d) => {
    if (filtroEstado === 'todos') return true;
    return d.estado === filtroEstado;
  });

  const handleRevertir = (doble: DobleCobroFila) => {
    setDobleSeleccionado(doble);
    setModalOpen(true);
  };

  const handleModalClose = () => {
    setModalOpen(false);
    setDobleSeleccionado(null);
  };

  const handleRevertirSuccess = (dobleCobroId: string) => {
    handleModalClose();
    if (onRevertirSuccess) {
      onRevertirSuccess(dobleCobroId);
    }
  };

  const getEstadoBadge = (estado: string) => {
    switch (estado) {
      case 'PENDIENTE_REVISION':
        return (
          <Badge variant="outline" className="gap-1 bg-yellow-50 text-yellow-800 border-yellow-200">
            <Clock className="w-3 h-3" />
            Pendiente
          </Badge>
        );
      case 'CONFIRMADO':
        return (
          <Badge variant="outline" className="gap-1 bg-red-50 text-red-800 border-red-200">
            <AlertCircle className="w-3 h-3" />
            Confirmado
          </Badge>
        );
      case 'RESUELTO':
        return (
          <Badge variant="outline" className="gap-1 bg-green-50 text-green-800 border-green-200">
            <CheckCircle2 className="w-3 h-3" />
            Resuelto
          </Badge>
        );
      case 'FALSO_POSITIVO':
        return (
          <Badge variant="outline" className="bg-gray-50 text-gray-800 border-gray-200">
            Falso positivo
          </Badge>
        );
      default:
        return <Badge variant="outline">{estado}</Badge>;
    }
  };

  if (loading) {
    return <div className="text-center py-8 text-muted-foreground">Cargando...</div>;
  }

  if (doblesFiltrados.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        {dobles.length === 0 ? 'No hay dobles cobros' : 'No hay dobles cobros con este filtro'}
      </div>
    );
  }

  return (
    <>
      <div className="flex items-center gap-4 mb-4">
        <span className="text-sm font-medium">Filtrar por estado:</span>
        <Select value={filtroEstado} onValueChange={setFiltroEstado}>
          <SelectTrigger className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos</SelectItem>
            <SelectItem value="PENDIENTE_REVISION">Pendiente revisión</SelectItem>
            <SelectItem value="CONFIRMADO">Confirmado</SelectItem>
            <SelectItem value="RESUELTO">Resuelto</SelectItem>
            <SelectItem value="FALSO_POSITIVO">Falso positivo</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="rounded-lg border overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50">
              <TableHead>Recibo</TableHead>
              <TableHead>Socia</TableHead>
              <TableHead>Importe duplicado</TableHead>
              <TableHead className="text-center">Cargos</TableHead>
              <TableHead>Detección</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead className="text-right">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {doblesFiltrados.map((doble) => (
              <TableRow key={doble.id} className="hover:bg-muted/50">
                <TableCell className="font-mono text-sm">{doble.recibo_id}</TableCell>
                <TableCell>
                  <div className="flex flex-col">
                    <span className="font-medium text-sm">{doble.socia_nombre || 'Sin nombre'}</span>
                    <span className="text-xs text-muted-foreground">{doble.socia_email}</span>
                  </div>
                </TableCell>
                <TableCell className="font-semibold">
                  €{(doble.importe_centimos / 100).toFixed(2)}
                </TableCell>
                <TableCell className="text-center">{doble.intentos_exitosos_count}x</TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {format(new Date(doble.primera_fecha), 'PPp', { locale: es })}
                </TableCell>
                <TableCell>{getEstadoBadge(doble.estado)}</TableCell>
                <TableCell className="text-right">
                  <Button
                    size="sm"
                    variant={doble.estado === 'RESUELTO' ? 'ghost' : 'outline'}
                    disabled={doble.estado === 'RESUELTO'}
                    onClick={() => handleRevertir(doble)}
                  >
                    {doble.estado === 'RESUELTO' ? 'Resuelto' : 'Revertir'}
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {dobleSeleccionado && (
        <ModalRevertir
          open={modalOpen}
          dobleCoboro={dobleSeleccionado}
          onClose={handleModalClose}
          onSuccess={handleRevertirSuccess}
        />
      )}
    </>
  );
}
