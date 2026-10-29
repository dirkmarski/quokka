// Written by Claude (AI): string matching only. Deciding when to call it, and what
// the model is told when it returns false, is agent behaviour and lives in agent.ts.

// A domain is two or more dot-separated labels, e.g. gmail.com or mail.posteo.de.
const domainPattern = /[a-z0-9-]+(?:\.[a-z0-9-]+)+/g

// Normalises what the model passed to the tool: trims, lowercases, and keeps the
// part after the last @ if it was given an email address.
export function normaliseDomain(candidate: string): string {
    let domain = candidate.trim().toLowerCase()
    const atIndex = domain.lastIndexOf('@')
    if (atIndex !== -1) {
        domain = domain.substring(atIndex + 1)
    }
    return domain.replace(/\.+$/, '')
}

// Every domain that appears in what the user typed, email addresses included.
export function domainsInText(text: string): string[] {
    return text.toLowerCase().match(domainPattern) ?? []
}

// True only if the domain the model wants to look up is one the user actually typed.
// Rejects placeholders ("your_email_domain"), bare words ("thunderbird"), empty or
// missing values, and a corrected spelling the user never wrote (gmial.com -> gmail.com).
export function domainGivenByUser(candidate: unknown, userMessages: string[]): boolean {
    if (typeof candidate !== 'string') {
        return false
    }
    const domain = normaliseDomain(candidate)
    if (domain.match(/^[a-z0-9-]+(?:\.[a-z0-9-]+)+$/) === null) {
        return false
    }
    return userMessages.some(message => domainsInText(message).includes(domain))
}
