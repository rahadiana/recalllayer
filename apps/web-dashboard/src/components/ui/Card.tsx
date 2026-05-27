"use client";

import type { ReactNode } from "react";

interface CardProps {
  children: ReactNode;
  className?: string;
  padding?: "none" | "sm" | "md" | "lg";
  onClick?: () => void;
}

const paddings = {
  none: "",
  sm: "p-4",
  md: "p-6",
  lg: "p-8",
};

export function Card({ children, className = "", padding = "md", onClick }: CardProps) {
  return (
    <div
      onClick={onClick}
      className={`
        bg-white rounded-xl border border-surface-200
        shadow-sm hover:shadow-md transition-shadow duration-200
        ${paddings[padding]}
        ${onClick ? "cursor-pointer" : ""}
        ${className}
      `.trim()}
    >
      {children}
    </div>
  );
}
