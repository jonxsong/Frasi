import type { ButtonHTMLAttributes, ReactNode } from "react";
import clsx from "clsx";
import styles from "@/components/studio/Studio.module.css";

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  label: string;
  children: ReactNode;
  variant?: "bare" | "outline" | "accent";
}

export function IconButton({
  label,
  children,
  variant = "outline",
  className,
  ...props
}: IconButtonProps) {
  return (
    <button
      className={clsx(styles.iconButton, styles[`iconButton_${variant}`], className)}
      aria-label={label}
      title={label}
      type="button"
      {...props}
    >
      {children}
    </button>
  );
}
