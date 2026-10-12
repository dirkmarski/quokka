# quokka evals

An eval suite for the quokka agent, built on [promptfoo](https://promptfoo.dev).
It runs the agent's real turn logic - same system prompt, tool and loop as the
CLI - against scripted conversations and grades each reply.

## What it tests

Eight cases, each a scripted list of user turns run on a fresh chat:

- a known provider (gmail.com), asked several ways, including as an email address
- a domain the lookup has no settings for (example.com)
- a provider whose hostname does not follow the usual pattern (posteo.de)
- a misspelt domain (gmial.com) - the agent should ask before correcting it
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

## Running it

Needs Node 24 and [Ollama](https://ollama.com) running locally with these models
pulled:

    ollama pull llama3.2:3b           # the agent (override with OLLAMA_MODEL)
    ollama pull qwen2.5:7b-instruct   # rubric judge
    ollama pull bespoke-minicheck     # fact check

Then, from the repository root:

    npm ci
    npm run eval
    npx promptfoo view    # browse results, including each failure's reason