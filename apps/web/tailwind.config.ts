import type { Config } from "tailwindcss";

/**
 * Every color resolves to an RGB channel triplet declared in globals.css, so
 * alpha modifiers (`bg-surface/60`, `border-strong/40`) keep working while
 * the CSS custom properties stay the single source of truth.
 */
function token(name: string) {
  return `rgb(var(${name}) / <alpha-value>)`;
}

const config: Config = {
  darkMode: ["class"],
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        /* ---- Blueprint tokens ------------------------------------------
           `canvas`, not `base`: a color key named `base` collides with
           Tailwind's `text-base` font-size utility, and the color wins —
           silently turning every `text-base` body string the same color as
           the page background. */
        canvas: token("--bg-base-rgb"),
        surface: token("--bg-surface-rgb"),
        elevated: token("--bg-elevated-rgb"),

        subtle: token("--border-subtle-rgb"),
        strong: token("--border-strong-rgb"),

        foreground: {
          DEFAULT: token("--text-primary-rgb"),
          secondary: token("--text-secondary-rgb"),
          muted: token("--text-muted-rgb"),
        },

        brand: {
          DEFAULT: token("--accent-rgb"),
          hover: token("--accent-hover-rgb"),
          foreground: token("--on-accent-rgb"),
        },

        success: token("--success-rgb"),
        warning: token("--warning-rgb"),
        danger: token("--danger-rgb"),

        agent: {
          architecture: token("--agent-architecture-rgb"),
          bug: token("--agent-bug-rgb"),
          pr: token("--agent-pr-rgb"),
          docs: token("--agent-docs-rgb"),
        },

        code: {
          keyword: token("--code-keyword-rgb"),
          string: token("--code-string-rgb"),
          function: token("--code-function-rgb"),
          number: token("--code-number-rgb"),
          comment: token("--code-comment-rgb"),
        },

        /* ---- shadcn bridge ---------------------------------------------
           shadcn components ship hardcoded class names (bg-background,
           bg-accent, text-muted-foreground...). Aliasing them onto the
           tokens above is what makes stock shadcn inherit this identity.

           Note `accent` here is shadcn's *hover surface*, not our brand
           blue — our blue is `primary`. Mapping the blue onto `accent`
           would light up every menu row on hover. */
        background: token("--bg-base-rgb"),
        card: {
          DEFAULT: token("--bg-surface-rgb"),
          foreground: token("--text-primary-rgb"),
        },
        popover: {
          DEFAULT: token("--bg-elevated-rgb"),
          foreground: token("--text-primary-rgb"),
        },
        primary: {
          DEFAULT: token("--accent-rgb"),
          foreground: token("--on-accent-rgb"),
        },
        secondary: {
          DEFAULT: token("--bg-elevated-rgb"),
          foreground: token("--text-primary-rgb"),
        },
        muted: {
          DEFAULT: token("--bg-surface-rgb"),
          foreground: token("--text-secondary-rgb"),
        },
        accent: {
          DEFAULT: token("--hover-surface-rgb"),
          foreground: token("--text-primary-rgb"),
        },
        destructive: {
          DEFAULT: token("--danger-rgb"),
          foreground: token("--on-accent-rgb"),
        },
        border: token("--border-subtle-rgb"),
        input: token("--border-strong-rgb"),
        ring: token("--accent-rgb"),
      },

      fontFamily: {
        display: ["var(--font-display)"],
        sans: ["var(--font-sans)"],
        mono: ["var(--font-mono)"],
      },

      fontSize: {
        xs: ["var(--text-xs)", { lineHeight: "1.5" }],
        sm: ["var(--text-sm)", { lineHeight: "1.55" }],
        base: ["var(--text-base)", { lineHeight: "var(--leading-body)" }],
        lg: ["var(--text-lg)", { lineHeight: "1.5" }],
        xl: ["var(--text-xl)", { lineHeight: "1.35", letterSpacing: "var(--tracking-tight)" }],
        "2xl": ["var(--text-2xl)", { lineHeight: "1.25", letterSpacing: "var(--tracking-tight)" }],
        "3xl": ["var(--text-3xl)", { lineHeight: "1.18", letterSpacing: "var(--tracking-tight)" }],
        "4xl": ["var(--text-4xl)", { lineHeight: "1.1", letterSpacing: "-0.025em" }],
      },

      letterSpacing: {
        tight: "var(--tracking-tight)",
        wide: "var(--tracking-wide)",
      },

      borderRadius: {
        sm: "var(--radius-sm)",
        md: "var(--radius-md)",
        lg: "var(--radius-lg)",
      },

      boxShadow: {
        sm: "var(--shadow-sm)",
        md: "var(--shadow-md)",
        lg: "var(--shadow-lg)",
      },

      maxWidth: {
        measure: "var(--measure)",
        form: "var(--measure-form)",
      },

      width: {
        sidebar: "var(--sidebar-width)",
      },

      transitionTimingFunction: {
        out: "var(--ease-out)",
      },

      transitionDuration: {
        fast: "var(--duration-fast)",
        base: "var(--duration-base)",
        slow: "var(--duration-slow)",
      },

      keyframes: {
        "accordion-down": {
          from: { height: "0" },
          to: { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to: { height: "0" },
        },
      },

      animation: {
        "accordion-down": "accordion-down var(--duration-base) var(--ease-out)",
        "accordion-up": "accordion-up var(--duration-base) var(--ease-out)",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
};

export default config;
