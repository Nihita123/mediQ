/**
 * components/layout/AppLayout.jsx
 *
 * The shell layout wrapping all authenticated pages.
 * Contains the Navbar and Sidebar.
 */

import { useState } from 'react';
import Navbar from './Navbar';
import Sidebar from './Sidebar';

export default function AppLayout({ children }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Top navigation */}
      <Navbar onMenuToggle={() => setSidebarOpen((prev) => !prev)} />

      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar — hidden on mobile, visible on md+ */}
        <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />

        {/* Main content area */}
        <main className="flex-1 overflow-y-auto p-6 md:p-8">
          <div className="max-w-6xl mx-auto">{children}</div>
        </main>
      </div>
    </div>
  );
}
