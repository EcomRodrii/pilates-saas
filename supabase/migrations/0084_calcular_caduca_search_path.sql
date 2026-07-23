-- Hardening: fijar search_path en calcular_caduca_recuperacion (solo usa built-ins;
-- se quedó sin él en 0081). Cierra el advisor function_search_path_mutable.
alter function public.calcular_caduca_recuperacion(date, text, integer) set search_path = '';
