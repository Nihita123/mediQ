/**
 * components/ui/AIEngineBadge.jsx
 *
 * Small badge showing which engine produced the triage result —
 * displayed in the chat header and on the summary page.
 */

import { Sparkles, GitBranch } from 'lucide-react';
import { cn } from '../../utils/cn';

/**
 * @param {'llm'|'rules'|'hybrid'|null} engine
 * @param {string} [className]
 */
export default function AIEngineBadge({ engine, className }) {
  if (!engine) return null;

  const isLLM = engine === 'llm' || engine === 'hybrid';

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border',
        isLLM
          ? 'bg-violet-50 text-violet-700 border-violet-200'
          : 'bg-gray-100 text-gray-600 border-gray-200',
        className
      )}
      title={isLLM ? 'Responses powered by AI language model' : 'Responses powered by rule-based engine'}
    >
      {isLLM ? (
        <Sparkles className="h-3 w-3" />
      ) : (
        <GitBranch className="h-3 w-3" />
      )}
      {isLLM ? 'AI Powered' : 'Rule Engine'}
    </span>
  );
}
