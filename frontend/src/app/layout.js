import './globals.css';
import './ide.css';
import './evaluate/evaluate.css';
import { AuthProvider } from '@/lib/auth';

export const metadata = {
  title: 'GroupHub — Collaborate with Your Team',
  description: 'Create and manage groups effortlessly. Invite members with a unique code and collaborate in real-time.',
  keywords: 'groups, teams, collaboration, management',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" data-scroll-behavior="smooth">
      <body>
        <AuthProvider>
          {children}
        </AuthProvider>
      </body>
    </html>
  );
}
