"use client";

/**
 * Simple horizontal bar chart component.
 * Renders proportional bars with labels and values.
 */
export interface ChartBar {
  label: string;
  value: number;
  color?: string;
  maxValue?: number;
}

interface SimpleBarChartProps {
  bars: ChartBar[];
  className?: string;
  showValues?: boolean;
  height?: number;
}

const barColors = [
  "bg-brand-500",
  "bg-success-600",
  "bg-warning-600",
  "bg-info-600",
  "bg-error-600",
  "bg-brand-400",
  "bg-success-500",
  "bg-warning-500",
];

export function SimpleBarChart({ bars, className = "", showValues = true, height = 32 }: SimpleBarChartProps) {
  const maxVal = Math.max(...bars.map((b) => b.maxValue ?? b.value), 1);

  return (
    <div className={`space-y-3 ${className}`}>
      {bars.map((bar, i) => {
        const pct = Math.round(((bar.maxValue ?? bar.value) / maxVal) * 100);
        const colorClass = bar.color ?? barColors[i % barColors.length];

        return (
          <div key={bar.label} className="flex items-center gap-3">
            <span className="w-28 shrink-0 text-xs text-surface-600 truncate" title={bar.label}>
              {bar.label}
            </span>
            <div className="flex-1 min-w-0 flex items-center gap-2">
              <div
                className={`${colorClass} rounded-full transition-all duration-500`}
                style={{ width: `${pct}%`, height }}
              />
              {showValues && (
                <span className="text-xs font-medium text-surface-700 tabular-nums shrink-0">
                  {bar.value.toLocaleString()}
                </span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/**
 * Simple stat card for dashboard overviews.
 */
interface StatCardProps {
  label: string;
  value: number | string;
  subtitle?: string;
  icon?: React.ReactNode;
  variant?: "default" | "success" | "warning" | "error" | "info";
  trend?: { direction: "up" | "down"; label: string };
}

const statVariantClasses: Record<string, { bg: string; text: string }> = {
  default: { bg: "bg-surface-100", text: "text-surface-600" },
  success: { bg: "bg-success-100", text: "text-success-600" },
  warning: { bg: "bg-warning-100", text: "text-warning-600" },
  error: { bg: "bg-error-100", text: "text-error-600" },
  info: { bg: "bg-info-100", text: "text-info-600" },
};

export function StatCard({ label, value, subtitle, icon, variant = "default", trend }: StatCardProps) {
  const v = statVariantClasses[variant];
  return (
    <div className="bg-white rounded-xl border border-surface-200 shadow-sm p-6 hover:shadow-md transition-shadow duration-200">
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs font-medium text-surface-500 uppercase tracking-wider">{label}</span>
        {icon && (
          <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${v.bg} ${v.text}`}>
            {icon}
          </div>
        )}
      </div>
      <div className="flex items-baseline gap-2">
        <span className="text-2xl font-bold text-surface-900 tracking-tight">
          {typeof value === "number" ? value.toLocaleString() : value}
        </span>
        {trend && (
          <span className={`text-xs font-medium ${trend.direction === "up" ? "text-success-600" : "text-error-600"}`}>
            {trend.direction === "up" ? "↑" : "↓"} {trend.label}
          </span>
        )}
      </div>
      {subtitle && <p className="text-xs text-surface-400 mt-1">{subtitle}</p>}
    </div>
  );
}
