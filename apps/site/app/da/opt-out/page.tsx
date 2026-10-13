import type { Metadata } from 'next';
import Link from 'next/link';
import { LanguageLink } from '@/components/site/legal';
import { OptOutForm } from '@/components/site/opt-out-form';
import { Container, PageHeader } from '@/components/site/section';
import { site } from '@/lib/site';

export const metadata: Metadata = {
  title: 'Fravælg nvoke',
  description:
    'Fjern din e-mailadresse eller hele dit domæne fra nvoke. Med det samme, uden bekræftelse, og vi indsamler det aldrig igen.',
  alternates: { canonical: '/da/opt-out', languages: { en: '/opt-out', da: '/da/opt-out' } },
};

export default function OptOutPageDa() {
  return (
    <div lang="da">
      <PageHeader
        title="Fravælg nvoke"
        intro="Skriv din e-mailadresse eller din virksomheds domæne. Vi sletter det, vi har, med det samme og indsamler det aldrig igen. Ingen konto. Ingen bekræftelsesmail."
      >
        <LanguageLink alternate={{ href: '/opt-out', lang: 'en', label: 'English' }} />
      </PageHeader>
      <Container className="pb-24 sm:pb-36">
        <div className="mx-auto flex max-w-xl flex-col gap-12">
          <OptOutForm lang="da" />
          <div className="flex flex-col gap-4 text-[17px] leading-relaxed text-pretty text-muted-foreground [&_a]:text-foreground [&_a]:underline [&_a]:decoration-foreground/30 [&_a]:underline-offset-4 [&_a:hover]:decoration-foreground [&_h2]:text-xl [&_h2]:font-semibold [&_h2]:tracking-[-0.02em] [&_h2]:text-foreground">
            <h2>Hvad der sker</h2>
            <p>
              En e-mailadresse slettes fra vores fælles cache og fra alle nvoke-kunders søgeresultater, og nvoke
              indsamler den ikke igen. Et domæne dækker alle adresser på domænet og dets underdomæner, og nvokebot holder
              op med at besøge sitet. Fælles mailudbydere som gmail.com kan ikke fravælges som et helt domæne, fordi
              det ville skjule alle virksomheder, der bruger dem. Fravælg i stedet din egen adresse.
            </p>
            <p>
              Fravalget er permanent. For at huske dit valg gemmer vi kun en envejs-hash (sha256) af adressen eller
              domænet. Med hashen kan vi genkende adressen, hvis vi støder på den igen, men den kan ikke regnes tilbage
              til adressen.
            </p>
            <p>
              Siden viser den samme besked, uanset om vi havde noget eller ej. Ingen kan bruge den til at lure, hvilke
              adresser der er i nvoke.
            </p>
            <h2 className="mt-4">Andre henvendelser</h2>
            <p>
              Vil du se, hvad vi har om dig, have det rettet eller gøre indsigelse mod vores behandling, så skriv til{' '}
              <a href={`mailto:${site.email.privacy}`}>{site.email.privacy}</a>. Vi svarer inden for en måned.{' '}
              <Link href="/da/privacy">Privatlivspolitikken</Link> forklarer, hvad vi indsamler og hvorfor, og{' '}
              <Link href="/bot" hrefLang="en">
                nvokebot-siden
              </Link>{' '}
              (på engelsk) forklarer, hvordan du blokerer vores crawler med robots.txt.
            </p>
            <p>
              En kunde kan have eksporteret en fil, før du fravalgte. Vi kan ikke slette kopier uden for nvoke, men vores
              vilkår kræver, at kunderne respekterer indsigelser. Du kan også gøre indsigelse direkte over for den, der
              kontakter dig.
            </p>
          </div>
        </div>
      </Container>
    </div>
  );
}
