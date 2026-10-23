import { CrushForm } from "@/components/inbox/crush-form";

export default async function PublicCrush({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return <CrushForm slug={slug.toLowerCase()} />;
}
