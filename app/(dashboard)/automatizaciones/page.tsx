'use client';

import { useState, useMemo } from 'react';
import { useStudio } from '@/lib/studio-context';
import { authHeader } from '@/lib/api-client';
import {
  Bot, Zap, CheckCircle2, Clock, AlertTriangle, XCircle,
  Play, ChevronRight, Loader2,
  MessageSquare, Mail, CreditCard, Bell, Gift, TrendingUp,
  Send, X, Eye,
} from 'lucide-react';
import { cn, formatFechaHora as formatFecha, formatHoraCorta as formatHora } from '@/lib/utils';
import { aprobarCobroAutonomo } from '@/lib/api-client';
import type { AutomationRule, AutomationLog, AccionAutomatica, ResultadoLog } from '@/lib/types';
import { mensajeSeguro } from '@/lib/errores';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function horasRestantes(iso: string) {
  const diff = new Date(iso).getTime() - Date.now();
  if (diff <= 0) return 'Vencida';
  const h = Math.floor(diff / 3600000);
  const m = Math.floor((diff % 3600000) / 60000);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

const accionConfig: Record<AccionAutomatica, { label: string; icon: React.ElementType; color: string }> = {
  ENVIAR_EMAIL:      { label: 'Email', icon: Mail, color: 'var(--brand)' },
  ENVIAR_WHATSAPP:   { label: 'WhatsApp', icon: MessageSquare, color: '#16A34A' },
  COBRAR_RECIBO:     { label: 'Cobro automático', icon: CreditCard, color: '#7C3AED' },
  CREAR_NOTA:        { label: 'Nota de progreso', icon: Eye, color: '#0891B2' },
  NOTIFICAR_ADMIN:   { label: 'Notificación admin', icon: Bell, color: 'var(--warning)' },
  OFRECER_CLASE_GRATIS: { label: 'Clase gratis', icon: Gift, color: '#DB2777' },
  PROPONER_PLAN:     { label: 'Proponer plan', icon: TrendingUp, color: 'var(--success)' },
  ENVIAR_EJERCICIOS: { label: 'Ejercicios casa', icon: Send, color: '#F7A6C4' },
  OFRECER_DESCUENTO: { label: 'Oferta de reactivación', icon: Gift, color: 'var(--warning)' },
};

const resultadoConfig: Record<ResultadoLog, { label: string; color: string; bg: string; icon: React.ElementType }> = {
  EJECUTADO:       { label: 'Ejecutado', color: '#16A34A', bg: 'color-mix(in srgb, var(--success) 12%, var(--card))', icon: CheckCircle2 },
  ESPERANDO:       { label: 'Esperando', color: 'var(--warning)', bg: 'color-mix(in srgb, var(--warning) 12%, var(--card))', icon: Clock },
  FALLIDO:         { label: 'Fallido', color: 'var(--destructive)', bg: 'color-mix(in srgb, var(--destructive) 12%, var(--card))', icon: XCircle },
  PENDIENTE_ADMIN: { label: 'Acción humana', color: 'var(--brand-secondary)', bg: 'color-mix(in srgb, var(--brand) 12%, var(--card))', icon: AlertTriangle },
};

const triggerLabels: Record<string, string> = {
  AUSENCIA_DIAS:       'Ausencia de clienta',
  PAGO_PENDIENTE_DIAS: 'Pago pendiente',
  BONO_SESIONES_BAJAS: 'Bono casi agotado',
  NUEVA_SOCIA:         'Nueva clienta',
  CLASE_MANANA:        'Clase mañana',
  RENOVACION_COBRADA:  'Renovación cobrada',
  CLASE_LLENA_RECURRENTE: 'Clase con demanda sostenida',
};

// Punto de partida opcional (botón "Cargar reglas sugeridas"). Nacen todas con
// `activa: false` a propósito: estas reglas escriben a clientas reales (emails,
// WhatsApp) y hasta cobran recibos, así que un clic exploratorio en "Cargar
// reglas sugeridas" no puede acabar mandando nada. El estudio las lee, expande
// los pasos y enciende una a una lo que quiera. Los umbrales (días, % de
// descuento...) son solo un punto de partida razonable, no están grabados a
// fuego en ningún sitio.
const REGLAS_SUGERIDAS: Omit<AutomationRule, 'id' | 'studioId' | 'ejecutadaVeces' | 'ultimaEjecucion' | 'creadaEn'>[] = [
  {
    nombre: 'Clienta ausente', descripcion: 'Recuerda a las clientas que llevan días sin venir, pregunta cómo están a las 2 semanas, y ofrece una vuelta con descuento si la ausencia se alarga',
    icono: '👤', trigger: 'AUSENCIA_DIAS', condicion: { dias: 7, diasCheckin: 14, diasCritico: 25, descuentoPct: 15 }, pasos: [], activa: false,
  },
  {
    nombre: 'Pago pendiente', descripcion: 'Persigue pagos vencidos con dos avisos escalados — cobra directo si hay tarjeta guardada (con tu aprobación) o te avisa a ti si tras dos avisos sigue sin resolverse',
    icono: '💳', trigger: 'PAGO_PENDIENTE_DIAS', condicion: { dias: 3, diasSegundo: 8, diasEscalada: 15 }, pasos: [], activa: false,
  },
  {
    nombre: 'Recordatorio de clase', descripcion: 'Avisa a las clientas con reserva confirmada el día antes de su clase — por WhatsApp si tienen teléfono, por email si no',
    icono: '📅', trigger: 'CLASE_MANANA', condicion: {}, pasos: [], activa: false,
  },
  {
    nombre: 'Clase con demanda sostenida', descripcion: 'Detecta franjas horarias que llevan varias semanas casi llenas y te recomienda abrir otra sesión',
    icono: '📈', trigger: 'CLASE_LLENA_RECURRENTE', condicion: { semanasConsecutivas: 3, ocupacionMinima: 0.95 }, pasos: [], activa: false,
  },
  {
    nombre: 'Bono casi agotado', descripcion: 'Si una clienta compra el mismo bono varias veces seguidas, te propone ofrecerle pasarse a un plan ilimitado (con tu aprobación)',
    icono: '🔁', trigger: 'BONO_SESIONES_BAJAS', condicion: { comprasSeguidas: 3 }, pasos: [], activa: false,
  },
  {
    nombre: 'Seguimiento de clienta nueva', descripcion: 'Si no ha reservado en 2 días le anima a hacerlo; si a los 10 días sigue sin venir a ninguna clase, te avisa a ti para que la llames',
    icono: '🌱', trigger: 'NUEVA_SOCIA', condicion: { diasSinReservar: 2, diasSinAsistir: 10 }, pasos: [], activa: false,
  },
  {
    nombre: 'Renovación confirmada', descripcion: 'Confirma automáticamente cada renovación cobrada, con un detalle extra en los hitos de antigüedad',
    icono: '✅', trigger: 'RENOVACION_COBRADA', condicion: { hitoMeses: 6 }, pasos: [], activa: false,
  },
];

// Triggers cuyas acciones mandan un mensaje a la CLIENTA sin pasar por la
// bandeja de aprobación (ver lib/engines/automation-engine.ts). Que nazcan
// desactivadas evita encenderlas sin querer, pero encender sigue siendo un
// clic: y ese clic da permiso para escribir en nombre del estudio, cada
// mañana y sin volver a preguntar. Eso se confirma. Las reglas que solo
// avisan a la dueña o dejan la acción en PENDIENTE_ADMIN no lo necesitan.
const TRIGGERS_QUE_ESCRIBEN_A_CLIENTAS = new Set<AutomationRule['trigger']>([
  'AUSENCIA_DIAS',
  'PAGO_PENDIENTE_DIAS',
  'CLASE_MANANA',
  'NUEVA_SOCIA',
  'RENOVACION_COBRADA',
]);

// ─── Morning Briefing ─────────────────────────────────────────────────────────

function MorningBriefing({ logs }: { logs: AutomationLog[] }) {
  const today = new Date().toISOString().slice(0, 10);
  const todayLogs = logs.filter(l => l.ejecutadoEn.startsWith(today));
  const pendingAdmin = logs.filter(l => l.resultado === 'PENDIENTE_ADMIN');
  const ejecutadas = todayLogs.filter(l => l.resultado === 'EJECUTADO').length;
  // 'ESPERANDO' nunca lo escribe ningún camino de ejecución (ver
  // automation-engine.ts): las automatizaciones son de disparo único, no
  // esperan respuesta de nadie. El contador que había aquí marcaba siempre 0.
  // 'FALLIDO' sí ocurre de verdad (sin email, WhatsApp sin configurar…) y es
  // justo lo que necesita un vistazo.
  const fallidas = todayLogs.filter(l => l.resultado === 'FALLIDO').length;

  const hour = new Date().getHours();
  const greeting = hour < 13 ? 'Buenos días' : hour < 20 ? 'Buenas tardes' : 'Buenas noches';

  return (
    <div className="rounded-2xl bg-gradient-to-br from-[#1A1A1A] to-[#2A2A24] text-white p-6 mb-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Bot size={20} className="text-white/60" />
            <span className="text-sm text-white/50 font-medium">Sistema autónomo</span>
          </div>
          <h1 className="text-2xl font-bold mb-1">
            {greeting} 👋
          </h1>
          {pendingAdmin.length === 0 ? (
            <p className="text-white/70 text-sm">
              Hoy no tienes nada pendiente. El sistema gestionó{' '}
              <span className="text-white font-semibold">{ejecutadas} acciones</span> automáticamente.
            </p>
          ) : (
            <p className="text-white/70 text-sm">
              El sistema gestionó{' '}
              <span className="text-white font-semibold">{ejecutadas} acciones</span> hoy,
              pero hay <span className="text-amber-300 font-semibold">{pendingAdmin.length} casos</span> que requieren tu atención.
            </p>
          )}
        </div>
        <div className="shrink-0 w-14 h-14 rounded-2xl bg-card/10 flex items-center justify-center">
          <Zap size={28} className="text-white/80" />
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mt-5">
        <div className="rounded-xl bg-card/10 px-4 py-3">
          <div className="text-2xl font-bold">{ejecutadas}</div>
          <div className="text-white/50 text-xs mt-0.5">Acciones hoy</div>
        </div>
        <div className="rounded-xl bg-card/10 px-4 py-3">
          <div className={cn('text-2xl font-bold', fallidas > 0 ? 'text-amber-300' : 'text-white')}>{fallidas}</div>
          <div className="text-white/50 text-xs mt-0.5">Fallidas hoy</div>
        </div>
        <div className="rounded-xl bg-card/10 px-4 py-3">
          <div className={cn('text-2xl font-bold', pendingAdmin.length > 0 ? 'text-red-300' : 'text-green-300')}>
            {pendingAdmin.length}
          </div>
          <div className="text-white/50 text-xs mt-0.5">Tu intervención</div>
        </div>
      </div>
    </div>
  );
}

// ─── Pasos visibles de una regla ──────────────────────────────────────────────

// `automation_rules.pasos` es un campo muerto para las reglas que crea la app:
// se guarda vacío y lib/engines/automation-engine.ts no lo lee nunca — decide
// las acciones con ifs encadenados sobre `trigger` + `condicion`. Resultado: al
// expandir una regla salía la cabecera "Pasos del flujo" sobre un hueco en
// blanco, justo cuando la propietaria quiere saber qué se va a enviar en su
// nombre.
//
// Se derivan del trigger, leyendo los MISMOS umbrales de `rule.condicion` que
// usa el motor, para que lo que se lee aquí sea lo que se ejecuta allí. Si
// alguien toca las ramas del motor, hay que tocar este mapa: no rellenamos
// `pasos` en la semilla precisamente para no tener dos fuentes de verdad que
// divergen en silencio.
type PasoVisible = { accion: AccionAutomatica; cuando: string };

function pasosDeRegla(rule: AutomationRule): PasoVisible[] {
  const n = (clave: string, porDefecto: number) => (rule.condicion[clave] as number) ?? porDefecto;

  switch (rule.trigger) {
    case 'AUSENCIA_DIAS':
      return [
        { accion: 'ENVIAR_EMAIL', cuando: `A los ${n('dias', 7)} días sin venir — "te echamos de menos"` },
        { accion: 'ENVIAR_EMAIL', cuando: `A los ${n('diasCheckin', 14)} días — pregunta qué tal, sin ofrecerle nada` },
        { accion: 'OFRECER_DESCUENTO', cuando: `A los ${n('diasCritico', 25)} días — te propone una oferta del ${n('descuentoPct', 15)}%. No se envía sin que tú lo apruebes` },
      ];
    case 'PAGO_PENDIENTE_DIAS':
      return [
        { accion: 'COBRAR_RECIBO', cuando: 'Si tiene tarjeta guardada, te propone cobrarlo. Nunca cobra sin tu aprobación' },
        { accion: 'ENVIAR_EMAIL', cuando: `Sin tarjeta: primer aviso a los ${n('dias', 3)} días del vencimiento` },
        { accion: 'ENVIAR_EMAIL', cuando: `Segundo aviso a los ${n('diasSegundo', 8)} días` },
        { accion: 'NOTIFICAR_ADMIN', cuando: `A los ${n('diasEscalada', 15)} días deja de insistir y te avisa para que la llames tú` },
      ];
    case 'CLASE_MANANA':
      return [
        { accion: 'ENVIAR_WHATSAPP', cuando: 'El día antes de la clase, si tiene teléfono guardado' },
        { accion: 'ENVIAR_EMAIL', cuando: 'El día antes, si no tiene teléfono' },
      ];
    case 'CLASE_LLENA_RECURRENTE':
      return [
        { accion: 'NOTIFICAR_ADMIN', cuando: `Cuando una franja lleva ${n('semanasConsecutivas', 3)} semanas al ${Math.round(n('ocupacionMinima', 0.95) * 100)}% o más, te sugiere abrir otra sesión` },
      ];
    case 'BONO_SESIONES_BAJAS':
      return [
        { accion: 'PROPONER_PLAN', cuando: `Tras ${n('comprasSeguidas', 3)} bonos iguales seguidos, te propone ofrecerle un plan ilimitado. Lo apruebas tú` },
      ];
    case 'NUEVA_SOCIA':
      return [
        { accion: 'ENVIAR_EMAIL', cuando: `Si a los ${n('diasSinReservar', 2)} días no ha reservado, le anima a hacerlo` },
        { accion: 'NOTIFICAR_ADMIN', cuando: `Si a los ${n('diasSinAsistir', 10)} días sigue sin venir, te avisa para que la llames tú` },
      ];
    case 'RENOVACION_COBRADA':
      return [
        { accion: 'ENVIAR_EMAIL', cuando: `Confirma cada renovación cobrada, con un detalle extra cada ${n('hitoMeses', 6)} meses de antigüedad` },
      ];
    default:
      return [];
  }
}

// ─── Rule Card ────────────────────────────────────────────────────────────────

function RuleCard({
  rule,
  onToggle,
}: {
  rule: AutomationRule;
  onToggle: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const pasos = useMemo(() => pasosDeRegla(rule), [rule]);

  return (
    <div className={cn(
      'rounded-xl border bg-card transition-all',
      // Sin opacity en la tarjeta inactiva: atenuaba también el interruptor, que
      // es justo lo que tiene que quedar legible de un vistazo.
      rule.activa ? 'border-border' : 'border-muted'
    )}>
      <div className="flex items-center gap-3 p-4">
        <div className={cn('text-2xl transition-opacity', !rule.activa && 'opacity-50')}>{rule.icono}</div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-foreground text-sm truncate">{rule.nombre}</span>
            {rule.ultimaEjecucion && (
              <span className="text-[10px] text-muted-foreground shrink-0">
                Última: {formatFecha(rule.ultimaEjecucion)}
              </span>
            )}
          </div>
          {/* Sin `truncate`: la descripción explica qué se envía y a quién, y se
              cortaba con puntos suspensivos justo en esa parte. */}
          <p className="text-xs text-muted-foreground mt-0.5">{rule.descripcion}</p>
          <div className="flex items-center gap-3 mt-1 flex-wrap">
            <span
              className="text-[10px] font-semibold px-2 py-0.5 rounded-full"
              style={rule.activa
                ? { color: 'var(--brand)', background: 'color-mix(in srgb, var(--brand) 12%, var(--card))' }
                : { color: 'var(--muted-foreground)', background: 'var(--muted)' }}
            >
              {rule.activa ? 'Activada' : 'Desactivada'}
            </span>
            <span className="text-[10px] text-muted-foreground bg-muted px-2 py-0.5 rounded-full border">
              {triggerLabels[rule.trigger] ?? rule.trigger}
            </span>
            <span className="text-[10px] text-muted-foreground">{rule.ejecutadaVeces} ejecuciones</span>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={() => setExpanded(p => !p)}
            aria-label="Expandir detalles"
            aria-expanded={expanded}
            className="p-1.5 text-muted-foreground hover:text-foreground rounded-lg hover:bg-muted transition-colors"
          >
            <ChevronRight size={14} className={cn('transition-transform', expanded && 'rotate-90')} />
          </button>
          {/* Los iconos ToggleLeft/ToggleRight de lucide son outline y sólo mueven
              la bolita ~7px dentro de una píldora simétrica: encendido y apagado
              se veían idénticos, y en un interruptor que decide si salen emails y
              WhatsApps a clientas eso no vale. Mismo switch relleno que
              components/decision/piloto-automatico.tsx: color de fondo + bolita
              blanca sólida + desplazamiento, tres señales en vez de una. */}
          <button
            type="button"
            role="switch"
            aria-checked={rule.activa}
            aria-label={`${rule.activa ? 'Desactivar' : 'Activar'} la automatización ${rule.nombre}`}
            title={rule.activa ? 'Activada — desactivar' : 'Desactivada — activar'}
            onClick={onToggle}
            className="relative inline-flex h-6 w-11 shrink-0 rounded-full border-2 border-transparent transition-colors"
            style={{ background: rule.activa ? 'var(--brand)' : 'var(--muted-foreground)' }}
          >
            <span
              className={cn(
                'inline-block h-5 w-5 rounded-full bg-white shadow transition-transform',
                rule.activa ? 'translate-x-5' : 'translate-x-0'
              )}
            />
          </button>
        </div>
      </div>

      {expanded && (
        <div className="border-t border-muted px-4 py-3">
          <p className="text-xs font-semibold text-muted-foreground mb-2 uppercase tracking-wide">Qué hace, paso a paso</p>
          <div className="space-y-2">
            {pasos.map((paso, i) => {
              const cfg = accionConfig[paso.accion];
              const Icon = cfg.icon;
              return (
                <div key={i} className="flex items-start gap-2.5">
                  <div
                    className="w-6 h-6 rounded-full flex items-center justify-center shrink-0 mt-0.5"
                    style={{ background: cfg.color + '18' }}
                  >
                    <Icon size={12} style={{ color: cfg.color }} />
                  </div>
                  <div>
                    <span className="text-xs font-medium text-foreground">{cfg.label}</span>
                    <p className="text-[11px] text-muted-foreground mt-0.5">{paso.cuando}</p>
                  </div>
                </div>
              );
            })}
            {pasos.length === 0 && (
              <p className="text-xs text-muted-foreground">
                Esta automatización no tiene pasos configurados, así que no enviará nada.
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Log Item ─────────────────────────────────────────────────────────────────

// OFRECER_DESCUENTO y PROPONER_PLAN comparten el mismo flujo de aprobación
// (enviar log.mensajeCliente por email) — solo cambia la etiqueta del botón.
const ETIQUETA_APROBAR: Partial<Record<AutomationLog['accion'], string>> = {
  OFRECER_DESCUENTO: 'Enviar oferta',
  PROPONER_PLAN: 'Proponer plan',
};

function LogItem({
  log, onDismiss, onApproveCharge, onAprobarEnvio, approving,
}: {
  log: AutomationLog;
  onDismiss: () => void;
  onApproveCharge?: () => void;
  onAprobarEnvio?: () => void;
  approving?: boolean;
}) {
  const cfg = resultadoConfig[log.resultado];
  const accionCfg = accionConfig[log.accion];
  const AIcon = accionCfg.icon;
  const RIcon = cfg.icon;

  return (
    <div className={cn(
      'flex items-start gap-3 p-3 rounded-xl border',
      log.resultado === 'PENDIENTE_ADMIN' && 'border-border bg-brand/10',
      log.resultado === 'EJECUTADO' && 'border-muted bg-card',
      log.resultado === 'ESPERANDO' && 'border-amber-100 bg-amber-50',
      log.resultado === 'FALLIDO' && 'border-red-100 bg-red-50',
    )}>
      <div
        className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 mt-0.5"
        style={{ background: accionCfg.color + '20' }}
      >
        <AIcon size={14} style={{ color: accionCfg.color }} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-semibold text-foreground">{log.socioNombre ?? 'Sistema'}</span>
          <span
            className="inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full"
            style={{ color: cfg.color, background: cfg.bg }}
          >
            <RIcon size={10} />
            {cfg.label}
          </span>
        </div>
        <p className="text-xs text-foreground mt-0.5">{log.detalle}</p>
        {onAprobarEnvio && (
          <div className="mt-2 rounded-lg border border-border bg-card px-2.5 py-2">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-1">
              Esto es lo que recibirá la socia
            </p>
            {log.mensajeCliente ? (
              <p className="text-xs text-foreground whitespace-pre-wrap">{log.mensajeCliente}</p>
            ) : (
              <p className="text-xs text-red-600">
                No se ha podido redactar un mensaje para la clienta — no se puede enviar todavía.
              </p>
            )}
          </div>
        )}
        <div className="flex items-center gap-3 mt-1">
          <span className="text-[10px] text-muted-foreground">{log.ruleName}</span>
          <span className="text-[10px] text-muted-foreground">{formatFecha(log.ejecutadoEn)}</span>
          {log.proximaAccionEn && log.resultado === 'ESPERANDO' && (
            <span className="text-[10px] text-amber-600 font-medium">
              Próxima acción en {horasRestantes(log.proximaAccionEn)}
            </span>
          )}
        </div>
      </div>
      {onApproveCharge && (
        <button
          onClick={onApproveCharge}
          disabled={approving}
          className="shrink-0 mt-0.5 text-xs font-semibold px-3 py-1.5 rounded-lg bg-primary text-primary-foreground hover:bg-[#333] transition-colors disabled:opacity-50 flex items-center gap-1.5"
        >
          {approving ? <Loader2 size={12} className="animate-spin" /> : <CreditCard size={12} />}
          {approving ? 'Cobrando…' : 'Aprobar y cobrar'}
        </button>
      )}
      {onAprobarEnvio && (
        <button
          onClick={onAprobarEnvio}
          disabled={approving || !log.mensajeCliente}
          title={!log.mensajeCliente ? 'No se pudo redactar un mensaje para la clienta' : undefined}
          className="shrink-0 mt-0.5 text-xs font-semibold px-3 py-1.5 rounded-lg bg-primary text-primary-foreground hover:bg-[#333] transition-colors disabled:opacity-50 flex items-center gap-1.5"
        >
          {approving ? <Loader2 size={12} className="animate-spin" /> : <Gift size={12} />}
          {approving ? 'Enviando…' : (ETIQUETA_APROBAR[log.accion] ?? 'Aprobar y enviar')}
        </button>
      )}
      <button
        onClick={onDismiss}
        className="text-muted-foreground hover:text-muted-foreground transition-colors shrink-0 mt-0.5"
        title="Descartar"
      >
        <X size={14} />
      </button>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function AutomatizacionesPage() {
  const {
    studio, automationRules, automationLogs, socios,
    toggleAutomationRule, addAutomationRule, runAutomation, dismissLog, marcarCobrado, actualizarLog,
  } = useStudio();

  const [running, setRunning] = useState(false);
  const [approvingId, setApprovingId] = useState<string | null>(null);
  const [tab, setTab] = useState<'log' | 'reglas'>('log');
  const [filterResultado, setFilterResultado] = useState<ResultadoLog | 'TODAS'>('TODAS');
  // Regla pendiente de confirmar antes de ENCENDERLA. Apagar nunca pregunta:
  // dejar de mandar mensajes no necesita permiso de nadie.
  const [confirmarEncender, setConfirmarEncender] = useState<AutomationRule | null>(null);

  const pendingAdmin = automationLogs.filter(l => l.resultado === 'PENDIENTE_ADMIN');
  // A cuánta gente puede llegar de verdad una regla que manda mensajes.
  const contactables = socios.filter(s => s.activo && (s.email || s.telefono)).length;

  function handleToggleRule(rule: AutomationRule) {
    if (!rule.activa && TRIGGERS_QUE_ESCRIBEN_A_CLIENTAS.has(rule.trigger)) {
      setConfirmarEncender(rule);
      return;
    }
    toggleAutomationRule(rule.id);
  }

  const filteredLogs = useMemo(() => {
    return filterResultado === 'TODAS'
      ? automationLogs
      : automationLogs.filter(l => l.resultado === filterResultado);
  }, [automationLogs, filterResultado]);

  async function handleRunNow() {
    setRunning(true);
    await runAutomation();
    setRunning(false);
  }

  function handleCargarSugeridas() {
    const existentes = new Set(automationRules.map(r => r.trigger));
    const nuevas = REGLAS_SUGERIDAS.filter(r => !existentes.has(r.trigger));
    nuevas.forEach(addAutomationRule);
  }

  async function handleApproveCharge(log: AutomationLog) {
    if (!log.reciboId || !log.socioId || !studio) return;
    setApprovingId(log.id);
    const result = await aprobarCobroAutonomo({ logId: log.id, reciboId: log.reciboId, socioId: log.socioId, studioId: studio.id });
    if ('ok' in result) {
      marcarCobrado(log.reciboId);
      actualizarLog(log.id, { resultado: 'EJECUTADO', detalle: 'Cobro aprobado y ejecutado con la tarjeta guardada.' });
    } else {
      actualizarLog(log.id, { resultado: 'FALLIDO', detalle: result.error });
    }
    setApprovingId(null);
  }

  // Común a OFRECER_DESCUENTO ("Enviar oferta") y PROPONER_PLAN ("Proponer
  // plan") — las dos son acciones con aprobación humana que, al aprobarse,
  // mandan log.mensajeCliente (nunca log.detalle) como email a la socia.
  const ASUNTO_POR_ACCION: Partial<Record<AutomationLog['accion'], string>> = {
    OFRECER_DESCUENTO: 'Te guardamos un hueco 💛',
    PROPONER_PLAN: 'Una idea para tu plan 💡',
  };

  async function handleAprobarYEnviar(log: AutomationLog) {
    if (!log.socioId) return;
    // Nunca enviar sin un mensajeCliente ya redactado — usar log.detalle (nota
    // interna, para la propietaria) aquí sería reintroducir el bug que mandaba
    // ese texto tal cual a la socia.
    if (!log.mensajeCliente) {
      actualizarLog(log.id, { resultado: 'FALLIDO', detalle: 'No se pudo redactar el mensaje para la clienta — no se envió nada.' });
      return;
    }
    const socio = socios.find(s => s.id === log.socioId);
    if (!socio?.email) {
      actualizarLog(log.id, { resultado: 'FALLIDO', detalle: 'La clienta no tiene email registrado' });
      return;
    }
    setApprovingId(log.id);
    try {
      const res = await fetch('/api/emails/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(await authHeader()) },
        body: JSON.stringify({
          tipo: 'automatizacion',
          to: socio.email,
          toName: socio.nombre,
          data: { titulo: ASUNTO_POR_ACCION[log.accion] ?? 'Un mensaje de tu estudio', mensaje: log.mensajeCliente },
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        actualizarLog(log.id, { resultado: 'FALLIDO', detalle: body.error ?? `No se pudo enviar el email (HTTP ${res.status})` });
      } else {
        actualizarLog(log.id, { resultado: 'EJECUTADO', detalle: `Mensaje enviado a ${socio.email}.` });
      }
    } catch (err) {
      actualizarLog(log.id, { resultado: 'FALLIDO', detalle: mensajeSeguro(err instanceof Error ? err.message : null, 'Error de red al enviar el email') });
    }
    setApprovingId(null);
  }

  const filters: { value: ResultadoLog | 'TODAS'; label: string }[] = [
    { value: 'TODAS', label: 'Todas' },
    { value: 'PENDIENTE_ADMIN', label: 'Acción humana' },
    { value: 'EJECUTADO', label: 'Ejecutado' },
    { value: 'ESPERANDO', label: 'Esperando' },
    { value: 'FALLIDO', label: 'Fallido' },
  ];

  return (
    <div className="max-w-4xl">
      <MorningBriefing logs={automationLogs} />

      {/* Pending admin actions */}
      {pendingAdmin.length > 0 && (
        <div className="mb-6 rounded-2xl border border-border bg-brand/10 p-4">
          <div className="flex items-center gap-2 mb-3">
            <AlertTriangle size={16} className="text-brand-secondary" />
            <h2 className="font-semibold text-brand-secondary text-sm">Requiere tu intervención</h2>
            <span className="ml-auto text-xs text-brand-secondary bg-brand/10 px-2 py-0.5 rounded-full font-medium">
              {pendingAdmin.length}
            </span>
          </div>
          <div className="space-y-2">
            {pendingAdmin.map(log => (
              <LogItem
                key={log.id}
                log={log}
                onDismiss={() => dismissLog(log.id)}
                onApproveCharge={log.accion === 'COBRAR_RECIBO' ? () => handleApproveCharge(log) : undefined}
                onAprobarEnvio={(log.accion === 'OFRECER_DESCUENTO' || log.accion === 'PROPONER_PLAN') ? () => handleAprobarYEnviar(log) : undefined}
                approving={approvingId === log.id}
              />
            ))}
          </div>
        </div>
      )}

      {/* Run now button */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex bg-muted rounded-xl p-1 gap-1">
          {(['log', 'reglas'] as const).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={cn(
                'px-4 py-1.5 rounded-lg text-sm font-medium transition-all',
                tab === t ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
              )}
            >
              {/* "Reglas activas" era engañoso: la lista incluye también las
                  desactivadas, que ahora es el estado por defecto. */}
              {t === 'log' ? 'Registro de acciones' : 'Reglas'}
            </button>
          ))}
        </div>
        <button
          onClick={handleRunNow}
          disabled={running}
          className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-xl text-sm font-medium hover:bg-[#2A2A24] disabled:opacity-50 transition-colors"
        >
          {running ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} />}
          {running ? 'Evaluando...' : 'Ejecutar ahora'}
        </button>
      </div>

      {tab === 'reglas' && (
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-4">
            <p className="text-xs text-muted-foreground">
              Las reglas llegan <strong className="text-foreground">desactivadas</strong>. Ábrelas para ver
              qué envía cada una y enciende solo las que quieras.
            </p>
            <button
              onClick={handleCargarSugeridas}
              className="flex items-center gap-1.5 shrink-0 text-xs font-semibold px-3 py-1.5 rounded-lg border border-border text-foreground hover:bg-muted transition-colors"
            >
              <Zap size={12} />
              Cargar reglas sugeridas
            </button>
          </div>
          {automationRules.length === 0 && (
            <div className="text-center py-12 text-muted-foreground">
              <Bot size={32} className="mx-auto mb-2 opacity-30" />
              <p className="text-sm">Todavía no tienes ninguna automatización activa</p>
            </div>
          )}
          {automationRules.map(rule => (
            <RuleCard
              key={rule.id}
              rule={rule}
              onToggle={() => handleToggleRule(rule)}
            />
          ))}
        </div>
      )}

      {tab === 'log' && (
        <div>
          <div className="flex gap-2 mb-4 flex-wrap">
            {filters.map(f => (
              <button
                key={f.value}
                onClick={() => setFilterResultado(f.value)}
                className={cn(
                  'px-3 py-1 rounded-full text-xs font-medium border transition-all',
                  filterResultado === f.value
                    ? 'bg-primary text-primary-foreground border-foreground'
                    : 'bg-card text-foreground border-border hover:border-muted-foreground'
                )}
              >
                {f.label}
              </button>
            ))}
          </div>
          {filteredLogs.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Bot size={32} className="mx-auto mb-2 opacity-30" />
              <p className="text-sm">No hay registros para este filtro</p>
            </div>
          ) : (
            <div className="space-y-2">
              {filteredLogs.map(log => (
                <LogItem key={log.id} log={log} onDismiss={() => dismissLog(log.id)} />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Encender una regla que escribe a las clientas es dar permiso para
          mandar mensajes en su nombre, cada mañana y sin volver a preguntar.
          Se dice qué hace y a cuánta gente alcanza ANTES del sí. */}
      <Dialog open={confirmarEncender !== null} onOpenChange={open => !open && setConfirmarEncender(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-[15px] font-semibold text-foreground">
              Esto va a escribir a tus clientas
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 mt-2 text-[13px] text-muted-foreground">
            <p className="text-foreground font-medium">{confirmarEncender?.nombre}</p>
            <p>{confirmarEncender?.descripcion}</p>
            <p>
              Los mensajes salen solos cada mañana, en nombre de tu estudio y sin
              volver a preguntarte. Ahora mismo puede escribir a{' '}
              <span className="font-semibold text-foreground">
                {contactables} {contactables === 1 ? 'clienta' : 'clientas'}
              </span>{' '}
              que {contactables === 1 ? 'tiene' : 'tienen'} email o teléfono.
            </p>
            <p>Puedes pausarla cuando quieras desde esta misma pantalla.</p>
          </div>
          <div className="flex gap-2 mt-4">
            <button
              className="flex-1 justify-center py-2.5 rounded-xl border border-border text-[13px] font-medium text-foreground hover:bg-muted transition-colors"
              onClick={() => setConfirmarEncender(null)}
            >
              No, dejarla pausada
            </button>
            <button
              className="flex-1 justify-center py-2.5 rounded-xl bg-brand text-brand-foreground text-[13px] font-bold hover:opacity-90 transition-opacity"
              onClick={() => {
                if (confirmarEncender) toggleAutomationRule(confirmarEncender.id);
                setConfirmarEncender(null);
              }}
            >
              Sí, activarla
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
