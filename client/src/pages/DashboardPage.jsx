/**
 * pages/DashboardPage.jsx — Patient Dashboard
 *
 * Shows key stats, recent sessions, and a "Start New Triage" CTA.
 */

import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  MessageSquarePlus,
  ClipboardList,
  FileText,
  AlertTriangle,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { triageService, reportService } from '../services/api';
import DashboardCard from '../components/ui/DashboardCard';
import SummaryCard from '../components/ui/SummaryCard';

export default function DashboardPage() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [sessions, setSessions] = useState([]);
  const [stats, setStats] = useState({ total: 0, high: 0, reports: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);

        // Fetch recent sessions for display (limit 4) from triage history
        // Fetch all sessions (high limit) separately to compute accurate stats
        const [recentData, allData, reportsData] = await Promise.all([
          triageService.getHistory({ limit: 4, page: 1 }),
          triageService.getHistory({ limit: 200, page: 1 }),
          reportService.getByPatient(user._id).catch(() => ({ reports: [] })),
        ]);

        const recentSessions = recentData.sessions || [];
        const allSessions    = allData.sessions    || [];

        // Count high/critical risk across ALL sessions, not just the last 4
        const highRisk = allSessions.filter(
          (s) => s.riskLevel === 'high' || s.riskLevel === 'critical'
        ).length;

        setSessions(recentSessions);
        setStats({
          total:   recentData.pagination?.total ?? allSessions.length,
          high:    highRisk,
          reports: reportsData.reports?.length || 0,
        });
      } catch (err) {
        setError('Failed to load dashboard data.');
        console.error(err);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [user._id]);

  const handleNewTriage = async () => {
    navigate('/triage/new');
  };

  return (
    <div className="space-y-8">
      {/* Page header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">
            Good day, {user?.name?.split(' ')[0]} 👋
          </h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Here's a summary of your health intake activity.
          </p>
        </div>

        <button
          onClick={handleNewTriage}
          className="inline-flex items-center gap-2 px-5 py-3 rounded-xl gradient-hero text-white font-semibold text-sm hover:opacity-90 transition-opacity shadow-lg shadow-primary/20 shrink-0"
        >
          <MessageSquarePlus className="h-4 w-4" />
          Start New Triage
        </button>
      </div>

      {/* Stats grid */}
      {loading ? (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="rounded-2xl border border-border bg-white p-6 h-28 animate-pulse" />
          ))}
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <DashboardCard
            title="Total Sessions"
            value={stats.total}
            icon={ClipboardList}
            trend="All-time triage sessions"
            color="blue"
            onClick={() => navigate('/sessions')}
          />
          <DashboardCard
            title="High Risk Flags"
            value={stats.high}
            icon={AlertTriangle}
            trend="Sessions flagged high or critical"
            color="red"
          />
          <DashboardCard
            title="Reports Generated"
            value={stats.reports}
            icon={FileText}
            trend="Clinical summaries available"
            color="green"
          />
        </div>
      )}

      {/* Recent sessions */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-foreground">Recent Sessions</h2>
          <button
            onClick={() => navigate('/sessions')}
            className="text-sm text-primary hover:underline font-medium"
          >
            View all
          </button>
        </div>

        {error && (
          <div role="alert" className="px-4 py-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">
            {error}
          </div>
        )}

        {loading ? (
          <div className="grid sm:grid-cols-2 gap-4">
            {[1, 2].map((i) => (
              <div key={i} className="rounded-2xl border border-border bg-white p-5 h-48 animate-pulse" />
            ))}
          </div>
        ) : sessions.length > 0 ? (
          <div className="grid sm:grid-cols-2 gap-4">
            {sessions.map((session) => (
              <SummaryCard key={session._id} session={session} />
            ))}
          </div>
        ) : (
          /* Empty state */
          <div className="rounded-2xl border-2 border-dashed border-border bg-white p-10 text-center">
            <div className="h-14 w-14 rounded-2xl gradient-card flex items-center justify-center mx-auto mb-4">
              <MessageSquarePlus className="h-7 w-7 text-primary" />
            </div>
            <h3 className="font-semibold text-foreground mb-2">No sessions yet</h3>
            <p className="text-sm text-muted-foreground mb-6 max-w-xs mx-auto">
              Start your first triage session and MediQ will assess your symptoms.
            </p>
            <button
              onClick={handleNewTriage}
              className="px-5 py-2.5 rounded-xl gradient-hero text-white text-sm font-medium hover:opacity-90 transition-opacity"
            >
              Start Your First Triage
            </button>
          </div>
        )}
      </div>

      {/* Disclaimer */}
      <div className="rounded-xl bg-yellow-50 border border-yellow-200 p-4 flex gap-3">
        <AlertTriangle className="h-5 w-5 text-yellow-600 shrink-0 mt-0.5" />
        <p className="text-xs text-yellow-800 leading-relaxed">
          <strong>Medical Disclaimer:</strong> MediQ provides informational assessments only.
          Always consult a qualified healthcare professional for medical advice, diagnosis, or treatment.
          If you're experiencing a medical emergency, call 911 immediately.
        </p>
      </div>
    </div>
  );
}
