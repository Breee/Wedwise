import { t } from '@/lib/i18n'
import { createFileRoute } from '@tanstack/react-router'
import { errorMessage } from '@/lib/api'
import { inviteLinkQuery } from '@/lib/queries'
import { Card, CardContent } from '@/components/ui/card'
import { RsvpHeader } from '@/components/rsvp/RsvpForm'
import { Invitation } from '@/components/rsvp/Invitation'

export const Route = createFileRoute('/rsvp/$link')({
  loader: ({ context, params }) => context.queryClient.ensureQueryData(inviteLinkQuery(params.link)),
  errorComponent: ({ error }) => (
    <section className="mx-auto max-w-2xl px-6 py-16">
      <RsvpHeader />
      <Card className="text-center">
        <CardContent className="py-10 text-muted-foreground">
          {errorMessage(error, t('Dieser Einladungslink ist nicht gültig.'))}
          <a href="/" className="mt-4 block text-primary underline underline-offset-4">{t('Zur Hochzeitsseite')}</a>
        </CardContent>
      </Card>
    </section>
  ),
  component: () => <Invitation link={Route.useParams().link} />,
})

