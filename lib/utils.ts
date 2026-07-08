import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// Identificador local corto para entidades creadas en el cliente.
export function uid() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}
