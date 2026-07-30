// El cliente se importa PRIMERO (nota de OTel del SDK de Inngest): así el
// provider de tracing se inicializa antes que el resto de imports.
import { inngest } from '@/lib/inngest/client';
import { serve } from 'inngest/next';
import {
  automatizacionesDispatcher,
  procesarEstudioAutomatizaciones,
} from '@/lib/inngest/automatizaciones';
import {
  decisionDispatcher,
  analizarEstudio,
  ejecutarRecomendacion,
  medirOutcomeFn,
} from '@/lib/inngest/decision';
import {
  dunningDispatcher,
  procesarDunningEstudio,
} from '@/lib/inngest/dunning';
import {
  renovacionesDispatcher,
  procesarRenovacionesEstudio,
} from '@/lib/inngest/renovaciones';
import { escalarSustitucion } from '@/lib/inngest/sustituciones';
import {
  valoracionesDispatcher,
  procesarValoracionesEstudio,
} from '@/lib/inngest/valoraciones';
import {
  confirmacionRiesgoAskDispatcher,
  procesarConfirmacionAskEstudio,
  confirmacionRiesgoCorteDispatcher,
  procesarConfirmacionCorteEstudio,
} from '@/lib/inngest/confirmacion-riesgo';
import {
  notifRecordatoriosDispatcher,
  notifBonosDispatcher,
  notifInactivasDispatcher,
  procesarAutomacionEstudio,
} from '@/lib/inngest/notif-automations';
import {
  backupsDispatcher,
  procesarBackupsEstudio,
} from '@/lib/inngest/backups';
import {
  recordatoriosDispatcher,
  procesarRecordatoriosEstudio,
} from '@/lib/inngest/recordatorios';
import {
  revisionesSaludDispatcher,
  procesarRevisionesSaludEstudio,
} from '@/lib/inngest/revisiones-salud';
import { expirarReservasPendientesDispatcher } from '@/lib/inngest/reservas-pendientes';
import { listaEsperaOfertasExpirarDispatcher } from '@/lib/inngest/lista-espera-ofertas';

// Endpoint que Inngest llama para descubrir y ejecutar las funciones. El
// handshake se autentica con INNGEST_SIGNING_KEY (env var). maxDuration alto
// porque cada invocación puede ejecutar varios steps encadenados.
export const maxDuration = 300;

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [
    automatizacionesDispatcher,
    procesarEstudioAutomatizaciones,
    decisionDispatcher,
    analizarEstudio,
    ejecutarRecomendacion,
    medirOutcomeFn,
    dunningDispatcher,
    procesarDunningEstudio,
    renovacionesDispatcher,
    procesarRenovacionesEstudio,
    escalarSustitucion,
    valoracionesDispatcher,
    procesarValoracionesEstudio,
    confirmacionRiesgoAskDispatcher,
    procesarConfirmacionAskEstudio,
    confirmacionRiesgoCorteDispatcher,
    procesarConfirmacionCorteEstudio,
    notifRecordatoriosDispatcher,
    notifBonosDispatcher,
    notifInactivasDispatcher,
    procesarAutomacionEstudio,
    backupsDispatcher,
    procesarBackupsEstudio,
    recordatoriosDispatcher,
    procesarRecordatoriosEstudio,
    revisionesSaludDispatcher,
    procesarRevisionesSaludEstudio,
    expirarReservasPendientesDispatcher,
    listaEsperaOfertasExpirarDispatcher,
  ],
});
