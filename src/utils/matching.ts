export interface MatchableProfile {
    id: string;
    interests: string[];
}

/**
 * Calculates the percentage of overlap between two sets of interests.
 * Returns a rounded integer from 0 to 100.
 */
export const calculateMatchPercentage = (me: MatchableProfile, other: MatchableProfile): number => {
    if (!me.interests || !other.interests || me.interests.length === 0) return 0;

    const myInterestsSet = new Set(me.interests.map((i) => i.toLowerCase()));
    const overlap = other.interests.filter((i) =>
        myInterestsSet.has(i.toLowerCase())
    );

    return Math.round((overlap.length / me.interests.length) * 100);
};

/**
 * Returns the array of overlapping interests between two profiles.
 */
export const getInterestOverlap = (me: MatchableProfile, other: MatchableProfile): string[] => {
    if (!me.interests || !other.interests) return [];
    const myInterestsSet = new Set(me.interests.map((i) => i.toLowerCase()));
    return other.interests.filter((i) => myInterestsSet.has(i.toLowerCase()));
};
