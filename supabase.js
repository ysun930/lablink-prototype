import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm';

const SUPABASE_URL = 'https://ytplppvxndtkzgurbubf.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inl0cGxwcHZ4bmR0a3pndXJidWJmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODUxNjgxNjYsImV4cCI6MjEwMDc0NDE2Nn0.aS1s9X9FtL-5Mlr2zBnEu78sXVGCULhvzkUkzYe51Vk';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
