"use client";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { ComponentProps } from "react";
import { useCallback } from "react";

export type SuggestionsProps = ComponentProps<"div">;

export const Suggestions = ({
  className,
  children,
  ...props
}: SuggestionsProps) => (
  <div
    className={cn("flex w-full flex-wrap items-stretch gap-2", className)}
    {...props}
  >
    {children}
  </div>
);

export type SuggestionProps = Omit<ComponentProps<typeof Button>, "onClick"> & {
  suggestion: string;
  onClick?: (suggestion: string) => void;
};

export const Suggestion = ({
  suggestion,
  onClick,
  className,
  variant = "outline",
  size = "sm",
  children,
  ...props
}: SuggestionProps) => {
  const handleClick = useCallback(() => {
    onClick?.(suggestion);
  }, [onClick, suggestion]);

  return (
    <Button
      className={cn(
        "h-auto min-h-11 cursor-pointer justify-start rounded-xl border-border/90 bg-card px-3.5 py-2.5 text-left whitespace-normal shadow-[0_2px_8px_rgba(15,35,65,0.04)] transition-[transform,border-color,background-color,box-shadow] hover:-translate-y-px hover:border-primary/35 hover:bg-primary/[0.035] hover:shadow-[0_8px_20px_rgba(15,35,65,0.08)]",
        className
      )}
      onClick={handleClick}
      size={size}
      type="button"
      variant={variant}
      {...props}
    >
      {children || suggestion}
    </Button>
  );
};
