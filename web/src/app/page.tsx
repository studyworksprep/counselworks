import Link from "next/link";

export default function HomePage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-br from-primary-600 to-primary-900 text-white">
      <div className="max-w-2xl text-center px-6">
        <h1 className="text-5xl font-bold tracking-tight mb-4">
          CounselWorks
        </h1>
        <p className="text-xl text-primary-100 mb-8">
          The all-in-one platform for professional college counseling firms.
          Manage students, applications, essays, and workflows in one place.
        </p>
        <div className="flex gap-4 justify-center">
          <Link
            href="/sign-in"
            className="rounded-lg bg-white px-6 py-3 text-primary-700 font-semibold hover:bg-primary-50 transition-colors"
          >
            Sign In
          </Link>
          <Link
            href="/sign-up"
            className="rounded-lg border-2 border-white px-6 py-3 font-semibold hover:bg-white/10 transition-colors"
          >
            Get Started
          </Link>
        </div>
      </div>
    </div>
  );
}
