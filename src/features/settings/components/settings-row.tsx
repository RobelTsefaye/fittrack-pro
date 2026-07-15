"use client";

import { useState, type ReactNode } from "react";
import Link from "@/components/app-link";
import { ChevronRight, type LucideIcon } from "lucide-react";

type Props = { icon: LucideIcon; label: string; href?: string; onClick?: () => void; trailing?: ReactNode };

export function SettingsRow({ icon: Icon, label, href, onClick, trailing }: Props) {
  const [pressed, setPressed] = useState(false);
  const content = <><span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary"><Icon className="h-4 w-4" strokeWidth={1.8} /></span><span className="flex-1 text-left text-[0.9375rem] font-medium">{label}</span>{trailing ?? <ChevronRight className="h-4 w-4 shrink-0 text-[var(--sys-label3)]" />}</>;
  const style = { backgroundColor: pressed ? "var(--sys-fill)" : undefined };
  if (href) return <Link href={href} onClick={() => setPressed(true)} className="ios-row w-full" style={style}>{content}</Link>;
  return <button type="button" onClick={() => { setPressed(true); onClick?.(); window.setTimeout(() => setPressed(false), 180); }} className="ios-row w-full" style={style}>{content}</button>;
}
