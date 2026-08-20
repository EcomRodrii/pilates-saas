import * as Sentry from '@sentry/nextjs';
import type {
  AutomationRule,
  AutomationLog,
  Socio,
  Reserva,
  Recibo,
  Sesion,
  TipoClase,
  AccionAutomatica,
  Suscripcion,
  PlanTarifa,
  TriggerRule,
} from '@/lib/types';
import { ultimaAsistidaPorSocio, huboAvisoInactividadReciente } from './senales-inactividad.ts';
import { tieneConsentimientoMarketingVigente } from '../marketing/consentimiento.ts';

// Detección de candidatos a notificar, compartida entre el botón "Ejecutar
// ahora" del dashboard (app/api/automatizaciones/run/route.ts) y el cron de
// servidor (lib/inngest/automatizaciones.ts). Vivir en un solo sitio evita que
// las dos vías de ejecución diverjan silenciosamente.

// Los triggers que este motor sabe atender. Si añades una rama abajo, añádelo
// aquí: lo que no esté en este set se reporta como regla muerta.
const TRIGGERS_IMPLEMENTADOS: ReadonlySet<TriggerRule> = new Set<TriggerRule>([
  'AUSENCIA_DIAS',
  'PAGO_PENDIENTE_DIAS',
  'CLASE_MANANA',
  'CLASE_LLENA_RECURRENTE',
  'BONO_SESIONES_BAJAS',
  'NUEVA_SOCIA',
  'RENOVACION_COBRADA',
]);

export interface AutomationCandidato {
  rule: AutomationRule;
  // La mayoría de candidatos son sobre una socia concreta. CLASE_LLENA_RECURRENTE
  // es un insight de negocio (no va sobre ninguna socia en particular), así que
  // socio queda opcional — la UI ya trata socioNombre nulo como "Sistema".
  socio?: Socio;
  titulo: string;
  // Contenido YA LISTO para la clienta, dirigido a ella en segunda persona.
  // Solo se usa (y solo debe rellenarse) en accion:'ENVIAR_EMAIL' — el motor
  // lo manda TAL CUAL, sin pasar por IA ni por aprobación. Nunca debe
  // contener texto pensado para la propietaria.
  mensajeCliente?: string;
  // Nota INTERNA para la propietaria — habla DE la socia, no A ella (p.ej.
  // "Marta lleva 23 días sin venir. ¿Le ofrecemos un descuento?"). Se usa en
  // acciones con aprobación humana (OFRECER_DESCUENTO, COBRAR_RECIBO) y en
  // insights sin cliente asociado (NOTIFICAR_ADMIN). NUNCA debe enviarse tal
  // cual a una clienta — si la acción necesita texto para el cliente, se
  // redacta aparte (ver redactarConIA en lib/inngest/automatizaciones.ts).
  notaInterna?: string;
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
  // Marca este candidato como parte de la señal "socia inactiva" (dedup
  // cruzado con INACTIVIDAD_30D del motor de marketing — ver
  // docs/marketing-solape-motores-diseno.md §2 y senales-inactividad.ts).
  // Lo lee lib/inngest/automatizaciones.ts para prefijar el `detalle` del
  // log con MARCA_INACTIVIDAD.
  marcaInactividad?: boolean;
  // I-5 (auditoría 19-ago): marca los ENVIAR_EMAIL de re-enganche
  // (AUSENCIA_DIAS/NUEVA_SOCIA sin aprobación humana) que son comerciales de
  // verdad — a diferencia de PAGO_PENDIENTE_DIAS/CLASE_MANANA/RENOVACION_COBRADA,
  // que son avisos de servicio sobre algo que ya existe (una deuda, una
  // clase reservada, un cobro), no una invitación a comprar. `procesarCandidato`
  // exige consentimiento vigente y añade enlace de baja SOLO cuando es true —
  // igual criterio LSSI que ya aplica el motor de marketing.
  comercial?: boolean;
}

export interface AutomationEngineInput {
  automationRules: AutomationRule[];
  automationLogs: AutomationLog[];
  socios: Socio[];
  reservas: Reserva[];
  recibos: Recibo[];
  sesiones: Sesion[];
  tiposClase: TipoClase[];
  // Solo para BONO_SESIONES_BAJAS (cross-sell a plan ilimitado) y
  // RENOVACION_COBRADA (confirmar renovación + hito de fidelidad).
  suscripciones: Suscripcion[];
  planesTarifa: PlanTarifa[];
  // I-5: guard de consentimiento (art. 7.4 RGPD), mismo patrón exacto que ya
  // usa el motor de marketing (marketing-automation-engine.ts) — filas
  // crudas, no un Map ya construido por el llamador del cron (gotcha de
  // Inngest serializando Maps a `{}` en el replay).
  consentimientosMarketing: Map<string, string>;
  textoConsentimientoVigente: string;
}

export function computeAutomationCandidatos(
  {
    automationRules, automationLogs, socios, reservas, recibos, sesiones, tiposClase, suscripciones, planesTarifa,
    consentimientosMarketing, textoConsentimientoVigente,
  }: AutomationEngineInput,
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

  // Última asistencia (creadoEn) por socia — para AUSENCIA_DIAS. Compartida
  // con marketing-automation-engine.ts (misma señal exacta, ver
  // lib/engines/senales-inactividad.ts).
  const ultimaAsistidaCreado = ultimaAsistidaPorSocio(reservas);

  // Plazas ocupadas por sesión (estado != CANCELADA) — para CLASE_LLENA_RECURRENTE.
  const ocupadasPorSesion = new Map<string, number>();
  for (const r of reservas) {
    if (r.estado === 'CANCELADA') continue;
    ocupadasPorSesion.set(r.sesionId, (ocupadasPorSesion.get(r.sesionId) ?? 0) + 1);
  }

  // Socias con AL MENOS una reserva alguna vez (cualquier estado) — para
  // NUEVA_SOCIA (seguimiento de onboarding).
  const socioTieneReserva = new Set(reservas.map(r => r.socioId));

  // Planes indexados por id — para BONO_SESIONES_BAJAS (cross-sell).
  const planById = new Map(planesTarifa.map(p => [p.id, p]));

  automationRules.filter(r => r.activa).forEach(rule => {
    if (rule.trigger === 'AUSENCIA_DIAS') {
      const diasUmbral = (rule.condicion.dias as number) ?? 7;
      // Paso intermedio: check-in humano, SIN oferta — pesca las razones
      // reales (lesión, viaje, horario) antes de asumir que hace falta un
      // descuento para que vuelva.
      const diasCheckin = (rule.condicion.diasCheckin as number) ?? 14;
      // A partir de este umbral (más alto, antes 21) ya no basta un check-in
      // — se propone una oferta de reactivación redactada por IA, y SIEMPRE
      // con aprobación humana antes de enviarse (nunca se regala un
      // descuento en automático). 25 en vez de 21 para dar margen a que el
      // check-in del paso anterior surta efecto antes de pasar a lo comercial.
      const diasCritico = (rule.condicion.diasCritico as number) ?? 25;
      const descuentoPct = (rule.condicion.descuentoPct as number) ?? 15;
      socios.filter(s => s.activo).forEach(socio => {
        const ultimaCreado = ultimaAsistidaCreado.get(socio.id);
        if (!ultimaCreado) return;
        const dias = Math.floor((now.getTime() - new Date(ultimaCreado).getTime()) / 86400000);
        if (dias < diasUmbral) return;

        // Dedup por EPISODIO de ausencia, no "una vez en la vida de la
        // socia": solo cuentan avisos posteriores a su última asistencia
        // registrada. Si no, una socia que ya recibió la secuencia completa
        // una vez nunca volvería a recibir nada en una segunda racha de
        // ausencia meses después.
        const logsEpisodio = logsDe(rule.id, socio.id).filter(l => l.ejecutadoEn > ultimaCreado);

        // Dedup CRUZADO con INACTIVIDAD_30D (motor de marketing): si esa
        // automatización ya le mandó algo por el mismo motivo en las últimas
        // 72h, no dispares también la secuencia clásica encima — ver
        // docs/marketing-solape-motores-diseno.md §2.
        if (huboAvisoInactividadReciente(automationLogs, socio.id, now)) return;

        if (dias >= diasCritico) {
          const yaOfrecido = logsEpisodio.some(
            l => l.accion === 'OFRECER_DESCUENTO' && l.resultado !== 'FALLIDO'
          );
          if (yaOfrecido) return;
          candidatos.push({
            rule, socio,
            titulo: '¿Le ofrecemos una vuelta con descuento?',
            notaInterna: `${socio.nombre} lleva ${dias} días sin venir. ¿Le enviamos una oferta del ${descuentoPct}% para que vuelva?`,
            proximaAccionEn: null,
            accion: 'OFRECER_DESCUENTO',
            contextoIA: { nombre: socio.nombre, diasSinVenir: dias, descuentoPct },
            marcaInactividad: true,
          });
          return;
        }

        if (dias >= diasCheckin) {
          const yaCheckin = logsEpisodio.some(l => l.detalle.includes('¿Todo bien por el estudio?'));
          if (yaCheckin) return;
          // I-5: comercial (re-enganche sin aprobación humana) — exige
          // consentimiento vigente, mismo criterio que el motor de marketing.
          if (!tieneConsentimientoMarketingVigente(consentimientosMarketing.get(socio.id), textoConsentimientoVigente)) return;
          candidatos.push({
            rule, socio,
            titulo: '¿Todo bien por el estudio?',
            mensajeCliente: `${socio.nombre}, hace un par de semanas que no coincidimos en clase. Si hay algo que te esté costando encajar el horario, o alguna molestia, dínoslo — nos encanta ayudarte a volver a tu ritmo.`,
            proximaAccionEn: null,
            accion: 'ENVIAR_EMAIL',
            marcaInactividad: true,
            comercial: true,
          });
          return;
        }

        // A-11: dedup por lo que REALMENTE se escribe. Antes buscaba
        // resultado === 'ESPERANDO', un estado que ningún camino de ejecución
        // persiste (ambos escriben 'EJECUTADO') → el recordatorio se reenviaba
        // CADA DÍA (~14 días seguidos). Ahora se deduplica como OFRECER_DESCUENTO
        // y PAGO_PENDIENTE: por acción y salvo fallo (para reintentar tras un
        // FALLIDO), y solo dentro del episodio actual (ver logsEpisodio arriba).
        const alreadyLogged = logsEpisodio.some(
          l => l.accion === 'ENVIAR_EMAIL' && l.resultado !== 'FALLIDO',
        );
        if (alreadyLogged) return;
        // I-5: comercial — mismo guard que arriba.
        if (!tieneConsentimientoMarketingVigente(consentimientosMarketing.get(socio.id), textoConsentimientoVigente)) return;
        candidatos.push({
          rule, socio,
          titulo: 'Te echamos de menos',
          mensajeCliente: `${socio.nombre}, llevas ${dias} días sin venir a clase. ¿Todo bien? Te esperamos pronto por el estudio.`,
          proximaAccionEn: new Date(now.getTime() + 48 * 3600000).toISOString(),
          accion: 'ENVIAR_EMAIL',
          marcaInactividad: true,
          comercial: true,
        });
      });
    }

    if (rule.trigger === 'PAGO_PENDIENTE_DIAS') {
      const diasUmbral = (rule.condicion.dias as number) ?? 3;
      // Escalada: aviso → segundo aviso → si sigue sin tarjeta y sin
      // resolverse, deja de mandar emails automáticos (ya no aportan) y pide
      // contacto manual en vez de insistir indefinidamente.
      const diasSegundo = (rule.condicion.diasSegundo as number) ?? 8;
      const diasEscalada = (rule.condicion.diasEscalada as number) ?? 15;
      recibos.filter(r => r.estado === 'PENDIENTE').forEach(recibo => {
        const dias = Math.floor((now.getTime() - new Date(recibo.fechaVencimiento).getTime()) / 86400000);
        if (dias < diasUmbral) return;
        const socio = recibo.socioId ? socioById.get(recibo.socioId) : undefined;
        if (!socio) return;

        // Dedup por RECIBO concreto (no por socia): una socia puede tener
        // varios recibos pendientes en momentos distintos de su vida, cada
        // uno con su propia escalada.
        const logsRecibo = logsDe(rule.id, socio.id).filter(l => l.reciboId === recibo.id);

        // Si ya hay tarjeta guardada, proponemos cobrar directamente en vez
        // de solo recordar por email — pero SIEMPRE con aprobación humana de
        // un toque (resultado PENDIENTE_ADMIN), nunca se cobra en automático.
        if (socio.stripeCustomerId && socio.stripePaymentMethodId) {
          const yaPropuesto = logsRecibo.some(l => l.accion === 'COBRAR_RECIBO' && l.resultado !== 'FALLIDO');
          if (yaPropuesto) return;
          candidatos.push({
            rule, socio,
            titulo: '¿Cobramos el pago pendiente?',
            notaInterna: `${socio.nombre} tiene ${recibo.importe}€ pendientes (${recibo.concepto}) desde hace ${dias} días. Hay tarjeta guardada — ¿lo cobramos ahora?`,
            proximaAccionEn: null,
            accion: 'COBRAR_RECIBO',
            reciboId: recibo.id,
          });
          return;
        }

        if (dias >= diasEscalada) {
          // `&& resultado !== 'FALLIDO'` como en COBRAR_RECIBO (:223),
          // OFRECER_DESCUENTO (:153) y PROPONER_PLAN (:403). Sin él, un log
          // fallido contaba como "ya escalado" y mataba el aviso para siempre:
          // el bug de procesarCandidato que guardaba estos NOTIFICAR_ADMIN como
          // FALLIDO se auto-blindaba, y arreglarlo no habría regenerado ni uno.
          const yaEscalado = logsRecibo.some(l => l.accion === 'NOTIFICAR_ADMIN' && l.resultado !== 'FALLIDO');
          if (yaEscalado) return;
          candidatos.push({
            rule, socio,
            titulo: 'Pago pendiente sin resolver',
            notaInterna: `${socio.nombre} lleva ${dias} días sin pagar ${recibo.importe}€ (${recibo.concepto}) y no tiene tarjeta guardada. Ya se han mandado los avisos automáticos — conviene contactarla a mano.`,
            proximaAccionEn: null,
            accion: 'NOTIFICAR_ADMIN',
            reciboId: recibo.id,
          });
          return;
        }

        if (dias >= diasSegundo) {
          const yaSegundo = logsRecibo.some(l => l.detalle.includes('Segundo aviso: pago pendiente'));
          if (yaSegundo) return;
          candidatos.push({
            rule, socio,
            titulo: 'Segundo aviso: pago pendiente',
            mensajeCliente: `${socio.nombre}, tu pago de ${recibo.importe}€ (${recibo.concepto}) sigue pendiente desde hace ${dias} días. Puedes regularizarlo desde tu área de socia o pasando por el estudio — si ya lo hiciste, ignora este aviso.`,
            proximaAccionEn: null,
            accion: 'ENVIAR_EMAIL',
            reciboId: recibo.id,
          });
          return;
        }

        const yaPrimero = logsRecibo.some(l => l.detalle.includes('Tienes un pago pendiente'));
        if (yaPrimero) return;
        candidatos.push({
          rule, socio,
          titulo: 'Tienes un pago pendiente',
          mensajeCliente: `${socio.nombre}, tienes un pago pendiente de ${recibo.importe}€ (${recibo.concepto}) desde hace ${dias} días. Puedes regularizarlo fácilmente desde tu área de socia o pasando por el estudio — si ya lo has hecho, ignora este aviso. ¡Gracias!`,
          proximaAccionEn: new Date(now.getTime() + 72 * 3600000).toISOString(),
          accion: 'ENVIAR_EMAIL',
          reciboId: recibo.id,
        });
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
              // WhatsApp tiene muchísima mejor tasa de lectura a tiempo que
              // el email para un "mañana a las X" — se usa si hay teléfono,
              // con email como alternativa cuando no.
              candidatos.push({
                rule, socio,
                titulo: 'Recordatorio: tu clase es mañana',
                mensajeCliente: `${socio.nombre}, te recordamos tu clase de ${tipo?.nombre ?? 'pilates'} mañana a las ${hora}. Si no puedes venir, cancela desde tu portal (Mis reservas) para liberar la plaza — ¡te esperamos!`,
                proximaAccionEn: null,
                accion: socio.telefono ? 'ENVIAR_WHATSAPP' : 'ENVIAR_EMAIL',
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
          notaInterna: `[${clave}] Las clases de ${tipo?.nombre ?? 'pilates'} de los ${diaSemana} a las ${hora} llevan ${ordenadas.length} semanas seguidas casi llenas. Valora abrir otra sesión en ese horario.`,
          proximaAccionEn: null,
          accion: 'NOTIFICAR_ADMIN',
          contextoIA: { tipoClase: tipo?.nombre ?? 'pilates', diaSemana, hora, semanas: ordenadas.length },
        });
      });
    }

    // Cross-sell a plan ilimitado: la socia lleva `comprasSeguidas` bonos del
    // MISMO plan seguidos y va a tener que comprar otro — puede que un plan
    // mensual le salga mejor. SIEMPRE con aprobación humana (implica una
    // propuesta comercial con precios concretos), nunca se cambia el plan
    // de nadie en automático.
    if (rule.trigger === 'BONO_SESIONES_BAJAS') {
      const comprasSeguidasUmbral = (rule.condicion.comprasSeguidas as number) ?? 3;
      const suscripcionesPorSocio = new Map<string, Suscripcion[]>();
      for (const s of suscripciones) {
        const arr = suscripcionesPorSocio.get(s.socioId) ?? [];
        arr.push(s);
        suscripcionesPorSocio.set(s.socioId, arr);
      }
      const planesMensuales = planesTarifa
        .filter(p => p.activo && p.tipo === 'MENSUAL')
        .sort((a, b) => a.precio - b.precio);
      if (planesMensuales.length === 0) return; // nada que proponer sin un plan ilimitado en la casa

      suscripcionesPorSocio.forEach((subsSocio, socioId) => {
        const socio = socioById.get(socioId);
        if (!socio?.activo) return;
        const ordenadas = [...subsSocio].sort((a, b) => b.fechaInicio.localeCompare(a.fechaInicio));
        const actual = ordenadas[0];
        if (!actual || actual.estado !== 'ACTIVA') return;
        if (actual.sesionesRestantes === null || actual.sesionesRestantes > 1) return;
        const plan = planById.get(actual.planId);
        if (!plan || plan.tipo !== 'BONO') return;

        const ultimasN = ordenadas.slice(0, comprasSeguidasUmbral);
        if (ultimasN.length < comprasSeguidasUmbral) return;
        if (!ultimasN.every(s => s.planId === actual.planId)) return;

        const yaPropuesto = logsDe(rule.id, socioId).some(l => l.accion === 'PROPONER_PLAN' && l.resultado !== 'FALLIDO');
        if (yaPropuesto) return;

        const planSugerido = planesMensuales[0];
        candidatos.push({
          rule, socio,
          titulo: '¿Le proponemos pasarse a un plan ilimitado?',
          notaInterna: `${socio.nombre} ha comprado el bono "${plan.nombre}" ${ultimasN.length} veces seguidas. Con su ritmo, el plan ${planSugerido.nombre} (${planSugerido.precio}€/mes) puede salirle mejor que seguir comprando bonos sueltos. ¿Se lo proponemos?`,
          proximaAccionEn: null,
          accion: 'PROPONER_PLAN',
          contextoIA: { nombre: socio.nombre, planActual: plan.nombre, planSugerido: planSugerido.nombre, precioSugerido: planSugerido.precio },
        });
      });
    }

    // Seguimiento de onboarding: la bienvenida del día 0 la manda el motor de
    // marketing (NUEVA_ALTA) — esto cubre lo que falta después, la ventana
    // donde más se pierde a una socia nueva sin que nadie se entere.
    if (rule.trigger === 'NUEVA_SOCIA') {
      const diasSinReservar = (rule.condicion.diasSinReservar as number) ?? 2;
      const diasSinAsistir = (rule.condicion.diasSinAsistir as number) ?? 10;
      socios.filter(s => s.activo).forEach(socio => {
        const diasDesdeAlta = Math.floor((now.getTime() - new Date(socio.fechaAlta).getTime()) / 86400000);
        if (diasDesdeAlta < diasSinReservar) return;

        const tieneAsistencia = ultimaAsistidaCreado.has(socio.id);
        if (!tieneAsistencia && diasDesdeAlta >= diasSinAsistir) {
          // Mismo `resultado !== 'FALLIDO'` que el ENVIAR_EMAIL de esta misma
          // regla justo debajo: un aviso que falló debe poder reintentarse.
          const yaAvisado = logsDe(rule.id, socio.id).some(l => l.accion === 'NOTIFICAR_ADMIN' && l.resultado !== 'FALLIDO');
          if (yaAvisado) return;
          candidatos.push({
            rule, socio,
            titulo: 'Socia nueva sin actividad',
            notaInterna: `${socio.nombre} se dio de alta hace ${diasDesdeAlta} días y todavía no ha venido a ninguna clase. Puede valer la pena una llamada antes de que se enfríe.`,
            proximaAccionEn: null,
            accion: 'NOTIFICAR_ADMIN',
          });
          return;
        }

        if (!socioTieneReserva.has(socio.id) && diasDesdeAlta >= diasSinReservar) {
          const yaAvisado = logsDe(rule.id, socio.id).some(l => l.accion === 'ENVIAR_EMAIL' && l.resultado !== 'FALLIDO');
          if (yaAvisado) return;
          // I-5: comercial — mismo guard que AUSENCIA_DIAS.
          if (!tieneConsentimientoMarketingVigente(consentimientosMarketing.get(socio.id), textoConsentimientoVigente)) return;
          candidatos.push({
            rule, socio,
            titulo: '¿Ya has visto los horarios?',
            mensajeCliente: `${socio.nombre}, ¿ya has echado un vistazo a los horarios? Reserva tu primera clase cuando quieras desde tu área de socia — te esperamos.`,
            proximaAccionEn: null,
            accion: 'ENVIAR_EMAIL',
            comercial: true,
          });
        }
      });
    }

    // Confirmación automática de una renovación cobrada — hoy el recibo solo
    // se manda por email si alguien lo dispara a mano, nunca en automático al
    // cobrarse una recurrencia. Bajo riesgo (puramente informativo): se manda
    // sin aprobación, a diferencia de las acciones comerciales de arriba.
    if (rule.trigger === 'RENOVACION_COBRADA') {
      const hitoMeses = (rule.condicion.hitoMeses as number) ?? 6;
      // Ventana de recencia (auditoría 2026-07-29, hallazgo I-1): a diferencia
      // de AUSENCIA_DIAS/PAGO_PENDIENTE_DIAS (acotadas por su propia condición
      // — días sin venir, días de retraso), aquí el único filtro era
      // `estado === 'COBRADO'`, sin fecha. La primera vez que un estudio
      // activaba esta regla, mandaba "Renovación confirmada" por CADA recibo
      // cobrado de toda su historia. 3 días de margen sobre el cron diario
      // (0 7 * * *) cubre un día de cron perdido sin reabrir el histórico.
      const diasRecencia = 3;
      recibos
        .filter(r =>
          r.estado === 'COBRADO' && r.suscripcionId && r.fechaCobro &&
          (now.getTime() - new Date(r.fechaCobro).getTime()) < diasRecencia * 86400000,
        )
        .forEach(recibo => {
          const socio = recibo.socioId ? socioById.get(recibo.socioId) : undefined;
          if (!socio) return;
          const yaAvisado = logsDe(rule.id, socio.id).some(l => l.reciboId === recibo.id);
          if (yaAvisado) return;

          const mesesAntiguedad = Math.floor(
            (now.getTime() - new Date(socio.fechaAlta).getTime()) / (30 * 86400000)
          );
          const esHito = hitoMeses > 0 && mesesAntiguedad > 0 && mesesAntiguedad % hitoMeses === 0;
          const cierre = esHito
            ? ` Y hoy además cumples ${mesesAntiguedad} meses con nosotros — ¡gracias por tu confianza!`
            : '';

          candidatos.push({
            rule, socio,
            titulo: 'Renovación confirmada',
            mensajeCliente: `${socio.nombre}, hemos cobrado tu renovación de ${recibo.concepto} por ${recibo.importe}€. Aquí tienes tu recibo desde tu área de socia.${cierre}`,
            proximaAccionEn: null,
            accion: 'ENVIAR_EMAIL',
            reciboId: recibo.id,
          });
        });
    }

    // La cadena de arriba son `if` independientes sin `else`, y la columna
    // automation_rules.trigger es `text` libre (0000_base.sql:364) que el mapper
    // deja pasar con un `as AutomationRule` sin validar. Un trigger que no
    // coincida con ninguno produce una regla que la UI muestra encendida y que
    // no hace absolutamente nada, sin error ni aviso — así vivió años
    // SUSCRIPCION_EXPIRA_DIAS. Que al menos se entere alguien.
    if (!TRIGGERS_IMPLEMENTADOS.has(rule.trigger)) {
      Sentry.captureMessage(`[automation-engine] trigger sin implementar: ${rule.trigger}`, {
        level: 'warning',
        tags: { trigger: rule.trigger, studioId: rule.studioId },
        extra: { ruleId: rule.id, nombre: rule.nombre },
      });
    }
  });

  return candidatos;
}
