import { describe, it, expect } from 'vitest';

interface Profile {
    id: string;
    interests: string[];
}

const calculateMatchPercentage = (me: Profile, other: Profile) => {
    if (!me.interests || !other.interests || me.interests.length === 0) return 0;

    const myInterestsSet = new Set(me.interests.map((i) => i.toLowerCase()));
    const overlap = other.interests.filter((i) =>
        myInterestsSet.has(i.toLowerCase())
    );

    return Math.round((overlap.length / me.interests.length) * 100);
};

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

    it('should handle empty interests gracefully', () => {
        const me = { id: 'me', interests: [] };
        const other = { id: 'other', interests: ['Tech'] };
        expect(calculateMatchPercentage(me, other)).toBe(0);
    });
});
