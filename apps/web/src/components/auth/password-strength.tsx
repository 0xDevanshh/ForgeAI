import { Check } from "lucide-react";

import { PASSWORD_RULES, countMetRules } from "@/lib/validation";
import { cn } from "@/lib/utils";

const TOTAL = PASSWORD_RULES.length;

/** Thresholds map met-rule count onto the status ramp. */
function strengthOf(met: number) {
  if (met === TOTAL) return { label: "Strong", fill: "bg-success", text: "text-success" };
  if (met >= 3) return { label: "Getting there", fill: "bg-warning", text: "text-warning" };
  return { label: "Too weak", fill: "bg-danger", text: "text-danger" };
}

export function PasswordStrength({ password }: { password: string }) {
  // Nothing typed yet — showing "Too weak" against an empty field would be
  // scolding the user before they've done anything.
  if (password.length === 0) return null;

  const met = countMetRules(password);
  const strength = strengthOf(met);

  return (
    <div className="space-y-2 pt-1">
      <div className="flex items-center gap-3">
        <div className="flex flex-1 gap-1" aria-hidden>
          {PASSWORD_RULES.map((rule, index) => (
            <span
              key={rule.id}
              className={cn(
                "h-1 flex-1 rounded-full transition-colors duration-base ease-out",
                index < met ? strength.fill : "bg-strong"
              )}
            />
          ))}
        </div>
        <span className={cn("font-mono text-xs", strength.text)}>{strength.label}</span>
      </div>

      <ul className="grid grid-cols-1 gap-1 sm:grid-cols-2" aria-live="polite">
        {PASSWORD_RULES.map((rule) => {
          const passed = rule.test(password);
          return (
            <li
              key={rule.id}
              className={cn(
                "flex items-center gap-1.5 text-xs transition-colors duration-base ease-out",
                passed ? "text-success" : "text-foreground-muted"
              )}
            >
              {passed ? (
                <Check className="size-3 shrink-0" aria-hidden />
              ) : (
                // A dot rather than a red cross: unmet rules are "not yet",
                // not errors.
                <span className="size-3 shrink-0 text-center leading-3" aria-hidden>
                  ·
                </span>
              )}
              <span>{rule.label}</span>
              <span className="sr-only">{passed ? " — met" : " — not met yet"}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
