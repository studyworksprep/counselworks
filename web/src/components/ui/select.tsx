"use client";

import { forwardRef, type SelectHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  error?: string;
  options: { value: string; label: string }[];
  placeholder?: string;
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(
  ({ className, label, error, id, options, placeholder, ...props }, ref) => {
    const select = (
      <select
        ref={ref}
        id={id}
        className={cn(
          "block w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500 disabled:cursor-not-allowed disabled:bg-gray-50 disabled:text-gray-500",
          error && "border-danger-500 focus:border-danger-500 focus:ring-danger-500",
          className
        )}
        {...props}
      >
        {placeholder && <option value="">{placeholder}</option>}
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    );
    // A bare filter select (no visible label or error) renders without the
    // full-width wrapper, so a width className like "w-44" sizes the control
    // itself. The wrapper used to stretch every filter onto its own line.
    if (!label && !error) return select;
    return (
      <div className="w-full">
        {label && (
          <label
            htmlFor={id}
            className="mb-1.5 block text-sm font-medium text-gray-700"
          >
            {label}
            {props.required && (
              <span className="ml-0.5 text-danger-500" aria-hidden="true">
                *
              </span>
            )}
          </label>
        )}
        {select}
        {error && <p className="mt-1 text-sm text-danger-600">{error}</p>}
      </div>
    );
  }
);

Select.displayName = "Select";
