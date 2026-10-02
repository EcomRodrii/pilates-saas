'use client';

// El ⋯ de un recibo: lo que se puede hacer con ESE recibo según su estado
// (`accionesDeRecibo`), con las apagadas y su motivo en vez de esconderlas.

import {
  Banknote, CheckCircle2, CreditCard, FileText, Landmark, RefreshCw, RotateCcw, Trash2, Undo2, UserRound, XCircle, type LucideIcon,
} from 'lucide-react';
import type { Recibo } from '@/lib/types';
import type { IdAccionRecibo } from '@/lib/cobros/acciones-de-recibo';
import { MenuAcciones, type AccionMenu } from '@/components/ui/menu-acciones';
import type { AccionesRecibo } from './use-acciones-recibo';
import type { DatosCobros } from './use-datos-cobros';

const ICONO: Record<IdAccionRecibo, LucideIcon> = {
  COBRAR: Banknote,
  COBRAR_SIN_ELLA: CreditCard,
  EL_BANCO_LO_DEVOLVIO: XCircle,
  REINTENTAR_POR_EL_BANCO: RefreshCw,
  EL_BANCO_LO_HA_COBRADO: CheckCircle2,
  NO_LLEGO_AL_BANCO: Undo2,
  LO_CIERRA_STRIPE: Landmark,
  VER_FACTURA: FileText,
  HACERLE_FACTURA: FileText,
  LE_HE_DEVUELTO_EL_DINERO: RotateCcw,
  DEVOLVER_DESDE_SU_FICHA: UserRound,
  ELIMINAR: Trash2,
};

export function MenuRecibo({ recibo, datos, acciones, quitar = [], titulo }: {
  recibo: Recibo;
  datos: DatosCobros;
  acciones: AccionesRecibo;
  /** Acciones que ya están a la vista como botón (no se repiten en el ⋯). */
  quitar?: readonly IdAccionRecibo[];
  titulo?: string;
}) {
  const lista = datos.accionesDe(recibo).filter(a => !quitar.includes(a.id));
  if (lista.length === 0) return null;
  const ocupado = acciones.enVuelo(recibo.id);
  const menu: AccionMenu[] = lista.map(a => ({
    texto: a.texto,
    icono: ICONO[a.id],
    nota: a.nota,
    desactivada: a.desactivada || ocupado,
    peligro: a.peligro,
    separar: a.id === 'ELIMINAR',
    onClick: () => acciones.ejecutar(a.id, recibo),
  }));
  return <MenuAcciones acciones={menu} titulo={titulo ?? recibo.concepto} etiqueta={`Acciones de «${recibo.concepto}»`} />;
}
