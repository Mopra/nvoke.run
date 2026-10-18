import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { signUpHref, type ToolSlug } from '@/lib/tools';

/** The sign-up nudge right under a result. Its words depend on the outcome. */
export function ResultCta({ tool, title, body }: { tool: ToolSlug; title: string; body: string }) {
  return (
    <div className="flex flex-col gap-5 border-y py-6 sm:flex-row sm:items-center sm:gap-8">
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <p className="text-[21px] leading-tight font-light tracking-[-0.02em] text-balance">{title}</p>
        <p className="text-[15px] text-pretty text-muted-foreground">{body}</p>
      </div>
      {/* Dark: the orange key on this view is the tool's own. */}
      <Button asChild variant="dark" size="lg" className="w-fit">
        <Link href={signUpHref('tool_result', tool)}>Start free</Link>
      </Button>
    </div>
  );
}
