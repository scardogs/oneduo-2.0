-- Increase maximum file size for storage buckets to 50GB
-- 50GB = 53,687,091,200 bytes

UPDATE storage.buckets
SET max_file_size = 53687091200
WHERE id IN ('video-uploads', 'course-files');

-- Ensure the buckets exist if they don't already (defensive)
INSERT INTO storage.buckets (id, name, public, max_file_size)
VALUES 
  ('video-uploads', 'video-uploads', true, 53687091200),
  ('course-files', 'course-files', true, 53687091200)
ON CONFLICT (id) DO UPDATE 
SET max_file_size = 53687091200, public = true;
