import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { persistQueryCache } from '../lib/queryPersistence.js';

// 4xx responses are answers, not glitches, so only server/network errors retry.
function shouldRetry(failureCount, error) {
  const isClientError = error?.status >= 400 && error?.status < 500;
  return !isClientError && failureCount < 2;
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: shouldRetry,
      refetchOnWindowFocus: false,
      staleTime: 30 * 1000,
      // Data for screens visited earlier stays ready for a quick return.
      gcTime: 15 * 60 * 1000,
    },
    mutations: { retry: false },
  },
});

// Restores last session's data before the first render, then keeps the copy current.
persistQueryCache(queryClient);

export function AppProviders({ children }) {
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}
