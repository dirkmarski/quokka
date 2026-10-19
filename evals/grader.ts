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
                grade.reason = "Tool call recommended before domain was provided."
            }
            break;
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
    const grade = {pass: true, score: 0.0, reason: "All domains as expected"}
    const transcript: OllamaMessage[] = context.metadata?.['transcript']
    const expectedDomainCount = context.config?.domains.length

    let index: number = 0
    for (const item of transcript) {
        if (item.role == "assistant" && Array.isArray(item.tool_calls)) {
            for (const toolCall of item.tool_calls) {
                if ("function" in toolCall && "name" in toolCall.function && toolCall.function.name === "lookup_mail_settings") {
                    if (expectedDomainCount == 0) {
                        grade.pass = false
                        grade.reason = `Found a tool call when none were expected.`
                        break
                    }
                    if (index >= expectedDomainCount) {
                        grade.pass = false
                        grade.reason = `Too many tool calls found. Only expected ${expectedDomainCount}`
                        break
                    }

                    const domain = getDomain(toolCall)
                    if (domain.toLowerCase() !== context.config?.domains[index].toLowerCase()) {
                        grade.pass = false
                        grade.reason = `Found domain ${domain}, expected ${context.config?.domains[index]}`
                    }
                    index++
                }
            }
        }
    }

    if (index != expectedDomainCount) {
        grade.pass = false
        grade.reason = `Incorrect number of tool calls found: ${index}. Expected ${expectedDomainCount}`
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