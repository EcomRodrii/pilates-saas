import type {
  AutomationRule,
  AutomationLog,
  Socio,
  Reserva,
  Recibo,
  Sesion,
  TipoClase,
  AccionAutomatica,
} from '@/lib/types';

// Detección de candidatos a notificar, compartida entre el botón "Ejecutar
// ahora" del dashboard (lib/studio-context.tsx) y el cron de servidor
// (app/api/cron/automatizaciones/route.ts). Vivir en un solo sitio evita que
// las dos vías de ejecución diverjan silenciosamente.

export interface AutomationCandidato {
  rule: AutomationRule;
  socio: Socio;
  titulo: string;
  mensaje: string;
  proximaAccionEn: string | null;
  // ENVIAR_EMAIL se ejecuta solo (manda el email). COBRAR_RECIBO requiere
  // aprobación humana de un toque — nunca se cobra sin que alguien lo apruebe.
  accion: AccionAutomatica;
  reciboId?: string;
}

export interface AutomationEngineInput {
  automationRules: AutomationRule[];
  automationLogs: AutomationLog[];
  socios: Socio[];
  reservas: Reserva[];
  recibos: Recibo[];
  sesiones: Sesion[];
  tiposClase: TipoClase[];
}

export function computeAutomationCandidatos(
  { automationRules, automationLogs, socios, reservas, recibos, sesiones, tiposClase }: AutomationEngineInput,
  now: Date
): AutomationCandidato[] {
  const candidatos: AutomationCandidato[] = [];

  automationRules.filter(r => r.activa).forEach(rule => {
    if (rule.trigger === 'AUSENCIA_DIAS') {
      const diasUmbral = (rule.condicion.dias as number) ?? 7;
      socios.filter(s => s.activo).forEach(socio => {
        const ultimaReserva = reservas
          .filter(r => r.socioId === socio.id && r.estado === 'ASISTIDA')
          .sort((a, b) => b.creadoEn.localeCompare(a.creadoEn))[0];
        if (!ultimaReserva) return;
        const dias = Math.floor((now.getTime() - new Date(ultimaReserva.creadoEn).getTime()) / 86400000);
        if (dias < diasUmbral) return;
        const alreadyLogged = automationLogs.some(
          l => l.ruleId === rule.id && l.socioId === socio.id && l.resultado === 'ESPERANDO'
        );
        if (alreadyLogged) return;
        candidatos.push({
          rule, socio,
          titulo: 'Te echamos de menos',
          mensaje: `${socio.nombre}, llevas ${dias} días sin venir a clase. ¿Todo bien? Te esperamos pronto por el estudio.`,
          proximaAccionEn: new Date(now.getTime() + 48 * 3600000).toISOString(),
          accion: 'ENVIAR_EMAIL',
        });
      });
    }

    if (rule.trigger === 'PAGO_PENDIENTE_DIAS') {
      const diasUmbral = (rule.condicion.dias as number) ?? 3;
      recibos.filter(r => r.estado === 'PENDIENTE').forEach(recibo => {
        const dias = Math.floor((now.getTime() - new Date(recibo.fechaVencimiento).getTime()) / 86400000);
        if (dias < diasUmbral) return;
        const socio = socios.find(s => s.id === recibo.socioId);
        if (!socio) return;
        const alreadyLogged = automationLogs.some(
          l => l.ruleId === rule.id && l.socioId === socio.id && l.resultado !== 'FALLIDO'
        );
        if (alreadyLogged) return;

        // Si ya hay tarjeta guardada, proponemos cobrar directamente en vez
        // de solo recordar por email — pero SIEMPRE con aprobación humana de
        // un toque (resultado PENDIENTE_ADMIN), nunca se cobra en automático.
        if (socio.stripeCustomerId && socio.stripePaymentMethodId) {
          candidatos.push({
            rule, socio,
            titulo: '¿Cobramos el pago pendiente?',
            mensaje: `${socio.nombre} tiene ${recibo.importe}€ pendientes (${recibo.concepto}) desde hace ${dias} días. Hay tarjeta guardada — ¿lo cobramos ahora?`,
            proximaAccionEn: null,
            accion: 'COBRAR_RECIBO',
            reciboId: recibo.id,
          });
        } else {
          candidatos.push({
            rule, socio,
            titulo: 'Tienes un pago pendiente',
            mensaje: `${socio.nombre}, tienes un pago pendiente de ${recibo.importe}€ (${recibo.concepto}). Puedes regularizarlo cuando quieras desde el estudio.`,
            proximaAccionEn: new Date(now.getTime() + 72 * 3600000).toISOString(),
            accion: 'ENVIAR_EMAIL',
          });
        }
      });
    }

    if (rule.trigger === 'CLASE_MANANA') {
      const manana = new Date(now);
      manana.setDate(manana.getDate() + 1);
      const mananaStr = manana.toISOString().slice(0, 10);
      sesiones
        .filter(s => s.inicio.startsWith(mananaStr) && !s.cancelada)
        .forEach(sesion => {
          const tipo = tiposClase.find(t => t.id === sesion.tipoClaseId);
          const hora = new Date(sesion.inicio).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
          reservas
            .filter(r => r.sesionId === sesion.id && r.estado === 'CONFIRMADA')
            .forEach(reserva => {
              const socio = socios.find(s => s.id === reserva.socioId);
              if (!socio) return;
              const alreadyLogged = automationLogs.some(
                l => l.ruleId === rule.id && l.socioId === socio.id &&
                     l.ejecutadoEn.startsWith(now.toISOString().slice(0, 10))
              );
              if (alreadyLogged) return;
              candidatos.push({
                rule, socio,
                titulo: 'Recordatorio: tu clase es mañana',
                mensaje: `${socio.nombre}, te recordamos tu clase de ${tipo?.nombre ?? 'pilates'} mañana a las ${hora}. ¡Te esperamos!`,
                proximaAccionEn: null,
                accion: 'ENVIAR_EMAIL',
              });
            });
        });
    }
  });

  return candidatos;
}
