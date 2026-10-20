import { describe, expect, it } from 'vitest';
import { classifyMail, ownText } from './classify.js';
import { fixture } from './fixtures/load.js';
import type { IncomingMail } from './types.js';

function mail(over: Partial<IncomingMail>): IncomingMail {
  return {
    folder: 'INBOX',
    uid: 1,
    messageId: '<x@example.com>',
    inReplyTo: '<sent@northwind-studio.com>',
    references: ['<sent@northwind-studio.com>'],
    from: 'Someone <someone@acme.com>',
    to: ['anna@northwind-studio.com'],
    subject: 'Re: Your pricing page',
    text: '',
    headers: {},
    deliveryStatus: null,
    date: new Date('2026-10-20T10:00:00Z'),
    ...over,
  };
}

const human = (text: string, subject = 'Re: Your pricing page') => classifyMail(mail({ text, subject }));

describe('classifyMail: bounces', () => {
  it('reads a Gmail hard bounce', () => {
    expect(classifyMail(fixture('bounce/gmail-user-unknown.eml'))).toEqual({ kind: 'bounce', hard: true, recipient: 'jonas@brightsmile-dental.co.uk', status: '5.1.1' });
  });

  it('reads a Gmail delay as soft', () => {
    expect(classifyMail(fixture('bounce/gmail-delayed.eml'))).toEqual({ kind: 'bounce', hard: false, recipient: 'lea@harbourlabs.io', status: '4.4.1' });
  });

  it('reads a Microsoft 365 recipient not found', () => {
    expect(classifyMail(fixture('bounce/m365-recipient-not-found.eml'))).toEqual({ kind: 'bounce', hard: true, recipient: 'ole.hansen@fjordline-physio.no', status: '5.1.10' });
  });

  it('reads a Microsoft 365 full mailbox as soft', () => {
    expect(classifyMail(fixture('bounce/m365-mailbox-full.eml'))).toEqual({ kind: 'bounce', hard: false, recipient: 'm.ortega@clinicasol.es', status: '4.2.2' });
  });

  it('reads a Postfix user unknown', () => {
    expect(classifyMail(fixture('bounce/postfix-user-unknown.eml'))).toEqual({ kind: 'bounce', hard: true, recipient: 'p.duval@atelier-lumiere.fr', status: '5.1.1' });
  });

  it('picks the failed recipient of a Postfix report with two', () => {
    expect(classifyMail(fixture('bounce/postfix-two-recipients.eml'))).toEqual({ kind: 'bounce', hard: true, recipient: 'k.vos@vandenberg-tech.nl', status: '5.7.1' });
  });

  it('reads an Exim bounce with no report part', () => {
    const m = fixture('bounce/exim-failed.eml');
    expect(m.deliveryStatus).toBeNull();
    expect(classifyMail(m)).toEqual({ kind: 'bounce', hard: true, recipient: 'info@kingsroad-joinery.co.uk', status: '5.1.1' });
  });

  it('reads an Exim bounce with no status code as hard from its words', () => {
    expect(classifyMail(fixture('bounce/exim-unrouteable.eml'))).toEqual({ kind: 'bounce', hard: true, recipient: 'hello@oldbrand-studio.com', status: null });
  });

  it('reads an Exim delay warning as soft', () => {
    expect(classifyMail(fixture('bounce/exim-delayed.eml'))).toMatchObject({ kind: 'bounce', hard: false });
  });

  it('reads a daemon mail with a bare SMTP reply', () => {
    const m = mail({ from: 'MAILER-DAEMON@mx.example.org', subject: 'failure notice', text: 'Sorry, we were unable to deliver your message to the following address.\n\n<bob@acme.com>:\n550 Requested action not taken: mailbox unavailable' });
    expect(classifyMail(m)).toEqual({ kind: 'bounce', hard: true, recipient: 'bob@acme.com', status: '5.0.0' });
  });

  it('takes a bounce before the auto reply headers it also carries', () => {
    // Every daemon above sets Auto-Submitted: auto-replied.
    expect(classifyMail(fixture('bounce/postfix-user-unknown.eml')).kind).toBe('bounce');
  });
});

describe('classifyMail: auto replies', () => {
  const samples = [
    ['auto/outlook-en.eml', 'Outlook, English, Auto-Submitted'],
    ['auto/gmail-vacation.eml', 'Gmail vacation responder, Re: subject'],
    ['auto/de-abwesenheit.eml', 'German subject only'],
    ['auto/es-respuesta.eml', 'Spanish subject only'],
    ['auto/fr-reponse.eml', 'French subject only'],
    ['auto/da-automatisk-svar.eml', 'Danish subject only'],
    ['auto/da-ferie.eml', 'Danish one word subject'],
    ['auto/nl-afwezig.eml', 'Dutch subject only'],
    ['auto/sv-franvaro.eml', 'Swedish subject only'],
    ['auto/precedence-auto-reply.eml', 'Precedence and X-Autorespond'],
  ] as const;

  it.each(samples)('reads %s (%s)', (path) => {
    expect(classifyMail(fixture(path))).toEqual({ kind: 'auto_reply' });
  });

  it('reads the auto reply headers', () => {
    expect(classifyMail(mail({ headers: { 'auto-submitted': 'auto-replied' } }))).toEqual({ kind: 'auto_reply' });
    expect(classifyMail(mail({ headers: { 'auto-submitted': 'auto-generated' } }))).toEqual({ kind: 'auto_reply' });
    expect(classifyMail(mail({ headers: { 'x-autoreply': 'yes' } }))).toEqual({ kind: 'auto_reply' });
    expect(classifyMail(mail({ headers: { 'x-autorespond': 'Thanks' } }))).toEqual({ kind: 'auto_reply' });
    expect(classifyMail(mail({ headers: { precedence: 'auto_reply' } }))).toEqual({ kind: 'auto_reply' });
  });

  it('reads out of office subjects', () => {
    for (const subject of ['Out of Office: Your pricing page', 'Automatic reply: Your pricing page', 'Auto: Your pricing page', 'OOO until Monday', 'Automatische Antwort: Ihre Seite', 'Respuesta automática: Su página', 'Réponse automatique : Votre page', 'Automatisk svar: Jeres side', 'Automatisch antwoord: Uw pagina', 'Autosvar: Er sida']) {
      expect(classifyMail(mail({ subject })), subject).toEqual({ kind: 'auto_reply' });
    }
  });

  it('reads a person who sets Auto-Submitted: no, or writes about a holiday', () => {
    expect(classifyMail(mail({ headers: { 'auto-submitted': 'no' }, text: 'Sounds good.' }))).toEqual({ kind: 'human', optOut: false });
    expect(classifyMail(mail({ subject: 'Re: Your semester signup page', text: 'Yes, tell me more.' }))).toEqual({ kind: 'human', optOut: false });
    expect(classifyMail(mail({ subject: 'Re: Your pricing page', text: 'I am out of office next week, but call me after.' }))).toEqual({ kind: 'human', optOut: false });
  });
});

describe('classifyMail: people', () => {
  it('reads an interested reply, with our stop line only in the quote', () => {
    expect(classifyMail(fixture('human/interested-gmail.eml'))).toEqual({ kind: 'human', optOut: false });
  });

  it('reads a reply of just STOP above an Outlook quote', () => {
    expect(classifyMail(fixture('human/stop-alone.eml'))).toEqual({ kind: 'human', optOut: true });
  });

  it('reads remove me above an Outlook From and Sent block', () => {
    expect(classifyMail(fixture('human/remove-me-outlook.eml'))).toEqual({ kind: 'human', optOut: true });
  });

  it('reads a German no thanks', () => {
    expect(classifyMail(fixture('human/not-interested-de.eml'))).toEqual({ kind: 'human', optOut: true });
  });

  it('reads a Swedish no thanks', () => {
    expect(classifyMail(fixture('human/nej-tak-sv.eml'))).toEqual({ kind: 'human', optOut: true });
  });

  it('ignores unsubscribe and stop in the quote and inside sentences', () => {
    expect(classifyMail(fixture('human/question-unsubscribe-quoted.eml'))).toEqual({ kind: 'human', optOut: false });
  });

  it('reads stop as the whole reply or its first line', () => {
    for (const text of ['stop', 'Stop.', 'STOP!', 'Please stop', 'stop please', 'Stopp', 'Stop\n\nSent from my iPhone']) {
      expect(human(text), text).toEqual({ kind: 'human', optOut: true });
    }
  });

  it('does not read stop inside a sentence', () => {
    for (const text of ["Don't stop, this is great.", 'Stop by our booth on Thursday.', 'We should stop meeting like this, ha. Call Friday?', 'Hi Anna,\nstop is the word you use, I see.', 'Nonstop growth here.']) {
      expect(human(text), text).toEqual({ kind: 'human', optOut: false });
    }
  });

  it('reads opt out words in seven languages', () => {
    const outs = [
      'Please unsubscribe me.',
      'Take me off your list',
      'Not interested, thanks.',
      "Don't email me again.",
      'Stop emailing me',
      'Bitte abmelden.',
      'Kein Interesse, danke.',
      'Por favor, darme de baja.',
      'No me interesa, gracias.',
      'Merci de me désabonner.',
      'Pas intéressé.',
      'Afmeld venligst.',
      'Nej tak, ikke interesseret.',
      'Fjern mig fra listen.',
      'Graag uitschrijven.',
      'Geen interesse.',
      'Niet geïnteresseerd, dank je.',
      'Ta bort mig från listan.',
      'Vi är inte intresserade.',
    ];
    for (const text of outs) expect(human(text), text).toEqual({ kind: 'human', optOut: true });
  });

  it('reads an opt out in the subject of a fresh mail', () => {
    expect(human('', 'Unsubscribe')).toEqual({ kind: 'human', optOut: true });
    expect(human('', 'Remove me')).toEqual({ kind: 'human', optOut: true });
  });

  it('reads ordinary replies as people who did not opt out', () => {
    for (const text of ['Sounds interesting, send me pricing.', 'Who are you?', 'We already have an agency. What makes you different?', "Don't write off our Q1 budget yet, ping me in January."]) {
      expect(human(text), text).toEqual({ kind: 'human', optOut: false });
    }
  });
});

describe('ownText', () => {
  it('keeps what the person wrote above the quote', () => {
    expect(ownText('Yes please.\n\nOn Tue, 20 Oct 2026 at 10:14, Anna <a@b.c> wrote:\n> Hi\n> unsubscribe')).toBe('Yes please.');
    expect(ownText('Ja.\n\nDen tir. 20. okt. 2026 kl. 10.00 skrev Anna <a@b.c>:\n> Hej')).toBe('Ja.');
    expect(ownText('Oui.\n\nLe mar. 20 oct. 2026 à 10:00, Anna <a@b.c> a écrit :\n> Bonjour')).toBe('Oui.');
    expect(ownText('Sí.\n\nEl mar, 20 oct 2026 a las 10:00, Anna (<a@b.c>) escribió:\n> Hola')).toBe('Sí.');
    expect(ownText('Ja.\n\nOp di 20 okt 2026 om 10:00 schreef Anna <a@b.c>:\n> Hallo')).toBe('Ja.');
    expect(ownText('Fine.\n\n-----Original Message-----\nFrom: Anna\nunsubscribe')).toBe('Fine.');
    expect(ownText('Inline:\n> your question\nmy answer')).toBe('Inline:\nmy answer');
  });

  it('keeps a line that starts like a quote intro but is not one', () => {
    expect(ownText('On Monday we can talk.\nThanks')).toBe('On Monday we can talk.\nThanks');
  });
});
