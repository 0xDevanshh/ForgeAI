import { AuthForm } from "@/components/auth/auth-form";

export const metadata = {
  title: "Create an account · Codebase Copilot",
};

export default function SignupPage() {
  return (
    <div className="space-y-8">
      <div className="space-y-2">
        <h2 className="text-xl lg:text-2xl">Create your account</h2>
        <p className="text-foreground-secondary">
          Connect a repository and start asking questions.
        </p>
      </div>

      <AuthForm mode="signup" />
    </div>
  );
}
