
CREATE POLICY "drive read own" ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'drive' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "drive insert own" ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'drive' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "drive update own" ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'drive' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "drive delete own" ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'drive' AND (storage.foldername(name))[1] = auth.uid()::text);
