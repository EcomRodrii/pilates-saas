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

  // ── Índices compartidos (P0-19) ────────────────────────────────────────────
  // El motor lo comparten el cron (500k tenants) y el botón "Ejecutar ahora".
  // Antes cada regla hacía .filter()/.sort()/.find()/.some() sobre las
  // colecciones completas por cada socia/recibo/sesión/candidato —
  // O(socios × reservas), O(recibos × socios), O(candidatos × logs). Aquí se
  // agregan una sola vez y las reglas consultan por Map/índice.
  const socioById = new Map(socios.map(s => [s.id, s]));
  const tipoById = new Map(tiposClase.map(t => [t.id, t]));

  // Logs indexados por (ruleId|socioId) para los dedupe .some() de cada regla.
  const logsPorRuleSocio = new Map<string, AutomationLog[]>();
  for (const l of automationLogs) {
    const k = `${l.ruleId}|${l.socioId ?? ''}`;
    const arr = logsPorRuleSocio.get(k);
    if (arr) arr.push(l); else logsPorRuleSocio.set(k, [l]);
  }
  const logsDe = (ruleId: string, socioId: string | null | undefined): AutomationLog[] =>
    logsPorRuleSocio.get(`${ruleId}|${socioId ?? ''}`) ?? [];

  // Última asistencia (creadoEn) por socia — para AUSENCIA_DIAS, en una pasada.
  const ultimaAsistidaCreado = new Map<string, string>();
  for (const r of reservas) {
    if (r.estado !== 'ASISTIDA') continue;
    const prev = ultimaAsistidaCreado.get(r.socioId);
    if (!prev || r.creadoEn > prev) ultimaAsistidaCreado.set(r.socioId, r.creadoEn);
  }

  // Plazas ocupadas por sesión (estado != CANCELADA) — para CLASE_LLENA_RECURRENTE.
  const ocupadasPorSesion = new Map<string, number>();
  for (const r of reservas) {
    if (r.estado === 'CANCELADA') continue;
    ocupadasPorSesion.set(r.sesionId, (ocupadasPorSesion.get(r.sesionId) ?? 0) + 1);
  }

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
        const ultimaCreado = ultimaAsistidaCreado.get(socio.id);
        if (!ultimaCreado) return;
        const dias = Math.floor((now.getTime() - new Date(ultimaCreado).getTime()) / 86400000);
        if (dias < diasUmbral) return;

        if (dias >= diasCritico) {
          const yaOfrecido = logsDe(rule.id, socio.id).some(
            l => l.accion === 'OFRECER_DESCUENTO' && l.resultado !== 'FALLIDO'
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

        const alreadyLogged = logsDe(rule.id, socio.id).some(l => l.resultado === 'ESPERANDO');
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
        const socio = recibo.socioId ? socioById.get(recibo.socioId) : undefined;
        if (!socio) return;
        const alreadyLogged = logsDe(rule.id, socio.id).some(l => l.resultado !== 'FALLIDO');
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
          const tipo = tipoById.get(sesion.tipoClaseId);
          const hora = new Date(sesion.inicio).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
          const hoyStr = now.toISOString().slice(0, 10);
          reservas
            .filter(r => r.sesionId === sesion.id && r.estado === 'CONFIRMADA')
            .forEach(reserva => {
              const socio = socioById.get(reserva.socioId);
              if (!socio) return;
              const alreadyLogged = logsDe(rule.id, socio.id).some(l => l.ejecutadoEn.startsWith(hoyStr));
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
      // lleva llena N semanas seguidas. P0-19: se acota a una ventana reciente
      // (las N últimas ocurrencias de una franja semanal caben en ~N semanas),
      // en vez de recorrer TODO el histórico de la vida del estudio.
      const ventanaMs = (semanasConsecutivas + 3) * 7 * 86400000;
      const desde = now.getTime() - ventanaMs;
      const grupos = new Map<string, Sesion[]>();
      sesiones
        .filter(s => {
          if (s.cancelada) return false;
          const t = new Date(s.inicio).getTime();
          return t <= now.getTime() && t >= desde;
        })
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
          const ocupadas = ocupadasPorSesion.get(s.id) ?? 0;
          return ocupadas / s.aforoMaximo >= ocupacionMinima;
        });
        if (!siempreLlena) return;

        // No repetir el mismo aviso cada vez que se ejecuta — solo una vez
        // cada 2 semanas por franja, usando la clave como parte del detalle.
        // Los logs de esta regla no van sobre una socia (NOTIFICAR_ADMIN), así
        // que se indexan bajo socioId nulo.
        const yaAvisado = logsDe(rule.id, null).some(
          l => l.detalle.includes(`[${clave}]`) &&
               (now.getTime() - new Date(l.ejecutadoEn).getTime()) < 14 * 86400000
        );
        if (yaAvisado) return;

        const referencia = ordenadas[0];
        const tipo = tipoById.get(referencia.tipoClaseId);
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
