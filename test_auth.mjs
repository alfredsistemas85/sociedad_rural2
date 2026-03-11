import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://femssmavaaipmrgdnqpa.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZlbXNzbWF2YWFpcG1yZ2RucXBhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMwMzk2NTMsImV4cCI6MjA4ODYxNTY1M30._MpV9ntiBTydQVbqPdijkSNr4nmnGP5nvzAcfAUbI7w';

const supabase = createClient(supabaseUrl, supabaseKey);

async function testSignup() {
    console.log("Attempting to sign up admin@sociedadrural.com...");
    const { data, error } = await supabase.auth.signUp({
        email: 'admin@sociedadrural.com',
        password: 'admin1234'
    });

    if (error) {
        console.error("Signup failed:", error.message);
        if (error.cause) console.error("Cause:", error.cause);
    } else {
        console.log("Signup successful!");
        console.log(data);
    }
}

testSignup();
