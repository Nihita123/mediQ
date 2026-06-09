/**
 * components/ui/DashboardCard.jsx
 *
 * Stat card used on the Patient Dashboard.
 *
 * Props:
 *   title    — Card heading
 *   value    — Primary metric (number or string)
 *   icon     — Lucide icon component
 *   trend    — Optional trend text (e.g. "+2 this week")
 *   color    — Accent colour variant: 'blue' | 'green' | 'yellow' | 'purple' | 'red'
 *   onClick  — Optional click handler
 */

import { cn } from '../../utils/cn';

const colorMap = {
  blue: {
    bg: 'bg-blue-50',
    icon: 'bg-blue-100 text-blue-600',
    value: 'text-blue-700',
  },
  green: {
    bg: 'bg-green-50',
    icon: 'bg-green-100 text-green-600',
    value: 'text-green-700',
  },
  yellow: {
    bg: 'bg-yellow-50',
    icon: 'bg-yellow-100 text-yellow-600',
    value: 'text-yellow-700',
  },
  purple: {
    bg: 'bg-purple-50',
    icon: 'bg-purple-100 text-purple-600',
    value: 'text-purple-700',
  },
  red: {
    bg: 'bg-red-50',
    icon: 'bg-red-100 text-red-600',
    value: 'text-red-700',
  },
};

export default function DashboardCard({
  title,
  value,
  icon: Icon,
  trend,
  color = 'blue',
  onClick,
}) {
  const colors = colorMap[color] || colorMap.blue;

  return (
    <div
      className={cn(
        'rounded-2xl border border-border bg-white p-6 shadow-sm flex items-center gap-5 transition-shadow',
        onClick && 'cursor-pointer hover:shadow-md'
      )}
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={(e) => e.key === 'Enter' && onClick?.()}
    >
      {/* Icon */}
      <div className={cn('h-14 w-14 rounded-2xl flex items-center justify-center shrink-0', colors.icon)}>
        {Icon && <Icon className="h-7 w-7" />}
      </div>

      {/* Content */}
      <div className="min-w-0">
        <p className="text-sm text-muted-foreground font-medium truncate">{title}</p>
        <p className={cn('text-3xl font-bold mt-0.5', colors.value)}>{value}</p>
        {trend && (
          <p className="text-xs text-muted-foreground mt-1">{trend}</p>
        )}
      </div>
    </div>
  );
}
