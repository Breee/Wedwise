import { Link } from '@tanstack/react-router'

export function AppFooter() {
  return (
    <footer className="border-t border-border/60 py-8 text-center text-sm text-muted-foreground">
      <p>
        Mit Liebe gemacht ·{' '}
        <Link to="/login" className="underline-offset-4 hover:underline">
          Login
        </Link>
      </p>
    </footer>
  )
}
