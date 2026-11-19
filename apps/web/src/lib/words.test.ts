import { describe, expect, it } from 'vitest';
import { amountInWords, numberToWordsEn, numberToWordsFr } from './words.ts';

describe('amounts in words (spec 036)', () => {
  it('writes French numbers as on a building invoice', () => {
    expect(numberToWordsFr(21)).toBe('vingt et un');
    expect(numberToWordsFr(71)).toBe('soixante et onze');
    expect(numberToWordsFr(80)).toBe('quatre-vingts');
    expect(numberToWordsFr(92)).toBe('quatre-vingt-douze');
    expect(numberToWordsFr(200)).toBe('deux cents');
    expect(numberToWordsFr(250)).toBe('deux cent cinquante');
    expect(numberToWordsFr(1000)).toBe('mille');
    expect(numberToWordsFr(80_000)).toBe('quatre-vingt mille');
    expect(numberToWordsFr(200_000)).toBe('deux cent mille');
    expect(numberToWordsFr(1_500_000)).toBe('un million cinq cent mille');
    expect(numberToWordsFr(15_615_000)).toBe('quinze millions six cent quinze mille');
    expect(numberToWordsFr(2_000_000_000)).toBe('deux milliards');
  });

  it('names the currency, in French and English', () => {
    expect(amountInWords(1_500_000, 'XOF', 'fr')).toBe('un million cinq cent mille francs CFA');
    expect(amountInWords(1_500_000, 'XOF', 'en')).toBe('one million five hundred thousand CFA francs');
    expect(numberToWordsEn(1_234)).toBe('one thousand two hundred and thirty-four');
    expect(amountInWords(125_050, 'EUR', 'fr')).toBe('mille deux cent cinquante euros et cinquante centimes');
  });
});
