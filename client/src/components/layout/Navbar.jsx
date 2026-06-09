/**
 * components/layout/Navbar.jsx
 *
 * Top navigation bar with logo, user menu, and mobile sidebar toggle.
 */

import { Link, useNavigate } from 'react-router-dom';
import { Menu, Bell, ChevronDown, User, LogOut, Settings } from 'lucide-react';
import { useState } from 'react';
import { useAuth } from '../../context/AuthContext';

export default function Navbar({ onMenuToggle }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [dropdownOpen, setDropdownOpen] = useState(false);

  const handleLogout = () => {
    logout();
    navigate('/');
  };

  return (
    <header className="sticky top-0 z-40 h-16 bg-white border-b border-border shadow-sm flex items-center px-4 md:px-6 gap-4">
      {/* Mobile menu toggle */}
      <button
        className="md:hidden p-2 rounded-md text-muted-foreground hover:bg-accent"
        onClick={onMenuToggle}
        aria-label="Toggle sidebar"
      >
        <Menu className="h-5 w-5" />
      </button>

      {/* Logo */}
      <Link to="/dashboard" className="flex items-center gap-2 font-bold text-xl text-primary">
        <span className="h-7 w-7 rounded-lg gradient-hero flex items-center justify-center text-white text-sm font-bold">
          M
        </span>
        MediQ
      </Link>

      <div className="flex-1" />

      {/* Notifications — placeholder */}
      <button
        className="relative p-2 rounded-full text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
        aria-label="Notifications"
      >
        <Bell className="h-5 w-5" />
        <span className="absolute top-1.5 right-1.5 h-2 w-2 rounded-full bg-primary" />
      </button>

      {/* User dropdown */}
      <div className="relative">
        <button
          className="flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-accent transition-colors"
          onClick={() => setDropdownOpen((prev) => !prev)}
          aria-expanded={dropdownOpen}
          aria-haspopup="true"
        >
          {/* Avatar */}
          <div className="h-8 w-8 rounded-full gradient-hero flex items-center justify-center text-white text-sm font-semibold">
            {user?.name?.charAt(0).toUpperCase()}
          </div>
          <span className="hidden sm:block text-sm font-medium text-foreground">
            {user?.name}
          </span>
          <ChevronDown className="h-4 w-4 text-muted-foreground" />
        </button>

        {dropdownOpen && (
          <>
            {/* Backdrop */}
            <div
              className="fixed inset-0 z-10"
              onClick={() => setDropdownOpen(false)}
            />
            {/* Dropdown panel */}
            <div className="absolute right-0 mt-2 w-52 bg-white rounded-xl border border-border shadow-lg z-20 py-1 overflow-hidden">
              <div className="px-4 py-3 border-b border-border">
                <p className="text-sm font-semibold text-foreground truncate">{user?.name}</p>
                <p className="text-xs text-muted-foreground truncate">{user?.email}</p>
              </div>

              <Link
                to="/profile"
                className="flex items-center gap-2 px-4 py-2.5 text-sm text-foreground hover:bg-accent transition-colors"
                onClick={() => setDropdownOpen(false)}
              >
                <User className="h-4 w-4" />
                My Profile
              </Link>
              <Link
                to="/profile"
                className="flex items-center gap-2 px-4 py-2.5 text-sm text-foreground hover:bg-accent transition-colors"
                onClick={() => setDropdownOpen(false)}
              >
                <Settings className="h-4 w-4" />
                Settings
              </Link>

              <div className="border-t border-border mt-1" />
              <button
                onClick={handleLogout}
                className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-destructive hover:bg-red-50 transition-colors"
              >
                <LogOut className="h-4 w-4" />
                Sign Out
              </button>
            </div>
          </>
        )}
      </div>
    </header>
  );
}
