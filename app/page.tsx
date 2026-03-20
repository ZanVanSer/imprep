import { redirect } from 'next/navigation';
import { AuthScreen } from '@/components/auth-screen';
import { WorkspaceClient } from '@/components/workspace-client';
import { hasSupabasePublicEnv } from '@/lib/supabase-config';
import { getSupabaseServerClient } from '@/lib/supabase-server';

export default async function HomePage() {
  if (!hasSupabasePublicEnv()) {
    return (
      <AuthScreen
        icon="im"
        title="Set up Supabase to continue"
        description="Add the public Supabase environment variables to enable sign-in and private storage."
      />
    );
  }

  const supabase = await getSupabaseServerClient();
  const [
    {
      data: { user }
    },
    {
      data: { session }
    }
  ] = await Promise.all([supabase.auth.getUser(), supabase.auth.getSession()]);

  if (!user || !session) {
    redirect('/login');
  }

  return <WorkspaceClient initialSession={session} />;
}
