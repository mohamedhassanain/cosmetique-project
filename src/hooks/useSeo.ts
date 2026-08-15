import { useEffect } from 'react';
import {
  absoluteUrl,
  DEFAULT_SITE_NAME,
  getDefaultOgImage,
  removeJsonLd,
  setCanonical,
  setMeta,
  setRobots,
  upsertJsonLd,
} from '@/lib/seo';

interface SeoOptions {
  title?: string;
  description?: string;
  image?: string | null;
  /** Chemin canonique de la page (ex: /produit/mon-produit). Absolu pris tel quel. */
  path?: string;
  /** URL absolue de la page vue (og:url). Par défaut : absoluteUrl(path). */
  url?: string;
  /** Bloc JSON-LD à injecter (ex: Product, BreadcrumbList, WebSite). */
  jsonLd?: { id: string; data: unknown } | { id: string; data: unknown }[];
  /** false → noindex, nofollow (404, pages non publiques). Défaut : true. */
  index?: boolean;
  /** Type Open Graph (product, website, …). Défaut : website. */
  ogType?: 'website' | 'product';
}

/**
 * Met à jour le SEO de la page (title, description, canonical, OG/Twitter,
 * robots + JSON-LD optionnels) sans lib externe. Les balises créées sont
 * nettoyées à la navigation quand les options ne les concernent plus.
 */
export function useSeo({ title, description, image, path, url, jsonLd, index = true, ogType = 'website' }: SeoOptions) {
  // Stable identity pour l'effet : les littéraux objets créés à chaque render
  // ne doivent pas re-déclencher l'effet. La sérialisation JSON est stable si
  // les données ne changent pas (les données JSON-LD sont toujours sérialisables).
  const jsonLdKey = JSON.stringify(jsonLd ?? null);

  // Bloc eslint : `jsonLdKey` (sérialisation stable) remplace volontairement
  // la référence objet `jsonLd` dans les dépendances — les littéraux recréés
  // à chaque render ne doivent pas re-déclencher l'effet. La sérialisation
  // JSON est stable tant que les données ne changent pas.
  /* eslint-disable react-hooks/exhaustive-deps */
  useEffect(() => {
    const siteName = DEFAULT_SITE_NAME;
    const finalTitle = title ? `${title} | ${siteName}` : siteName;
    const finalDescription = description ?? '';
    const canonicalPath = path ?? '/';
    const canonicalUrl = url ?? absoluteUrl(canonicalPath);
    const ogImage = image ? absoluteUrl(image) : getDefaultOgImage();

    document.title = finalTitle;
    setMeta('name', 'description', finalDescription);
    setCanonical(canonicalUrl);

    if (title) {
      setMeta('property', 'og:title', finalTitle);
      setMeta('name', 'twitter:title', finalTitle);
    }
    if (description) {
      setMeta('property', 'og:description', description);
      setMeta('name', 'twitter:description', description);
    }
    setMeta('property', 'og:type', ogType);
    setMeta('property', 'og:url', canonicalUrl);
    setMeta('property', 'og:site_name', siteName);
    setMeta('property', 'og:image', ogImage);
    setMeta('name', 'twitter:card', 'summary_large_image');
    setMeta('name', 'twitter:image', ogImage);
    setRobots(index);

    // JSON-LD : injecte ou retire les blocs selon les options courantes.
    const blocks = jsonLd ? (Array.isArray(jsonLd) ? jsonLd : [jsonLd]) : [];
    const wantedIds = new Set(blocks.map((b) => b.id));
    // Retire les blocs précédemment injectés qui ne sont plus demandés.
    document.head
      .querySelectorAll<HTMLScriptElement>('script[data-seo-id^="jsonld-"]')
      .forEach((scriptEl) => {
        const id = scriptEl.dataset.seoId ?? '';
        const blockId = id.replace(/^jsonld-/, '');
        if (!wantedIds.has(blockId)) {
          removeJsonLd(blockId);
        }
      });
    blocks.forEach((block) => upsertJsonLd(block.id, block.data));
  }, [title, description, image, path, url, jsonLdKey, index, ogType]);
}
