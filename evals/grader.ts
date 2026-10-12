import { error } from 'console';
import type { AssertionValueFunctionContext, GradingResult } from 'promptfoo'

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
    console.log(data)
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