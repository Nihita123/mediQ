/**
 * pages/LandingPage.jsx — Public marketing / hero page
 */

import { Link } from 'react-router-dom';
import { HeartPulse, Shield, Brain, Clock, ArrowRight, CheckCircle } from 'lucide-react';

const FEATURES = [
  {
    icon: Brain,
    title: 'AI-Powered Triage',
    description: 'Intelligent symptom analysis that helps prioritize care based on severity.',
  },
  {
    icon: Shield,
    title: 'Secure & Private',
    description: 'Your health data is encrypted and protected with industry-standard security.',
  },
  {
    icon: Clock,
    title: 'Faster Intake',
    description: 'Reduce wait times by completing intake before you arrive at the clinic.',
  },
];

const BENEFITS = [
  'Available 24/7 — any device, any location',
  'Detailed symptom reports for your doctor',
  'Risk assessment in minutes',
  'Seamless clinic integration',
];

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-white flex flex-col">
      {/* ─── Navbar ─────────────────────────────────────────────────────────── */}
      <header className="sticky top-0 z-40 border-b border-border bg-white/80 backdrop-blur-sm">
        <div className="max-w-6xl mx-auto px-4 md:px-6 h-16 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2 font-bold text-xl text-primary">
            <span className="h-7 w-7 rounded-lg gradient-hero flex items-center justify-center text-white text-sm">
              M
            </span>
            MediQ
          </Link>

          <nav className="hidden md:flex items-center gap-6 text-sm text-muted-foreground">
            <a href="#features" className="hover:text-foreground transition-colors">Features</a>
            <a href="#how-it-works" className="hover:text-foreground transition-colors">How It Works</a>
          </nav>

          <div className="flex items-center gap-3">
            <Link
              to="/login"
              className="px-4 py-2 text-sm font-medium text-foreground hover:text-primary transition-colors"
            >
              Sign In
            </Link>
            <Link
              to="/register"
              className="px-4 py-2 rounded-lg gradient-hero text-white text-sm font-medium hover:opacity-90 transition-opacity"
            >
              Get Started
            </Link>
          </div>
        </div>
      </header>

      {/* ─── Hero ────────────────────────────────────────────────────────────── */}
      <section className="flex-1 flex items-center py-20 md:py-32 bg-gradient-to-br from-sky-50 via-white to-blue-50 relative overflow-hidden">
        {/* Background decoration */}
        <div className="absolute inset-0 pointer-events-none overflow-hidden" aria-hidden="true">
          <div className="absolute -top-24 -right-24 h-96 w-96 rounded-full bg-primary/5" />
          <div className="absolute -bottom-24 -left-24 h-96 w-96 rounded-full bg-primary/5" />
        </div>

        <div className="max-w-6xl mx-auto px-4 md:px-6 text-center relative z-10">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-primary/10 text-primary text-sm font-medium mb-6">
            <HeartPulse className="h-4 w-4" />
            AI Healthcare Intake System
          </div>

          <h1 className="text-4xl md:text-6xl font-extrabold text-foreground leading-tight max-w-3xl mx-auto">
            Smart Healthcare{' '}
            <span className="text-transparent bg-clip-text gradient-hero-text">
              Intake & Triage
            </span>
          </h1>

          <p className="mt-6 text-lg md:text-xl text-muted-foreground max-w-2xl mx-auto leading-relaxed">
            MediQ uses AI to gather your symptoms, assess risk, and generate detailed
            reports — so your doctor can focus on what matters most: your care.
          </p>

          <div className="mt-10 flex flex-col sm:flex-row gap-4 justify-center">
            <Link
              to="/register"
              className="px-8 py-4 rounded-xl gradient-hero text-white font-semibold text-base hover:opacity-90 transition-opacity flex items-center gap-2 justify-center shadow-lg shadow-primary/20"
            >
              Start Free Triage
              <ArrowRight className="h-5 w-5" />
            </Link>
            <Link
              to="/login"
              className="px-8 py-4 rounded-xl border-2 border-border text-foreground font-semibold text-base hover:bg-accent transition-colors"
            >
              Sign In
            </Link>
          </div>

          {/* Trust indicators */}
          <div className="mt-12 flex flex-wrap justify-center gap-x-8 gap-y-2">
            {BENEFITS.map((b) => (
              <span key={b} className="flex items-center gap-1.5 text-sm text-muted-foreground">
                <CheckCircle className="h-4 w-4 text-green-500 shrink-0" />
                {b}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* ─── Features ────────────────────────────────────────────────────────── */}
      <section id="features" className="py-20 bg-white">
        <div className="max-w-6xl mx-auto px-4 md:px-6">
          <h2 className="text-3xl font-bold text-center text-foreground mb-3">
            Everything You Need
          </h2>
          <p className="text-center text-muted-foreground mb-12 max-w-xl mx-auto">
            A complete platform for modern healthcare intake, built for both patients and providers.
          </p>

          <div className="grid md:grid-cols-3 gap-6">
            {FEATURES.map(({ icon: Icon, title, description }) => (
              <div
                key={title}
                className="p-6 rounded-2xl border border-border bg-white hover:shadow-md transition-shadow text-center"
              >
                <div className="h-14 w-14 rounded-2xl gradient-hero flex items-center justify-center text-white mx-auto mb-4">
                  <Icon className="h-7 w-7" />
                </div>
                <h3 className="font-semibold text-foreground mb-2">{title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">{description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── How It Works ────────────────────────────────────────────────────── */}
      <section id="how-it-works" className="py-20 bg-gray-50">
        <div className="max-w-4xl mx-auto px-4 md:px-6 text-center">
          <h2 className="text-3xl font-bold text-foreground mb-3">How It Works</h2>
          <p className="text-muted-foreground mb-12 max-w-xl mx-auto">
            Get a preliminary triage assessment in under 5 minutes.
          </p>

          <div className="grid md:grid-cols-3 gap-8">
            {[
              { step: '1', title: 'Describe Symptoms', desc: 'Chat naturally with MediQ about how you\'re feeling.' },
              { step: '2', title: 'AI Analysis', desc: 'Our AI extracts key symptoms and assesses severity.' },
              { step: '3', title: 'Doctor Review', desc: 'A detailed report is generated for your physician.' },
            ].map(({ step, title, desc }) => (
              <div key={step} className="flex flex-col items-center">
                <div className="h-12 w-12 rounded-full gradient-hero text-white font-bold text-lg flex items-center justify-center mb-4 shadow-lg shadow-primary/20">
                  {step}
                </div>
                <h3 className="font-semibold text-foreground mb-2">{title}</h3>
                <p className="text-sm text-muted-foreground">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── CTA ─────────────────────────────────────────────────────────────── */}
      <section className="py-20 gradient-hero text-white">
        <div className="max-w-2xl mx-auto px-4 md:px-6 text-center">
          <h2 className="text-3xl font-bold mb-4">Ready to Get Started?</h2>
          <p className="text-white/80 mb-8">
            Join thousands of patients who use MediQ for faster, smarter healthcare intake.
          </p>
          <Link
            to="/register"
            className="px-8 py-4 rounded-xl bg-white text-primary font-semibold text-base hover:bg-gray-100 transition-colors inline-flex items-center gap-2 shadow-lg"
          >
            Create Free Account
            <ArrowRight className="h-5 w-5" />
          </Link>
        </div>
      </section>

      {/* ─── Footer ──────────────────────────────────────────────────────────── */}
      <footer className="py-6 border-t border-border bg-white">
        <div className="max-w-6xl mx-auto px-4 md:px-6 flex flex-col sm:flex-row items-center justify-between gap-3">
          <span className="font-bold text-primary">MediQ</span>
          <p className="text-xs text-muted-foreground">
            © {new Date().getFullYear()} MediQ. For informational purposes only. Not a substitute for professional medical advice.
          </p>
        </div>
      </footer>
    </div>
  );
}
