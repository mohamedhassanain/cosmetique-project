import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReactNode } from 'react';

/** Durées de cache React Query centralisées (ms). */
export const QUERY_STALE_TIMES = {
  products: 1000 * 60 * 2,
  publicProducts: 1000 * 60 * 5,
  activeProducts: 1000 * 60 * 10,
  categories: 1000 * 60 * 10,
} as const;

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5,
      gcTime: 1000 * 60 * 10,
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

export function QueryProvider({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <QueryClientProvider client={queryClient}>
      {children}
    </QueryClientProvider>
  );
}
