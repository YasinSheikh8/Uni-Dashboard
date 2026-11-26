import { ImageResponse } from "next/og";
import { IconArt } from "@/lib/icon-art";

export const dynamic = "force-static";
export function generateStaticParams() {
  return [{ size: "192" }, { size: "512" }, { size: "maskable" }];
}

export async function GET(_: Request, { params }: { params: Promise<{ size: string }> }) {
  const { size } = await params;
  const px = size === "192" ? 192 : 512;
  return new ImageResponse(<IconArt size={px} padded={size === "maskable"} />, { width: px, height: px });
}
