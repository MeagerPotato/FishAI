/**
 * `/play/room` and `/play/room/:code` — a table shared by six people instead of one
 * person and five bots.
 *
 * PLACEHOLDER. This file exists so the route seam is settled before the room layer is
 * written against it; the implementation replaces the body, not the export.
 *
 * The shape it has to fill, recorded here so the seam and the implementation agree:
 *
 *  - `/play/room` with no code creates or joins; `/play/room/:code` is the shareable
 *    link, and the code in the URL is the whole invitation.
 *  - Six seats, no bots. Below six, players pick a side; the deal needs all six,
 *    because 54 cards divide evenly among 6 and not among 4 or 5.
 *  - The authority is the `room` Edge Function running lib/engine — the same reducer
 *    this site has always used. The browser never holds anyone else's hand, because
 *    `rooms` carries publicView() and hands live in `room_private`, which anon cannot
 *    read at all.
 */
import { Section, SectionHead } from '../../components/index.ts'
import { LabShell } from '../../lab/ui/LabShell.tsx'

export function RoomPage() {
  return (
    <LabShell current="/play" docTitle="Room" ground="dots" stamp="us54 · shared table" which="v2">
      <Section noRule badge="Room">
        <SectionHead
          level="h1"
          lines={['A table for six,', '*no bots*.']}
          sub="Not wired up yet."
        />
      </Section>
    </LabShell>
  )
}

export default RoomPage
