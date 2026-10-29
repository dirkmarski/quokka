import type { AssertionValueFunctionContext, GradingResult } from 'promptfoo'

import { type OllamaMessage } from '../src/agent.ts'

interface miniCheck {
    response: string;
    prob: number;
}

interface OllamaMinicheckResponse {
    "response": string;
    "logprobs": [ { "token": string; "logprob": number; } ]
}

async function minicheck(prompt: string): Promise<miniCheck> {
    let result = { response: "no", prob: 1 }

    const headers: Headers = new Headers()
    headers.set('Content-Type', 'application/json')
    headers.set('Accept', 'application/json')

    const request: Request = new Request('http://127.0.0.1:11434/api/generate', {
        method: 'POST',
        headers: headers,
        body: JSON.stringify({
            "model": "bespoke-minicheck",
            "stream": false,
            "prompt": prompt,
            "logprobs": true,
            "top_logprobs": 2
        })
    })

    const response = await fetch(request);
    
    if (!response.ok) {
        const errorMessage = "Bad response from Ollama: " + response.status + ". Details: " + await response.text()
        throw new Error (errorMessage)
    }

    const data = await response.json() as OllamaMinicheckResponse;
    result.response = data.response
    result.prob = Math.exp(data.logprobs[0].logprob)
    
    return result
}

function countChar(str: string, char: string): number {
    let count = 0;
    for (const currentElement of str) {
        if (currentElement === char) {
        count++;
        }
    }
    return count;
}

function assertFaultyReply(reply: string): boolean {
    if (countChar(reply, "{") >= 1 && countChar(reply, "}") >= 1 && countChar(reply, '"') > 2) {
        return true
    }

    return false
}

async function assertDomainProvided(prompt: string): Promise<boolean> {
    const request = `Document: ${prompt}\nClaim: the user has provided an email domain.`
    const checkResult = await minicheck(request)
    let response = false

    if (checkResult.response === "Yes") {
        if (checkResult.prob > 0.6) {
            response = true
        }
    }

    return response
}

async function assertToolCallFailed(prompt: string): Promise<boolean> {
    const request = `Document: ${prompt}\nClaim: the tool failed the lookup.`
    const checkResult = await minicheck(request)
    let response = false

    if (checkResult.response === "Yes") {
        if (checkResult.prob > 0.6) {
            response = true
        }
    }

    return response
}

export async function correctToolCall(output: string, context: AssertionValueFunctionContext): Promise<GradingResult> {
    const grade = {pass: true, score: 1.0, reason: "All tool calls are correct"}
    const transcript: OllamaMessage[] = context.metadata?.['transcript']

    let domainProvided = false
    for (const item of transcript) {
        if (item.role == "system") {
            continue
        } else if (item.role == "user" && domainProvided == false) {
            domainProvided = await assertDomainProvided(item.content)
        } else if (item.role == "assistant" && Array.isArray(item.tool_calls)) {
            if (domainProvided == false) {
                grade.pass = false
                grade.score = 0.0 // Claude, 20 Oct 2026: a fail scored 1.0
                grade.reason = "Tool call recommended before domain was provided."
            }
            break;
        }
    }

    return grade
}

export async function correctToolCallErrorMessage(output: string, context: AssertionValueFunctionContext): Promise<GradingResult> {
    const grade = {pass: true, score: 1.0, reason: "No incorrect tool error reports"}
    const transcript: OllamaMessage[] = context.metadata?.['transcript']

    let toolCalled = false
    let toolResult = ""
    let toolCallFailedClaim = false
    for (const item of transcript) {
        if (toolCalled) {
            toolCallFailedClaim = await assertToolCallFailed(item.content)
            if (toolCallFailedClaim == true) {
                grade.pass = false
                grade.score = 0.0
                grade.reason = "Claimed fail on successful tool call.\n" + toolResult + "\n" + item.content
                break;
            }
            toolCalled = false
            toolResult = ""
        } else if (item.role == "tool") {
            if (item.content.includes("An error occurred")) {
                continue
            }
            toolCalled = true
            toolResult = item.content
        }
    }

    return grade
}

export async function rawTextResponse(output: string, context: AssertionValueFunctionContext): Promise<GradingResult> {
    const grade = {pass: true, score: 1.0, reason: "All replies are correct"}
    const replies = context.metadata?.['replies']

    for (const reply of replies) {
        if (assertFaultyReply(reply)) {
            grade.pass = false
            grade.score = 0.0
            grade.reason = `Faulty reply detected (raw tool-call text): ${reply}`

            break
        } 
    }

    return grade
}

function extractDomain(email: string): string {
    const atIndex = email.lastIndexOf('@');
  
    if (atIndex === -1 || atIndex === email.length - 1) {
        // No @ symbol, let's assume it is a valid domain for now
        return email
    }
  
    return email.substring(atIndex + 1);
}

function getDomain(toolCall: object): string {
    if ("function" in toolCall && typeof toolCall.function === 'object' && toolCall.function !== null 
        && "arguments" in toolCall.function && typeof toolCall.function.arguments === 'object' && toolCall.function.arguments !== null 
        && "domain" in toolCall.function.arguments && typeof toolCall.function.arguments.domain === 'string') {
        return extractDomain(toolCall.function.arguments.domain)
    }

    throw new Error(`No domain found`)
}

export async function correctDomain(output: string, context: AssertionValueFunctionContext): Promise<GradingResult> {
    // Hygiene fixes by Claude, 20 Oct 2026, to Dirk's 19 Oct TODO: score 1 on a pass,
    // a named error for missing config, every failure reason kept, and the too-many
    // count reports the lookups found rather than the ones matched.
    const grade = {pass: true, score: 1.0, reason: "All domains as expected"}
    const transcript: OllamaMessage[] = context.metadata?.['transcript']
    const domains = context.config?.['domains']
    if (!Array.isArray(domains)) {
        throw new Error("Missing domains in the config.")
    }
    const expectedDomainCount = domains.length
    const failures: string[] = []

    let index: number = 0
    for (const item of transcript) {
        if (item.role == "assistant" && Array.isArray(item.tool_calls)) {
            for (const toolCall of item.tool_calls) {
                if ("function" in toolCall && "name" in toolCall.function && toolCall.function.name === "lookup_mail_settings") {
                    if (index < expectedDomainCount) {
                        const domain = getDomain(toolCall)
                        if (domain.toLowerCase() !== domains[index].toLowerCase()) {
                            failures.push(`Found domain ${domain}, expected ${domains[index]}`)
                        }
                    }
                    index++
                }
            }
        }
    }

    if (expectedDomainCount == 0 && index > 0) {
        failures.push(`Found a tool call when none were expected (found: ${index}).`)
    } else if (index > expectedDomainCount) {
        failures.push(`Too many tool calls found: ${index}. Expected ${expectedDomainCount}`)
    } else if (index < expectedDomainCount) {
        failures.push(`Incorrect number of tool calls found: ${index}. Expected ${expectedDomainCount}`)
    }

    if (failures.length > 0) {
        grade.pass = false
        grade.score = 0.0
        grade.reason = failures.join("\n")
    }

    return grade
}

// ---------------------------------------------------------------------------
// Written by Claude (AI), 20 Oct 2026, to Dirk's criteria for slice 4c.
// String matching with no LLM in it, so outside the hand-written scope (see README).
//
// Every server name and mail port the agent states must come from somewhere it saw:
// a tool result or the user's own turns. Anything else was invented, including links
// the tool never returned (Dirk, 7 Oct 2026: "unrelated information").
// - Hostnames of 3+ labels are checked (imap.gmail.com, myaccount.google.com).
//   Two-label domains pass, so "such as gmail.com or yahoo.com" is allowed.
// - Mail ports are checked against the same evidence.
// - Replies that are raw tool-call text are skipped; rawTextResponse grades those.
// ---------------------------------------------------------------------------

const HOSTNAME = /(?<![a-z0-9.-])(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.){2,}[a-z]{2,}(?![a-z0-9-])/gi
const MAIL_PORT = /(?<!\d)(?:25|110|143|465|587|993|995|2525)(?!\d)/g

function findHostnames(text: string): Set<string> {
    return new Set((text.match(HOSTNAME) ?? []).map(host => host.toLowerCase()))
}

function findPorts(text: string): Set<string> {
    return new Set(text.match(MAIL_PORT) ?? [])
}

export async function groundedSettings(output: string, context: AssertionValueFunctionContext): Promise<GradingResult> {
    const grade = {pass: true, score: 1.0, reason: "All server names and ports came from the tool or the user"}
    const transcript: OllamaMessage[] = context.metadata?.['transcript']
    const replies: string[] = context.metadata?.['replies']

    const evidence = transcript
        .filter(item => item.role == "tool" || item.role == "user")
        .map(item => item.content)
        .join("\n")
    const knownHosts = findHostnames(evidence)
    const knownPorts = findPorts(evidence)

    const failures: string[] = []
    replies.forEach((reply, i) => {
        if (assertFaultyReply(reply)) {
            return
        }
        const hosts = [...findHostnames(reply)].filter(host => !knownHosts.has(host))
        const ports = [...findPorts(reply)].filter(port => !knownPorts.has(port))
        if (hosts.length > 0 || ports.length > 0) {
            failures.push(`Reply ${i + 1} states settings not from the tool or the user - hostnames: [${hosts.join(", ")}], ports: [${ports.join(", ")}]`)
        }
    })

    if (failures.length > 0) {
        grade.pass = false
        grade.score = 0.0
        grade.reason = failures.join("\n")
    }

    return grade
}

export async function yesNo(output: string, context: AssertionValueFunctionContext): Promise<GradingResult> {
    const grade = {pass: false, score: 0.0, reason: "Undefined"}
    const claim = context.config?.['claim']
    if (typeof claim !== 'string') {
        throw new Error("Missing claim in the config.")
    }
    const prompt = `Document: ${output}\nClaim: ${claim}`
    const checkResult = await minicheck(prompt)

    if (checkResult.response === "Yes") {
        if (checkResult.prob > 0.75) {
            grade.pass = true
            grade.score = checkResult.prob
            grade.reason = `The check passed.\n${prompt}\nResponse: ${checkResult.response}\nProbability: ${checkResult.prob}`
        } else {
            grade.pass = false
            grade.score = 1 - checkResult.prob
            grade.reason = `The check failed.\n${prompt}\nResponse: ${checkResult.response}\nProbability: ${1 - checkResult.prob}`
        }
    } else {
        grade.score = checkResult.prob
        grade.reason = `The check failed.\n${prompt}\nResponse: ${checkResult.response}\nProbability: ${checkResult.prob}`
    }

    return grade
}