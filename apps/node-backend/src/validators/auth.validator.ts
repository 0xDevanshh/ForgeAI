import { z } from "zod";

const signupPasswordSchema = z
  .string()
  .min(8, "Password must be at least 8 characters long")
  .regex(/[A-Z]/, "Password must contain at least one uppercase letter")
  .regex(/[a-z]/, "Password must contain at least one lowercase letter")
  .regex(/[0-9]/, "Password must contain at least one number")
  .regex(/[^A-Za-z0-9]/, "Password must contain at least one special character");

export const signupSchema = z.object({
  email: z
    .string()
    .trim()
    .toLowerCase()
    .email("Invalid email format")
    .max(255, "Email must be at most 255 characters long"),
  password: signupPasswordSchema,
});

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email("Invalid email format"),
  // No complexity rules here — a login attempt only needs to prove the
  // password field was sent, not conform to the signup policy.
  password: z.string().min(1, "Password is required"),
});

export const refreshTokenSchema = z.object({
  // Real refresh happens via the httpOnly cookie (see 2.4); this covers
  // clients that also pass it in the body.
  refreshToken: z.string().min(1, "Refresh token is required"),
});

export type SignupInput = z.infer<typeof signupSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type RefreshTokenInput = z.infer<typeof refreshTokenSchema>;
