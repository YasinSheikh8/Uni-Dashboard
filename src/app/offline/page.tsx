import { WifiOff } from "lucide-react";
import { EmptyState } from "@/components/ui";

export const metadata = { title: "Offline" };

export default function Offline() {
  return (
    <EmptyState icon={<WifiOff size={28} />} title="You're offline">
      Your Moodle data isn&apos;t stored on this device, so reconnect to see it.
    </EmptyState>
  );
}
