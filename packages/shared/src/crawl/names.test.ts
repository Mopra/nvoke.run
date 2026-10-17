import { describe, expect, it } from 'vitest';
import { pickPlaceSite, placeMatch } from './names.ts';

describe('place websites', () => {
  const dentist = ['dentist', 'tandlæge', 'tandlaeger', 'Aarhus'];

  it('matches a label that holds every distinctive word, leaving out the niche and the city', () => {
    expect(placeMatch('Tandlæge Jensen', 'tandlaegejensen.dk', dentist)).toBe(3);
    expect(placeMatch('Tandlæge Jensen', 'jensen-tand.dk', dentist)).toBe(2);
    expect(placeMatch('Tandlægerne i Vestergade', 'vestergade-tand.dk', [...dentist, 'tandlaegerne', 'i'])).toBe(2);
    expect(placeMatch('Aarhus Tandklinik Søndergade', 'sondergade-tandklinik.dk', dentist)).toBe(2);
    expect(placeMatch('Tandlæge Jensen', 'tandlaegeguiden.dk', dentist)).toBe(0);
    expect(placeMatch('Restaurant Mumbai', 'mumbai-aalborg.dk', ['restaurant', 'Aalborg'])).toBe(2);
  });

  it('does not match on generic words alone or a short word inside a longer label', () => {
    expect(placeMatch('Tandlæge', 'tandlaege-aarhus.dk', dentist)).toBe(0);
    expect(placeMatch('Bo Dental', 'bodega.dk', ['dental'])).toBe(0);
    expect(placeMatch('Bo Dental', 'bo.dk', ['dental'])).toBe(2);
  });

  it('reads the benchmark cases right', () => {
    // A name of two words or more run together inside the label.
    expect(placeMatch('In-Shape', 'in-shapefysiotherapie.nl', ['physiotherapist'])).toBe(2);
    expect(placeMatch("O'Dwyer & Co", 'odwyerandco.ie', ['estate agent', 'Dublin'])).toBe(2);
    // Two long words of the name are enough.
    expect(placeMatch('Grant Thornton Godkendt Revisionspartnerselskab', 'grantthornton.dk', ['accountant'])).toBe(2);
    // One distinctive word starts the label, or the rest of the label is generic.
    expect(placeMatch('Lundquist', 'lundquiststudio.dk', ['hairdresser', 'Aarhus'])).toBe(2);
    expect(placeMatch('Tandlægerne i Vesterbrogade', 'tandlaegerne-vesterbrogade.dk', dentist)).toBe(2);
    expect(placeMatch('Osteria', 'losteria.net', ['restaurant', 'Aalborg'])).toBe(0);
    // The name holding the label is not enough, nor a stop word left out of a short name.
    expect(placeMatch('Odense Tandpleje', 'odense.dk', ['dentist', 'Odense'])).toBe(0);
    expect(placeMatch('Frisør Kloch', 'frisor.dk', ['hairdresser', 'frisør'])).toBe(0);
    expect(placeMatch('Hi Elektro', 'hauge-elektro.no', ['electrician', 'elektriker', 'Oslo'])).toBe(0);
    // Plural forms of a generic word are generic, longer words that start with one are not.
    expect(placeMatch('Dentalklinikken Odense', 'dentalklinikken.dk', ['dental', 'Odense'])).toBe(2);
    expect(placeMatch('Berkeley', 'ies.berkeley.edu', ['estate agent'])).toBe(0);
  });

  it('picks the own site over platforms and directories, and nothing when none matches', () => {
    const results = [
      { website: 'https://www.yelp.com/biz/jensen' },
      { website: 'https://www.krak.dk/jensen' },
      { website: 'https://tandlaegeguiden.dk/jensen' },
      { website: 'https://jensen-tand.dk/' },
      { website: 'https://tandlaegejensen.dk/' },
    ];
    expect(pickPlaceSite('Tandlæge Jensen', results, dentist)?.website).toBe('https://tandlaegejensen.dk/');
    expect(pickPlaceSite('Tandlæge Jensen', results.slice(0, 3), dentist)).toBeNull();
    expect(pickPlaceSite('Jensen', [{ website: 'https://jensen@gmail.com' }, { website: 'https://facebook.com/jensen' }])).toBeNull();
  });
});
