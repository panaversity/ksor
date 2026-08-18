/**
 * Sheet — the mobile navigation drawer, a thin shadcn-style wrapper over Radix's
 * dialog primitive (focus trap, scroll lock, Escape, the `data-state` the
 * animation utilities ride on).
 *
 * Ported from the predecessor's `components/ui/sheet.tsx`, minus what this
 * shell does not open: the four `side` variants are one (`right`, the only one
 * the navbar uses), so `class-variance-authority` does not come with it, and
 * the built-in close button is gone because the navbar draws its own inside the
 * sheet header. Header/Footer/Description wrappers went the same way — a
 * one-line `<div>` re-exported is not a component.
 *
 * It exists because owning the navbar means owning the mobile menu: this shell
 * never mounts Docusaurus's own mobile sidebar (see ../../theme/Navbar), so
 * without a drawer a phone has no navigation at all.
 */
import * as SheetPrimitive from "@radix-ui/react-dialog";
import * as React from "react";

import { cn } from "../../cn";

export const Sheet = SheetPrimitive.Root;
export const SheetTrigger = SheetPrimitive.Trigger;
export const SheetClose = SheetPrimitive.Close;

export const SheetTitle = React.forwardRef<
  React.ElementRef<typeof SheetPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof SheetPrimitive.Title>
>(({ className, ...props }, ref) => (
  <SheetPrimitive.Title
    ref={ref}
    className={cn("text-lg font-semibold text-foreground", className)}
    {...props}
  />
));
SheetTitle.displayName = SheetPrimitive.Title.displayName;

export const SheetContent = React.forwardRef<
  React.ElementRef<typeof SheetPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof SheetPrimitive.Content>
>(({ className, children, ...props }, ref) => (
  <SheetPrimitive.Portal>
    <SheetPrimitive.Overlay className="fixed inset-0 z-50 bg-black/60 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:animate-in data-[state=open]:fade-in-0" />
    <SheetPrimitive.Content
      ref={ref}
      className={cn(
        "fixed inset-y-0 right-0 z-50 h-full w-3/4 border-l border-border bg-background shadow-lg transition ease-in-out data-[state=closed]:duration-300 data-[state=open]:duration-500 data-[state=closed]:animate-out data-[state=open]:animate-in data-[state=closed]:slide-out-to-right data-[state=open]:slide-in-from-right sm:max-w-sm",
        className,
      )}
      {...props}
    >
      {children}
    </SheetPrimitive.Content>
  </SheetPrimitive.Portal>
));
SheetContent.displayName = SheetPrimitive.Content.displayName;
