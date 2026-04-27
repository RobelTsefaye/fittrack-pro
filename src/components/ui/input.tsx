import * as React from "react"
import { Input as InputPrimitive } from "@base-ui/react/input"
import { cn } from "@/lib/utils"

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <InputPrimitive
      type={type}
      data-slot="input"
      className={cn(
        /* Size & shape */
        "h-11 w-full min-w-0 rounded-xl",
        "border border-input bg-card px-3.5 py-2",
        "text-[0.9375rem] text-foreground placeholder:text-muted-foreground/60",
        /* Focus */
        "outline-none transition-[border-color,box-shadow] duration-150",
        "focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/20",
        /* Disabled */
        "disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-40",
        /* Error */
        "aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20",
        /* Dark */
        "dark:bg-card dark:border-border",
        /* File */
        "file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground",
        className
      )}
      {...props}
    />
  )
}

export { Input }
