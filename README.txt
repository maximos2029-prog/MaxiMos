MaxiMos Admin Fix

Upload index.html to your GitHub repository, replacing the existing index.html.
Wait for Vercel deployment to finish, then open the site in a fresh tab.

This update avoids a global-name collision between the Supabase UMD CDN script
(which exposes window.supabase) and the site's own Supabase client variable.

The live Supabase project/database has not been tested from this package.
