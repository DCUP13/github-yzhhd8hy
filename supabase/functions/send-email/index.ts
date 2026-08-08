import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

interface EmailData {
  id: string
  to_email: string
  from_email: string
  subject: string
  body: string
  reply_to_id?: string
  attachments: any[]
  user_id: string
}

function log(msg: string, data?: unknown) {
  if (data !== undefined) {
    console.error(`[send-email] ${msg}`, typeof data === 'string' ? data : JSON.stringify(data, null, 2))
  } else {
    console.error(`[send-email] ${msg}`)
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      throw new Error('No authorization header')
    }

    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      {
        global: {
          headers: { Authorization: authHeader },
        },
      }
    )

    const { data: { user }, error: userError } = await supabaseClient.auth.getUser()
    if (userError || !user) {
      throw new Error('Unauthorized')
    }

    if (req.method !== 'POST') {
      throw new Error('Method not allowed')
    }

    const requestBody = await req.json().catch(() => ({}))
    const specificEmailId = requestBody.emailId

    let query = supabaseClient
      .from('email_outbox')
      .select('*')
      .eq('status', 'pending')
      .order('created_at', { ascending: true })

    if (specificEmailId) {
      query = query.eq('id', specificEmailId).limit(1)
    } else {
      query = query.limit(10)
    }

    const { data: outboxEmails, error: fetchError } = await query

    if (fetchError) throw fetchError

    log(`Processing ${outboxEmails?.length ?? 0} emails`, { specificEmailId })

    const results = []

    for (const email of outboxEmails ?? []) {
      try {
        await supabaseClient
          .from('email_outbox')
          .update({ 
            status: 'sending',
            updated_at: new Date().toISOString()
          })
          .eq('id', email.id)

        let emailSent = false
        let errorMessage = ''

        // AWS SES credentials come from edge function env vars — not the database
        const AWS_ACCESS_KEY_ID = Deno.env.get('AWS_ACCESS_KEY_ID')
        const AWS_SECRET_ACCESS_KEY = Deno.env.get('AWS_SECRET_ACCESS_KEY')
        const AWS_REGION = Deno.env.get('AWS_REGION') || 'us-east-1'

        log(`AWS config check`, {
          hasAccessKey: !!AWS_ACCESS_KEY_ID,
          hasSecretKey: !!AWS_SECRET_ACCESS_KEY,
          region: AWS_REGION,
        })

        // Send via Amazon SES API (credentials from env vars)
        if (!emailSent) {
          if (!AWS_ACCESS_KEY_ID || !AWS_SECRET_ACCESS_KEY) {
            log('AWS credentials not set in edge function env vars')
            errorMessage = 'AWS credentials not configured. Set AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, and AWS_REGION in your edge function secrets.'
          } else {
            try {
              await sendViaSES(email, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_REGION)
              emailSent = true
            } catch (error) {
              const msg = error instanceof Error ? error.message : String(error)
              log('SES sending failed', msg)
              errorMessage = `SES: ${msg}`
            }
          }
        }

        if (!emailSent && !errorMessage) {
          errorMessage = 'No email provider available. AWS SES credentials are not configured in edge function secrets.'
        }

        if (emailSent) {
          await supabaseClient
            .from('email_sent')
            .insert({
              user_id: email.user_id,
              to_email: email.to_email,
              from_email: email.from_email,
              subject: email.subject,
              body: email.body,
              reply_to_id: email.reply_to_id,
              attachments: email.attachments,
              sent_at: new Date().toISOString(),
              created_at: email.created_at
            })

          await supabaseClient
            .from('email_outbox')
            .delete()
            .eq('id', email.id)

          results.push({ id: email.id, status: 'sent' })
          log(`Email ${email.id} sent successfully`)
        } else {
          await supabaseClient
            .from('email_outbox')
            .update({ 
              status: 'failed',
              error_message: errorMessage,
              updated_at: new Date().toISOString()
            })
            .eq('id', email.id)

          results.push({ id: email.id, status: 'failed', error: errorMessage })
          log(`Email ${email.id} failed`, errorMessage)
        }

      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error)
        log(`Error processing email ${email.id}`, msg)
        
        await supabaseClient
          .from('email_outbox')
          .update({ 
            status: 'failed',
            error_message: msg,
            updated_at: new Date().toISOString()
          })
          .eq('id', email.id)

        results.push({ id: email.id, status: 'failed', error: msg })
      }
    }

    return new Response(
      JSON.stringify({ 
        success: true,
        processed: results.length,
        results
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    )

  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error)
    log('Unhandled error', msg)
    return new Response(
      JSON.stringify({ error: msg }),
      {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    )
  }
})

async function sendViaSES(
  email: EmailData, 
  AWS_ACCESS_KEY_ID: string,
  AWS_SECRET_ACCESS_KEY: string,
  AWS_REGION: string
) {
  const recipients = email.to_email.split(',').map(addr => addr.trim()).filter(addr => addr.length > 0)
  
  log(`Sending ${recipients.length} email(s) via SES API`, { recipients, region: AWS_REGION })
  
  const sendPromises = recipients.map(async (recipient) => {
    return await sendIndividualSESEmail(email, recipient, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_REGION)
  })
  
  const results = await Promise.allSettled(sendPromises)
  
  const failures = results.filter(result => result.status === 'rejected')
  if (failures.length > 0) {
    const failureReasons = failures.map(f => (f as PromiseRejectedResult).reason.message).join(', ')
    throw new Error(`Failed to send to ${failures.length} recipient(s): ${failureReasons}`)
  }
  
  log(`Successfully sent ${recipients.length} email(s) via SES`)
}

async function sendIndividualSESEmail(
  email: EmailData, 
  recipient: string,
  AWS_ACCESS_KEY_ID: string,
  AWS_SECRET_ACCESS_KEY: string,
  AWS_REGION: string
) {
  const host = `email.${AWS_REGION}.amazonaws.com`
  const service = 'ses'
  const method = 'POST'
  const endpoint = `https://${host}/v2/email/outbound-emails`
  
  log(`SES API call`, { endpoint, recipient, from: email.from_email })
  
  const payload = JSON.stringify({
    FromEmailAddress: email.from_email,
    Destination: {
      ToAddresses: [recipient]
    },
    Content: {
      Simple: {
        Subject: {
          Data: email.subject,
          Charset: 'UTF-8'
        },
        Body: {
          Html: {
            Data: email.body,
            Charset: 'UTF-8'
          }
        }
      }
    },
    EmailTags: [
      {
        Name: 'To',
        Value: recipient
      }
    ]
  })
  
  const now = new Date()
  const amzDate = now.toISOString().replace(/[:\-]|\.\d{3}/g, '')
  const dateStamp = amzDate.substr(0, 8)
  
  const payloadHash = await sha256(payload)
  
  const canonicalHeaders = [
    `host:${host}`,
    `x-amz-date:${amzDate}`
  ].join('\n') + '\n'
  
  const signedHeaders = 'host;x-amz-date'
  
  const canonicalRequest = `${method}\n/v2/email/outbound-emails\n\n${canonicalHeaders}\n${signedHeaders}\n${payloadHash}`
  
  const algorithm = 'AWS4-HMAC-SHA256'
  const credentialScope = `${dateStamp}/${AWS_REGION}/${service}/aws4_request`
  const stringToSign = `${algorithm}\n${amzDate}\n${credentialScope}\n${await sha256(canonicalRequest)}`
  
  const signingKey = await getSignatureKey(AWS_SECRET_ACCESS_KEY, dateStamp, AWS_REGION, service)
  const signature = await hmacSha256Hex(signingKey, stringToSign)
  
  const authorizationHeader = `${algorithm} Credential=${AWS_ACCESS_KEY_ID}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`
  
  let response: Response
  try {
    response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Authorization': authorizationHeader,
        'Content-Type': 'application/json',
        'X-Amz-Date': amzDate
      },
      body: payload
    })
  } catch (fetchError) {
    const msg = fetchError instanceof Error ? fetchError.message : String(fetchError)
    log('SES fetch failed — DNS/network error', { endpoint, error: msg })
    if (msg.includes('lookup address') || msg.includes('Name or service not known')) {
      throw new Error(`Cannot reach AWS SES at ${host}. Check that AWS_REGION="${AWS_REGION}" is a valid AWS region (e.g. us-east-1) and that the edge function can reach the internet.`)
    }
    throw new Error(`Network error contacting AWS SES at ${host}: ${msg}`)
  }
  
  if (!response.ok) {
    const errorText = await response.text()
    log('SES API error response', { status: response.status, body: errorText })
    throw new Error(`SES API error: ${response.status} - ${errorText}`)
  }
  
  log(`SES email sent to ${recipient}`)
}

async function sha256(message: string): Promise<string> {
  const encoder = new TextEncoder()
  const data = encoder.encode(message)
  const hashBuffer = await crypto.subtle.digest('SHA-256', data)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('')
}

async function hmacSha256(key: Uint8Array, message: string): Promise<Uint8Array> {
  const encoder = new TextEncoder()
  const keyObject = await crypto.subtle.importKey(
    'raw',
    key,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  )
  const signature = await crypto.subtle.sign('HMAC', keyObject, encoder.encode(message))
  return new Uint8Array(signature)
}

async function hmacSha256Hex(key: Uint8Array, message: string): Promise<string> {
  const signature = await hmacSha256(key, message)
  return Array.from(signature).map(b => b.toString(16).padStart(2, '0')).join('')
}

async function getSignatureKey(
  key: string,
  dateStamp: string,
  regionName: string,
  serviceName: string
): Promise<Uint8Array> {
  const encoder = new TextEncoder()
  const kDate = await hmacSha256(encoder.encode('AWS4' + key), dateStamp)
  const kRegion = await hmacSha256(kDate, regionName)
  const kService = await hmacSha256(kRegion, serviceName)
  const kSigning = await hmacSha256(kService, 'aws4_request')
  return kSigning
}
