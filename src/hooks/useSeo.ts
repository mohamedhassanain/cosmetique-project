import { useEffect } from 'react';

interface SeoOptions {
  title?: string;
  description?: string;
  image?: string | null;
}

function setMeta(attr: 'name' | 'property', key: string, content: string) {
  let el = document.head.querySelector<HTMLMetaElement>(`meta[${attr}="${key}"]`);
  if (!el) {
    el = document.createElement('meta');
    el.setAttribute(attr, key);
    document.head.appendChild(el);
  }
  el.setAttribute('content', content);
}

/**
 * Met à jour les meta tags SEO (title, description, og:*) sans lib externe.
 * Les balises sont supprimées du DOM si empty string est fourni au cleanup.
 */
export function useSeo({ title, description, image }: SeoOptions) {
  useEffect(() => {
    document.title = title || 'Kissariya Cosmétiques';
    if (description) setMeta('name', 'description', description);
    if (image) {
      setMeta('property', 'og:image', image);
      setMeta('name', 'twitter:image', image);
    }
    if (title) {
      setMeta('property', 'og:title', title);
      setMeta('name', 'twitter:title', title);
    }
    if (description) {
      setMeta('property', 'og:description', description);
      setMeta('name', 'twitter:description', description);
    }
    setMeta('property', 'og:type', 'website');
  }, [title, description, image]);
}
