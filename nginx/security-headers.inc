# Shared security headers — included at server level AND in every location
# that sets its own add_header (Nginx does NOT inherit server-level
# add_header into a location that declares any add_header).
# The CSP originates are enumerated from the codebase (Supabase, Sentry,
# Google Fonts, YouTube/Google Maps embeds, Nominatim). If a new external
# resource is added, update this list or it will be blocked.

add_header X-Content-Type-Options "nosniff" always;
add_header X-Frame-Options "SAMEORIGIN" always;
add_header Referrer-Policy "strict-origin-when-cross-origin" always;
add_header Permissions-Policy "geolocation=(self), camera=(), microphone=()" always;
add_header Content-Security-Policy "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com data:; img-src 'self' data: blob: https://*.supabase.co; media-src 'self' blob: https://*.supabase.co; connect-src 'self' https://*.supabase.co https://*.sentry.io https://nominatim.openstreetmap.org; frame-src 'self' https://www.youtube.com https://www.youtube-nocookie.com https://www.google.com; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'self'" always;
