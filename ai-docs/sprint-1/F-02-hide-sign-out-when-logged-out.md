# F-02 Hide "Sign out" when logged out

## Problem
`web/src/components/AppNav.vue` renders a "Sign out" button on the public page even before any login.

## GOOD
- Visitors never see auth controls they cannot use. Public page shows at most a discreet "Login" link (or nothing).
- No flash of the wrong state while `/api/auth/me` is loading.

## DONE
- [ ] Nav shows "Sign out" only when `auth.user` is set; shows nothing (or "Login") otherwise.
- [ ] No flash on first load (loading state handled).
- [ ] Verified in browser: `/` logged out, `/` logged in as couple, after sign out.
- [ ] `progress.md` updated.
