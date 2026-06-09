/**
 * pages/RegisterPage.jsx — New user registration
 */

import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Eye, EyeOff, HeartPulse, Loader2, CheckCircle2, XCircle } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { cn } from '../utils/cn';

function PasswordRule({ met, text }) {
  return (
    <li className={cn('flex items-center gap-1.5 text-xs', met ? 'text-green-600' : 'text-muted-foreground')}>
      {met ? <CheckCircle2 className="h-3 w-3" /> : <XCircle className="h-3 w-3" />}
      {text}
    </li>
  );
}

export default function RegisterPage() {
  const { register } = useAuth();
  const navigate = useNavigate();

  const [form, setForm] = useState({ name: '', email: '', password: '', confirm: '' });
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const pwRules = {
    length: form.password.length >= 8,
    upper: /[A-Z]/.test(form.password),
    number: /\d/.test(form.password),
    match: form.password === form.confirm && form.confirm.length > 0,
  };

  const handleChange = (e) => {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
    setError('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!pwRules.length || !pwRules.match) {
      setError('Please meet all password requirements.');
      return;
    }

    setLoading(true);
    setError('');

    try {
      await register(form.name, form.email, form.password);
      navigate('/dashboard', { replace: true });
    } catch (err) {
      setError(err.response?.data?.message || 'Registration failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex">
      {/* Left panel */}
      <div className="hidden lg:flex w-1/2 gradient-hero flex-col items-center justify-center text-white p-12">
        <div className="max-w-md text-center">
          <div className="flex items-center justify-center gap-3 mb-8">
            <div className="h-12 w-12 rounded-xl bg-white/20 flex items-center justify-center">
              <HeartPulse className="h-7 w-7" />
            </div>
            <span className="text-3xl font-bold">MediQ</span>
          </div>
          <h2 className="text-3xl font-bold mb-4">Start Your Health Journey</h2>
          <p className="text-white/80 leading-relaxed">
            Create a free account and get access to AI-powered triage, session history,
            and detailed health reports.
          </p>
        </div>
      </div>

      {/* Right panel */}
      <div className="flex-1 flex items-center justify-center bg-white p-6 overflow-y-auto">
        <div className="w-full max-w-md py-8">
          {/* Mobile logo */}
          <div className="flex items-center gap-2 mb-8 lg:hidden">
            <span className="h-8 w-8 rounded-lg gradient-hero flex items-center justify-center text-white font-bold text-sm">M</span>
            <span className="font-bold text-xl text-primary">MediQ</span>
          </div>

          <h1 className="text-2xl font-bold text-foreground mb-2">Create your account</h1>
          <p className="text-muted-foreground mb-8">
            Already have an account?{' '}
            <Link to="/login" className="text-primary font-medium hover:underline">
              Sign in
            </Link>
          </p>

          {error && (
            <div role="alert" className="mb-4 px-4 py-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5" noValidate>
            {/* Full name */}
            <div>
              <label htmlFor="name" className="block text-sm font-medium text-foreground mb-1.5">
                Full name
              </label>
              <input
                id="name"
                name="name"
                type="text"
                autoComplete="name"
                required
                value={form.name}
                onChange={handleChange}
                placeholder="Jane Smith"
                className="w-full px-4 py-3 rounded-xl border border-input bg-background text-foreground text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>

            {/* Email */}
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-foreground mb-1.5">
                Email address
              </label>
              <input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                required
                value={form.email}
                onChange={handleChange}
                placeholder="you@example.com"
                className="w-full px-4 py-3 rounded-xl border border-input bg-background text-foreground text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>

            {/* Password */}
            <div>
              <label htmlFor="password" className="block text-sm font-medium text-foreground mb-1.5">
                Password
              </label>
              <div className="relative">
                <input
                  id="password"
                  name="password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="new-password"
                  required
                  value={form.password}
                  onChange={handleChange}
                  placeholder="Create a strong password"
                  className="w-full px-4 py-3 pr-11 rounded-xl border border-input bg-background text-foreground text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((s) => !s)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>

              {/* Password strength rules */}
              {form.password && (
                <ul className="mt-2 space-y-1 pl-1">
                  <PasswordRule met={pwRules.length} text="At least 8 characters" />
                  <PasswordRule met={pwRules.upper} text="One uppercase letter" />
                  <PasswordRule met={pwRules.number} text="One number" />
                </ul>
              )}
            </div>

            {/* Confirm password */}
            <div>
              <label htmlFor="confirm" className="block text-sm font-medium text-foreground mb-1.5">
                Confirm password
              </label>
              <input
                id="confirm"
                name="confirm"
                type={showPassword ? 'text' : 'password'}
                autoComplete="new-password"
                required
                value={form.confirm}
                onChange={handleChange}
                placeholder="Repeat your password"
                className={cn(
                  'w-full px-4 py-3 rounded-xl border bg-background text-foreground text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring',
                  form.confirm && !pwRules.match ? 'border-red-400' : 'border-input'
                )}
              />
              {form.confirm && !pwRules.match && (
                <p className="text-xs text-red-500 mt-1">Passwords do not match.</p>
              )}
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 rounded-xl gradient-hero text-white font-semibold text-sm hover:opacity-90 transition-opacity disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2 shadow-lg shadow-primary/20"
            >
              {loading && <Loader2 className="h-4 w-4 animate-spin" />}
              {loading ? 'Creating account...' : 'Create Account'}
            </button>
          </form>

          <p className="mt-6 text-center text-xs text-muted-foreground">
            By registering, you agree to our{' '}
            <a href="#" className="underline hover:text-foreground">Terms</a> and{' '}
            <a href="#" className="underline hover:text-foreground">Privacy Policy</a>.
          </p>
        </div>
      </div>
    </div>
  );
}
