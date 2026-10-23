import { SendForm } from "@/components/inbox/send-form";

export default async function PublicInbox({ params }: { params: Promise<{ handle: string }> }) {
  const { handle } = await params;
  return <SendForm handle={handle.toLowerCase()} />;
}
