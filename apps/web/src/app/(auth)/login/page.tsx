import { AuthForm } from "@/components/auth/auth-form";

export const metadata = {
  title: "Sign in · Codebase Copilot",
};

export default function LoginPage() {
  return (
    <div className="space-y-8">
      <div className="space-y-2">
        <h2 className="text-xl lg:text-2xl">Sign in</h2>
        <p className="text-foreground-secondary">
          Welcome back. Pick up where you left off.
        </p>
      </div>

      <AuthForm mode="login" />
    </div>
  );
}
