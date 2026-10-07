import * as React from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

interface SheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  eyebrow?: string;
  description?: string;
  children: React.ReactNode;
  tone?: "light" | "dark";
  width?: string;
}

/** Bottom sheet on phones, right-hand drawer on desktop. */
export function Sheet({ open, onOpenChange, title, eyebrow, description, children, tone = "light", width = "md:w-[500px]" }: SheetProps) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[1000] bg-night/45 backdrop-blur-[2px] data-[state=open]:animate-fade-in data-[state=closed]:animate-fade-out" />
        <Dialog.Content
          aria-describedby={description ? undefined : undefined}
          className={cn(
            "fixed z-[1001] flex flex-col shadow-float outline-none",
            "inset-x-0 bottom-0 max-h-[90dvh] rounded-t-[28px] data-[state=open]:animate-sheet-up data-[state=closed]:animate-sheet-down",
            "md:inset-y-0 md:left-auto md:right-0 md:bottom-auto md:max-h-none md:rounded-l-[28px] md:rounded-tr-none md:data-[state=open]:animate-sheet-in md:data-[state=closed]:animate-sheet-out",
            width,
            tone === "dark" ? "bg-night text-white" : "bg-bg text-ink",
          )}
        >
          <div className={cn("flex items-start justify-between gap-4 px-5 pb-3 pt-5", tone === "dark" ? "border-b border-white/10" : "border-b border-line")}>
            <div className="min-w-0">
              {eyebrow && <div className={cn("eyebrow mb-1", tone === "dark" && "!text-white/50")}>{eyebrow}</div>}
              <Dialog.Title className="font-display text-xl font-bold leading-tight">{title}</Dialog.Title>
              {description ? (
                <Dialog.Description className={cn("mt-1 text-sm", tone === "dark" ? "text-white/60" : "text-ink-500")}>{description}</Dialog.Description>
              ) : (
                <Dialog.Description className="sr-only">{title}</Dialog.Description>
              )}
            </div>
            <Dialog.Close
              aria-label="Close"
              className={cn("grid h-9 w-9 shrink-0 place-items-center rounded-full transition", tone === "dark" ? "bg-white/10 hover:bg-white/20" : "bg-white hover:bg-bg-200")}
            >
              <X className="h-4 w-4" />
            </Dialog.Close>
          </div>
          <div className="scroll-thin safe-bottom min-h-0 flex-1 overflow-y-auto px-5 pt-4">{children}</div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
