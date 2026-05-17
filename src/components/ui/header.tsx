"use client";

import { type ReactNode } from "react";
import Link from "next/link";
import { cn } from "@/utils/cn";

export interface HeaderProps {
  logo?: ReactNode;
  logoHref?: string;
  children?: ReactNode;
  rightContent?: ReactNode;
  className?: string;
}

export function Header({ logo, logoHref = "/", children, rightContent, className }: HeaderProps) {
  return (
    <header
      className={cn("sticky top-0 w-full z-40", "bg-primary/80 backdrop-blur-glass", className)}
    >
      {/* Desktop only */}
      <div className="hidden md:flex max-w-7xl mx-auto px-4 h-16 items-center justify-between">
        {/* Logo */}
        <Link href={logoHref} className="flex items-center gap-2">
          {logo || <span className="text-xl font-bold text-white">Avito Drop</span>}
        </Link>

        {/* Navigation */}
        {children && <nav className="flex items-center gap-1">{children}</nav>}

        {/* Right content */}
        {rightContent && <div className="flex items-center gap-3">{rightContent}</div>}
      </div>
    </header>
  );
}

export interface NavLinkProps {
  href: string;
  active?: boolean;
  children: ReactNode;
  className?: string;
}

export function NavLink({ href, active = false, children, className }: NavLinkProps) {
  return (
    <Link
      href={href}
      className={cn(
        "relative px-3 py-2 text-sm font-medium rounded-lg",
        "transition-colors duration-75",
        "active:scale-95 active:opacity-70",
        "focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-blue",
        active ? "text-white" : "text-white/60 hover:text-white hover:bg-white/5",
        className
      )}
    >
      {children}
      {active && <div className="absolute inset-0 bg-white/10 rounded-lg" />}
    </Link>
  );
}

export interface UserMenuProps {
  name: string;
  avatar?: ReactNode;
  balance?: number;
  onLogout?: () => void;
  className?: string;
}

export function UserMenu({ name, avatar, balance, onLogout, className }: UserMenuProps) {
  return (
    <div className={cn("flex items-center gap-3", className)}>
      {balance !== undefined && (
        <div className="hidden sm:block text-right">
          <p className="text-xs text-white/40">Баланс</p>
          <p className="text-sm font-semibold text-white">{balance.toLocaleString("ru-RU")} ₽</p>
        </div>
      )}
      <div className="flex items-center gap-2">
        {avatar || (
          <div className="w-8 h-8 rounded-full bg-accent-blue flex items-center justify-center">
            <span className="text-sm font-medium text-white">{name.charAt(0).toUpperCase()}</span>
          </div>
        )}
        <span className="hidden sm:block text-sm font-medium text-white">{name}</span>
      </div>
      {onLogout && (
        <button
          onClick={onLogout}
          className={cn(
            "p-2 text-white/40 hover:text-white/80",
            "transition-colors duration-200 rounded-lg",
            "focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-blue"
          )}
          aria-label="Выйти"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"
            />
          </svg>
        </button>
      )}
    </div>
  );
}
