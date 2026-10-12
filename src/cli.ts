import * as readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';

import type { OllamaChat } from './agent.ts'
import { processPrompt, createChat } from './agent.ts'

async function startCliLoop(chat: OllamaChat) {
    const rl = readline.createInterface({ input, output });

    console.log("Interactive CLI Started. Type 'exit' to quit.\n");

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
                const promptResponse: string = await processPrompt(chat, prompt);
                console.log(`Response: ${promptResponse}`)
            } catch (error) {
                if (error instanceof Error) {
                    console.error(error.message)
                } else {
                    throw error
                }
            }
        }
    } finally {
        rl.close();
    }
}

try {
    const chat: OllamaChat = await createChat()
    await startCliLoop(chat)
} catch (error) {
    if (error instanceof Error) {
        console.error(error.message)
    }
    process.exitCode = 1
}

