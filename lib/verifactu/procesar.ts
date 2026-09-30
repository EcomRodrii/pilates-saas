// Veri*Factu — qué hacer con el resultado de UNA llamada a la AEAT.
//
// Lógica pura: recibe lo que se envió y lo que pasó en la red, y devuelve un
// plan (qué estado queda en cada registro, qué se anota en el envío, si hay que
// pausar el estudio o suspender todo, cuánto esperar). `transmitir.ts` solo
// aplica el plan. Así cada caso —timeout, reintento, 3000, 4112, 4141…— se
// prueba sin red ni base de datos (procesar.test.ts).

import { parsearRespuestaAeat, type EstadoEnvio } from './respuesta.ts';
import type { ResultadoLlamada } from './envio.ts';
import {
  resolverLinea, resolverFalloTransporte, efectoDeFault, siguienteIntento,
  type EstadoRegistroVerifactu, type TipoRegistro, type ClaseFault,
} from './estado.ts';
import { casarRespuestas, esperaAntesDelSiguienteEnvioMs } from './pendientes.ts';

export interface RegistroEnviado {
  id: string;
  numSerieFactura: string;
  tipo: TipoRegistro;
  /** Intentos ANTES de este envío. */
  intentos: number;
}

export interface CambioRegistro {
  id: string;
  estado: EstadoRegistroVerifactu;
  /** Solo si la AEAT lo admitió en ESTE envío. */
  csv: string | null;
  codigoError: string | null;
  descripcionError: string | null;
  estadoDuplicado: 'Correcta' | 'AceptadaConErrores' | 'Anulada' | null;
  proximoIntentoEn: Date | null;
}

export interface PlanResultado {
  envio: {
    httpStatus: number | null;
    falloTransporte: 'NO_ENVIADO' | 'SIN_RESPUESTA' | 'ILEGIBLE' | null;
    estadoEnvio: EstadoEnvio | 'FAULT' | null;
    faultCodigo: string | null;
    csv: string | null;
    tiempoEsperaS: number | null;
    error: string | null;
  };
  registros: CambioRegistro[];
  /** Pausar el estudio (4112/4140, datos, fault desconocido). */
  pausarEstudio: boolean;
  /** Suspender toda la transmisión de Tentare (4141, 4139). */
  suspenderTodo: boolean;
  claseFault: ClaseFault | null;
  avisarPropietaria: boolean;
  /** Cuánto esperar antes del SIGUIENTE envío (el intento consume el control de flujo). */
  esperaMs: number;
}

function cambio(id: string, estado: EstadoRegistroVerifactu, extra: Partial<CambioRegistro> = {}): CambioRegistro {
  return { id, estado, csv: null, codigoError: null, descripcionError: null, estadoDuplicado: null, proximoIntentoEn: null, ...extra };
}

export function planificarResultado(
  enviados: readonly RegistroEnviado[],
  llamada: Pick<ResultadoLlamada, 'status' | 'cuerpo' | 'fallo' | 'error'>,
  ahora: Date = new Date(),
): PlanResultado {
  const base = {
    pausarEstudio: false, suspenderTodo: false, claseFault: null, avisarPropietaria: false,
  };

  // 1 · No hubo respuesta HTTP.
  if (llamada.fallo) {
    const estado = resolverFalloTransporte(llamada.fallo);
    return {
      ...base,
      envio: { httpStatus: llamada.status, falloTransporte: llamada.fallo, estadoEnvio: null, faultCodigo: null, csv: null, tiempoEsperaS: null, error: llamada.error },
      registros: enviados.map(r => cambio(r.id, estado, estado === 'REINTENTAR'
        ? { proximoIntentoEn: siguienteIntento(r.intentos + 1, ahora), codigoError: 'TRANSPORTE', descripcionError: llamada.error }
        : { codigoError: 'TRANSPORTE', descripcionError: llamada.error })),
      esperaMs: esperaAntesDelSiguienteEnvioMs(null),
    };
  }

  const respuesta = parsearRespuestaAeat(llamada.cuerpo);

  // 2 · SoapFault: la AEAT rechazó el envío entero; para ella no ha existido.
  if (respuesta.fault) {
    const efecto = efectoDeFault(respuesta.faultCodigo);
    return {
      pausarEstudio: efecto.estudio === 'PAUSADO',
      suspenderTodo: efecto.global === 'SUSPENDIDO_AEAT',
      claseFault: efecto.clase,
      avisarPropietaria: efecto.avisar,
      envio: { httpStatus: llamada.status, falloTransporte: null, estadoEnvio: 'FAULT', faultCodigo: respuesta.faultCodigo, csv: null, tiempoEsperaS: null, error: respuesta.faultMensaje },
      registros: enviados.map(r => cambio(r.id, efecto.registros, {
        codigoError: respuesta.faultCodigo ?? 'FAULT',
        descripcionError: respuesta.faultMensaje,
        proximoIntentoEn: efecto.registros === 'REINTENTAR' ? siguienteIntento(r.intentos + 1, ahora) : null,
      })),
      esperaMs: esperaAntesDelSiguienteEnvioMs(null),
    };
  }

  // 3 · Hubo respuesta, pero no se entiende (HTML de un proxy, 5xx sin SOAP…).
  //     Pudo llegar: INCIERTO, y se consulta.
  if (respuesta.estadoEnvio === null) {
    return {
      ...base,
      envio: { httpStatus: llamada.status, falloTransporte: 'ILEGIBLE', estadoEnvio: null, faultCodigo: null, csv: respuesta.csv, tiempoEsperaS: respuesta.tiempoEsperaSegundos, error: `Respuesta ilegible (HTTP ${llamada.status ?? '—'})` },
      registros: enviados.map(r => cambio(r.id, 'INCIERTO', { codigoError: 'RESPUESTA_ILEGIBLE' })),
      esperaMs: esperaAntesDelSiguienteEnvioMs(respuesta.tiempoEsperaSegundos),
    };
  }

  // 4 · Respuesta de negocio: registro a registro, casado por factura + operación.
  const casados = casarRespuestas(enviados, respuesta.registros);
  const registros = casados.map(({ registro, linea }) => {
    const r = resolverLinea(linea);
    return cambio(registro.id, r.estado, {
      csv: r.guardarCsv ? respuesta.csv : null,
      codigoError: r.codigoError,
      descripcionError: r.descripcionError,
      estadoDuplicado: r.estadoDuplicado,
    });
  });
  return {
    ...base,
    avisarPropietaria: registros.some(r => r.estado === 'RECHAZADA'),
    envio: {
      httpStatus: llamada.status, falloTransporte: null, estadoEnvio: respuesta.estadoEnvio,
      faultCodigo: null, csv: respuesta.csv, tiempoEsperaS: respuesta.tiempoEsperaSegundos, error: null,
    },
    registros,
    esperaMs: esperaAntesDelSiguienteEnvioMs(respuesta.tiempoEsperaSegundos),
  };
}
