// Written by Claude (AI): unit tests for the domain matcher (see README).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { domainGivenByUser, domainsInText, normaliseDomain } from './domain.ts'

test('accepts a domain the user typed', () => {
    assert.equal(domainGivenByUser('gmail.com', ['how do I set up my gmail.com email address on thunderbird?']), true)
    assert.equal(domainGivenByUser('posteo.de', ['how do I set up my posteo.de email address on thunderbird?']), true)
})

test('accepts the domain of an email address the user typed', () => {
    assert.equal(domainGivenByUser('gmail.com', ['how do I set up my test@gmail.com email address on thunderbird?']), true)
    assert.equal(domainGivenByUser('test@gmail.com', ['my address is test@gmail.com']), true)
})

test('accepts a domain given in an earlier turn', () => {
    assert.equal(domainGivenByUser('gmail.com', ['how do I set up my email?', 'my email domain is gmail.com']), true)
})

test('ignores case, surrounding space, a leading @ and a trailing dot', () => {
    assert.equal(domainGivenByUser(' Gmail.COM. ', ['My domain is GMAIL.com.']), true)
    assert.equal(domainGivenByUser('@example.com', ['set up example.com please']), true)
})

test('rejects placeholders the model invented (baseline and v1 runs)', () => {
    const user = ['how do I set up my email address on thunderbird?']
    for (const guess of ['your_email_domain', 'your_email_provider', 'user_provided_domain', 'user-provided email domain',
        'your domain here', '(provided by user)', 'None', '', 'Please provide your email domain (e.g. gmail.com)']) {
        assert.equal(domainGivenByUser(guess, user), false, guess)
    }
})

test('rejects real domains the user never typed', () => {
    const user = ['how do I set up my email address on thunderbird?']
    for (const guess of ['example.com', 'gmail.com', 'thunderbird', 'thunderbird.org', ' thunderbird.com', 'user@provided.domain']) {
        assert.equal(domainGivenByUser(guess, user), false, guess)
    }
})

test('rejects a silent correction of a typo, then accepts it once the user confirms', () => {
    const turn1 = ['how do I set up my gmial.com email address on thunderbird?']
    assert.equal(domainGivenByUser('gmail.com', turn1), false)
    assert.equal(domainGivenByUser('gmial.com', turn1), true)
    assert.equal(domainGivenByUser('gmail.com', [...turn1, 'yes, gmail.com is correct, thanks for picking that up.']), true)
})

test('rejects a missing or non-string argument', () => {
    assert.equal(domainGivenByUser(null, ['gmail.com']), false)
    assert.equal(domainGivenByUser(undefined, ['gmail.com']), false)
    assert.equal(domainGivenByUser(42, ['gmail.com']), false)
})

test('does not match part of a longer domain', () => {
    assert.equal(domainGivenByUser('gmail.com', ['my domain is gmail.com.au']), false)
    assert.equal(domainGivenByUser('mail.com', ['my domain is gmail.com']), false)
})

test('helpers', () => {
    assert.deepEqual(domainsInText('test@gmail.com and posteo.de.'), ['gmail.com', 'posteo.de'])
    assert.equal(normaliseDomain(' Test@Gmail.com. '), 'gmail.com')
})
