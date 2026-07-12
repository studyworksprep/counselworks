import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { ClerkProvider } from "@clerk/nextjs";
import { ConfirmDialogProvider } from "@/components/ui/confirm-dialog";
import { ToastProvider } from "@/components/ui/toast";
import "./globals.css";

// Brand typeface (fix plan 9.1) — self-hosted at build time by next/font.
const inter = Inter({ subsets: ["latin"], display: "swap" });

export const metadata: Metadata = {
  title: "CounselWorks - College Counseling Platform",
  description:
    "Professional college counseling operations platform for managing students, applications, and workflows.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ClerkProvider
      signInUrl="/sign-in"
      signUpUrl="/sign-up"
      signInFallbackRedirectUrl="/dashboard"
      signUpFallbackRedirectUrl="/dashboard"
    >
      <html lang="en" className={inter.className}>
        <body className="min-h-screen">
          <ToastProvider>
            <ConfirmDialogProvider>{children}</ConfirmDialogProvider>
          </ToastProvider>
        </body>
      </html>
    </ClerkProvider>
  );
}
