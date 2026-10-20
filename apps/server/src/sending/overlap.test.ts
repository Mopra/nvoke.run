import { describe, expect, it } from 'vitest';
import { conflictWith, MAX_OVERLAP, overlap, sentences, sharedSentences, similarSubjects, trigrams } from './overlap.js';

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

  it('reports a conflict with the highest score, the shared sentences and a repeated subject', () => {
    expect(conflictWith({ subject: 'Oil Bowl week', body: A }, [{ subject: 'Columbus at 59th', body: B }])).toBeNull();
    const c = conflictWith({ subject: 'columbus at 59th', body: A }, [{ subject: 'Columbus at 59th', body: B }, { subject: 'x', body: A }]);
    expect(c).not.toBeNull();
    expect(c!.score).toBe(1);
    expect(c!.subject).toBe('Columbus at 59th');
    expect(c!.sentences.length).toBeGreaterThan(0);
  });
});
