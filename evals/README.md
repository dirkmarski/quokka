# quokka evals

An eval suite for the quokka agent, built on [promptfoo](https://promptfoo.dev).
It runs the agent's real turn logic - same system prompt, tool and loop as the
CLI - against scripted conversations and grades each reply and each tool call.

## What it tests

Eight cases, each a scripted list of user turns run on a fresh chat:

- a known provider (gmail.com), asked several ways, including as an email address
- a domain the lookup has no settings for (example.com)
- a provider whose hostname does not follow the usual pattern (posteo.de)
- a misspelt domain (gmial.com) - the agent should look up the domain as typed
  and ask before correcting it
- no domain given at all

Each case runs 10 times, because the model's behaviour varies run to run and a
single pass proves little.

## How replies are graded

- **Code checks** - expected server names and ports present, wrong ones absent,
  and no raw tool-call text leaking into a reply (applied to every case).
- **Rubric judge** - a local `qwen2.5:7b-instruct` grades behaviour code cannot
  check, such as asking for clarification.
- **Fact check** - Bespoke-MiniCheck tests a stated claim against the reply
  (`grader.ts`).

## How tool calls are graded

The graders also read the full conversation, so they check what the agent did,
not only what it said.

- **Lookup order** (every case) - no settings lookup before the user has given
  an email domain. MiniCheck reads the user's turns to judge whether a domain has
  been given.
- **Lookup domain** (every case) - the domains the agent passed to the lookup,
  in order, must match the list set for that case. This is what catches a
  misspelt domain being silently corrected. An empty list means no lookup is
  expected.

## Testing the graders

The graders have their own unit tests in `grader.test.ts`, each proving a
grader passes a known-good conversation and fails a known-bad one. Most
fixtures are conversations recorded by the eval itself (`grader.fixtures.ts`).

    npm test

The lookup-order tests call MiniCheck, so Ollama must be running.

## Running it

Needs Node 24 and [Ollama](https://ollama.com) running locally with these models
pulled:

    ollama pull llama3.2:3b           # the agent (override with OLLAMA_MODEL)
    ollama pull qwen2.5:7b-instruct   # rubric judge
    ollama pull bespoke-minicheck     # fact check and lookup-order check

Then, from the repository root:

    npm ci
    npm test              # the graders' own tests
    npm run eval
    npx promptfoo view    # browse results, including each failure's reason
