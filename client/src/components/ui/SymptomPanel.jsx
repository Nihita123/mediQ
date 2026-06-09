/**
 * components/ui/SymptomPanel.jsx  (v2)
 *
 * Live sidebar panel shown during a triage session.
 * Shows detected symptoms, risk badge, department routing,
 * state machine progress, AI engine badge, and medical entities.
 */

import { CheckCircle2, Activity, AlertCircle, Pill, Clock, Thermometer } from 'lucide-react';
import { cn } from '../../utils/cn';
import { riskLevelClass, riskDotClass, capitalise } from '../../utils/formatters';
import AIEngineBadge from './AIEngineBadge';

/**
 * @param {object}      props
 * @param {string[]}    props.symptoms        — Detected symptom labels
 * @param {string}      props.riskLevel       — 'low'|'medium'|'high'|'critical'|'unknown'
 * @param {string}      props.triageState     — Current state machine value
 * @param {string}      [props.department]    — Recommended department
 * @param {object}      [props.medicalEntities] — Structured entities from LLM
 * @param {object}      [props.triageResult]  — Full triage result for confidence
 * @param {string}      [props.aiEngine]      — 'llm' | 'rules'
 */
export default function SymptomPanel({
  symptoms = [],
  riskLevel = 'unknown',
  triageState,
  department,
  medicalEntities,
  triageResult,
  aiEngine,
}) {
  const isComplete = triageState === 'SUMMARY_READY' || triageState === 'ASSESSMENT_READY';
  const confidence = triageResult?.confidence;

  return (
    <div className="bg-white rounded-2xl border border-border shadow-sm overflow-hidden flex flex-col">

      {/* Header */}
      <div className="px-4 py-3 border-b border-border bg-gray-50 flex items-center gap-2">
        <Activity className="h-4 w-4 text-primary" />
        <span className="text-sm font-semibold text-foreground">Intake Summary</span>
        {symptoms.length > 0 && (
          <span className="ml-auto h-5 w-5 rounded-full bg-primary text-white text-xs flex items-center justify-center font-bold">
            {symptoms.length}
          </span>
        )}
      </div>

      <div className="flex-1 p-4 space-y-4">

        {/* Symptoms list */}
        <div>
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
            Symptoms Identified
          </p>
          {symptoms.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-4 text-center">
              <div className="h-9 w-9 rounded-full bg-gray-100 flex items-center justify-center mb-2">
                <Activity className="h-4 w-4 text-gray-400" />
              </div>
              <p className="text-xs text-muted-foreground">
                Symptoms appear here as you describe them.
              </p>
            </div>
          ) : (
            <ul className="space-y-1.5" role="list" aria-label="Detected symptoms">
              {symptoms.map((symptom) => (
                <li key={symptom} className="flex items-center gap-2 text-sm text-foreground">
                  <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0" />
                  {symptom}
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Structured entities — shown when LLM extracts them */}
        {medicalEntities && hasEntities(medicalEntities) && (
          <div className="space-y-3 border-t border-border pt-3">
            {medicalEntities.duration && (
              <EntityRow icon={Clock} label="Duration" value={medicalEntities.duration} />
            )}
            {medicalEntities.severity && (
              <EntityRow icon={Thermometer} label="Severity" value={medicalEntities.severity} />
            )}
            {medicalEntities.medicalHistory?.length > 0 && (
              <div>
                <p className="text-xs text-muted-foreground mb-1 flex items-center gap-1">
                  <AlertCircle className="h-3 w-3" /> Medical History
                </p>
                <div className="flex flex-wrap gap-1">
                  {medicalEntities.medicalHistory.map((h) => (
                    <span key={h} className="text-xs px-2 py-0.5 rounded-full bg-orange-50 text-orange-700 border border-orange-200">
                      {h}
                    </span>
                  ))}
                </div>
              </div>
            )}
            {medicalEntities.medications?.length > 0 && (
              <div>
                <p className="text-xs text-muted-foreground mb-1 flex items-center gap-1">
                  <Pill className="h-3 w-3" /> Medications
                </p>
                <div className="flex flex-wrap gap-1">
                  {medicalEntities.medications.map((m) => (
                    <span key={m} className="text-xs px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200">
                      {m}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Risk level badge */}
        {riskLevel !== 'unknown' && (
          <div className="border-t border-border pt-3">
            <p className="text-xs text-muted-foreground mb-1.5 font-medium">Risk Assessment</p>
            <span
              className={cn(
                'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold border w-full justify-center',
                riskLevelClass(riskLevel)
              )}
            >
              <span className={cn('h-1.5 w-1.5 rounded-full', riskDotClass(riskLevel))} />
              {capitalise(riskLevel)} Risk
              {confidence !== null && confidence !== undefined && (
                <span className="ml-1 opacity-70">
                  ({Math.round(confidence * 100)}%)
                </span>
              )}
            </span>
          </div>
        )}

        {/* Department routing — shown after assessment */}
        {isComplete && department && (
          <div className="rounded-xl bg-primary/5 border border-primary/20 p-3">
            <p className="text-xs text-muted-foreground mb-0.5 font-medium">Recommended Department</p>
            <p className="text-xs font-semibold text-primary leading-relaxed">{department}</p>
          </div>
        )}
      </div>

      {/* Footer: state progress + engine badge */}
      <div className="px-4 py-3 border-t border-border bg-gray-50 space-y-2">
        <StateProgressBar triageState={triageState} />
        {aiEngine && (
          <div className="flex justify-end">
            <AIEngineBadge engine={aiEngine} />
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function EntityRow({ icon: Icon, label, value }) {
  return (
    <div className="flex items-center gap-2 text-xs">
      <Icon className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
      <span className="text-muted-foreground">{label}:</span>
      <span className="font-medium text-foreground">{value}</span>
    </div>
  );
}

function StateProgressBar({ triageState }) {
  const states = [
    { key: 'SYMPTOM_COLLECTION',  label: 'Symptoms'  },
    { key: 'FOLLOW_UP_QUESTIONS', label: 'Questions' },
    { key: 'SUMMARY_READY',       label: 'Complete'  },
  ];

  const activeIndex = states.findIndex((s) => s.key === triageState);

  return (
    <div className="flex items-center gap-1" aria-label="Triage progress">
      {states.map((s, idx) => (
        <div key={s.key} className="flex items-center gap-1 flex-1">
          <div
            className={cn(
              'h-1.5 flex-1 rounded-full transition-all duration-500',
              idx <= activeIndex ? 'bg-primary' : 'bg-gray-200'
            )}
          />
          {idx === states.length - 1 && (
            <span className={cn(
              'text-[10px] font-medium whitespace-nowrap',
              idx <= activeIndex ? 'text-primary' : 'text-muted-foreground'
            )}>
              {s.label}
            </span>
          )}
        </div>
      ))}
    </div>
  );
}

function hasEntities(entities) {
  if (!entities) return false;
  return (
    entities.duration ||
    entities.severity ||
    entities.medicalHistory?.length > 0 ||
    entities.medications?.length > 0
  );
}
