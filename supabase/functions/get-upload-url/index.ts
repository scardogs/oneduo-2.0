/**
 * Get Signed Upload URL
 * Returns a signed URL for direct-to-storage uploads
 * Bypasses edge function body limits for large files
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface UploadUrlRequest {
  path: string;
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    // Create admin client
    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false },
    });

    const { path } = (await req.json()) as UploadUrlRequest;

    // AUTO-FIX: Ensure storage buckets allow large files (50GB)
    // This is a robust fallback for when database migrations fail
    try {
      const { error: bucketError } = await supabase.storage.updateBucket('video-uploads', {
        max_file_size: 53687091200, // 50GB
        public: true
      });
      if (bucketError) console.warn('[get-upload-url] Could not update video-uploads bucket limit:', bucketError.message);

      await supabase.storage.updateBucket('course-files', {
        max_file_size: 53687091200, // 50GB
        public: true
      });
    } catch (e) {
      console.warn('[get-upload-url] Bucket auto-fix error:', e);
    }

    if (!path) {

      return new Response(JSON.stringify({ error: 'path is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Basic path hardening (client also sanitizes)
    if (
      path.startsWith('/') ||
      path.includes('..') ||
      path.length > 1024 ||
      !/^[a-zA-Z0-9/_\-\.]+$/.test(path)
    ) {
      return new Response(JSON.stringify({ error: 'invalid path' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`[get-upload-url] Creating signed upload URL for: ${path}`);
    // Create signed upload URL
    // Some project configurations reject { upsert: true } on signed uploads
    // We increase expiration to 6 hours to handle extremely slow connections for large videos
    const { data, error } = await supabase.storage
      .from('video-uploads')
      .createSignedUploadUrl(path, { expiresIn: 60 * 60 * 6 });


    if (error) {
      console.error(`[get-upload-url] Storage error for path ${path}:`, error);
      return new Response(
        JSON.stringify({ error: 'Failed to generate upload URL', details: error.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({
        path,
        signedUrl: data.signedUrl,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (err) {
    console.error('[get-upload-url] Error:', err);
    const message = err instanceof Error ? err.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: 'Internal server error', details: message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

