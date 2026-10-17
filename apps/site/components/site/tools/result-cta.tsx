import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { signUpHref, type ToolSlug } from '@/lib/tools';

/** The sign-up nudge right under a result. Its words depend on the outcome. */
export function ResultCta({ tool, title, body }: { tool: ToolSlug; title: string; body: string }) {
  return (
    <div className="flex flex-col gap-5 rounded-[24px] bg-foreground/[0.04] p-6 sm:flex-row sm:items-center sm:gap-8 sm:p-7">
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <p className="font-display text-lg font-semibold tracking-[-0.018em] text-balance">{title}</p>
        <p className="text-[15px] text-pretty text-muted-foreground">{body}</p>
      </div>
      <Button asChild size="lg" className="w-fit">
        <Link href={signUpHref('tool_result', tool)}>Start free</Link>
      </Button>
    </div>
  );
}
