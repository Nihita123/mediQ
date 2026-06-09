/**
 * components/ui/ExplainabilityPanel.jsx
 *
 * Shows doctors WHY a risk level was assigned.
 * Displays the reasoning chain, red flags, and confidence from the LLM.
 */

import { AlertTriangle, CheckCircle2, Info, Lightbulb } from 'lucide-react';
import ConfidenceMeter from './ConfidenceMeter';
import AIEngineBadge from './AIEngineBadge';
import { cn } from '../../utils/cn';
import { riskLevelClass, riskDotClass, capitalise } from '../../utils/formatters';

/**
 * @param {object}   props
 * @param {object}   props.triageResult  — { riskLevel, confidence, reasoning[], redFlags[], department, suggestedFollowUp, generatedBy }
 * @param {string}   [props.className]
 */
export default function ExplainabilityPanel({ triageResult, className }) {
  if (!triageResult) return null;

  const {
    riskLevel        = 'unknown',
    confidence       = null,
    reasoning        = [],
    redFlags         = [],
    department       = null,
    suggestedFollowUp = null,
    generatedBy      = 'rules',
  } = triageResult;

  return (
    <div className={cn('bg-white rounded-2xl border border-border shadow-sm overflow-hidden', className)}>
      {/* Header */}
      <div className="px-5 py-4 border-b border-border flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <Info className="h-4 w-4 text-primary shrink-0" />
          <span className="font-semibold text-foreground text-sm">Triage Assessment Explanation</span>
        </div>
        <AIEngineBadge engine={generatedBy} />
      </div>

      <div className="p-5 space-y-5">
        {/* Risk + Confidence */}
        <div className="flex flex-col sm:flex-row sm:items-center gap-4">
          <span
            className={cn(
              'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-bold border self-start',
              riskLevelClass(riskLevel)
            )}
          >
            <span className={cn('h-2 w-2 rounded-full', riskDotClass(riskLevel))} />
            {capitalise(riskLevel)} Risk
          </span>
          {confidence !== null && (
            <div className="flex-1 min-w-48">
              <ConfidenceMeter confidence={confidence} />
            </div>
          )}
        </div>

        {/* Reasoning chain */}
        {reasoning.length > 0 && (
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
              Clinical Reasoning
            </p>
            <ul className="space-y-2">
              {reasoning.map((point, idx) => (
                <li key={idx} className="flex items-start gap-2 text-sm text-foreground">
                  <CheckCircle2 className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                  {point}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Red flags */}
        {redFlags.length > 0 && (
          <div className="rounded-xl bg-red-50 border border-red-200 p-4">
            <p className="text-xs font-semibold text-red-700 uppercase tracking-wide mb-2 flex items-center gap-1.5">
              <AlertTriangle className="h-3.5 w-3.5" />
              Red Flags Identified
            </p>
            <ul className="space-y-1.5">
              {redFlags.map((flag, idx) => (
                <li key={idx} className="text-sm text-red-800 flex items-start gap-2">
                  <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-red-500 shrink-0" />
                  {flag}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Suggested follow-up */}
        {suggestedFollowUp && (
          <div className="rounded-xl bg-blue-50 border border-blue-200 p-4">
            <p className="text-xs font-semibold text-blue-700 uppercase tracking-wide mb-1.5 flex items-center gap-1.5">
              <Lightbulb className="h-3.5 w-3.5" />
              Suggested Follow-up
            </p>
            <p className="text-sm text-blue-900">{suggestedFollowUp}</p>
          </div>
        )}

        {/* Disclaimer */}
        <p className="text-xs text-muted-foreground bg-gray-50 rounded-lg px-3 py-2 border border-border leading-relaxed">
          This is a <strong>triage recommendation only</strong> — not a diagnosis.
          Clinical judgement by a qualified healthcare professional is required.
        </p>
      </div>
    </div>
  );
}
