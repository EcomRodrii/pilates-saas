-- Festivos: también se guarda un festivo OFICIAL cuando la lista no lo trae
-- sola: el estudio no tiene una dirección de la que sacar su comunidad, o ha
-- buscado otra localidad, o son los nacionales comunes. El servidor lo comprueba
-- contra el calendario copiado del boletín (lib/festivos/oficiales.ts) y guarda
-- el nombre del boletín, no el del navegador.
alter table public.festivos_estudio drop constraint if exists festivos_estudio_origen_check;
alter table public.festivos_estudio add constraint festivos_estudio_origen_check check (origen in ('oficial', 'ia', 'manual'));
