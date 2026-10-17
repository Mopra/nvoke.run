import { describe, expect, it } from 'vitest';
import { looksLikeTitle, seniorityOf } from './seniority.ts';

describe('seniorityOf', () => {
  it('reads founders, owners, CEOs, managing directors and partners in the languages nvoke sells in', () => {
    for (const title of [
      'Founder',
      'Co-Founder & CTO',
      'CEO',
      'Managing Director',
      'Geschäftsführer',
      'Geschäftsführerin',
      'Mitgründerin',
      'Inhaber',
      'Adm. direktør',
      'Administrerende direktør',
      'Indehaver',
      'Medstifter',
      'Partner',
      'Senior Partner',
      'Oprichter',
      'Eigenaar',
      'VD',
      'Daglig leder',
      'Directeur général',
      'Gérant',
      'Fundador y CEO',
      'Owner',
    ]) {
      expect(seniorityOf(title), title).toBe('founder');
    }
  });

  it('reads other C level and vice presidents as executives', () => {
    for (const title of ['CTO', 'Chief Revenue Officer', 'COO', 'CFO', 'VP Sales', 'Vice President of Marketing', 'Chairman']) {
      expect(seniorityOf(title), title).toBe('executive');
    }
  });

  it('reads heads and directors, also inside compounds', () => {
    for (const title of ['Head of Growth', 'Sales Director', 'Salgsdirektør', 'Vertriebsleiter', 'Leiterin Marketing', 'Salgschef', 'Director of Partnerships', 'Directrice artistique']) {
      expect(seniorityOf(title), title).toBe('director');
    }
  });

  it('reads managers and leads, and everything else as staff', () => {
    expect(seniorityOf('Account Manager')).toBe('manager');
    expect(seniorityOf('Partner Manager')).toBe('manager');
    expect(seniorityOf('Product Owner')).toBe('staff');
    expect(seniorityOf('Design Lead')).toBe('manager');
    expect(seniorityOf('Projektleder')).toBe('manager');
    expect(seniorityOf('Designer')).toBe('staff');
    expect(seniorityOf('Tandlæge')).toBe('staff');
    expect(seniorityOf('')).toBeNull();
    expect(seniorityOf(null)).toBeNull();
  });
});

describe('looksLikeTitle', () => {
  it('takes short titles and refuses sentences, headings of other things and addresses', () => {
    expect(looksLikeTitle('Head of Sales')).toBe(true);
    expect(looksLikeTitle('Konsulent')).toBe(true);
    expect(looksLikeTitle('Jane is our CEO')).toBe(false);
    expect(looksLikeTitle('Read more about our pricing')).toBe(false);
    expect(looksLikeTitle('ceo@acme.dk')).toBe(false);
    expect(looksLikeTitle('Welcome to Acme')).toBe(false);
  });
});

describe('partners and MDs', () => {
  it('reads partner badges as no seniority of the firm, and partners of the firm as founders', () => {
    for (const title of ['Premier Partner', 'Google Premier Partner', 'Gold Partner', 'Certified Partner', 'Official Partner', 'Preferred Partner', 'Solution Partner', 'Technology Partner']) {
      expect(seniorityOf(title), title).not.toBe('founder');
      expect(looksLikeTitle(title), title).toBe(false);
    }
    for (const title of ['Partner', 'Managing Partner', 'Founding Partner', 'Partner & CEO', 'Indehaver']) expect(seniorityOf(title), title).toBe('founder');
  });

  it('reads MD as managing director only on its own', () => {
    expect(seniorityOf('MD')).toBe('founder');
    expect(seniorityOf('MD & Founder')).toBe('founder');
    expect(seniorityOf('Cardiologist, MD')).toBe('staff');
  });
});
