import { LoginForm } from "@/components/auth/LoginForm";
import { resolveSafeNextPath } from "@/lib/auth/safe-redirect";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;

  return (
    <div className="flex min-h-screen items-center justify-center bg-(--analytics-bg) p-6">
      <div className="flex w-full max-w-sm flex-col items-center gap-6">
        <div className="text-center">
          <div className="text-sm font-bold tracking-tight text-(--analytics-t1)">
            Analytics
          </div>
          <div className="text-[11px] text-(--analytics-t2)">
            Black Forest Supplements
          </div>
        </div>
        <LoginForm next={resolveSafeNextPath(next)} />
      </div>
    </div>
  );
}
