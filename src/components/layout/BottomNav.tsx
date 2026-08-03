import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Home, ShoppingBag, Bug } from 'lucide-react';
import { cn } from '@/lib/utils';
import { SentryFeedbackDialog } from '@/components/shared/SentryFeedbackDialog';

export function BottomNav() {
  const location = useLocation();
  const [feedbackOpen, setFeedbackOpen] = useState(false);

  const navItems = [
    { id: 'home', icon: Home, label: 'Accueil', path: '/' },
    { id: 'products', icon: ShoppingBag, label: 'Produits', path: '/produits' },
  ];

  // Sans DSN Sentry, le signalement n'est pas disponible : on n'affiche pas l'item.
  const hasFeedback = Boolean(import.meta.env.VITE_SENTRY_DSN);

  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-pink-100 px-4 py-2 z-50 pb-safe">
      <div className="flex justify-around items-center max-w-md mx-auto">
        {navItems.map((item) => {
          const isActive = location.pathname === item.path;
          const Icon = item.icon;

          return (
            <Link
              key={item.id}
              to={item.path}
              className={cn(
                "flex flex-col items-center gap-1 px-3 py-1 rounded-lg transition-colors",
                isActive ? "text-pink-500" : "text-pink-300"
              )}
            >
              <Icon className="h-6 w-6" />
              <span className="text-[10px] font-medium">{item.label}</span>
            </Link>
          );
        })}

        {/* Signalement utilisateur — à droite de la nav mobile, à côté de Accueil/Produits. */}
        {hasFeedback && (
          <button
            type="button"
            onClick={() => setFeedbackOpen(true)}
            aria-label="Signaler un problème"
            className="flex flex-col items-center gap-1 px-3 py-1 rounded-lg transition-colors text-pink-300 hover:text-pink-500 cursor-pointer"
          >
            <Bug className="h-6 w-6" />
            <span className="text-[10px] font-medium">Signaler</span>
          </button>
        )}
      </div>

      <SentryFeedbackDialog open={feedbackOpen} onOpenChange={setFeedbackOpen} />
    </nav>
  );
}
