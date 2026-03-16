import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  'https://mfrznptedaoqyifroypu.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1mcnpucHRlZGFvcXlpZnJveXB1Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MjE5NjIwMiwiZXhwIjoyMDg3NzcyMjAyfQ.p2cOreQvTVw05rRUytiks8SIyx0927e2BbuOe3UFlGU'
);

const { data, error } = await supabase
  .from('posts')
  .delete()
  .eq('title', 'test title');

if (error) console.error('Error:', error);
else console.log('Deleted successfully');
