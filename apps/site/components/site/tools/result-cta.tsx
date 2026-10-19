import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { signUpHref, type ToolSlug } from '@/lib/tools';

/** The sign-up nudge right under a result, on a hairline. Its words depend on the outcome. */
export function ResultCta({ tool, title, body }: { tool: ToolSlug; title: string; body: string }) {
  return (
    <div className="flex flex-col gap-5 border-t pt-8 sm:flex-row sm:items-end sm:gap-10">
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <p className="text-title font-light text-balance">{title}</p>
        <p className="max-w-lg text-[15px] text-pretty text-muted-foreground">{body}</p>
      </div>
      <Button asChild variant="dark" size="lg" className="w-fit">
        <Link href={signUpHref('tool_result', tool)}>Start free</Link>
      </Button>
    </div>
  );
}
