import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cn } from "@/lib/utils";

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "accent" | "outline" | "ghost" | "ink" | "destructive";
  size?: "sm" | "default" | "lg" | "icon";
  asChild?: boolean;
}

/**
 * Button — system-level control.
 * Sharp corners. Dark base. No pill shapes.
 * Orange for primary action. White outline for secondary.
 */
const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "outline", size = "default", asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        ref={ref}
        className={cn(
          // Base — all buttons share these
          "inline-flex items-center justify-center gap-2 font-semibold transition-colors",
          "disabled:opacity-40 disabled:cursor-not-allowed",
          "focus-visible:outline focus-visible:outline-1 focus-visible:outline-accent",
          "active:scale-[0.98]",

          // Variants
          variant === "accent" && [
            "bg-accent text-white hover:bg-accent-600",
            "border border-transparent",
          ],
          variant === "outline" && [
            "bg-transparent text-ink-800 hover:text-white hover:border-[#383838]",
            "border border-[#2A2A2A]",
          ],
          variant === "ghost" && [
            "bg-transparent text-graphite-100 hover:text-white hover:bg-[#1A1A1A]",
            "border border-transparent",
          ],
          variant === "ink" && [
            "bg-[#1A1A1A] text-ink-900 hover:bg-[#222222]",
            "border border-[#2A2A2A]",
          ],
          variant === "destructive" && [
            "bg-bad text-white hover:bg-bad-600",
            "border border-transparent",
          ],

          // Sizes
          size === "sm"      && "h-7 px-3 text-[11px] tracking-wide",
          size === "default" && "h-9 px-4 text-[12px] tracking-wide",
          size === "lg"      && "h-10 px-5 text-[13px] tracking-wide",
          size === "icon"    && "h-8 w-8 p-0",

          className
        )}
        {...props}
      />
    );
  }
);
Button.displayName = "Button";

export { Button };
