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
                        console.error(`Calling tool lookup_mail_settings(${domain})`)
                        const response = await lookupDomainConfig(domain)
                        chat.messages.push({"role":"tool","content": response, "tool_name": "lookup_mail_settings"})
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

async function lookupDomainConfig(domain: string) {
    const response = await fetch("https://autoconfig.thunderbird.net/v1.1/" + domain);
    if (!response.ok) {
        return "An error occurred. The domain may not be in the database."
    }
    return response.text()
}

export async function createChat(): Promise<OllamaChat> {
    let chat: OllamaChat = {
        "messages": [],
        "model": process.env.OLLAMA_MODEL || "llama3.2:3b",
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
        Only provide server names, ports and security settings that came from the tool.
        If the tool fails to run or doesn't find anything, say so. Direct the user to get the required settings from the email provider.
        Do not guess facts or recommendations.
        `
    })

    return chat
}