// Written by Claude (AI), 1 Nov 2026: unit tests for the lookup's result messages and retry (see README).
import { test, mock } from 'node:test'
import assert from 'node:assert/strict'
import { lookupDomainConfig, lookupNotFoundMessage, lookupFailedMessage } from './agent.ts'

// Each call to fetch takes the next result; the last one repeats.
function stubFetch(...results: (Response | Error)[]) {
    let call = 0
    return mock.method(globalThis, 'fetch', async () => {
        const result = results[Math.min(call++, results.length - 1)]
        if (result instanceof Error) throw result
        return result
    })
}

const settings = '<clientConfig version="1.1"></clientConfig>'

test('returns the settings when the lookup finds the domain', async (t) => {
    const stub = stubFetch(new Response(settings, { status: 200 }))
    t.after(() => stub.mock.restore())
    assert.equal(await lookupDomainConfig('gmail.com'), settings)
    assert.equal(stub.mock.callCount(), 1)
})

test('returns the not-found message without retrying (HTTP 404)', async (t) => {
    const stub = stubFetch(new Response('Not Found', { status: 404 }))
    t.after(() => stub.mock.restore())
    assert.equal(await lookupDomainConfig('wattlebay-plumbing.com.au'), lookupNotFoundMessage)
    assert.equal(stub.mock.callCount(), 1)
})

test('returns the failed message after two error statuses', async (t) => {
    const stub = stubFetch(new Response('Server Error', { status: 500 }))
    t.after(() => stub.mock.restore())
    assert.equal(await lookupDomainConfig('gmail.com'), lookupFailedMessage)
    assert.equal(stub.mock.callCount(), 2)
})

test('returns the failed message after two requests that cannot be made', async (t) => {
    const stub = stubFetch(new TypeError('fetch failed'))
    t.after(() => stub.mock.restore())
    assert.equal(await lookupDomainConfig('gmail.com'), lookupFailedMessage)
    assert.equal(stub.mock.callCount(), 2)
})

test('returns the settings when the retry succeeds', async (t) => {
    const stub = stubFetch(new TypeError('fetch failed'), new Response(settings, { status: 200 }))
    t.after(() => stub.mock.restore())
    assert.equal(await lookupDomainConfig('gmail.com'), settings)
    assert.equal(stub.mock.callCount(), 2)
})

test('returns the not-found message when the retry finds no entry', async (t) => {
    const stub = stubFetch(new Response('Server Error', { status: 503 }), new Response('Not Found', { status: 404 }))
    t.after(() => stub.mock.restore())
    assert.equal(await lookupDomainConfig('wattlebay-plumbing.com.au'), lookupNotFoundMessage)
    assert.equal(stub.mock.callCount(), 2)
})

test('the two messages differ', () => {
    assert.notEqual(lookupNotFoundMessage, lookupFailedMessage)
})
