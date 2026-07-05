'use client';

import { useState, useMemo } from 'react';
import { useStudio } from '@/lib/studio-context';
import {
  Bot, Zap, CheckCircle2, Clock, AlertTriangle, XCircle,
  Play, ToggleLeft, ToggleRight, ChevronRight, Loader2,
  MessageSquare, Mail, CreditCard, Bell, Gift, TrendingUp,
  Send, X, Eye,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { AutomationRule, AutomationLog, AccionAutomatica, ResultadoLog } from '@/lib/types';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatHora(iso: string) {
  return new Date(iso).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
}

function formatFecha(iso: string) {
  return new Date(iso).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

function horasRestantes(iso: string) {
  const diff = new Date(iso).getTime() - Date.now();
  if (diff <= 0) return 'Vencida';
  const h = Math.floor(diff / 3600000);
  const m = Math.floor((diff % 3600000) / 60000);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

const accionConfig: Record<AccionAutomatica, { label: string; icon: React.ElementType; color: string }> = {
  ENVIAR_EMAIL:      { label: 'Email', icon: Mail, color: '#4B3FD6' },
  ENVIAR_WHATSAPP:   { label: 'WhatsApp', icon: MessageSquare, color: '#16A34A' },
  COBRAR_RECIBO:     { label: 'Cobro automático', icon: CreditCard, color: '#7C3AED' },
  CREAR_NOTA:        { label: 'Nota de progreso', icon: Eye, color: '#0891B2' },
  NOTIFICAR_ADMIN:   { label: 'Notificación admin', icon: Bell, color: '#D97706' },
  OFRECER_CLASE_GRATIS: { label: 'Clase gratis', icon: Gift, color: '#DB2777' },
  PROPONER_PLAN:     { label: 'Proponer plan', icon: TrendingUp, color: '#059669' },
  ENVIAR_EJERCICIOS: { label: 'Ejercicios casa', icon: Send, color: '#6355FF' },
};

const resultadoConfig: Record<ResultadoLog, { label: string; color: string; bg: string; icon: React.ElementType }> = {
  EJECUTADO:       { label: 'Ejecutado', color: '#16A34A', bg: '#DCFCE7', icon: CheckCircle2 },
  ESPERANDO:       { label: 'Esperando', color: '#D97706', bg: '#FEF3C7', icon: Clock },
  FALLIDO:         { label: 'Fallido', color: '#DC2626', bg: '#FEE2E2', icon: XCircle },
  PENDIENTE_ADMIN: { label: 'Acción humana', color: '#7C3AED', bg: '#EDE9FE', icon: AlertTriangle },
};

const triggerLabels: Record<string, string> = {
  AUSENCIA_DIAS:       'Ausencia de socia',
  PAGO_PENDIENTE_DIAS: 'Pago pendiente',
  BONO_SESIONES_BAJAS: 'Bono casi agotado',
  SUSCRIPCION_EXPIRA_DIAS: 'Suscripción próxima a expirar',
  NUEVA_SOCIA:         'Nueva socia',
  CLASE_MANANA:        'Clase mañana',
  RENOVACION_COBRADA:  'Renovación cobrada',
};

// ─── Morning Briefing ─────────────────────────────────────────────────────────

function MorningBriefing({ logs }: { logs: AutomationLog[] }) {
  const today = new Date().toISOString().slice(0, 10);
  const todayLogs = logs.filter(l => l.ejecutadoEn.startsWith(today));
  const pendingAdmin = logs.filter(l => l.resultado === 'PENDIENTE_ADMIN');
  const ejecutadas = todayLogs.filter(l => l.resultado === 'EJECUTADO').length;
  const esperando = todayLogs.filter(l => l.resultado === 'ESPERANDO').length;

  const hour = new Date().getHours();
  const greeting = hour < 13 ? 'Buenos días' : hour < 20 ? 'Buenas tardes' : 'Buenas noches';

  return (
    <div className="rounded-2xl bg-gradient-to-br from-[#15161B] to-[#2A2B34] text-white p-6 mb-6">
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
        <div className="shrink-0 w-14 h-14 rounded-2xl bg-white/10 flex items-center justify-center">
          <Zap size={28} className="text-white/80" />
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3 mt-5">
        <div className="rounded-xl bg-white/10 px-4 py-3">
          <div className="text-2xl font-bold">{ejecutadas}</div>
          <div className="text-white/50 text-xs mt-0.5">Acciones hoy</div>
        </div>
        <div className="rounded-xl bg-white/10 px-4 py-3">
          <div className="text-2xl font-bold text-amber-300">{esperando}</div>
          <div className="text-white/50 text-xs mt-0.5">Esperando resp.</div>
        </div>
        <div className="rounded-xl bg-white/10 px-4 py-3">
          <div className={cn('text-2xl font-bold', pendingAdmin.length > 0 ? 'text-red-300' : 'text-green-300')}>
            {pendingAdmin.length}
          </div>
          <div className="text-white/50 text-xs mt-0.5">Tu intervención</div>
        </div>
      </div>
    </div>
  );
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

  return (
    <div className={cn(
      'rounded-xl border bg-white transition-all',
      rule.activa ? 'border-gray-200' : 'border-gray-100 opacity-60'
    )}>
      <div className="flex items-center gap-3 p-4">
        <div className="text-2xl">{rule.icono}</div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-gray-900 text-sm truncate">{rule.nombre}</span>
            {rule.ultimaEjecucion && (
              <span className="text-[10px] text-gray-400 shrink-0">
                Última: {formatFecha(rule.ultimaEjecucion)}
              </span>
            )}
          </div>
          <p className="text-xs text-gray-500 mt-0.5 truncate">{rule.descripcion}</p>
          <div className="flex items-center gap-3 mt-1">
            <span className="text-[10px] text-gray-400 bg-gray-50 px-2 py-0.5 rounded-full border">
              {triggerLabels[rule.trigger] ?? rule.trigger}
            </span>
            <span className="text-[10px] text-gray-400">{rule.ejecutadaVeces} ejecuciones</span>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={() => setExpanded(p => !p)}
            className="p-1.5 text-gray-400 hover:text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
          >
            <ChevronRight size={14} className={cn('transition-transform', expanded && 'rotate-90')} />
          </button>
          <button
            onClick={onToggle}
            className="text-gray-400 hover:text-gray-700 transition-colors"
          >
            {rule.activa
              ? <ToggleRight size={28} className="text-gray-900" />
              : <ToggleLeft size={28} />
            }
          </button>
        </div>
      </div>

      {expanded && (
        <div className="border-t border-gray-100 px-4 py-3">
          <p className="text-xs font-semibold text-gray-500 mb-2 uppercase tracking-wide">Pasos del flujo</p>
          <div className="space-y-2">
            {rule.pasos.map((paso, i) => {
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
                    <span className="text-xs font-medium text-gray-800">{cfg.label}</span>
                    {paso.esperarHoras && (
                      <span className="text-[10px] text-gray-400 ml-1.5">
                        → espera {paso.esperarHoras}h
                        {paso.condicion === 'SIN_RESPUESTA' ? ' si sin respuesta' : ''}
                      </span>
                    )}
                    {paso.parametros.mensaje && (
                      <p className="text-[11px] text-gray-500 mt-0.5 italic">
                        &ldquo;{String(paso.parametros.mensaje)}&rdquo;
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Log Item ─────────────────────────────────────────────────────────────────

function LogItem({ log, onDismiss }: { log: AutomationLog; onDismiss: () => void }) {
  const cfg = resultadoConfig[log.resultado];
  const accionCfg = accionConfig[log.accion];
  const AIcon = accionCfg.icon;
  const RIcon = cfg.icon;

  return (
    <div className={cn(
      'flex items-start gap-3 p-3 rounded-xl border',
      log.resultado === 'PENDIENTE_ADMIN' && 'border-violet-200 bg-violet-50',
      log.resultado === 'EJECUTADO' && 'border-gray-100 bg-white',
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
          <span className="text-sm font-semibold text-gray-900">{log.socioNombre ?? 'Sistema'}</span>
          <span
            className="inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full"
            style={{ color: cfg.color, background: cfg.bg }}
          >
            <RIcon size={10} />
            {cfg.label}
          </span>
        </div>
        <p className="text-xs text-gray-600 mt-0.5">{log.detalle}</p>
        <div className="flex items-center gap-3 mt-1">
          <span className="text-[10px] text-gray-400">{log.ruleName}</span>
          <span className="text-[10px] text-gray-400">{formatFecha(log.ejecutadoEn)}</span>
          {log.proximaAccionEn && log.resultado === 'ESPERANDO' && (
            <span className="text-[10px] text-amber-600 font-medium">
              Próxima acción en {horasRestantes(log.proximaAccionEn)}
            </span>
          )}
        </div>
      </div>
      <button
        onClick={onDismiss}
        className="text-gray-300 hover:text-gray-500 transition-colors shrink-0 mt-0.5"
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
    automationRules, automationLogs,
    toggleAutomationRule, runAutomation, dismissLog,
  } = useStudio();

  const [running, setRunning] = useState(false);
  const [tab, setTab] = useState<'log' | 'reglas'>('log');
  const [filterResultado, setFilterResultado] = useState<ResultadoLog | 'TODAS'>('TODAS');

  const pendingAdmin = automationLogs.filter(l => l.resultado === 'PENDIENTE_ADMIN');

  const filteredLogs = useMemo(() => {
    return filterResultado === 'TODAS'
      ? automationLogs
      : automationLogs.filter(l => l.resultado === filterResultado);
  }, [automationLogs, filterResultado]);

  async function handleRunNow() {
    setRunning(true);
    await new Promise(r => setTimeout(r, 1200));
    runAutomation();
    setRunning(false);
  }

  const filters: { value: ResultadoLog | 'TODAS'; label: string }[] = [
    { value: 'TODAS', label: 'Todas' },
    { value: 'PENDIENTE_ADMIN', label: 'Acción humana' },
    { value: 'EJECUTADO', label: 'Ejecutado' },
    { value: 'ESPERANDO', label: 'Esperando' },
    { value: 'FALLIDO', label: 'Fallido' },
  ];

  return (
    <div className="p-4 sm:p-6 max-w-3xl mx-auto">
      <MorningBriefing logs={automationLogs} />

      {/* Pending admin actions */}
      {pendingAdmin.length > 0 && (
        <div className="mb-6 rounded-2xl border border-violet-200 bg-violet-50 p-4">
          <div className="flex items-center gap-2 mb-3">
            <AlertTriangle size={16} className="text-violet-600" />
            <h2 className="font-semibold text-violet-900 text-sm">Requiere tu intervención</h2>
            <span className="ml-auto text-xs text-violet-600 bg-violet-100 px-2 py-0.5 rounded-full font-medium">
              {pendingAdmin.length}
            </span>
          </div>
          <div className="space-y-2">
            {pendingAdmin.map(log => (
              <LogItem key={log.id} log={log} onDismiss={() => dismissLog(log.id)} />
            ))}
          </div>
        </div>
      )}

      {/* Run now button */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex bg-gray-100 rounded-xl p-1 gap-1">
          {(['log', 'reglas'] as const).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={cn(
                'px-4 py-1.5 rounded-lg text-sm font-medium transition-all',
                tab === t ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
              )}
            >
              {t === 'log' ? 'Registro de acciones' : 'Reglas activas'}
            </button>
          ))}
        </div>
        <button
          onClick={handleRunNow}
          disabled={running}
          className="flex items-center gap-2 px-4 py-2 bg-gray-900 text-white rounded-xl text-sm font-medium hover:bg-gray-700 disabled:opacity-50 transition-colors"
        >
          {running ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} />}
          {running ? 'Evaluando...' : 'Ejecutar ahora'}
        </button>
      </div>

      {tab === 'reglas' && (
        <div className="space-y-3">
          {automationRules.map(rule => (
            <RuleCard
              key={rule.id}
              rule={rule}
              onToggle={() => toggleAutomationRule(rule.id)}
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
                    ? 'bg-gray-900 text-white border-gray-900'
                    : 'bg-white text-gray-600 border-gray-200 hover:border-gray-400'
                )}
              >
                {f.label}
              </button>
            ))}
          </div>
          {filteredLogs.length === 0 ? (
            <div className="text-center py-12 text-gray-400">
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
    </div>
  );
}
