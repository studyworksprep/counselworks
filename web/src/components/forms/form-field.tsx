interface FormFieldProps {
  label: string;
  htmlFor?: string;
  error?: string;
  required?: boolean;
  children: React.ReactNode;
}

export function FormField({
  label,
  htmlFor,
  error,
  required,
  children,
}: FormFieldProps) {
  return (
    <div className="w-full">
      <label
        htmlFor={htmlFor}
        className="mb-1.5 block text-sm font-medium text-gray-700"
      >
        {label}
        {required && <span className="ml-1 text-danger-500">*</span>}
      </label>
      {children}
      {error && <p className="mt-1 text-sm text-danger-500">{error}</p>}
    </div>
  );
}
