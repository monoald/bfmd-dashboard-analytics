"use client";

import { useActionState } from "react";
import { login } from "@/lib/auth/actions";
import { CARD_CLASS } from "@/components/analytics/theme";

const initialState: { error?: string } = {};

export function LoginForm({ next }: { next: string }) {
  const [state, formAction, pending] = useActionState(login, initialState);

  return (
    <form
      action={formAction}
      className={`${CARD_CLASS} flex w-full max-w-sm flex-col gap-4`}
    >
      <input type="hidden" name="next" value={next} />

      <div className="flex flex-col gap-1.5">
        <label
          htmlFor="username"
          className="text-[11px] font-bold uppercase tracking-[0.08em] text-(--analytics-t2)"
        >
          Username
        </label>
        <input
          id="username"
          name="username"
          autoComplete="username"
          required
          className="rounded-md border border-(--analytics-border) bg-(--analytics-bg) px-3 py-2 text-[13px] text-(--analytics-t1)"
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label
          htmlFor="password"
          className="text-[11px] font-bold uppercase tracking-[0.08em] text-(--analytics-t2)"
        >
          Password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          className="rounded-md border border-(--analytics-border) bg-(--analytics-bg) px-3 py-2 text-[13px] text-(--analytics-t1)"
        />
      </div>

      {state?.error ? (
        <p role="alert" className="text-[12px] text-(--analytics-down)">
          {state.error}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-(--analytics-accent) px-3 py-2 text-[13px] font-semibold text-white disabled:opacity-60"
      >
        {pending ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}
