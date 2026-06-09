/**
 * pages/DoctorSummaryPage.jsx  (v2)
 *
 * Full session summary page for physician review.
 *
 * New in v2:
 *  - Uses triageService.getSession() to load the full session
 *  - Shows ExplainabilityPanel (reasoning + red flags + confidence)
 *  - Shows ClinicalSummaryCard (structured LLM summary or plain text)
 *  - Shows MedicalEntities panel (duration, severity, medications, etc.)
 *  - Shows AIEngineBadge in the header
 */

import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  User,
  Calendar,
  Activity,
  Tag,
  Stethoscope,
  MessageSquare,
} from 'lucide-react';
import { triageService, sessionService } from '../services/api';
import LoadingSpinner from '../components/ui/LoadingSpinner';
import ExplainabilityPanel from '../components/ui/ExplainabilityPanel';
import ClinicalSummaryCard from '../components/ui/ClinicalSummaryCard';
import AIEngineBadge from '../components/ui/AIEngineBadge';
import { formatDateTime, riskLevelClass, riskDotClass, capitalise } from '../utils/formatters';
import { cn } from '../utils/cn';

// ─── Small info row used in the metadata card ──────────────────────────────

function InfoItem({ icon: Icon, label, value }) {
  return (
    <div className="flex items-start gap-3 py-3 border-b border-border last:border-0">
      <div className="h-8 w-8 rounded-lg bg-accent flex items-center justify-center shrink-0">
        <Icon className="h-4 w-4 text-primary" />
      </div>
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="text-sm font-medium text-foreground break-words">{value || '—'}</p>
      </div>
    </div>
  );
}

// ─── Main page ─────────────────────────────────────────────────────────────

export default function DoctorSummaryPage() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState('');

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        // Try the triage endpoint first (has richer fields), fall back to session endpoint
        let data;
        try {
          data = await triageService.getSession(id);
        } catch {
          data = await sessionService.getById(id);
        }
        setSession(data.session);
      } catch {
        setError('Failed to load session details.');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [id]);

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <LoadingSpinner size="lg" label="Loading session…" />
      </div>
    );
  }

  if (error || !session) {
    return (
      <div className="text-center py-20">
        <p className="text-muted-foreground">{error || 'Session not found.'}</p>
        <button
          onClick={() => navigate('/sessions')}
          className="mt-4 text-sm text-primary hover:underline"
        >
          Back to Sessions
        </button>
      </div>
    );
  }

  const triageResult    = session.triageResult    || null;
  const structuredSum   = session.structuredSummary || null;
  const medicalEntities = session.medicalEntities  || null;
  const aiEngine        = session.aiEngine         || 'rules';

  return (
    <div className="max-w-5xl space-y-6">

      {/* ── Page header ──────────────────────────────────────────────────── */}
      <div className="flex items-center gap-3 flex-wrap">
        <button
          onClick={() => navigate('/sessions')}
          className="p-2 rounded-lg hover:bg-accent text-muted-foreground transition-colors"
          aria-label="Back"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
        <div>
          <h1 className="text-xl font-bold text-foreground">Session Report</h1>
          <p className="text-xs text-muted-foreground">ID: {session._id}</p>
        </div>

        <div className="ml-auto flex items-center gap-2 flex-wrap justify-end">
          <AIEngineBadge engine={aiEngine} />
          <span
            className={cn(
              'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-semibold border',
              riskLevelClass(session.riskLevel)
            )}
          >
            <span className={cn('h-2 w-2 rounded-full', riskDotClass(session.riskLevel))} />
            {capitalise(session.riskLevel)} Risk
          </span>
        </div>
      </div>

      {/* ── Layout grid ──────────────────────────────────────────────────── */}
      <div className="grid md:grid-cols-3 gap-5">

        {/* ── Left column: metadata ──────────────────────────────────────── */}
        <div className="md:col-span-1 space-y-4">
          <div className="bg-white rounded-2xl border border-border shadow-sm p-5">
            <h2 className="font-semibold text-foreground mb-3 flex items-center gap-2 text-sm">
              <Stethoscope className="h-4 w-4 text-primary" />
              Session Details
            </h2>
            <InfoItem icon={Calendar}  label="Date"       value={formatDateTime(session.createdAt)} />
            <InfoItem icon={Activity}  label="Status"     value={capitalise(session.status)} />
            <InfoItem icon={Tag}       label="Department" value={session.department} />
            <InfoItem icon={User}      label="Patient"    value={session.userId?.name || 'Unknown'} />
          </div>

          {/* Extracted symptoms */}
          <div className="bg-white rounded-2xl border border-border shadow-sm p-5">
            <h2 className="font-semibold text-foreground mb-3 flex items-center gap-2 text-sm">
              <Activity className="h-4 w-4 text-primary" />
              Symptoms
            </h2>
            {session.extractedSymptoms?.length > 0 ? (
              <div className="flex flex-wrap gap-1.5">
                {session.extractedSymptoms.map((sym) => (
                  <span
                    key={sym}
                    className="px-2.5 py-1 rounded-full bg-primary/10 text-primary text-xs font-medium border border-primary/20"
                  >
                    {sym}
                  </span>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground italic">None recorded.</p>
            )}
          </div>

          {/* Medical entities from LLM */}
          {medicalEntities && hasAnyEntity(medicalEntities) && (
            <div className="bg-white rounded-2xl border border-border shadow-sm p-5 space-y-3">
              <h2 className="font-semibold text-foreground text-sm">Intake Details</h2>
              {medicalEntities.duration && (
                <EntityRow label="Duration"  value={medicalEntities.duration} />
              )}
              {medicalEntities.severity && (
                <EntityRow label="Severity"  value={medicalEntities.severity} />
              )}
              {medicalEntities.medicalHistory?.length > 0 && (
                <EntityRow label="History"   value={medicalEntities.medicalHistory.join(', ')} />
              )}
              {medicalEntities.medications?.length > 0 && (
                <EntityRow label="Medications" value={medicalEntities.medications.join(', ')} />
              )}
              {medicalEntities.allergies?.length > 0 && (
                <EntityRow label="Allergies" value={medicalEntities.allergies.join(', ')} color="text-red-600" />
              )}
            </div>
          )}
        </div>

        {/* ── Right column: summary + explainability + transcript ─────────── */}
        <div className="md:col-span-2 space-y-5">

          {/* Clinical summary — structured (LLM) or plain text (rules) */}
          <ClinicalSummaryCard
            structuredSummary={structuredSum}
            plainSummary={session.summary}
          />

          {/* Explainability panel — shown when triageResult is present */}
          {triageResult && (
            <ExplainabilityPanel triageResult={triageResult} />
          )}

          {/* Conversation transcript */}
          {session.messages?.length > 0 && (
            <div className="bg-white rounded-2xl border border-border shadow-sm p-5">
              <h2 className="font-semibold text-foreground mb-4 flex items-center gap-2 text-sm">
                <MessageSquare className="h-4 w-4 text-primary" />
                Conversation Transcript
              </h2>
              <div
                className="space-y-3 max-h-80 overflow-y-auto pr-1"
                role="log"
                aria-label="Session transcript"
              >
                {session.messages
                  .filter((m) => m.role !== 'system')
                  .map((msg, idx) => (
                    <div
                      key={idx}
                      className={cn('flex', msg.role === 'user' ? 'justify-end' : 'justify-start')}
                    >
                      <span
                        className={cn(
                          'inline-block px-3 py-2 rounded-xl max-w-[80%] text-sm leading-relaxed',
                          msg.role === 'user'
                            ? 'bg-primary/10 text-primary rounded-br-sm'
                            : 'bg-gray-100 text-foreground rounded-bl-sm'
                        )}
                      >
                        {msg.content}
                      </span>
                    </div>
                  ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function EntityRow({ label, value, color = 'text-foreground' }) {
  return (
    <div className="flex gap-2 text-sm">
      <span className="text-muted-foreground shrink-0 w-24">{label}:</span>
      <span className={cn('font-medium', color)}>{value}</span>
    </div>
  );
}

function hasAnyEntity(e) {
  return e.duration || e.severity ||
    e.medicalHistory?.length > 0 ||
    e.medications?.length > 0 ||
    e.allergies?.length > 0;
}
