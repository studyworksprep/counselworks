import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface StatCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  trend?: { value: number; label: string };
  icon?: React.ReactNode;
  className?: string;
  /** Deep-link the whole card to a pre-filtered view (fix plan 8.2). */
  href?: string;
}

export function StatCard({
  title,
  value,
  subtitle,
  trend,
  icon,
  className,
  href,
}: StatCardProps) {
  const card = (
    <Card className={className}>
      <CardContent className="flex items-start justify-between">
        <div>
          <p className="text-sm font-medium text-gray-500">{title}</p>
          <p className="mt-1 text-3xl font-bold text-gray-900">{value}</p>
          {subtitle && (
            <p className="mt-1 text-sm text-gray-500">{subtitle}</p>
          )}
          {trend && (
            <p
              className={cn(
                "mt-1 text-sm font-medium",
                trend.value >= 0 ? "text-success-700" : "text-danger-700"
              )}
            >
              {trend.value >= 0 ? "+" : ""}
              {trend.value} {trend.label}
            </p>
          )}
        </div>
        {icon && (
          <div className="rounded-lg bg-primary-50 p-3 text-primary-600">
            {icon}
          </div>
        )}
      </CardContent>
    </Card>
  );

  if (href) {
    return (
      <Link
        href={href}
        className="block rounded-xl transition-shadow hover:shadow-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary-500"
      >
        {card}
      </Link>
    );
  }
  return card;
}
