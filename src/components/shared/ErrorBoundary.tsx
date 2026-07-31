import { Component, ReactNode } from 'react';

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
}

/**
 * Empêche l'application entière de blanchir en cas de crash d'un composant.
 * Affiche un écran de secours avec rechargement.
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: unknown, info: unknown) {
    console.error('ErrorBoundary caught an error:', error, info);
  }

  private handleReload = () => {
    this.setState({ hasError: false });
    globalThis.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-[#fef8fa] p-6">
          <div className="text-center max-w-md">
            <div className="text-5xl mb-4">🌸</div>
            <h1 className="text-2xl font-display font-bold text-pink-900 mb-2">
              Oups, une erreur est survenue
            </h1>
            <p className="text-pink-600 mb-6">
              Un problème inattendu a interrompu l'affichage. Rechargez la page pour continuer.
            </p>
            <button
              type="button"
              onClick={this.handleReload}
              className="bg-pink-400 hover:bg-pink-500 text-white font-bold px-6 py-3 rounded-full shadow-lg transition-colors cursor-pointer"
            >
              Recharger la page
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
