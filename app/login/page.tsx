import { redirect } from 'next/navigation';
import { AuthScreen } from '@/components/auth-screen';
import { LoginForm } from '@/components/login-form';
import { hasSupabasePublicEnv } from '@/lib/supabase-config';
import { getSupabaseServerClient } from '@/lib/supabase-server';

export default async function LoginPage() {
  if (!hasSupabasePublicEnv()) {
    return (
      <AuthScreen
        icon="•••"
        title="Image prep, beautifully simple"
        description="Add your Supabase environment variables to enable authentication and private storage."
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
      icon="→"
      title="Sign in to your workspace"
      description="Private image processing, export presets, and clean email-ready downloads in one calm place."
    >
      <LoginForm />
    </AuthScreen>
  );
}

