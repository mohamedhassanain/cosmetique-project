import { Link, useLocation } from 'react-router-dom';
import { Home, ShoppingBag } from 'lucide-react';
import { cn } from '@/lib/utils';

export function BottomNav() {
  const location = useLocation();

  const navItems = [
    { id: 'home', icon: Home, label: 'Accueil', path: '/' },
    { id: 'products', icon: ShoppingBag, label: 'Produits', path: '/produits' },
  ];

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
              <Icon className={cn("h-6 w-6")} />
              <span className="text-[10px] font-medium">{item.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
