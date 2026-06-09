/**
 * components/ui/ClinicalSummaryCard.jsx
 *
 * Renders the full structured LLM-generated clinical summary
 * in a formatted doctor-facing layout.
 *
 * Falls back to plain-text summary if structuredSummary is absent.
 */

import {
  FileText,
  User,
  Clock,
  Pill,
  AlertTriangle,
  Activity,
  Stethoscope,
  ChevronRight,
} from 'lucide-react';

/**
 * @param {object}      props
 * @param {object|null} props.structuredSummary  — LLM JSON summary object
 * @param {string|null} props.plainSummary       — Fallback plain-text summary
 */
export default function ClinicalSummaryCard({ structuredSummary, plainSummary }) {
  // If no structured summary, render the plain-text fallback
  if (!structuredSummary) {
    if (!plainSummary) return null;
    return (
      <div className="bg-white rounded-2xl border border-border shadow-sm p-5">
        <h2 className="font-semibold text-foreground mb-3 flex items-center gap-2">
          <FileText className="h-4 w-4 text-primary" />
          Clinical Summary
        </h2>
        <pre className="text-sm text-foreground whitespace-pre-wrap font-sans leading-relaxed">
          {plainSummary}
        </pre>
      </div>
    );
  }

  const s = structuredSummary;

  return (
    <div className="bg-white rounded-2xl border border-border shadow-sm overflow-hidden">
      {/* Header */}
      <div className="px-5 py-4 border-b border-border flex items-center gap-2">
        <FileText className="h-4 w-4 text-primary" />
        <span className="font-semibold text-foreground">Clinical Intake Summary</span>
        <span className="ml-auto text-xs text-muted-foreground bg-gray-100 px-2 py-0.5 rounded-full">
          Physician View
        </span>
      </div>

      <div className="p-5 space-y-5">
        {/* Chief Complaint */}
        {s.chiefComplaint && (
          <SectionBlock icon={User} title="Chief Complaint">
            <p className="text-sm text-foreground font-medium">{s.chiefComplaint}</p>
          </SectionBlock>
        )}

        {/* History of Present Illness */}
        {s.historyOfPresentIllness && (
          <SectionBlock icon={Clock} title="History of Present Illness">
            <p className="text-sm text-foreground leading-relaxed">{s.historyOfPresentIllness}</p>
          </SectionBlock>
        )}

        {/* Symptoms grid */}
        {s.symptoms?.length > 0 && (
          <SectionBlock icon={Activity} title="Presenting Symptoms">
            <div className="flex flex-wrap gap-1.5">
              {s.symptoms.map((sym) => (
                <span
                  key={sym}
                  className="px-2.5 py-1 rounded-full bg-primary/10 text-primary text-xs font-medium border border-primary/20"
                >
                  {sym}
                </span>
              ))}
            </div>
            {(s.duration || s.severity) && (
              <div className="flex flex-wrap gap-4 mt-2 text-xs text-muted-foreground">
                {s.duration && <span><strong>Duration:</strong> {s.duration}</span>}
                {s.severity && <span><strong>Severity:</strong> {s.severity}</span>}
              </div>
            )}
          </SectionBlock>
        )}

        {/* Two-column: Medical History + Medications */}
        <div className="grid sm:grid-cols-2 gap-4">
          {s.medicalHistory?.length > 0 && (
            <SectionBlock icon={Stethoscope} title="Medical History">
              <TagList items={s.medicalHistory} color="bg-orange-50 text-orange-700 border-orange-200" />
            </SectionBlock>
          )}
          {s.medications?.length > 0 && (
            <SectionBlock icon={Pill} title="Current Medications">
              <TagList items={s.medications} color="bg-blue-50 text-blue-700 border-blue-200" />
            </SectionBlock>
          )}
        </div>

        {/* Allergies */}
        {s.allergies?.length > 0 && (
          <SectionBlock icon={AlertTriangle} title="Allergies">
            <TagList items={s.allergies} color="bg-red-50 text-red-700 border-red-200" />
          </SectionBlock>
        )}

        {/* Suggested follow-up */}
        {s.suggestedFollowUp && (
          <SectionBlock icon={ChevronRight} title="Suggested Follow-up">
            <p className="text-sm text-foreground">{s.suggestedFollowUp}</p>
          </SectionBlock>
        )}

        {/* Disclaimer */}
        {s.disclaimer && (
          <div className="rounded-xl bg-yellow-50 border border-yellow-200 p-3 flex gap-2">
            <AlertTriangle className="h-4 w-4 text-yellow-600 shrink-0 mt-0.5" />
            <p className="text-xs text-yellow-800 leading-relaxed">{s.disclaimer}</p>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function SectionBlock({ icon: Icon, title, children }) {
  return (
    <div>
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2 flex items-center gap-1.5">
        <Icon className="h-3.5 w-3.5" />
        {title}
      </p>
      {children}
    </div>
  );
}

function TagList({ items, color }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {items.map((item) => (
        <span
          key={item}
          className={`px-2.5 py-1 rounded-full text-xs font-medium border ${color}`}
        >
          {item}
        </span>
      ))}
    </div>
  );
}
