interface OllamaResponse {
    message: {content: string; role: string;};
    done: boolean;
    done_reason: string;
    prompt_eval_count: number;
    prompt_eval_duration: number;
    eval_count: number;
    total_duration: number;
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

async function queryOllama(query: string): Promise<OllamaResponse> {
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
            "messages": [{"role":"user","content": query}]
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

async function askQuestion(question: string) {
    console.log(`Query: ${question}`)
    const queryResult: OllamaResponse = await queryOllama(question)
    console.log(`Response: ${queryResult.message.content}`)
    console.log(`Tokens: in ${queryResult.prompt_eval_count} / out ${queryResult.eval_count}`)
    console.log(`Duration: ${(queryResult.total_duration / 1_000_000).toFixed(0)} ms`)
}

try {
    await askQuestion("What is IMAP, in one sentence?")
} catch (error) {
    if (error instanceof Error) {
        console.error(error.message)
    }
    process.exitCode = 1
}
