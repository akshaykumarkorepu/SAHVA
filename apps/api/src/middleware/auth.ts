import { Request, Response } from 'express';
import { createClient } from '@supabase/supabase-js';
import { createScopedClient } from '../lib/supabase';

/**
 * Middleware to validate Supabase Auth JWT and attach a scoped client to the request.
 */
export const authenticate = async (req: Request, res: Response, next: (err?: any) => void) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing or invalid authorization header' });
  }

  const jwt = authHeader.split(' ')[1];

  try {
    // Use the environment variables or placeholders
    const url = process.env.SUPABASE_URL || 'https://placeholder.supabase.co';
    const anonKey = process.env.SUPABASE_ANON_KEY || 'placeholder-key';

    const supabase = createClient(url, anonKey);

    const { data: { user }, error } = await supabase.auth.getUser(jwt);

    if (error || !user) {
      return res.status(401).json({ error: 'Invalid or expired token' });
    }

    // Attach the verified user and a scoped client for RLS-enabled queries
    req.user = {
      id: user.id,
      email: user.email,
    };

    req.supabaseClient = createScopedClient(jwt);

    next();
  } catch (err) {
    console.error('[auth middleware error]', err);
    return res.status(500).json({ error: 'Internal authorization error' });
  }
};
