"use client";

import { useMemo } from "react";
import { THEME } from "@/theme/config";
import { ICON_PATHS, type IconName } from "@/components/portal-tema/components/ui/Icon";
import {
  CHALLENGES, CLASSES, DAYS, EXERCISES, FILTERS, NOTIFICATIONS, PASS, PLANS,
  QUICK_LINKS, TABS, WEEK_BARS, dayLabel, findClass, plural,
} from "@/components/portal-tema/data/studio";
import { usePortal, type PortalState } from "./PortalStore";

/** Rejilla del mes: cinco semanas desde el lunes anterior al día 1. */
function buildCalendar(state: PortalState) {
  const cells = [];
  for (let i = -2; i <= 32; i++) {
    const outside = i < 1 || i > 30;
    cells.push({
      key: i,
      label: outside ? (i < 1 ? 30 + i : i - 30) : i,
      outside,
      today: i === 3,
      selected: i === state.day,
      marked: CLASSES.some((c) => c.day === i),
    });
  }
  return { month: "Septiembre 2026", dow: ["L", "M", "X", "J", "V", "S", "D"], cells };
}

const money = (n: number) => n.toFixed(2).replace(".", ",") + " €";

/**
 * Traduce el estado a lo que pinta cada pantalla. Toda la lógica de
 * presentación vive aquí; los componentes solo colocan.
 */
export function useViewModel() {
  const state = usePortal();

  return useMemo(() => {
    const cfg = THEME;
    const f = cfg.features;
    const cls = findClass(state.classId);
    const booked = state.booked.includes(state.classId);
    const fav = state.favourites.includes(state.classId);
    const next = state.booked.length ? findClass(state.booked[0]) : null;
    const dayList = CLASSES.filter((c) => c.day === state.day && (state.filter === "todas" || c.type === state.filter));
    const done = state.booked.length;
    const goal = 4;
    const exercise = EXERCISES[state.exercise];
    const passLeft = Math.max(0, PASS.total - state.booked.length);
    const plan = PLANS.find((p) => p.key === state.plan) || PLANS[0];
    const vat = Math.round(plan.price * 0.21 * 100) / 100;

    return {
      theme: cfg,
      features: f,
      state,
      screen: state.screen,
      tab: state.tab,

      greeting: {
        micro: f.greeting_style === "display-first" ? "Hola, Laura" : "Buenos días",
        name: f.greeting_style === "display-first" ? "¿Lista para tu sesión de hoy?" : cfg.member_name,
        initial: cfg.member_initial,
        headline: cfg.headline,
        hasAlert: !state.alertsSeen,
      },

      next: next && { id: next.id, name: next.name, teacher: next.teacher, meta: "Mañana, " + next.time + " · " + next.room },
      nextHeading: next ? (cfg.id === "noir" ? "Tu próxima clase" : "Próxima clase") : "Tu semana",

      progress: {
        done, goal,
        percent: Math.round((done / goal) * 100),
        turn: (done / goal).toFixed(3),
        summary: done + " de " + goal + " clases",
        note: done >= goal ? "Semana completa" : done ? "Vas muy bien" : "Aún sin reservas",
        bars: WEEK_BARS.map((b, i) => ({
          label: b.label,
          height: b.height,
          tone: i < done + 1 ? (i === 2 ? "brand" : "support") : "empty",
        })),
      },

      challenges: CHALLENGES.map((c) => ({
        ...c,
        joined: state.challenges.includes(c.key),
        cta: state.challenges.includes(c.key) ? "Apuntada ✓" : "Apuntarme",
      })),

      quickLinks: QUICK_LINKS.map((q) => ({ label: q.label, action: q.action, icon: q.icon as IconName })),
      quickLinksHeading: cfg.id === "oliva" ? "Mis accesos rápidos" : "Accesos rápidos",

      week: DAYS.map((d) => ({
        label: d.label, num: d.num,
        active: state.day === d.num,
        hasClass: CLASSES.some((c) => c.day === d.num),
      })),

      filters: FILTERS.map((x) => ({ key: x.key, label: x.label, active: state.filter === x.key })),
      classes: dayList.map((c) => {
        const isBooked = state.booked.includes(c.id);
        return {
          id: c.id, name: c.name, time: c.time, duration: c.duration, initial: c.initial, teacher: c.teacher,
          meta: c.room + " · " + c.level,
          booked: isBooked,
          status: isBooked ? "Reservada" : c.seats ? c.seats + " libres" : "Completa",
          statusTone: (isBooked ? "booked" : c.seats ? "free" : "full") as "booked" | "free" | "full",
        };
      }),
      classCount: plural(dayList.length, "clase", "clases"),

      bookings: state.booked.map((id) => {
        const c = findClass(id);
        return { id: c.id, name: c.name, time: c.time, day: dayLabel(c.day), meta: c.room + " · " + c.teacher };
      }),

      pass: { name: PASS.name, left: passLeft, expires: PASS.expires, percent: Math.round((passLeft / PASS.total) * 100) },
      notifications: NOTIFICATIONS.map((n) => ({ ...n, on: !!state.notifications[n.key] })),
      metrics: [
        { value: state.booked.length, label: "reservas" },
        { value: 18, label: "clases" },
        { value: state.favourites.length, label: "favoritas" },
      ],

      detail: {
        id: cls.id, name: cls.name, teacher: cls.teacher, initial: cls.initial,
        description: cls.description,
        pill: cls.level + " · " + cls.duration,
        booked, fav,
        cta: state.loading ? "Reservando…" : booked ? "Reservada" : cls.seats ? "Reservar mi plaza" : "Apuntarme a la espera",
        seats: booked ? "Tienes tu plaza guardada" : cls.seats ? "Quedan " + cls.seats + " plazas" : "Sin plazas · lista de espera abierta",
        loading: state.loading,
        confirmed: booked && !state.loading,
        meta: [
          { label: cls.time + " – " + cls.end, icon: "clock" as IconName },
          { label: cls.teacher, icon: "person" as IconName },
          { label: cls.room, icon: "pin" as IconName },
          { label: "Nivel " + cls.level.toLowerCase(), icon: "compass" as IconName },
        ],
        facts: [
          { key: "Nivel", value: cls.level },
          { key: "Duración", value: cls.duration },
          { key: "Sala", value: cls.room },
        ],
      },

      session: {
        name: exercise.name,
        step: "Ejercicio " + (state.exercise + 1) + " de " + EXERCISES.length,
        status: state.seconds === 0 ? "Completada" : state.running ? "En marcha" : "En pausa",
        clock: "00:" + String(state.seconds).padStart(2, "0"),
        percent: Math.round(100 - (state.seconds / exercise.seconds) * 100),
        running: state.running,
      },

      tabs: TABS.map((t) => ({
        key: t.key, label: t.label, icon: t.icon as IconName,
        active: state.tab === t.key,
        fill: state.tab === t.key && f.tab_icon_fill ? "currentColor" : "none",
        stroke: state.tab === t.key ? 2.2 : 1.7,
        showLabel: f.tab_bar_style !== "floating" || state.tab === t.key,
      })),
      showTabBar: (["inicio", "clases", "calendario", "reservas", "perfil", "bonos"] as string[]).includes(state.screen),

      welcome: cfg.welcome,

      plans: PLANS.map((p) => ({ ...p, selected: state.plan === p.key })),
      checkout: {
        plan: plan.name,
        price: money(plan.price),
        vat: money(vat),
        total: money(plan.price + vat),
        paying: state.paying,
        cta: state.paying ? "Procesando pago…" : "Pagar " + money(plan.price + vat),
      },

      auth: { working: state.authWorking },
      calendar: buildCalendar(state),
      icons: ICON_PATHS,
      toast: state.toast,
      toastId: state.toastId,
    };
  }, [state]);
}

export type ViewModel = ReturnType<typeof useViewModel>;
