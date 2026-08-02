import { useEffect, useState } from 'react';

/**
 * Media query standard pour les appareils à souris (PC / laptop).
 * Un écran tactile (mobile, tablette) renvoie false même si la fenêtre est large.
 * Utilisé pour ouvrir les fiches produit dans un nouvel onglet uniquement sur PC.
 */
const DESKTOP_QUERY = '(hover: hover) and (pointer: fine)';

export function useIsDesktop(): boolean {
  const [isDesktop, setIsDesktop] = useState<boolean>(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return true;
    return window.matchMedia(DESKTOP_QUERY).matches;
  });

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mql = window.matchMedia(DESKTOP_QUERY);
    const onChange = (e: MediaQueryListEvent) => setIsDesktop(e.matches);
    mql.addEventListener('change', onChange);
    setIsDesktop(mql.matches);
    return () => mql.removeEventListener('change', onChange);
  }, []);

  return isDesktop;
}
