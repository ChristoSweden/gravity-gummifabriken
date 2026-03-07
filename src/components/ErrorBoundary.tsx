import React, { Component, ErrorInfo, ReactNode } from 'react';

interface Props {
    children: ReactNode;
    fallback?: ReactNode;
}

interface State {
    hasError: boolean;
}

class ErrorBoundary extends Component<Props, State> {
    declare props: Props;
    state: State = { hasError: false };

    public static getDerivedStateFromError(_: Error): State {
        return { hasError: true };
    }

    public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
        console.error('Uncaught error:', error, errorInfo);
    }

    public render() {
        if (this.state.hasError) {
            return this.props.fallback || (
                <div className="min-h-screen flex items-center justify-center p-4 bg-[var(--color-bg-warm)]">
                    <div className="bg-[var(--color-bg-card)] p-8 rounded-2xl shadow-sm border border-[var(--color-mist)] text-center max-w-md">
                        <h2 className="text-2xl font-brand font-bold text-[var(--color-primary)] mb-4 uppercase">Something went wrong</h2>
                        <p className="text-[var(--color-steel)] mb-6">The page couldn't load correctly.</p>
                        <button
                            className="bg-[var(--color-primary)] text-white px-8 py-3 rounded-full font-bold uppercase tracking-widest hover:opacity-90 transition-all"
                            onClick={() => window.location.reload()}
                        >
                            Reload Page
                        </button>
                    </div>
                </div>
            );
        }

        return this.props.children;
    }
}

export default ErrorBoundary;
