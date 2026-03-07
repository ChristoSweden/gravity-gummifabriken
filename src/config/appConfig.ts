/**
 * Global App Configuration
 * Allows easy white-labeling and location-based customization.
 * Set VITE_ env vars in .env to override defaults.
 */
export const APP_CONFIG = {
    APP_NAME: import.meta.env.VITE_APP_NAME || 'Gravity',
    LOCATION_NAME: import.meta.env.VITE_LOCATION_NAME || 'Gummifabriken',
    RADAR_RADIUS: import.meta.env.VITE_RADAR_RADIUS || '150m',
    DEFAULT_VISIBILITY: 'All of Gummifabriken',

    // Venue GPS coordinates — update VITE_VENUE_LAT / VITE_VENUE_LNG in .env
    // Default: Gummifabriken, Värnamo, Sweden
    VENUE_LAT: parseFloat(import.meta.env.VITE_VENUE_LAT || '57.1826'),
    VENUE_LNG: parseFloat(import.meta.env.VITE_VENUE_LNG || '13.9456'),
    // Radius in metres for presence detection (Plan A GPS geofencing)
    PRESENCE_RADIUS_M: parseInt(import.meta.env.VITE_PRESENCE_RADIUS_M || '200', 10),

    // Admin email (comma-separated list) — only these users see the /admin page
    ADMIN_EMAILS: (import.meta.env.VITE_ADMIN_EMAILS || '').split(',').map((e: string) => e.trim().toLowerCase()).filter(Boolean),

    THEME: {
        PRIMARY_LABEL: 'Nano Banana Edition',
        FONT_BRAND: 'Playfair Display',
    }
};
