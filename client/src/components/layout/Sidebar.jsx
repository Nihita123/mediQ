/**
 * components/layout/Sidebar.jsx
 *
 * Left navigation sidebar. Collapsible on mobile via overlay.
 */

import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard,
  MessageSquarePlus,
  ClipboardList,
  FileText,
  User,
  X,
  HeartPulse,
} from 'lucide-react';
import { cn } from '../../utils/cn';
import { useAuth } from '../../context/AuthContext';

const NAV_ITEMS = [
  { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/triage/new', label: 'New Triage', icon: MessageSquarePlus },
  { to: '/sessions', label: 'Session History', icon: ClipboardList },
  { to: '/profile', label: 'Profile', icon: User },
];

const DOCTOR_ITEMS = [
  { to: '/reports', label: 'Patient Reports', icon: FileText },
];

export default function Sidebar({ open, onClose }) {
  const { user } = useAuth();

  const linkClass = ({ isActive }) =>
    cn(
      'flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm font-medium transition-colors',
      isActive
        ? 'bg-primary/10 text-primary'
        : 'text-muted-foreground hover:bg-accent hover:text-foreground'
    );

  return (
    <>
      {/* Mobile overlay backdrop */}
      {open && (
        <div
          className="fixed inset-0 z-20 bg-black/40 md:hidden"
          onClick={onClose}
          aria-hidden="true"
        />
      )}

      {/* Sidebar panel */}
      <aside
        className={cn(
          'fixed top-0 left-0 z-30 h-full w-64 bg-white border-r border-border flex flex-col transition-transform duration-300 md:relative md:translate-x-0 md:flex md:h-auto',
          open ? 'translate-x-0' : '-translate-x-full'
        )}
      >
        {/* Mobile header */}
        <div className="flex items-center justify-between p-4 border-b border-border md:hidden">
          <span className="font-bold text-lg text-primary">MediQ</span>
          <button
            className="p-1.5 rounded-md hover:bg-accent"
            onClick={onClose}
            aria-label="Close sidebar"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground px-4 mb-2">
            Menu
          </p>

          {NAV_ITEMS.map(({ to, label, icon: Icon }) => (
            <NavLink key={to} to={to} className={linkClass} onClick={onClose}>
              <Icon className="h-4 w-4 shrink-0" />
              {label}
            </NavLink>
          ))}

          {/* Doctor-only section */}
          {(user?.role === 'doctor' || user?.role === 'admin') && (
            <>
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground px-4 mt-4 mb-2">
                Clinical
              </p>
              {DOCTOR_ITEMS.map(({ to, label, icon: Icon }) => (
                <NavLink key={to} to={to} className={linkClass} onClick={onClose}>
                  <Icon className="h-4 w-4 shrink-0" />
                  {label}
                </NavLink>
              ))}
            </>
          )}
        </nav>

        {/* Footer */}
        <div className="p-4 border-t border-border">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <HeartPulse className="h-4 w-4 text-primary" />
            <span>MediQ v1.0.0</span>
          </div>
        </div>
      </aside>
    </>
  );
}
