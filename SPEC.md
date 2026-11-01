# Response spec

What a good reply looks like, per situation. The system prompt steers to this
and the evals grade against it. Rules come from failure modes seen in eval runs;
the Q-numbers refer to those.

Drafted by Claude from Dirk's rulings; reviewed and corrected by Dirk.

## Every reply

- **R1.** Server names, ports and security settings come only from a tool result
  in this conversation. (Q-06)
- **R2.** No links or hostnames the tool did not supply. (Q-07)
- **R3.** Never claim the tool failed when it returned settings. (Q-17)
- **R4.** Never show a tool call as text. (Q-11)
- **R5.** Say each thing once. (Q-20)
- **R6.** No preamble - open with the question or the answer. (Q-20)
- **R7.** Short. A question is one or two sentences. A settings reply is the
  settings plus at most one line on where to enter them.

## S1 - No domain given

Cases 1 (turn 1) and 6. (Q-13)

- **Must:** ask for the email address or domain.
- **Must not:** run a lookup; guess a domain - a placeholder, the mail
  client's name (`thunderbird.org`) or a popular provider (`gmail.com`); give
  generic settings.
- **Shape:** one question, nothing else.

## S3 - Lookup succeeds

Case 1 (turn 2), cases 2, 3 and 8.

- **Must:** give incoming and outgoing settings - server, port and security for
  each.
- **Must not:** break R1-R3, or add settings for other providers.
- **Shape:** open with the settings, incoming first, then outgoing. Include the
  username format if the tool supplies it.

## S4 - Lookup fails

Cases 4, 5 and 7, turn 1. (Q-06, Q-10, Q-16) A misspelt domain is handled
here, not separately - S2 was merged into this situation on 30 Oct 2026.
Two steps since 1 Nov 2026 (Dirk: *"2 steps (change in requirement)"*): the
spelling is confirmed first, the provider pointer follows in S6.

- **Must:** look up the domain exactly as typed; say the settings were not
  found; ask the user to check the domain is spelled correctly. Where the domain
  looks like a misspelling of a known provider (case 5), naming the likely
  correction and asking the user to confirm it is enough.
- **May:** point the user at their email provider in the same reply.
- **Must not:** give any settings, sample guidance or other providers' settings;
  suggest searching; look up a domain the user has not typed.
- **Shape:** the not-found statement and the spelling question, each said once,
  nothing else.

## S5 - The turn after the user corrects the domain

Case 5, turn 2.

- **Must:** look up the corrected domain and answer as in S3.
- **Must not:** claim this lookup failed. (Q-17)

## S6 - The turn after the user confirms the spelling

Cases 4 and 7, turn 2. Added 1 Nov 2026 with the two-step S4.

- **Must:** direct the user to their email provider for the settings.
- **May:** look up the same domain again.
- **Must not:** give any settings, sample guidance or other providers' settings;
  look up any other domain.
- **Shape:** the provider pointer, nothing else.

## How this is graded

Pass or fail is graded on the solution: the lookups that actually ran and the
replies the user saw. A lookup the model asks for but the agent blocks is not a
failure. Blocked attempts are counted separately, per prompt version, to show
how the model itself behaves and how much the check is doing.
