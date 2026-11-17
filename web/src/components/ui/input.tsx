"use client";

import { forwardRef, type InputHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, label, error, id, ...props }, ref) => {
    const input = (
      <input
        ref={ref}
        id={id}
        className={cn(
          "block w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm placeholder:text-gray-400 focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500 disabled:cursor-not-allowed disabled:bg-gray-50 disabled:text-gray-500",
          error && "border-danger-500 focus:border-danger-500 focus:ring-danger-500",
          className
        )}
        {...props}
      />
    );
    // A bare input (no visible label or error) renders without the
    // full-width wrapper so a width className sizes it inside filter rows.
    if (!label && !error) return input;
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
        {input}
        {error && <p className="mt-1 text-sm text-danger-600">{error}</p>}
      </div>
    );
  }
);

Input.displayName = "Input";
