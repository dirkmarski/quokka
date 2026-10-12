import type { ApiProvider, ProviderResponse, CallApiContextParams } from 'promptfoo'
import { createChat, processPrompt, type OllamaChat } from '../src/agent.ts'

export default class AgentProvider implements ApiProvider {
    id(): string { 
        return 'email-agent'
    }
    
    async callApi(prompt: string, context?: CallApiContextParams): Promise<ProviderResponse> {
        try {
            const chat = await createChat()
            const replies: string[] = []
            if (context && 'turns' in context?.vars) {
                const turns = context?.vars['turns']
                if (Array.isArray(turns)) {
                    for (const prompt of turns) {
                        replies.push(await processPrompt(chat, prompt))
                    }
                }
            }
            return { 
                output: replies[replies.length - 1],
                metadata: { replies, transcript: chat.messages }
            }
        } catch (error) {
            return { 
                error: error instanceof Error ? error.message : String(error)
            }
        }
    }
}