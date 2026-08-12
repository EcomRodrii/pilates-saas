// Prueba de falsación antes de construir la Fase 2 del cuestionario de salud
// (autoservicio real: la propia socia responde desde el portal). Fase 1
// (plantilla configurable, solo staff) se mergeó el 2026-08-12 (PR #990) sin
// ninguna señal de demanda documentada para la Fase 2 — tentare-producto la
// bloqueó explícitamente hasta que hubiera uso sostenido real. Mismo molde
// que lib/piloto-ficha-viva.ts: ventana y umbral fijados ANTES de mirar el
// dato, no ajustados después para justificar la decisión que se quiera tomar.
//
// Sin código de producto a propósito — es un experimento de medición, no una
// feature. Se borra este archivo al resolver la pregunta (haya salido que sí
// o que no).
//
// Ventana: 6 semanas desde el lanzamiento de Fase 1.
export const MEDICION_FASE2_INICIO = '2026-08-12';
export const MEDICION_FASE2_FIN = '2026-09-23';

// Umbral (tentare-producto, 2026-08-13): si menos del 30% de las socias con
// ficha clínica activa en estudios que SÍ configuraron una plantilla tienen
// al menos una respuesta guardada al cerrar la ventana, el problema no es
// "quién lo rellena" (autoservicio no lo arreglaría) sino que el cuestionario
// no está enganchado al flujo de alta — se ataca dentro de la Fase 1 (p.ej.
// un recordatorio en el alta o antes de la primera clase), no con un canal
// nuevo de escritura sobre dato de categoría especial RGPD.
export const MEDICION_FASE2_UMBRAL_CUMPLIMENTACION = 0.30;

// Query para comprobar la tasa al cerrar la ventana (o antes, para ver
// tendencia) — ejecutar contra el proyecto real vía el MCP de Supabase.
// Numerador: socias DISTINCT con >=1 fila en respuestas_cuestionario_salud,
// en estudios que tienen alguna plantilla activa. Denominador: socias
// DISTINCT con >=1 condición en condiciones_salud (proxy de "tiene ficha
// clínica activa", que es la audiencia real del cuestionario) en esos mismos
// estudios.
export const MEDICION_FASE2_QUERY = `
with estudios_con_plantilla as (
  select distinct studio_id from plantillas_cuestionario_salud where activo = true
),
con_ficha as (
  select distinct studio_id, socio_id from condiciones_salud
  where studio_id in (select studio_id from estudios_con_plantilla)
),
con_respuesta as (
  select distinct studio_id, socio_id from respuestas_cuestionario_salud
  where studio_id in (select studio_id from estudios_con_plantilla)
)
select
  (select count(*) from con_ficha) as socias_con_ficha_activa,
  (select count(*) from con_respuesta) as socias_con_respuesta,
  case when (select count(*) from con_ficha) = 0 then null
       else round((select count(*) from con_respuesta)::numeric / (select count(*) from con_ficha), 3)
  end as tasa_cumplimentacion;
`;

// Petición explícita de una propietaria real pidiendo específicamente
// autoservicio (no "sería bonito que...") — la SEGUNDA condición para
// reabrir esto, además de superar el umbral de arriba. Sin mecanismo
// automático de captura: si aparece, se anota en memoria de sesión
// (project memory), no aquí.
