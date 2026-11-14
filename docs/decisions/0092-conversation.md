# ADR-0092 · The conversation: meta line and toolbar, rows and rules, the reply field, the summary

- **Status:** Accepted for the build. It records no change to a decision on record of its own. It cites [DC11](0090-mail-lists.md) (message heads keep their faces, ADR-0027) and builds what brief 6.3 adds to Mobile / 02 and Desktop / 01 (the toolbar on the meta line, Star, Snooze and Mark unread in a phone's More, the reply field's expand, the notice slot, SUGGEST REPLIES, a face per message head). The sender's column beside a wide conversation ([ADR-0036](0036-sender-profile.md)) gives way to a layer opened from FROM until a4 builds DC5's third column.
- **Date:** 2026-11-14
- **Builds on:** [ADR-0059](0059-opt-in-ai.md) (AI asked for, never sent unasked), [ADR-0083](0083-shell.md) (the pushed screen's top bar and bottom row), [ADR-0086](0086-status.md) (the sending strip and status line), [ADR-0087](0087-forms-and-questions.md) (`useConfirm`, the leave guard), [ADR-0088](0088-date-parts.md) (the date and time picker), [ADR-0090](0090-mail-lists.md) (row times), [ADR-0091](0091-inbox-filters.md) (the split form, the Screener).
- **Design:** brief M4, and M5's AI part, of the undrawn-areas design; Mobile / 02 and Desktop / 01's detail column, the two frames that draw a message; brief 4.0 (states, keys), X6 (questions); cross-app decisions §9, §10, §12 and §13.

The conversation was a toolbar of up to ten icon buttons over rounded message cards with shadows, a Reply and a Forward button under them, a grey card for the summary, rounded attachment pills and a grey strip for blocked images. This slice draws it as the frames do: the message is the focal point, and everything around it is a rule, a mono line or a ghost button.

## Decisions

### Top to bottom, on a desktop (Desktop / 01)

1. **The meta line.** Unicron's `MetaList`. One message: FROM · RECEIVED · ATTACHED, as drawn. A thread: FROM (the newest sender who is not you) · MESSAGES (`03`) · LATEST. ATTACHED counts the files across the conversation and is left out at 0, for one message too. A conversation of your own mail only shows TO. The FROM value is a button named "About {name}" that opens the sender's panel (today's `SenderProfile`, in an `AdaptiveDialog` of the review size, a sheet on a phone). Times are `row-time.ts`'s, as the list writes them.
2. **The toolbar,** on the same line, right: unicron's `Toolbar` named "Conversation", one Tab stop, the arrow keys along it. Archive ("Move to Inbox" in the Archive) · Snooze (a `ToolbarToggle` pressed and named "Unsnooze" while the conversation is snoozed) · Star ("Unstar" with the filled star while starred) · Mark unread · More. Brief 6.3 lists it as an addition to the frame.
3. **The title,** `type-title`, then one mono line when there is something to say: the account with two or more accounts, and `REMINDER FRI 09:00 IF NO REPLY` while a reminder waits.
4. **The notice slot,** one place under the title, holding the first notice that applies. This slice builds the Screener's notice (M3) and keeps the follow-up that came due, now unicron's `NeedsYou`: "No reply yet", "You asked to be reminded {when}.", DONE (archives, with UNDO) and the text action REMIND AGAIN. a4 adds the invitation block and "Waiting on you".
   - **New sender** (opened from the Screener): `SectionHeader` NEW SENDER, "Let {name}'s mail into your inbox?", and two secondary buttons, LET IN and SCREEN OUT. LET IN keeps the conversation open; SCREEN OUT closes it. Both toast with UNDO (ADR-0091's words). A calm notice, not a needs-you (Q9).
5. **The summary,** when AI is set up and it was asked for (More › Summarize): unicron's `SummaryBlock`. `Summary // 03 points`, the points, the footer `Newest 12 of 30 messages // {model}` (the count only when the model read part of the thread), the caption "It can be wrong. Check what matters.", COPY ("Copied" for 2 s, no toast) and CLOSE. Loading: the block's own skeleton lines with the agent's motion. Error: one line in critical ink in the model's words, TRY AGAIN and OPEN SETTINGS.
6. **The messages,** oldest first, with no cards.
   - **One message** is drawn as the frames draw it: the body under the summary, then its files. No head line: the meta line says who and when.
   - **A thread:** each message is a region named "Message from {name}". A read message that is not the newest is a compact message `ListRow` (sender, one line of the text, an attachment mark, the time), a button with `aria-expanded`. An open one has a head line: Initial Tile S with the contact's photo (DC11), the sender, "to {names}" in caption, the date and time in mono, a `Badge` SENT on your own, and UNSUBSCRIBE when the message Reply answers offers it. The head is the button that closes it again. The newest and anything unread start open, as before. Rules between messages, never boxes.
   - **The body** is `type-body`, at most the frame's reading width (720).
   - **HTML mail** stays in the sandboxed frame (DOMPurify, no scripts, a CSP that holds remote content back). The frame now takes the body role's face, size and leading and Stone's ink and link colour from the app's root, and its colour scheme from the app's theme: in Graphite the existing inversion turns the ink light, following the app's theme, not the system's (before, a dark app on a light system showed a white letter, and a light app on a dark system an inverted one). Blocked images: a compact info `Banner` "Remote images are blocked." with LOAD IMAGES.
   - **Files** are unicron's `FileChip`s: the type tag (`PDF`, `TXT`), or an image's thumbnail; the name; the size. Pressing one opens the viewer; its trailing Save saves it, the chip busy meanwhile, then the toast "Saved {file name}".
7. **After the messages:** SUGGEST REPLIES (a ghost button, with AI set up). Its answer is a `SummaryBlock` `Replies // 03` of compact rows; a pick fills the reply field and sends nothing. Then the team block's slot (the shared inbox's and the owner's panels, as they are; a8 rebuilds them). Then NOTES, as `LinkedNotes` draws it, with QUICK NOTE and NEW NOTE, not for a team member.
8. **The reply field,** pinned at the column's foot: unicron's `Composer`, "Reply to {first name}". It replies to what Reply would (in a conversation of only your own mail, to whom you wrote), quoted and signed by the same rules (`replyDraft` with the person's quote and reply-below settings, the account's signature under the words), through `queueSend` with the usual undo window, so the sending strip or status line shows it with UNDO. Return makes a new line; ⌘ or Ctrl + Return sends (brief 4.0: a form's primary), the button always. Its second leading action, Expand, opens the full message form with the words carried over. It is the screen's only Composer. A failed send keeps the words and says why in one critical line above the field (a toast on a phone, where the field is the bottom row). Typed words ask before a move away drops them: another row, Back, Esc, a place (the pane's leave guard).

### More

An `AdaptiveMenu`: a menu on a desktop, a sheet on a phone. Reply in full · Forward · Remind me if no reply… (only with your mail in the thread; Cancel reminder once set) · Summarize (AI set up) · Share with teammates… (not for a team member) · About {sender} · Unsubscribe… (when offered) · Quick note about this (not for a team member). Then a group under the sender's name: Always in People / Updates / Newsletters (radio, one checked) · New split for {domain}, or "this sender" for a mailbox provider's domain (a2's form, filled in) · Screen out sender · Block sender, which asks through `useConfirm`: "Block {name}?", "Their mail goes straight to the archive.", BLOCK; focus starts on Cancel. Remind me and Snooze open their own menu of times (the presets with their exact times, then "Pick date and time…" in the shared picker).

### A phone (Mobile / 02)

The pushed screen's top bar: Back · Archive · More, as float buttons. The More sheet starts with Star (or Unstar), Snooze… (or Unsnooze) and Mark unread, then the rows above. The `MetaList` wraps by itself. The reply field is the detail bottom row's fill. The sending strip stands above it.

### The viewer (attachment preview)

`AdaptiveDialog` of the viewer size (960), a full sheet on a phone. Overline `PDF // 84 KB`, the file's name as title, close; the image, the PDF or the text; one secondary SAVE. A kind it cannot show (and HTML, never shown) says "No preview for this kind of file." and keeps SAVE. Before, such a file saved at once when pressed.

### States

| State | What shows |
|---|---|
| Nothing open (desktop) | `MAIL` · "Nothing open." · "Pick a conversation to see it here." (`MasterDetail`) |
| Loading | a title bar and three lines, generic skeletons |
| Gone (the read failed) | `EmptyState` `MAIL` · "That conversation is gone." |
| Saving a file | the chip's busy state, then "Saved {file name}" |

### Keys and names

The mail keys act on the open conversation (`use-shortcuts.ts`, unchanged). Enter or Space opens and closes a message in a thread. Esc closes the conversation. The toolbar is one Tab stop; each icon has its name and a tooltip with its key.

### Scenarios

In `demo-scenarios/mail.ts`: `thread-5` (the token audit as five messages), `ai-on` (AI set up with a model on this computer, as Settings would), `ai-slow` and `ai-fails` (with `ai-on`), `thread-slow` and `thread-gone`.

## Verification

- `check-mail-search.sh`: typecheck, lint, build:demo, build, the notes-relay tests, the ratchet and the lockfile, all green.
- Ratchet, read from the source: className overrides **110 → 97** (`.dsa/baseline.json` lowered, `dsaVersion` kept); style 1, spread 0 and plain buttons 14 unchanged (the attachment chip's button and the message card's are gone; the FROM value and the open head's toggle are plain buttons). The look-alike estimator finds 0.
- In the browser, all asserting, desktop and phone, Graphite and Stone (`tools/screenshots/scenes/mail.mjs`): `mail-conversation` (also medium: the meta line, three message regions, one Composer, the toolbar as one Tab stop, a phone's top bar), `mail-conversation-drawn` and `-drawn-phone`, `mail-thread-5` (five regions, four closed, Enter opens and closes), `mail-conversation-loading`, `mail-conversation-gone`, `mail-attachments` (two chips, Save toasts), `mail-attachment-preview` (overline, text, SAVE, 960 wide), `mail-html` (rendered, its script never ran), `mail-blocked-images`, `mail-sender` (FROM opens the panel), `mail-summary`, `-loading`, `-error`, `-replies` (a pick fills the field and sends nothing), `mail-reply` (also medium: a reply queues a send, the strip or the status line shows SENDING with UNDO, the field empties), `mail-reply-expand`, `mail-more-menu`, `mail-more-actions` (every row of More does its job, Block included), `mail-block-sender` (focus on Cancel), `mail-screener-notice` (LET IN keeps it open, SCREEN OUT closes it, both UNDO), and the kept `mail-snooze-menu`, `-snooze-time`, `-snoozed`, `-unsubscribe`, `-share`, `-archived-toast`, `toast-placement`.

## Consequences

- Reply and Forward are no longer buttons under the messages: the reply field and More hold them. A suggested reply fills the reply field where it used to open the full form.
- `UnsubscribeAction` takes `open`, `onOpenChange` and `button`, optional, so More and the head can open its question.
- The sender's column beside a wide conversation (ADR-0036's container query) is gone until a4; FROM and More › About open the same panel as a layer, at every width.
- A conversation of one message shows no head line, as the frames draw it; its face is not shown (Sean: confirm, with Q8).
- Moving to another row, Back and Esc in Mail now go through the pane's leave guard (`leaveThen`), so a typed reply asks before it is dropped.
