import { describe, it, expect } from 'vitest';
import { calculateMatchPercentage, getInterestOverlap } from '../utils/matching';

describe('Matching Algorithm', () => {
    it('should calculate 100% match for identical interests', () => {
        const me = { id: 'me', interests: ['Tech', 'Design', 'AI'] };
        const other = { id: 'other', interests: ['tech', 'design', 'ai'] };
        expect(calculateMatchPercentage(me, other)).toBe(100);
    });

    it('should calculate 33% match for partial interests', () => {
        const me = { id: 'me', interests: ['Tech', 'Design', 'AI'] };
        const other = { id: 'other', interests: ['Tech', 'Cooking', 'Music'] };
        expect(calculateMatchPercentage(me, other)).toBe(33);
    });

    it('should calculate 0% match for no overlapping interests', () => {
        const me = { id: 'me', interests: ['Tech', 'Design'] };
        const other = { id: 'other', interests: ['Cooking', 'Music'] };
        expect(calculateMatchPercentage(me, other)).toBe(0);
    });

    it('should handle null or undefined interests gracefully', () => {
        const me = { id: 'me', interests: [] };
        // @ts-ignore
        const other = { id: 'other', interests: null };
        expect(calculateMatchPercentage(me, other)).toBe(0);
        // @ts-ignore
        expect(getInterestOverlap(me, other)).toEqual([]);
    });

    it('should handle mixed case interests correctly', () => {
        const me = { id: 'me', interests: ['TECH', 'design'] };
        const other = { id: 'other', interests: ['tech', 'DESIGN'] };
        expect(calculateMatchPercentage(me, other)).toBe(100);
        expect(getInterestOverlap(me, other)).toEqual(['tech', 'DESIGN']);
    });

    it('should handle empty interests gracefully', () => {
        const me = { id: 'me', interests: [] };
        const other = { id: 'other', interests: ['Tech'] };
        expect(calculateMatchPercentage(me, other)).toBe(0);
    });

    it('should return correct overlap list', () => {
        const me = { id: 'me', interests: ['Tech', 'Design', 'AI'] };
        const other = { id: 'other', interests: ['tech', 'Cooking', 'AI'] };
        expect(getInterestOverlap(me, other)).toEqual(['tech', 'AI']);
    });
});
