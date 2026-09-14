/**
 * Logger con filtrado de nivel — evita spam de logs en console que ensucian
 * Sentry breadcrumbs y congestiona la red.
 *
 * Niveles: DEBUG < INFO < WARN < ERROR
 * En producción: solo WARN + ERROR
 * En desarrollo: configurable por variable
 */

export type LogLevel = 'DEBUG' | 'INFO' | 'WARN' | 'ERROR';

const NIVEL_PRODUCCION: LogLevel = 'WARN';
const ORDEN: Record<LogLevel, number> = {
  DEBUG: 0,
  INFO: 1,
  WARN: 2,
  ERROR: 3,
};

/** Banderas opcionales que se pueden fijar en `globalThis` para depurar. */
type GlobalConLogs = typeof globalThis & { __LOG_LEVEL?: string; __STRIP_LOGS__?: boolean };

function nivelMinimo(): LogLevel {
  if (typeof window === 'undefined') {
    // Server-side: siempre WARN
    return NIVEL_PRODUCCION;
  }
  // Client-side: respetar variable de entorno si existe, si no WARN
  const envLevel = (globalThis as GlobalConLogs).__LOG_LEVEL;
  return (envLevel?.toUpperCase() as LogLevel) || NIVEL_PRODUCCION;
}

function debeRegistrarse(nivel: LogLevel): boolean {
  const minimo = nivelMinimo();
  return ORDEN[nivel] >= ORDEN[minimo];
}

export const logger = {
  debug(...args: unknown[]): void {
    if (debeRegistrarse('DEBUG')) console.debug(...args);
  },
  info(...args: unknown[]): void {
    if (debeRegistrarse('INFO')) console.info(...args);
  },
  warn(...args: unknown[]): void {
    if (debeRegistrarse('WARN')) console.warn(...args);
  },
  error(...args: unknown[]): void {
    if (debeRegistrarse('ERROR')) console.error(...args);
  },
};

/**
 * Reemplaza console.log globalmente si __STRIP_LOGS__ está activo.
 * Llamar UNA SOLA VEZ en el entry point del cliente (app/layout.tsx).
 */
export function setupLogStripping(): void {
  if (typeof window === 'undefined') return;
  if (!(globalThis as GlobalConLogs).__STRIP_LOGS__) return;

  const noOp = () => {};
  globalThis.console = {
    ...console,
    log: noOp,
    debug: noOp,
    info: noOp,
  };
}
