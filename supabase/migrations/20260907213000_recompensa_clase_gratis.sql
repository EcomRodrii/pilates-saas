-- ═══════════════════════════════════════════════════════════════════════════
-- Una recompensa puede ENTREGARSE SOLA: la clase gratis.
--
-- Hasta ahora `reward_catalog` solo sabía decir nombre, icono y coste. Todo lo
-- que se canjeaba había que dárselo a mano en el mostrador — bien para una
-- botella de agua, absurdo para la recompensa canónica de un estudio de
-- Pilates, que es una clase invitada.
--
-- `efecto` dice qué pasa al canjear:
--   · MANUAL       — lo de siempre: queda PENDIENTE y alguien la entrega.
--   · CLASE_GRATIS — se concede una RECUPERACIÓN y el canje nace ENTREGADO,
--                    porque no hay nada que dar en mano.
--
-- ⚠️ No se inventa un "vale de clase" nuevo. La recuperación YA es el derecho a
-- una clase suelta en este producto: la alumna la gasta reservando por el
-- camino de siempre, cuenta contra el tope de 4 vivas, caduca con la política
-- del estudio y aparece en su pantalla. Un vale paralelo tendría que
-- reimplementar las cuatro cosas y se desincronizaría de todas ellas.
--
-- Por eso la concesión va por `crear_recuperacion`, la RPC que ya existe: coge
-- el advisory lock por socia, aplica `recuperacion_caducidad_tipo/_dias` del
-- estudio y devuelve 'TOPE' si la alumna ya tiene cuatro vivas. Ese 'TOPE' hay
-- que respetarlo: quien canjea y no puede recibir la clase tiene que recuperar
-- sus créditos, y de eso se encarga `cancelar_canje`.
-- ═══════════════════════════════════════════════════════════════════════════

alter table public.reward_catalog
  add column if not exists efecto text not null default 'MANUAL';

-- El CHECK va aparte y con nombre: así una migración futura puede añadir un
-- efecto nuevo sin adivinar cómo se llamaba la restricción.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'reward_catalog_efecto_check'
  ) then
    alter table public.reward_catalog
      add constraint reward_catalog_efecto_check
      check (efecto in ('MANUAL', 'CLASE_GRATIS'));
  end if;
end $$;

comment on column public.reward_catalog.efecto is
  'MANUAL = la entrega alguien en el mostrador. CLASE_GRATIS = concede una recuperación al canjear y el canje nace ENTREGADO.';
