import type { Metadata } from 'next';
import Link from 'next/link';
import { CompanyLine, LegalPage } from '@/components/site/legal';
import { site } from '@/lib/site';

// UDKAST. Dansk version af app/privacy/page.tsx. Hold de to sider i takt. Se
// noterne og TODO'erne i den engelske version.

export const metadata: Metadata = {
  title: 'Privatlivspolitik',
  description:
    'Sådan behandler nvoke personoplysninger om sine kunder og om personer, hvis erhvervskontaktoplysninger nvoke finder på offentlige hjemmesider.',
  alternates: { canonical: '/da/privacy', languages: { en: '/privacy', da: '/da/privacy' } },
};

const mail = <a href={`mailto:${site.email.privacy}`}>{site.email.privacy}</a>;

export default function PrivacyPageDa() {
  return (
    <LegalPage
      title="Privatlivspolitik"
      updated="13. oktober 2026"
      lang="da"
      alternate={{ href: '/privacy', lang: 'en', label: 'English' }}
    >
      <section>
        <h2>Hvem vi er</h2>
        <p>
          nvoke er lavet af <CompanyLine lang="da" /> (“vi”), der er dataansvarlig for de personoplysninger, der er beskrevet her.
          Skriv til {mail}, hvis du har spørgsmål til politikken eller til dine oplysninger.
        </p>
        <p>nvoke er et researchværktøj til at finde virksomheder. Det behandler oplysninger om to grupper af personer:</p>
        <ul>
          <li>
            <strong>Kunder</strong>, der bruger nvoke-appen. Se <a href="#kunder">del A</a>.
          </li>
          <li>
            <strong>Personer, hvis erhvervskontaktoplysninger nvoke finder</strong> på offentlige hjemmesider, fx en
            medarbejder, hvis arbejdsmail står på virksomhedens kontaktside. Se <a href="#kontakter">del B</a>. Fandt du
            nvoke, fordi din adresse dukkede op et sted? Så er det din del.
          </li>
        </ul>
      </section>

      <section id="kunder">
        <h2>A. Kunder</h2>
        <h3>Hvad vi indsamler</h3>
        <ul>
          <li>
            <strong>Kontooplysninger:</strong> navn, e-mailadresse og login-oplysninger, som Clerk håndterer.
          </li>
          <li>
            <strong>Betalingsoplysninger:</strong> abonnement, betalingsstatus samt det firmanavn, den adresse og det
            CVR- eller momsnummer, du opgiver til fakturaen. Kortoplysninger håndteres af betalingsudbyderen og når
            aldrig frem til os.
          </li>
          <li>
            <strong>Brugsdata:</strong> de søgninger, du laver, deres resultater, og hvor mange verificerede e-mails du
            har brugt hver måned.
          </li>
          <li>
            <strong>Tekniske data:</strong> enhedsnavn, appversion og styresystem for hver enhed, du er logget ind på,
            og serverlogs med IP-adresser, så tjenesten forbliver sikker og virker.
          </li>
          <li>
            <strong>Henvendelser:</strong> det, du skriver til os på e-mail.
          </li>
        </ul>
        <h3>Formål og retsgrundlag</h3>
        <p>
          For at levere tjenesten efter vores aftale med dig (databeskyttelsesforordningens artikel 6, stk. 1, litra
          b), for at overholde bogføringsloven (litra c) og for at holde tjenesten sikker og forbedre den (litra f).
        </p>
        <h3>Hvor længe vi gemmer dem</h3>
        <ul>
          <li>Konto- og brugsdata: så længe din konto er åben, og op til 12 måneder efter, at du lukker den.</li>
          <li>Søgeresultater: 12 måneder efter søgningen, eller før, hvis du sletter søgningen eller din konto.</li>
          <li>Bogføringsmateriale: 5 år fra udgangen af regnskabsåret, som bogføringsloven kræver.</li>
        </ul>
      </section>

      <section id="kontakter">
        <h2>B. Personer, hvis erhvervskontaktoplysninger nvoke finder</h2>
        <p>
          Denne del er vores oplysning efter databeskyttelsesforordningens artikel 14, til personer, vi ikke har fået
          oplysningerne fra direkte.
        </p>

        <h3>Hvad vi indsamler</h3>
        <ul>
          <li>
            <strong>Virksomhedsoplysninger:</strong> navn, hjemmeside, postadresse, telefonnummer og branche.
          </li>
          <li>
            <strong>E-mailadresser, der står på virksomhedens egen hjemmeside</strong>, med den side, hver adresse blev
            fundet på, og hvornår vi først og sidst så den. De fleste er generelle adresser som info@ eller kontakt@.
            Nogle identificerer en person, fx fornavn@virksomhed.dk.
          </li>
          <li>
            <strong>Resultatet af et postkassetjek:</strong> om adressens mailserver svarer, at den kan modtage post
            (gyldig, ugyldig, catch-all, risikabel eller ukendt).
          </li>
        </ul>
        <p>
          Vi indsamler intet, der kræver login, vi gætter ikke adresser, vi køber ikke lister, og vi indsamler ikke
          følsomme oplysninger som helbred, religion eller politisk overbevisning.
        </p>

        <h3>Hvor oplysningerne kommer fra</h3>
        <ul>
          <li>
            Virksomhedens egen hjemmeside: forsiden og op til syv sider, der typisk indeholder kontaktoplysninger, fx
            kontakt, om os, team, impressum, privatliv og juridiske sider. Vores crawler, nvokebot, følger robots.txt og
            er beskrevet på{' '}
            <Link href="/bot" hrefLang="en">
              nvokebot-siden
            </Link>{' '}
            (på engelsk).
          </li>
          <li>OpenStreetMap (via tjenesterne Nominatim og Overpass), for lokale virksomheder.</li>
          <li>Brave Search, for virksomheder, der matcher et søgeord.</li>
          <li>Product Hunt og Show HN (Hacker News, via Algolias HN Search API), for nylancerede produkter.</li>
          <li>Mailserveren for adressens domæne, til postkassetjekket. Der bliver aldrig sendt en e-mail.</li>
        </ul>
        <p>Spørger du, fortæller vi dig, præcis hvilken side din adresse kom fra.</p>

        <h3>Formål</h3>
        <p>
          At lade vores kunder researche virksomheder, de måske vil samarbejde med: hvem virksomhederne er, og hvordan de
          kan kontaktes via de oplysninger, de selv offentliggør.
        </p>

        <h3>Retsgrundlag, i almindelige ord</h3>
        <p>
          Vi behandler oplysningerne på grundlag af legitim interesse (artikel 6, stk. 1, litra f). Vores og vores
          kunders interesse er at finde virksomheder og de kontaktoplysninger, virksomhederne selv har valgt at
          offentliggøre. Vi har afvejet det mod dine interesser og vurderet, at det er rimeligt, fordi:
        </p>
        <ul>
          <li>vi kun bruger kontaktoplysninger, som en virksomhed har lagt på sin egen hjemmeside, for at blive kontaktet;</li>
          <li>vi kun læser de sider, der typisk har den slags oplysninger, og følger robots.txt;</li>
          <li>vi aldrig logger ind, udfylder formularer eller omgår CAPTCHA eller andre adgangsbegrænsninger;</li>
          <li>en adresse, der identificerer en person, aldrig deles mellem kunder (se nedenfor);</li>
          <li>vi sletter oplysninger efter faste frister, og intet gemmes længere, fordi det bliver søgt frem igen;</li>
          <li>vi aldrig sender e-mail til de adresser, vi finder;</li>
          <li>du kan fravælge med det samme, uden konto, og så indsamler vi aldrig din adresse igen.</li>
        </ul>
        <p>Du kan bede os om et resumé af afvejningen.</p>

        <h3>Hvem der modtager oplysningerne</h3>
        <ul>
          <li>
            <strong>Generelle adresser</strong> (fx info@) på virksomhedens eget domæne gemmes i en fælles cache og kan
            vises i resultaterne for enhver kunde, hvis søgning finder virksomheden. Virksomhedsoplysninger som navn og
            telefonnummer kommer fra de offentlige kilder ovenfor og gemmes med den enkelte kundes søgning.
          </li>
          <li>
            <strong>Adresser, der identificerer en person</strong>, vises kun for den kunde, hvis søgning fandt dem. De
            gemmes sammen med den kundes resultater og genbruges ikke for andre.
          </li>
        </ul>
        <p>
          Kunderne er virksomheder. Hver kunde er selvstændig dataansvarlig for, hvad den gør med resultaterne, og vores{' '}
          <Link href="/terms" hrefLang="en">
            vilkår
          </Link>{' '}
          kræver, at kunden overholder databeskyttelses- og markedsføringsreglerne, respekterer indsigelser og aldrig
          kontakter personer, der har fravalgt. Vores leverandører, som er nævnt nedenfor, behandler også oplysningerne
          på vores vegne.
        </p>

        <h3>Hvor længe vi gemmer dem</h3>
        <ul>
          <li>
            Generelle adresser i den fælles cache: slettes 12 måneder efter, at vi første gang indsamlede dem, også hvis
            vi ser dem igen, og før, hvis et senere besøg på hjemmesiden ikke finder dem.
          </li>
          <li>
            Cachen bruges højst 90 dage efter et besøg (7 dage, hvis hjemmesiden ikke kunne læses). Den næste søgning,
            der finder virksomheden derefter, læser hjemmesiden igen, og adresser, der er væk, fjernes.
          </li>
          <li>Adresser i en kundes søgeresultater: slettes 12 måneder efter søgningen.</li>
          <li>
            Resultater af postkassetjek: 30 dage i vores tjekcache. Resultatet, der vises ved en adresse i en kundes
            søgning, slettes sammen med søgningen.
          </li>
          <li>En registrering af, at en kunde har betalt for en adresse, så den ikke betales to gange: 12 måneder.</li>
          <li>
            Fravalg: gemmes permanent, men kun som en envejs-hash af adressen eller domænet, så vi kan genkende den og
            aldrig indsamle den igen.
          </li>
        </ul>

        <h3>Sådan fravælger du</h3>
        <p>
          Skriv din e-mailadresse eller din virksomheds domæne på <Link href="/da/opt-out">fravalgssiden</Link>. Det
          virker med det samme, kræver ingen bekræftelse, sletter det, vi har, og forhindrer os i at indsamle det igen.
          Fælles mailudbydere som gmail.com kan ikke fravælges som et helt domæne; fravælg i stedet din egen adresse.
          Ejere af hjemmesider kan også blokere nvokebot i robots.txt.
        </p>
      </section>

      <section>
        <h2>Leverandører</h2>
        <p>
          Vi bruger disse leverandører, med databehandleraftaler, hvor de behandler personoplysninger på vores vegne:
        </p>
        <ul>
          <li>Clerk, til login, kontoadministration og abonnementsbetaling.</li>
          {/* TODO(owner): bekræft, at Clerk Billing behandler kort via Stripe. */}
          <li>Stripe, betalingsudbyderen bag Clerks abonnementsbetaling, til kortbetalinger.</li>
          {/* TODO(owner): bekræft Supabase-projektets region og nævn den her. */}
          <li>Supabase, til Postgres-databasen, hostet i EU.</li>
          {/* TODO(owner): nævn VPS-udbyderen og datacentrets land. */}
          <li>Vores serverudbyder, til de servere, der kører søgninger, crawling og postkassetjek.</li>
          <li>Vercel, til hosting af denne hjemmeside.</li>
          <li>Brave Search API, som modtager de søgeord, kunderne skriver.</li>
          <li>
            OpenStreetMap Nominatim og de offentlige Overpass-servere (overpass-api.de, med overpass.private.coffee som
            reserve), som modtager det sted og den branche, der søges efter.
          </li>
          <li>Product Hunt API og Algolias HN Search API, som modtager søgeordet ved søgninger efter lanceringer.</li>
        </ul>
        <p>
          Nogle af leverandørerne har hjemsted i USA. Når personoplysninger overføres ud af EU og EØS, bruger vi EU-US
          Data Privacy Framework eller Europa-Kommissionens standardkontraktbestemmelser. Vi sælger ikke
          personoplysninger.
        </p>
      </section>

      <section>
        <h2>Dine rettigheder</h2>
        <p>
          Du har ret til indsigt i dine oplysninger og i, hvor de kommer fra, til at få dem rettet eller slettet, til at
          begrænse eller gøre indsigelse mod vores behandling og til at få udleveret oplysninger, du selv har givet os, i
          et maskinlæsbart format. En indsigelse mod behandling på grundlag af legitim interesse stopper den. Skriv til{' '}
          {mail}, så svarer vi inden for en måned.
        </p>
        <p>
          Du kan klage til Datatilsynet, <a href="https://www.datatilsynet.dk">datatilsynet.dk</a>.
        </p>
        <p>Vi træffer ikke automatiske afgørelser om dig, som har retsvirkning eller tilsvarende betydning.</p>
      </section>

      <section>
        <h2>Denne hjemmeside</h2>
        <p>
          Hjemmesiden bruger ikke cookies til sporing eller annoncer. Den gemmer dit valg af lyst eller mørkt tema i din
          browser. Når du logger ind i desktop-appen via siden, sættes de cookies, der er nødvendige for login. Det, du
          skriver på fravalgssiden, sendes til vores server og gemmes kun som en envejs-hash. Vores hostingudbydere
          gemmer kortvarige serverlogs af sikkerhedshensyn.
        </p>
      </section>

      <section>
        <h2>Ændringer</h2>
        <p>
          Vi opdaterer politikken, når vores behandling ændrer sig. Datoen øverst viser den seneste version. Kunder får
          besked på e-mail om væsentlige ændringer.
        </p>
      </section>
    </LegalPage>
  );
}
