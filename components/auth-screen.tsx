import { ReactNode } from 'react';

interface AuthScreenProps {
  title: string;
  description: string;
  icon: string;
  children?: ReactNode;
}

export function AuthScreen({ title, description, icon, children }: AuthScreenProps) {
  return (
    <main className="page-shell page-shell-auth">
      <section className="auth-stage">
        <div className="auth-brand">
          <span className="auth-brand-mark">i</span>
          <strong>imprep</strong>
        </div>
        <section className="panel auth-panel">
          <div className="auth-orbit auth-orbit-large" />
          <div className="auth-orbit auth-orbit-small" />
          <div className="auth-cloud auth-cloud-left" />
          <div className="auth-cloud auth-cloud-right" />
          <div className="auth-icon" aria-hidden="true">
            <span>{icon}</span>
          </div>
          <div className="auth-copy">
            <h1>{title}</h1>
            <p>{description}</p>
          </div>
          {children}
        </section>
      </section>
    </main>
  );
}

