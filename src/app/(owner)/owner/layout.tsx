"use client";

import { AppShell } from "@/components/layouts/app-shell";
import { ownerConfig } from "@/lib/roles/owner-config";

export default function OwnerLayout({ children }: { children: React.ReactNode }) {
  return <AppShell config={ownerConfig}>{children}</AppShell>;
}
