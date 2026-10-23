export function SetupNotice() {
  return (
    <div className="surface-raised mx-auto max-w-lg rounded-2xl p-6 text-left">
      <h2 className="font-heading text-3xl">Almost there — connect Supabase</h2>
      <p className="mt-2 text-sm text-muted-foreground">
        Create <code className="rounded bg-white/10 px-1.5 py-0.5">.env.local</code> with your project keys, run the SQL in{" "}
        <code className="rounded bg-white/10 px-1.5 py-0.5">supabase/migrations</code>, enable anonymous sign-ins, then
        restart the dev server. The README has the 5-minute walkthrough.
      </p>
      <pre className="mt-4 overflow-x-auto rounded-2xl bg-black/50 p-4 text-xs text-orchid">
        {`NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...`}
      </pre>
    </div>
  );
}
