import { Link } from '@tanstack/react-router'

export function AppFooter() {
  return (
    <footer className="border-t border-border/60 py-8 text-center text-sm text-muted-foreground">
      <p>Mit Liebe gemacht</p>
      <Link to="/login" className="mt-2 inline-block text-xs text-muted-foreground/60 underline-offset-4 hover:underline">
        Login
      </Link>
    </footer>
  )
}
