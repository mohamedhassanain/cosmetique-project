import { useEffect } from 'react';
import { useSiteSettings } from '@/hooks/useSiteSettings';

export function FaviconUpdater() {
  const { settings } = useSiteSettings();

  useEffect(() => {
    if (!settings?.logo_url) return;

    const link = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
    const shortcut = document.querySelector<HTMLLinkElement>('link[rel="shortcut icon"]');
    const apple = document.querySelector<HTMLLinkElement>('link[rel="apple-touch-icon"]');

    if (link) link.href = settings.logo_url;
    if (shortcut) shortcut.href = settings.logo_url;
    if (apple) apple.href = settings.logo_url;

    // Also update document title
    if (settings.site_name) {
      document.title = `${settings.site_name} - Votre Beauté, Notre Passion`;
    }
  }, [settings?.logo_url, settings?.site_name]);

  return null;
}
