// Tipos de la demo personalizada. Sin imports de la app (se prueba con `node --test`).
//
// Lo que produce el motor es DATO, no código: una secuencia de pasos con bloques
// tipados que la pantalla sabe pintar. Ni el modelo de IA ni el navegador
// aportan nada que se ejecute (lib/demo/catalogo.ts valida cada propuesta).

export type Tono = 'neutro' | 'ok' | 'aviso' | 'malo';

export type Bloque =
  | { tipo: 'texto'; texto: string }
  | {
      tipo: 'bono';
      nombre: string;
      restantes: number;
      total: number;
      /** Día (YYYY-MM-DD) hasta el que vale, o null si no caduca. */
      caducaEl: string | null;
      /** Etiqueta ya redactada de ese día, p. ej. «domingo». */
      caducaEtiqueta: string | null;
      estado: 'vigente' | 'caducado' | 'agotado';
    }
  | { tipo: 'semana'; dias: { dia: string; eventos: { texto: string; tono: Tono }[] }[] }
  | { tipo: 'tabla'; filas: { k: string; v: string; tono?: Tono }[] }
  | { tipo: 'resultado'; titular: string; detalle: string; tono: Tono };

export interface Regla {
  texto: string;
  /** La función o el ajuste real de Tentare que decide esto (para «¿Por qué ocurre esto?»). */
  fuente: string;
}

export interface PasoDemo {
  id: string;
  titulo: string;
  proposito: string;
  bloques: Bloque[];
  porQue: Regla[];
  /** Dónde se configura esto en Tentare (para «Ver cómo se configura»). */
  configura?: { donde: string; ajuste: string; valor: string }[];
}

export interface Comprobacion {
  id: string;
  descripcion: string;
  ok: boolean;
}

export interface EntidadEjemplo {
  tipo: string;
  descripcion: string;
}

export interface DemoGenerada {
  escenario: string;
  titulo: string;
  objetivo: string;
  modulos: string[];
  reglasAplicables: Regla[];
  entidades: EntidadEjemplo[];
  estadoInicial: string;
  acciones: string[];
  resultadoEsperado: string;
  pasos: PasoDemo[];
  excepciones: string[];
  comprobaciones: Comprobacion[];
}
