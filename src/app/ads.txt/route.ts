import { ADSENSE_CLIENT } from "@/lib/ads";

// AdSense requires /ads.txt to list the publisher. f08c47fec0942fa0 is Google's fixed certification authority ID.
export function GET() {
  const pub = ADSENSE_CLIENT.replace(/^ca-/, "");
  const body = pub ? `google.com, ${pub}, DIRECT, f08c47fec0942fa0\n` : "";
  return new Response(body, { headers: { "Content-Type": "text/plain; charset=utf-8" } });
}
