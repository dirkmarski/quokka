import * as readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';

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
}

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

async function queryOllama(messages: OllamaMessage[]): Promise<OllamaResponse> {
  try {
    const headers: Headers = new Headers()
    headers.set('Content-Type', 'application/json')
    headers.set('Accept', 'application/json')

    const model = process.env.OLLAMA_MODEL || "llama3.2:3b"

    const request: Request = new Request('http://127.0.0.1:11434/api/chat', {
        method: 'POST',
        headers: headers,
        body: JSON.stringify({
            "model": model,
            "stream": false,
            "messages": messages
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

async function startCliLoop() {
    const rl = readline.createInterface({ input, output });

    console.log("Interactive CLI Started. Type 'exit' to quit.\n");

    const messages: OllamaMessage[] = []

    try {
        while (true) {
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
                messages.push({"role":"user","content": prompt})
                const queryResult: OllamaResponse = await queryOllama(messages)
                messages.push(queryResult.message)
                console.log(`Response: ${queryResult.message.content}`)
            } catch (error) {
                if (error instanceof Error) {
                    console.error(error.message)
                }
                messages.pop()
            }
        }
    } finally {
        rl.close();
    }
}

try {
    await startCliLoop()
} catch (error) {
    if (error instanceof Error) {
        console.error(error.message)
    }
    process.exitCode = 1
}

