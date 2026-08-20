// `severidad` vive ahora en lib/decision/severidad.ts: la usa también lógica
// pura con tests, y `npm test` solo corre `lib/**/*.test.ts`. Se reexporta aquí
// para no tocar los dos componentes que ya la importaban por esta ruta.
export {
  severidad, SEVERIDAD_INFO, type NivelSeveridad,
  nivelSituacion, NIVEL_SITUACION_INFO, type NivelSituacion,
} from '@/lib/decision/severidad';
