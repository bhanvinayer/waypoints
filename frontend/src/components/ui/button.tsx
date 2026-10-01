import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-full font-semibold transition-all duration-200 active:scale-[0.97] disabled:pointer-events-none disabled:opacity-50 select-none",
  {
    variants: {
      variant: {
        accent: "bg-accent text-white shadow-[0_8px_20px_-8px_rgba(232,80,28,0.8)] hover:bg-accent-600",
        ink: "bg-ink text-white hover:bg-ink-700",
        outline: "border border-line bg-white text-ink hover:border-ink-300 hover:bg-sand-100",
        ghost: "text-ink-600 hover:bg-sand-200",
        soft: "bg-accent-50 text-accent-600 hover:bg-accent-100",
        danger: "bg-bad text-white hover:bg-[#b9362a]",
      },
      size: {
        sm: "h-9 px-4 text-[13px]",
        md: "h-11 px-5 text-sm",
        lg: "h-14 px-8 text-base",
        icon: "h-10 w-10",
      },
    },
    defaultVariants: { variant: "ink", size: "md" },
  },
);

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(({ className, variant, size, asChild, ...props }, ref) => {
  const Comp = asChild ? Slot : "button";
  return <Comp ref={ref} className={cn(buttonVariants({ variant, size }), className)} {...props} />;
});
Button.displayName = "Button";
