import * as React from "react";

import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

interface FormFieldProps extends React.ComponentProps<"input"> {
  label: string;
  error?: string;
  /** Rendered between the field and its error, e.g. the strength meter. */
  hint?: React.ReactNode;
}

export function FormField({
  label,
  error,
  hint,
  id,
  className,
  ...props
}: FormFieldProps) {
  const fieldId = id ?? props.name ?? label.toLowerCase().replace(/\s+/g, "-");
  const errorId = `${fieldId}-error`;

  return (
    <div className="space-y-2">
      <label htmlFor={fieldId} className="block text-sm font-medium text-foreground">
        {label}
      </label>
      <Input
        id={fieldId}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
        className={cn(error && "border-danger focus-visible:border-danger", className)}
        {...props}
      />
      {hint}
      {error ? (
        <p id={errorId} className="text-sm text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}
