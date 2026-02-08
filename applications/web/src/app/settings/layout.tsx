import type { ReactNode } from "react";
import { Nav } from "@/components/nav";
import { SettingsShell } from "@/components/settings/settings-shell";
import { defaultSettingsTab } from "@/config/settings";

const navItems = [
  { label: "Home", href: "/" },
  { label: "Editor", href: "/editor" },
  { label: "Settings", href: defaultSettingsTab.href, match: "/settings" },
];

export default function SettingsLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-col h-screen">
      <Nav items={navItems} />
      <SettingsShell>{children}</SettingsShell>
    </div>
  );
}
