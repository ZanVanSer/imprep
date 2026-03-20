import { ReactNode } from 'react';

interface AuthScreenProps {
  title: string;
  description: string;
  icon: string;
  children?: ReactNode;
}

export function AuthScreen({ title, description, icon, children }: AuthScreenProps) {
  return (
    <main className="auth-shell">
      <section className="auth-card">
        <div className="auth-brand">
          <span className="auth-brand-mark" aria-hidden="true">
            {icon}
          </span>
          <strong>imprep</strong>
        </div>
        <div className="auth-copy">
          <h1>{title}</h1>
          <p>{description}</p>
        </div>
        {children}
      </section>
    </main>
  );
}
