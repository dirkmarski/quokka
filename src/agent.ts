import { domainGivenByUser, domainsInText } from './domain.ts'

export interface OllamaChat {
    messages: OllamaMessage[],
    tools: object[],
    model: string
}

interface OllamaResponse {
    message: OllamaMessage;
    done: boolean;
    done_reason: string;
    prompt_eval_count: number;
    prompt_eval_duration: number;
    eval_count: number;
    total_duration: number;
}

export interface OllamaMessage {
    content: string;
    role: string;
    tool_calls?: OllamaToolCall[];
    tool_name?: string;
}

interface OllamaToolCall {
    id: string;
    function: OllamaToolFunctionRaw
}

interface OllamaToolFunctionRaw {
    name: string;
    arguments: unknown;
}

type OllamaToolFunction =
 | {name: 'lookup_mail_settings', arguments: {domain: string;}}

interface OllamaError {
    error: string;
}

class AgentError extends Error {
  public code?: number;

  constructor(message: string, code?: number, options?: ErrorOptions) {
    super(message, options);
    this.name = 'AgentError';
    if (code !== undefined) {
        this.code = code
    }
  }
}

function getToolFunction(toolFunction: OllamaToolFunctionRaw): OllamaToolFunction {
    const args = toolFunction.arguments
    if (toolFunction.name == "lookup_mail_settings" && typeof args === 'object' && args !== null && 'domain' in args && typeof args.domain === 'string') {
        return {name: 'lookup_mail_settings', arguments: {domain: args.domain}};
    }

    throw new AgentError("toolFunction invalid: " + toolFunction.name, 101)
}

export async function processPrompt(chat: OllamaChat, prompt: string): Promise<string> {
    const oldMessageCount = chat.messages.length
    try {
        chat.messages.push({"role":"user","content": prompt})
        const promptResponse = await queryOllama(chat);

        if ("tool_calls" in promptResponse.message && promptResponse.message.tool_calls.length > 0) {
           throw new AgentError("An internal error occurred.", 105)
        }

        return promptResponse.message.content
    } catch (error) {
        if (error instanceof Error) {
            console.error(error.message)
        }
        const newMessageCount = chat.messages.length
        for (let i = 0; i < newMessageCount - oldMessageCount; i++) {
            chat.messages.pop()
        }
        throw new AgentError("The call failed. Please try again later.", 102, {cause: error})
    }
}

async function queryOllama(chat: OllamaChat): Promise<OllamaResponse> {
    let queryResult: OllamaResponse = await queryOllamaStep(chat);
    for (let i = 0; i < 5; i++) {
        chat.messages.push(queryResult.message)
        
        if ("tool_calls" in queryResult.message && queryResult.message.tool_calls.length > 0) {
            for (const toolCall of queryResult.message.tool_calls) {
                switch (toolCall.function.name) {
                    case "lookup_mail_settings":
                        const temp = getToolFunction(toolCall.function)
                        const domain = extractDomain(temp.arguments.domain)
                        const userTurns = chat.messages.filter(m => m.role === 'user').map(m => m.content)
                        const typedDomains = userTurns.flatMap(t => domainsInText(t))

                        const userProvidedDomain = domainGivenByUser(temp.arguments.domain, userTurns)
                        if (userProvidedDomain) {
                            console.error(`Calling tool lookup_mail_settings(${domain})`)
                            const response = await lookupDomainConfig(domain)
                            chat.messages.push({"role":"tool","content": response, "tool_name": "lookup_mail_settings"})
                        } else {
                            let message = `This is a system message - the user has not seen or sent this. 
                                            The domain extracted (${temp.arguments.domain}) was not provided by the user. 
                                            The user didn't provide a suitable domain, ask the user to provide one.`
                            if (typedDomains.length > 0) {
                               message = `This is a system message - the user has not seen or sent this. 
                                            The domain extracted (${temp.arguments.domain}) was not provided by the user. 
                                            The user provided domain is ${typedDomains.join(', ')}. The tool should be called with that domain instead.` 
                            }
                            chat.messages.push({"role":"tool","content": message, "tool_name": "lookup_mail_settings"})
                        }
                        break;
                        default:
                            throw new AgentError('Invalid tool call: ' + toolCall.function.name, 106)
                        }
                    }
            queryResult = await queryOllamaStep(chat)
            continue
        }

        break
    }

    return queryResult
}

async function queryOllamaStep(chat: OllamaChat): Promise<OllamaResponse> {
    try {
        const headers: Headers = new Headers()
        headers.set('Content-Type', 'application/json')
        headers.set('Accept', 'application/json')

        const request: Request = new Request('http://127.0.0.1:11434/api/chat', {
            method: 'POST',
            headers: headers,
            body: JSON.stringify({
                "model": chat.model,
                "stream": false,
                "messages": chat.messages,
                "tools": chat.tools
            })
        })

        const response = await fetch(request);
        
        if (!response.ok) {
            const data = await response.json() as OllamaError;
            throw new AgentError(`Ollama error: ${data.error}`, response.status)
        }

        const data = await response.json() as OllamaResponse;
        return data;
    } catch (error) {
        if (error instanceof TypeError && typeof error.cause === "object" && error.cause !== null) {
            if ('code' in error.cause && error.cause.code === 'ECONNREFUSED') {
                throw new AgentError("Couldn't connect to LLM server", 99, {cause: error})
            }
        }
        
        throw error
    }
}

function extractDomain(email: string): string {
    const atIndex = email.lastIndexOf('@');
  
    if (atIndex === -1 || atIndex === email.length - 1) {
        // No @ symbol, let's assume it is a valid domain for now
        return email
    }
  
    return email.substring(atIndex + 1);
}

// Written by Claude (AI), 1 Nov 2026: a domain the database doesn't hold (HTTP 404) and a
// lookup that failed to run are told apart (Dirk, 1 Nov), so the prompt can handle each.
// The two messages are what the model sees - the wording is Dirk's.
export const lookupNotFoundMessage = "No settings found for this domain."
export const lookupFailedMessage = "The lookup failed to run."

// Claude, 1 Nov 2026: a lookup that fails to run is retried once in code (Dirk, 1 Nov) - the
// model can't tell a failure from the guard's block message (v6 read), so it only ever sees
// lookupFailedMessage after the second failure. A not-found is an answer, not retried.
const lookupAttempts = 2
const lookupRetryDelayMs = 500

export async function lookupDomainConfig(domain: string): Promise<string> {
    for (let attempt = 1; attempt <= lookupAttempts; attempt++) {
        if (attempt > 1) {
            await new Promise(resolve => setTimeout(resolve, lookupRetryDelayMs))
        }
        let response: Response
        try {
            response = await fetch("https://autoconfig.thunderbird.net/v1.1/" + domain);
        } catch {
            continue
        }
        if (response.status == 404) {
            return lookupNotFoundMessage
        }
        if (response.ok) {
            return response.text()
        }
    }
    return lookupFailedMessage
}

export async function createChat(): Promise<OllamaChat> {
    let chat: OllamaChat = {
        "messages": [],
        "model": process.env.OLLAMA_MODEL || "bonsai-2:9b",
        "tools": [{
            "type": "function",
            "function": {
                "name": "lookup_mail_settings",
                "description": "Get email domain settings for configuring email clients",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "domain": {
                            "type": "string",
                            "description": "The email domain (i.e. the part after @ such as gmail.com) that needs to be configured"
                        }
                    },
                    "required": ["domain"]
                }
            }
        }]
    }

    await queryOllamaStep(chat)

    chat.messages.push({
        "role": "system",
        "content":
        `You are an email setup agent.
        Your aim is to guide the user through a set of steps to setup their email client correctly.
        First of all, you need to establish what email domain is being used. If the domain is not provided, ask the user for it.
        Once the domain is available, use the tool to lookup the detailed settings.
        Lookup the domain exactly as typed. If no settings are found for the domain, respond in 2 sentences that the domain couldn't be found and ask the user to verify the domain is spelled correctly.
        If the lookup fails to run, say an internal error occurred (nothing else) and direct the user to get the required settings from the email provider.
        When the lookup is successful, provide a response to the user that is short and to the point: only provide server names, ports and security settings that came from the tool.
        When the lookup does not return any domain settings after confirming spelling with the user, direct the user to get the required settings from the email provider.
        Do not guess facts or recommendations.
        `
    })

    return chat
}