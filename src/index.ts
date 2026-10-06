import * as readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';

interface OllamaChat {
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

interface OllamaMessage {
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

class ServerError extends Error {
  public code?: number;

  constructor(message: string, code?: number, options?: ErrorOptions) {
    super(message, options);
    this.name = 'ServerError';
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

    throw new Error("toolFunction invalid: " + toolFunction.name)
}

async function queryOllama(chat: OllamaChat): Promise<OllamaResponse> {
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
            throw new ServerError(`Ollama error: ${data.error}`, response.status)
        }

        const data = await response.json() as OllamaResponse;
        return data;
    } catch (error) {
        if (error instanceof TypeError && typeof error.cause === "object" && error.cause !== null) {
            if ('code' in error.cause && error.cause.code === 'ECONNREFUSED') {
                throw new ServerError("Couldn't connect to LLM server", undefined, {cause: error})
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

async function startCliLoop(chat: OllamaChat) {
    const rl = readline.createInterface({ input, output });

    console.log("Interactive CLI Started. Type 'exit' to quit.\n");

    try {
        while (true) {
            const oldMessageCount = chat.messages.length
            let prompt = ""
            try {
                prompt = await rl.question('User> ');
    
                if (prompt.trim().toLowerCase() === 'exit') {
                    console.log('Goodbye!');
                    break; 
                }
            } catch (error) {
                if (error instanceof Error && 'code' in error && error.code === 'ABORT_ERR') {
                    console.log('Goodbye!')
                    break
                }
                throw error
            }

            try {
                chat.messages.push({"role":"user","content": prompt})
                for (let i = 0; i < 5; i++) {
                    const queryResult: OllamaResponse = await queryOllama(chat)
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
                                    throw new Error('Invalid tool call: ' + toolCall.function.name)
                            }
                        }
                        continue
                    }

                    console.log(`Response: ${queryResult.message.content}`)
                    break
                }
            } catch (error) {
                if (error instanceof Error) {
                    console.error(error.message)
                }
                const newMessageCount = chat.messages.length
                for (let i = 0; i < newMessageCount - oldMessageCount; i++) {
                    chat.messages.pop()
                }
            }
        }
    } finally {
        rl.close();
    }
}

try {
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

    await queryOllama(chat)

    chat.messages.push({
        "role": "system",
        "content":
        `You are an email setup agent.
        Only provide server names, ports and security settings that came from the tool.
        If the tool fails to run or doesn't find anything, say so. Direct the user to get the required settings from the email provider.
        Do not guess facts or recommendations.
        `
    })

    await startCliLoop(chat)
} catch (error) {
    if (error instanceof Error) {
        console.error(error.message)
    }
    process.exitCode = 1
}

