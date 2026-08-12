import { z } from "zod";

/**
 * Mirrors apps/node-backend/src/validators/auth.validator.ts. Client-side
 * validation is a UX affordance only — the server re-validates every field,
 * and these rules exist to catch mistakes before a round trip, not to be
 * trusted.
 */

/**
 * The signup password policy, as data. Both the zod schema and the strength
 * meter derive from this list, so a rule can never be enforced without also
 * being shown to the user (or vice versa).
 */
export const PASSWORD_RULES = [
  { id: "length", label: "8 characters or more", test: (v: string) => v.length >= 8 },
  { id: "uppercase", label: "An uppercase letter", test: (v: string) => /[A-Z]/.test(v) },
  { id: "lowercase", label: "A lowercase letter", test: (v: string) => /[a-z]/.test(v) },
  { id: "number", label: "A number", test: (v: string) => /[0-9]/.test(v) },
  { id: "special", label: "A special character", test: (v: string) => /[^A-Za-z0-9]/.test(v) },
] as const;

export function countMetRules(password: string): number {
  return PASSWORD_RULES.filter((rule) => rule.test(password)).length;
}

const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(1, "Enter your email address.")
  .email("That doesn't look like an email address.")
  .max(255, "That email address is too long.");

export const loginSchema = z.object({
  email: emailSchema,
  // Login only needs to prove a password was typed — the signup policy is
  // deliberately not applied here, matching the server.
  password: z.string().min(1, "Enter your password."),
});

export const signupSchema = z.object({
  email: emailSchema,
  password: z
    .string()
    .min(1, "Choose a password.")
    // One summary message rather than five stacked errors: the strength meter
    // below the field already names exactly which rules are unmet.
    .refine((v) => countMetRules(v) === PASSWORD_RULES.length, {
      message: "Your password doesn't meet all the requirements yet.",
    }),
});

export type LoginInput = z.infer<typeof loginSchema>;
export type SignupInput = z.infer<typeof signupSchema>;

/** Field-keyed errors, shaped for rendering directly under each input. */
export type FieldErrors<T> = Partial<Record<keyof T, string>>;

export function collectFieldErrors<T>(error: z.ZodError): FieldErrors<T> {
  const errors: Record<string, string> = {};
  for (const issue of error.issues) {
    const field = issue.path[0];
    // First issue per field wins — stacking messages under one input is noise.
    if (typeof field === "string" && !errors[field]) {
      errors[field] = issue.message;
    }
  }
  return errors as FieldErrors<T>;
}
