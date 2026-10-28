import { describe, expect, it } from 'vitest';
import { conflictWith, MAX_OVERLAP, offerWords, overlap, sentences, sharedSentences, similarSubjects, trigrams, withoutOffer } from './overlap.js';

const A =
  'Hi Anna, the October issue put the Oil Bowl and the fall carnival up top, which made it easy to scan. Day3 bills per email sent, so a weekly issue to 10,000 readers is about $14 a month. When does your plan renew?';
const B =
  'Hi Ben, leading with the staycation ranking was a good call, since that is the line people forward. You sell your own sponsors, so you mostly need delivery. Would a side by side cost comparison help?';

describe('overlap', () => {
  it('counts word trigrams, case and punctuation aside', () => {
    expect([...trigrams('Hi, Anna! How are you?')]).toEqual(['hi anna how', 'anna how are', 'how are you']);
    expect(trigrams('two words').size).toBe(0);
  });

  it('is 0 for different emails, 1 for the same, and in between for a reworded one', () => {
    expect(overlap(A, B)).toBeLessThan(0.05);
    expect(overlap(A, A)).toBe(1);
    const reworded = A.replace('Hi Anna', 'Hi Mia').replace('When does your plan renew?', 'Who picks your email tool?');
    expect(overlap(reworded, A)).toBeGreaterThan(MAX_OVERLAP);
    expect(overlap('', A)).toBe(0);
  });

  it('measures containment, so a short email inside a long one is caught', () => {
    const short = 'Day3 bills per email sent, so a weekly issue to 10,000 readers is about $14 a month.';
    expect(overlap(short, A)).toBe(1);
  });

  it('splits sentences and finds the ones another email shares', () => {
    expect(sentences('One. Two? Three!\nFour')).toEqual(['One.', 'Two?', 'Three!', 'Four']);
    const c = `Hi Mia, your new menu is up. Day3 bills per email sent, so a weekly issue to 10,000 readers is about $14 a month. Who runs it?`;
    expect(sharedSentences(c, A)).toEqual(['Day3 bills per email sent, so a weekly issue to 10,000 readers is about $14 a month.']);
    // A greeting or a short line is not a shared sentence.
    expect(sharedSentences('Hi Anna, thanks.', A)).toEqual([]);
  });

  it('finds the same and nearly the same subjects', () => {
    expect(similarSubjects('Oil Bowl week', 'oil bowl week!')).toBe(true);
    expect(similarSubjects('Oil Bowl week and a cheaper send', 'Oil Bowl week, a cheaper send')).toBe(true);
    expect(similarSubjects('Oil Bowl week', 'Columbus at 59th')).toBe(false);
    expect(similarSubjects('', 'anything')).toBe(false);
  });

  it("leaves the offer's own sentences out of the comparison", () => {
    const offer = offerWords('Day3 bills per email sent. $14 a month for 50,000 emails, so a weekly issue to 10,000 readers costs about that.');
    const price = 'Day3 bills per email sent, so a weekly issue to 10,000 readers is about $14 a month.';
    expect(withoutOffer(`Hi Mia, your new menu is up. ${price} Who runs it?`, offer)).toBe('Hi Mia, your new menu is up.\nWho runs it?');
    const c = `Hi Mia, the spring menu went out on Tuesday with the new brunch hours. ${price} Who picks the tools there?`;
    expect(conflictWith({ subject: 'Spring menu', body: c }, [{ subject: 'Oil Bowl week', body: A }])).not.toBeNull();
    expect(conflictWith({ subject: 'Spring menu', body: c }, [{ subject: 'Oil Bowl week', body: A }], offer)).toBeNull();
    // A sentence of the email's own still counts.
    expect(conflictWith({ subject: 'Spring menu', body: A }, [{ subject: 'Oil Bowl week', body: A }], offer)).not.toBeNull();
  });

  it('lets two emails state the offer and a date in their own words', () => {
    // exit1's retry on 2026-10-28 failed leads as too_similar for this fact sentence.
    const offer = offerWords('Hi. Tell them the SSL certificate for their site ends on a date and has not been renewed yet, so a visitor will see a browser warning. It is free.');
    const a = 'Hi, the SSL certificate for ebcpa.com ends on November 4, 2026, and it has not been renewed yet. Who handles the tax season pages?';
    const b = 'Hi, the SSL certificate for sunnyrest.com ends on November 4, 2026, and it has not been renewed yet. Does your host renew it?';
    expect(sharedSentences(a, b)).not.toEqual([]);
    expect(sharedSentences(a, b, offer)).toEqual([]);
    expect(conflictWith({ subject: 'ebcpa.com certificate', body: a }, [{ subject: 'Sunnyrest renewal', body: b }], offer)).toBeNull();
    // The email's own words still count.
    const c = 'Hi, the SSL certificate for sunnyrest.com ends on November 4, 2026, and it has not been renewed yet. Who handles the tax season pages?';
    expect(conflictWith({ subject: 'Sunnyrest date', body: c }, [{ subject: 'ebcpa.com certificate', body: a }], offer)).not.toBeNull();
    // A copy made of offer words still reads like a template: the glue between them counts.
    const copy = (d: string) => `Hi, the certificate for ${d} ends on a date. It has not been renewed yet, so a visitor to the site will see a browser warning. It is free, and if it is not for you, that is fine.`;
    expect(conflictWith({ subject: 'One', body: copy('ebcpa.com') }, [{ subject: 'Two', body: copy('sunnyrest.com') }], offer)).not.toBeNull();
  });

  it('reports a conflict with the highest score, the shared sentences and a repeated subject', () => {
    expect(conflictWith({ subject: 'Oil Bowl week', body: A }, [{ subject: 'Columbus at 59th', body: B }])).toBeNull();
    const c = conflictWith({ subject: 'columbus at 59th', body: A }, [{ subject: 'Columbus at 59th', body: B }, { subject: 'x', body: A }]);
    expect(c).not.toBeNull();
    expect(c!.score).toBe(1);
    expect(c!.subject).toBe('Columbus at 59th');
    expect(c!.sentences.length).toBeGreaterThan(0);
  });
});
