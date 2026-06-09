/**
 * pages/NotFoundPage.jsx — 404 catch-all page
 */

import { Link } from 'react-router-dom';
import { Home, ArrowLeft } from 'lucide-react';

export default function NotFoundPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-sky-50 to-white p-6">
      <div className="text-center max-w-md">
        {/* Illustration */}
        <div className="h-24 w-24 rounded-full gradient-hero flex items-center justify-center text-white text-4xl mx-auto mb-6 shadow-lg shadow-primary/20">
          🏥
        </div>

        <h1 className="text-7xl font-extrabold text-primary mb-2">404</h1>
        <h2 className="text-2xl font-bold text-foreground mb-3">Page not found</h2>
        <p className="text-muted-foreground mb-8 leading-relaxed">
          The page you're looking for doesn't exist or has been moved.
          Let's get you back on track.
        </p>

        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Link
            to="/"
            className="inline-flex items-center gap-2 px-6 py-3 rounded-xl gradient-hero text-white font-semibold hover:opacity-90 transition-opacity shadow-lg shadow-primary/20"
          >
            <Home className="h-4 w-4" />
            Go Home
          </Link>
          <button
            onClick={() => window.history.back()}
            className="inline-flex items-center gap-2 px-6 py-3 rounded-xl border-2 border-border text-foreground font-semibold hover:bg-accent transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            Go Back
          </button>
        </div>
      </div>
    </div>
  );
}
