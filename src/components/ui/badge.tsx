import { mergeProps } from "@base-ui/react/merge-props"
import { useRender } from "@base-ui/react/use-render"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"

const badgeVariants = cva(
  [
    "inline-flex h-5 w-fit shrink-0 items-center justify-center gap-1",
    "rounded-full border border-transparent px-2 py-0.5",
    "text-[0.6875rem] font-semibold leading-none tracking-wide whitespace-nowrap",
    "overflow-hidden transition-colors",
    "[&>svg]:pointer-events-none [&>svg]:size-3!",
  ].join(" "),
  {
    variants: {
      variant: {
        /* Filled */
        default:
          "bg-primary text-primary-foreground",
        /* Tinted — uses primary color with low opacity bg */
        secondary:
          "bg-[var(--sys-fill2)] text-foreground border-transparent",
        /* Success green */
        success:
          "bg-green-500/12 text-green-700 dark:bg-green-500/20 dark:text-green-400",
        /* Orange warning */
        warning:
          "bg-amber-500/12 text-amber-700 dark:bg-amber-500/20 dark:text-amber-400",
        /* Destructive */
        destructive:
          "bg-destructive/10 text-destructive dark:bg-destructive/20",
        /* Outline */
        outline:
          "border-border text-muted-foreground",
        ghost:
          "hover:bg-muted hover:text-muted-foreground dark:hover:bg-muted/50",
        link: "text-primary underline-offset-4 hover:underline",
      },
    },
    defaultVariants: { variant: "default" },
  }
)

function Badge({
  className,
  variant = "default",
  render,
  ...props
}: useRender.ComponentProps<"span"> & VariantProps<typeof badgeVariants>) {
  return useRender({
    defaultTagName: "span",
    props: mergeProps<"span">(
      { className: cn(badgeVariants({ variant }), className) },
      props
    ),
    render,
    state: { slot: "badge", variant },
  })
}

export { Badge, badgeVariants }
