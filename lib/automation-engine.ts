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
  // La mayoría de candidatos son sobre una socia concreta. CLASE_LLENA_RECURRENTE
  // es un insight de negocio (no va sobre ninguna socia en particular), así que
  // socio queda opcional — la UI ya trata socioNombre nulo como "Sistema".
  socio?: Socio;
  titulo: string;
  mensaje: string;
  proximaAccionEn: string | null;
  // ENVIAR_EMAIL se ejecuta solo (manda el email). COBRAR_RECIBO y
  // OFRECER_DESCUENTO requieren aprobación humana de un toque — nunca se
  // cobra ni se ofrece un descuento sin que alguien lo apruebe.
  accion: AccionAutomatica;
  reciboId?: string;
  // Datos que la redacción con IA necesita para personalizar el mensaje
  // final (ver app/api/ai/recomendacion/route.ts) — el motor nunca llama a
  // la IA él mismo, solo detecta la situación y deja los datos listos.
  contextoIA?: Record<string, string | number>;
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
      // A partir de este umbral (más alto) ya no basta un recordatorio
      // genérico — se propone una oferta de reactivación redactada por IA,
      // y SIEMPRE con aprobación humana antes de enviarse (nunca se regala
      // un descuento en automático).
      const diasCritico = (rule.condicion.diasCritico as number) ?? 21;
      const descuentoPct = (rule.condicion.descuentoPct as number) ?? 15;
      socios.filter(s => s.activo).forEach(socio => {
        const ultimaReserva = reservas
          .filter(r => r.socioId === socio.id && r.estado === 'ASISTIDA')
          .sort((a, b) => b.creadoEn.localeCompare(a.creadoEn))[0];
        if (!ultimaReserva) return;
        const dias = Math.floor((now.getTime() - new Date(ultimaReserva.creadoEn).getTime()) / 86400000);
        if (dias < diasUmbral) return;

        if (dias >= diasCritico) {
          const yaOfrecido = automationLogs.some(
            l => l.ruleId === rule.id && l.socioId === socio.id && l.accion === 'OFRECER_DESCUENTO' && l.resultado !== 'FALLIDO'
          );
          if (yaOfrecido) return;
          candidatos.push({
            rule, socio,
            titulo: '¿Le ofrecemos una vuelta con descuento?',
            mensaje: `${socio.nombre} lleva ${dias} días sin venir. ¿Le enviamos una oferta del ${descuentoPct}% para que vuelva?`,
            proximaAccionEn: null,
            accion: 'OFRECER_DESCUENTO',
            contextoIA: { nombre: socio.nombre, diasSinVenir: dias, descuentoPct },
          });
          return;
        }

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

    if (rule.trigger === 'CLASE_LLENA_RECURRENTE') {
      const semanasConsecutivas = (rule.condicion.semanasConsecutivas as number) ?? 3;
      const ocupacionMinima = (rule.condicion.ocupacionMinima as number) ?? 0.95;

      // Agrupa sesiones YA celebradas por franja recurrente (mismo día de la
      // semana + misma hora + mismo tipo de clase) para ver si esa franja
      // lleva llena N semanas seguidas.
      const grupos = new Map<string, Sesion[]>();
      sesiones
        .filter(s => !s.cancelada && new Date(s.inicio) <= now)
        .forEach(s => {
          const inicio = new Date(s.inicio);
          const clave = `${inicio.getDay()}-${inicio.getHours()}:${String(inicio.getMinutes()).padStart(2, '0')}-${s.tipoClaseId}`;
          const grupo = grupos.get(clave) ?? [];
          grupo.push(s);
          grupos.set(clave, grupo);
        });

      grupos.forEach((grupoSesiones, clave) => {
        const ordenadas = [...grupoSesiones].sort((a, b) => b.inicio.localeCompare(a.inicio)).slice(0, semanasConsecutivas);
        if (ordenadas.length < semanasConsecutivas) return;
        const siempreLlena = ordenadas.every(s => {
          if (s.aforoMaximo <= 0) return false;
          const ocupadas = reservas.filter(r => r.sesionId === s.id && r.estado !== 'CANCELADA').length;
          return ocupadas / s.aforoMaximo >= ocupacionMinima;
        });
        if (!siempreLlena) return;

        // No repetir el mismo aviso cada vez que se ejecuta — solo una vez
        // cada 2 semanas por franja, usando la clave como parte del detalle.
        const yaAvisado = automationLogs.some(
          l => l.ruleId === rule.id && l.detalle.includes(`[${clave}]`) &&
               (now.getTime() - new Date(l.ejecutadoEn).getTime()) < 14 * 86400000
        );
        if (yaAvisado) return;

        const referencia = ordenadas[0];
        const tipo = tiposClase.find(t => t.id === referencia.tipoClaseId);
        const inicioRef = new Date(referencia.inicio);
        const diaSemana = inicioRef.toLocaleDateString('es-ES', { weekday: 'long' });
        const hora = inicioRef.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });

        candidatos.push({
          rule,
          titulo: 'Clase con demanda sostenida',
          mensaje: `[${clave}] Las clases de ${tipo?.nombre ?? 'pilates'} de los ${diaSemana} a las ${hora} llevan ${ordenadas.length} semanas seguidas casi llenas. Valora abrir otra sesión en ese horario.`,
          proximaAccionEn: null,
          accion: 'NOTIFICAR_ADMIN',
          contextoIA: { tipoClase: tipo?.nombre ?? 'pilates', diaSemana, hora, semanas: ordenadas.length },
        });
      });
    }
  });

  return candidatos;
}
