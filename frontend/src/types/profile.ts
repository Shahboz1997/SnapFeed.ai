export interface UserProfile {
  id: string;
  email: string | null;
  full_name: string | null;
  avatar_url: string | null;
  credits: number;
  plan: string;
  created_at?: string;
}

export const DEFAULT_FREE_CREDITS = 0;
