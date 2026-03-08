import { describe, it, expect } from 'vitest';
import { APP_CONFIG } from '../config/appConfig';

describe('App Config', () => {
  it('has required config values', () => {
    expect(APP_CONFIG.APP_NAME).toBeTruthy();
    expect(APP_CONFIG.LOCATION_NAME).toBeTruthy();
    expect(APP_CONFIG.RADAR_RADIUS).toBeTruthy();
    expect(typeof APP_CONFIG.VENUE_LAT).toBe('number');
    expect(typeof APP_CONFIG.VENUE_LNG).toBe('number');
    expect(typeof APP_CONFIG.PRESENCE_RADIUS_M).toBe('number');
  });

  it('ADMIN_EMAILS is an array', () => {
    expect(Array.isArray(APP_CONFIG.ADMIN_EMAILS)).toBe(true);
  });

  it('venue coordinates are valid lat/lng', () => {
    expect(APP_CONFIG.VENUE_LAT).toBeGreaterThanOrEqual(-90);
    expect(APP_CONFIG.VENUE_LAT).toBeLessThanOrEqual(90);
    expect(APP_CONFIG.VENUE_LNG).toBeGreaterThanOrEqual(-180);
    expect(APP_CONFIG.VENUE_LNG).toBeLessThanOrEqual(180);
  });

  it('presence radius is positive', () => {
    expect(APP_CONFIG.PRESENCE_RADIUS_M).toBeGreaterThan(0);
  });
});
