-- I-17 (auditoría 15-sep): nada validaba en servidor lo que el navegador
-- escribe en `studios` — RLS controla QUIÉN escribe, no QUÉ valor. Los
-- campos enum-like ya tenían CHECK (plan, modo_autonomia, compra_publica_modo...)
-- y las columnas de billing ya no son escribibles por `authenticated`
-- (20260910171150). Quedaban sin ningún tope estas columnas numéricas,
-- alcanzables desde `dbUpdateStudio` (lib/supabase-data.ts): un valor negativo
-- o disparatado en cualquiera de ellas puede romper lógica de reservas, lista
-- de espera, riesgo de dependencia o —la más seria, `penalizacion_importe_eur`—
-- dinero real cobrado vía `cobrarReciboOffSession`.
alter table public.studios
  add constraint studios_iva_por_defecto_rango
    check (iva_por_defecto >= 0 and iva_por_defecto <= 100),
  add constraint studios_penalizacion_importe_eur_rango
    check (penalizacion_importe_eur is null or (penalizacion_importe_eur >= 0 and penalizacion_importe_eur <= 10000)),
  add constraint studios_dep_umbral_alto_rango
    check (dep_umbral_alto >= 0 and dep_umbral_alto <= 100),
  add constraint studios_dep_umbral_medio_rango
    check (dep_umbral_medio >= 0 and dep_umbral_medio <= 100),
  add constraint studios_dep_ventana_dias_rango
    check (dep_ventana_dias > 0 and dep_ventana_dias <= 365),
  add constraint studios_cancelacion_ventana_horas_rango
    check (cancelacion_ventana_horas is null or (cancelacion_ventana_horas >= 0 and cancelacion_ventana_horas <= 720)),
  add constraint studios_reserva_ventana_minima_minutos_rango
    check (reserva_ventana_minima_minutos >= 0 and reserva_ventana_minima_minutos <= 10080),
  add constraint studios_reserva_antelacion_maxima_dias_rango
    check (reserva_antelacion_maxima_dias is null or (reserva_antelacion_maxima_dias >= 0 and reserva_antelacion_maxima_dias <= 365)),
  add constraint studios_reserva_max_simultaneas_rango
    check (reserva_max_simultaneas is null or (reserva_max_simultaneas >= 1 and reserva_max_simultaneas <= 50)),
  add constraint studios_lista_espera_plazo_aceptacion_minutos_rango
    check (lista_espera_plazo_aceptacion_minutos >= 0 and lista_espera_plazo_aceptacion_minutos <= 1440),
  add constraint studios_minimo_asistentes_por_clase_rango
    check (minimo_asistentes_por_clase >= 0 and minimo_asistentes_por_clase <= 100),
  add constraint studios_reembolso_plazo_dias_rango
    check (reembolso_plazo_dias >= 0 and reembolso_plazo_dias <= 365),
  add constraint studios_creditos_caducan_meses_rango
    check (creditos_caducan_meses is null or (creditos_caducan_meses >= 1 and creditos_caducan_meses <= 60)),
  add constraint studios_racha_clases_semana_rango
    check (racha_clases_semana is null or (racha_clases_semana >= 0 and racha_clases_semana <= 100));
