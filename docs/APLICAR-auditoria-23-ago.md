# Cómo aplicar la auditoría del 23-ago (5 minutos)

## 1. Desbloquear git (obligatorio, ahora mismo no funciona)

Un proceso de git reventó hoy a las 09:07 y dejó tres cerrojos. Hasta borrarlos
no puedes hacer commit, stash ni merge en este repo:

```bash
cd ~/dev/o
rm -f .git/index.lock .git/ORIG_HEAD.lock .git/packed-refs.lock
```

## 2. Guardar el trabajo en curso y ponerte al día

Tu árbol iba **59 commits por detrás** de `main` y tiene una feature de
gamificación a medias sin commitear (logros, retos, niveles):

```bash
git stash push -u -m "WIP gamificacion"
git checkout main && git pull
```

## 3. Subir la auditoría del 22-ago — esto es lo urgente

Sus 15 fallos siguen **todos** vivos en producción:

```bash
git push -u origin audit/2026-08-22   # nunca se subió; solo existe en tu portátil
```

## 4. Aplicar la del 23-ago

```bash
git checkout -b audit/2026-08-23
git am docs/../auditoria-2026-08-23.patch   # ajusta la ruta al .patch
git push -u origin audit/2026-08-23
```

Verificado: el parche aplica limpio sobre `main` (`4777184e`).

## 5. Al desplegar, aplicar la migración

`supabase/migrations/20260823090000_resolver_pendiente_ignora_clases_canceladas.sql`

Verificada contra producción: su cuerpo coincide en MD5 con la función viva hoy
salvo exactamente la línea que añade (`coalesce(ss.cancelada, false) = false`).

---

**Informe completo:** `docs/auditoria-2026-08-23.md`
