import { aiConfigured } from "@/lib/ai/generate";
import { getSource } from "@/lib/data/source";
import { Chat } from "@/components/chat";

export const dynamic = "force-dynamic";
export const metadata = { title: "Ask" };

export default async function AskPage() {
  const source = await getSource();
  return (
    <>
      <h1 className="sr-only">Ask</h1>
      <Chat ready={aiConfigured()} demo={source.mode === "demo"} />
    </>
  );
}
