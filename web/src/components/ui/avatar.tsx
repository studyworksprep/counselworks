import { cn } from "@/lib/utils";
import { getInitials } from "@/lib/utils";

interface AvatarProps {
  firstName: string;
  lastName: string;
  imageUrl?: string | null;
  size?: "sm" | "md" | "lg";
  className?: string;
}

const sizeStyles = {
  sm: "h-8 w-8 text-xs",
  md: "h-10 w-10 text-sm",
  lg: "h-14 w-14 text-lg",
};

export function Avatar({
  firstName,
  lastName,
  imageUrl,
  size = "md",
  className,
}: AvatarProps) {
  const initials = getInitials(firstName, lastName);

  if (imageUrl) {
    return (
      // Avatars are small fixed-size images from external auth providers;
      // next/image optimization would require a remote-host allowlist for no
      // real gain at these dimensions.
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={imageUrl}
        alt={`${firstName} ${lastName}`}
        className={cn(
          "rounded-full object-cover",
          sizeStyles[size],
          className
        )}
      />
    );
  }

  return (
    <div
      className={cn(
        "flex items-center justify-center rounded-full bg-primary-100 font-medium text-primary-700",
        sizeStyles[size],
        className
      )}
    >
      {initials}
    </div>
  );
}
