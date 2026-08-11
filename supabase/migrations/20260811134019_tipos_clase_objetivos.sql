-- Objetivos que cubre cada tipo de clase, para el asistente «Descubre tu clase
-- ideal» de la página pública.
--
-- ⚠️ Los valores son una lista FIJA (lib/reservar/objetivos.ts), no texto libre
-- por estudio. Con objetivos libres cada estudio escribe los suyos
-- («tonificar», «tonificación», «ponerme fuerte»), nadie los rellena igual y la
-- recomendación se vuelve ruido. Fijos, la pregunta significa lo mismo en todos
-- los estudios — y esa lista pasa a ser CONTRATO: sus ids se pueden AÑADIR,
-- nunca renombrar ni borrar sin migrar lo que los estudios ya marcaron.
--
-- Array VACÍO = «sin declarar», y entonces la clase vale para TODOS los
-- objetivos (ver `claseSirvePara`). Es la decisión que más cambia el resultado:
-- el estudio medio va a tardar en rellenar esto, y si una clase sin marcar
-- quedara excluida, activar el asistente vaciaría el horario el primer día.
--
-- Puramente aditiva y con default: ningún tipo de clase existente cambia de
-- comportamiento. Sin RLS nueva — se lee y escribe por las políticas que ya
-- tiene `tipos_clase`.

alter table public.tipos_clase
  add column if not exists objetivos text[] not null default '{}';

comment on column public.tipos_clase.objetivos is
  'Objetivos de la lista FIJA de lib/reservar/objetivos.ts que cubre este tipo de clase. Array vacio = sin declarar, y entonces vale para TODOS (ver claseSirvePara): si una clase sin marcar quedara excluida, activar el asistente vaciaria el horario el primer dia.';
