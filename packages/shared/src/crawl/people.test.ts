import { describe, expect, it } from 'vitest';
import { companyAsPerson, extractPeople, isFirstName, mergePeople, namesCompany, parseName, personForAddress, type FoundPerson } from './people.ts';

const names = (people: FoundPerson[]) => people.map((p) => `${p.firstName} ${p.lastName}|${p.title ?? ''}|${p.seniority ?? ''}`);

describe('parseName', () => {
  it('reads two to four capitalized words, particles and honorifics', () => {
    expect(parseName('Jane Doe')).toEqual({ firstName: 'Jane', lastName: 'Doe' });
    expect(parseName('Dr. Anna Maria Schmidt')).toEqual({ firstName: 'Anna', lastName: 'Maria Schmidt' });
    expect(parseName('Jan van der Berg')).toEqual({ firstName: 'Jan', lastName: 'van der Berg' });
    expect(parseName('Anne-Marie Østergaard')).toEqual({ firstName: 'Anne-Marie', lastName: 'Østergaard' });
    expect(parseName('JANE DOE')).toEqual({ firstName: 'Jane', lastName: 'Doe' });
    expect(parseName('John F. Kennedy')).toEqual({ firstName: 'John', lastName: 'Kennedy' });
    expect(parseName("Sean O'Brien, MBA")).toEqual({ firstName: 'Sean', lastName: "O'Brien" });
    expect(parseName('Jack Ma')).toEqual({ firstName: 'Jack', lastName: 'Ma' });
  });

  it('refuses headings, company names, places and single words', () => {
    for (const text of ['Our Team', 'Meet The Team', 'Acme ApS', 'Digital Marketing', 'Aarhus Denmark', 'Jane', 'Vores Team', 'Read More', 'Head Office', 'Jane Doe Consulting', 'jane doe', 'Über Uns']) {
      expect(parseName(text), text).toBeNull();
    }
  });
});

describe('extractPeople', () => {
  it('reads team cards, name over title and title over name', () => {
    const html = `<body><h2>Vores team</h2>
      <div class="member"><h3>Mette Hansen</h3><p>Partner &amp; Adm. direktør</p></div>
      <div class="member"><h3>Jonas Berg</h3><a href="https://linkedin.com/in/x">LinkedIn</a><p>Head of Growth</p></div>
      <div class="member"><span class="role">Designer</span><span class="name">Sofie Lund</span></div>
    </body>`;
    expect(names(extractPeople(html, 'https://acme.dk/team'))).toEqual([
      'Mette Hansen|Partner & Adm. direktør|founder',
      'Jonas Berg|Head of Growth|director',
      'Sofie Lund|Designer|staff',
    ]);
    expect(extractPeople(html, 'https://acme.dk/team')[0]!.sourceUrl).toBe('https://acme.dk/team');
  });

  it('reads a name and a title on one line, either way round', () => {
    const html = `<body>
      <p>Jane Doe, CEO</p>
      <p>Max Power \u2013 Founder</p>
      <p>Lars Eriksen (CTO)</p>
      <h4>Peter Smith <small>Sales Director</small></h4>
      <p>CEO &amp; Founder Anna Svensson</p>
    </body>`;
    expect(names(extractPeople(html))).toEqual([
      'Jane Doe|CEO|founder',
      'Max Power|Founder|founder',
      'Anna Svensson|CEO & Founder|founder',
      'Lars Eriksen|CTO|executive',
      'Peter Smith|Sales Director|director',
    ]);
  });

  it('reads imprint labels in German, Danish and English', () => {
    const html = `<body><footer>
      <p>Geschäftsführer: Max Mustermann, Erika Musterfrau</p>
      <p>Vertreten durch: Klaus Becker</p>
      <p>Registergericht: Amtsgericht Hamburg</p>
      <p>Acme ApS · CVR 12345678 · Adm. direktør Jens Kristensen</p>
      <p>Inhaber: Dr. Thomas Weber</p>
    </footer></body>`;
    expect(names(extractPeople(html))).toEqual([
      'Max Mustermann|Geschäftsführer|founder',
      'Erika Musterfrau|Geschäftsführer|founder',
      'Klaus Becker||founder',
      'Jens Kristensen|Adm. direktør|founder',
      'Thomas Weber|Inhaber|founder',
    ]);
  });

  it('reads schema.org people with a title or listed as founders', () => {
    const html = `<head><script type="application/ld+json">${JSON.stringify({
      '@context': 'https://schema.org',
      '@graph': [
        { '@type': 'Organization', name: 'Acme', founder: [{ '@type': 'Person', name: 'Ole Nielsen' }] },
        { '@type': 'Person', name: 'Karin Holm', jobTitle: 'Chief Marketing Officer' },
        { '@type': 'Person', name: 'admin' },
        { '@type': 'Article', author: { '@type': 'Person', name: 'Blog Writer Person' } },
      ],
    })}</script></head>
    <body><div itemscope itemtype="https://schema.org/Person"><span itemprop="name">Eva Lind</span><span itemprop="jobTitle">Partner</span></div></body>`;
    expect(names(extractPeople(html))).toEqual(['Ole Nielsen||founder', 'Eva Lind|Partner|founder', 'Karin Holm|Chief Marketing Officer|executive']);
  });

  it('keeps a name without a title when an address on the page is made from it', () => {
    const html = '<body><div><h3>Mette Hansen</h3><a href="mailto:mh@acme.dk">Mail</a></div><div><h3>Søren Jørgensen</h3><a href="mailto:soren.jorgensen@acme.dk">Skriv</a></div></body>';
    expect(names(extractPeople(html))).toEqual(['Søren Jørgensen||']);
  });

  it('skips testimonials, quotes, other companies and sentences', () => {
    const html = `<body>
      <div class="testimonials"><p>Great work!</p><p>Jane Doe</p><p>CEO</p></div>
      <blockquote>Best agency ever. Peter Pan, Founder</blockquote>
      <p>Lisa Berg, CEO at Clientco</p>
      <p>Tom Hardy</p><p>Tom is our CEO and loves dogs.</p>
      <h2>Our Team</h2><p>Head of Sales</p>
      <p>Digital Marketing</p><p>Manager</p>
    </body>`;
    expect(extractPeople(html)).toEqual([]);
  });

  it('does not take a group heading for the title of the name under it', () => {
    const html = '<body><h2>Board of Directors</h2><p>Hans Jensen</p><h2>Ledelse</h2><p>Karen Blixen</p><p>CEO</p></body>';
    expect(names(extractPeople(html))).toEqual(['Karen Blixen|CEO|founder']);
  });
});

describe('mergePeople', () => {
  it('keeps one entry per person with the best title, decision makers first', () => {
    const p = (firstName: string, lastName: string, title: string | null, seniority: FoundPerson['seniority']): FoundPerson => ({
      firstName,
      lastName,
      title,
      seniority,
      sourceUrl: null,
    });
    expect(names(mergePeople([p('Ann', 'Lee', 'Designer', 'staff'), p('Bo', 'Ek', null, null), p('Bo', 'Ek', 'CEO', 'founder'), p('Cy', 'Hu', 'Head of Sales', 'director')]))).toEqual([
      'Bo Ek|CEO|founder',
      'Cy Hu|Head of Sales|director',
      'Ann Lee|Designer|staff',
    ]);
  });
});

describe('personForAddress', () => {
  const people = [
    { firstName: 'Søren', lastName: 'Jørgensen' },
    { firstName: 'Mette', lastName: 'Krogh Hansen' },
    { firstName: 'Max', lastName: 'Müller' },
    { firstName: 'Mads', lastName: 'Hansen' },
  ];

  it('matches the usual patterns, with Nordic and German letters spelled out', () => {
    expect(personForAddress('soren.jorgensen@acme.dk', people)?.firstName).toBe('Søren');
    expect(personForAddress('soeren@acme.dk', people)?.firstName).toBe('Søren');
    expect(personForAddress('sjorgensen@acme.dk', people)?.firstName).toBe('Søren');
    expect(personForAddress('max.mueller@acme.de', people)?.firstName).toBe('Max');
    expect(personForAddress('mkh@acme.dk', people)?.firstName).toBe('Mette');
    expect(personForAddress('mette.hansen@acme.dk', people)?.firstName).toBe('Mette');
  });

  it('refuses role inboxes and addresses that fit more than one person', () => {
    expect(personForAddress('info@acme.dk', people)).toBeNull();
    expect(personForAddress('hansen@acme.dk', people)).toBeNull();
    expect(personForAddress('mhansen@acme.dk', people)).toBeNull();
    expect(personForAddress('mh@acme.dk', people)?.firstName).toBe('Mads');
  });
});

describe('review fixes', () => {
  it('reads cards with the title above the name without shifting titles by one card', () => {
    const html = '<body><p>CEO</p><h3>Jane Doe</h3><p>CTO</p><h3>John Smith</h3><p>Designer</p><h3>Anna Berg</h3></body>';
    expect(names(extractPeople(html))).toEqual(['Jane Doe|CEO|founder', 'John Smith|CTO|executive', 'Anna Berg|Designer|staff']);
  });

  it('does not take testimonial authors at other companies for the company\'s people', () => {
    const html = `<body>
      <p>Mark Olsen</p><p>CEO, Acme Corp</p>
      <p>Lene Dahl</p><p>Founder of Bakery Inc</p>
      <p>"They rebuilt our shop in three weeks and sales doubled."</p><p>Lisa Holm</p><p>Owner</p>
      <div class="swiper-slide"><p>“Fast and friendly.”</p><p>Per Lund</p><p>CEO</p></div>
      <div class="review-card"><p>Ida Ravn</p><p>Partner</p></div>
    </body>`;
    expect(extractPeople(html, 'https://studio.dk/')).toEqual([]);
  });

  it('reads a team slider without quotes', () => {
    expect(names(extractPeople('<body><div class="carousel"><div><p>Andreas Holm</p><p>CTO</p></div></div></body>'))).toEqual(['Andreas Holm|CTO|executive']);
  });

  it('keeps a title that names the page\'s own company or an office', () => {
    const html = '<body><p>Mette Hansen</p><p>CEO, Acme</p><p>Jonas Berg</p><p>Managing Director, Denmark</p><p>Sara Friis</p><p>Head of Growth, CPH</p></body>';
    expect(names(extractPeople(html, 'https://www.acme.dk/team'))).toEqual([
      'Mette Hansen|CEO, Acme|founder',
      'Jonas Berg|Managing Director, Denmark|founder',
      'Sara Friis|Head of Growth, CPH|director',
    ]);
  });

  it('does not read a doctor\'s degree as managing director', () => {
    expect(extractPeople('<body><p>Jane Doe, MD</p></body>')).toEqual([]);
  });

  it('does not take a group heading after a name for a title', () => {
    expect(extractPeople('<body><p>Hans Jensen</p><h2>Board of Directors</h2><p>Karen Holm</p><h2>Management</h2></body>')).toEqual([]);
  });

  it('skips microdata people inside reviews', () => {
    const html = `<body>
      <div class="review"><div itemscope itemtype="https://schema.org/Person"><span itemprop="name">Eva Lind</span><span itemprop="jobTitle">CEO</span></div></div>
      <div itemscope itemtype="https://schema.org/Review"><div itemprop="author" itemscope itemtype="https://schema.org/Person"><span itemprop="name">Bo Holm</span><span itemprop="jobTitle">CEO</span></div></div>
    </body>`;
    expect(extractPeople(html)).toEqual([]);
  });

  it('never reads site credits as people', () => {
    const html = '<body><footer><p>Design: Max Mustermann</p><p>Programmierung: Jan Holt</p><p>Fotos: Anna Berg</p><p>Webdesign: Lars Lund</p><p>Photo: Eva Lind</p></footer></body>';
    expect(extractPeople(html)).toEqual([]);
  });

  it('caps a long schema.org job title', () => {
    const html = `<script type="application/ld+json">${JSON.stringify({ '@type': 'Person', name: 'Ole Nielsen', jobTitle: `CEO ${'x'.repeat(5000)}` })}</script>`;
    const [ole] = extractPeople(html);
    expect(ole?.title?.length).toBeLessThanOrEqual(120);
  });
});

describe('namesCompany', () => {
  it('rejects a person who is the company itself', () => {
    const html = '<div><h3>Agence Nova</h3><p>Propriétaire</p></div><div><h3>Claire Martin</h3><p>Fondatrice</p></div>';
    expect(names(extractPeople(html, 'https://agencenova.com/equipe'))).toEqual(['Claire Martin|Fondatrice|founder']);
    expect(namesCompany({ firstName: 'Agence', lastName: 'Nova' }, 'agencenova')).toBe(true);
    expect(namesCompany({ firstName: 'Nova', lastName: 'Studio' }, 'Nova Studio ApS')).toBe(true);
    expect(namesCompany({ firstName: 'Nova', lastName: 'Studio Berlin' }, 'novastudio')).toBe(true);
  });

  it('keeps a founder who shares one word with the company', () => {
    expect(namesCompany({ firstName: 'Peter', lastName: 'Jensen' }, 'jensen')).toBe(false);
    expect(namesCompany({ firstName: 'Peter', lastName: 'Jensen' }, 'Jensen Rådgivning ApS')).toBe(false);
    expect(namesCompany({ firstName: 'Anna', lastName: 'Berg' }, 'acme')).toBe(false);
    expect(namesCompany({ firstName: 'Anna', lastName: 'Berg' }, null)).toBe(false);
  });
});

describe('companyAsPerson', () => {
  it('drops a company read as a person, keeps founders the company is named after', () => {
    expect(companyAsPerson({ firstName: 'Agence', lastName: 'Nova', title: 'Propriétaire' }, 'agencenova')).toBe(true);
    expect(companyAsPerson({ firstName: 'Nova', lastName: 'Studio', title: null }, 'Nova Studio ApS')).toBe(true);
    expect(companyAsPerson({ firstName: 'Peter', lastName: 'Jensen', title: 'Founder' }, 'Peter Jensen ApS')).toBe(false);
    expect(companyAsPerson({ firstName: 'Hans', lastName: 'Müller', title: 'Geschäftsführer' }, 'Hans Müller GmbH')).toBe(false);
    expect(companyAsPerson({ firstName: 'Hans', lastName: 'Müller', title: null }, 'Hans Müller GmbH')).toBe(true);
    expect(companyAsPerson({ firstName: 'Peter', lastName: 'Jensen', title: null }, 'jensen')).toBe(false);
  });

  it('keeps the titled founder on the page of a company named after them', () => {
    const html = '<div><h3>Peter Jensen</h3><p>Founder</p></div>';
    expect(names(extractPeople(html, 'https://peterjensen.dk/om'))).toEqual(['Peter Jensen|Founder|founder']);
  });

  it('knows common first names in their folded and hyphenated forms', () => {
    expect(isFirstName('Søren')).toBe(true);
    expect(isFirstName('Anne-Marie')).toBe(true);
    expect(isFirstName('Agence')).toBe(false);
  });
});

describe('page wrappers and headings', () => {
  it('reads a WordPress page whose body class names a logo', () => {
    const html = '<html><body class="page wp-custom-logo"><main><h1>Impressum</h1><p>Geschäftsführer: Stefan Roggatz &amp; Katy Roggatz</p></main></body></html>';
    expect(names(extractPeople(html, 'https://invictus.de/impressum'))).toEqual(['Stefan Roggatz|Geschäftsführer|founder', 'Katy Roggatz|Geschäftsführer|founder']);
  });

  it('still drops a client logo section inside the page', () => {
    const html = '<body class="wp-custom-logo"><h1>Team</h1><div class="client-logos"><p>Jane Doe, CEO</p></div><p>Ole Hansen, Founder</p></body>';
    expect(names(extractPeople(html, 'https://acme.dk/team'))).toEqual(['Ole Hansen|Founder|founder']);
  });

  it('reads an imprint label on its own line with the name on the next', () => {
    const html = '<h5>Vertreten durch:</h5><p>Ulrike Ströhle</p><h5>Kontakt:</h5><p>Telefon: 0731 14 111 690</p>';
    expect(names(extractPeople(html, 'https://dialog.de/impressum'))).toEqual(['Ulrike Ströhle||founder']);
  });

  it('drops a site credit written as a sentence', () => {
    const html = '<p>Responsable de publication : Fabien Errero</p><p>Directions artistique et technique faites par : Let’s Clic</p>';
    expect(names(extractPeople(html, 'https://acceor.com/mentions-legales'))).toEqual(['Fabien Errero|Responsable de publication|manager']);
  });

  it('drops headings read as names when the page writes their words in lower case', () => {
    const html = `<h3>Account Based</h3><p>Marketing</p><h3>Qualified Leads</h3><p>Sales</p>
      <p>We run account based campaigns that turn qualified leads into meetings.</p>
      <h3>Owen Richards</h3><p>Founder &amp; CEO</p>`;
    expect(names(extractPeople(html, 'https://air.co.uk/team'))).toEqual(['Owen Richards|Founder & CEO|founder']);
  });
});

describe('review: labels, surnames and sections', () => {
  const read = (html: string, url = 'https://acme.de/impressum') => names(extractPeople(html, url));

  it('keeps "Represented by" and "Founded by", drops "Made by" and "Design by"', () => {
    expect(read('<p>Represented by: Jane Doe</p>')).toEqual(['Jane Doe||founder']);
    expect(read('<p>Founded by: Jane Doe</p>')).toEqual(['Jane Doe||founder']);
    expect(read('<p>Made by: Lars Bureau</p><p>Design by: Mette Hansen</p>')).toEqual([]);
  });

  it('keeps both names around a dash, cuts contact details after one', () => {
    expect(read('<p>Geschäftsführer: Hans Müller - Peter Schmidt</p>')).toEqual(['Hans Müller|Geschäftsführer|founder', 'Peter Schmidt|Geschäftsführer|founder']);
    expect(read('<p>Responsable publication : Olivier Gouleau - ogouleau@fox.fr</p>', 'https://fox.fr/mentions')).toEqual(['Olivier Gouleau|Responsable publication|manager']);
  });

  it('keeps surnames that are words when the title is a decision maker or the word is far away', () => {
    const html = `<p>Andrew Hill, CEO</p><p>Sarah Wood</p><p>Marketing Manager</p>
      <p>a</p><p>b</p><p>c</p><p>d</p><p>Our office sits on a hill by the wood.</p>`;
    expect(read(html, 'https://acme.co.uk/team')).toEqual(['Andrew Hill|CEO|founder', 'Sarah Wood|Marketing Manager|manager']);
  });

  it('removes a testimonials section even when it has its own heading', () => {
    const html = '<body><main><section class="testimonials"><h1>What clients say</h1><p>Jane Doe, CEO</p></section><p>Ole Hansen, Founder</p></main></body>';
    expect(read(html, 'https://acme.dk/om')).toEqual(['Ole Hansen|Founder|founder']);
  });
});

describe('more people without Claude', () => {
  const read = (html: string, url = 'https://acme.dk/team') => names(extractPeople(html, url));

  it('reads card markup with a role outside the lexicon and a bio between name and role', () => {
    const html = `<body><section class="team">
      <div class="team-member"><h3 class="team-member__name">Mette Hansen</h3><p>Mette har været med siden 2009 og elsker god mad.</p><span class="team-member__position">Kok</span></div>
      <div class="team-member"><h3 class="team-member__name">Jonas Berg</h3><p>Jonas passer lageret.</p><span class="team-member__position">Lagerarbejder</span></div>
    </section></body>`;
    expect(read(html)).toEqual(['Mette Hansen|Kok|staff', 'Jonas Berg|Lagerarbejder|staff']);
  });

  it('gives each card its own role, not the next card\'s', () => {
    const html = `<body>
      <div class="card"><span class="job-title">Founder</span><img alt=""><h4>Anna Svensson</h4></div>
      <div class="card"><span class="job-title">Designer</span><img alt=""><h4>Erik Lund</h4></div>
    </body>`;
    expect(read(html)).toEqual(['Anna Svensson|Founder|founder', 'Erik Lund|Designer|staff']);
  });

  it('skips a role field in a card with several names, and a role that is a sentence', () => {
    const html = `<body>
      <div class="group"><p>Mette Hansen</p><p>Jonas Berg</p><span class="role">Kok</span></div>
      <div class="person"><h4>Sofie Lund</h4><span class="position">We are the best team in town</span></div>
    </body>`;
    expect(read(html)).toEqual([]);
  });

  it('reads schema.org types written as urls, worksFor the own company, and RDFa', () => {
    const html = `<head><script type="application/ld+json">${JSON.stringify([
      { '@type': 'https://schema.org/Person', name: 'Karin Holm', jobTitle: 'Chief Marketing Officer' },
      { '@type': 'schema:Person', name: 'Ole Nielsen', worksFor: { '@type': 'Organization', name: 'Acme ApS' } },
      { '@type': 'Person', name: 'Lisa Berg', worksFor: { '@type': 'Organization', name: 'Clientco' } },
    ])}</script></head>
    <body><div vocab="https://schema.org/" typeof="Person"><span property="name">Eva Lind</span><span property="jobTitle">Indehaver</span></div>
    <div itemscope itemtype="https://schema.org/Organization"><div itemprop="founder" itemscope itemtype="https://schema.org/Person"><span itemprop="name">Peter Holm</span></div></div></body>`;
    expect(read(html)).toEqual(['Eva Lind|Indehaver|founder', 'Peter Holm||founder', 'Karin Holm|Chief Marketing Officer|executive', 'Ole Nielsen||']);
  });

  it('reads titles in Italian, Portuguese, Polish and Finnish', () => {
    const html = `<body>
      <p>Marco Rossi</p><p>Titolare</p>
      <p>Giulia Bianchi</p><p>Amministratore Delegato</p>
      <p>Pedro Alves</p><p>Sócio Fundador</p>
      <p>Piotr Nowak</p><p>Właściciel</p>
      <p>Tomasz Kowalski</p><p>Dyrektor sprzedaży</p>
      <p>Mikael Virtanen</p><p>Myyntipäällikkö</p>
    </body>`;
    expect(read(html, 'https://acme.eu/team')).toEqual([
      'Marco Rossi|Titolare|founder',
      'Giulia Bianchi|Amministratore Delegato|founder',
      'Pedro Alves|Sócio Fundador|founder',
      'Piotr Nowak|Właściciel|founder',
      'Tomasz Kowalski|Dyrektor sprzedaży|director',
      'Mikael Virtanen|Myyntipäällikkö|manager',
    ]);
  });
});
