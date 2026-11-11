import type { Run } from '../sim/run'

/**
 * Things done at sea that open something ashore.
 *
 * Doubloons buy; feats permit. Keeping the two apart is what stops the yard
 * being a price list: the Galleon is not for sale until a Galleon has been
 * beaten, however deep the purse, and a card is not in the draft until the
 * thing it is about has actually been done once. Each feat names the next
 * thing worth trying, which is a better reason to put to sea than a number
 * going up.
 *
 * `done` is asked of the run in progress and the career so far, and has to be
 * true-forever once true: feats are recorded, never re-derived.
 */
export interface Feat {
  id: string
  name: string
  /** What has to be done, as an instruction. */
  how: string
  /** What it opens, as a noun phrase. */
  opens: string
  /** Doubloons paid on the spot. */
  bounty: number
  done: (run: Run, career: FeatCareer) => boolean
}

/** The part of a career a feat may look at. */
export interface FeatCareer {
  /** Hulls sunk or taken across every voyage, this one included. */
  beaten: number
}

const beat = (run: Run, id: string) => (run.sunkBy.get(id) ?? 0) + (run.takenBy.get(id) ?? 0)
const home = (run: Run) => run.endless || run.state === 'won'

export const FEATS: Feat[] = [
  {
    id: 'struck-colours', name: 'Struck Colours',
    how: 'Take a ship whole: cut up her rigging or her crew, then come alongside.',
    opens: 'Prize Crews in the draft', bounty: 100,
    done: (run) => run.shipsTaken > 0,
  },
  {
    id: 'slipped-the-noose', name: 'Slipped the Noose',
    how: "Stay afloat until the Man-o'-War gives up the chase.",
    opens: 'Storm Canvas in the draft', bounty: 150,
    done: (run) => run.huntersSlipped > 0,
  },
  {
    id: 'well-found', name: 'Well Found',
    how: 'Reach level 10 in a single voyage.',
    opens: 'Carronades in the draft', bounty: 150,
    done: (run) => run.level >= 10,
  },
  {
    id: 'home-and-dry', name: 'Home and Dry',
    how: 'Complete a voyage.',
    opens: 'Letters of Marque in the draft, and the notoriety ladder', bounty: 300,
    done: home,
  },
  {
    id: 'scourge', name: 'Scourge',
    how: 'Sink or take 60 ships across your career.',
    opens: 'Iron Knees in the draft', bounty: 300,
    done: (_run, career) => career.beaten >= 60,
  },
  {
    id: 'cutting-out', name: 'Cutting Out',
    how: 'Take a Frigate as a prize.',
    opens: 'the Frigate at the yard', bounty: 400,
    done: (run) => (run.takenBy.get('frigate') ?? 0) > 0,
  },
  {
    id: 'treasure-fleet', name: 'Treasure Fleet',
    how: 'Sink or take a Galleon.',
    opens: 'the Galleon at the yard', bounty: 500,
    done: (run) => beat(run, 'galleon') > 0,
  },
  {
    id: 'wanted', name: 'Wanted',
    how: 'Complete a voyage at notoriety 2 or higher.',
    opens: 'Boarding Axes in the draft', bounty: 600,
    done: (run) => home(run) && run.voyage.notoriety >= 2,
  },
  {
    id: 'turnabout', name: 'Turnabout',
    how: "Sink or take the Man-o'-War that hunts you.",
    opens: "the Man-o'-War at the yard", bounty: 1500,
    done: (run) => run.huntersBeaten > 0,
  },
  {
    id: 'sailed-on', name: 'Sailed On',
    how: 'Reach the fourth wave after a completed voyage.',
    opens: 'a bounty', bounty: 1200,
    done: (run) => run.wave >= 4,
  },
  {
    id: 'dread', name: 'Dread',
    how: 'Complete a voyage at notoriety 6 or higher.',
    opens: 'a bounty', bounty: 4000,
    done: (run) => home(run) && run.voyage.notoriety >= 6,
  },
  {
    id: 'myth', name: 'Myth',
    how: 'Complete a voyage at notoriety 10.',
    opens: 'nothing. There is nothing left.', bounty: 10000,
    done: (run) => home(run) && run.voyage.notoriety >= 10,
  },
]

export const FEATS_BY_ID = new Map(FEATS.map((f) => [f.id, f]))
