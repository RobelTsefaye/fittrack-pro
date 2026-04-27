"use client"

import { Button as ButtonPrimitive } from "@base-ui/react/button"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"

const buttonVariants = cva(
  [
    /* Base */
    "group/button inline-flex shrink-0 items-center justify-center gap-1.5 whitespace-nowrap",
    "text-sm font-medium select-none",
    "rounded-xl border border-transparent bg-clip-padding",
    /* Transitions — Apple-like snappy feel */
    "transition-[transform,background-color,border-color,color,opacity,box-shadow]",
    "duration-150 [transition-timing-function:var(--ease-out)]",
    /* Focus */
    "outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
    /* Press — scale down slightly like native buttons */
    "active:not-aria-[haspopup]:scale-[0.97]",
    /* Disabled */
    "disabled:pointer-events-none disabled:opacity-40",
    /* Icons */
    "[&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  ].join(" "),
  {
    variants: {
      variant: {
        /* Filled — primary CTA */
        default:
          "bg-primary text-primary-foreground shadow-sm shadow-black/10 hover:opacity-90 active:opacity-80",
        /* Tinted — secondary action (amber tint in dark) */
        secondary:
          "bg-primary/10 text-primary hover:bg-primary/15 dark:bg-primary/15 dark:text-primary dark:hover:bg-primary/20",
        /* Outline */
        outline:
          "border-border bg-card text-foreground shadow-sm shadow-black/5 hover:bg-muted/60 dark:bg-card dark:hover:bg-muted/30",
        /* Ghost — low emphasis */
        ghost:
          "text-foreground/70 hover:bg-[var(--sys-fill)] hover:text-foreground dark:hover:bg-[var(--sys-fill)]",
        /* Destructive — red tinted */
        destructive:
          "bg-destructive/10 text-destructive hover:bg-destructive/15 dark:bg-destructive/15 dark:hover:bg-destructive/20",
        /* Link */
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        xs:      "h-6  gap-1   rounded-lg  px-2   text-xs   [&_svg:not([class*='size-'])]:size-3",
        sm:      "h-8  gap-1.5 rounded-xl  px-3   text-sm",
        default: "h-10 gap-1.5 rounded-xl  px-4   text-sm",
        lg:      "h-11 gap-2   rounded-2xl px-5   text-[0.9375rem] font-semibold",
        icon:    "size-9  rounded-xl",
        "icon-xs":  "size-7  rounded-lg  [&_svg:not([class*='size-'])]:size-3.5",
        "icon-sm":  "size-8  rounded-xl",
        "icon-lg":  "size-11 rounded-2xl",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  }
)

function Button({
  className,
  variant = "default",
  size = "default",
  ...props
}: ButtonPrimitive.Props & VariantProps<typeof buttonVariants>) {
  return (
    <ButtonPrimitive
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
