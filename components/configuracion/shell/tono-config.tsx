'use client';

// El color de cada sección de Configuración (panel nuevo, 14-oct-2026): su
// cabecera, las baldosas de sus filas y sus tarjetas, como el resto del panel
// nuevo. Con el interruptor apagado no se usa.

import { createContext, useContext } from 'react';
import type { SeccionId } from '@/lib/configuracion/secciones';
import type { Tono } from '@/components/dashboard/vivo';

export const TONO_SECCION_CONFIG: Record<SeccionId, Tono> = {
  estudio: 'azul',
  clases: 'azul',
  reservas: 'indigo',
  cobros: 'verde',
  altas: 'magenta',
  comunicacion: 'indigo',
  equipo: 'verde',
  marca: 'magenta',
  web: 'azul',
  motivacion: 'magenta',
  conexiones: 'indigo',
  datos: 'verde',
  demo: 'magenta',
  avisos: 'azul',
  panel: 'indigo',
};

export const TonoConfigContext = createContext<Tono>('azul');
export const useTonoConfig = () => useContext(TonoConfigContext);
