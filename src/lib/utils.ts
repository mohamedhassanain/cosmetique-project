import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatWhatsAppNumber(number: string) {
  const cleaned = number.replaceAll(/\D/g, '');
  // Si le numéro commence par 0, on remplace par 212
  if (cleaned.startsWith('0')) {
    return '212' + cleaned.substring(1);
  }
  // Si le numéro ne commence pas par 212, on l'ajoute
  if (!cleaned.startsWith('212')) {
    return '212' + cleaned;
  }
  return cleaned;
}
