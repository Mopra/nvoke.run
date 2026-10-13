import type { Metadata } from 'next';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export const metadata: Metadata = { title: 'Download' };

// Placeholder. Links will point at the latest GitHub Release assets once the
// release workflow has published one.
const PLATFORMS = [
  { name: 'Windows', format: 'Installer (.exe)' },
  { name: 'macOS', format: 'Disk image (.dmg)' },
  { name: 'Linux', format: 'AppImage' },
];

export default function DownloadPage() {
  return (
    <section className="mx-auto flex max-w-5xl flex-col gap-8 px-6 py-16">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-semibold tracking-tight">Download</h1>
        <p className="text-muted-foreground">Builds are not published yet.</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        {PLATFORMS.map((p) => (
          <Card key={p.name}>
            <CardHeader>
              <CardTitle>{p.name}</CardTitle>
              <CardDescription>{p.format}</CardDescription>
            </CardHeader>
            <CardContent>
              <Button variant="outline" disabled className="w-full">
                Coming soon
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>
    </section>
  );
}
