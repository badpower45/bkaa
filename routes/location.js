import express from 'express';
import { verifyToken, isAdmin } from '../middleware/auth.js';

const router = express.Router();

/**
 * Extract coordinates from Google Maps link
 * Supports multiple Google Maps URL formats
 */
router.post('/extract-coordinates', [verifyToken, isAdmin], async (req, res) => {
    try {
        const { google_maps_link } = req.body;
        
        if (!google_maps_link) {
            return res.status(400).json({ error: 'Google Maps link is required' });
        }

        let lat = null, lng = null;
        
        // Format 1: @30.0444196,31.2357116
        const coordsMatch = google_maps_link.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/);
        if (coordsMatch) {
            lat = parseFloat(coordsMatch[1]);
            lng = parseFloat(coordsMatch[2]);
        }
        
        // Format 2: q=30.0444196,31.2357116
        if (!lat) {
            const qMatch = google_maps_link.match(/q=(-?\d+\.\d+),(-?\d+\.\d+)/);
            if (qMatch) {
                lat = parseFloat(qMatch[1]);
                lng = parseFloat(qMatch[2]);
            }
        }
        
        // Format 3: ll=30.0444196,31.2357116
        if (!lat) {
            const llMatch = google_maps_link.match(/ll=(-?\d+\.\d+),(-?\d+\.\d+)/);
            if (llMatch) {
                lat = parseFloat(llMatch[1]);
                lng = parseFloat(llMatch[2]);
            }
        }
        
        // Format 4: /maps/place/@30.0444196,31.2357116,15z
        if (!lat) {
            const placeMatch = google_maps_link.match(/\/maps\/place\/@(-?\d+\.\d+),(-?\d+\.\d+)/);
            if (placeMatch) {
                lat = parseFloat(placeMatch[1]);
                lng = parseFloat(placeMatch[2]);
            }
        }
        
        // Format 5: plus codes like 2GVP+G7
        if (!lat) {
            const plusCodeMatch = google_maps_link.match(/plus\.codes\/([A-Z0-9+]+)/i);
            if (plusCodeMatch) {
                return res.status(400).json({ 
                    error: 'Plus codes are not supported. Please use a link with coordinates.',
                    suggestion: 'Right-click on the location in Google Maps and select "What\'s here?" to get coordinates'
                });
            }
        }

        if (!lat || !lng) {
            return res.status(400).json({ 
                error: 'Could not extract coordinates from link',
                supported_formats: [
                    'https://www.google.com/maps/@30.0444196,31.2357116,15z',
                    'https://maps.google.com/?q=30.0444196,31.2357116',
                    'https://www.google.com/maps/place/@30.0444196,31.2357116'
                ],
                suggestion: 'Copy the link from Google Maps URL bar or share button'
            });
        }

        res.json({ 
            data: { 
                latitude: lat, 
                longitude: lng,
                google_maps_url: `https://www.google.com/maps/@${lat},${lng},15z`
            },
            message: 'Coordinates extracted successfully' 
        });
    } catch (err) {
        console.error('Error extracting coordinates:', err);
        res.status(500).json({ error: err.message });
    }
});

/**
 * Validate coordinates
 */
router.post('/validate-coordinates', [verifyToken, isAdmin], async (req, res) => {
    try {
        const { latitude, longitude } = req.body;
        
        if (latitude === undefined || longitude === undefined) {
            return res.status(400).json({ error: 'Latitude and longitude are required' });
        }
        
        const lat = parseFloat(latitude);
        const lng = parseFloat(longitude);
        
        // Validate ranges
        if (isNaN(lat) || lat < -90 || lat > 90) {
            return res.status(400).json({ 
                error: 'Invalid latitude. Must be between -90 and 90',
                received: latitude
            });
        }
        
        if (isNaN(lng) || lng < -180 || lng > 180) {
            return res.status(400).json({ 
                error: 'Invalid longitude. Must be between -180 and 180',
                received: longitude
            });
        }
        
        // Check if within Egypt (approximate bounds)
        const isInEgypt = lat >= 22 && lat <= 32 && lng >= 25 && lng <= 37;
        
        res.json({
            data: {
                latitude: lat,
                longitude: lng,
                is_valid: true,
                is_in_egypt: isInEgypt,
                google_maps_url: `https://www.google.com/maps/@${lat},${lng},15z`
            },
            message: 'Coordinates validated successfully'
        });
    } catch (err) {
        console.error('Error validating coordinates:', err);
        res.status(500).json({ error: err.message });
    }
});

/**
 * Generate Google Maps link from coordinates
 */
router.post('/generate-maps-link', async (req, res) => {
    try {
        const { latitude, longitude, zoom = 15 } = req.body;
        
        if (!latitude || !longitude) {
            return res.status(400).json({ error: 'Latitude and longitude are required' });
        }
        
        const lat = parseFloat(latitude);
        const lng = parseFloat(longitude);
        
        if (isNaN(lat) || isNaN(lng)) {
            return res.status(400).json({ error: 'Invalid coordinates format' });
        }
        
        const googleMapsUrl = `https://www.google.com/maps/@${lat},${lng},${zoom}z`;
        const googleMapsSearchUrl = `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
        const googleMapsDirectionsUrl = `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`;
        
        res.json({
            data: {
                view_url: googleMapsUrl,
                search_url: googleMapsSearchUrl,
                directions_url: googleMapsDirectionsUrl,
                embed_url: `https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d${1000000/zoom}!2d${lng}!3d${lat}!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x0%3A0x0!2zM0wrMzAuMDQ0NCwgMzEuMjM1Nw!5e0!3m2!1sen!2seg!4v1234567890123!5m2!1sen!2seg`
            },
            message: 'Google Maps links generated successfully'
        });
    } catch (err) {
        console.error('Error generating maps link:', err);
        res.status(500).json({ error: err.message });
    }
});

export default router;
