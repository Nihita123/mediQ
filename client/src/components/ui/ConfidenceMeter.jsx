/**
 * components/ui/ConfidenceMeter.jsx
 *
 * Visualises the LLM confidence score (0–1) as a labelled progress bar.
 * Used on the DoctorSummaryPage for explainability.
 */

import { cn } from '../../utils/cn';

/**
 * @param {number}  confidence  — 0.0 to 1.0
 * @param {string}  [className]
 */
export default function ConfidenceMeter({ confidence, className }) {
  if (confidence === null || confidence === undefined) return null;

  const pct = Math.round(Math.min(1, Math.max(0, confidence)) * 100);

  const color =
    pct >= 80 ? 'bg-green-500'  :
    pct >= 60 ? 'bg-yellow-500' :
    pct >= 40 ? 'bg-orange-500' :
                'bg-red-500';

  const label =
    pct >= 80 ? 'High'     :
    pct >= 60 ? 'Moderate' :
    pct >= 40 ? 'Low'      :
                'Very Low';

  return (
    <div className={cn('space-y-1.5', className)}>
      <div className="flex items-center justify-between text-xs">
        <span className="text-muted-foreground font-medium">Assessment Confidence</span>
        <span className="font-semibold text-foreground">{pct}% — {label}</span>
      </div>
      <div className="h-2 w-full bg-gray-100 rounded-full overflow-hidden">
        <div
          className={cn('h-full rounded-full transition-all duration-700', color)}
          style={{ width: `${pct}%` }}
          role="progressbar"
          aria-valuenow={pct}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={`Confidence: ${pct}%`}
        />
      </div>
    </div>
  );
}
