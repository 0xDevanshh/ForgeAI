"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";

import { FormField } from "@/components/auth/form-field";
import { PasswordStrength } from "@/components/auth/password-strength";
import { Button } from "@/components/ui/button";
import { normalizeApiError } from "@/lib/api-client";
import { useAuth } from "@/lib/auth-context";
import {
  collectFieldErrors,
  loginSchema,
  signupSchema,
  type FieldErrors,
} from "@/lib/validation";

type Mode = "login" | "signup";

interface Fields {
  email: string;
  password: string;
}

const COPY: Record<
  Mode,
  {
    submit: string;
    submitting: string;
    passwordLabel: string;
    passwordAutoComplete: string;
    footerPrompt: string;
    footerAction: string;
    footerHref: string;
  }
> = {
  login: {
    submit: "Sign in",
    submitting: "Signing in…",
    passwordLabel: "Password",
    passwordAutoComplete: "current-password",
    footerPrompt: "New here?",
    footerAction: "Create an account",
    footerHref: "/signup",
  },
  signup: {
    submit: "Create account",
    submitting: "Creating your account…",
    passwordLabel: "Choose a password",
    passwordAutoComplete: "new-password",
    footerPrompt: "Already have an account?",
    footerAction: "Sign in",
    footerHref: "/login",
  },
};

/**
 * Translates the API's response into the product's voice. The server's own
 * messages are deliberately vague in places (to avoid leaking which emails are
 * registered) and that vagueness is preserved here on purpose.
 */
function messageForError(error: unknown, mode: Mode): string {
  const { status, message, retryAfter } = normalizeApiError(error);

  if (status === 401) {
    return "That email or password didn't match.";
  }
  if (status === 409) {
    // Never "that email is taken" — that would hand an attacker an account
    // enumeration oracle the backend specifically refuses to provide.
    return "We couldn't create an account with those details. Try signing in instead.";
  }
  if (status === 429) {
    const minutes = retryAfter ? Math.max(1, Math.ceil(retryAfter / 60)) : null;
    return minutes
      ? `Too many attempts. Try again in ${minutes} ${minutes === 1 ? "minute" : "minutes"}.`
      : "Too many attempts. Try again in a few minutes.";
  }
  if (status === 423) {
    // Carries the real remaining-lockout time, so it's more useful than
    // anything generic written here.
    return message;
  }
  if (status === 400) {
    return "Check the details above and try again.";
  }
  return mode === "login"
    ? `We couldn't sign you in. ${message}`
    : `We couldn't create your account. ${message}`;
}

export function AuthForm({ mode }: { mode: Mode }) {
  const router = useRouter();
  const { login, signup } = useAuth();
  const copy = COPY[mode];

  const [fields, setFields] = React.useState<Fields>({ email: "", password: "" });
  const [fieldErrors, setFieldErrors] = React.useState<FieldErrors<Fields>>({});
  const [formError, setFormError] = React.useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  function update(name: keyof Fields, value: string) {
    setFields((prev) => ({ ...prev, [name]: value }));
    // Clearing as they type avoids an error persisting under a field they've
    // already fixed.
    setFieldErrors((prev) => (prev[name] ? { ...prev, [name]: undefined } : prev));
    setFormError(null);
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);

    const schema = mode === "login" ? loginSchema : signupSchema;
    const parsed = schema.safeParse(fields);

    if (!parsed.success) {
      setFieldErrors(collectFieldErrors<Fields>(parsed.error));
      return;
    }

    setFieldErrors({});
    setIsSubmitting(true);

    try {
      const submit = mode === "login" ? login : signup;
      // parsed.data carries the trimmed + lowercased email, matching what the
      // server stores.
      await submit(parsed.data.email, parsed.data.password);
      // Client-side navigation — no full reload, so the shell transition stays
      // smooth.
      router.push("/repos");
    } catch (error) {
      const { status, details } = normalizeApiError(error);

      // Surface server-side validation against the fields themselves rather
      // than as one opaque banner.
      if (status === 400 && details?.length) {
        const mapped: FieldErrors<Fields> = {};
        for (const detail of details) {
          if (detail.field === "email" || detail.field === "password") {
            mapped[detail.field] ??= detail.message;
          }
        }
        setFieldErrors(mapped);
      }

      setFormError(messageForError(error, mode));
      setIsSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-6">
      <FormField
        label="Email"
        name="email"
        type="email"
        inputMode="email"
        autoComplete="email"
        placeholder="you@company.com"
        value={fields.email}
        error={fieldErrors.email}
        onChange={(e) => update("email", e.target.value)}
        disabled={isSubmitting}
      />

      <FormField
        label={copy.passwordLabel}
        name="password"
        type="password"
        autoComplete={copy.passwordAutoComplete}
        placeholder="••••••••"
        value={fields.password}
        error={fieldErrors.password}
        onChange={(e) => update("password", e.target.value)}
        disabled={isSubmitting}
        hint={mode === "signup" ? <PasswordStrength password={fields.password} /> : undefined}
      />

      {formError ? (
        <p role="alert" className="text-sm text-danger">
          {formError}
        </p>
      ) : null}

      <Button type="submit" className="w-full" disabled={isSubmitting}>
        {isSubmitting ? (
          <>
            <Loader2 className="motion-only animate-spin" aria-hidden />
            {copy.submitting}
          </>
        ) : (
          copy.submit
        )}
      </Button>

      <p className="text-sm text-foreground-secondary">
        {copy.footerPrompt}{" "}
        <Link
          href={copy.footerHref}
          className="text-brand underline-offset-4 hover:underline"
        >
          {copy.footerAction}
        </Link>
      </p>
    </form>
  );
}
