import {
  type GatewayPeek,
  type GatewaySession,
  type GatewayUpdates,
  type Invitation,
  addTeamMember,
  checkGatewayUpdates,
  gatewaySession,
  gatewayUpdates,
  getCoreClient,
  joinGateway,
  onGateway,
  peekGatewayUpdates,
  reinviteTeamMember,
  reloadGateway,
  removeTeamMember,
  setGatewayAutoCheck,
  signInToGateway,
  teamMembers,
  updateGateway,
} from "@/core/client"
import type { GatewayMember } from "@/core/types"

/**
 * The gateway's own calls, which sit beside the core client rather than in
 * it (ADR-0016, ADR-0063, ADR-0077): its door (session, sign-in, joining),
 * its team, and the server's updates. The screens that use them (the door,
 * Team members, About › Server) go through `gateway()`, so the in-memory
 * demo's scenarios can stand in for a gateway the demo doesn't have
 * (`core/demo-scenarios/settings.ts`). On a real gateway, and in the desktop
 * app, these are exactly the functions in `core/client.ts`. The desktop
 * app's own updater is `update-client.ts`.
 */
export interface GatewayClient {
  /** The gateway's session, or `null` when no gateway serves this page. */
  session(): Promise<GatewaySession | null>
  signIn(password: string, email?: string): Promise<void>
  join(code: string, password: string): Promise<void>
  members(): Promise<GatewayMember[]>
  addMember(name: string, email: string): Promise<Invitation>
  newLink(id: string): Promise<Invitation>
  removeMember(id: string): Promise<void>
  updates(): Promise<GatewayUpdates>
  check(): Promise<GatewayUpdates>
  setAutoCheck(on: boolean): Promise<GatewayUpdates>
  update(tag: string): Promise<GatewayUpdates>
  reload(): Promise<GatewayUpdates>
  /** One look while the gateway may be restarting. Never throws. */
  peek(): Promise<GatewayPeek>
}

const REAL: GatewayClient = {
  session: gatewaySession,
  signIn: signInToGateway,
  join: joinGateway,
  members: teamMembers,
  addMember: addTeamMember,
  newLink: reinviteTeamMember,
  removeMember: removeTeamMember,
  updates: gatewayUpdates,
  check: checkGatewayUpdates,
  setAutoCheck: setGatewayAutoCheck,
  update: updateGateway,
  reload: reloadGateway,
  peek: peekGatewayUpdates,
}

let stand: Partial<GatewayClient> | null = null

/** Only the in-memory demo's scenarios call this; a gateway, the desktop app and the phone never do. */
export function standInForGateway(calls: Partial<GatewayClient>) {
  stand = { ...stand, ...calls }
}

/** The gateway's calls: a demo scenario's stand-in where one is set, otherwise the gateway's own. */
export function gateway(): GatewayClient {
  return stand && !onGateway() ? { ...REAL, ...stand } : REAL
}

/**
 * The session the door asks about before anything else. On a gateway it is
 * asked at once; anywhere else, once the demo has started (its scenarios run
 * as it starts), so a scenario can stand in for a gateway's door.
 */
export async function doorSession(): Promise<GatewaySession | null> {
  if (onGateway()) return gatewaySession()
  await getCoreClient()
  return gateway().session()
}
