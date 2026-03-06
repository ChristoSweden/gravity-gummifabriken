/**
 * Global App Configuration
 * Allows easy white-labeling and location-based customization.
 */
export const APP_CONFIG = {
    APP_NAME: import.meta.env.VITE_APP_NAME || 'Gravity',
    LOCATION_NAME: import.meta.env.VITE_LOCATION_NAME || 'Gummifabriken',
    RADAR_RADIUS: import.meta.env.VITE_RADAR_RADIUS || '500ft',
    DEFAULT_VISIBILITY: 'All of Gummifabriken',
    THEME: {
        PRIMARY_LABEL: 'Nano Banana Edition',
        FONT_BRAND: 'Playfair Display',
    }
};
