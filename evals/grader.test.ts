// Written by Claude (AI): unit tests for the graders (see README).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { AssertionValueFunctionContext } from 'promptfoo'
import { type OllamaMessage } from '../src/agent.ts'
import { correctToolCall, correctDomain, groundedSettings, correctToolCallErrorMessage } from './grader.ts'
import { autocorrectedTypo, addressLookup, rawTextToolCall, placeholderLookup,
    settingsFromTool, inventedLink, inventedPorts, inventedInSecondReply,
    falseFailureClaim, falseFailureAdditional, answerMentionsUnableToFind, failedLookupReported } from './grader.fixtures.ts'

const knownGood: OllamaMessage[] = [
    {"role":"system","content":"You are an email setup agent.\n        Only provide server names, ports and security settings that came from the tool.\n        If the tool fails to run or doesn't find anything, say so. Direct the user to get the required settings from the email provider.\n        Do not guess facts or recommendations.\n        "},
    {"role":"user","content":"how do I set up my email?"},
    {"role":"assistant","content":"In order for me to lookup the right settings, please specify your email domain."},
    {"role":"user","content":"my email domain is gmail.com"},
    {"role":"assistant","content":"","tool_calls":[{"id":"call_fwek04tx","function":{"name":"lookup_mail_settings","arguments":{"domain":"gmail.com"}}}]},
    {"role":"tool","content":"<clientConfig version=\"1.1\">\n  <emailProvider id=\"googlemail.com\">\n    <domain>gmail.com</domain>\n    <domain>googlemail.com</domain>\n    <!-- MX, for Google Apps -->\n    <domain>google.com</domain>\n    <domain>jazztel.es</domain>\n    <domain>nyu.edu</domain>\n\n    <displayName>Google Mail</displayName>\n    <displayShortName>GMail</displayShortName>\n\n    <incomingServer type=\"imap\">\n      <hostname>imap.gmail.com</hostname>\n      <port>993</port>\n      <socketType>SSL</socketType>\n      <username>%EMAILADDRESS%</username>\n      <authentication>OAuth2</authentication>\n      <authentication>password-cleartext</authentication>\n    </incomingServer>\n    <incomingServer type=\"pop3\">\n      <hostname>pop.gmail.com</hostname>\n      <port>995</port>\n      <socketType>SSL</socketType>\n      <username>%EMAILADDRESS%</username>\n      <authentication>OAuth2</authentication>\n      <authentication>password-cleartext</authentication>\n      <pop3>\n        <leaveMessagesOnServer>true</leaveMessagesOnServer>\n      </pop3>\n    </incomingServer>\n    <outgoingServer type=\"smtp\">\n      <hostname>smtp.gmail.com</hostname>\n      <port>465</port>\n      <socketType>SSL</socketType>\n      <username>%EMAILADDRESS%</username>\n      <authentication>OAuth2</authentication>\n      <authentication>password-cleartext</authentication>\n    </outgoingServer>\n\n    <documentation url=\"http://mail.google.com/support/bin/answer.py?answer=13273\">\n      <descr>How to enable IMAP/POP3 in GMail</descr>\n    </documentation>\n    <documentation url=\"http://mail.google.com/support/bin/topic.py?topic=12806\">\n      <descr>How to configure email clients for IMAP</descr>\n    </documentation>\n    <documentation url=\"http://mail.google.com/support/bin/topic.py?topic=12805\">\n      <descr>How to configure email clients for POP3</descr>\n    </documentation>\n    <documentation url=\"http://mail.google.com/support/bin/answer.py?answer=86399\">\n      <descr>How to configure TB 2.0 for POP3</descr>\n    </documentation>\n  </emailProvider>\n\n  <oAuth2>\n    <issuer>accounts.google.com</issuer>\n    <!-- https://developers.google.com/identity/protocols/oauth2/scopes -->\n    <scope>https://mail.google.com/ https://www.googleapis.com/auth/contacts https://www.googleapis.com/auth/calendar https://www.googleapis.com/auth/carddav</scope>\n    <authURL>https://accounts.google.com/o/oauth2/auth</authURL>\n    <tokenURL>https://www.googleapis.com/oauth2/v3/token</tokenURL>\n  </oAuth2>\n\n  <enable visiturl=\"https://mail.google.com/mail/?ui=2&amp;shva=1#settings/fwdandpop\">\n    <instruction>You need to enable IMAP access</instruction>\n  </enable>\n\n  <webMail>\n    <loginPage url=\"https://accounts.google.com/ServiceLogin?service=mail&amp;continue=http://mail.google.com/mail/\"/>\n    <loginPageInfo url=\"https://accounts.google.com/ServiceLogin?service=mail&amp;continue=http://mail.google.com/mail/\">\n      <username>%EMAILADDRESS%</username>\n      <usernameField id=\"Email\"/>\n      <passwordField id=\"Passwd\"/>\n      <loginButton id=\"signIn\"/>\n    </loginPageInfo>\n  </webMail>\n\n</clientConfig>\n","tool_name":"lookup_mail_settings"},
    {"role":"assistant","content":"To set up your Gmail email address on Thunderbird, you will need to:\n\n1. Enable IMAP access on your Gmail account. You can do this by following the instructions on the Google Mail website.\n2. In Thunderbird, go to \"File\" > \"New\" > \"Mail Account\" and enter your Gmail address, password, and other settings as follows:\n\t* Incoming Server: imap.gmail.com\n\t* Outgoing Server: smtp.gmail.com\n\t* Authentication: OAuth 2.0\n\t* Port: 993 (for IMAP) and 465 (for SMTP)\n\t* Socket Type: SSL\n3. For incoming IMAP, you will need to allow less secure apps to access your account. You can do this by going to the Google Account settings and enabling \"Less secure app access\".\n4. Once you have set up the email account, you should be able to send and receive emails using Thunderbird.\n\nNote: Please be aware that using less secure apps can make your account more vulnerable to hacking. It's recommended to use OAuth 2.0 authentication instead, which is more secure."}    
]

const knownBad: OllamaMessage[] = [
    {"role":"system","content":"You are an email setup agent.\n        Only provide server names, ports and security settings that came from the tool.\n        If the tool fails to run or doesn't find anything, say so. Direct the user to get the required settings from the email provider.\n        Do not guess facts or recommendations.\n        "},
    {"role":"user","content":"how do I set up my email address on thunderbird?"},
    {"role":"assistant","content":"","tool_calls":[{"id":"call_stwsunmk","function":{"name":"lookup_mail_settings","arguments":{"domain":"gmail.com"}}}]},
    {"role":"tool","content":"<clientConfig version=\"1.1\">\n  <emailProvider id=\"googlemail.com\">\n    <domain>gmail.com</domain>\n    <domain>googlemail.com</domain>\n    <!-- MX, for Google Apps -->\n    <domain>google.com</domain>\n    <domain>jazztel.es</domain>\n    <domain>nyu.edu</domain>\n\n    <displayName>Google Mail</displayName>\n    <displayShortName>GMail</displayShortName>\n\n    <incomingServer type=\"imap\">\n      <hostname>imap.gmail.com</hostname>\n      <port>993</port>\n      <socketType>SSL</socketType>\n      <username>%EMAILADDRESS%</username>\n      <authentication>OAuth2</authentication>\n      <authentication>password-cleartext</authentication>\n    </incomingServer>\n    <incomingServer type=\"pop3\">\n      <hostname>pop.gmail.com</hostname>\n      <port>995</port>\n      <socketType>SSL</socketType>\n      <username>%EMAILADDRESS%</username>\n      <authentication>OAuth2</authentication>\n      <authentication>password-cleartext</authentication>\n      <pop3>\n        <leaveMessagesOnServer>true</leaveMessagesOnServer>\n      </pop3>\n    </incomingServer>\n    <outgoingServer type=\"smtp\">\n      <hostname>smtp.gmail.com</hostname>\n      <port>465</port>\n      <socketType>SSL</socketType>\n      <username>%EMAILADDRESS%</username>\n      <authentication>OAuth2</authentication>\n      <authentication>password-cleartext</authentication>\n    </outgoingServer>\n\n    <documentation url=\"http://mail.google.com/support/bin/answer.py?answer=13273\">\n      <descr>How to enable IMAP/POP3 in GMail</descr>\n    </documentation>\n    <documentation url=\"http://mail.google.com/support/bin/topic.py?topic=12806\">\n      <descr>How to configure email clients for IMAP</descr>\n    </documentation>\n    <documentation url=\"http://mail.google.com/support/bin/topic.py?topic=12805\">\n      <descr>How to configure email clients for POP3</descr>\n    </documentation>\n    <documentation url=\"http://mail.google.com/support/bin/answer.py?answer=86399\">\n      <descr>How to configure TB 2.0 for POP3</descr>\n    </documentation>\n  </emailProvider>\n\n  <oAuth2>\n    <issuer>accounts.google.com</issuer>\n    <!-- https://developers.google.com/identity/protocols/oauth2/scopes -->\n    <scope>https://mail.google.com/ https://www.googleapis.com/auth/contacts https://www.googleapis.com/auth/calendar https://www.googleapis.com/auth/carddav</scope>\n    <authURL>https://accounts.google.com/o/oauth2/auth</authURL>\n    <tokenURL>https://www.googleapis.com/oauth2/v3/token</tokenURL>\n  </oAuth2>\n\n  <enable visiturl=\"https://mail.google.com/mail/?ui=2&amp;shva=1#settings/fwdandpop\">\n    <instruction>You need to enable IMAP access</instruction>\n  </enable>\n\n  <webMail>\n    <loginPage url=\"https://accounts.google.com/ServiceLogin?service=mail&amp;continue=http://mail.google.com/mail/\"/>\n    <loginPageInfo url=\"https://accounts.google.com/ServiceLogin?service=mail&amp;continue=http://mail.google.com/mail/\">\n      <username>%EMAILADDRESS%</username>\n      <usernameField id=\"Email\"/>\n      <passwordField id=\"Passwd\"/>\n      <loginButton id=\"signIn\"/>\n    </loginPageInfo>\n  </webMail>\n\n</clientConfig>\n","tool_name":"lookup_mail_settings"},
    {"role":"assistant","content":"To set up your email address on Thunderbird, follow these steps:\n\n1. Open Thunderbird and go to **File** > **New** > **Mail Account**.\n2. In the **New Mail Account** window, enter your Gmail address (e.g., [your_email@gmail.com](mailto:your_email@gmail.com)) and click **Next**.\n3. Select **IMAP** as the server type and click **Next**.\n4. Enter the following settings:\n\t* **Hostname**: imap.gmail.com\n\t* **Port**: 993\n\t* **Socket type**: SSL\n\t* **Username**: Enter your Gmail address (e.g., [your_email@gmail.com](mailto:your_email@gmail.com))\n\t* **Authentication**: OAuth2\n5. Click **Next** and then **Finish**.\n6. To set up POP3, repeat the process and select **POP3** as the server type.\n7. Enter the following settings:\n\t* **Hostname**: pop.gmail.com\n\t* **Port**: 995\n\t* **Socket type**: SSL\n\t* **Username**: Enter your Gmail address (e.g., [your_email@gmail.com](mailto:your_email@gmail.com))\n\t* **Authentication**: OAuth2\n8. Click **Next** and then **Finish**.\n9. To send emails, repeat the process and select **SMTP** as the server type.\n10. Enter the following settings:\n\t* **Hostname**: smtp.gmail.com\n\t* **Port**: 465\n\t* **Socket type**: SSL\n\t* **Username**: Enter your Gmail address (e.g., [your_email@gmail.com](mailto:your_email@gmail.com))\n\t* **Authentication**: OAuth2\n\nNote: Make sure to enable IMAP access for your Gmail account before setting up Thunderbird. You can do this by going to the [Google Account settings](https://accounts.google.com/settings/advanced) and enabling the **IMAP** toggle switch."}
]


test('Tool order grader is correct for a valid multi-prompt conversation', async () => {
    const context = { metadata: { transcript: knownGood } } as unknown as AssertionValueFunctionContext
    const grade = await correctToolCall('', context)
    assert.equal(grade.pass, true, grade.reason)
})

// 29 Oct 2026: the agent now blocks a lookup for a domain the user never typed, and the
// graders count only lookups that ran. knownBad's gmail.com guess would be blocked.
test('Tool order grader skips a lookup the agent blocked', async () => {
    const context = { metadata: { transcript: knownBad } } as unknown as AssertionValueFunctionContext
    const grade = await correctToolCall('', context)
    assert.equal(grade.pass, true, grade.reason)
})

// Hand-built: a domain the user typed that is not their email domain gets past the agent's
// check, so the lookup runs - and this grader still fails it.
const lookupOfMentionedDomain: OllamaMessage[] = [
    knownGood[0]!,
    {"role":"user","content":"I read on posteo.de that you can help with mail apps. How do I set up thunderbird?"},
    {"role":"assistant","content":"","tool_calls":[{"id":"call_ment0001","function":{"name":"lookup_mail_settings","arguments":{"domain":"posteo.de"}}}]},
    {"role":"tool","content":"An error occurred. The domain may not be in the database.","tool_name":"lookup_mail_settings"},
    {"role":"assistant","content":"I couldn't find settings for posteo.de. Please ask your email provider."}
]

test('Tool order grader fails a lookup that ran before an email domain was given', async () => {
    const context = { metadata: { transcript: lookupOfMentionedDomain } } as unknown as AssertionValueFunctionContext
    const grade = await correctToolCall('', context)
    assert.equal(grade.pass, false, grade.reason)
    assert.equal(grade.score, 0)
})

// Hand-built: no recorded run asks before correcting the typo, so the correct case-5
// behaviour is written out here. The tool reply is the agent's own not-found message.
const typoAskedBeforeCorrecting: OllamaMessage[] = [
    knownGood[0]!,
    {"role":"user","content":"how do I set up my gmial.com email address on thunderbird?"},
    {"role":"assistant","content":"","tool_calls":[{"id":"call_typo0001","function":{"name":"lookup_mail_settings","arguments":{"domain":"gmial.com"}}}]},
    {"role":"tool","content":"An error occurred. The domain may not be in the database.","tool_name":"lookup_mail_settings"},
    {"role":"assistant","content":"I couldn't find settings for gmial.com. Did you mean gmail.com?"},
    {"role":"user","content":"yes, gmail.com is correct, thanks for picking that up."},
    {"role":"assistant","content":"","tool_calls":[{"id":"call_typo0002","function":{"name":"lookup_mail_settings","arguments":{"domain":"gmail.com"}}}]},
    knownGood[5]!,
    {"role":"assistant","content":"For gmail.com, use imap.gmail.com on port 993 and smtp.gmail.com on port 465, both with SSL."}
]

async function gradeDomains(transcript: OllamaMessage[], domains: string[]) {
    const context = { metadata: { transcript }, config: { domains } } as unknown as AssertionValueFunctionContext
    return correctDomain('', context)
}

test('Domain grader passes when the typed domain is looked up before the correction', async () => {
    const grade = await gradeDomains(typoAskedBeforeCorrecting, ['gmial.com', 'gmail.com'])
    assert.equal(grade.pass, true, grade.reason)
})

test('Domain grader fails a silent correction of a typed domain', async () => {
    const grade = await gradeDomains(autocorrectedTypo, ['gmial.com', 'gmail.com'])
    assert.equal(grade.pass, false)
    assert.match(grade.reason, /Found domain gmail\.com, expected gmial\.com/)
})

test('Domain grader takes the domain from an email address', async () => {
    const grade = await gradeDomains(addressLookup, ['gmail.com'])
    assert.equal(grade.pass, true, grade.reason)
})

test('Domain grader passes a lookup made after the user gives the domain', async () => {
    const grade = await gradeDomains(knownGood, ['gmail.com'])
    assert.equal(grade.pass, true, grade.reason)
})

test('Domain grader fails when an expected lookup is missing', async () => {
    const grade = await gradeDomains(rawTextToolCall, ['gmail.com'])
    assert.equal(grade.pass, false)
    assert.match(grade.reason, /Incorrect number of tool calls found: 0\. Expected 1/)
})

test('Domain grader fails more lookups than expected', async () => {
    const grade = await gradeDomains(typoAskedBeforeCorrecting, ['gmial.com'])
    assert.equal(grade.pass, false)
    assert.match(grade.reason, /Too many tool calls found/)
})

test('Domain grader skips lookups the agent blocked', async () => {
    assert.equal((await gradeDomains(placeholderLookup, ['gmail.com'])).pass, true)
    assert.equal((await gradeDomains(knownBad, [])).pass, true)
})

test('Domain grader passes no lookup when none is expected', async () => {
    const grade = await gradeDomains(knownGood.slice(0, 3), [])
    assert.equal(grade.pass, true, grade.reason)
})

test('Domain grader fails a lookup when none is expected', async () => {
    const grade = await gradeDomains(knownGood, [])
    assert.equal(grade.pass, false)
    assert.match(grade.reason, /Found a tool call when none were expected/)
})

test('Domain grader keeps every failure reason and counts every lookup found', async () => {
    const grade = await gradeDomains(typoAskedBeforeCorrecting, ['gmail.com'])
    assert.equal(grade.pass, false)
    assert.equal(grade.score, 0)
    assert.match(grade.reason, /Found domain gmial\.com, expected gmail\.com/)
    assert.match(grade.reason, /Too many tool calls found: 2\. Expected 1/)
})

test('Domain grader scores a pass as 1', async () => {
    const grade = await gradeDomains(knownGood, ['gmail.com'])
    assert.equal(grade.score, 1)
})

test('Domain grader throws a named error when the config has no domains', async () => {
    const context = { metadata: { transcript: knownGood }, config: {} } as unknown as AssertionValueFunctionContext
    await assert.rejects(correctDomain('', context), /Missing domains in the config/)
})

// groundedSettings: every hostname (3+ labels) and mail port in a reply must come from a
// tool result or the user's turns. Replies are rebuilt from the transcript the way the
// provider records them: assistant messages that are not tool calls.
async function gradeGrounded(transcript: OllamaMessage[]) {
    const replies = transcript.filter(m => m.role == "assistant" && !m.tool_calls).map(m => m.content)
    const context = { metadata: { transcript, replies } } as unknown as AssertionValueFunctionContext
    return groundedSettings('', context)
}

test('Settings grader passes settings and links that came from the tool', async () => {
    const grade = await gradeGrounded(settingsFromTool)
    assert.equal(grade.pass, true, grade.reason)
    assert.equal(grade.score, 1)
})

test('Settings grader fails a link the tool never returned', async () => {
    const grade = await gradeGrounded(inventedLink)
    assert.equal(grade.pass, false)
    assert.equal(grade.score, 0)
    assert.match(grade.reason, /hostnames: \[myaccount\.google\.com\], ports: \[\]/)
})

test('Settings grader fails ports offered after a failed lookup', async () => {
    const grade = await gradeGrounded(inventedPorts)
    assert.equal(grade.pass, false)
    assert.match(grade.reason, /ports: \[995, 587\]/)
})

test('Settings grader names the reply that failed', async () => {
    const grade = await gradeGrounded(inventedInSecondReply)
    assert.equal(grade.pass, false)
    assert.match(grade.reason, /^Reply 2 /)
})

// Hand-built: the user supplies their own server; repeating it back is not invention.
test('Settings grader passes a server and port the user gave', async () => {
    const grade = await gradeGrounded([
        knownGood[0]!,
        {"role":"user","content":"my provider says to use mail.example.com.au on port 587"},
        {"role":"assistant","content":"Then enter MAIL.EXAMPLE.COM.AU as the outgoing server, port 587."}
    ])
    assert.equal(grade.pass, true, grade.reason)
})

// Hand-built: two-label domains used as examples are allowed (Dirk, 7 Oct 2026).
test('Settings grader passes two-label example domains', async () => {
    const grade = await gradeGrounded([
        knownGood[0]!,
        {"role":"user","content":"how do I set up my email?"},
        {"role":"assistant","content":"Which provider is it, such as gmail.com or yahoo.com?"}
    ])
    assert.equal(grade.pass, true, grade.reason)
})

// Hand-built: raw tool-call text is left to rawTextResponse, so it is not failed twice.
test('Settings grader skips a reply that is raw tool-call text', async () => {
    const grade = await gradeGrounded([
        knownGood[0]!,
        {"role":"user","content":"how do I set up my email?"},
        {"role":"assistant","content":"{\"name\": \"lookup_mail_settings\", \"parameters\": {\"domain\": \"imap.gmail.com\"}}"}
    ])
    assert.equal(grade.pass, true, grade.reason)
})

// Hand-built: an unsourced hostname at the end of a sentence is still found.
test('Settings grader fails an invented hostname before a full stop', async () => {
    const grade = await gradeGrounded([
        knownGood[0]!,
        {"role":"user","content":"how do I set up my email?"},
        {"role":"assistant","content":"Try imap.yourprovider.com."}
    ])
    assert.equal(grade.pass, false)
    assert.match(grade.reason, /hostnames: \[imap\.yourprovider\.com\]/)
})

// correctToolCallErrorMessage: after a successful lookup, the reply must not claim the tool
// failed. These call MiniCheck, so Ollama must be running.
async function gradeErrorClaims(transcript: OllamaMessage[]) {
    const context = { metadata: { transcript } } as unknown as AssertionValueFunctionContext
    return correctToolCallErrorMessage('', context)
}

test('Tool error grader fails a claimed failure after a successful lookup', async () => {
    const grade = await gradeErrorClaims(falseFailureClaim)
    assert.equal(grade.pass, false)
    assert.equal(grade.score, 0)
})

test('Tool error grader judges the second turn after a correct first turn', async () => {
    const grade = await gradeErrorClaims(falseFailureClaim)
    assert.match(grade.reason, /It seems that the tool was unable to retrieve the mail settings/)
})

test('Tool error grader fails "unable to find any additional settings" (labelled by Dirk)', async () => {
    const grade = await gradeErrorClaims(falseFailureAdditional)
    assert.equal(grade.pass, false)
})

test('Tool error grader passes a correct answer that says "if you are unable to find"', async () => {
    const grade = await gradeErrorClaims(answerMentionsUnableToFind)
    assert.equal(grade.pass, true, grade.reason)
    assert.equal(grade.score, 1)
})

test('Tool error grader passes a failed lookup reported truthfully', async () => {
    const grade = await gradeErrorClaims(failedLookupReported)
    assert.equal(grade.pass, true, grade.reason)
})

test('Tool error grader passes a multi-turn conversation with correct answers', async () => {
    const grade = await gradeErrorClaims(knownGood)
    assert.equal(grade.pass, true, grade.reason)
})
