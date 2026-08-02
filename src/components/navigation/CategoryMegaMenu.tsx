import { useState, useRef, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useCategories, useSubcategories } from '@/hooks/useCategories';
import { Flower2, ArrowRight, X, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

function useIsNarrow() {
  const [isNarrow, setIsNarrow] = useState(() => globalThis.matchMedia?.('(max-width: 767px)').matches ?? false);

  useEffect(() => {
    const mql = globalThis.matchMedia('(max-width: 767px)');
    const onChange = (e: MediaQueryListEvent) => setIsNarrow(e.matches);
    mql.addEventListener('change', onChange);
    setIsNarrow(mql.matches);
    return () => mql.removeEventListener('change', onChange);
  }, []);

  return isNarrow;
}

export function CategoryMegaMenu() {
  const { categories } = useCategories();
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerCategory, setDrawerCategory] = useState<string | null>(null);
  const { subcategories } = useSubcategories(drawerCategory || activeCategory || undefined);
  const timeoutRef = useRef<ReturnType<typeof setTimeout>>();
  const isNarrow = useIsNarrow();

  const show = useCallback((categoryId: string) => {
    if (isNarrow) {
      setDrawerCategory(categoryId);
      setDrawerOpen(true);
      return;
    }
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    setActiveCategory(categoryId);
  }, [isNarrow]);

  const hide = useCallback(() => {
    if (isNarrow) return;
    timeoutRef.current = setTimeout(() => {
      setActiveCategory(null);
    }, 300);
  }, [isNarrow]);

  const closeDrawer = () => {
    setDrawerOpen(false);
    setTimeout(() => setDrawerCategory(null), 300);
  };

  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  const activeCat = categories.find((c) => c.id === (drawerCategory || activeCategory));
  const midpoint = Math.ceil(subcategories.length / 2);
  const leftSubs = subcategories.slice(0, midpoint);
  const rightSubs = subcategories.slice(midpoint);

  if (categories.length === 0) return null;

  return (
    <>
      <nav
        className="border-b border-gray-200 bg-white sticky top-16 z-40 shadow-sm"
        onMouseLeave={hide}
      >
        <div className="max-w-7xl mx-auto px-4">
          <ul className="flex items-center gap-0 overflow-x-auto scrollbar-hide">
            {categories.map((cat) => (
              <li
                key={cat.id}
                className="shrink-0"
                onMouseEnter={() => !isNarrow && show(cat.id)}
              >
                <button
                  onClick={() => isNarrow && show(cat.id)}
                  className={cn(
                    "flex items-center gap-1.5 px-4 py-3 text-sm font-medium whitespace-nowrap border-b-2 transition-all cursor-pointer",
                    (activeCategory === cat.id || drawerCategory === cat.id)
                      ? "text-pink-700 border-pink-400"
                      : "text-gray-600 border-transparent hover:text-gray-900 hover:border-gray-300"
                  )}
                >
                  <Flower2 className="h-4 w-4 shrink-0" />
                  {cat.name}
                </button>
              </li>
            ))}
          </ul>
        </div>

        {/* Desktop dropdown */}
        {!isNarrow && activeCategory && activeCat && (
          <div
            className="absolute left-0 right-0 bg-white border-b border-gray-200 shadow-lg z-50"
            onMouseEnter={() => {
              if (timeoutRef.current) clearTimeout(timeoutRef.current);
            }}
            onMouseLeave={hide}
          >
            <div className="max-w-7xl mx-auto">
              <CategoryPanelContent category={activeCat} subcategories={subcategories} leftSubs={leftSubs} rightSubs={rightSubs} />
            </div>
          </div>
        )}
      </nav>

      {/* Mobile drawer overlay */}
      {isNarrow && drawerOpen && drawerCategory && activeCat && (
        <MobileDrawer
          category={activeCat}
          leftSubs={leftSubs}
          rightSubs={rightSubs}
          onClose={closeDrawer}
          onNavigate={closeDrawer}
        />
      )}
    </>
  );
}

function CategoryPanelContent({
  category,
  subcategories,
  leftSubs,
  rightSubs,
}: {
  category: { id: string; name: string; slug: string };
  subcategories: { id: string; name: string; slug: string | null }[];
  leftSubs: { id: string; name: string; slug: string | null }[];
  rightSubs: { id: string; name: string; slug: string | null }[];
}) {
  return (
    <div className="flex min-h-[280px]">
      <div className="w-64 bg-gray-50 p-6 border-r border-gray-200 shrink-0">
        <h2 className="font-bold text-lg text-gray-900 mb-4">{category.name}</h2>
        <div className="space-y-3">
          <Link
            to={`/produits?categorie=${category.slug}`}
            className="flex items-center justify-between px-4 py-3 bg-white rounded-lg border border-gray-200 text-sm font-medium text-gray-700 hover:border-pink-300 hover:text-pink-600 transition-all shadow-sm"
          >
            <span className="flex items-center gap-2">
              <Flower2 className="h-4 w-4 text-pink-400" />
              Voir tous les produits
            </span>
            <ArrowRight className="h-4 w-4 text-gray-400" />
          </Link>
          <Link
            to="/produits?promotions=true"
            className="flex items-center justify-between px-4 py-3 bg-white rounded-lg border border-gray-200 text-sm font-medium text-gray-700 hover:border-pink-300 hover:text-pink-600 transition-all shadow-sm"
          >
            <span>🔥 Promotions</span>
            <ArrowRight className="h-4 w-4 text-gray-400" />
          </Link>
          <Link
            to="/produits?featured=true"
            className="flex items-center justify-between px-4 py-3 bg-white rounded-lg border border-green-200 text-sm font-medium text-green-600 hover:border-green-300 hover:text-green-700 transition-all shadow-sm"
          >
            <span>🌟 Coup de cœur</span>
            <ArrowRight className="h-4 w-4 text-green-400" />
          </Link>
        </div>
      </div>

      <div className="flex-1 p-6">
        <div className="grid grid-cols-3 gap-8">
          <div>
            <h3 className="font-bold text-gray-900 mb-3 text-sm uppercase tracking-wider">
              Tout {category.name}
            </h3>
            <ul className="space-y-1">
              <li>
                <Link
                  to={`/produits?categorie=${category.slug}`}
                  className="text-gray-600 hover:text-pink-600 text-sm py-1.5 block"
                >
                  Tous les produits
                </Link>
              </li>
            </ul>
          </div>

          {leftSubs.length > 0 && (
            <div>
              <h3 className="font-bold text-gray-900 mb-3 text-sm uppercase tracking-wider">{category.name}</h3>
              <ul className="space-y-1">
                {leftSubs.map((sub) => (
                  <li key={sub.id}>
                    <Link
                      to={`/produits?categorie=${category.slug}&sous-categorie=${sub.slug ?? sub.name.toLowerCase()}`}
                      className="text-gray-600 hover:text-pink-600 text-sm py-1.5 block"
                    >
                      {sub.name}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {rightSubs.length > 0 && (
            <div>
              <h3 className="font-bold text-gray-900 mb-3 text-sm uppercase tracking-wider">{category.name}</h3>
              <ul className="space-y-1">
                {rightSubs.map((sub) => (
                  <li key={sub.id}>
                    <Link
                      to={`/produits?categorie=${category.slug}&sous-categorie=${sub.slug ?? sub.name.toLowerCase()}`}
                      className="text-gray-600 hover:text-pink-600 text-sm py-1.5 block"
                    >
                      {sub.name}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {subcategories.length === 0 && (
            <div>
              <h3 className="font-bold text-gray-900 mb-3 text-sm uppercase tracking-wider">À la une</h3>
              <Link
                to="/produits?promotions=true"
                className="text-red-500 hover:text-red-700 text-sm py-1.5 block font-medium"
              >
                🔥 Promotions
              </Link>
              <Link
                to="/produits?featured=true"
                className="text-green-500 hover:text-green-700 text-sm py-1.5 block font-medium"
              >
                🌟 Coup de cœur
              </Link>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function MobileDrawer({
  category,
  leftSubs,
  rightSubs,
  onClose,
  onNavigate,
}: {
  category: { id: string; name: string; slug: string };
  leftSubs: { id: string; name: string; slug: string | null }[];
  rightSubs: { id: string; name: string; slug: string | null }[];
  onClose: () => void;
  onNavigate: () => void;
}) {
  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = '';
    };
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Drawer */}
      <div className="relative w-[55%] max-w-xs bg-white h-full overflow-y-auto shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3.5 border-b border-gray-100">
          <h2 className="text-base font-bold text-gray-900">{category.name}</h2>
          <button onClick={onClose} className="h-7 w-7 flex items-center justify-center">
            <X className="h-4 w-4 text-gray-400" />
          </button>
        </div>
        <div className="h-[3px] bg-orange-400" />

        {/* Tout [category] */}
        <div className="px-4 py-3 border-b border-gray-100">
          <Link
            to={`/produits?categorie=${category.slug}`}
            onClick={onNavigate}
            className="flex items-center justify-between py-1.5 text-sm text-gray-800 hover:text-orange-500 font-medium"
          >
            <span>Tout {category.name}</span>
            <ChevronRight className="h-4 w-4 text-gray-400" />
          </Link>
        </div>

        {/* Subcategories list grouped */}
        <div className="divide-y divide-gray-100">
          {leftSubs.length > 0 && (
            <div className="px-4 py-3">
              <h3 className="font-bold text-sm text-gray-900 mb-1.5">{category.name}</h3>
              <ul>
                {leftSubs.map((sub) => (
                  <li key={sub.id}>
                    <Link
                      to={`/produits?categorie=${category.slug}&sous-categorie=${sub.slug ?? sub.name.toLowerCase()}`}
                      onClick={onNavigate}
                      className="flex items-center justify-between py-2 text-sm text-gray-600 hover:text-orange-500"
                    >
                      <span>{sub.name}</span>
                      <svg className="h-3 w-3 text-gray-300" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5">
                        <path d="M9 6.5v3a.5.5 0 0 1-.5.5h-6a.5.5 0 0 1-.5-.5v-6a.5.5 0 0 1 .5-.5h3"/>
                        <path d="M6 3l3-3m0 0l-3-3m3 3h-3"/>
                      </svg>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {rightSubs.length > 0 && (
            <div className="px-4 py-3">
              <h3 className="font-bold text-sm text-gray-900 mb-1.5">{category.name}</h3>
              <ul>
                {rightSubs.map((sub) => (
                  <li key={sub.id}>
                    <Link
                      to={`/produits?categorie=${category.slug}&sous-categorie=${sub.slug ?? sub.name.toLowerCase()}`}
                      onClick={onNavigate}
                      className="flex items-center justify-between py-2 text-sm text-gray-600 hover:text-orange-500"
                    >
                      <span>{sub.name}</span>
                      <svg className="h-3 w-3 text-gray-300" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5">
                        <path d="M9 6.5v3a.5.5 0 0 1-.5.5h-6a.5.5 0 0 1-.5-.5v-6a.5.5 0 0 1 .5-.5h3"/>
                        <path d="M6 3l3-3m0 0l-3-3m3 3h-3"/>
                      </svg>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        {/* Action cards */}
        <div className="px-4 py-4 space-y-2.5 border-t border-gray-100 mt-2">
          <Link
            to={`/produits?categorie=${category.slug}`}
            onClick={onNavigate}
            className="flex items-center justify-between px-3.5 py-3 bg-gray-50 rounded-lg text-sm text-gray-700 hover:bg-gray-100"
          >
            <span className="flex items-center gap-2.5">
              <Flower2 className="h-4 w-4 text-pink-400" />
              Voir tous les produits
            </span>
            <ArrowRight className="h-4 w-4 text-gray-400" />
          </Link>
          <Link
            to="/produits?promotions=true"
            onClick={onNavigate}
            className="flex items-center justify-between px-3.5 py-3 bg-gray-50 rounded-lg text-sm text-gray-700 hover:bg-gray-100"
          >
            <span className="flex items-center gap-2.5">🔥 Promotions</span>
            <ArrowRight className="h-4 w-4 text-gray-400" />
          </Link>
          <Link
            to="/produits?featured=true"
            onClick={onNavigate}
            className="flex items-center justify-between px-3.5 py-3 bg-green-50 rounded-lg text-sm text-green-600 hover:bg-green-100"
          >
            <span className="flex items-center gap-2.5">🌟 Coup de cœur</span>
            <ArrowRight className="h-4 w-4 text-green-400" />
          </Link>
        </div>
      </div>
    </div>
  );
}
