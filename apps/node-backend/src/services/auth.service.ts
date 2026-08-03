import bcrypt from "bcrypt";
import type { User } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { AppError } from "../middleware/errorHandler";

const BCRYPT_COST_FACTOR = 12;
const MAX_FAILED_LOGIN_ATTEMPTS = 5;
const LOCKOUT_DURATION_MS = 15 * 60 * 1000;
const INVALID_CREDENTIALS_MESSAGE = "Invalid email or password";

// Precomputed once at startup. On an "email not found" attempt we compare
// against this instead of skipping straight to rejection, so that path takes
// about as long as a real account with a wrong password — otherwise response
// time alone would reveal whether an email is registered.
const DUMMY_PASSWORD_HASH = bcrypt.hashSync("not-a-real-account-timing-guard", BCRYPT_COST_FACTOR);

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, BCRYPT_COST_FACTOR);
}

export async function comparePassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

function formatLockoutMessage(lockedUntil: Date): string {
  const remainingMinutes = Math.max(1, Math.ceil((lockedUntil.getTime() - Date.now()) / 60_000));
  const unit = remainingMinutes === 1 ? "minute" : "minutes";
  return `Account is locked due to too many failed login attempts. Try again in ${remainingMinutes} ${unit}.`;
}

async function recordFailedLogin(user: User): Promise<void> {
  const failedLoginCount = user.failedLoginCount + 1;
  const lockedUntil =
    failedLoginCount >= MAX_FAILED_LOGIN_ATTEMPTS ? new Date(Date.now() + LOCKOUT_DURATION_MS) : null;

  await prisma.user.update({
    where: { id: user.id },
    data: { failedLoginCount, lockedUntil },
  });
}

async function resetFailedLogins(user: User): Promise<void> {
  if (user.failedLoginCount === 0 && user.lockedUntil === null) {
    return;
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { failedLoginCount: 0, lockedUntil: null },
  });
}

// Looks up the user, enforces the account lockout, verifies the password,
// and updates failedLoginCount/lockedUntil accordingly. Throws AppError on
// any rejection path — callers should let it propagate to the error handler
// rather than inspecting the failure reason, since the whole point is that
// email-not-found and wrong-password are indistinguishable to the caller.
export async function authenticateUser(email: string, plainPassword: string): Promise<User> {
  const user = await prisma.user.findUnique({ where: { email } });

  if (!user) {
    await bcrypt.compare(plainPassword, DUMMY_PASSWORD_HASH);
    throw new AppError(INVALID_CREDENTIALS_MESSAGE, 401);
  }

  if (user.lockedUntil && user.lockedUntil.getTime() > Date.now()) {
    // Locked accounts short-circuit before touching bcrypt at all: checking
    // the password here would burn compute on an attempt we already know is
    // rejected, and would reopen the timing side-channel handled above.
    throw new AppError(formatLockoutMessage(user.lockedUntil), 423);
  }

  const passwordMatches = await comparePassword(plainPassword, user.passwordHash);

  if (!passwordMatches) {
    await recordFailedLogin(user);
    throw new AppError(INVALID_CREDENTIALS_MESSAGE, 401);
  }

  await resetFailedLogins(user);

  return user;
}
