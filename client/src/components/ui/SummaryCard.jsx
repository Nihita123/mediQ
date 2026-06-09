/**
 * components/ui/SummaryCard.jsx
 *
 * Displays a triage session summary — used in the session history
 * and the Doctor Summary page.
 */

import { Link } from 'react-router-dom';
import { ArrowRight, AlertCircle, CheckCircle2, Clock } from 'lucide-react';
import { formatDate, riskLevelClass, riskDotClass, capitalise } from '../../utils/formatters';
import { cn } from '../../utils/cn';

const statusIcon = {
  active: <Clock className="h-4 w-4 text-yellow-500" />,
  completed: <CheckCircle2 className="h-4 w-4 text-green-500" />,
  reviewed: <CheckCircle2 className="h-4 w-4 text-blue-500" />,
  cancelled: <AlertCircle className="h-4 w-4 text-gray-400" />,
};

export default function SummaryCard({ session, showLink = true }) {
  return (
    <div className="bg-white rounded-2xl border border-border shadow-sm p-5 flex flex-col gap-4">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs text-muted-foreground">{formatDate(session.createdAt)}</p>
          <p className="text-sm font-semibold text-foreground mt-0.5">
            Triage Session
          </p>
        </div>

        {/* Risk badge */}
        <span
          className={cn(
            'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border',
            riskLevelClass(session.riskLevel)
          )}
        >
          <span className={cn('h-1.5 w-1.5 rounded-full', riskDotClass(session.riskLevel))} />
          {capitalise(session.riskLevel)} Risk
        </span>
      </div>

      {/* Summary text */}
      {session.summary ? (
        <p className="text-sm text-foreground line-clamp-3">{session.summary}</p>
      ) : (
        <p className="text-sm text-muted-foreground italic">No summary available yet.</p>
      )}

      {/* Symptoms */}
      {session.extractedSymptoms?.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {session.extractedSymptoms.slice(0, 5).map((symptom) => (
            <span
              key={symptom}
              className="text-xs px-2 py-0.5 rounded-full bg-accent text-accent-foreground border border-border"
            >
              {symptom}
            </span>
          ))}
          {session.extractedSymptoms.length > 5 && (
            <span className="text-xs px-2 py-0.5 text-muted-foreground">
              +{session.extractedSymptoms.length - 5} more
            </span>
          )}
        </div>
      )}

      {/* Footer */}
      <div className="flex items-center justify-between pt-2 border-t border-border">
        <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
          {statusIcon[session.status]}
          {capitalise(session.status)}
        </span>

        {showLink && (
          <Link
            to={`/sessions/${session._id}/summary`}
            className="flex items-center gap-1 text-xs font-medium text-primary hover:underline"
          >
            View Details
            <ArrowRight className="h-3 w-3" />
          </Link>
        )}
      </div>
    </div>
  );
}
