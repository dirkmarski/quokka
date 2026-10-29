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

## S2 - Domain looks mistyped

Case 5, turn 1. (Q-16)

- **Must:** look up the domain exactly as typed. If the lookup succeeds, do not
  second-guess the user - answer as in S3. If it fails, propose the likely
  correction and ask the user to confirm it.
- **Must not:** run a lookup of a corrected spelling before the user confirms
  it, or answer about a different domain without saying so.
- **Shape:** name both spellings, then one question.

## S3 - Lookup succeeds

Case 1 (turn 2), cases 2, 3 and 8.

- **Must:** give incoming and outgoing settings - server, port and security for
  each.
- **Must not:** break R1-R3, or add settings for other providers.
- **Shape:** open with the settings, incoming first, then outgoing. Include the
  username format if the tool supplies it.

## S4 - Lookup fails

Cases 4 and 7. (Q-06, Q-10)

- **Must:** say the settings were not found, and direct the user to their email
  provider.
- **Must not:** give any settings, sample guidance or other providers' settings;
  suggest searching, or offer further guesses.
- **Shape:** the provider pointer and nothing else, said once.

## S5 - The turn after the user confirms a correction

Case 5, turn 2.

- **Must:** look up the confirmed domain and answer as in S3.
- **Must not:** claim this or the earlier lookup failed. (Q-17)

## How this is graded

Pass or fail is graded on the solution: the lookups that actually ran and the
replies the user saw. A lookup the model asks for but the agent blocks is not a
failure. Blocked attempts are counted separately, per prompt version, to show
how the model itself behaves and how much the check is doing.
