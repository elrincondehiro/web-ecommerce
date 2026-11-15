// Clases del botón (shadcn-svelte «vega», adaptadas en la Fase D). Se usan en los .astro con
// `class={buttonVariants({ variant, size })}`: el botón es HTML nativo (<button>, <a>), sin
// componente. Antes vivían en button.svelte (se quitó Svelte en la fase 13).
import { tv, type VariantProps } from "tailwind-variants";

export const buttonVariants = tv({
  base: "focus-visible:border-ring focus-visible:ring-ring/50 aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive dark:aria-invalid:border-destructive/50 rounded-md border-2 border-line text-sm font-bold shadow-sm focus-visible:ring-3 aria-invalid:ring-3 hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-xs active:not-aria-[haspopup]:translate-x-[3px] active:not-aria-[haspopup]:translate-y-[3px] active:not-aria-[haspopup]:shadow-none motion-reduce:transition-none [&_svg:not([class*='size-'])]:size-4 group/button inline-flex shrink-0 items-center justify-center whitespace-nowrap transition-all outline-none select-none disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0",
  variants: {
    variant: {
      // Fase D (hover 4 elegido en la comparación del bloque 2): se hunde a medio camino (2px, sombra xs) y el color cambia
      // de forma visible (mezcla con el texto, global.css .btn-hover-*).
      default: "bg-primary text-primary-foreground btn-hover-primary",
      outline:
        "bg-card text-foreground btn-hover-outline aria-expanded:bg-secondary aria-expanded:text-secondary-foreground",
      secondary:
        "bg-secondary text-secondary-foreground btn-hover-secondary aria-expanded:bg-secondary aria-expanded:text-secondary-foreground",
      ghost:
        "border-transparent shadow-none hover:translate-0 hover:shadow-none hover:bg-secondary hover:text-secondary-foreground aria-expanded:bg-muted aria-expanded:text-foreground active:translate-0",
      destructive:
        "bg-destructive text-destructive-foreground btn-hover-destructive focus-visible:ring-destructive/40",
      link: "border-transparent shadow-none text-primary underline-offset-4 hover:translate-0 hover:shadow-none hover:underline active:translate-0",
    },
    size: {
      default:
        "h-9 gap-1.5 px-2.5 in-data-[slot=button-group]:rounded-md has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2",
      xs: "h-6 gap-1 rounded-[min(var(--radius-md),8px)] px-2 text-xs in-data-[slot=button-group]:rounded-md has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&_svg:not([class*='size-'])]:size-3",
      sm: "h-8 gap-1 rounded-[min(var(--radius-md),10px)] px-2.5 in-data-[slot=button-group]:rounded-md has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5",
      lg: "h-10 gap-1.5 px-2.5 has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2",
      icon: "size-9",
      "icon-xs":
        "size-6 rounded-[min(var(--radius-md),8px)] in-data-[slot=button-group]:rounded-md [&_svg:not([class*='size-'])]:size-3",
      "icon-sm":
        "size-8 rounded-[min(var(--radius-md),10px)] in-data-[slot=button-group]:rounded-md",
      "icon-lg": "size-10",
    },
  },
  defaultVariants: {
    variant: "default",
    size: "default",
  },
});

export type ButtonVariant = VariantProps<typeof buttonVariants>["variant"];
export type ButtonSize = VariantProps<typeof buttonVariants>["size"];
