/**
 * pages/SessionHistoryPage.jsx — Paginated session history
 */

import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { MessageSquarePlus, Filter, Search } from 'lucide-react';
import { sessionService } from '../services/api';
import SummaryCard from '../components/ui/SummaryCard';
import LoadingSpinner from '../components/ui/LoadingSpinner';

const RISK_FILTERS = ['all', 'low', 'medium', 'high', 'critical', 'unknown'];
const STATUS_FILTERS = ['all', 'active', 'completed', 'reviewed', 'cancelled'];

export default function SessionHistoryPage() {
  const navigate = useNavigate();

  const [sessions, setSessions] = useState([]);
  const [pagination, setPagination] = useState({ total: 0, pages: 1, page: 1 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [riskFilter, setRiskFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);

  useEffect(() => {
    const fetch = async () => {
      setLoading(true);
      try {
        const data = await sessionService.getHistory({ page, limit: 12 });
        setSessions(data.sessions || []);
        setPagination(data.pagination);
      } catch {
        setError('Failed to load session history.');
      } finally {
        setLoading(false);
      }
    };

    fetch();
  }, [page]);

  // Client-side filter on already-fetched data
  const filtered = sessions.filter((s) => {
    const matchRisk = riskFilter === 'all' || s.riskLevel === riskFilter;
    const matchStatus = statusFilter === 'all' || s.status === statusFilter;
    const matchSearch =
      !search ||
      s.summary?.toLowerCase().includes(search.toLowerCase()) ||
      s.extractedSymptoms?.some((sym) => sym.toLowerCase().includes(search.toLowerCase()));
    return matchRisk && matchStatus && matchSearch;
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Session History</h1>
          <p className="text-muted-foreground text-sm mt-1">
            All {pagination.total} of your previous triage sessions.
          </p>
        </div>
        <button
          onClick={() => navigate('/triage/new')}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl gradient-hero text-white text-sm font-semibold hover:opacity-90 transition-opacity shrink-0"
        >
          <MessageSquarePlus className="h-4 w-4" />
          New Triage
        </button>
      </div>

      {/* Filters bar */}
      <div className="bg-white rounded-xl border border-border p-4 flex flex-wrap gap-3 items-center">
        {/* Search */}
        <div className="relative flex-1 min-w-52">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            type="search"
            placeholder="Search symptoms or summary..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>

        {/* Risk filter */}
        <div className="flex items-center gap-2">
          <Filter className="h-4 w-4 text-muted-foreground" />
          <select
            value={riskFilter}
            onChange={(e) => setRiskFilter(e.target.value)}
            className="text-sm border border-input rounded-lg px-3 py-2 bg-background focus:outline-none focus:ring-2 focus:ring-ring"
            aria-label="Filter by risk level"
          >
            {RISK_FILTERS.map((f) => (
              <option key={f} value={f}>
                {f === 'all' ? 'All Risk Levels' : `${f.charAt(0).toUpperCase() + f.slice(1)} Risk`}
              </option>
            ))}
          </select>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="text-sm border border-input rounded-lg px-3 py-2 bg-background focus:outline-none focus:ring-2 focus:ring-ring"
            aria-label="Filter by status"
          >
            {STATUS_FILTERS.map((f) => (
              <option key={f} value={f}>
                {f === 'all' ? 'All Statuses' : f.charAt(0).toUpperCase() + f.slice(1)}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div role="alert" className="px-4 py-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Sessions grid */}
      {loading ? (
        <div className="flex justify-center py-16">
          <LoadingSpinner size="lg" label="Loading sessions..." />
        </div>
      ) : filtered.length > 0 ? (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((session) => (
            <SummaryCard key={session._id} session={session} />
          ))}
        </div>
      ) : (
        <div className="rounded-2xl border-2 border-dashed border-border bg-white p-12 text-center">
          <p className="text-muted-foreground text-sm">
            {sessions.length === 0
              ? 'No sessions found. Start your first triage session!'
              : 'No sessions match your filters.'}
          </p>
        </div>
      )}

      {/* Pagination */}
      {pagination.pages > 1 && (
        <div className="flex items-center justify-center gap-2 pt-4">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1}
            className="px-4 py-2 rounded-lg border border-border text-sm font-medium disabled:opacity-40 hover:bg-accent transition-colors"
          >
            Previous
          </button>
          <span className="text-sm text-muted-foreground">
            Page {page} of {pagination.pages}
          </span>
          <button
            onClick={() => setPage((p) => Math.min(pagination.pages, p + 1))}
            disabled={page === pagination.pages}
            className="px-4 py-2 rounded-lg border border-border text-sm font-medium disabled:opacity-40 hover:bg-accent transition-colors"
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}
