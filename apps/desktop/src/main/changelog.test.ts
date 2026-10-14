import { describe, expect, it } from 'vitest';
import { changelogSection, compareVersions, isVersion, notesSince, parseChangelog } from './changelog';

const MD = `# Changelog

Intro paragraph that belongs to no version.

## 0.3.0

- Faster results.
- A long item that wraps
  onto a second line.

## 0.2.0-beta.1

- Beta only.

## 0.2.0

A paragraph item.

- Bullet item.

## 0.1.0

- First.
`;

describe('compareVersions', () => {
  it('orders by number, not by text', () => {
    expect(compareVersions('0.10.0', '0.9.0')).toBe(1);
    expect(compareVersions('1.0.0', '1.0.0')).toBe(0);
    expect(compareVersions('v1.2.3', '1.2.4')).toBe(-1);
  });

  it('puts a prerelease before its release', () => {
    expect(compareVersions('0.2.0-beta.1', '0.2.0')).toBe(-1);
    expect(compareVersions('0.2.0', '0.2.0-beta.1')).toBe(1);
  });
});

describe('parseChangelog', () => {
  it('reads one note per version heading, joining wrapped bullets', () => {
    const notes = parseChangelog(MD);
    expect(notes.map((n) => n.version)).toEqual(['0.3.0', '0.2.0-beta.1', '0.2.0', '0.1.0']);
    expect(notes[0]?.items).toEqual(['Faster results.', 'A long item that wraps onto a second line.']);
    expect(notes[2]?.items).toEqual(['A paragraph item.', 'Bullet item.']);
  });

  it('gives the raw section for the release body', () => {
    expect(changelogSection(MD, 'v0.1.0')).toBe('- First.');
    expect(changelogSection(MD, '9.9.9')).toBeNull();
  });
});

describe('notesSince', () => {
  it('lists what is newer than the seen version up to the running one, newest first', () => {
    const notes = parseChangelog(MD);
    expect(notesSince(notes, '0.1.0', '0.3.0').map((n) => n.version)).toEqual(['0.3.0', '0.2.0', '0.2.0-beta.1']);
    expect(notesSince(notes, '0.2.0', '0.2.0')).toEqual([]);
  });
});

it('accepts only x.y.z versions', () => {
  expect(isVersion('1.2.3')).toBe(true);
  expect(isVersion('1.2.3-rc.1')).toBe(true);
  expect(isVersion('1.2')).toBe(false);
  expect(isVersion(3)).toBe(false);
});
