import { redirect } from 'next/navigation';
import { AuthScreen } from '@/components/auth-screen';
import { LoginForm } from '@/components/login-form';
import { hasSupabasePublicEnv } from '@/lib/supabase-config';
import { getSupabaseServerClient } from '@/lib/supabase-server';

export default async function LoginPage() {
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
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (user) {
    redirect('/');
  }

  return (
    <AuthScreen
      icon="in"
      title="Sign in"
      description="Use your workspace credentials to upload, process, and download image batches."
    >
      <LoginForm />
    </AuthScreen>
  );
}
