import { redirect } from "next/navigation";
import { defaultSettingsTab } from "@/config/settings";

export default function SettingsPage() {
  redirect(defaultSettingsTab.href);
}
