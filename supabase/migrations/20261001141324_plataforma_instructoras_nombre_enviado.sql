-- El nombre con el que se creó (o renombró por última vez) cada instructora
-- como «trainer» en la plataforma. Su nombre vive TAMBIÉN allí: cuando cambia
-- en Tentare —y en especial cuando se anonimiza al eliminar a la persona o
-- purgar el estudio— el cron de horario lo reescribe allí (PUT /trainers).
-- Sin esto no hay forma de saber que el de allí se ha quedado viejo.
alter table public.plataforma_instructoras
  add column if not exists nombre_enviado text;
