"use client";

import type { InputHTMLAttributes, TextareaHTMLAttributes } from "react";

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  hint?: string;
}

export function Input({ label, error, hint, className = "", id, ...props }: InputProps) {
  const inputId = id ?? label?.toLowerCase().replace(/\s+/g, "-");
  return (
    <div className="w-full">
      {label && (
        <label htmlFor={inputId} className="block text-sm font-medium text-surface-700 mb-1.5">
          {label}
        </label>
      )}
      <input
        id={inputId}
        className={`
          w-full px-3 py-2 text-sm rounded-lg border transition-colors duration-150
          bg-white placeholder:text-surface-400
          focus:outline-none focus:ring-2 focus:ring-offset-0
          ${error
            ? "border-error-600 focus:ring-error-500/30"
            : "border-surface-300 focus:border-brand-500 focus:ring-brand-500/20"
          }
          disabled:bg-surface-100 disabled:text-surface-400 disabled:cursor-not-allowed
          ${className}
        `.trim()}
        {...props}
      />
      {error && <p className="mt-1 text-xs text-error-600">{error}</p>}
      {hint && !error && <p className="mt-1 text-xs text-surface-400">{hint}</p>}
    </div>
  );
}

interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  error?: string;
  hint?: string;
}

export function Textarea({ label, error, hint, className = "", id, ...props }: TextareaProps) {
  const inputId = id ?? label?.toLowerCase().replace(/\s+/g, "-");
  return (
    <div className="w-full">
      {label && (
        <label htmlFor={inputId} className="block text-sm font-medium text-surface-700 mb-1.5">
          {label}
        </label>
      )}
      <textarea
        id={inputId}
        className={`
          w-full px-3 py-2 text-sm rounded-lg border transition-colors duration-150
          bg-white placeholder:text-surface-400 resize-y min-h-[120px]
          focus:outline-none focus:ring-2 focus:ring-offset-0
          ${error
            ? "border-error-600 focus:ring-error-500/30"
            : "border-surface-300 focus:border-brand-500 focus:ring-brand-500/20"
          }
          disabled:bg-surface-100 disabled:text-surface-400 disabled:cursor-not-allowed
          ${className}
        `.trim()}
        {...props}
      />
      {error && <p className="mt-1 text-xs text-error-600">{error}</p>}
      {hint && !error && <p className="mt-1 text-xs text-surface-400">{hint}</p>}
    </div>
  );
}
