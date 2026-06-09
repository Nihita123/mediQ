/**
 * pages/ProfilePage.jsx — User profile and account settings
 */

import { useState } from 'react';
import { User, Lock, Save, Loader2, CheckCircle2 } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { authService } from '../services/api';
import { capitalise } from '../utils/formatters';
import { cn } from '../utils/cn';

function FormField({ label, id, ...props }) {
  return (
    <div>
      <label htmlFor={id} className="block text-sm font-medium text-foreground mb-1.5">
        {label}
      </label>
      <input
        id={id}
        className="w-full px-4 py-3 rounded-xl border border-input bg-background text-foreground text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
        {...props}
      />
    </div>
  );
}

export default function ProfilePage() {
  const { user, updateUser } = useAuth();

  // Profile tab state
  const [profileForm, setProfileForm] = useState({ name: user?.name || '' });
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileSuccess, setProfileSuccess] = useState(false);
  const [profileError, setProfileError] = useState('');

  // Password tab state
  const [pwForm, setPwForm] = useState({ currentPassword: '', newPassword: '', confirm: '' });
  const [pwLoading, setPwLoading] = useState(false);
  const [pwSuccess, setPwSuccess] = useState(false);
  const [pwError, setPwError] = useState('');

  const [activeTab, setActiveTab] = useState('profile');

  const handleProfileSubmit = async (e) => {
    e.preventDefault();
    setProfileLoading(true);
    setProfileError('');
    setProfileSuccess(false);

    try {
      const data = await authService.updateProfile({ name: profileForm.name });
      updateUser(data.user);
      setProfileSuccess(true);
    } catch (err) {
      setProfileError(err.response?.data?.message || 'Failed to update profile.');
    } finally {
      setProfileLoading(false);
    }
  };

  const handlePasswordSubmit = async (e) => {
    e.preventDefault();
    if (pwForm.newPassword !== pwForm.confirm) {
      setPwError('New passwords do not match.');
      return;
    }
    if (pwForm.newPassword.length < 8) {
      setPwError('New password must be at least 8 characters.');
      return;
    }

    setPwLoading(true);
    setPwError('');
    setPwSuccess(false);

    try {
      await authService.updateProfile({
        currentPassword: pwForm.currentPassword,
        newPassword: pwForm.newPassword,
      });
      setPwSuccess(true);
      setPwForm({ currentPassword: '', newPassword: '', confirm: '' });
    } catch (err) {
      setPwError(err.response?.data?.message || 'Failed to update password.');
    } finally {
      setPwLoading(false);
    }
  };

  return (
    <div className="max-w-2xl space-y-6">
      {/* Page header */}
      <div>
        <h1 className="text-2xl font-bold text-foreground">Account Settings</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Manage your personal information and security settings.
        </p>
      </div>

      {/* Profile header card */}
      <div className="bg-white rounded-2xl border border-border shadow-sm p-6 flex items-center gap-5">
        <div className="h-16 w-16 rounded-full gradient-hero flex items-center justify-center text-white text-2xl font-bold shrink-0">
          {user?.name?.charAt(0).toUpperCase()}
        </div>
        <div>
          <p className="text-xl font-bold text-foreground">{user?.name}</p>
          <p className="text-sm text-muted-foreground">{user?.email}</p>
          <span className="mt-1.5 inline-block px-2.5 py-0.5 rounded-full bg-primary/10 text-primary text-xs font-medium capitalize">
            {capitalise(user?.role)}
          </span>
        </div>
      </div>

      {/* Tabs */}
      <div className="bg-white rounded-2xl border border-border shadow-sm overflow-hidden">
        {/* Tab bar */}
        <div className="flex border-b border-border">
          <button
            onClick={() => setActiveTab('profile')}
            className={cn(
              'flex items-center gap-2 px-6 py-4 text-sm font-medium transition-colors',
              activeTab === 'profile'
                ? 'border-b-2 border-primary text-primary'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            <User className="h-4 w-4" />
            Profile
          </button>
          <button
            onClick={() => setActiveTab('security')}
            className={cn(
              'flex items-center gap-2 px-6 py-4 text-sm font-medium transition-colors',
              activeTab === 'security'
                ? 'border-b-2 border-primary text-primary'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            <Lock className="h-4 w-4" />
            Security
          </button>
        </div>

        <div className="p-6">
          {/* Profile tab */}
          {activeTab === 'profile' && (
            <form onSubmit={handleProfileSubmit} className="space-y-5">
              <FormField
                label="Full Name"
                id="name"
                type="text"
                value={profileForm.name}
                onChange={(e) => setProfileForm({ name: e.target.value })}
                required
              />
              <FormField
                label="Email address"
                id="email"
                type="email"
                value={user?.email || ''}
                disabled
                className="opacity-60 cursor-not-allowed w-full px-4 py-3 rounded-xl border border-input bg-background text-foreground text-sm"
              />

              {profileError && (
                <div role="alert" className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-4 py-3">
                  {profileError}
                </div>
              )}
              {profileSuccess && (
                <div role="status" className="text-sm text-green-700 bg-green-50 border border-green-200 rounded-lg px-4 py-3 flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4" />
                  Profile updated successfully.
                </div>
              )}

              <button
                type="submit"
                disabled={profileLoading}
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl gradient-hero text-white text-sm font-semibold hover:opacity-90 transition-opacity disabled:opacity-60"
              >
                {profileLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                {profileLoading ? 'Saving...' : 'Save Changes'}
              </button>
            </form>
          )}

          {/* Security tab */}
          {activeTab === 'security' && (
            <form onSubmit={handlePasswordSubmit} className="space-y-5">
              <FormField
                label="Current Password"
                id="currentPassword"
                type="password"
                value={pwForm.currentPassword}
                onChange={(e) => setPwForm((p) => ({ ...p, currentPassword: e.target.value }))}
                required
                placeholder="Enter current password"
              />
              <FormField
                label="New Password"
                id="newPassword"
                type="password"
                value={pwForm.newPassword}
                onChange={(e) => setPwForm((p) => ({ ...p, newPassword: e.target.value }))}
                required
                placeholder="At least 8 characters"
              />
              <FormField
                label="Confirm New Password"
                id="confirm"
                type="password"
                value={pwForm.confirm}
                onChange={(e) => setPwForm((p) => ({ ...p, confirm: e.target.value }))}
                required
                placeholder="Repeat new password"
              />

              {pwError && (
                <div role="alert" className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-4 py-3">
                  {pwError}
                </div>
              )}
              {pwSuccess && (
                <div role="status" className="text-sm text-green-700 bg-green-50 border border-green-200 rounded-lg px-4 py-3 flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4" />
                  Password updated successfully.
                </div>
              )}

              <button
                type="submit"
                disabled={pwLoading}
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl gradient-hero text-white text-sm font-semibold hover:opacity-90 transition-opacity disabled:opacity-60"
              >
                {pwLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Lock className="h-4 w-4" />}
                {pwLoading ? 'Updating...' : 'Update Password'}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
